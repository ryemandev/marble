import { MON as MONTHS } from "../basics.js";

const LEVELS = ["shown", "noted", "close", "reached"];
const worse = (a, b) => (LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a);

/* ---------- Money and time words ---------- */

const SYMBOL = { USD: "$", GBP: "£", EUR: "€" };
export function money(n, cur = "USD", { sign = false } = {}) {
  if (n == null || !Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  const cents = abs < 100 && abs % 1 ? 2 : 0;
  const s = `${SYMBOL[cur] || ""}${abs.toLocaleString("en-US", { minimumFractionDigits: cents, maximumFractionDigits: cents })}${SYMBOL[cur] ? "" : ` ${cur}`}`;
  return n < 0 ? `−${s}` : sign && n > 0 ? `+${s}` : s;
}
const pct = (x) => `${Math.round(x * 100)}%`;
const dayShort = (key) => { const [, m, d] = key.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };

const TZ_WORDS = { "America/Chicago": "CT", "America/New_York": "ET", "Europe/Prague": "Prague time", UTC: "UTC", "Etc/GMT-3": "UTC+3", "server_utc+2/+3": "server time" };
export function clockWords(t, tz) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const zone = TZ_WORDS[tz] || tz || "";
  if (h === 0 && m === 0) return `midnight ${zone}`.trim();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} ${zone}`.trim();
}

/* ---------- The firm's trading day ---------- */

const fmts = new Map();
function wall(ts, tz) {
  const shift = tz === "server_utc+2/+3" ? 7 * 3600e3 : 0;
  const zone = tz === "server_utc+2/+3" ? "America/New_York" : tz || "America/New_York";
  if (!fmts.has(zone)) {
    let f;
    try { f = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" }); }
    catch { f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" }); }
    fmts.set(zone, f);
  }
  const p = Object.fromEntries(fmts.get(zone).formatToParts(new Date(+new Date(ts) + shift)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
const keyOf = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.toISOString().slice(0, 10); };
const addDays = (key, n) => { const t = new Date(`${key}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dowOf = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();

export function firmDay(ts, reset) {
  const w = wall(ts, reset?.tz);
  let key = keyOf(w.y, w.m, w.d);
  if (reset?.t && reset.t !== "00:00") {
    const [h, m] = reset.t.split(":").map(Number);
    if (w.h * 60 + w.min >= h * 60 + m) key = addDays(key, 1);
  }
  const dow = dowOf(key);
  return dow === 6 ? addDays(key, 2) : dow === 0 ? addDays(key, 1) : key;
}

function resetOf(plan, phase, group) {
  const own = phase?.dll && !phase.dll.c ? phase.dll.reset : null;
  if (own?.t) return own;
  for (const ph of plan?.phases || []) if (ph.dll && !ph.dll.c && ph.dll.reset?.t) return ph.dll.reset;
  return group === "futures" || /^futures|futur/.test(plan?.p || "") ? { t: "17:00", tz: "America/Chicago" } : { t: "00:00", tz: "server_utc+2/+3" };
}

/* ---------- Trades into balances ---------- */

const closedAt = (t) => t.closedAt || t.closed_at || t.traded_at;
const MICROS = /^(MES|MNQ|M2K|MYM|MGC|MCL|SIL|MHG|MBT|MET|M6E|M6A|M6B|MJY|MCD|MSF|MNG|MTN|MWN|MFS|MBT)/;
export const isMicro = (symbol) => MICROS.test(String(symbol || "").toUpperCase().replace(/^[^A-Z0-9]+/, ""));

export function ledger(trades, start, reset) {
  const rows = trades.filter((t) => Number.isFinite(+t.pnl) && closedAt(t)).map((t) => ({ t, at: +new Date(closedAt(t)) })).filter((x) => Number.isFinite(x.at)).sort((a, b) => a.at - b.at);
  let bal = start;
  return rows.map(({ t, at }) => { bal += +t.pnl; return { t, at, day: firmDay(at, reset), pnl: +t.pnl, bal }; });
}

// Each firm day's net result and closing balance, in order
export function days(rows, start) {
  const out = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.day === r.day) { last.pnl += r.pnl; last.eod = r.bal; last.n++; }
    else out.push({ day: r.day, pnl: r.pnl, eod: r.bal, open: last ? last.eod : start, n: 1 });
  }
  return out;
}

/* ---------- Rule by rule ---------- */

const amountOf = (r, size) => (r?.a != null ? r.a : r?.pct != null ? (r.pct * size) / 100 : null);
const fromFirm = (x, firmStart, start) => (x == null ? null : start + (x - firmStart));

function dailyLoss(ph, ctx) {
  const r = ph.dll;
  if (r === false) return { id: "dll", label: "Daily loss", info: true, text: `No daily loss limit on this ${ctx.stage}.` };
  if (!r) return null;
  if (r.c) return unclearLine("dll", "Daily loss", r, ctx);
  const resetAt = r.reset?.t ? clockWords(r.reset.t, r.reset.tz) : null;
  if (r.opt && r.a == null && r.pct == null) {
    return { id: "dll", label: "Daily loss", info: true, src: r.s,
      text: `${ctx.firm} has no daily loss limit here unless you added one${typeof r.opt === "number" ? ` (${money(r.opt, ctx.cur)})` : ""} at checkout.` };
  }
  const limitOn = (open) => {
    const prevProfit = open - ctx.start;
    let limit = amountOf(r, ctx.size);
    if (r.tiers?.length) limit = r.tiers.filter(([from]) => prevProfit >= from).pop()?.[1] ?? limit;
    if (r.pct != null && r.of && r.of !== "initial_balance") limit = (r.pct * (ctx.firmStart + prevProfit)) / 100;
    return limit;
  };
  const lowOf = (day) => { let run = 0, low = 0; for (const x of ctx.rows) if (x.day === day) { run += x.pnl; low = Math.min(low, run); } return -low; };
  const today = ctx.byDay.find((d) => d.day === ctx.today);
  const limit = limitOn(today ? today.open : ctx.bal);
  if (!(limit > 0)) return null;
  const used = lowOf(ctx.today);
  const earlier = r.breach === "fail_account" ? ctx.byDay.find((d) => d.day !== ctx.today && lowOf(d.day) >= limitOn(d.open) - 1e-9) : null;
  const frac = used / limit;
  const level = frac >= 1 || earlier ? "reached" : frac >= 0.8 ? "close" : frac >= 0.5 ? "noted" : "shown";
  const since = resetAt ? ` since ${resetAt}` : " today";
  const after = r.breach === "fail_account" ? `${ctx.firm} ends the account at this level` : r.breach ? `At the limit ${ctx.firm} pauses the account${resetAt ? ` until ${resetAt}` : " for the day"}` : null;
  const text = frac >= 1
    ? `Daily loss limit reached on closed trades: ${money(-used, ctx.cur)} against ${ctx.firm}'s ${money(limit, ctx.cur)}.`
    : earlier ? `Daily loss limit reached on closed trades on ${dayShort(earlier.day)}: ${money(-lowOf(earlier.day), ctx.cur)} against ${ctx.firm}'s ${money(limitOn(earlier.open), ctx.cur)}.`
    : `${money(-used, ctx.cur)} of ${ctx.firm}'s ${money(limit, ctx.cur)} limit${since} (${pct(frac)}).`;
  return {
    id: "dll", label: "Daily loss", value: used, limit, frac, level, text, src: r.s,
    left: Math.max(0, limit - used),
    note: [after && `${after}.`, r.basis !== "balance" ? `${ctx.firm} also counts open positions, so its figure can be higher.` : null,
      r.of === "day_start_higher_of_balance_equity" ? "Measured from the higher of balance and equity at the reset." : null].filter(Boolean).join(" "),
  };
}

function drawdown(ph, ctx) {
  const r = ph.dd;
  if (r === false) return { id: "dd", label: "Max drawdown", info: true, text: `No max drawdown on this ${ctx.stage}.` };
  if (!r) return null;
  if (r.c) return unclearLine("dd", "Max drawdown", r, ctx);
  const a = amountOf(r, ctx.size);
  if (!(a > 0) && r.floor == null) return null;
  const lockFloor = r.lockAt != null && ctx.firmStart > 1000 && r.lockAt < ctx.firmStart / 2 ? ctx.start + r.lockAt : fromFirm(r.lockAt, ctx.firmStart, ctx.start);
  const capLock = (f) => (lockFloor != null ? Math.min(f, lockFloor) : f);
  const unknown = r.type === "trailing";
  const intraday = r.type === "trailing_intraday" || unknown;
  const eod = r.type === "trailing_eod";
  const estimate = intraday && r.on === "peak_unrealized_equity";
  const about = (x) => (estimate ? `at least ${x}` : unknown ? `about ${x}` : x);
  let peak = ctx.start, peakEod = ctx.start, floor = r.floor != null && r.type === "static" ? fromFirm(r.floor, ctx.firmStart, ctx.start) : ctx.start - a;
  let hit = null, lastDay = null, dayEnd = ctx.start;
  for (const x of ctx.rows) {
    if (eod && lastDay && x.day !== lastDay) peakEod = Math.max(peakEod, dayEnd);
    if (eod) floor = capLock(Math.max(floor, peakEod - a));
    if (!hit && x.bal <= floor + 1e-9) hit = x.day;
    if (intraday) { peak = Math.max(peak, x.bal); floor = capLock(Math.max(floor, peak - a)); }
    lastDay = x.day; dayEnd = x.bal;
  }
  if (eod && lastDay && lastDay !== ctx.today) { peakEod = Math.max(peakEod, dayEnd); floor = capLock(Math.max(floor, peakEod - a)); }
  const left = ctx.bal - floor;
  const buffer = a > 0 ? a : ctx.start - floor;
  const frac = buffer > 0 ? Math.min(1, Math.max(0, 1 - left / buffer)) : 0;
  const locked = lockFloor != null && floor >= lockFloor - 1e-9 && r.type !== "static";
  const level = hit || left <= 0 ? "reached" : frac >= 0.8 ? "close" : frac >= 0.5 ? "noted" : "shown";
  const how = r.type === "static" ? "Fixed, it doesn't move."
    : locked ? `Locked at ${money(floor, ctx.cur)}; it won't move again.`
    : eod ? `Follows your end-of-day balance${lockFloor != null ? ` and stops at ${money(lockFloor, ctx.cur)}` : ""}.`
    : estimate ? `${ctx.firm} follows the highest open profit during trades, which closed trades can't show, so its floor may be higher.`
    : unknown ? `${ctx.firm} doesn't publish whether it trails the end-of-day or the intraday balance; this follows your highest closed balance, so its floor can differ.`
    : `Follows your highest closed balance${lockFloor != null ? ` and stops at ${money(lockFloor, ctx.cur)}` : ""}.`;
  const text = level === "reached"
    ? `Max drawdown reached on closed trades${hit ? ` on ${dayShort(hit)}` : ""}: the balance met ${ctx.firm}'s floor of ${about(money(floor, ctx.cur))}.`
    : `${estimate ? "Up to " : unknown ? "About " : ""}${money(left, ctx.cur)} above the floor of ${about(money(floor, ctx.cur))}.`;
  return {
    id: "dd", label: r.type === "static" ? "Max loss" : eod ? "Trailing drawdown, end of day" : unknown ? "Trailing drawdown" : intraday ? "Trailing drawdown, intraday" : "Max drawdown",
    value: Math.max(0, buffer - left), limit: buffer, floor, left, frac, level, estimate: estimate || unknown, approx: unknown, locked, text, src: r.s,
    note: [how, r.chk === "realtime_equity" ? `${ctx.firm} checks it live, open positions included.` : null, r.breach === "fail_account" ? `${ctx.firm} ends the account at the floor.` : null].filter(Boolean).join(" "),
  };
}

function target(ph, ctx, cons) {
  const r = ph.target;
  if (!r) return null;
  if (r.c) return unclearLine("target", "Profit target", r, ctx);
  const goal = amountOf(r, ctx.size);
  if (!(goal > 0)) return null;
  const profit = ctx.bal - ctx.start;
  const need = cons?.forPassing && cons.needed > goal ? cons.needed : goal;
  const met = profit >= need;
  return {
    id: "target", label: "Profit target", value: Math.max(0, profit), limit: need, frac: Math.max(0, Math.min(1, profit / need)), level: "shown", met, src: r.s,
    text: met ? `Target met on closed trades: ${money(profit, ctx.cur)} of ${money(need, ctx.cur)}.` : `${money(Math.max(0, profit), ctx.cur)} of ${money(need, ctx.cur)}.`,
    note: need > goal ? `The ${money(goal, ctx.cur)} target, raised by the consistency rule while the best day is ${money(cons.best, ctx.cur)}.` : null,
  };
}

function consistency(ph, ctx) {
  const r = ph.cons;
  if (r === false || !r) return null;
  if (r.c) return unclearLine("cons", "Consistency", r, ctx);
  const forPassing = (r.for || []).some((x) => /^evaluation|instant/.test(x)) && /^evaluation/.test(ph.k);
  const forPayout = (r.for || []).includes("payout");
  if (!forPassing && !forPayout && r.for?.length) return null;
  const cap = r.cap / 100;
  const best = Math.max(0, ...ctx.byDay.map((d) => d.pnl));
  const total = ctx.byDay.reduce((s, d) => s + d.pnl, 0);
  const bestDay = ctx.byDay.find((d) => d.pnl === best && best > 0);
  const purpose = forPassing ? "for passing" : "for a payout";
  if (r.m === "other") return { id: "cons", label: "Consistency", info: true, text: `${ctx.firm} has a ${r.cap}% consistency rule ${purpose}.`, note: r.w, src: r.s };
  if (r.m === "target") {
    const goal = amountOf(ph.target, ctx.size);
    const most = goal ? cap * goal : null;
    if (!most) return { id: "cons", label: "Consistency", info: true, text: `No single day may pass ${r.cap}% of the profit target.`, src: r.s };
    const frac = best / most;
    return { id: "cons", label: "Best day", value: best, limit: most, frac: Math.min(1, frac), level: frac > 1 ? "close" : frac >= 0.8 ? "noted" : "shown", src: r.s,
      text: `Best day ${money(best, ctx.cur)}${bestDay ? ` (${dayShort(bestDay.day)})` : ""}. ${ctx.firm} caps any one day at ${r.cap}% of the target, ${money(most, ctx.cur)}.`, best, needed: 0, forPassing };
  }
  if (!(best > 0)) return { id: "cons", label: "Consistency", value: 0, limit: cap, frac: 0, level: "shown", src: r.s, best: 0, needed: 0, forPassing,
    text: `No winning day yet. ${ctx.firm}'s limit ${purpose} is ${r.cap}% of total profit on your best day.` };
  const ratio = total > 0 ? best / total : Infinity;
  const needed = best / cap;
  const frac = ratio / cap;
  const level = ratio > cap ? "close" : frac >= 0.8 ? "noted" : "shown";
  return {
    id: "cons", label: "Consistency", value: ratio, limit: cap, frac: Math.min(1, frac), level, src: r.s, best, needed, forPassing,
    text: total > 0
      ? `Best day ${money(best, ctx.cur)}${bestDay ? ` (${dayShort(bestDay.day)})` : ""}, ${pct(ratio)} of total profit of ${money(total, ctx.cur)}. ${ctx.firm}'s limit ${purpose} is ${r.cap}%.`
      : `Best day ${money(best, ctx.cur)}; total profit isn't above zero yet. ${ctx.firm}'s limit ${purpose} is ${r.cap}%.`,
    note: ratio > cap ? `With this best day, total profit would have to reach ${money(needed, ctx.cur)} to be within it.` : null,
  };
}

function tradingDays(ph, ctx) {
  const out = [];
  const traded = ctx.byDay.length;
  if (ph.days && !ph.days.c && ph.days.d) {
    out.push({ id: "days", label: "Trading days", value: traded, limit: ph.days.d, frac: Math.min(1, traded / ph.days.d), level: "shown", met: traded >= ph.days.d, src: ph.days.s,
      text: `${traded} of ${ctx.firm}'s ${ph.days.d} minimum.` });
  } else if (ph.days?.c) out.push(unclearLine("days", "Trading days", ph.days, ctx));
  if (ph.pay && !ph.pay.c && ph.pay.d) {
    // Where the firm starts the count again after a payout, only the days after the latest one count
    const since = ph.pay.cyc ? ctx.paid : null;
    const cycle = since ? ctx.byDay.filter((d) => d.day > since) : ctx.byDay;
    const n = ph.pay.win != null ? cycle.filter((d) => d.pnl >= ph.pay.win).length : cycle.length;
    out.push({ id: "pay", label: "Payout days", value: n, limit: ph.pay.d, frac: Math.min(1, n / ph.pay.d), level: "shown", met: n >= ph.pay.d, src: ph.pay.s,
      text: `${n} of ${ph.pay.d}${since ? ` since the payout on ${dayShort(since)}` : ""}.${ph.pay.win != null ? ` ${ctx.firm} counts a day when it closes ${money(ph.pay.win, ctx.cur)} or more up.` : ""}`,
      note: ph.pay.cyc ? `${ctx.firm} starts the count again after each payout; Marble counts from the latest one in Fees & payouts.` : null });
  }
  if (ph.time && !ph.time.c && ph.time.idle && ctx.rows.length) {
    const since = Math.floor((ctx.now - ctx.rows[ctx.rows.length - 1].at) / 864e5);
    const frac = since / ph.time.idle;
    if (frac >= 0.7) out.push({ id: "idle", label: "Inactivity", value: since, limit: ph.time.idle, frac: Math.min(1, frac), level: frac >= 1 ? "reached" : frac >= 0.9 ? "close" : "noted", src: ph.time.s,
      text: `Last trade ${since} days ago. ${ctx.firm} may close accounts after ${ph.time.idle} days without a trade.` });
  }
  return out;
}

function contracts(ph, ctx) {
  const r = ph.size;
  if (!r) return null;
  if (r.c) return unclearLine("size", "Contracts", r, ctx);
  if (r.max == null && !r.scale) {
    return r.lots ? { id: "size", label: "Lot size", info: true, text: `Up to ${r.lots} lots at once.`, src: r.s }
      : r.lev ? { id: "size", label: "Leverage", info: true, text: `Leverage ${r.lev}.`, src: r.s } : null;
  }
  const ratio = r.ratio || 10;
  const sized = ctx.trades.map((t) => {
    const n = Math.abs(+t.size) || 0;
    const open = +new Date(t.traded_at), close = +new Date(closedAt(t));
    return { n: isMicro(t.symbol) ? n / ratio : n, open, close: Number.isFinite(close) && close >= open ? close : open, day: firmDay(t.traded_at, ctx.reset) };
  }).filter((x) => x.n > 0 && Number.isFinite(x.open));
  if (!sized.length) return { id: "size", label: "Contracts", info: true, src: r.s, text: `Up to ${r.max} ${r.max === 1 ? "contract" : "contracts"} at once${r.ratio ? ` (${r.ratio} micros count as 1)` : ""}.` };
  // A sweep over opens and closes finds the most held at once
  const events = sized.flatMap((x) => [[x.open, x.n, x.day], [x.close, -x.n, x.day]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const peakByDay = {};
  let held = 0;
  for (const [, dn, day] of events) { held += dn; if (dn > 0) peakByDay[day] = Math.max(peakByDay[day] || 0, held); }
  let worst = null;
  for (const [day, peak] of Object.entries(peakByDay)) {
    let limit = r.max;
    if (r.scale) {
      const before = ctx.byDay.filter((d) => d.day < day).pop();
      const profit = (before ? before.eod : ctx.start) - ctx.start;
      limit = r.scale.filter(([from]) => profit >= from).pop()?.[1] ?? r.scale[0][1];
      if (r.max != null) limit = Math.min(limit, r.max);
    }
    const over = Math.round(peak * 100) / 100 > limit;
    if (!worst || (over && !worst.over) || (over === worst.over && peak / limit > worst.peak / worst.limit)) worst = { day, peak: Math.round(peak * 100) / 100, limit, over };
  }
  const word = (n) => (n === 1 ? "contract" : "contracts");
  return {
    id: "size", label: "Contracts", value: worst.peak, limit: worst.limit, frac: Math.min(1, worst.peak / worst.limit), level: worst.over ? "reached" : "shown", src: r.s,
    text: worst.over
      ? `Contract limit passed on ${dayShort(worst.day)}: ${worst.peak} ${word(worst.peak)} open at once, against ${ctx.firm}'s ${worst.limit}${r.scale ? " on the scaling plan that day" : ""}.`
      : `Largest position ${worst.peak} ${word(worst.peak)} (${dayShort(worst.day)}), limit ${worst.limit}.`,
    note: [r.scale ? "The limit grows with profit on the scaling plan." : null, r.ratio ? `${r.ratio} micros count as 1.` : null, "Worked out from trade times; a position built up inside one trade isn't seen."].filter(Boolean).join(" "),
  };
}

function holding(ph, ctx) {
  const r = ph.hold;
  if (!r) return null;
  if (r.c) return [unclearLine("hold", "Holding", r, ctx)];
  const out = [];
  if (r.night === 0 && r.by?.t) {
    const [h, m] = r.by.t.split(":").map(Number);
    const late = ctx.trades.filter((t) => {
      const c = closedAt(t);
      if (!c || !t.closedAt && !t.closed_at) return false;
      const w = wall(c, r.by.tz);
      const mins = w.h * 60 + w.min;
      const reset = ctx.reset?.t && ctx.reset.tz === r.by.tz ? ctx.reset.t.split(":").map(Number) : [17, 0];
      return (mins > h * 60 + m && mins < reset[0] * 60 + reset[1]) || firmDay(t.traded_at, ctx.reset) !== firmDay(c, ctx.reset);
    });
    const at = clockWords(r.by.t, r.by.tz);
    out.push(late.length
      ? { id: "hold", label: "Close-out", level: "reached", src: r.s, value: late.length,
        text: `${late.length === 1 ? "1 trade" : `${late.length} trades`} closed after ${ctx.firm}'s ${at} close-out, the latest on ${dayShort(firmDay(closedAt(late[late.length - 1]), ctx.reset))}.` }
      : { id: "hold", label: "Close-out", info: true, src: r.s, text: `Flat by ${at} each day. Every closed trade so far was.` });
  } else if (r.night === 1) out.push({ id: "hold", label: "Overnight", info: true, src: r.s, text: "Holding overnight is allowed." });
  if (r.wknd === 0 && r.night !== 0) {
    const held = ctx.trades.filter((t) => {
      const o = +new Date(t.traded_at), c = +new Date(closedAt(t));
      return Number.isFinite(o) && Number.isFinite(c) && c - o > 0 && spansWeekend(o, c);
    });
    out.push(held.length
      ? { id: "wknd", label: "Weekend", level: "reached", src: r.s, value: held.length, text: `${held.length === 1 ? "1 trade was" : `${held.length} trades were`} held over a weekend. ${ctx.firm} doesn't allow weekend holding here.` }
      : { id: "wknd", label: "Weekend", info: true, src: r.s, text: "No weekend holding. None so far." });
  } else if (r.wknd === 1 && r.night !== 0) out.push({ id: "wknd", label: "Weekend", info: true, src: r.s, text: "Weekend holding is allowed." });
  return out;
}
function spansWeekend(o, c) {
  // Any Saturday (New York) between the open and the close
  for (let t = o; t <= c; t += 6 * 3600e3) if (wall(t, "America/New_York").dow === 6) return true;
  return wall(c, "America/New_York").dow === 6;
}

function newsLine(ph, ctx) {
  const r = ph.news;
  if (!r) return null;
  if (r.c) return unclearLine("news", "News", r, ctx);
  return r.ok ? { id: "news", label: "News", info: true, text: "Trading the news is allowed.", src: r.s }
    : { id: "news", label: "News", info: true, text: "Restricted around major news releases.", note: r.w, src: r.s };
}

function unclearLine(id, label, r, ctx) {
  return { id, label, info: true, unclear: true, src: r.s,
    text: r.c === "not_found" ? `Not published by ${ctx.firm}. Their page has the details.` : `${ctx.firm}'s pages disagree on this one, so Marble doesn't track it. Their page has the details.` };
}

/* ---------- One account ---------- */

// payouts: the days ("YYYY-MM-DD") of the payouts logged for this account
export function track({ plan, phase, firmName, group, start, trades = [], payouts = [], now = Date.now() }) {
  if (!plan || !phase) return null;
  const firmStart = phase.start ?? plan.size;
  const begin = Number.isFinite(+start) && +start > 0 ? +start : firmStart;
  const reset = resetOf(plan, phase, group);
  const rows = ledger(trades, begin, reset);
  const ctx = {
    firm: firmName || plan.f, cur: plan.cur || "USD", size: plan.size, firmStart, start: begin, reset, trades, rows, now: +new Date(now),
    byDay: days(rows, begin), today: firmDay(now, reset), bal: rows.length ? rows[rows.length - 1].bal : begin,
    paid: payouts.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() || null,
    stage: /^evaluation/.test(phase.k) ? "evaluation" : phase.k === "live" ? "live account" : "account",
  };
  const cons = consistency(phase, ctx);
  const RULE_OF = { dll: "dll", dd: "dd", target: "target", cons: "cons", days: "days", pay: "pay", size: "size", hold: "hold", wknd: "hold", news: "news", idle: "time" };
  const lines = [dailyLoss(phase, ctx), drawdown(phase, ctx), target(phase, ctx, cons), cons, ...tradingDays(phase, ctx), contracts(phase, ctx), ...(holding(phase, ctx) || []), newsLine(phase, ctx)].filter(Boolean)
    .map((l) => {
      const r = phase[RULE_OF[l.id]];
      if (!r?.x || l.unclear) return l;
      const said = r.xa ? `${ctx.firm}'s pages don't settle this exactly. Marble uses the stricter reading.` : `${ctx.firm}'s pages disagree on this. Marble uses the stricter figure.`;
      return { ...l, disputed: true, srcs: r.x, note: [said, l.note].filter(Boolean).join(" ") };
    });
  const level = lines.reduce((w, l) => (l.level ? worse(w, l.level) : w), "shown");
  return {
    lines, level, balance: ctx.bal, start: begin, profit: ctx.bal - begin, today: ctx.today, reset, cur: ctx.cur,
    alert: level === "close" || level === "reached" ? lines.filter((l) => l.level === level)[0] : null,
    basis: rows.length ? "From closed trades." : "No closed trades on this account yet.",
  };
}

export function firmDailyLimit(plan, phase) {
  const r = phase?.dll;
  if (!r || r.c || (r.opt && r.a == null && r.pct == null)) return null;
  const a = r.tiers?.length ? r.tiers[0][1] : amountOf(r, plan.size);
  return a > 0 ? Math.round(a * 100) / 100 : null;
}
