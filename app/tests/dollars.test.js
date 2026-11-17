import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CURRENCIES, SYMBOL, money, totals } from "../src/views/money/model.js";
import { MONEY_SAMPLE } from "../src/views/money/sample.js";
import { QUESTIONS, ask, prepare } from "../src/lib/oracle/index.js";
import { nyInstant } from "../src/live/time.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

// The money theme: dollars lead, R is there only where the data needs it, and rules aren't the headline
test("logging a trade leads with dollars, not R or grades", () => {
  const form = read("../src/components/Dialogs.jsx");
  assert.doesNotMatch(form, /works out R\b|Rules you kept decide/);
  // Dollars first since 6 Nov 2026: the dollars are the third thing asked, in their own box, and R isn't asked at all.
  // The old line under the title went with the fields it explained; the box says when Marble worked the dollars out.
  const fields = form.slice(form.indexOf("function TradeForm"), form.indexOf("/* ---------- A setup, new or edited"));
  const dollars = fields.indexOf('htmlFor="lt-dollars"'), entry = fields.indexOf('label="Entry"');
  assert.ok(dollars > 0 && entry > 0 && dollars < entry, "the dollars field comes first");
  assert.match(fields, /\{crypto \? "Dollars, after fees and funding" : "Dollars"\}/);
  assert.match(fields, /Worked out from your entry, exit and size\./);
  assert.doesNotMatch(fields, /Result in R|"P&L in dollars"|Fill in the prices and Marble works out the dollars\.|<Grade/);
});

test("the trader's stopping points are called limits wherever they're set", () => {
  for (const f of ["../src/components/Dialogs.jsx", "../src/components/LimitsSaved.jsx", "../src/drip/journal/Ask.jsx", "../src/lib/oracle/questions.js"]) {
    assert.doesNotMatch(read(f), /["'`>][^"'`<]*\b[Dd]aily rules?\b/, f);
  }
});

test("dollars come first on a receipt: the default, the first choice and the demo", () => {
  assert.equal(CURRENCIES[0], "USD");
  assert.equal(SYMBOL.USD, "$");
  assert.equal(money(4900), "$49.00");
  assert.ok(MONEY_SAMPLE.every((e) => e.currency === "USD"));
  assert.equal(totals(MONEY_SAMPLE).length, 1);
  assert.match(read("../src/views/money/Receipt.jsx"), /currency = "USD"/);
  assert.match(read("../src/views/money/hooks.js"), /: "USD"/);
});

const NOW = +nyInstant(2026, 9, 27, 13, 52);
const trade = (i, setup, pnl, r) => ({ id: `s${i}`, symbol: "NQ", side: "long", setup, pnl, r, day: (i % 20) + 1, date: `Oct ${(i % 20) + 1}`, weekday: (i % 5) + 1, time: "10:00", hour: 10 });

test("which setup paid most is answered in dollars, even when R says otherwise", () => {
  // Big R on small money against small R on big money: the money decides
  const trades = [
    ...Array.from({ length: 6 }, (_, i) => trade(i, "Small size", 100, 3)),
    ...Array.from({ length: 6 }, (_, i) => trade(i + 6, "Big size", 900, 1)),
  ];
  const a = ask("setups", { prepared: prepare(trades, { cal: { year: 2026, month: 9 } }), now: NOW }, { scope: "all" });
  assert.equal(a.status, "ok");
  assert.match(a.headline, /^Big size has paid the most, at \+\$900 a trade across 6 trades, and Small size the least, at \+\$100 across 6/);
  assert.doesNotMatch(a.headline, /\dR\b|by R/);
  assert.equal(a.key, "+$900");
  assert.ok(!a.facts.some((f) => /\dR\b/.test(f)), "dollars only: R is never an answer");
});

test("no question or answer on the Ask menu headlines rules, R or grades as the point", () => {
  for (const q of QUESTIONS) assert.doesNotMatch(q.text({ weekday: 1 }), /\bR\b|\brules?\b/i, q.id);
  assert.doesNotMatch(read("../src/lib/oracle/questions.js"), /headline: `[^`]*\b(rules|broke a rule)\b/);
});
