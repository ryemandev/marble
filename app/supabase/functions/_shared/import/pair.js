import { cryptoPointValue, cryptoSymbol, pointValueOf, rootOf } from "./symbols.js";

const EPS = 1e-9;
const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
export const roundPrice = (n) => (Math.abs(n) >= 1 || n === 0 ? round(n, 6) : +n.toPrecision(8));
const avg = (notional, qty, precise) => (qty > EPS ? (precise ? roundPrice(notional / qty) : round(notional / qty, 6)) : null);

export function uniqueFills(fills) {
  const seen = new Set(), out = [];
  for (const f of fills) { if (seen.has(f.key)) continue; seen.add(f.key); out.push(f); }
  return out;
}

export function pairFills(input, { points = {}, crypto = false } = {}) {
  const money = (n) => round(n, crypto ? 6 : 2);
  const fills = uniqueFills(input)
    .map((f, i) => ({ ...f, i }))
    // Oldest first; fills at the same moment keep the file's order
    .sort((a, b) => a.time - b.time || a.i - b.i);
  const books = new Map(); // account|contract -> { pos, lots, trade }
  const trades = [], orphans = [];

  const finish = (b) => {
    const t = b.trade;
    const pv = t.pointValue;
    const commission = money(t.commission);
    const fromFile = t.filePnl != null;
    const gross = fromFile ? money(t.filePnl) : pv == null ? null : money(t.grossPoints * pv);
    const funding = t.funding == null ? null : round(t.funding, 6);
    trades.push({
      key: `f:${t.contract}:${t.firstKey}`,
      account: t.account, contract: t.contract, symbol: t.root, side: t.side,
      size: round(t.entryQty, 6), entry: avg(t.entryNotional, t.entryQty, crypto), exit: avg(t.exitNotional, t.exitQty, crypto),
      opened: t.opened, closed: t.closed, holdMs: t.closed - t.opened,
      pointValue: pv, grossPoints: round(t.grossPoints, 6), gross, commission, pnlFromFile: fromFile,
      net: gross == null ? null : money(gross - commission + (funding ?? 0)),
      funding, feeMaker: t.makerKnown ? round(t.feeMaker, 6) : null, feeTaker: t.makerKnown ? round(t.feeTaker, 6) : null,
      leverage: t.leverage, liqPrice: t.liqPrice, liquidated: t.liquidated ? true : t.liqKnown ? false : null,
      ...(t.fundingTo != null ? { fundingTo: new Date(t.fundingTo).toISOString() } : {}),
      fills: t.fills, scaled: t.fills.filter((x) => x.role === "entry").length > 1, partial: t.fills.filter((x) => x.role === "exit").length > 1,
    });
    b.trade = null;
  };

  const take = (t, f, share) => {
    const fee = (f.commission || 0) * share;
    t.commission += fee;
    if (typeof f.maker === "boolean") { if (f.maker) t.feeMaker += fee; else t.feeTaker += fee; }
    else t.makerKnown = false;
    if (typeof f.liquidated === "boolean") t.liqKnown = true;
    if (Number.isFinite(f.funding)) t.funding = (t.funding ?? 0) + f.funding;
    if (f.fundingTo) { const at = Date.parse(f.fundingTo); if (Number.isFinite(at)) t.fundingTo = Math.max(t.fundingTo ?? -Infinity, at); }
  };

  for (const f of fills) {
    const id = `${f.account ?? ""}|${f.contract}`;
    const b = books.get(id) || { pos: 0, lots: [], trade: null };
    books.set(id, b);
    const sign = f.side === "buy" ? 1 : -1;
    let left = f.qty;
    const part = (qty, role, split = false) => ({
      key: split ? `${f.key}~2` : f.key, time: f.time.toISOString(), side: f.side, qty: round(qty, 6), price: f.price, commission: round((f.commission || 0) * (qty / f.qty), crypto ? 6 : 4), role,
      ...(typeof f.maker === "boolean" ? { maker: f.maker } : {}), ...(f.liquidated === true ? { liquidated: true } : {}),
    });

    if (Math.abs(b.pos) > EPS && Math.sign(b.pos) !== sign) {
      const t = b.trade;
      const dir = Math.sign(b.pos);
      const q = Math.min(left, Math.abs(b.pos));
      let need = q;
      while (need > EPS && b.lots.length) {
        const lot = b.lots[0];
        const n = Math.min(lot.qty, need);
        t.grossPoints += (f.price - lot.price) * n * dir;
        lot.qty -= n; need -= n;
        if (lot.qty <= EPS) b.lots.shift();
      }
      t.exitQty += q; t.exitNotional += f.price * q;
      take(t, f, q / f.qty);
      if (f.liquidated === true) t.liquidated = true;
      const p = part(q, "exit");
      t.fills.push(p);
      if (Number.isFinite(f.pnl)) {
        t.filePnl = (t.filePnl ?? 0) + f.pnl; // all of a fill's profit belongs to what it closed
        if (crypto) t.pnlByKey.set(p.key, (t.pnlByKey.get(p.key) || 0) + f.pnl);
      }
      t.closed = f.time;
      b.pos -= dir * q;
      left -= q;
      if (Math.abs(b.pos) <= EPS) { b.pos = 0; b.lots = []; finish(b); }
    } else if (Math.abs(b.pos) <= EPS && f.effect === "close") {
      orphans.push(f);
      continue;
    }

    if (left > EPS) {
      if (!b.trade) {
        const root = crypto ? cryptoSymbol(f.contract) : rootOf(f.contract);
        b.trade = {
          account: f.account ?? null, contract: f.contract, root, side: sign > 0 ? "long" : "short",
          firstKey: left < f.qty - EPS ? `${f.key}~2` : f.key,
          pointValue: f.multiplier > 0 ? f.multiplier : crypto ? cryptoPointValue(root, points) : pointValueOf(root, points), opened: f.time, closed: null, filePnl: null,
          entryQty: 0, entryNotional: 0, exitQty: 0, exitNotional: 0, grossPoints: 0, commission: 0, fills: [],
          feeMaker: 0, feeTaker: 0, makerKnown: true, liquidated: false, liqKnown: false, funding: null, fundingTo: null,
          leverage: null, liqPrice: null, pnlByKey: new Map(),
        };
      }
      const t = b.trade;
      b.lots.push({ qty: left, price: f.price });
      t.entryQty += left; t.entryNotional += f.price * left;
      take(t, left < f.qty - EPS && Number.isFinite(f.funding) ? { ...f, funding: undefined, fundingTo: undefined } : f, left / f.qty);
      if (t.leverage == null && f.leverage > 0) t.leverage = f.leverage;
      if (t.liqPrice == null && f.liqPrice > 0) t.liqPrice = f.liqPrice;
      const p = part(left, "entry", left < f.qty - EPS);
      t.fills.push(p);
      if (Number.isFinite(f.pnl) && left === f.qty) {
        t.filePnl = (t.filePnl ?? 0) + f.pnl;
        if (crypto && f.pnl) t.pnlByKey.set(p.key, (t.pnlByKey.get(p.key) || 0) + f.pnl);
      }
      b.pos += sign * left;
    }
  }

  const open = [];
  for (const b of books.values()) {
    if (!b.trade) continue;
    const t = b.trade;
    const carriesValue = t.pointValue && (crypto || !pointValueOf(t.root));
    open.push({
      account: t.account, contract: t.contract, symbol: t.root, side: t.side, qty: round(Math.abs(b.pos), 6),
      opened: t.opened,
      fills: t.fills.map((x, i) => ({
        key: x.key, time: x.time, contract: t.contract, side: x.side, qty: x.qty, price: x.price, commission: x.commission, account: t.account,
        ...(t.filePnl != null ? { pnl: crypto ? t.pnlByKey.get(x.key) || 0 : 0 } : {}), ...(carriesValue ? { multiplier: t.pointValue } : {}),
        ...(typeof x.maker === "boolean" ? { maker: x.maker } : {}), ...(x.liquidated ? { liquidated: true } : {}),
        ...(i === 0 && t.leverage != null ? { leverage: t.leverage } : {}), ...(i === 0 && t.liqPrice != null ? { liqPrice: t.liqPrice } : {}),
        ...(i === 0 && t.funding != null ? { funding: round(t.funding, 6) } : {}), ...(i === 0 && t.fundingTo != null ? { fundingTo: new Date(t.fundingTo).toISOString() } : {}),
      })),
    });
  }
  trades.sort((a, b) => a.opened - b.opened);
  return { trades, open, orphans };
}

export function withCarried(fills, carried = []) {
  const inFile = new Set(fills.map((f) => f.key));
  const covered = new Set(carried.filter((c) => inFile.has(c.key.replace(/~2$/, ""))).map((c) => `${c.account ?? ""}|${c.contract}`));
  const keep = carried
    .filter((c) => !covered.has(`${c.account ?? ""}|${c.contract}`))
    .map((c) => ({ ...c, time: new Date(c.time), carried: true }));
  return [...keep, ...fills];
}
