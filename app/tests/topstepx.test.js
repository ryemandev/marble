// node --test tests/   (from app/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { rootOf } from "../src/live/import/symbols.js";
import { agoLabel, alreadyLogged, buildSync, carriedFrom, kindOf, openChanged, toFills } from "../src/live/import/topstepx.js";
import { toRow } from "../src/live/import/engine.js";

let id = 1000;
const f = (contractId, side, size, price, at, pnl = null, extra = {}) => ({
  id: ++id, accountId: 7, contractId, creationTimestamp: `2026-10-27T${at}.123456+00:00`, price, profitAndLoss: pnl, fees: 0.37 * size, side, size, voided: false, orderId: id + 5000, ...extra,
});
const DAY = [
  f("CON.F.US.MNQ.Z26", 0, 1, 21000, "13:30:05"),
  f("CON.F.US.MNQ.Z26", 0, 1, 21002, "13:30:40"),
  f("CON.F.US.MNQ.Z26", 1, 1, 21010, "13:35:00", 20),
  f("CON.F.US.MNQ.Z26", 1, 1, 21020, "13:41:10", 36),
  f("CON.F.US.EP.Z26", 1, 2, 6000, "14:00:00"),
  f("CON.F.US.EP.Z26", 0, 2, 5995.5, "14:10:00", 450, { voided: true, id: 9999 }), // voided: ignored
  f("CON.F.US.EP.Z26", 0, 2, 5996, "14:12:00", 400),
  f("CON.F.US.ENQ.Z26", 0, 1, 21100, "15:00:00"),
];

test("topstep: contract ids map to the root the engine knows", () => {
  assert.equal(rootOf("CON.F.US.MNQ.Z26"), "MNQ");
  assert.equal(rootOf("CON.F.US.ENQ.Z26"), "NQ");
  assert.equal(rootOf("CON.F.US.EP.H27"), "ES");
  assert.equal(rootOf("CON.F.US.MES.Z26"), "MES");
});

test("topstep: fills are normalised (voided skipped, sides, UTC times, fees, closing P&L)", () => {
  const fills = toFills(DAY);
  assert.equal(fills.length, DAY.length - 1);
  assert.ok(!fills.some((x) => x.key === "tsx:9999"));
  assert.deepEqual(fills.slice(0, 3).map((x) => x.side), ["buy", "buy", "sell"]);
  assert.equal(fills[0].time.toISOString(), "2026-10-27T13:30:05.123Z");
  assert.equal(fills[0].commission, 0.37);
  assert.equal(fills[0].effect, "open");
  assert.equal(fills[2].effect, "close");
  assert.equal(fills[2].pnl, 20);
  assert.equal(fills[0].key, `tsx:${DAY[0].id}`);
  // Junk in, nothing out
  assert.deepEqual(toFills([{ id: 1, side: 2, size: 1, price: 1, contractId: "X", creationTimestamp: "2026-10-27T00:00:00Z" }, null, { id: 2, side: 0, size: 0, price: 1, contractId: "X", creationTimestamp: "2026-10-27T00:00:00Z" }]), []);
});

test("topstep: a day of fills becomes trades, with Topstep's own P&L and fees", () => {
  const { trades, open, orphans } = buildSync(DAY);
  assert.equal(trades.length, 2);
  const [mnq, es] = trades;
  assert.equal(mnq.symbol, "MNQ"); assert.equal(mnq.side, "long"); assert.equal(mnq.size, 2);
  assert.equal(mnq.entry, 21001); assert.equal(mnq.exit, 21015);
  assert.equal(mnq.gross, 56); assert.equal(mnq.commission, 1.48); assert.equal(mnq.net, 54.52);
  assert.ok(mnq.scaled && mnq.partial);
  assert.equal(es.symbol, "ES"); assert.equal(es.side, "short"); assert.equal(es.gross, 400); assert.equal(es.commission, 1.48);
  assert.equal(open.length, 1); assert.equal(open[0].symbol, "NQ");
  assert.equal(orphans.length, 0);
  const row = { ...toRow(mnq, { accountId: "acc", importId: null, risk: 100 }), source: "sync" };
  assert.equal(row.external_id, `f:CON.F.US.MNQ.Z26:tsx:${DAY[0].id}`);
  assert.equal(row.needs_review, true); assert.equal(row.r, 0.55); assert.equal(row.pnl, 54.52);
});

test("topstep: a re-sync over the same window makes the same keys, so nothing doubles", () => {
  const first = buildSync(DAY);
  const again = buildSync([...DAY.slice(2), ...DAY.slice(0, 2)]); // overlap, any order
  assert.deepEqual(again.trades.map((t) => t.key), first.trades.map((t) => t.key));
});

test("topstep: an open position carries to the next sync and finishes there", () => {
  const first = buildSync(DAY);
  const carried = first.open.flatMap((o) => o.fills);
  assert.equal(carriedFrom(carried), "2026-10-27T15:00:00.123Z");
  const close = f("CON.F.US.ENQ.Z26", 1, 1, 21125, "15:20:00", 500);
  const next = buildSync([close], { carried });
  assert.equal(next.trades.length, 1);
  assert.equal(next.trades[0].symbol, "NQ"); assert.equal(next.trades[0].gross, 500);
  assert.equal(next.trades[0].key, `f:CON.F.US.ENQ.Z26:tsx:${DAY[7].id}`);
  // A window that re-reads the open fill too counts it once
  const wide = buildSync([DAY[7], close], { carried });
  assert.equal(wide.trades.length, 1);
  assert.ok(openChanged(carried, next.open.flatMap((o) => o.fills)));
  assert.ok(!openChanged(carried, [...carried]));
});

test("topstep: an exit from before the window is set aside, not turned into a trade", () => {
  const { trades, orphans } = buildSync([f("CON.F.US.MNQ.Z26", 1, 1, 21010, "09:00:00", 12)]);
  assert.equal(trades.length, 0);
  assert.equal(orphans.length, 1);
});

test("topstep: trades already logged another way are spotted; account names give a kind; times read plainly", () => {
  const t = buildSync(DAY).trades[0];
  assert.ok(alreadyLogged(t, [{ source: "manual", symbol: "mnq", side: "long", traded_at: "2026-10-27T13:31:00Z" }]));
  assert.equal(alreadyLogged(t, [{ source: "sync", symbol: "MNQ", side: "long", traded_at: "2026-10-27T13:31:00Z" }]), null);
  assert.equal(alreadyLogged(t, [{ source: "manual", symbol: "MNQ", side: "short", traded_at: "2026-10-27T13:31:00Z" }]), null);
  assert.equal(kindOf("50KTC-V2-123456-7890"), "Evaluation");
  assert.equal(kindOf("EXPRESSFUNDED-50K-1"), "Funded");
  assert.equal(kindOf("XFA-100K-22"), "Funded");
  assert.equal(kindOf("PRAC-V2-1"), "Paper");
  assert.equal(kindOf("S1OCT2512345"), null);
  const now = Date.parse("2026-10-28T12:00:00Z");
  assert.equal(agoLabel("2026-10-28T11:58:00Z", now), "2 min ago");
  assert.equal(agoLabel("2026-10-28T11:59:50Z", now), "just now");
  assert.equal(agoLabel(null, now), "never");
});
