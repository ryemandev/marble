import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rootOf, cryptoSymbol } from "../src/live/import/symbols.js";
import { parseWhen, zoneOfHeader } from "../src/live/import/when.js";
import { pairFills } from "../src/live/import/pair.js";
import { CRYPTO_TEMPLATE_CSV, FIELDS, PRESETS, mappingFor, presetById } from "../src/live/import/presets.js";
import * as engine from "../src/live/import/engine.js";
import { attachFunding, fundingUpdates } from "../supabase/functions/_shared/import/funding.js";

const { build, detect, readTable, toRow, zoneHint, sideOf, effectOf, sideWords } = engine;
const crypto = (name) => readFileSync(new URL(`./fixtures/crypto/${name}`, import.meta.url), "utf8");
const markets = (name) => readFileSync(new URL(`../.scratch/fixtures/${name}`, import.meta.url), "utf8");
const iso = (d) => new Date(d).toISOString();
const run = (text, opts = {}) => {
  const table = readTable(text);
  const preset = detect(table.headers);
  return { table, preset, out: build(table, mappingFor(preset, table.headers), { tz: zoneHint(preset, table.headers).zone || "UTC", ...opts }) };
};
const pick = (t, ...k) => k.map((x) => t[x]);

/* ---------- Zones, sides, symbols ---------- */

test("zones: a fixed offset in the column's name; the names read today read the same", () => {
  assert.equal(zoneOfHeader("Update Time (PDT)"), "America/Los_Angeles");
  assert.equal(zoneOfHeader("Date(UTC)"), "UTC");
  assert.equal(zoneOfHeader("Opened (UTC)"), "UTC");
  assert.equal(zoneOfHeader("Time"), null);
  assert.equal(zoneOfHeader("Price (XYZ)"), null);
  assert.equal(zoneOfHeader(null), null);
  assert.equal(zoneOfHeader("Time(UTC+8)"), "Etc/GMT-8"); // Etc counts the other way
  assert.equal(zoneOfHeader("Date (UTC+08:00)"), "Etc/GMT-8");
  assert.equal(zoneOfHeader("Trade Time(UTC+0)"), "UTC");
  assert.equal(zoneOfHeader("Time (UTC-05:00)"), "Etc/GMT+5");
  assert.equal(zoneOfHeader("Time (GMT+2)"), "Etc/GMT-2");
  assert.equal(zoneOfHeader("Time(UTC+5:30)"), null); // no Etc zone for half hours: the trader is asked
  assert.equal(zoneOfHeader("Time(UTC+15)"), null);
  assert.equal(iso(parseWhen("2026-10-27 17:31:05", { tz: "Etc/GMT-8" })), "2026-10-27T09:31:05.000Z");
  // A zone in the header comes before the platform's
  const bybit = presetById("bybit-translog");
  assert.deepEqual(zoneHint(bybit, ["Contract", "Time(UTC+8)"]), { zone: "Etc/GMT-8", from: "header" });
  assert.deepEqual(zoneHint(bybit, ["Contract", "Time"]), { zone: "UTC", from: "platform" });
  assert.deepEqual(zoneHint(presetById("topstepx"), ["EnteredAt"]), { zone: "UTC", from: "platform" });
});

test("sides: every value read today reads the same; words read as crypto platforms write them", () => {
  for (const v of ["B", "BOT", "Bought", "long", "Cover", "Buy", "BUY", "Buy to Open"]) assert.equal(sideOf(v), "buy", v);
  for (const v of ["S", "SLD", "Sold", "Short", "Sell", "SELL", "Sell Short"]) assert.equal(sideOf(v), "sell", v);
  for (const v of ["Hold", "", null, "Open Long", "Close Short", "Long > Short"]) assert.equal(sideOf(v), null, String(v));
  for (const v of ["C", "X", "Exit", "Close", "closing", "Out", "Close Long"]) assert.equal(effectOf(v), "close", v);
  for (const v of ["O", "E", "Entry", "Open", "Opening", "In"]) assert.equal(effectOf(v), "open", v);
  for (const v of ["In/Out", "C;O", "Open Long", "", null]) assert.equal(effectOf(v), null, String(v));

  const w = (v) => { const x = sideWords(v); return x.skip ? ["skip"] : [x.side, x.effect, x.liquidated]; };
  assert.deepEqual(w("Open Long"), ["buy", "open", false]);
  assert.deepEqual(w("Close Long"), ["sell", "close", false]);
  assert.deepEqual(w("Open Short"), ["sell", "open", false]);
  assert.deepEqual(w("close short"), ["buy", "close", false]);
  assert.deepEqual(w("Long > Short"), ["sell", null, false]);
  assert.deepEqual(w("Short > Long"), ["buy", null, false]);
  assert.deepEqual(w("Market Order Liquidation: Close Long"), ["sell", "close", true]);
  assert.deepEqual(w("Backstop Liquidation: Close Short"), ["buy", "close", true]);
  assert.deepEqual(w("Close Short (Price Improved)"), ["buy", "close", false]);
  assert.deepEqual(w("Market Order Liquidation: Close Long (Price Improved)"), ["sell", "close", true]);
  assert.deepEqual(w("Buy"), ["buy", null, false]);
  for (const v of ["Auto-Deleveraging", "Settlement", "Spot Dust Conversion", "Backstop Borrow Liquidation", "Partial Borrow Liquidation"]) {
    const x = sideWords(v);
    assert.ok(x.skip && x.side === null, v);
  }
  assert.match(sideWords("Auto-Deleveraging").skip, /deleveraging/i);
  assert.deepEqual(w("Long > Long"), [null, null, false]);
});

test("symbols: crypto names stay as the exchange writes them; futures roots don't change", () => {
  for (const s of ["BTCUSDT", "1000PEPEUSDT", "BTC-USDT-SWAP", "BTCUSDT-PERP", "BTC-USDT-261225", "BTCUSDT_251226", "BTC-26DEC25"]) assert.equal(rootOf(s), s, s);
  assert.equal(rootOf("xyz:XYZ100"), "XYZ100"); // the HIP-3 dex would be lost
  assert.equal(cryptoSymbol("xyz:XYZ100"), "XYZ:XYZ100");
  assert.equal(cryptoSymbol(" btcusdt "), "BTCUSDT");
  assert.equal(cryptoSymbol("kPEPE"), "KPEPE");
  assert.equal(cryptoSymbol("1000000BABYDOGEUSDT"), "1000000BABYDOGEU");
  for (const [raw, root] of [["NQZ6", "NQ"], ["CON.F.US.MNQ.Z26", "MNQ"], ["MES 12-26", "MES"], ["6EZ6", "6E"]]) assert.equal(rootOf(raw), root, raw);
});

/* ---------- Detection ---------- */

const MARKETS_FIXTURES = {
  "tradovate-performance": "tradovate-performance.csv", "tradovate-orders": "tradovate-orders.csv", topstepx: "topstepx.csv", rithmic: "rithmic.csv",
  "ninjatrader-executions": "ninjatrader-executions.csv", "ninjatrader-trades": "ninjatrader-trades.csv", "mt5-deals": "mt5-history.html", "mt4-statement": "mt4-statement.htm",
  ctrader: "ctrader.csv", "ibkr-flex": "ibkr-flex.csv", "generic-fills": "generic-eu.csv",
};
const CRYPTO_FIXTURES = {
  "bybit-translog": () => crypto("bybit-translog.csv"), "binance-futures-trades": () => crypto("binance-futures-trades.csv"),
  "binance-futures-funding": () => crypto("binance-futures-funding.csv"), "okx-positions": () => crypto("okx-positions.csv"), "crypto-template": () => CRYPTO_TEMPLATE_CSV,
};

test("detection: each crypto file finds its preset, and every Markets fixture still finds its own", () => {
  const cryptoPresets = PRESETS.filter((p) => p.world === "crypto");
  assert.deepEqual(cryptoPresets.map((p) => p.id).sort(), Object.keys(CRYPTO_FIXTURES).sort());
  for (const p of PRESETS.filter((x) => x.world !== "crypto")) assert.equal(p.world, undefined, `${p.id} stays a Markets preset`);
  for (const [id, text] of Object.entries(CRYPTO_FIXTURES)) assert.equal(detect(readTable(text()).headers).id, id, id);
  assert.equal(detect(readTable(crypto("bybit-translog-old.csv")).headers).id, "bybit-translog");
  for (const [id, file] of Object.entries(MARKETS_FIXTURES)) {
    const headers = readTable(markets(file)).headers;
    assert.equal(detect(headers).id, id, file);
    for (const p of cryptoPresets) assert.equal(p.detect(headers), 0, `${p.id} doesn't score ${file}`);
  }
  assert.equal(detect(["Symbol", "Entry Price", "Exit Price", "Opened", "Closed", "Qty", "Side"]).id, "generic-roundtrip");
  assert.equal(presetById("generic-roundtrip").detect(readTable(CRYPTO_TEMPLATE_CSV).headers) > 0, true);
});

test("mappingFor: crypto settings are carried; a Markets preset's mapping is as it was", () => {
  const before = ["preset", "shape", "keep", "pnlIs", "feesSigned", "mustHave", "hint", "fields"].sort();
  for (const p of PRESETS.filter((x) => x.world !== "crypto")) assert.deepEqual(Object.keys(mappingFor(p, [])).sort(), before, p.id);
  const okx = mappingFor(presetById("okx-positions"), []);
  assert.equal(okx.world, "crypto");
  assert.equal(okx.linear, true);
  assert.equal(okx.feesSigned, true);
  assert.deepEqual(okx.stillOpen, { closed: "Total Close Quantity", max: "Max Position Quantity" });
  assert.ok(okx.liquidation && okx.skip.length === 1);
  const bybit = mappingFor(presetById("bybit-translog"), []);
  assert.deepEqual(bybit.fundingRows, { column: "Type", match: "^settlement$", amount: "Funding" });
  assert.deepEqual(bybit.feeSignFrom, { total: "Change", parts: ["Cash Flow", "Funding"] });
  assert.equal(mappingFor(presetById("binance-futures-trades"), []).feeSign, "cost");
  assert.equal(mappingFor(presetById("binance-futures-trades"), []).feeCoin, "Fee Coin");
  // The crypto-only columns say so, for a Markets column picker
  for (const shape of ["fills", "roundtrip"]) {
    const tagged = FIELDS[shape].filter((x) => x[3] === "crypto").map((x) => x[0]);
    assert.ok(tagged.includes("funding") && tagged.includes("leverage") && tagged.includes("liqPrice"), shape);
  }
  assert.ok(FIELDS.fills.some((x) => x[0] === "maker"));
  assert.ok(FIELDS.roundtrip.some((x) => x[0] === "feeMaker") && FIELDS.roundtrip.some((x) => x[0] === "feeTaker"));
});

/* ---------- Bybit ---------- */

test("bybit transaction log: funding rows join the trade they were paid on, a liquidation, the fee sign read from the file", () => {
  const { table, preset, out } = run(crypto("bybit-translog.csv"));
  assert.equal(preset.id, "bybit-translog");
  assert.equal(table.headers[0], "Uid"); // the "UID: …" line above the header is skipped
  assert.deepEqual(zoneHint(preset, table.headers), { zone: "UTC", from: "header" });
  assert.equal(out.feeSign, "negative");
  assert.equal(out.trades.length, 2);
  const [btc, eth] = out.trades;
  assert.deepEqual(pick(btc, "symbol", "contract", "side", "size", "entry", "exit", "gross", "commission", "funding", "net"),
    ["BTCUSDT", "BTCUSDT", "long", 0.1, 67000, 67500, 50, 6.218, -0.551, 43.231]);
  assert.equal(btc.pointValue, 1); // linear: price x quantity
  assert.equal(btc.liquidated, false);
  assert.equal(iso(btc.opened), "2026-10-27T09:31:05.000Z");
  assert.deepEqual([btc.feeMaker, btc.feeTaker, btc.leverage], [null, null, null]); // the log doesn't say
  assert.deepEqual(pick(eth, "side", "size", "gross", "commission", "funding", "net", "liquidated"), ["short", 2, -300, 3.665, null, -303.665, true]);
  assert.equal(out.skipped.length, 1);
  assert.equal(out.skipped[0].row, 9);
  assert.match(out.skipped[0].reason, /USDT or USDC/);
  assert.deepEqual(out.unattachedFunding.map((e) => [e.contract, e.amount, e.reason]), [["SOLUSDT", -0.05, "no trade"]]);
  assert.equal(out.fundingEvents.length, 4);
  assert.equal(out.open.length, 1);
  assert.deepEqual(pick(out.open[0].fills[0], "contract", "funding", "fundingTo", "multiplier"), ["SOLUSDT", -0.03, "2026-10-28T16:00:00.000Z", 1]);
  // As rows for the database
  const row = toRow(eth, { accountId: "acc", importId: "imp", risk: null });
  assert.equal(row.pnl, -303.665);
  assert.equal(row.commission, 3.665);
  assert.equal(row.fills.liquidated, true);
  assert.equal(row.symbol, "ETHUSDT");
  assert.deepEqual([row.funding, row.leverage, row.fee_maker, row.fee_taker, row.liq_price], [null, null, null, null, null]);
  assert.equal(toRow(btc, { accountId: "acc", importId: "imp", risk: null }).funding, -0.551);
  assert.equal("liquidated" in toRow(btc, { accountId: "a", importId: "i", risk: null }).fills, false);
});

test("bybit, older layout: fees read as costs when Change says so; trade ids key the fills", () => {
  const { preset, out } = run(crypto("bybit-translog-old.csv"));
  assert.equal(preset.id, "bybit-translog");
  assert.equal(out.feeSign, "cost");
  assert.equal(out.trades.length, 1);
  const t = out.trades[0];
  assert.deepEqual(pick(t, "gross", "commission", "funding", "net"), [50, 3.015, -0.671, 46.314]); // 3.685 paid, 0.67 rebate
  assert.equal(t.key, "f:BTCUSDT:id::t-1001");
  assert.deepEqual(run(crypto("bybit-translog-old.csv")).out.trades.map((x) => x.key), [t.key]);
});

test("bybit: the next file finishes a carried position, and funding already counted isn't counted twice", () => {
  const first = run(crypto("bybit-translog.csv")).out;
  const carried = first.open.flatMap((o) => o.fills);
  const next = [
    "Uid,Currency,Contract,Type,Direction,Quantity,Position,Filled Price,Funding,Fee Paid,Cash Flow,Change,Wallet Balance,Action,Time(UTC)",
    "1234567,USDT,SOLUSDT,SETTLEMENT,BUY,10,10,150.5,-0.03,0,0,-0.03,738.661,,2026-10-28 16:00:00", // in the first file too
    "1234567,USDT,SOLUSDT,SETTLEMENT,BUY,10,10,153,-0.04,0,0,-0.04,738.621,,2026-10-29 00:00:00",
    "1234567,USDT,SOLUSDT,TRADE,SELL,10,0,156,0,-0.858,60,59.142,797.763,Close,2026-10-29 03:00:00",
  ].join("\n");
  const out = run(next, { carried }).out;
  assert.equal(out.trades.length, 1);
  const t = out.trades[0];
  assert.deepEqual(pick(t, "symbol", "side", "size", "entry", "exit", "gross", "commission", "funding", "net"), ["SOLUSDT", "long", 10, 150, 156, 60, 1.683, -0.07, 58.247]);
  assert.equal(iso(t.opened), "2026-10-28T15:00:00.000Z");
  assert.deepEqual(out.unattachedFunding, []);
});

/* ---------- Binance ---------- */

test("binance trade history: realised profit per fill, a BNB fee left out and named, a rebate, small prices keep their digits", () => {
  const { preset, out } = run(crypto("binance-futures-trades.csv"));
  assert.equal(preset.id, "binance-futures-trades");
  assert.equal(out.feeSign, "cost");
  assert.deepEqual(out.otherFeeCoins, ["BNB"]);
  assert.equal(out.trades.length, 2);
  const [btc, pepe] = out.trades;
  assert.deepEqual(pick(btc, "symbol", "side", "size", "entry", "exit", "gross", "commission", "net", "pnlFromFile"), ["BTCUSDT", "long", 0.015, 67003.333333, 67500, 7.45, 0.402, 7.048, true]);
  assert.deepEqual(pick(pepe, "symbol", "side", "size", "entry", "exit", "gross", "commission", "net"), ["1000PEPEUSDT", "short", 100000, 0.0123456, 0.0120001, 34.55, 0.37, 34.18]);
  assert.match(out.skipped[0].reason, /COIN-M/);
  assert.equal(out.open.length, 1);
  assert.equal(out.open[0].symbol, "ETHUSDT");
  assert.equal(out.unknown.length, 0);
});

test("binance transaction history: funding for trades already imported, the same file twice changes nothing", () => {
  const funding = run(crypto("binance-futures-funding.csv"));
  assert.equal(funding.preset.id, "binance-futures-funding");
  assert.equal(funding.out.trades.length, 0);
  assert.deepEqual(funding.out.fundingEvents.map((e) => [e.key, e.contract, e.amount, iso(e.time)]), [
    ["fund:9001", "BTCUSDT", -0.02, "2026-10-27T00:00:00.000Z"], ["fund:9002", "BTCUSDT", -0.0335, "2026-10-27T08:00:00.000Z"], ["fund:9005", "1000PEPEUSDT", 0.21, "2026-10-27T16:00:00.000Z"],
  ]);
  assert.match(funding.out.skipped[0].reason, /coin/); // BTCUSD_PERP's funding is in BTC
  // The trades as the database has them
  const rows = run(crypto("binance-futures-trades.csv")).out.trades.map((t, i) => ({ ...toRow(t, { accountId: "acc", importId: "imp", risk: null }), id: `t${i}` }));
  const a = fundingUpdates(rows, funding.out.fundingEvents);
  assert.deepEqual(a.updates, [
    { id: "t0", funding: -0.0335, pnl: 7.0145, partial: false },
    { id: "t1", funding: 0.21, pnl: 34.39, partial: true },
  ]);
  assert.deepEqual(a.unattached.map((e) => [e.key, e.reason]), [["fund:9001", "no trade"]]);
  const applied = rows.map((r) => { const u = a.updates.find((x) => x.id === r.id); return u ? { ...r, funding: u.funding, pnl: u.pnl } : r; });
  assert.deepEqual(fundingUpdates(applied, funding.out.fundingEvents).updates, a.updates);
});

/* ---------- OKX ---------- */

test("okx position history: contracts at face value, signed fees, funding, leverage, a liquidation; partly closed and coin-margined positions wait", () => {
  const { preset, out } = run(crypto("okx-positions.csv"), { tz: "UTC" });
  assert.equal(preset.id, "okx-positions");
  assert.equal(out.trades.length, 3);
  const [btc, eth, doge] = out.trades;
  assert.deepEqual(pick(btc, "symbol", "side", "size", "pointValue", "gross", "commission", "funding", "net", "leverage", "liquidated"),
    ["BTC-USDT-SWAP", "long", 5, 0.01, 20, 1.68, -0.35, 17.97, 10, false]);
  // Liquidated: the clearance fee is a cost too
  assert.deepEqual(pick(eth, "side", "size", "gross", "commission", "funding", "net", "leverage", "liquidated"), ["short", 30, -300, 12.6, 0.45, -312.15, 20, true]);
  // No Pnl: 2 contracts of 1,000 DOGE
  assert.deepEqual(pick(doge, "gross", "commission", "funding", "net", "pnlFromFile"), [10, 0.3, null, 9.7, false]);
  assert.deepEqual(out.open.map((o) => [o.symbol, o.side, o.qty]), [["SOL-USDT-SWAP", "long", 6]]);
  assert.match(out.skipped[0].reason, /coin-margined/);
  const row = toRow(eth, { accountId: "a", importId: "i", risk: null });
  assert.deepEqual([row.leverage, row.funding, row.pnl, row.fills.liquidated, row.fills.pointValue], [20, 0.45, -312.15, true, 0.1]);
  const zoned = crypto("okx-positions.csv").replace("Position Create Time", "Position Create Time(UTC+8)").replace("Position Update Time", "Position Update Time(UTC+8)");
  const z = run(zoned);
  assert.equal(z.preset.id, "okx-positions");
  assert.deepEqual(zoneHint(z.preset, z.table.headers), { zone: "Etc/GMT-8", from: "header" });
  assert.equal(iso(z.out.trades[0].opened), "2026-10-27T01:31:05.000Z");
});

/* ---------- Marble's template ---------- */

test("marble crypto template: the published file reads back, P&L from the prices when Realised P&L is blank", () => {
  assert.equal(CRYPTO_TEMPLATE_CSV.split("\n")[0], "Opened (UTC),Closed (UTC),Symbol,Side,Quantity,Entry price,Exit price,Fees,Funding,Leverage,Liquidation price,Realised P&L,Notes");
  assert.equal(engine.CRYPTO_TEMPLATE_CSV, CRYPTO_TEMPLATE_CSV);
  const { preset, out } = run(CRYPTO_TEMPLATE_CSV);
  assert.equal(preset.id, "crypto-template");
  assert.equal(out.skipped.length, 0);
  const [btc, eth] = out.trades;
  assert.deepEqual(pick(btc, "symbol", "side", "size", "gross", "commission", "funding", "net", "leverage", "liqPrice", "pnlFromFile"),
    ["BTCUSDT", "long", 0.05, 36.475, 2.71, -0.42, 33.345, 10, 61200, false]);
  assert.deepEqual(pick(eth, "side", "gross", "commission", "funding", "net", "leverage", "liqPrice", "pnlFromFile"), ["short", 57.3, 1.88, 0.65, 56.07, 5, null, true]);
  assert.equal(iso(btc.opened), "2026-10-27T09:30:00.000Z");
  const row = toRow(btc, { accountId: "a", importId: "i", risk: null });
  assert.deepEqual([row.leverage, row.liq_price, row.funding, row.pnl], [10, 61200, -0.42, 33.345]);
  const more = CRYPTO_TEMPLATE_CSV + "2026-10-30 10:00:00,2026-10-30 10:30:00,SOLUSDT,Long,10,150,151,-0.25,,20,,,\n2026-10-30 11:00:00,,SOLUSDT,Short,5,152,,,,,,,\n";
  const m = run(more).out;
  assert.deepEqual(pick(m.trades[2], "gross", "commission", "net"), [10, -0.25, 10.25]);
  assert.deepEqual(m.open.map((o) => [o.symbol, o.side, o.qty]), [["SOLUSDT", "short", 5]]);
});

/* ---------- The engine's crypto parts ---------- */

test("toRow: the crypto columns are always there, null for a Markets trade; liquidated only when true", () => {
  const csv = "Time,Symbol,Side,Qty,Price\n2026-10-27 10:00:00,NQZ6,Buy,1,21000\n2026-10-27 10:05:00,NQZ6,Sell,1,21010\n";
  const t = run(csv, { tz: "UTC" }).out.trades[0];
  assert.deepEqual(pick(t, "funding", "feeMaker", "feeTaker", "leverage", "liqPrice", "liquidated"), [null, null, null, null, null, null]);
  assert.equal(t.net, 200);
  const row = toRow(t, { accountId: "acc", importId: "imp", risk: null });
  assert.deepEqual(Object.keys(row).sort(), ["id", "account_id", "import_id", "source", "external_id", "needs_review", "traded_at", "closed_at", "symbol", "side", "entry", "exit", "size", "stop",
    "pnl", "commission", "r", "grade", "setup", "emotion", "followed_plan", "kept", "note", "fills", "leverage", "funding", "fee_maker", "fee_taker", "liq_price"].sort());
  assert.deepEqual([row.leverage, row.funding, row.fee_maker, row.fee_taker, row.liq_price], [null, null, null, null, null]);
  assert.deepEqual(Object.keys(row.fills).sort(), ["contract", "pointValue", "gross", "fromFile", "list"].sort());
  // Rounding, and numbers the database would refuse
  const base = { ...t, key: "k" };
  const r = (x) => toRow({ ...base, ...x }, { accountId: "a", importId: "i", risk: null });
  assert.equal(r({ leverage: 12.3456 }).leverage, 12.35);
  assert.equal(r({ leverage: 1500 }).leverage, null);
  assert.equal(r({ leverage: 0.001 }).leverage, null);
  assert.equal(r({ funding: 0.12345678 }).funding, 0.123457);
  assert.deepEqual([r({ feeMaker: -0.0000126 }).fee_maker, r({ feeTaker: 1.23456789 }).fee_taker], [-0.000013, 1.234568]);
  assert.equal(r({ liqPrice: 0.000123456789 }).liq_price, 0.00012345679);
  assert.equal(r({ liqPrice: 61234.5678912 }).liq_price, 61234.567891);
  assert.equal(r({ liqPrice: 0 }).liq_price, null);
  assert.equal(r({ liquidated: false }).fills.liquidated, undefined);
  assert.equal(r({ liquidated: true }).fills.liquidated, true);
});

test("fees: Math.abs by default, feesSigned as before, feeSign 'cost' keeps a rebate's sign", () => {
  const csv = "Time,Symbol,Side,Qty,Price,Fee\n2026-10-27 10:00:00,BTCUSDT,Buy,1,100,1.5\n2026-10-27 10:05:00,BTCUSDT,Sell,1,110,-0.5\n";
  const table = readTable(csv);
  const m = mappingFor(presetById("generic-fills"), table.headers);
  const c = (x) => build(table, { ...m, ...x }, { tz: "UTC", points: { BTCUSDT: 1 } }).trades[0].commission;
  assert.equal(c({}), 2);
  assert.equal(c({ feesSigned: true }), -1);
  assert.equal(c({ feeSign: "cost" }), 1);
  assert.equal(build(table, { ...m, feeSign: "cost" }, { tz: "UTC", points: { BTCUSDT: 1 } }).trades[0].net, 9);
});

test("maker and taker: commission split when every fill says, null when one doesn't, and a platform's own words", () => {
  const head = "Time,Symbol,Side,Qty,Price,Fee,Liquidity\n";
  const rows = (liq) => `2026-10-27 10:00:00,ETHUSDT,Buy,2,3500,1.4,${liq[0]}\n2026-10-27 10:05:00,ETHUSDT,Sell,1,3510,-0.1,${liq[1]}\n2026-10-27 10:06:00,ETHUSDT,Sell,1,3520,0.7,${liq[2]}\n`;
  const go = (liq, extra = {}) => {
    const table = readTable(head + rows(liq));
    const m = { ...mappingFor(presetById("generic-fills"), table.headers), world: "crypto", linear: true, feeSign: "cost", ...extra };
    m.fields = { ...m.fields, maker: "Liquidity" };
    return build(table, m, { tz: "UTC" }).trades[0];
  };
  const t = go(["Taker", "Maker", "Taker"]);
  assert.deepEqual(pick(t, "gross", "commission", "feeMaker", "feeTaker", "net"), [30, 2, -0.1, 2.1, 28]);
  assert.deepEqual(t.fills.map((x) => x.maker), [false, true, false]);
  assert.deepEqual(pick(go(["T", "M", "0"]), "feeMaker", "feeTaker"), [-0.1, 2.1]);
  assert.deepEqual(pick(go(["false", "true", "false"]), "feeMaker", "feeTaker"), [-0.1, 2.1]);
  assert.deepEqual(pick(go(["Taker", "", "Taker"]), "feeMaker", "feeTaker"), [null, null]);
  assert.deepEqual(pick(go(["remove", "add", "remove"], { makerOf: { maker: "^add", taker: "^remove" } }), "feeMaker", "feeTaker"), [-0.1, 2.1]);
  assert.deepEqual(pick(go(["x", "y", "x"], { makerOf: (v) => (v === "y" ? true : v === "x" ? false : null) }), "feeMaker", "feeTaker"), [-0.1, 2.1]);
});

test("linear: a point is worth 1, a coin named like a futures root isn't priced as one, and the trader's value wins", () => {
  const csv = "Time,Symbol,Side,Qty,Price\n2026-10-27 10:00:00,ES,Buy,10,2.5\n2026-10-27 10:05:00,ES,Sell,10,2.6\n";
  const table = readTable(csv);
  const m = mappingFor(presetById("generic-fills"), table.headers);
  assert.equal(build(table, m, { tz: "UTC" }).trades[0].gross, 50); // Markets: ES futures, $50 a point
  assert.equal(build(table, { ...m, world: "crypto", linear: true }, { tz: "UTC" }).trades[0].gross, 1);
  const unpriced = build(table, { ...m, world: "crypto" }, { tz: "UTC" });
  assert.deepEqual(unpriced.unknown, ["ES"]);
  assert.equal(build(table, { ...m, world: "crypto" }, { tz: "UTC", points: { ES: 2 } }).trades[0].gross, 2);
});

test("crypto: a carried position keeps the realised P&L of its partial exits", () => {
  const head = "Date(UTC),Symbol,Side,Price,Quantity,Amount,Fee,Fee Coin,Realized Profit,Quote Asset\n";
  const first = run(head + "2026-10-27 10:00:00,BTCUSDT,BUY,67000,0.2,13400,1,USDT,0,USDT\n2026-10-27 11:00:00,BTCUSDT,SELL,67100,0.1,6710,1,USDT,10,USDT\n").out;
  assert.equal(first.trades.length, 0);
  const carried = first.open.flatMap((o) => o.fills);
  assert.deepEqual(carried.map((x) => x.pnl), [0, 10]);
  const next = run(head + "2026-10-27 12:00:00,BTCUSDT,SELL,67200,0.1,6720,1,USDT,20,USDT\n", { carried }).out;
  assert.deepEqual(pick(next.trades[0], "size", "gross", "commission", "net"), [0.2, 30, 3, 27]);
});

test("pairFills: funding and liquidations on fills, a flip keeps funding with the trade it closed", () => {
  let n = 0;
  const f = (side, qty, price, min, extra = {}) => ({ key: `k${++n}`, time: new Date(Date.UTC(2026, 9, 27, 10, min)), contract: "BTCUSDT", side, qty, price, commission: 0, account: null, multiplier: 1, ...extra });
  const { trades } = pairFills([f("buy", 1, 100, 0, { funding: -0.5, leverage: 5, liqPrice: 80 }), f("sell", 3, 110, 5, { funding: 0.25, liquidated: true }), f("buy", 2, 105, 9, { liquidated: false })], { crypto: true });
  const [long, short] = trades;
  assert.deepEqual(pick(long, "gross", "funding", "net", "leverage", "liqPrice", "liquidated"), [10, -0.25, 9.75, 5, 80, true]);
  assert.deepEqual(pick(short, "size", "gross", "funding", "liquidated", "leverage"), [2, 10, null, false, null]);
});

test("attachFunding: the trade open at the time, contract then symbol, the same account, nothing dropped", () => {
  const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 27, h, m));
  const trades = [
    { key: "a", account: null, contract: "BTCUSDT", symbol: "BTCUSDT", opened: at(10), closed: at(12), gross: 100, commission: 2, net: 98, funding: null },
    { key: "b", account: null, contract: "BTCUSDT", symbol: "BTCUSDT", opened: at(12), closed: at(14), gross: -50, commission: 1, net: -51, funding: null },
    { key: "c", account: null, contract: "ETHUSDT.P", symbol: "ETHUSDT", opened: at(9), closed: at(17), gross: null, commission: 0, net: null, funding: null },
    { key: "d", account: "acc-1", contract: "SOLUSDT", symbol: "SOLUSDT", opened: at(9), closed: at(17), gross: 5, commission: 0, net: 5, funding: 0.1 },
  ];
  const copy = JSON.stringify(trades);
  const events = [
    { time: at(11), contract: "BTCUSDT", amount: -0.4 },
    { time: at(12), contract: "BTCUSDT", amount: -0.2 }, // the boundary: the trade already open
    { time: at(13).toISOString(), symbol: "BTCUSDT", amount: 0.3 },
    { time: at(16), contract: "ETHUSDT", amount: -1 }, // no such contract: the symbol matches
    { time: at(16), contract: "SOLUSDT", amount: 0.5, account: "acc-1" },
    { time: at(16), contract: "SOLUSDT", amount: 9, account: "acc-2" }, // another account
    { time: at(20), contract: "BTCUSDT", amount: -0.1 },
    { time: "not a time", contract: "BTCUSDT", amount: 1 },
  ];
  const { trades: out, unattached } = attachFunding(trades, events);
  assert.equal(JSON.stringify(trades), copy); // pure
  assert.deepEqual(out.map((t) => [t.key, t.funding, t.net]), [["a", -0.6, 97.4], ["b", 0.3, -50.7], ["c", -1, null], ["d", 0.6, 5.6]]);
  assert.deepEqual(unattached.map((e) => [e.amount, e.reason]), [[9, "no trade"], [-0.1, "no trade"], [1, "unreadable"]]);
  const open = [{ account: null, contract: "BTCUSDT", symbol: "BTCUSDT", side: "long", qty: 1, opened: at(19), fills: [{ key: "o1", time: at(19).toISOString(), contract: "BTCUSDT", side: "buy", qty: 1, price: 1, commission: 0 }] }];
  const held = attachFunding(trades, events, { open });
  assert.deepEqual(pick(held.open[0].fills[0], "funding", "fundingTo"), [-0.1, "2026-10-27T20:00:00.000Z"]);
  assert.equal(held.unattached.length, 2);
  assert.equal(open[0].fills[0].funding, undefined);
  assert.deepEqual(attachFunding([], [{ time: at(20), contract: "X", amount: 1 }], { open: [{ contract: "X", symbol: "X", opened: at(1), fills: [] }] }).unattached.map((e) => e.reason), ["open"]);
  assert.equal(engine.attachFunding, attachFunding);
});
