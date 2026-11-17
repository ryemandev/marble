import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/views/Profile.jsx", "utf8");
const css = readFileSync("src/drip/record.css", "utf8");

test("the record leads with the trader, not a page title", () => {
  assert.doesNotMatch(page, /Your profile\./);
  assert.match(page, /className="pr-pencil"/);
  assert.match(page, /if \(!editing\) return/);
});

test("win rate and R are gone from the profile", () => {
  assert.doesNotMatch(page, /Win rate/);
  assert.doesNotMatch(page, /R multiples/);
  assert.doesNotMatch(page, /fmtR/);
});

test("every closed day has one height, and a no-trade day is a row like any other", () => {
  assert.match(css, /\.pr-day \{[^}]*height: 44px/);
  assert.match(page, /No trades/);
  assert.match(css, /\.pr-day b\.down \{ color: var\(--text-2\)/);
  assert.doesNotMatch(css, /\.pr-day b\.down[^}]*font-size/);
});

test("the rows read the same money as the calendar, and say when it is simulated", () => {
  assert.match(page, /useMoney\("stats"\)/);
  assert.match(page, /kindWord\(kinds\)/);
  assert.match(page, /"Sample data"/);
});

test("alerts and your data stay one tap away", () => {
  assert.match(page, /<Alerts \/>/);
  assert.match(page, /<YourData /);
  assert.match(page, /Profile, alerts and your data/);
});
