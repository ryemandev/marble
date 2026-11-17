// The one finding that matters: the part of the record that lost the most money, read from the trades
// alone. It only ever states what happened, and it stays silent until there are enough trades to say anything.
import { byDay } from "./oracle/prepare.js";
import { slotName } from "./oracle/questions.js";
import { hourSpan } from "./oracle/words.js";

export const NEED = 12; // trades before it speaks
export const MIN = 5; // trades a pattern needs

const sum = (ts) => ts.reduce((a, t) => a + t.pnl, 0);

function groupBy(ts, key) {
  const m = new Map();
  for (const t of ts) {
    const k = key(t);
    if (k == null || k === "") continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return m;
}

function patterns(ts) {
  const out = [];
  const add = (id, title, list, setup = null) => out.push({ id, title, list, setup });
  for (const [k, list] of groupBy(ts, (t) => `${t.weekday}|${t.minutes < 720 ? "morning" : "afternoon"}`)) {
    const [w, part] = k.split("|");
    add(`slot-${k}`, slotName(+w, part), list);
  }
  for (const [h, list] of groupBy(ts, (t) => t.hour)) add(`hour-${h}`, `The ${hourSpan(h)} hour`, list);
  for (const [s, list] of groupBy(ts, (t) => t.setup)) add(`setup-${s}`, `${s} trades`, list, s);
  for (const [s, list] of groupBy(ts, (t) => t.symbol)) add(`symbol-${s}`, `${s} trades`, list);
  for (const [s, list] of groupBy(ts, (t) => (t.symbol && t.side ? `${t.symbol} ${t.side}s` : null))) add(`side-${s}`, s, list);
  for (const [e, list] of groupBy(ts, (t) => t.emotion)) add(`feeling-${e}`, `Trades you tagged ${e}`, list);
  add("rules", "Trades off your plan", ts.filter((t) => t.followedPlan === false));
  const days = byDay(ts);
  add("after-loss", "Trades after the day's first loss", days.flatMap((d) => { const i = d.list.findIndex((t) => t.pnl < 0); return i < 0 ? [] : d.list.slice(i + 1); }));
  add("late", "The 4th trade of the day and later", days.flatMap((d) => d.list.slice(3)));
  return out;
}

const newest = (a, b) => b.at - a.at || b.seq - a.seq;

export function findLeak(ts) {
  if (ts.length < NEED) return { status: "short", have: ts.length, need: NEED };
  const lost = ts.reduce((a, t) => a + Math.min(0, t.pnl), 0);
  const seen = patterns(ts)
    .filter((p) => p.list.length >= MIN && new Set(p.list.map((t) => t.dayKey)).size >= 2)
    .map((p) => ({ ...p, net: sum(p.list) }))
    .filter((p) => p.net < 0)
    .sort((a, b) => a.net - b.net);
  if (!seen.length) return { status: "none", have: ts.length, need: NEED };
  const top = seen[0];
  return {
    status: "ok",
    id: top.id,
    title: top.title,
    setup: top.setup,
    net: top.net,
    n: top.list.length,
    won: top.list.filter((t) => t.pnl > 0).length,
    days: new Set(top.list.map((t) => t.dayKey)).size,
    share: lost < 0 ? Math.min(1, top.list.reduce((a, t) => a + Math.min(0, t.pnl), 0) / lost) : 0,
    ids: [...top.list].sort(newest).map((t) => t.id),
  };
}
