import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stats = read("../src/views/Analytics.jsx");
const finding = read("../src/drip/journal/Finding.jsx");
const css = read("../src/drip/stats/stats.css");
const charts = read("../src/drip/journal/charts.jsx");

test("the top of Stats is one row of pills, with no old bars left", () => {
  assert.doesNotMatch(stats, /MoneyBar view=/);
  assert.doesNotMatch(stats, /st-jump/);
  assert.doesNotMatch(stats, /"Your numbers"/);
  assert.match(stats, /<PeriodPick view=\{view\}/);
  assert.match(stats, /<AccountPick \/>/);
});

test("one strip of seven tabs, Ask among them", () => {
  assert.match(stats, /\["overview", "Overview"\], \["days", "Days"\], \["time", "Time"\], \["held", "Duration"\], \["markets", "Markets"\], \["habits", "Habits"\], \["ask", "Ask"\]/);
});

test("a day or a week leads with its own total, and keeps the cost lower down", () => {
  assert.match(stats, /span\.kind === "day" \|\| span\.kind === "week" \|\| found\.status !== "ok"/);
  assert.match(stats, /<CostPanel found=\{found\}/);
});

test("a range with no dates shows no number", () => {
  assert.match(stats, /span\.kind === "range" && !\(span\.from && span\.to\)/);
  assert.match(stats, /Set the dates/);
});

test("the ledger holds every old tile, and made and lost appear once", () => {
  for (const k of ["Fees", "Won", "Made for every $1 lost", "Average trade", "Average win", "Average loss", "Win size to loss size", "Biggest win", "Biggest loss", "Deepest fall"]) {
    assert.ok(stats.includes(`["${k}"`), k);
  }
  assert.equal((stats.match(/<dt>Money made<\/dt>/g) || []).length, 1);
  assert.equal((stats.match(/<span>Money made<\/span>/g) || []).length, 1);
  assert.doesNotMatch(stats, /<Tile k="Money made"/);
});

test("a cost is grey on black at one size, the same treatment as any loss", () => {
  assert.doesNotMatch(read("../src/drip/journal/journal.css"), /\.money\.loss \{ color: inherit/);
  assert.match(finding, /<Money value=\{net\} onBlack \/>/);
  assert.match(css, /font-size: min\(var\(--size\), calc\(100cqw \/ var\(--ems\)\)\)/);
});

test("chart lines are straight: nothing drawn between days that never happened", () => {
  assert.doesNotMatch(charts, /smooth\(|[0-9]C\$\{/);
  assert.match(charts, /const straight = /);
});

test("period words", async () => {
  const src = read("../src/drip/view.js");
  assert.match(src, /span\.kind === "month" && !span\.back \? monthName\(now\) : span\.label/);
});
