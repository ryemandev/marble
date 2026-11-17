import { LIVE } from "./mode";
import { nyOf } from "./live/time";
import { utcTodayKey } from "./world";
import { DOW, MONTHS, WEEKDAYS } from "./lib/basics.js";

// Statues have left Marble. Saved records can still name one, so each lands on a painting or a Japanese picture.
const RETIRED = {
  "gods/angel-rose": "masters/magdalen-la-tour", "gods/apollo-light": "masters/wanderer-friedrich", "gods/blue-god": "japan/ryu",
  "gods/cherub-bust": "masters/sower-millet", "gods/crowned-queen": "masters/calling-of-matthew-caravaggio", "gods/david-curls": "masters/self-portrait-rembrandt",
  "gods/david-dark": "masters/jerome-writing-caravaggio", "gods/flower-crown": "anime/moon-reflection", "gods/goddess-shadow": "anime/night-figure",
  "gods/headband-hero": "anime/samurai-duel", "gods/hercules-dark": "masters/stag-at-sharkeys-bellows", "gods/muse-dark": "masters/joseph-carpenter-la-tour",
  "gods/titan-silhouette": "masters/colossus-goya", "gods/winged-angel": "masters/charging-chasseur-gericault",
};
const alive = (path) => RETIRED[path] || (String(path).startsWith("gods/") ? "masters/wanderer-friedrich" : path);
export const art = (path, w) => `${import.meta.env.BASE_URL}art/${alive(path)}${w && w < 1600 ? `-${w}` : ""}.webp`;

export const TABS = [
  { id: "dashboard", label: "Desk" },
  { id: "journal", label: "Journal" },
  { id: "analytics", label: "Stats" },
  { id: "study", label: "Study" },
  { id: "community", label: "Floor" },
];

export const SAMPLE = {};

export const EMOTIONS_GOOD = ["Calm", "Patient", "Focused", "Confident"];
export const EMOTIONS_BAD = ["FOMO", "Rushed", "Revenge", "Hesitant"];
export const MISTAKES = ["Chased", "Moved stop", "No stop", "Too big", "Cut early", "Held too long", "Overtraded"];

export const NOW = { year: 2026, month: 9, day: 27, label: "Tuesday · 27 October", short: "Tue · 27 Oct", time: "13:52", minutesLeft: 128, open: true };

export function refreshNow() {
  if (!LIVE) return;
  const n = nyOf();
  const mins = n.hour * 60 + n.minute;
  const weekday = n.weekday > 0 && n.weekday < 6;
  Object.assign(NOW, {
    year: n.year, month: n.month, day: n.day,
    label: `${WEEKDAYS[n.weekday]} · ${n.day} ${MONTHS[n.month]}`,
    short: `${WEEKDAYS[n.weekday].slice(0, 3)} · ${n.day} ${MONTHS[n.month].slice(0, 3)}`,
    time: `${String(n.hour).padStart(2, "0")}:${String(n.minute).padStart(2, "0")}`,
    minutesLeft: weekday ? Math.max(0, 16 * 60 - Math.max(mins, 9 * 60 + 30)) : 0,
    open: weekday && mins >= 9 * 60 + 30 && mins < 16 * 60,
  });
}
refreshNow();

// all: the views show every month at once (CAL keeps the month to go back to)
export const CAL = LIVE ? { year: NOW.year, month: NOW.month, all: false } : { year: 2026, month: 9, all: false };
export const monthName = () => MONTHS[CAL.month];
export const monthNow = () => MONTHS[NOW.month]; // this month, whichever one the calendar is showing
export const monthShort = () => MONTHS[CAL.month].slice(0, 3);
// The period on show, for headings ("November", "All time") and sentences ("in November", "so far")
export const periodName = () => (CAL.all ? "All time" : MONTHS[CAL.month]);
export const inPeriod = () => (CAL.all ? "so far" : `in ${MONTHS[CAL.month]}`);
// For labels: "Equity across November", "Equity across every month"
export const acrossPeriod = () => (CAL.all ? "every month" : MONTHS[CAL.month]);
// "No trades in November yet", "No trades in October", "No trades yet"
export const noTradesYet = () => (CAL.all ? "No trades yet" : `No trades in ${MONTHS[CAL.month]}${viewingNow() ? " yet" : ""}`);
export const viewingNow = () => CAL.all || (CAL.year === NOW.year && CAL.month === NOW.month);
export const todayInView = () => (viewingNow() ? NOW.day : CAL.year * 12 + CAL.month < NOW.year * 12 + NOW.month ? 32 : 0);

const withR = (ts) => ts.filter((t) => t.r != null && Number.isFinite(+t.r));
export const meanR = (ts) => { const xs = withR(ts); return xs.length ? xs.reduce((a, t) => a + +t.r, 0) / xs.length : 0; };
export const keptShare = (ts) => { const judged = ts.filter((t) => t.followedPlan != null); return judged.length ? (judged.filter((t) => t.followedPlan).length / judged.length) * 100 : 0; };
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? (/(s|sh|ch|x)$/.test(one) ? `${one}es` : `${one}s`)}`;
// Just the word, for when the number is shown apart from it
export const word = (n, one, many) => plural(n, one, many).replace(/^\S+ /, "");

export const isWin = (t) => t.pnl > 0;
export const isLoss = (t) => t.pnl < 0;

export function summarize(trades) {
  const empty = !trades.length;
  const wins = trades.filter(isWin);
  const losses = trades.filter(isLoss);
  const decided = wins.length + losses.length;
  const grossW = wins.reduce((a, t) => a + t.pnl, 0);
  const grossL = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  // By date where trades have one, so a best day across months isn't two months' 3rds added up
  const byDay = {};
  for (const t of trades) { const k = t.dayKey ?? t.day; byDay[k] = (byDay[k] || 0) + t.pnl; }
  const best = Object.entries(byDay).reduce((b, [k, v]) => (v > b.v ? { d: /-/.test(k) ? +k.slice(8) : +k, key: /-/.test(k) ? k : null, v } : b), { d: 0, key: null, v: -Infinity });
  return {
    count: trades.length,
    net: trades.reduce((a, t) => a + t.pnl, 0),
    wins: wins.length,
    losses: losses.length,
    breakeven: trades.length - decided,
    winRate: decided ? (wins.length / decided) * 100 : 0,
    withR: withR(trades).length,
    judged: trades.filter((t) => t.followedPlan != null).length,
    profitFactor: grossL ? grossW / grossL : grossW ? Infinity : 0,
    avgR: meanR(trades),
    avgWin: wins.length ? grossW / wins.length : 0,
    avgLoss: losses.length ? grossL / losses.length : 0,
    best: empty ? 0 : Math.max(...trades.map((t) => t.pnl)),
    worst: empty ? 0 : Math.min(...trades.map((t) => t.pnl)),
    bestDay: empty ? { d: 0, key: null, v: 0 } : best,
    rulesKept: keptShare(trades),
  };
}
export function runOf(trades) {
  let wins = 0, losses = 0;
  for (const t of trades) {
    if (isLoss(t)) { if (wins) break; losses++; }
    else if (isWin(t)) { if (losses) break; wins++; }
  }
  return { wins, losses };
}
export function hourSpan(trades) {
  const hs = trades.map((t) => t.hour).filter((h) => Number.isInteger(h));
  const lo = Math.min(9, ...hs), hi = Math.max(13, ...hs);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
export function rBins(rs) {
  const xs = rs.filter((r) => r != null && Number.isFinite(+r)).map(Number);
  const LO = -5, HI = 10;
  const lo = Math.max(LO, Math.min(-1, Math.floor(Math.min(...xs, 0) * 2) / 2));
  const hi = Math.min(HI, Math.max(3, Math.floor(Math.max(...xs, 0) * 2) / 2));
  const bins = [];
  for (let b = lo; b <= hi; b += 0.5) {
    const first = b === lo && xs.some((r) => r < lo), last = b === hi && xs.some((r) => r >= hi + 0.5);
    const inBin = (r) => (first ? r < b + 0.5 : last ? r >= b : r >= b && r < b + 0.5);
    bins.push({
      lo: b,
      label: first ? `≤${b}` : last ? `≥+${b}` : b > 0 ? `+${b}` : String(b),
      title: first ? `${(b + 0.5).toFixed(1)}R or less` : last ? `+${b.toFixed(1)}R or more` : `${b.toFixed(1)}R to ${(b + 0.5).toFixed(1)}R`,
      value: xs.filter(inBin).length,
    });
  }
  return bins;
}
// Running equity, oldest first, starting at 0
export const equityOf = (trades) => {
  let acc = 0;
  return [0, ...[...trades].reverse().map((t) => (acc += t.pnl))];
};
export function dailyOf(trades) {
  const map = {};
  for (const t of trades) map[t.day] = (map[t.day] || 0) + t.pnl;
  return map;
}
export const todayKey = () => { const n = nyOf(); return `${n.year}-${String(n.month + 1).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`; };
// A crypto trade's day is the UTC day
export const isToday = (t) => (t.dayKey ? t.dayKey === (t.world === "crypto" ? utcTodayKey() : todayKey()) : t.today ?? t.day === NOW.day);
export const todayOf = (trades) => {
  const ts = trades.filter(isToday);
  const pnl = ts.reduce((a, t) => a + t.pnl, 0);
  return { list: ts, trades: ts.length, pnl, wins: ts.filter(isWin).length, kept: ts.filter((t) => t.followedPlan === true).length, judged: ts.filter((t) => t.followedPlan != null).length,
    lossUsed: Math.max(0, -pnl), lossesInARow: runOf(ts).losses,
    topLeverage: ts.reduce((m, t) => Math.max(m, +t.leverage || 0), 0) };
};
export function limitsHit(rules, day) {
  const hit = [];
  if (rules.lossLimit > 0 && day.lossUsed >= rules.lossLimit) hit.push("loss");
  if (rules.maxTrades > 0 && day.trades >= rules.maxTrades) hit.push("trades");
  if (rules.stopAfter > 0 && day.lossesInARow >= rules.stopAfter) hit.push("streak");
  if (rules.maxLeverage > 0 && day.topLeverage > rules.maxLeverage) hit.push("leverage");
  return hit;
}

export const statsFor = (setup, trades = SAMPLE.TRADES || []) => {
  const ts = trades.filter((t) => t.setup === setup);
  const n = ts.length;
  return {
    trades: n,
    winRate: (() => { const w = ts.filter(isWin).length, d = w + ts.filter(isLoss).length; return d ? (w / d) * 100 : 0; })(),
    exp: meanR(ts),
    pnl: ts.reduce((a, t) => a + t.pnl, 0),
    kept: keptShare(ts),
  };
};

const MONEY = [0, 1, 2].map((d) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtMoney = (n, opts = {}) => {
  if (!Number.isFinite(+n)) return "–"; // a missing figure reads as missing, never as $NaN
  const v = Math.round(Math.abs(n) * 100) / 100;
  const sign = n < 0 && v ? "-" : opts.sign && n > 0 && v ? "+" : "";
  return `${sign}$${MONEY[opts.decimals ?? (Number.isInteger(v) ? 0 : 2)].format(v)}`;
};
// Profit factor, which is endless until the first loss
export const fmtPF = (v) => (Number.isFinite(v) ? v.toFixed(2) : "–");
export const fmtR = (r) => (r == null || r === "" || !Number.isFinite(+r) ? "–" : `${+r > 0 ? "+" : ""}${(+r).toFixed(2)}R`);
const localTime = () => { const d = new Date(); return `${d.getHours()}:${d.getMinutes()}`; };
export const greeting = (time = LIVE ? localTime() : NOW.time) => { const h = +time.split(":")[0]; return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
// A day of the month on show, or of the month in key ("2026-10-28")
export const dayName = (d, key = null) => {
  const [y, m] = key ? [+key.slice(0, 4), +key.slice(5, 7) - 1] : [CAL.year, CAL.month];
  return `${DOW[new Date(y, m, d).getDay()]} ${d} ${MONTHS[m].slice(0, 3)}`;
};

export const IDEA_AREAS = ["Journal", "Analytics", "Strategy", "Study", "Community", "Mobile", "Other"];

