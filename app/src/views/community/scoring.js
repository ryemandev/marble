import { MON as MONTHS, pad } from "../../lib/basics.js";

const R_CAP = 3;
export const BROKEN_DAY_R = 2;
export const COUNTED_SOURCES = ["import", "sync"];
export const CUP_SOURCES = ["sync"];
export const BOARD_CAPS = { maxTrades: 20, stopAfter: 5 };
// Trading days needed before a trader is ranked, per period
export const MIN_DAYS = { week: 2, month: 5, season: 10 };
const HOUSE_MIN_DAYS = 5;
const HOUSE_MIN_MEMBERS = 3;
const STRIP_MAX = 23;
export const CREW_TAGS = ["OLY", "NITE", "PIT"];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const toDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toKey = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
export const addDays = (k, n) => { const d = toDate(k); d.setUTCDate(d.getUTCDate() + n); return toKey(d); };
const isWeekday = (k) => { const w = toDate(k).getUTCDay(); return w !== 0 && w !== 6; };
export function weekdaysBetween(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) if (isWeekday(k)) out.push(k);
  return out;
}

export function periodOf(period, today) {
  const d = toDate(today);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const last = (yy, mm) => toKey(new Date(Date.UTC(yy, mm + 1, 0)));
  if (period === "week") {
    const from = addDays(today, -((d.getUTCDay() + 6) % 7));
    return { period, from, to: addDays(from, 4), today };
  }
  if (period === "season") return { period, from: toKey(new Date(Date.UTC(y, m - 2, 1))), to: last(y, m), today };
  return { period: "month", from: toKey(new Date(Date.UTC(y, m, 1))), to: last(y, m), today };
}

export function stripDays({ period, from, to, today }) {
  const days = weekdaysBetween(from, to).filter((k) => period !== "season" || k <= today);
  return days.slice(-STRIP_MAX);
}

/* ---------- Every trading day's verdict ---------- */

const orderOf = (t) => t.traded_at || t.at || t.time || "";

export function disciplineDays(trades, rules = {}, { sources = COUNTED_SOURCES, from = null, to = null, riskUnit = null, ignorePlan = false } = {}) {
  const lim = (v) => (v == null || v === "" || !Number.isFinite(+v) || +v <= 0 ? null : +v);
  const lossLimit = lim(rules.lossLimit), maxTrades = lim(rules.maxTrades), stopAfter = lim(rules.stopAfter), maxTradeLoss = lim(rules.maxTradeLoss);
  const byDay = new Map();
  for (const t of trades) {
    if (sources && !sources.includes(t.source)) continue;
    const day = t.dayKey;
    if (!day || (from && day < from) || (to && day > to)) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(t);
  }
  const out = [];
  for (const [day, list] of byDay) {
    list.sort((a, b) => (orderOf(a) < orderOf(b) ? -1 : orderOf(a) > orderOf(b) ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    let running = 0, lossesInARow = 0, r = 0;
    const broke = new Set();
    for (const t of list) {
      const pnl = +t.pnl || 0;
      // Taken after the losses-in-a-row limit was already reached
      if (stopAfter != null && lossesInARow >= stopAfter) broke.add("streak");
      running += pnl;
      if (lossLimit != null && running < -lossLimit) broke.add("loss");
      if (maxTradeLoss != null && pnl < -maxTradeLoss) broke.add("size");
      if (t.followedPlan === false && !ignorePlan) broke.add("plan");
      lossesInARow = pnl < 0 ? lossesInARow + 1 : 0;
      const own = t.r == null || t.r === "" || !Number.isFinite(+t.r) ? 0 : +t.r;
      r += Math.min(riskUnit > 0 ? Math.round((pnl / riskUnit) * 1e4) / 1e4 : own, R_CAP);
    }
    if (maxTrades != null && list.length > maxTrades) broke.add("trades");
    const reasons = ["loss", "trades", "streak", "plan", "size"].filter((k) => broke.has(k));
    out.push({ day, trades: list.length, r: round2(r), broke: reasons, kept: reasons.length === 0 });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1));
}

/* ---------- A trader's period, summed up ---------- */

export function summarise(days, { brokenDayR = BROKEN_DAY_R } = {}) {
  const sorted = [...days].sort((a, b) => (a.day < b.day ? -1 : 1));
  const traded = sorted.length;
  const kept = sorted.filter((d) => d.kept).length;
  const r = round2(sorted.reduce((a, d) => a + d.r, 0));
  const keptR = round2(sorted.filter((d) => d.kept).reduce((a, d) => a + d.r, 0));
  const lastBroken = [...sorted].reverse().find((d) => !d.kept)?.day ?? "";
  let best = 0, run = 0;
  for (const d of sorted) { run = d.kept ? run + 1 : 0; best = Math.max(best, run); }
  return {
    traded, kept, broken: traded - kept,
    pct: traded ? Math.round((kept / traded) * 100) : 0,
    trades: sorted.reduce((a, d) => a + d.trades, 0),
    r, keptR,
    score: round2(keptR - brokenDayR * (traded - kept)),
    // Kept days since the last day a rule broke
    streak: sorted.filter((d) => d.kept && d.day > lastBroken).length,
    best,
  };
}

export function stripOf(days, keys, today) {
  const at = new Map(days.map((d) => [d.day, d]));
  return keys.map((k) => (at.has(k) ? (at.get(k).kept ? "k" : "b") : k > today ? "." : "-")).join("");
}

/* ---------- Ranking ---------- */

const byPct = (a, b) => b.kept * a.traded - a.kept * b.traded;
const ORDERS = {
  board: (a, b) => byPct(a, b) || b.score - a.score || a.trades - b.trades || cmpName(a, b),
  // Crew standings: rules kept %, then R
  crew: (a, b) => byPct(a, b) || b.r - a.r || a.trades - b.trades || cmpName(a, b),
  cup: (a, b) => b.score - a.score || b.kept - a.kept || a.trades - b.trades || cmpName(a, b),
};
function cmpName(a, b) { const x = String(a.handle || ""), y = String(b.handle || ""); return x < y ? -1 : x > y ? 1 : 0; }

export function rank(rows, { order = "board", minDays = 0 } = {}) {
  const cmp = ORDERS[order] || ORDERS.board;
  const ok = rows.filter((x) => x.traded >= minDays).sort(cmp).map((x, i) => ({ ...x, rank: i + 1 }));
  const rest = rows.filter((x) => x.traded < minDays).sort(cmp).map((x) => ({ ...x, rank: null }));
  return [...ok, ...rest];
}

export function houseCup(rows, { minDays = HOUSE_MIN_DAYS, minMembers = HOUSE_MIN_MEMBERS } = {}) {
  const crews = CREW_TAGS.map((crew) => {
    const q = rows.filter((x) => x.crew === crew && x.traded >= minDays);
    const pct = q.length >= minMembers ? Math.round((q.reduce((a, x) => a + x.kept / x.traded, 0) / q.length) * 1000) / 10 : null;
    return { crew, qualifying: q.length, pct };
  });
  const shown = crews.filter((c) => c.pct != null).sort((a, b) => b.pct - a.pct);
  return crews.map((c) => ({ ...c, place: c.pct == null ? null : 1 + shown.filter((x) => x.pct > c.pct).length }));
}

/* ---------- What cost you places ---------- */

const WHY = {
  loss: "went past your daily loss limit",
  trades: "went over your trades-a-day limit",
  streak: "kept trading after your losses-in-a-row limit",
  plan: "had a trade marked off-plan",
  size: "had a trade lose more than the rules allow",
};
export const shortDay = (k) => { const d = toDate(k); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function costOf(days) {
  const broken = [...days].filter((d) => !d.kept).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!broken.length) return null;
  const groups = new Map();
  for (const d of broken) {
    const why = d.broke[0];
    if (!groups.has(why)) groups.set(why, []);
    groups.get(why).push(shortDay(d.day));
  }
  const parts = [...groups].map(([why, ds]) => (ds.length > 3
    ? `${ds.length} days ${WHY[why] || "broke a rule"}, the latest on ${ds.at(-1)}.`
    : `${list(ds)} ${WHY[why] || "broke a rule"}.`));
  const clean = days.length - broken.length;
  return `${parts.join(" ")}${clean ? " Every other day was clean." : ""}`;
}

export const cupRules = (limits = {}, size = 0) => ({
  lossLimit: limits.daily_loss_pct != null ? (size * limits.daily_loss_pct) / 100 : null,
  maxTradeLoss: limits.max_trade_loss_pct != null ? (size * limits.max_trade_loss_pct) / 100 : null,
  maxTrades: limits.max_trades ?? null,
  stopAfter: limits.stop_after ?? null,
});

export const cupRiskUnit = (limits = {}, size = 0) => (size * (limits.max_trade_loss_pct ?? 1)) / 100;
export const cupDays = (trades, limits = {}, size = 0, opts = {}) =>
  disciplineDays(trades, cupRules(limits, size), { ...opts, sources: CUP_SOURCES, riskUnit: cupRiskUnit(limits, size), ignorePlan: true });

const capped = (v, most) => (v == null || v === "" || !(+v > 0) ? null : Math.min(+v, most));
export const ownRules = (r = {}) => ({ lossLimit: r.lossLimit ?? null, maxTrades: capped(r.maxTrades, BOARD_CAPS.maxTrades), stopAfter: capped(r.stopAfter, BOARD_CAPS.stopAfter) });
export const hasRules = (r = {}) => [r.lossLimit, r.maxTrades, r.stopAfter].some((v) => v != null && +v > 0);

/* ---------- Formatting: R only, never dollars ---------- */

export const fmtR1 = (r) => (r == null || !Number.isFinite(+r) ? "–" : `${+r > 0 ? "+" : +r < 0 ? "−" : ""}${Math.abs(+r).toFixed(1)}R`);
export const fmtR2 = (r) => (r == null || !Number.isFinite(+r) ? "–" : `${+r > 0 ? "+" : +r < 0 ? "−" : ""}${Math.abs(+r).toFixed(2)}R`);
export const halfR = (r) => (r == null || r === "" || !Number.isFinite(+r) ? null : (Math.sign(+r) * Math.round(Math.abs(+r) * 2)) / 2);
export const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
