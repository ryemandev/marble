import { htmlRows, looksLikeHTML, parseCSV, parseNumber, sectionsOf, tableOf, usesDecimalComma } from "./csv.js";
import { STABLE, bestScore, norm } from "./presets.js";
import { pairFills, roundPrice, withCarried } from "./pair.js";
import { cryptoPointValue, cryptoSymbol, pointValueOf, rootOf } from "./symbols.js";
import { guessDateOrder, parseWhen, zoneOfHeader } from "./when.js";
import { attachFunding } from "./funding.js";

export { detect, mappingFor, mappingKey, PRESETS, FIELDS, presetById, CRYPTO_TEMPLATE_CSV } from "./presets.js";
export { attachFunding, fundingUpdates } from "./funding.js";

const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };

function bestSection(rows) {
  const tables = sectionsOf(rows).map((s) => ({ ...tableOf(s.rows), section: s.title }));
  if (!tables.length) return { headers: [], records: [], section: "" };
  return tables.reduce((best, t) => {
    const a = bestScore(best.headers), b = bestScore(t.headers);
    return b > a || (b === a && a === 0 && t.records.length > best.records.length) ? t : best;
  });
}

export function readTable(input) {
  if (typeof input === "string" && looksLikeHTML(input)) return { ...bestSection(htmlRows(input)), delimiter: null, decimalComma: false, format: "html" };
  if (typeof input === "string") {
    const { delimiter, rows } = parseCSV(input);
    const t = tableOf(rows);
    return { ...t, delimiter, decimalComma: usesDecimalComma(delimiter, t.records), format: "csv" };
  }
  const rows = input.map((r) => r.map((c) => (c == null ? "" : c)));
  return { ...bestSection(rows), delimiter: null, decimalComma: false, format: "sheet" };
}

const listOf = (spec) => (spec && typeof spec === "object" && !Array.isArray(spec) ? spec.join || spec.sum || spec.product : null);

// Reading one field of one row through a mapping
function reader(headers, decimalComma) {
  const idx = new Map();
  headers.forEach((h, i) => { const k = norm(h); if (!idx.has(k)) idx.set(k, i); });
  const col = (spec) => {
    if (spec == null || spec === "") return null;
    if (typeof spec === "string") return idx.has(norm(spec)) ? idx.get(norm(spec)) : null;
    if (Array.isArray(spec)) { for (const s of spec) { const i = col(s); if (i != null) return i; } return null; }
    if (spec.match) { const re = new RegExp(spec.match, "i"); const i = headers.findIndex((h) => re.test(String(h).trim())); return i < 0 ? null : i; }
    if (spec.nth) { const all = headers.map((h, i) => (norm(h) === norm(spec.nth[0]) ? i : -1)).filter((i) => i >= 0); return all[spec.nth[1] - 1] ?? null; }
    return null;
  };
  const raw = (row, spec) => {
    if (spec && typeof spec === "object" && !Array.isArray(spec)) {
      if (spec.join) return spec.join.map((s) => raw(row, s)).filter((x) => x !== "" && x != null);
      if (spec.sum) return spec.sum.map((s) => raw(row, s));
    }
    const i = col(spec);
    return i == null ? null : row[i];
  };
  const num = (row, spec) => {
    if (spec && typeof spec === "object" && !Array.isArray(spec) && spec.product) {
      const ns = spec.product.map((s) => num(row, s)).filter(Number.isFinite);
      return ns.length ? ns.reduce((a, b) => a * b, 1) : NaN;
    }
    const v = raw(row, spec);
    if (Array.isArray(v)) { const ns = v.map((x) => parseNumber(x, decimalComma)).filter(Number.isFinite); return ns.length ? ns.reduce((a, b) => a + b, 0) : NaN; }
    return parseNumber(v, decimalComma);
  };
  const text = (row, spec) => { const v = raw(row, spec); return v == null ? "" : String(Array.isArray(v) ? v.join(" ") : v).trim(); };
  const present = (spec) => {
    const list = listOf(spec);
    if (list) return list.some((s) => col(s) != null);
    return col(spec) != null;
  };
  const header = (spec) => { const i = col(spec && typeof spec === "object" && !Array.isArray(spec) && spec.join ? spec.join.at(-1) : spec); return i == null ? null : headers[i]; };
  return { raw, num, text, present, col, header };
}

export const sideOf = (v) => { const s = String(v ?? "").trim(); return /^(b|bot|bought|long|cover)$/i.test(s) || /^buy/i.test(s) ? "buy" : /^(s|sld|sold|short)$/i.test(s) || /^sell/i.test(s) ? "sell" : null; };
export const effectOf = (v) => {
  const s = String(v ?? "").trim();
  if (/^in\s*\/\s*out$/i.test(s) || /^c\s*;\s*o$/i.test(s)) return null; // a reversal: both at once (IBKR writes "C;O")
  return /^(c|x|exit|close|closing|out)$/i.test(s) || /^(exit|close|closing|out)\b/i.test(s) ? "close" : /^(o|e|entry|open|opening|in)$/i.test(s) ? "open" : null;
};

const NO_SIDE = [
  [/^auto[-\s]?deleverag(ing|e)$/i, "Auto-deleveraging with no buy or sell in the row, so it's left out"],
  [/^settlement$/i, "A settlement, not a trade"],
  [/^spot dust conversion$/i, "A spot dust conversion, not a trade"],
  [/^(backstop|partial) borrow liquidation$/i, "A borrow liquidation (spot margin), not a perp trade"],
];
export function sideWords(v) {
  let s = String(v ?? "").trim(), liquidated = false;
  const pre = /^(market order liquidation|backstop liquidation|liquidation)\s*:\s*/i.exec(s);
  if (pre) { liquidated = true; s = s.slice(pre[0].length).trim(); }
  s = s.replace(/\s*\(price improved\)$/i, "").trim();
  for (const [re, why] of NO_SIDE) if (re.test(s)) return { side: null, effect: null, liquidated, skip: why };
  let m = /^(open|close)\s+(long|short)$/i.exec(s);
  if (m) {
    const opens = /^open$/i.test(m[1]), long = /^long$/i.test(m[2]);
    return { side: opens === long ? "buy" : "sell", effect: opens ? "open" : "close", liquidated };
  }
  m = /^(long|short)\s*>\s*(long|short)$/i.exec(s);
  if (m && m[1].toLowerCase() !== m[2].toLowerCase()) return { side: /^long$/i.test(m[2]) ? "buy" : "sell", effect: null, liquidated };
  return { side: sideOf(s), effect: null, liquidated };
}

export function makerOf(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^(m|maker|true|yes|y|1|added( liquidity)?|add liquidity)$/.test(s) || /\bmaker\b/.test(s)) return true;
  if (/^(t|taker|false|no|n|0|removed( liquidity)?|remove liquidity)$/.test(s) || /\btaker\b/.test(s)) return false;
  return null;
}
function makerReader(spec) {
  if (typeof spec === "function") return (v) => { const x = spec(v); return typeof x === "boolean" ? x : null; };
  if (spec && (spec.maker || spec.taker)) {
    const m = spec.maker ? new RegExp(spec.maker, "i") : null, t = spec.taker ? new RegExp(spec.taker, "i") : null;
    return (v) => { const s = String(v ?? "").trim(); return m && m.test(s) ? true : t && t.test(s) ? false : null; };
  }
  return makerOf;
}

export function leverageOf(v, decimalComma = false) {
  const n = typeof v === "number" ? v : parseNumber(String(v ?? "").trim().replace(/^[x×]\s*/i, "").replace(/\s*[x×]$/i, ""), decimalComma);
  return n > 0 && n <= 1000 ? n : null;
}

function timeValues(records, r, specs) {
  const out = [];
  for (const row of records.slice(0, 400)) for (const s of specs) { const v = r.raw(row, s); out.push(Array.isArray(v) ? v[0] : v); }
  return out.filter((v) => typeof v === "string");
}
function when(r, row, spec, opts) {
  const v = r.raw(row, spec);
  if (Array.isArray(v)) return parseWhen(v.join(" "), opts) || parseWhen(v[v.length - 1], opts);
  return parseWhen(v, opts);
}

function counter() {
  const seen = new Map();
  return (base) => { const n = (seen.get(base) || 0) + 1; seen.set(base, n); return n === 1 ? base : `${base}#${n}`; };
}

function feeSignOf(mapping, r, records, f) {
  const mode = mapping.feeSign === "cost" ? "cost" : mapping.feesSigned ? "negative" : "abs";
  const check = mapping.feeSignFrom;
  if (!check || !f.commission || !r.present(check.total)) return mode;
  let cost = 0, negative = 0;
  for (const row of records.slice(0, 2000)) {
    const fee = r.num(row, f.commission), total = r.num(row, check.total);
    if (!Number.isFinite(fee) || !Number.isFinite(total) || fee === 0) continue;
    const parts = (check.parts || []).map((p) => r.num(row, p)).filter(Number.isFinite).reduce((a, b) => a + b, 0);
    const tol = 1e-6 + Math.abs(total) * 1e-9;
    if (Math.abs(total - (parts + fee)) <= tol) negative++;
    else if (Math.abs(total - (parts - fee)) <= tol) cost++;
  }
  return negative > cost ? "negative" : cost > negative ? "cost" : mode;
}

export function zoneHint(preset, headers) {
  if (preset.tzFromHeader) {
    const h = reader(headers, false).header(preset.fields.time ?? preset.fields.entryTime);
    const z = zoneOfHeader(h);
    if (z) return { zone: z, from: "header" };
  }
  if (preset.tz) return { zone: preset.tz, from: "platform" };
  return { zone: null, ask: !!preset.serverTime };
}

export function build(table, mapping, opts = {}) {
  const { headers, records, decimalComma } = table;
  const r = reader(headers, decimalComma);
  const f = mapping.fields || {};
  const isCrypto = mapping.world === "crypto";
  const money = (n) => round(n, isCrypto ? 6 : 2);
  const symbolOf = (contract) => (isCrypto ? cryptoSymbol(contract) : rootOf(contract));
  const valueOf = (root) => (isCrypto ? cryptoPointValue(root, points) : pointValueOf(root, points));
  const timeSpecs = mapping.shape === "roundtrip" ? [f.entryTime, f.exitTime] : mapping.shape === "pairs" ? [f.buyTime, f.sellTime] : [f.time];
  const dates = guessDateOrder(timeValues(records, r, timeSpecs.filter(Boolean)));
  const tOpts = { tz: opts.tz || "local", order: opts.order || dates.order };
  const points = opts.points || {};
  const skipped = [];
  const skip = (i, reason) => skipped.push({ row: i + 1, reason });
  const feeSign = feeSignOf(mapping, r, records, f);
  const signFee = (c) => (feeSign === "cost" ? c : feeSign === "negative" ? -c : Math.abs(c));
  const feeCoinCol = mapping.feeCoin ? r.col(mapping.feeCoin) : null;
  const otherFeeCoins = new Set();
  const fees = (row, qty) => {
    let c = f.commission ? r.num(row, f.commission) : NaN;
    if (feeCoinCol != null && Number.isFinite(c) && c !== 0) {
      const coin = String(row[feeCoinCol] ?? "").trim();
      if (coin && !STABLE.test(coin)) { otherFeeCoins.add(coin.toUpperCase()); c = NaN; } // BNB isn't dollars
    }
    c = Number.isFinite(c) ? signFee(c) : 0;
    const rate = f.commissionRate ? Math.abs(r.num(row, f.commissionRate)) : NaN;
    if (Number.isFinite(rate)) c += rate * qty;
    return c;
  };

  const accounts = f.account && r.present(f.account) ? [...new Set(records.map((row) => r.text(row, f.account)).filter(Boolean))] : [];
  const pick = accounts.length > 1 ? (accounts.includes(opts.fileAccount) ? opts.fileAccount : accounts[0]) : null;
  const inAccount = (row) => !pick || r.text(row, f.account) === pick;
  const keepCol = mapping.keep ? r.col(mapping.keep.column) : null;
  const kept = (row) => keepCol == null || new RegExp(mapping.keep.match, "i").test(String(row[keepCol] ?? "").trim());

  const rule = (spec) => { const i = spec ? r.col(spec.column) : null; return i == null ? null : { i, re: new RegExp(spec.match, "i") }; };
  const test = (ru, row) => ru.re.test(String(row[ru.i] ?? "").trim());
  const skips = (mapping.skip || []).map((s) => ({ ...rule(s), reason: s.reason })).filter((s) => s.i != null);
  const skipWhy = (row) => skips.find((s) => test(s, row))?.reason || null;
  const liq = rule(mapping.liquidation);
  const liquidatedRow = (row) => (liq ? test(liq, row) : undefined);
  const fundRule = rule(mapping.fundingRows);
  const readMaker = makerReader(mapping.makerOf);

  const events = [];
  const fundKey = counter();
  const fundingEvent = (row, i, spec) => {
    const amount = r.num(row, spec.amount);
    const contract = r.text(row, spec.symbol || f.symbol);
    const time = when(r, row, spec.time || f.time || f.entryTime, tOpts);
    if (!contract || !Number.isFinite(amount) || !time) return skip(i, "A funding row with no symbol, amount or time");
    if (amount === 0) return; // nothing was paid
    const id = spec.id ? r.text(row, spec.id) : "";
    events.push({ key: id ? `fund:${id}` : fundKey(`fund:${contract}|${time.toISOString()}|${amount}`), time, contract, symbol: symbolOf(contract), amount: round(amount, 6), account: null });
  };

  const empty = { trades: [], open: [], orphans: [], skipped, unknown: [], accounts, dates, rowsRead: records.length, fundingEvents: events, unattachedFunding: [], feeSign, otherFeeCoins: [] };
  const missing = requiredMissing(mapping, r);
  if (missing.length) return { ...empty, missing, hint: mapping.hint || null };

  let trades = [], open = [], orphans = [];
  if (mapping.shape === "funding") {
    records.forEach((row, i) => {
      if (!inAccount(row) || !kept(row)) return;
      const why = skipWhy(row);
      if (why) return skip(i, why);
      fundingEvent(row, i, { amount: f.amount, symbol: f.symbol, time: f.time, id: f.id });
    });
    return { ...empty, missing: [], hint: null };
  }
  if (mapping.shape === "roundtrip") {
    const key = counter();
    records.forEach((row, i) => {
      if (!inAccount(row)) return;
      if (fundRule && test(fundRule, row)) return fundingEvent(row, i, mapping.fundingRows);
      if (!kept(row)) return;
      const why = skipWhy(row);
      if (why) return skip(i, why);
      const contract = r.text(row, f.symbol);
      const sideRaw = r.text(row, f.side);
      const side = /^(l|long|buy|b|bot|bought)\b/i.test(sideRaw) ? "long" : /^(s|short|sell|sld|sold)\b/i.test(sideRaw) ? "short" : null;
      const qty = Math.abs(r.num(row, f.qty));
      const entry = r.num(row, f.entryPrice), exit = r.num(row, f.exitPrice);
      const opened = when(r, row, f.entryTime, tOpts), closed = f.exitTime ? when(r, row, f.exitTime, tOpts) : null;
      if (!contract) return skip(i, "No symbol");
      if (!side) return skip(i, `Can't tell long or short from "${sideRaw || "blank"}"`);
      if (!(qty > 0)) return skip(i, "No quantity");
      if (!Number.isFinite(entry)) return skip(i, "No entry price");
      if (!opened) return skip(i, `Can't read the entry time "${r.text(row, f.entryTime)}"`);
      const so = mapping.stillOpen;
      const shut = so ? r.num(row, so.closed) : NaN, most = so ? r.num(row, so.max) : NaN;
      const still = Number.isFinite(shut) && Number.isFinite(most) && shut < most - 1e-9;
      if (!Number.isFinite(exit) || (f.exitTime && !closed) || still) { open.push({ account: null, contract, symbol: symbolOf(contract), side, qty: still ? round(most - shut, 6) : qty, opened, fills: [] }); return; }
      const root = symbolOf(contract);
      const mult = f.multiplier ? r.num(row, f.multiplier) : NaN;
      const pv = mult > 0 ? mult : mapping.linear ? 1 : valueOf(root);
      let commission = fees(row, qty);
      const fm = f.feeMaker ? r.num(row, f.feeMaker) : NaN, ft = f.feeTaker ? r.num(row, f.feeTaker) : NaN;
      let feeMaker = null, feeTaker = null;
      if (Number.isFinite(fm) || Number.isFinite(ft)) {
        const hasTotal = !!f.commission && Number.isFinite(r.num(row, f.commission));
        feeMaker = Number.isFinite(fm) ? signFee(fm) : hasTotal ? commission - signFee(ft) : 0;
        feeTaker = Number.isFinite(ft) ? signFee(ft) : hasTotal ? commission - feeMaker : 0;
        if (!hasTotal) commission = feeMaker + feeTaker;
        feeMaker = round(feeMaker, 6); feeTaker = round(feeTaker, 6);
      }
      commission = money(commission);
      const fundingRaw = f.funding ? r.num(row, f.funding) : NaN;
      const funding = Number.isFinite(fundingRaw) ? round(fundingRaw, 6) : null;
      const filePnl = f.pnl ? r.num(row, f.pnl) : NaN;
      const stop = f.stop ? r.num(row, f.stop) : NaN;
      const dir = side === "long" ? 1 : -1;
      let gross = null, fromFile = false;
      if (Number.isFinite(filePnl)) { gross = mapping.pnlIs === "net" ? filePnl + commission - (funding ?? 0) : filePnl; fromFile = true; }
      else if (pv != null) gross = (exit - entry) * dir * qty * pv;
      gross = gross == null ? null : money(gross);
      const liqPrice = f.liqPrice ? r.num(row, f.liqPrice) : NaN;
      const liqd = liquidatedRow(row);
      const id = f.id ? r.text(row, f.id) : "";
      trades.push({
        key: key(id ? `r:${id}` : `r:${contract}|${opened.toISOString()}|${closed ? closed.toISOString() : ""}|${side}|${qty}|${entry}|${exit}`),
        account: null, contract, symbol: root, side, size: qty, entry, exit, stop: stop > 0 ? stop : null,
        opened, closed: closed || opened, holdMs: closed ? closed - opened : null, pointValue: pv,
        gross, commission, net: gross == null ? null : money(gross - commission + (funding ?? 0)), pnlFromFile: fromFile, fills: null,
        funding, feeMaker, feeTaker, leverage: f.leverage ? leverageOf(r.raw(row, f.leverage), decimalComma) : null,
        liqPrice: liqPrice > 0 ? liqPrice : null, liquidated: liqd == null ? null : liqd,
      });
    });
  } else {
    const fills = [];
    const key = counter();
    if (mapping.shape === "pairs") {
      const byId = new Map();
      const add = (id, side, time, price, qty, contract, i) => {
        const k = id ? `id:${id}` : key(`${time.toISOString()}|${contract}|${side}|${price}|${i}`);
        const x = byId.get(k);
        if (x) x.qty += qty;
        else byId.set(k, { key: k, time, contract, side, qty, price, commission: 0, account: null });
      };
      records.forEach((row, i) => {
        const contract = r.text(row, f.symbol), qty = Math.abs(r.num(row, f.qty));
        const bp = r.num(row, f.buyPrice), sp = r.num(row, f.sellPrice);
        const bt = when(r, row, f.buyTime, tOpts), st = when(r, row, f.sellTime, tOpts);
        if (!contract || !(qty > 0) || !Number.isFinite(bp) || !Number.isFinite(sp) || !bt || !st) return skip(i, "Missing a symbol, quantity, price or time");
        add(r.text(row, f.buyId), "buy", bt, bp, qty, contract, i);
        add(r.text(row, f.sellId), "sell", st, sp, qty, contract, i);
      });
      fills.push(...byId.values());
    } else {
      records.forEach((row, i) => {
        if (!inAccount(row)) return;
        if (fundRule && test(fundRule, row)) return fundingEvent(row, i, mapping.fundingRows);
        if (!kept(row)) return;
        const why = skipWhy(row);
        if (why) return skip(i, why);
        const contract = r.text(row, f.symbol);
        const q = r.num(row, f.qty);
        const sideCol = !!(f.side && r.present(f.side));
        const sideText = sideCol ? r.text(row, f.side) : "";
        let side = sideCol ? sideOf(sideText) : null;
        let words = null;
        if (!side && sideText) {
          words = sideWords(sideText);
          if (words.skip) return skip(i, words.skip);
          side = words.side;
        }
        if (!side && Number.isFinite(q) && q !== 0 && !sideCol) side = q > 0 ? "buy" : "sell"; // signed quantity
        const qty = Math.abs(q), price = r.num(row, f.price), time = when(r, row, f.time, tOpts);
        if (!contract) return skip(i, "No symbol");
        if (!side) return skip(i, `Can't tell buy or sell from "${r.text(row, f.side) || "blank"}"`);
        if (!(qty > 0)) return skip(i, "No quantity");
        if (!Number.isFinite(price)) return skip(i, "No price");
        if (!time) return skip(i, `Can't read the time "${r.text(row, f.time)}"`);
        const id = f.id ? r.text(row, f.id) : "";
        const account = f.account ? r.text(row, f.account) || "" : "";
        const pnl = f.pnl ? r.num(row, f.pnl) : NaN;
        const mult = f.multiplier ? r.num(row, f.multiplier) : NaN;
        let effect = f.effect ? effectOf(r.text(row, f.effect)) : null;
        if (effect == null && words?.effect) effect = words.effect;
        const liqd = words?.liquidated ? true : liquidatedRow(row);
        const maker = f.maker && r.present(f.maker) ? readMaker(r.raw(row, f.maker)) : null;
        const funding = f.funding ? r.num(row, f.funding) : NaN;
        const leverage = f.leverage ? leverageOf(r.raw(row, f.leverage), decimalComma) : null;
        const liqPrice = f.liqPrice ? r.num(row, f.liqPrice) : NaN;
        fills.push({
          key: id ? `id:${account}:${id}` : key(`${time.toISOString()}|${contract}|${side}|${qty}|${price}`),
          time, contract, side, qty, price, account: null, commission: fees(row, qty),
          effect,
          ...(Number.isFinite(pnl) ? { pnl } : {}), ...(mult > 0 ? { multiplier: mult } : mapping.linear ? { multiplier: 1 } : {}),
          ...(maker != null ? { maker } : {}), ...(liqd != null ? { liquidated: liqd } : {}),
          ...(Number.isFinite(funding) && funding !== 0 ? { funding } : {}), ...(leverage ? { leverage } : {}), ...(liqPrice > 0 ? { liqPrice } : {}),
        });
      });
    }
    ({ trades, open, orphans } = pairFills(withCarried(fills, (opts.carried || []).map((x) => ({ ...x, account: null }))), { points, crypto: isCrypto }));
  }

  let unattachedFunding = [];
  if (events.length) ({ trades, open, unattached: unattachedFunding } = attachFunding(trades, events, { open }));

  const unknown = [...new Set(trades.filter((t) => t.gross == null).map((t) => t.symbol))];
  return { ...empty, trades, open, orphans, unknown, missing: [], hint: null, unattachedFunding, otherFeeCoins: [...otherFeeCoins] };
}

const REQUIRED = {
  fills: ["time", "symbol", "qty", "price"], roundtrip: ["symbol", "side", "qty", "entryPrice", "exitPrice", "entryTime"],
  pairs: ["symbol", "qty", "buyPrice", "sellPrice", "buyTime", "sellTime"], funding: ["time", "symbol", "amount"],
};
function requiredMissing(mapping, r) {
  const need = [...new Set([...(REQUIRED[mapping.shape] || []), ...(mapping.mustHave || [])])];
  return need.filter((k) => !mapping.fields?.[k] || !r.present(mapping.fields[k]));
}

const money6 = (n) => (n == null || !Number.isFinite(+n) ? null : round(+n, 6));

export function toRow(t, { accountId, importId, risk }) {
  const dir = t.side === "long" ? 1 : -1;
  const priced = t.stop != null && t.entry != null && t.exit != null && t.stop !== t.entry;
  const r = priced ? round(((t.exit - t.entry) * dir) / Math.abs(t.entry - t.stop), 2) : risk > 0 && t.net != null ? round(t.net / risk, 2) : null;
  const leverage = t.leverage > 0 && t.leverage <= 1000 ? round(t.leverage, 2) : null;
  return {
    id: crypto.randomUUID(),
    account_id: accountId, import_id: importId, source: "import", external_id: t.key.slice(0, 200), needs_review: true,
    traded_at: new Date(t.opened).toISOString(), closed_at: t.closed ? new Date(t.closed).toISOString() : null,
    symbol: t.symbol.slice(0, 16), side: t.side, entry: t.entry, exit: t.exit, size: t.size, stop: t.stop ?? null,
    pnl: t.net ?? 0, commission: t.commission || 0, r,
    grade: null, setup: null, emotion: null, followed_plan: null, kept: [], note: "",
    fills: { contract: t.contract, pointValue: t.pointValue, gross: t.gross, fromFile: !!t.pnlFromFile, ...(t.fills ? { list: t.fills.slice(0, 200) } : {}), ...(t.liquidated === true ? { liquidated: true } : {}) },
    leverage: leverage > 0 ? leverage : null, funding: money6(t.funding), fee_maker: money6(t.feeMaker), fee_taker: money6(t.feeTaker),
    liq_price: t.liqPrice > 0 ? roundPrice(+t.liqPrice) : null,
  };
}

export const holdLabel = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return "–";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};
