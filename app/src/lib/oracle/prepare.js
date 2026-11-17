import { nyInstant, nyOf, pad } from "../../live/time.js";

const DAY = 864e5;
const num = (v) => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);
const dayKeyOf = (at) => { const n = nyOf(at); return `${n.year}-${pad(n.month + 1)}-${pad(n.day)}`; };

export function prepare(trades = [], { cal = { year: 2026, month: 9 } } = {}) {
  const out = [];
  trades.forEach((t, i) => {
    if (!t || t.id == null) return;
    const clock = /^(\d{1,2}):(\d{2})$/.exec(String(t.time || ""));
    let at = t.traded_at ? Date.parse(t.traded_at) : NaN;
    if (!Number.isFinite(at) && Number.isInteger(t.day)) {
      at = +nyInstant(cal.year, cal.month, t.day, clock ? +clock[1] : Number.isInteger(t.hour) ? t.hour : 12, clock ? +clock[2] : 0);
    }
    if (!Number.isFinite(at)) return;
    const ny = nyOf(at);
    const minutes = clock ? +clock[1] * 60 + +clock[2] : ny.hour * 60 + ny.minute;
    const pnl = num(t.pnl) ?? 0;
    const r = num(t.r);
    const closed = t.closedAt ? Date.parse(t.closedAt) - at : NaN;
    const held = Number.isFinite(closed) && closed >= 0 ? closed : num(t.heldMinutes) != null ? num(t.heldMinutes) * 60e3 : null;
    const size = num(t.size);
    const dayKey = t.dayKey || `${ny.year}-${pad(ny.month + 1)}-${pad(ny.day)}`;
    out.push({
      id: t.id,
      seq: -i,
      at,
      traded_at: new Date(at).toISOString(),
      dayKey,
      day: dayKey,
      month: dayKey.slice(0, 7),
      minutes,
      hour: Math.floor(minutes / 60),
      weekday: Number.isInteger(t.weekday) ? t.weekday : ny.weekday,
      symbol: String(t.symbol || "").trim().toUpperCase(),
      side: t.side === "short" ? "short" : t.side === "long" ? "long" : null,
      setup: String(t.setup || "").trim(),
      emotion: String(t.emotion || "").trim(),
      grade: t.grade || null,
      followedPlan: t.followedPlan == null ? null : !!t.followedPlan,
      kept: Array.isArray(t.kept) ? t.kept : [],
      mistakes: Array.isArray(t.mistakes) ? t.mistakes : [],
      pnl,
      r,
      risk: r != null && Math.abs(r) >= 0.1 && pnl ? Math.abs(pnl / r) : null,
      size: size != null && size > 0 ? size : null,
      held,
    });
  });
  return out.sort((a, b) => a.at - b.at || a.seq - b.seq);
}

export const SCOPES = [
  { id: "all", label: "All time", days: null },
  { id: "90", label: "90 days", days: 90 },
  { id: "30", label: "30 days", days: 30 },
];
export function inScope(trades, scope = "all", now = Date.now()) {
  const s = SCOPES.find((x) => x.id === scope) || SCOPES[0];
  const until = dayKeyOf(now);
  if (!s.days) return trades.filter((t) => t.dayKey <= until);
  const from = dayKeyOf(now - (s.days - 1) * DAY);
  return trades.filter((t) => t.dayKey >= from && t.dayKey <= until);
}

// Trades grouped by New York day, each day oldest first
export function byDay(trades) {
  const days = new Map();
  for (const t of trades) {
    if (!days.has(t.dayKey)) days.set(t.dayKey, []);
    days.get(t.dayKey).push(t);
  }
  return [...days.entries()].map(([dayKey, list]) => ({ dayKey, list }));
}
