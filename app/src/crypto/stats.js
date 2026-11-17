import { SESSIONS, isWeekendDay } from "../world.js";

const num = (v) => (v == null || v === "" || !Number.isFinite(+v) ? null : +v);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };

// What one trade made before fees and funding
export const grossOf = (t) => (num(t.pnl) ?? 0) + (num(t.commission) ?? 0) - (num(t.funding) ?? 0);
const notionalOf = (t) => { const e = num(t.entry), q = num(t.size); return e != null && q != null ? Math.abs(e * q) : null; };
export const liqDistanceOf = (t) => {
  const e = num(t.entry), l = num(t.liqPrice);
  return e > 0 && l != null && l >= 0 ? round((Math.abs(e - l) / e) * 100, 1) : null;
};

export function receiptOf(trades) {
  const fees = { total: 0, maker: 0, taker: 0, unsplit: 0 };
  const funding = { paid: 0, received: 0, net: 0, trades: 0 };
  let notional = 0, priced = 0, pricedFees = 0;
  for (const t of trades) {
    const c = num(t.commission) ?? 0, mk = num(t.feeMaker), tk = num(t.feeTaker);
    fees.total += c;
    if (mk != null || tk != null) { fees.maker += mk ?? 0; fees.taker += tk ?? 0; fees.unsplit += c - (mk ?? 0) - (tk ?? 0); }
    else fees.unsplit += c;
    const f = num(t.funding);
    if (f != null) { funding.trades++; funding.net += f; if (f < 0) funding.paid += -f; else funding.received += f; }
    const n = notionalOf(t);
    if (n != null && n > 0) { notional += n; priced++; pricedFees += c; }
  }
  const net = sum(trades.map((t) => num(t.pnl) ?? 0));
  const gross = sum(trades.map(grossOf));
  const costs = fees.total - funding.net; // fees paid plus funding paid, less funding received
  for (const k of Object.keys(fees)) fees[k] = round(fees[k]);
  for (const k of ["paid", "received", "net"]) funding[k] = round(funding[k]);
  return {
    trades: trades.length, gross: round(gross), net: round(net), fees, funding, costs: round(costs),
    costShare: gross > 0 ? round((costs / gross) * 100, 1) : null,
    feeBps: notional > 0 ? round((pricedFees / notional) * 1e4, 2) : null, notional: round(notional), priced,
    makerShare: fees.maker || fees.taker ? round((fees.maker / (fees.maker + fees.taker || 1)) * 100, 0) : null,
  };
}

export function hoursOf(trades) {
  const hours = Array(24).fill(0), counts = Array(24).fill(0);
  for (const t of trades) {
    if (!Number.isInteger(t.hour) || t.hour < 0 || t.hour > 23) continue;
    hours[t.hour] += num(t.pnl) ?? 0;
    counts[t.hour]++;
  }
  const sessions = SESSIONS.map(([name, s, e]) => ({ name, from: s, to: e, pnl: round(sum(hours.slice(s, e))), trades: sum(counts.slice(s, e)) }));
  return { hours: hours.map((v) => round(v)), counts, sessions };
}

export function weekendOf(trades) {
  const side = (ts) => ({ trades: ts.length, net: round(sum(ts.map((t) => num(t.pnl) ?? 0))), wins: ts.filter((t) => t.pnl > 0).length, losses: ts.filter((t) => t.pnl < 0).length });
  const known = trades.filter((t) => Number.isInteger(t.weekday));
  const byDay = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ weekday: d, ...side(known.filter((t) => t.weekday === d)) }));
  return { weekend: side(known.filter((t) => isWeekendDay(t.weekday))), weekday: side(known.filter((t) => !isWeekendDay(t.weekday))), byDay };
}

export function leverageOf(trades, cap = null) {
  const levs = trades.map((t) => num(t.leverage)).filter((v) => v != null && v > 0);
  const counts = new Map();
  for (const v of levs) { const k = Math.max(1, Math.round(v)); counts.set(k, (counts.get(k) || 0) + 1); }
  const over = cap > 0 ? levs.filter((v) => v > cap).length : 0;
  return {
    known: levs.length, unknown: trades.length - levs.length,
    stacks: [...counts.entries()].sort((a, b) => a[0] - b[0]),
    max: levs.length ? Math.max(...levs) : null, avg: levs.length ? round(sum(levs) / levs.length, 1) : null, over, cap: cap > 0 ? cap : null,
  };
}

export function liqDistancesOf(trades, rule = null) {
  const rows = trades.map((t) => ({ t, d: liqDistanceOf(t) })).filter((x) => x.d != null);
  return { rows, inside: rule > 0 ? rows.filter((x) => x.d < rule).length : 0, min: rows.length ? Math.min(...rows.map((x) => x.d)) : null };
}

export function dailyOf(trades) {
  const map = {};
  for (const t of trades) if (t.day) map[t.day] = round((map[t.day] || 0) + (num(t.pnl) ?? 0));
  return map;
}
