import { pointValueOf, rootOf } from "../live/import/symbols.js";

// Limits the database holds trades to
export const LIMITS = { symbol: 16, note: 4000, r: 1e5 };

const FX = { EURUSD: 100000, GBPUSD: 100000, AUDUSD: 100000, NZDUSD: 100000 };

export function parseNum(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/[$£€\s]/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""); // 21.000,50 or 21,000.50
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ""); // 21,000 (thousands)
  else if ((s.match(/,/g) || []).length === 1) s = s.replace(",", "."); // 21000,5 (a decimal comma)
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const n = +s;
  return neg ? -n : n;
}
const given = (n) => n != null && !Number.isNaN(n);

export function pointValueFor(symbol, remembered = {}) {
  const raw = String(symbol || "").trim().toUpperCase();
  if (!raw) return null;
  if (FX[raw.replace(/[/\s]/g, "")]) return FX[raw.replace(/[/\s]/g, "")];
  const root = rootOf(raw);
  return pointValueOf(root) ?? (remembered[raw] != null ? +remembered[raw] : remembered[root] != null ? +remembered[root] : null);
}

export function workOut(f, { remembered = {}, fees = 0, pointValue: given_pv = null, fromFile = false, rOptional = false } = {}) {
  const entry = parseNum(f.entry), stop = parseNum(f.stop), exit = parseNum(f.exit), size = parseNum(f.size);
  const typedR = parseNum(f.r), typedPnl = parseNum(f.pnl), typedPv = parseNum(f.pointValue);
  const errors = {};
  const symbol = String(f.symbol || "").trim().toUpperCase();
  if (!symbol) errors.symbol = "Add the symbol";
  else if (symbol.length > LIMITS.symbol) errors.symbol = `${LIMITS.symbol} characters at most`;
  for (const [k, v] of [["entry", entry], ["stop", stop], ["exit", exit]]) if (Number.isNaN(v)) errors[k] = "Not a number";
  if (Number.isNaN(size)) errors.size = "Not a number";
  else if (size != null && size <= 0) errors.size = "More than 0";
  if (!/^\d{1,2}:\d{2}$/.test(f.time || "") || +f.time.split(":")[0] > 23 || +f.time.split(":")[1] > 59) errors.time = "A time like 09:41";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || "")) errors.date = "Pick the day";
  if (String(f.note || "").length > LIMITS.note) errors.note = `${LIMITS.note.toLocaleString("en-US")} characters at most`;

  const dir = f.side === "short" ? -1 : 1;
  const priced = given(entry) && given(stop) && given(exit);
  const costed = given(entry) && given(exit); // enough for the dollars: the stop only adds the R
  if (priced && entry === stop) errors.stop = "The stop can't be the entry";
  else if (priced && (stop - entry) * dir > 0) errors.stop = f.side === "short" ? "For a short, the stop sits above the entry" : "For a long, the stop sits below the entry";
  const pointValue = given_pv ?? pointValueFor(symbol, remembered) ?? (given(typedPv) && typedPv > 0 ? typedPv : null);
  const needsPointValue = costed && !fromFile && given_pv == null && pointValueFor(symbol, remembered) == null;
  if (needsPointValue && Number.isNaN(typedPv)) errors.pointValue = "Not a number";
  else if (needsPointValue && given(typedPv) && typedPv <= 0) errors.pointValue = "More than 0";

  const pricedOk = priced && !errors.stop;
  const r = pricedOk ? ((exit - entry) * dir) / Math.abs(entry - stop) : given(typedR) ? typedR : null;
  if (!pricedOk && Number.isNaN(typedR)) errors.r = "Not a number";
  if (r != null && Math.abs(r) >= LIMITS.r) errors.r = "That R is out of range";
  const worked = costed && !errors.stop && !fromFile && pointValue != null;
  let pnl;
  if (worked) pnl = (exit - entry) * dir * (given(size) && size > 0 ? size : 1) * pointValue - fees;
  else pnl = given(typedPnl) ? typedPnl : null;
  if (!worked && Number.isNaN(typedPnl)) errors.pnl = "Not a number";
  if (pnl != null) pnl = Math.round(pnl * 100) / 100; // to the cent
  if (pnl != null && Math.abs(pnl) >= 1e10) errors.pnl = "That's out of range";

  const missing = [];
  if (r == null && !rOptional && !errors.r && !errors.stop) missing.push("entry, stop and exit, or the result in R");
  if (pnl == null && !errors.pnl && !errors.pointValue) missing.push(needsPointValue ? "the dollars per point" : "the dollars");
  return { entry, stop, exit, size, r: r == null ? null : Math.round(r * 100) / 100, pnl, priced, worked, pointValue, needsPointValue, errors, missing, valid: !Object.keys(errors).length && (r != null || rOptional) && pnl != null };
}

/* ---------- Logging by hand, dollars first ---------- */

// The dollars as the form holds them: an amount typed without its sign, and the sign from the + and − buttons.
// Empty stays empty. Anything that isn't a number is handed on as typed, so it's reported and never guessed at.
export function signedDollars(amount, sign) {
  const raw = String(amount ?? "").trim();
  if (!raw) return "";
  const n = parseNum(raw);
  return n == null || Number.isNaN(n) ? raw : String((sign < 0 ? -1 : 1) * Math.abs(n));
}

// A sign typed into the box moves the buttons, and the box keeps the amount alone
export function splitDollars(text, sign) {
  const typed = /^\s*([+−-])/.exec(String(text));
  return { amount: String(text).replace(/^\s*[+−-]\s*/, ""), sign: typed ? (typed[1] === "+" ? 1 : -1) : sign < 0 ? -1 : 1 };
}

// Whether a trade holds more than its symbol, side and dollars. An edit of one opens with the detail showing.
export function hasDetail(t) {
  if (!t) return false;
  const filled = (v) => v != null && String(v).trim() !== "";
  return ["entry", "exit", "stop", "setup", "emotion", "note", "leverage", "funding"].some((k) => filled(t[k])) || t.followedPlan != null || (Array.isArray(t.kept) && t.kept.length > 0);
}

// The trader's own review of a trade: by the plan or not, the checklist ticks, and the grade those give. The grade
// comes from the plan alone, never from R. On an edit where the review wasn't touched, all three stay exactly as
// they were saved, whatever the form would have worked out today.
export function reviewOf({ trade = null, touched = false, rules = [], kept = null, plan = "" }) {
  if (trade && !touched) return { followedPlan: trade.followedPlan ?? null, grade: trade.grade ?? null, kept: Array.isArray(trade.kept) ? trade.kept : [] };
  const answered = rules.length > 0 && Array.isArray(kept) && kept.length === rules.length;
  const ticks = answered ? kept.map(Boolean) : [];
  const all = ticks.every(Boolean);
  const followedPlan = rules.length ? (answered ? all : null) : plan === "yes" ? true : plan === "no" ? false : null;
  const grade = followedPlan == null ? null : rules.length && !all ? (ticks.filter(Boolean).length * 2 >= ticks.length ? "B" : "C") : followedPlan ? "A" : "C";
  return { followedPlan, grade, kept: ticks };
}
