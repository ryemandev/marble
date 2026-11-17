import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORM, buildHyperliquid, positionsOf, toFills, toFunding } from "../supabase/functions/_shared/import/hyperliquid.js";
import { toRow } from "../supabase/functions/_shared/import/engine.js";
import { planSync } from "../supabase/functions/_shared/import/sync-plan.js";

const pick = (t, ...k) => k.map((x) => t[x]);

const DOCS_FILL = {
  closedPnl: "0.0", coin: "AVAX", crossed: false, dir: "Open Long", hash: "0xa166e3fa63c25663024b03f2e0da011a00307e4017465df020210d3d432e7cb8",
  oid: 90542681, px: "18.435", side: "B", startPosition: "26.86", sz: "93.53", time: 1681222254710, fee: "0.01", feeToken: "USDC", builderFee: "0.01", tid: 118906512037719,
};
const DOCS_FUNDING = { delta: { coin: "ETH", fundingRate: "0.0000417", szi: "49.1477", type: "funding", usdc: " -3.625312", nSamples: null }, hash: "0xa166e3fa63c25663024b03f2e0da011a00307e4017465df020210d3d432e7cb8", time: 1681222254710 };

// A day of fills from one wallet, shaped like the example
const T0 = Date.UTC(2026, 9, 27, 13, 0, 0);
let tid = 500;
const F = (coin, side, sz, px, min, dir, start, extra = {}) => ({
  closedPnl: "0.0", coin, crossed: true, dir, hash: "0x", oid: tid + 9000, px: String(px), side, startPosition: String(start), sz: String(sz), time: T0 + min * 60e3, fee: "0.5", feeToken: "USDC", tid: ++tid, ...extra,
});
const FUND = (coin, usdc, min) => ({ delta: { coin, fundingRate: "0.0000125", szi: "1", type: "funding", usdc: String(usdc) }, hash: "0x", time: T0 + min * 60e3 });
const DAY = [
  { ...DOCS_FILL, time: T0 - 5 * 60e3 },
  F("AVAX", "A", 120.39, 18.5, 5, "Close Long", 120.39),
  F("BTC", "B", 0.1, 67000, 10, "Open Long", 0, { fee: "2.345" }),
  F("BTC", "A", 0.1, 67500, 130, "Close Long", 0.1, { fee: "-0.335", crossed: false, closedPnl: "50.0" }),
  F("ETH", "B", 1, 3500, 20, "Open Long", 0),
  F("ETH", "A", 3, 3450, 40, "Long > Short", 1, { closedPnl: "-50.0" }),
  F("ETH", "B", 2, 3400, 80, "Close Short", -2, { closedPnl: "100.0" }),
  F("SOL", "A", 10, 150, 30, "Open Short", 0),
  F("SOL", "B", 10, 165, 90, "Close Short", -10, { liquidation: { liquidatedUser: "0xabc", markPx: "165.1", method: "market" }, closedPnl: "-150.0" }),
  F("@107", "B", 5, 30, 50, "Buy", 0),
  F("PURR/USDC", "B", 5, 0.2, 51, "Buy", 0),
  F("xyz:XYZ100", "B", 1, 100, 60, "Open Long", 0),
];
const FUNDING = [FUND("BTC", -0.5, 60), FUND("BTC", 0.2, 120), DOCS_FUNDING, FUND("xyz:XYZ100", -0.01, 120), FUND("ETH", -0.3, 60)];

test("hyperliquid: the docs' fill becomes a fill (maker, signed fee, the key, perps only)", () => {
  const [f] = toFills([DOCS_FILL]);
  assert.deepEqual(pick(f, "key", "contract", "side", "qty", "price", "commission", "maker", "effect", "startPosition", "multiplier", "liquidated", "account"),
    ["hl:AVAX:118906512037719:1681222254710", "AVAX", "buy", 93.53, 18.435, 0.01, true, "open", 26.86, 1, false, null]);
  assert.equal(f.time.toISOString(), "2023-04-11T14:10:54.710Z");
  assert.equal(PLATFORM, "hyperliquid-sync");
  const fills = toFills(DAY);
  assert.ok(!fills.some((x) => x.contract.startsWith("@") || x.contract.includes("/")));
  assert.ok(fills.some((x) => x.contract === "XYZ:XYZ100" && x.key.startsWith("hl:xyz:XYZ100:")));
  assert.equal(toFills([{ ...DOCS_FILL, coin: "longdexname:SOMECOIN" }])[0].contract, "LONGDEXNAME:SOME");
  // Taker, and a maker rebate
  const btc = fills.filter((x) => x.contract === "BTC");
  assert.deepEqual(btc.map((x) => [x.maker, x.commission]), [[false, 2.345], [true, -0.335]]);
  // Junk in, nothing out
  assert.deepEqual(toFills([null, { coin: "BTC", side: "X", sz: "1", px: "1", time: T0 }, { coin: "BTC", side: "B", sz: "0", px: "1", time: T0 }, { coin: "", side: "B", sz: "1", px: "1", time: T0 }]), []);
});

test("hyperliquid: a flip is split where the old position ends; a liquidation says so", () => {
  const flip = toFills([F("ETH", "A", 3, 3450, 40, "Long > Short", 1)]);
  assert.deepEqual(flip.map((x) => [x.key.endsWith("~2"), x.qty, x.effect, Math.round(x.commission * 1e6) / 1e6]), [[false, 1, "close", 0.166667], [true, 2, "open", 0.333333]]);
  assert.equal(toFills([{ ...F("ETH", "A", 3, 3450, 40, "Long > Short", 1), startPosition: undefined }]).length, 1);
  const liq = toFills([F("SOL", "B", 10, 165, 90, "Close Short", -10, { liquidation: { markPx: "165.1", method: "market" } })])[0];
  assert.equal(liq.liquidated, true);
  assert.equal(toFills([F("SOL", "B", 10, 165, 90, "Market Order Liquidation: Close Short", -10)])[0].liquidated, true);
  assert.equal(toFills([F("SOL", "B", 10, 165, 90, "Auto-Deleveraging", -10)])[0].liquidated, true); // still has a side, so it's a fill
});

test("hyperliquid: funding is signed, + received", () => {
  assert.deepEqual(toFunding([DOCS_FUNDING]).map((e) => [e.contract, e.amount, e.time.toISOString()]), [["ETH", -3.625312, "2023-04-11T14:10:54.710Z"]]);
  assert.deepEqual(toFunding([FUND("BTC", 0.2, 0), { delta: { type: "deposit", usdc: "100" }, time: T0 }, { delta: { coin: "BTC", type: "funding", usdc: "0" }, time: T0 }, null]).map((e) => e.amount), [0.2]);
});

test("hyperliquid: a day of fills becomes trades with maker/taker fees, funding and liquidations", () => {
  const { trades, open, orphans, unattachedFunding } = buildHyperliquid(DAY, FUNDING);
  assert.deepEqual(trades.map((t) => [t.symbol, t.side]), [["BTC", "long"], ["ETH", "long"], ["SOL", "short"], ["ETH", "short"]]);
  const [btc, ethLong, sol, ethShort] = trades;
  assert.deepEqual(pick(btc, "size", "entry", "exit", "gross", "commission", "feeMaker", "feeTaker", "funding", "net", "liquidated", "pointValue"),
    [0.1, 67000, 67500, 50, 2.01, -0.335, 2.345, -0.3, 47.69, false, 1]);
  assert.deepEqual(pick(ethLong, "size", "gross", "commission", "funding", "net"), [1, -50, 0.666667, null, -50.666667]);
  assert.deepEqual(pick(ethShort, "size", "entry", "exit", "gross", "commission", "funding", "net"), [2, 3450, 3400, 100, 0.833333, -0.3, 98.866667]);
  assert.ok(ethShort.key.endsWith("~2"));
  assert.deepEqual(pick(sol, "gross", "commission", "net", "liquidated"), [-150, 1, -151, true]);
  assert.deepEqual(orphans.map((x) => [x.contract, x.side, x.qty]), [["AVAX", "buy", 93.53], ["AVAX", "sell", 120.39]]);
  assert.deepEqual(open.map((o) => [o.symbol, o.side, o.qty]), [["XYZ:XYZ100", "long", 1]]);
  assert.deepEqual(pick(open[0].fills[0], "funding", "fundingTo", "maker", "multiplier"), [-0.01, "2026-10-27T15:00:00.000Z", false, 1]);
  assert.deepEqual(unattachedFunding.map((e) => [e.contract, e.amount, e.reason]), [["ETH", -3.625312, "no trade"]]);
  assert.deepEqual(buildHyperliquid([...DAY].reverse(), FUNDING).trades.map((t) => t.key), trades.map((t) => t.key));
});

test("hyperliquid: an open position carries to the next sync and finishes there, its funding counted once", () => {
  const first = buildHyperliquid(DAY, FUNDING);
  const carried = first.open.flatMap((o) => o.fills);
  const close = F("xyz:XYZ100", "A", 1, 104, 300, "Close Long", 1, { crossed: false, fee: "-0.02" });
  const next = buildHyperliquid([close], [FUND("xyz:XYZ100", -0.01, 120), FUND("xyz:XYZ100", -0.02, 180)], { carried });
  assert.equal(next.trades.length, 1);
  const t = next.trades[0];
  assert.deepEqual(pick(t, "symbol", "size", "gross", "commission", "feeMaker", "feeTaker", "funding", "net"), ["XYZ:XYZ100", 1, 4, 0.48, -0.02, 0.5, -0.03, 3.49]);
  assert.equal(t.key, `f:XYZ:XYZ100:hl:xyz:XYZ100:${DAY[11].tid}:${DAY[11].time}`);
  assert.deepEqual(next.orphans, []);
  const wide = buildHyperliquid([DAY[11], close], [FUND("xyz:XYZ100", -0.01, 120), FUND("xyz:XYZ100", -0.02, 180)], { carried });
  assert.deepEqual(wide.trades.map((x) => [x.key, x.funding, x.net]), [[t.key, -0.03, 3.49]]);
});

test("hyperliquid: rows for the database carry the crypto numbers, through the same sync plan", () => {
  const result = buildHyperliquid(DAY, FUNDING);
  const row = toRow(result.trades[0], { accountId: "acc", importId: null, risk: 25 });
  assert.deepEqual(pick(row, "symbol", "side", "pnl", "commission", "funding", "fee_maker", "fee_taker", "leverage", "liq_price", "r"), ["BTC", "long", 47.69, 2.01, -0.3, -0.335, 2.345, null, null, 1.91]);
  assert.deepEqual(row.fills.list.map((x) => x.maker), [false, true]);
  assert.equal(toRow(result.trades[2], { accountId: "acc", importId: null, risk: null }).fills.liquidated, true);
  const plan = planSync({ result, accountId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(plan.rows.length, 4);
  assert.ok(plan.rows.every((r) => r.source === "sync" && "funding" in r && "fee_maker" in r));
  assert.equal(plan.openFills.length, 1);
  assert.equal(plan.openFills[0].funding, -0.01);
});

test("hyperliquid: open positions with leverage and the distance to liquidation", () => {
  const state = {
    assetPositions: [
      { type: "oneWay", position: { coin: "BTC", szi: "0.5", entryPx: "67000", leverage: { type: "cross", value: 10 }, liquidationPx: "61000", positionValue: "33750", unrealizedPnl: "250", marginUsed: "3375" } },
      { type: "oneWay", position: { coin: "ETH", szi: "-2", entryPx: "3500", leverage: { type: "isolated", value: 5, rawUsd: "8400" }, liquidationPx: "4150", positionValue: "7000" } },
      { type: "oneWay", position: { coin: "xyz:XYZ100", szi: "3", entryPx: "100", leverage: { type: "isolated", value: 2 }, liquidationPx: null } },
      { type: "oneWay", position: { coin: "SOL", szi: "0", entryPx: "150", leverage: { type: "cross", value: 3 }, liquidationPx: null } },
    ],
  };
  assert.deepEqual(positionsOf(state), [
    { symbol: "BTC", side: "long", size: 0.5, entry: 67000, leverage: 10, liqPrice: 61000, markPrice: 67500, distancePct: 9.63 }, // (67500 - 61000) / 67500
    { symbol: "ETH", side: "short", size: 2, entry: 3500, leverage: 5, liqPrice: 4150, markPrice: 3500, distancePct: 18.57 },
    { symbol: "XYZ:XYZ100", side: "long", size: 3, entry: 100, leverage: 2, liqPrice: null, distancePct: null }, // no mark, no liquidation price
  ]);
  assert.equal(positionsOf(state, { marks: { BTC: 64000 } })[0].distancePct, 4.69);
  const bare = positionsOf({ assetPositions: [{ position: { coin: "BTC", szi: "1", entryPx: "60000", leverage: { value: 20 }, liquidationPx: "57000" } }] });
  assert.deepEqual(pick(bare[0], "markPrice", "distancePct"), [undefined, 5]);
  assert.deepEqual(positionsOf(null), []);
});
