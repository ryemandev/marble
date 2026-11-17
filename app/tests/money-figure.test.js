import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drawMoney, measureMoney, moneyParts, shortMoney } from "../src/lib/money.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("a figure splits into its sign and $, its digits and its commas", () => {
  assert.deepEqual(moneyParts("+$1,840"), { pre: "+$", digits: ["1", ",", "840"] });
  assert.deepEqual(moneyParts("−$825"), { pre: "−$", digits: ["825"] });
  assert.deepEqual(moneyParts("-$12,400"), { pre: "−$", digits: ["12", ",", "400"] });
  assert.deepEqual(moneyParts("$0"), { pre: "$", digits: ["0"] });
  assert.deepEqual(moneyParts("$250.50"), { pre: "$", digits: ["250.50"] });
  assert.deepEqual(moneyParts("Closed"), { pre: "", digits: ["Closed"] }, "words pass through");
});

test("one K format: capital K, one decimal at most, a real minus, no pounds and no R", () => {
  assert.equal(shortMoney(1840), "+$1.8K");
  assert.equal(shortMoney(-12240), "−$12.2K");
  assert.equal(shortMoney(2000), "+$2K");
  assert.equal(shortMoney(-640), "−$640");
  assert.equal(shortMoney(640, { sign: false }), "$640");
  assert.equal(shortMoney(1250000), "+$1.3M");
  assert.equal(shortMoney(NaN), "–");
});

test("on a canvas the sign and $ go up at the page's proportions, and the width adds up", () => {
  const drawn = [];
  const ctx = { font: "", letterSpacing: "0px", measureText: (t) => ({ width: t.length * parseFloat(ctx.font) * 0.5 }), fillText: (t, x, y) => drawn.push({ t, x, y, font: ctx.font }) };
  const font = (px) => `${px}px`;
  const w = measureMoney(ctx, "+$1,840", 100, font);
  assert.ok(w > 0);
  drawMoney(ctx, "+$1,840", 10, 200, 100, font);
  assert.deepEqual(drawn.map((d) => d.t), ["+$", "1", ",", "840"]);
  assert.ok(Math.abs(drawn[0].y - (200 - 100 * 0.56 * 0.62)) < 1e-9, "hung at the top of the digits");
  assert.equal(Math.round(parseFloat(drawn[0].font)), 56);
  assert.equal(Math.round(parseFloat(drawn[2].font)), 80, "the comma is smaller");
  assert.equal(drawn[1].y, 200);
  assert.equal(ctx.letterSpacing, "0.00px", "tracking is put back");
});

test("every big figure is the one Money, with no count-up left on it", () => {
  for (const f of ["../src/views/Journal.jsx", "../src/views/Analytics.jsx", "../src/drip/journal/Detail.jsx", "../src/drip/journal/DayBox.jsx", "../src/drip/journal/Finding.jsx", "../src/drip/DailyClose.jsx"]) {
    const s = read(f);
    assert.match(s, /<Money value=/, f);
    assert.doesNotMatch(s, /\brolled\b/, f);
  }
  assert.match(read("../src/views/Flex.jsx"), /<MoneyText text=\{figure\} \/>/);
  assert.match(read("../src/drip/desk/DeskPlate.jsx"), /<Money value=\{net\} onBlack \/>/);
  const css = read("../src/drip/money.css");
  assert.doesNotMatch(css, /tabular/, "no even-width digits on big figures");
  assert.match(read("../src/drip/drip.css"), /--loss-ink: #5a5a58;/);
});
