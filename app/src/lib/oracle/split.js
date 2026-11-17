import { hourSpan } from "./words.js";

// Ask's follow-up: the trades behind an answer, split one more way. Facts only, the costliest group first.
const NONE = "None tagged";
export const SPLITS = [
  { id: "setup", label: "Setup", of: (t) => [t.setup || NONE] },
  { id: "symbol", label: "Symbol", of: (t) => [t.symbol || NONE] },
  { id: "side", label: "Side", of: (t) => [t.side === "long" ? "Long" : t.side === "short" ? "Short" : NONE] },
  { id: "hour", label: "Hour", of: (t) => [hourSpan(t.hour)] },
  { id: "feeling", label: "Feeling", of: (t) => [t.emotion || NONE] },
  { id: "mistake", label: "Mistake", of: (t) => (t.mistakes?.length ? t.mistakes : [NONE]) },
];

export function splitBy(trades, id) {
  const how = SPLITS.find((s) => s.id === id);
  if (!how) return [];
  const rows = new Map();
  for (const t of trades) {
    for (const label of how.of(t)) {
      if (!rows.has(label)) rows.set(label, { label, n: 0, net: 0, ids: [] });
      const r = rows.get(label);
      r.n += 1; r.net += t.pnl; r.ids.push(t.id);
    }
  }
  return [...rows.values()].map((r) => ({ ...r, net: Math.round(r.net * 100) / 100 })).sort((a, b) => a.net - b.net || a.label.localeCompare(b.label));
}

// A split only helps when the trades fall into more than one group, and some of them carry the tag
export const splitsFor = (trades) => SPLITS.filter((s) => {
  const rows = splitBy(trades, s.id);
  return rows.length > 1 && rows.some((r) => r.label !== NONE);
});
