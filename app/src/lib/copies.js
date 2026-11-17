export const NEAR = { openMs: 15e3, closeMs: 20e3, price: 0.0003, r: 0.25 };

const num = (v) => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);
const cents = (n) => Math.round(n * 100) / 100;
const near = (a, b, rel) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * rel;
const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

function info(t, i) {
  const open = t?.traded_at ? Date.parse(t.traded_at) : NaN;
  if (!t || t.id == null || !t.account || !Number.isFinite(open)) return null;
  const close = t.closedAt ? Date.parse(t.closedAt) : NaN;
  return {
    t, i, id: t.id, account: t.account, open, close: Number.isFinite(close) ? close : null,
    symbol: String(t.symbol || "").trim().toUpperCase(), side: t.side,
    entry: num(t.entry), exit: num(t.exit), r: num(t.r), pnl: num(t.pnl) ?? 0,
  };
}

// Are these two the same trade on two accounts?
export function alike(a, b, n = NEAR) {
  if (!a || !b || a.account === b.account || !a.symbol || a.symbol !== b.symbol || a.side !== b.side) return false;
  if (Math.abs(a.open - b.open) > n.openMs) return false;
  if (a.close != null && b.close != null && Math.abs(a.close - b.close) > n.closeMs) return false;
  const priced = a.entry != null && b.entry != null && a.exit != null && b.exit != null;
  if (priced) return near(a.entry, b.entry, n.price) && near(a.exit, b.exit, n.price);
  if (sign(a.pnl) !== sign(b.pnl)) return false;
  return a.r == null || b.r == null || Math.abs(a.r - b.r) <= n.r;
}

export function findCopies(trades = [], n = NEAR) {
  const xs = trades.map(info).filter(Boolean).sort((a, b) => a.open - b.open || a.i - b.i);
  const of = new Map();
  const groups = [];
  for (let i = 0; i < xs.length; i++) {
    const lead = xs[i];
    if (of.has(lead.id)) continue;
    const members = [lead];
    const accounts = new Set([lead.account]);
    for (let j = i + 1; j < xs.length && xs[j].open - lead.open <= n.openMs; j++) {
      const c = xs[j];
      if (of.has(c.id) || accounts.has(c.account) || !alike(lead, c, n)) continue;
      members.push(c);
      accounts.add(c.account);
    }
    if (members.length < 2) continue;
    const g = { id: lead.id, ids: members.map((m) => m.id), accounts: [...accounts] };
    groups.push(g);
    for (const m of members) of.set(m.id, g);
  }
  return { groups, of };
}
const NO_COPIES = { groups: [], of: new Map() };

export function copiesAmong(fresh = [], journal = [], n = NEAR) {
  const xs = journal.map(info).filter(Boolean).sort((a, b) => a.open - b.open);
  const out = new Map();
  fresh.forEach((t, i) => {
    const a = info(t, i);
    if (!a) return;
    let lo = 0, hi = xs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid].open < a.open - n.openMs) lo = mid + 1; else hi = mid; }
    const found = [];
    const seen = new Set();
    for (let j = lo; j < xs.length && xs[j].open <= a.open + n.openMs; j++) {
      if (!seen.has(xs[j].account) && alike(a, xs[j], n)) { found.push(xs[j].t); seen.add(xs[j].account); }
    }
    if (found.length) out.set(t.id, found);
  });
  return out;
}

const REVIEW = ["setup", "grade", "emotion", "followedPlan", "note"];
const same = (a, b) => (a ?? null) === (b ?? null) || (a === "" && b == null) || (a == null && b === "");

export function combine(members, g = null) {
  const [lead] = members;
  if (members.length < 2) return lead;
  const total = (k) => { const xs = members.map((m) => num(m[k])).filter((v) => v != null); return xs.length ? cents(xs.reduce((a, v) => a + v, 0)) : null; };
  const rs = members.map((m) => num(m.r)).filter((v) => v != null);
  const mixed = REVIEW.filter((k) => members.some((m) => !same(m[k], lead[k])));
  return {
    ...lead,
    pnl: total("pnl") ?? 0,
    commission: total("commission"),
    size: total("size") ?? lead.size,
    r: rs.length ? cents(rs.reduce((a, v) => a + v, 0) / rs.length) : null,
    needsReview: members.some((m) => m.needsReview),
    account: null,
    accounts: members.map((m) => m.account),
    mixed,
    copies: { n: members.length, ids: members.map((m) => m.id), members, group: g?.id ?? lead.id },
  };
}

export function fold(trades = [], copies = NO_COPIES) {
  if (!copies.groups.length) return trades;
  const byId = new Map(trades.map((t) => [t.id, t]));
  const out = [];
  const done = new Set();
  for (const t of trades) {
    const g = copies.of.get(t.id);
    if (!g) { out.push(t); continue; }
    if (done.has(g.id)) continue;
    done.add(g.id);
    const members = g.ids.map((id) => byId.get(id)).filter((m) => m && !m.copies);
    out.push(members.length > 1 ? combine(members, g) : members[0] || t);
  }
  return out;
}

export const VIEWS = [["combined", "Combined"], ["each", "Per account"]];
export const DEFAULT_VIEW = { mode: "combined", account: null };
export function counted(trades = [], copies = NO_COPIES, view = DEFAULT_VIEW) {
  if (view?.mode === "each") return view.account ? trades.filter((t) => t.account === view.account) : trades;
  return fold(trades, copies);
}

export function reviewFrom(lead, copy) {
  const out = { ...copy, setup: lead.setup, grade: lead.grade, emotion: lead.emotion, followedPlan: lead.followedPlan, kept: lead.kept || [], mistakes: lead.mistakes || [], note: lead.note, needsReview: false };
  const stop = num(lead.stop), entry = num(copy.entry), exit = num(copy.exit);
  if (stop != null && entry != null && exit != null && entry !== stop) {
    const dir = copy.side === "short" ? -1 : 1;
    if ((stop - entry) * dir < 0) { out.stop = lead.stop; out.r = cents(((exit - entry) * dir) / Math.abs(entry - stop)); }
  } else if (num(copy.r) == null && num(lead.r) != null) out.r = num(lead.r);
  return out;
}
