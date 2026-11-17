import { pairFills, withCarried } from "./pair.js";
import { cryptoSymbol } from "./symbols.js";
import { sideWords } from "./engine.js";
import { attachFunding } from "./funding.js";

export const PLATFORM = "hyperliquid-sync";
export const SOURCE = "sync";

const EPS = 1e-9;
const round = (n, dp = 6) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
const isSpot = (coin) => /^@\d+$/.test(coin) || coin.includes("/");

export function toFills(raw = []) {
  const out = [];
  for (const x of raw) {
    if (!x || typeof x.coin !== "string" || !x.coin.trim()) continue;
    const coin = x.coin.trim();
    if (isSpot(coin)) continue;
    const side = x.side === "B" ? "buy" : x.side === "A" ? "sell" : null;
    const qty = Math.abs(+x.sz), price = +x.px, time = new Date(+x.time);
    if (!side || !(qty > 0) || !Number.isFinite(price) || Number.isNaN(+time)) continue;
    const words = sideWords(x.dir);
    const fee = Number.isFinite(+x.fee) ? +x.fee : 0; // + paid, - rebate
    const start = x.startPosition == null || x.startPosition === "" ? NaN : +x.startPosition;
    const contract = cryptoSymbol(coin);
    const base = {
      key: `hl:${coin}:${x.tid}:${x.time}`, time, contract, side, qty, price, account: null, commission: fee, multiplier: 1,
      ...(typeof x.crossed === "boolean" ? { maker: !x.crossed } : {}),
      liquidated: !!x.liquidation || words.liquidated || /auto-?deleverag/i.test(String(x.dir ?? "")),
      ...(Number.isFinite(start) ? { startPosition: start } : {}),
    };
    const flip = /^(long|short)\s*>\s*(long|short)$/i.test(String(x.dir ?? "").trim());
    const closes = Math.abs(start);
    if (flip && Number.isFinite(start) && closes > EPS && closes < qty - EPS) {
      out.push({ ...base, qty: closes, commission: fee * (closes / qty), effect: "close" });
      out.push({ ...base, key: `${base.key}~2`, qty: round(qty - closes, 12), commission: fee * ((qty - closes) / qty), effect: "open", startPosition: 0, liquidated: false });
      continue;
    }
    out.push({ ...base, effect: words.effect });
  }
  return out;
}

export function toFunding(raw = []) {
  const out = [];
  for (const x of raw) {
    const d = x?.delta;
    if (!d || (d.type && d.type !== "funding") || typeof d.coin !== "string") continue;
    const amount = +d.usdc, time = new Date(+x.time);
    if (!Number.isFinite(amount) || amount === 0 || Number.isNaN(+time) || isSpot(d.coin.trim())) continue;
    out.push({ key: `hlf:${d.coin.trim()}:${x.time}`, time, contract: cryptoSymbol(d.coin), symbol: cryptoSymbol(d.coin), amount, account: null });
  }
  return out;
}

function fromBefore(fills, carriedContracts) {
  const kept = [], orphans = [];
  const byCoin = new Map();
  fills.forEach((f, i) => { const l = byCoin.get(f.contract); const x = { f, i }; if (l) l.push(x); else byCoin.set(f.contract, [x]); });
  for (const [coin, list] of byCoin) {
    if (carriedContracts.has(coin)) { kept.push(...list); continue; }
    list.sort((a, b) => a.f.time - b.f.time || a.i - b.i);
    let pos = null, clean = false;
    for (const x of list) {
      if (clean) { kept.push(x); continue; }
      if (pos == null) pos = Number.isFinite(x.f.startPosition) ? x.f.startPosition : 0;
      if (Math.abs(pos) <= EPS) { clean = true; kept.push(x); continue; }
      orphans.push(x.f);
      pos += (x.f.side === "buy" ? 1 : -1) * x.f.qty;
      if (Math.abs(pos) <= EPS || Math.sign(pos) !== Math.sign(pos - (x.f.side === "buy" ? 1 : -1) * x.f.qty)) clean = true;
    }
  }
  return { kept: kept.sort((a, b) => a.i - b.i).map((x) => x.f), orphans };
}

export function buildHyperliquid(raw = [], funding = [], { carried = [] } = {}) {
  const fresh = toFills(raw);
  const all = withCarried(fresh, carried.map((c) => ({ ...c, account: null })));
  const carriedFills = all.filter((f) => f.carried);
  const { kept, orphans: before } = fromBefore(fresh, new Set(carriedFills.map((f) => f.contract)));
  const paired = pairFills([...carriedFills, ...kept], { crypto: true });
  const { trades, open, unattached } = attachFunding(paired.trades, toFunding(funding), { open: paired.open });
  return { trades, open, orphans: [...before, ...paired.orphans], unattachedFunding: unattached };
}

export function positionsOf(state, { marks = {} } = {}) {
  const out = [];
  for (const a of state?.assetPositions || []) {
    const p = a?.position;
    if (!p || typeof p.coin !== "string") continue;
    const szi = +p.szi, entry = +p.entryPx;
    if (!Number.isFinite(szi) || Math.abs(szi) <= EPS || !(entry > 0)) continue;
    const size = Math.abs(szi);
    const lev = +(p.leverage?.value ?? p.leverage);
    const liq = p.liquidationPx == null || p.liquidationPx === "" ? NaN : +p.liquidationPx;
    const markGiven = +(marks[p.coin] ?? marks[cryptoSymbol(p.coin)]);
    const markFromValue = +p.positionValue / size;
    const mark = markGiven > 0 ? markGiven : markFromValue > 0 ? markFromValue : null;
    const liqPrice = liq > 0 ? liq : null;
    const ref = mark ?? entry;
    out.push({
      symbol: cryptoSymbol(p.coin), side: szi > 0 ? "long" : "short", size, entry,
      leverage: lev > 0 ? lev : null, liqPrice,
      ...(mark != null ? { markPrice: round(mark, 8) } : {}),
      distancePct: liqPrice == null ? null : round((Math.abs(ref - liqPrice) / ref) * 100, 2),
    });
  }
  return out;
}
