import { statsFor } from "../data.js";
import { DOW, pad } from "./basics.js";

// The playbook as a book: one chapter for each setup with written rules, and a blank one for each
// setup traded without them. A chapter's own words (why it works, when it's run) have limits the
// form, the sync and the database all keep to.
export const THESIS_MAX = 280;
export const WHEN_MAX = 4;
export const WHEN_LEN = 40;
export const RULES_MAX = 6;

const NUMERALS = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function roman(n) {
  let left = Math.floor(n), out = "";
  if (!(left > 0 && left < 4000)) return String(n);
  for (const [v, s] of NUMERALS) while (left >= v) { out += s; left -= v; }
  return out;
}

// Characters counted, and cut, the way the database counts them: an emoji is one, never split in two
export const charCount = (text) => Array.from(String(text ?? "")).length;
const clip = (text, n) => Array.from(text).slice(0, n).join("");

// Why it works: one paragraph
export const cleanThesis = (text) => clip(String(text ?? "").replace(/\s+/g, " ").trim(), THESIS_MAX);

// When it's run: a few short lines ("10:00–13:00 NY", "NQ · ES"), each once
export function cleanWhen(list) {
  const lines = (Array.isArray(list) ? list : String(list ?? "").split("\n"))
    .map((x) => clip(String(x ?? "").replace(/\s+/g, " ").trim(), WHEN_LEN))
    .filter(Boolean);
  return lines.filter((x, i) => lines.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).slice(0, WHEN_MAX);
}

// Every chapter in reading order: the written ones, then setups traded without rules
export function chaptersOf(strategies, setups, trades) {
  const written = strategies.map((s, i) => ({ key: s.id, n: i + 1, strategy: s, setup: s.setup, name: s.name || s.setup }));
  const have = new Set(strategies.map((s) => s.setup));
  const blank = setups
    .filter((name) => !have.has(name) && trades.some((t) => t.setup === name))
    .map((name) => ({ key: `blank:${name}`, n: null, strategy: null, setup: name, name }));
  return [...written, ...blank];
}

const hasR = (t) => t.r != null && t.r !== "" && Number.isFinite(+t.r);
const byId = (a, b) => String(a.id).localeCompare(String(b.id));

// A chapter's proof from the journal: its numbers, its best trade (one that kept the plan when there
// is one), its worst loss, and the hour it does worst in (of hours with two trades or more, when
// there are two such hours to compare)
export function chapterOf(setup, trades) {
  const ts = trades.filter((t) => t.setup === setup);
  const stats = statsFor(setup, trades);
  const ranked = ts.some(hasR);
  const score = ranked ? (t) => +t.r : (t) => +t.pnl || 0;
  const pool = ranked ? ts.filter(hasR) : ts;
  const wins = pool.filter((t) => score(t) > 0);
  const kept = wins.filter((t) => t.followedPlan !== false);
  const best = [...(kept.length ? kept : wins)].sort((a, b) => score(b) - score(a) || byId(a, b))[0] || null;
  const worst = pool.filter((t) => score(t) < 0).sort((a, b) => score(a) - score(b) || byId(a, b))[0] || null;

  const hours = new Map();
  for (const t of ts) {
    if (!hasR(t) || !Number.isInteger(t.hour)) continue;
    const h = hours.get(t.hour) || { hour: t.hour, n: 0, sum: 0 };
    h.n += 1; h.sum += +t.r;
    hours.set(t.hour, h);
  }
  const busy = [...hours.values()].filter((h) => h.n >= 2).map((h) => ({ hour: h.hour, n: h.n, r: h.sum / h.n }));
  const weakest = busy.length >= 2 ? busy.sort((a, b) => a.r - b.r || a.hour - b.hour)[0] : null;

  return { stats, best, worst, weak: weakest && weakest.r < stats.exp ? weakest : null, ranked };
}

// "Tue 20 Oct · 11:49"
export function whenTraded(t) {
  const day = t.weekday != null && t.day ? `${DOW[t.weekday]} ${t.day} ${String(t.date).split(" ")[0]}` : t.date || "";
  return [day, t.time].filter(Boolean).join(" · ");
}
export const hourName = (h) => `${pad(h)}:00`;

// The manual as plain text, to paste anywhere: each chapter's words and rules, never its numbers
export function manualText(chapters) {
  const parts = chapters.filter((c) => c.strategy).map((c) => {
    const s = c.strategy;
    const when = cleanWhen(s.whenRun);
    return [
      `${roman(c.n)}. ${c.name}`,
      cleanThesis(s.thesis) && `"${cleanThesis(s.thesis)}"`,
      when.length > 0 && `When I run it: ${when.join(" · ")}`,
      ...(s.rules || []).map((r, i) => `${i + 1}. ${r}`),
    ].filter(Boolean).join("\n");
  });
  return ["My playbook", ...parts, "Written in Marble · trademarble.app"].join("\n\n");
}
