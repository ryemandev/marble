import { pairFills, withCarried } from "./pair.js";

export const PLATFORM = "topstepx-sync";
export const SOURCE = "sync";

export function toFills(raw = []) {
  const out = [];
  for (const t of raw) {
    if (!t || t.voided) continue;
    const side = t.side === 0 ? "buy" : t.side === 1 ? "sell" : null;
    const qty = Math.abs(+t.size);
    const price = +t.price;
    const time = new Date(t.creationTimestamp);
    if (!side || !(qty > 0) || !Number.isFinite(price) || !t.contractId || Number.isNaN(+time)) continue;
    const pnl = t.profitAndLoss == null ? null : +t.profitAndLoss;
    out.push({
      key: `tsx:${t.id}`, time, contract: String(t.contractId), side, qty, price, account: null,
      commission: Math.abs(+t.fees || 0),
      effect: Number.isFinite(pnl) ? "close" : "open",
      ...(Number.isFinite(pnl) ? { pnl } : {}),
    });
  }
  return out;
}

export function buildSync(raw, { carried = [], points = {} } = {}) {
  return pairFills(withCarried(toFills(raw), carried.map((c) => ({ ...c, account: null }))), { points });
}

export const carriedFrom = (carried = []) => {
  const t = carried.map((c) => Date.parse(c.time)).filter(Number.isFinite);
  return t.length ? new Date(Math.min(...t)).toISOString() : null;
};

export function alreadyLogged(t, logged = []) {
  return logged.find((x) => x.source !== SOURCE && String(x.symbol).toUpperCase() === t.symbol && x.side === t.side && Math.abs(Date.parse(x.traded_at) - +new Date(t.opened)) <= 120000) || null;
}

export const openChanged = (before = [], after = []) => {
  const a = new Set(before.map((x) => x.key)), b = new Set(after.map((x) => x.key));
  return a.size !== b.size || [...a].some((k) => !b.has(k));
};

export function kindOf(name = "") {
  const n = String(name).toUpperCase();
  if (/PRAC/.test(n)) return "Paper";
  if (/XFA|EXPRESS|FUNDED/.test(n)) return "Funded";
  if (/LIVE/.test(n)) return "Live";
  if (/COMBINE|\bTC\b|TC-|EVAL|^\d+K/.test(n)) return "Evaluation";
  return null;
}

// "2 min ago" for the sync status
export function agoLabel(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
