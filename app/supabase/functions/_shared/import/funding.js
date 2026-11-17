const round = (n, dp = 6) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
const up = (s) => String(s ?? "").trim().toUpperCase();
const at = (v) => (v instanceof Date ? +v : typeof v === "number" ? v : Date.parse(v));
const sameAccount = (a, b) => a == null || b == null || String(a) === String(b);

function index(list) {
  const byContract = new Map(), bySymbol = new Map();
  const add = (m, k, t) => { if (!k) return; const l = m.get(k); if (l) l.push(t); else m.set(k, [t]); };
  for (const t of list) { add(byContract, up(t.contract), t); add(bySymbol, up(t.symbol), t); }
  return { byContract, bySymbol };
}

export function attachFunding(trades = [], events = [], { open = [] } = {}) {
  const out = trades.map((t) => ({ ...t }));
  const held = open.map((o) => ({ ...o, fills: (o.fills || []).map((f) => ({ ...f })) }));
  const shut = index(out), live = index(held);
  const touched = new Set();
  const unattached = [];
  const pick = (ix, e, fits) => {
    const c = up(e.contract ?? e.symbol), s = up(e.symbol ?? e.contract);
    const hit = (ix.byContract.get(c) || []).filter(fits);
    return hit.length ? hit : (ix.bySymbol.get(s) || []).filter(fits);
  };
  for (const e of events) {
    const time = at(e.time), amount = +e.amount;
    if (!Number.isFinite(time) || !Number.isFinite(amount)) { unattached.push({ ...e, reason: "unreadable" }); continue; }
    const hit = pick(shut, e, (t) => sameAccount(t.account, e.account) && at(t.opened) <= time && time <= at(t.closed ?? t.opened));
    if (hit.length) {
      const t = hit.reduce((a, b) => (at(b.opened) < at(a.opened) ? b : a));
      if (t.fundingTo && time <= at(t.fundingTo)) continue; // counted on the carried position already
      t.funding = round((t.funding ?? 0) + amount);
      touched.add(t);
      continue;
    }
    const pos = pick(live, e, (o) => sameAccount(o.account, e.account) && at(o.opened) <= time);
    if (pos.length) {
      const o = pos.reduce((a, b) => (at(b.opened) < at(a.opened) ? b : a));
      const first = o.fills[0];
      if (!first) { unattached.push({ ...e, reason: "open" }); continue; }
      if (first.fundingTo && time <= at(first.fundingTo)) continue;
      first.funding = round((first.funding ?? 0) + amount);
      first.fundingTo = new Date(Math.max(time, first.fundingTo ? at(first.fundingTo) : -Infinity)).toISOString();
      o.funding = first.funding;
      continue;
    }
    unattached.push({ ...e, reason: "no trade" });
  }
  for (const t of touched) t.net = t.gross == null ? null : round(t.gross - (t.commission || 0) + t.funding);
  return { trades: out, open: held, unattached };
}

export function fundingUpdates(rows = [], events = []) {
  const trades = rows.filter((r) => r && r.id && r.traded_at).map((r) => ({
    id: r.id, account: null, contract: r.fills?.contract || r.symbol, symbol: r.symbol,
    opened: r.traded_at, closed: r.closed_at || r.traded_at,
    gross: r.fills?.gross ?? null, commission: +r.commission || 0, funding: null, net: null,
  }));
  const times = events.map((e) => at(e.time)).filter(Number.isFinite);
  const from = times.length ? Math.min(...times) : null, to = times.length ? Math.max(...times) : null;
  const { trades: out, unattached } = attachFunding(trades, events);
  const updates = out.filter((t) => t.funding != null).map((t) => ({
    id: t.id, funding: t.funding, ...(t.net != null ? { pnl: round(t.net, 6) } : {}),
    partial: at(t.opened) < from || at(t.closed) > to,
  }));
  return { updates, unattached };
}
