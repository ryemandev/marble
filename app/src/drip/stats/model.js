import { MISTAKES } from "../../data.js";
import { shortMoney } from "../../lib/money";
import { DOW, MON } from "../../lib/basics.js";
import { marketCode } from "../../lib/markets.js";
import { tradeDay } from "../view";

// Everything Stats and the Desk say about a stretch of trades, worked out once, in dollars.

const sum = (ts) => ts.reduce((a, t) => a + t.pnl, 0);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const NICE = (v) => { const mag = 10 ** Math.floor(Math.log10(v || 1)); return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= v - 1e-9); };
const dayLabel = (key) => `${+key.slice(8, 10)} ${MON[+key.slice(5, 7) - 1]}`;

export const heldText = (min) => {
  if (min == null) return "None";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))}s`;
  const m = Math.round(min);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
};

function normal(t, i) {
  const key = tradeDay(t);
  const clock = /^(\d{1,2}):(\d{2})/.exec(String(t.time || ""));
  const hour = Number.isInteger(t.hour) ? t.hour : clock ? +clock[1] : null;
  const closed = t.closedAt && t.traded_at ? (Date.parse(t.closedAt) - Date.parse(t.traded_at)) / 60000 : NaN;
  const held = Number.isFinite(closed) && closed >= 0 ? closed : Number.isFinite(+t.heldMinutes) && t.heldMinutes != null ? +t.heldMinutes : null;
  const size = t.size === "" || t.size == null || !Number.isFinite(+t.size) ? null : +t.size;
  return {
    ...t, pnl: +t.pnl || 0, key, hour, held, size: size > 0 ? size : null,
    weekday: Number.isInteger(t.weekday) ? t.weekday : new Date(`${key}T12:00:00Z`).getUTCDay(),
    minute: clock ? +clock[1] * 60 + +clock[2] : (hour ?? 12) * 60,
    order: i,
    fee: +t.commission || 0,
  };
}

const row = (key, label, ts, extra = {}) => {
  const won = ts.filter((t) => t.pnl > 0).length, lost = ts.filter((t) => t.pnl < 0).length;
  const net = sum(ts);
  return { key, label, value: net, net, n: ts.length, won, lost, rate: won + lost ? Math.round((won / (won + lost)) * 100) : 0, avg: ts.length ? net / ts.length : 0, trades: ts, ...extra };
};
const groupBy = (ts, key) => {
  const m = new Map();
  for (const t of ts) { const k = key(t); if (k == null || k === "") continue; if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
  return m;
};
const ranked = (ts, key) => [...groupBy(ts, key)].map(([k, list]) => row(k, k, list)).sort((a, b) => b.net - a.net);

const SPANS = [[0, 1, "Under 1m"], [1, 5, "1 to 5m"], [5, 15, "5 to 15m"], [15, 30, "15 to 30m"], [30, 60, "30 to 60m"], [60, 120, "1 to 2h"], [120, Infinity, "Over 2h"]];

function streaks(list, up) {
  let best = 0, now = 0;
  for (const x of list) { if (up(x)) { now += 1; best = Math.max(best, now); } else now = 0; }
  return { best, now };
}

export function statsOf(input = []) {
  const ts = input.map((t, i) => normal(t, input.length - i)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.minute - b.minute || a.order - b.order));
  const wins = ts.filter((t) => t.pnl > 0), losses = ts.filter((t) => t.pnl < 0);
  const grossWin = sum(wins), grossLoss = -sum(losses);
  const net = sum(ts);
  const decided = wins.length + losses.length;

  // Day by day
  const days = [...groupBy(ts, (t) => t.key)].map(([key, list]) => ({ key, label: dayLabel(key), title: dayLabel(key), value: sum(list), net: sum(list), n: list.length, trades: list, sub: `${list.length} ${list.length === 1 ? "trade" : "trades"}` }));
  const green = days.filter((d) => d.net > 0), red = days.filter((d) => d.net < 0);
  const bestDay = days.length ? days.reduce((a, d) => (d.net > a.net ? d : a)) : null;
  const worstDay = days.length ? days.reduce((a, d) => (d.net < a.net ? d : a)) : null;

  // The running total, and how far it fell from each high
  let run = 0, peak = 0, deepest = 0, deepestAt = null;
  const curve = [0], curveLabels = ["Start"], under = [0];
  for (const t of ts) {
    run += t.pnl;
    peak = Math.max(peak, run);
    const dip = run - peak;
    if (dip < deepest) { deepest = dip; deepestAt = t.key; }
    curve.push(run);
    under.push(dip);
    curveLabels.push(`${dayLabel(t.key)} · ${marketCode(t.symbol || "")} ${t.side || ""}`.trim());
  }
  const ticks = [];
  ts.forEach((t, i) => { if (i === 0 || t.key !== ts[i - 1].key) ticks.push({ label: dayLabel(t.key), i: i + 1 }); });

  // Time
  const weekend = ts.some((t) => t.weekday === 0 || t.weekday === 6);
  const weekdays = (weekend ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5]).map((d) => row(d, DOW[d], ts.filter((t) => t.weekday === d), { title: DOW[d] }));
  const hours = ts.map((t) => t.hour).filter((h) => h != null);
  const lo = hours.length ? Math.min(...hours) : 9, hi = hours.length ? Math.max(...hours) : 16;
  const byHour = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((h) => row(h, `${h}`, ts.filter((t) => t.hour === h), { title: `${h}:00 to ${h + 1}:00` }));
  const heat = {
    days: weekdays.map((d) => ({ d: d.key, label: d.label })),
    hours: byHour.map((h) => h.key),
    cells: weekdays.flatMap((d) => byHour.map((h) => {
      const list = ts.filter((t) => t.weekday === d.key && t.hour === h.key);
      return { day: d.key, dayLabel: d.label, hour: h.key, net: sum(list), n: list.length, trades: list };
    })),
  };

  // How long
  const timed = ts.filter((t) => t.held != null);
  const held = {
    all: mean(timed.map((t) => t.held)), win: mean(timed.filter((t) => t.pnl > 0).map((t) => t.held)), loss: mean(timed.filter((t) => t.pnl < 0).map((t) => t.held)),
    mid: median(timed.map((t) => t.held)), most: timed.length ? Math.max(...timed.map((t) => t.held)) : null, least: timed.length ? Math.min(...timed.map((t) => t.held)) : null,
  };
  const byHeld = SPANS.map(([a, b, label]) => row(label, label, timed.filter((t) => t.held >= a && t.held < b), { title: label })).filter((r, i, all) => r.n || all.slice(i).some((x) => x.n));
  const points = timed.map((t) => ({ x: t.held, y: t.pnl, t }));

  // The shape of the results
  const reach = Math.max(1, ...ts.map((t) => Math.abs(t.pnl)));
  const step = NICE(reach / 6);
  const start = Math.floor(Math.min(0, ...ts.map((t) => t.pnl)) / step) * step;
  const finish = Math.ceil(Math.max(0, ...ts.map((t) => t.pnl)) / step) * step;
  const shape = [];
  const dollars = (v) => `${v < 0 ? "−" : ""}$${Math.abs(v)}`;
  const whole = (v) => +v.toFixed(6);
  for (let i = 0, bars = Math.round((finish - start) / step); i < bars; i++) {
    const at = whole(start + i * step), to = whole(at + step);
    const list = ts.filter((t) => t.pnl >= at && (t.pnl < to || (i === bars - 1 && t.pnl <= finish)));
    shape.push({ key: at, label: shortMoney(at, { sign: false }), title: `${dollars(at)} to ${dollars(to)}`, value: list.length, lo: at, trades: list, net: sum(list) });
  }

  // Habits
  const place = new Map(), onDay = new Map();
  for (const t of ts) { const n = (onDay.get(t.key) || 0) + 1; onDay.set(t.key, n); place.set(t, n); }
  const nth = (t) => place.get(t);
  const counts = new Map(days.map((d) => [d.key, d.n]));
  const byOrder = ["1st", "2nd", "3rd", "4th", "5th on"].map((label, i) => row(label, label, ts.filter((t) => Math.min(nth(t), 5) === i + 1), { title: `${label} trade of the day` })).filter((r) => r.n);
  const byBusy = [[1, "1 trade"], [2, "2 trades"], [3, "3 trades"], [4, "4 trades"], [5, "5 or more"]].map(([n, label]) => {
    const ds = days.filter((d) => Math.min(d.n, 5) === n);
    return { key: n, label: `${n === 5 ? "5+" : n}`, title: label, value: ds.length ? sum(ds.flatMap((d) => d.trades)) / ds.length : 0, sub: `${ds.length} ${ds.length === 1 ? "day" : "days"}, average a day`, trades: ds.flatMap((d) => d.trades) };
  }).filter((r) => r.trades.length);
  void counts;
  const next = { win: [], loss: [] };
  ts.forEach((t, i) => { if (!i) return; const p = ts[i - 1]; if (p.pnl > 0) next.win.push(t); else if (p.pnl < 0) next.loss.push(t); });
  const sized = ts.filter((t) => t.size != null);
  const bySize = [...groupBy(sized, (t) => (t.size <= 1 ? "1" : t.size <= 2 ? "2" : t.size <= 5 ? "3 to 5" : t.size <= 10 ? "6 to 10" : "Over 10"))].map(([k, list]) => row(k, k, list)).sort((a, b) => parseFloat(a.label.replace("Over ", "")) - parseFloat(b.label.replace("Over ", "")));
  const judged = ts.filter((t) => t.followedPlan != null);
  const plan = judged.length ? [row("kept", "Stuck to the plan", judged.filter((t) => t.followedPlan)), row("broke", "Off plan", judged.filter((t) => !t.followedPlan))] : [];

  const weekOfKey = (key) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const byWeek = [...groupBy(ts, (t) => weekOfKey(t.key))].map(([k, list]) => row(k, dayLabel(k), list, { title: `Week of ${dayLabel(k)}` }));
  const byMonth = [...groupBy(ts, (t) => t.key.slice(0, 7))].map(([k, list]) => row(k, MON[+k.slice(5, 7) - 1], list, { title: `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` }));

  const tradeRun = streaks(ts, (t) => t.pnl > 0), tradeDrop = streaks(ts, (t) => t.pnl < 0);
  const dayRun = streaks(days, (d) => d.net > 0), dayDrop = streaks(days, (d) => d.net < 0);

  return {
    ts, count: ts.length, net, wins: wins.length, losses: losses.length, flat: ts.length - decided,
    rate: decided ? (wins.length / decided) * 100 : 0,
    grossWin, grossLoss, fees: sum(ts.map((t) => ({ pnl: t.fee }))),
    factor: grossLoss ? grossWin / grossLoss : null,
    perTrade: ts.length ? net / ts.length : 0,
    avgWin: wins.length ? grossWin / wins.length : 0, avgLoss: losses.length ? grossLoss / losses.length : 0,
    sizeRatio: losses.length && wins.length ? (grossWin / wins.length) / (grossLoss / losses.length) : null,
    biggestWin: wins.length ? wins.reduce((a, t) => (t.pnl > a.pnl ? t : a)) : null,
    biggestLoss: losses.length ? losses.reduce((a, t) => (t.pnl < a.pnl ? t : a)) : null,
    days, green: green.length, red: red.length, flatDays: days.length - green.length - red.length,
    greenRate: days.length ? (green.length / days.length) * 100 : 0,
    perDay: days.length ? net / days.length : 0, avgGreen: mean(green.map((d) => d.net)) ?? 0, avgRed: mean(red.map((d) => d.net)) ?? 0,
    bestDay, worstDay, tradesPerDay: days.length ? ts.length / days.length : 0,
    curve, curveLabels, under, ticks, deepest, deepestAt, fromPeak: run - peak,
    weekdays, byHour, heat, held, byHeld, points, shape,
    long: row("long", "Long", ts.filter((t) => t.side === "long")), short: row("short", "Short", ts.filter((t) => t.side === "short")),
    bySetup: ranked(ts, (t) => t.setup || "No setup"), bySymbol: ranked(ts, (t) => marketCode(t.symbol || "") || null),
    byFeeling: ranked(ts, (t) => t.emotion || null), byGrade: ranked(ts, (t) => t.grade || null).sort((a, b) => String(a.label).localeCompare(String(b.label))),
    byMistake: MISTAKES.map((m) => row(m, m, ts.filter((t) => t.mistakes?.includes(m)))).filter((r) => r.n).sort((a, b) => a.net - b.net),
    byOrder, byBusy, bySize, plan, byWeek, byMonth,
    afterWin: next.win.length ? sum(next.win) / next.win.length : null, afterLoss: next.loss.length ? sum(next.loss) / next.loss.length : null,
    afterWinN: next.win.length, afterLossN: next.loss.length,
    streak: { win: tradeRun.best, loss: tradeDrop.best, green: dayRun.best, red: dayDrop.best, nowWin: tradeRun.now, nowLoss: tradeDrop.now, nowGreen: dayRun.now, nowRed: dayDrop.now },
  };
}

export const bestOf = (rows) => { const live = rows.filter((r) => r.n); return live.length ? live.reduce((a, r) => (r.net > a.net ? r : a)) : null; };
export const worstOf = (rows) => { const live = rows.filter((r) => r.n); return live.length ? live.reduce((a, r) => (r.net < a.net ? r : a)) : null; };
