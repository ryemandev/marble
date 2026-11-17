import { SOURCES, feeOf, grossOf, sourceOf } from "./trail.js";
// Every trade as a spreadsheet, notes included, so a trader's record is theirs to keep. Each account's
// copy of a copied trade is its own row.

const round = (v) => Math.round(v * 100) / 100;
const BOM = String.fromCharCode(0xfeff); // so Excel reads it as UTF-8

const COLUMNS = [
  ["Date", (t) => t.dayKey || t.date], ["Time", (t) => t.time], ["Account", (t, x) => x.account(t)], ["Stage", (t, x) => x.stage(t)],
  ["Symbol", (t) => t.symbol], ["Side", (t) => t.side], ["Size", (t) => t.size], ["Entry", (t) => t.entry], ["Stop", (t) => t.stop], ["Exit", (t) => t.exit],
  ["Closed", (t) => t.closedAt], ["R", (t) => t.r], ["Before fees", (t) => round(grossOf(t))], ["Fees", (t) => feeOf(t).paid || null], ["Funding", (t) => t.funding], ["Net P&L", (t) => t.pnl],
  ["Fee status", (t) => ({ in: "Included", missing: "None reported", typed: "None entered" })[feeOf(t).status]], ["Source", (t) => SOURCES[sourceOf(t)]],
  ["Setup", (t) => t.setup], ["Grade", (t) => t.grade], ["Feeling", (t) => t.emotion], ["Mistakes", (t) => (t.mistakes || []).join("; ")], ["Followed plan", (t) => (t.followedPlan == null ? "" : t.followedPlan ? "Yes" : "No")], ["Note", (t) => t.note],
];

// Text a spreadsheet would run as a formula is kept as text
function cell(v) {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tradesCsv(trades, { account = () => "", stage = () => "" } = {}) {
  const x = { account, stage };
  const rows = [COLUMNS.map(([h]) => h), ...trades.map((t) => COLUMNS.map(([, f]) => f(t, x)))];
  return `${BOM}${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
