import { parseNum } from "../../lib/trade.js";
import { accountTitle, firmOf } from "../../live/firms.js";
import { MON as MONTHS } from "../../lib/basics.js";

export const FEE_KINDS = ["eval", "reset", "activation", "data", "other"];
export const KINDS = [...FEE_KINDS, "payout"];
export const KIND_LABEL = { eval: "Evaluation", reset: "Reset", activation: "Activation", data: "Data fee", other: "Other fee", payout: "Payout" };
export const CURRENCIES = ["USD", "GBP", "EUR"];
export const SYMBOL = { GBP: "£", USD: "$", EUR: "€" };
const MAX_AMOUNT = 1_000_000;
export const NOTE_MAX = 140;

export const isPayout = (e) => e?.kind === "payout";

/* ---------- Amounts ---------- */

export function toMinor(text) {
  const n = parseNum(text);
  if (n == null) return null;
  if (Number.isNaN(n) || n <= 0 || n > MAX_AMOUNT) return NaN;
  const minor = Math.round(n * 100);
  if (Math.abs(minor - n * 100) > 1e-6) return NaN; // 49.999 isn't a price anyone paid
  return minor;
}

// 124050 → "1,240.50" (two places, always: it's a receipt)
const TWO = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const plain = (minor) => TWO.format(Math.abs(minor) / 100);
export function money(minor, currency = "USD", { sign = false } = {}) {
  const s = sign ? (minor > 0 ? "+" : minor < 0 ? "−" : "") : minor < 0 ? "−" : "";
  return `${s}${SYMBOL[currency] ?? `${currency} `}${plain(minor)}`;
}
export const typed = (minor) => (minor % 100 ? (minor / 100).toFixed(2) : String(minor / 100));

/* ---------- Dates ---------- */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isDay = (d) => {
  const m = DAY.exec(d || "");
  if (!m) return false;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
};
export function dayLabel(d, { year = true, pad = false } = {}) {
  const m = DAY.exec(d || "");
  if (!m) return "";
  const day = pad ? m[3] : String(+m[3]);
  return `${day} ${MONTHS[+m[2] - 1]}${year ? ` ${m[1]}` : ""}`;
}

/* ---------- Firms and accounts ---------- */

export const firmKey = (firm) => {
  const f = firmOf(firm);
  return f ? f.slug : String(firm || "").trim().toLowerCase();
};
const SHORT = {
  apex: "Apex", myfundedfutures: "MFFU", "take-profit-trader": "Take Profit", "elite-trader-funding": "Elite", "funded-futures-network": "FFN",
  goat: "Goat", "alpha-capital": "Alpha Capital", "interactive-brokers": "IBKR",
};
export const firmName = (firm) => { const f = firmOf(firm); return f ? SHORT[f.slug] || f.name : String(firm || "").trim(); };
export const accountName = (a) => (a ? (firmOf(a.firm) ? [firmName(a.firm), a.label].filter(Boolean).join(" ") : accountTitle(a)) : "");

const accountFor = (e, byId) => (e.account ? byId?.[e.account] || e.acct || null : null);

// Where an account stands, in the receipt's words
function accountState(a) {
  if (!a) return "";
  if (a.archived) return "Archived";
  const k = String(a.status || a.kind || "").toLowerCase();
  if (k.startsWith("fund")) return "Funded";
  if (k.startsWith("eval")) return "In eval";
  if (k.startsWith("paper")) return "Paper";
  if (k.startsWith("live")) return "Live";
  return "";
}

export function pick(entries, { period = "year", show = "all", today }) {
  const t = today || "9999-12-31";
  return (entries || []).filter((e) => {
    if (period === "month" && e.day.slice(0, 7) !== t.slice(0, 7)) return false;
    if (period === "year" && e.day.slice(0, 4) !== t.slice(0, 4)) return false;
    if (show.startsWith("firm:") && firmKey(e.firm) !== show.slice(5)) return false;
    if (show.startsWith("acct:") && e.account !== show.slice(5)) return false;
    return true;
  });
}

export function span(entries, period, today) {
  const year = today.slice(0, 4), first = [...(entries || [])].map((e) => e.day).sort()[0];
  const from = period === "month" ? `${today.slice(0, 7)}-01` : period === "year" ? `${year}-01-01` : first && first < today ? first : today;
  return { from, to: today };
}
export function spanLabel({ from, to }) {
  return from.slice(0, 4) === to.slice(0, 4) ? `${dayLabel(from, { year: false })} – ${dayLabel(to)}` : `${dayLabel(from)} – ${dayLabel(to)}`;
}

export const byDay = (a, b) => a.day.localeCompare(b.day) || (isPayout(a) - isPayout(b)) || String(a.at ?? a.id).localeCompare(String(b.at ?? b.id));

/* ---------- The totals ---------- */

function sumOne(list, currency) {
  let fees = 0, paid = 0, run = 0, since = null;
  const days = [...list].sort(byDay);
  for (let i = 0; i < days.length; i++) {
    const e = days[i];
    if (isPayout(e)) paid += e.minor; else fees += e.minor;
    run += isPayout(e) ? e.minor : -e.minor;
    // The running total is read at the end of each day
    if (days[i + 1]?.day === e.day) continue;
    if (run > 0) since ??= e.day; else since = null;
  }
  return { currency, fees, paid, net: paid - fees, count: list.length, multiple: fees > 0 ? paid / fees : null, aheadSince: paid - fees > 0 ? since : null };
}

export function totals(entries) {
  const groups = new Map();
  for (const e of entries || []) {
    if (!groups.has(e.currency)) groups.set(e.currency, []);
    groups.get(e.currency).push(e);
  }
  const order = (c) => (CURRENCIES.indexOf(c) + 1 || 99);
  return [...groups.entries()].map(([c, list]) => sumOne(list, c)).sort((a, b) => b.count - a.count || order(a.currency) - order(b.currency));
}

// "2.5×": one decimal, with no ".0" on a whole number
export const timesLabel = (m) => (m == null ? "" : `${Math.round(m * 10) / 10}×`);

export function sections(entries, byId) {
  const out = new Map();
  for (const e of [...(entries || [])].sort(byDay)) {
    const a = accountFor(e, byId);
    const key = e.account ? `acct:${e.account}` : `firm:${firmKey(e.firm)}`;
    if (!out.has(key)) {
      out.set(key, { key, account: e.account || null, firm: e.firm, name: a ? accountName(a) || firmName(e.firm) : firmName(e.firm), state: accountState(a), entries: [], fees: {}, paid: {} });
    }
    const g = out.get(key);
    g.entries.push(e);
    const side = isPayout(e) ? g.paid : g.fees;
    side[e.currency] = (side[e.currency] || 0) + e.minor;
  }
  return [...out.values()];
}

export function firmsOf(entries) {
  const seen = new Map();
  for (const e of [...(entries || [])].sort(byDay)) if (!seen.has(firmKey(e.firm))) seen.set(firmKey(e.firm), firmName(e.firm));
  return [...seen.entries()].map(([key, name]) => ({ key, name }));
}

/* ---------- Checking an entry before it's saved ---------- */

export function checkEntry(f, { today }) {
  const errors = {};
  const firm = String(f.firm || "").trim();
  if (!firm) errors.firm = "Pick the firm, or type its name";
  else if (firm.length > 60) errors.firm = "60 characters at most";
  if (!KINDS.includes(f.kind)) errors.kind = "Pick what it was for";
  const minor = toMinor(f.amount);
  if (minor == null) errors.amount = "The amount";
  else if (Number.isNaN(minor)) errors.amount = `An amount above 0 and up to ${MAX_AMOUNT.toLocaleString("en-GB")}`;
  if (!CURRENCIES.includes(f.currency)) errors.currency = "Pick a currency";
  if (!isDay(f.day)) errors.day = "A date";
  else if (today && f.day > today) errors.day = "That's in the future";
  else if (f.day < "2000-01-01") errors.day = "That's too long ago";
  const note = String(f.note || "").trim();
  if (note.length > NOTE_MAX) errors.note = `${NOTE_MAX} characters at most`;
  const entry = { firm, account: f.account || null, kind: f.kind, minor: Number.isNaN(minor) ? null : minor, currency: f.currency, day: f.day, note };
  return { entry, errors, ok: !Object.keys(errors).length };
}

export function lastAmount(entries, firm, kind) {
  const k = firmKey(firm);
  const hit = [...(entries || [])].sort(byDay).reverse().find((e) => e.kind === kind && firmKey(e.firm) === k);
  return hit ? { minor: hit.minor, currency: hit.currency } : null;
}
