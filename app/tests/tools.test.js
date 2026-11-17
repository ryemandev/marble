import { test } from "node:test";
import assert from "node:assert/strict";
import { floorOf, instrumentOf, ladder, lossesToDaily, lossesToFloor, positionSize } from "../src/site/tools/math.js";

test("losses to the floor: a loss that lands on it counts, nothing left is zero, no risk is no answer", () => {
  assert.equal(lossesToFloor(2000, 500), 4);
  assert.equal(lossesToFloor(2000, 450), 5);
  assert.equal(lossesToFloor(1999.99, 500), 4);
  assert.equal(lossesToFloor(0, 500), 0);
  assert.equal(lossesToFloor(2000, 0), null);
  assert.equal(lossesToFloor("", 500), null);
  assert.equal(lossesToDaily(1000, 300), 4);
});

test("the floor: static, trailing from the high, and a trailing floor that stops at the start", () => {
  assert.equal(floorOf({ start: 50000, drawdown: 2000 }), 48000);
  assert.equal(floorOf({ start: 50000, drawdown: 2000, peak: 51200, type: "trailing_eod" }), 49200);
  assert.equal(floorOf({ start: 50000, drawdown: 2000, peak: 53000, type: "trailing_eod", lockAt: 50000 }), 50000);
  assert.equal(floorOf({ start: 50000, drawdown: 2000, peak: 49000, type: "trailing_intraday" }), 48000, "a peak under the start trails from the start");
  assert.equal(floorOf({ start: 0, drawdown: 2000 }), null);
  assert.deepEqual(ladder(50000, 48000, 600), [49400, 48800, 48200, 48000]);
});

test("position size: whole contracts rounded down, ticks or points, lots for forex", () => {
  assert.deepEqual(positionSize({ risk: 500, stop: 20, instrument: "NQ", unit: "points" }), { size: 1, unit: "contract", perOne: 400, atStop: 400, ticks: 80 });
  // $500 at 8 ES ticks: $100 a contract → 5
  assert.equal(positionSize({ risk: 500, stop: 8, instrument: "ES" }).size, 5);
  assert.equal(positionSize({ risk: 50, stop: 8, instrument: "ES" }).size, 0, "less than one contract's risk is zero, not one");
  // $300 at 25 pips on EUR/USD: $250 a lot → 1.2 lots
  const fx = positionSize({ risk: 300, stop: 25, instrument: "EURUSD" });
  assert.equal(fx.size, 1.2);
  assert.equal(fx.unit, "lots");
  assert.equal(positionSize({ risk: 0, stop: 8, instrument: "ES" }), null);
  assert.equal(instrumentOf("nope").id, "ES");
});
