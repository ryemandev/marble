import { test } from "node:test";
import assert from "node:assert/strict";
import { before, spanOf } from "../src/drip/view.js";
import { statsOf } from "../src/drip/stats/model.js";

const NOON = Date.UTC(2026, 10, 5, 12);

test("a range with a date that isn't one waits for dates, and doesn't throw", () => {
  for (const [from, to] of [["20261-11-01", "2026-11-02"], ["nope", "worse"], ["2026-13-40", "2026-11-02"], [5, {}], ["", null]]) {
    const s = spanOf({ kind: "range", from, to }, NOON);
    assert.equal(s.label, "Set a range");
    assert.equal(before(s), null);
  }
});

test("a range the wrong way round is put the right way", () => {
  const s = spanOf({ kind: "range", from: "2026-11-05", to: "2026-11-01" }, NOON);
  assert.deepEqual([s.from, s.to], ["2026-11-01", "2026-11-05"]);
  assert.equal(before(s).to, "2026-10-31");
});

test("months step over the year and keep their last day", () => {
  assert.deepEqual([spanOf({ kind: "month", back: 11 }, NOON).from, spanOf({ kind: "month", back: 11 }, NOON).to], ["2025-12-01", "2025-12-31"]);
  assert.equal(spanOf({ kind: "month", back: 9 }, NOON).to, "2026-02-28");
});

test("small dollars keep clean labels on the chart of results", () => {
  const ts = [-0.8, 0.3, 0.5].map((pnl, i) => ({ id: i, pnl, dayKey: "2026-11-02", time: "10:00" }));
  const { shape } = statsOf(ts);
  assert.ok(shape.length > 0);
  for (const bar of shape) {
    assert.match(bar.label, /^−?\$\d+(\.\d{1,2})?k?$/, bar.label);
    assert.match(bar.title, /^−?\$[\d.]+ to −?\$[\d.]+$/, bar.title);
  }
  assert.equal(shape.reduce((n, b) => n + b.value, 0), 3);
});
