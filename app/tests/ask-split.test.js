import assert from "node:assert/strict";
import { test } from "node:test";
import { SPLITS, splitBy, splitsFor } from "../src/lib/oracle/split.js";

const t = (id, over) => ({ id, pnl: 0, hour: 10, side: "long", symbol: "NQ", setup: "", emotion: "", mistakes: [], ...over });

test("a split puts the costliest group first, and the sums add up", () => {
  const rows = splitBy([t(1, { setup: "ORB", pnl: 100 }), t(2, { setup: "ORB", pnl: -30 }), t(3, { setup: "Fade", pnl: -200 })], "setup");
  assert.deepEqual(rows.map((r) => [r.label, r.n, r.net]), [["Fade", 1, -200], ["ORB", 2, 70]]);
});

test("a trade with two mistakes shows under both", () => {
  const rows = splitBy([t(1, { mistakes: ["Chased", "Too big"], pnl: -50 })], "mistake");
  assert.deepEqual(rows.map((r) => r.label).sort(), ["Chased", "Too big"]);
});

test("cents don't drift", () => {
  assert.equal(splitBy([t(1, { pnl: 0.1 }), t(2, { pnl: 0.2 })], "side")[0].net, 0.3);
});

test("a split that can't tell anything apart isn't offered", () => {
  const ways = splitsFor([t(1, { symbol: "NQ" }), t(2, { symbol: "ES" })]).map((s) => s.id);
  assert.deepEqual(ways, ["symbol"]);
});

test("an untagged group is named, not hidden", () => {
  const rows = splitBy([t(1, { emotion: "Calm" }), t(2)], "feeling");
  assert.ok(rows.some((r) => r.label === "None tagged"));
});

test("the follow-ups are fixed choices with no free text", () => {
  assert.deepEqual(SPLITS.map((s) => s.id), ["setup", "symbol", "side", "hour", "feeling", "mistake"]);
});
