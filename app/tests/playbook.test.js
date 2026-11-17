import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRATEGIES, TRADES } from "../src/sample.js";
import { RULES_MAX, THESIS_MAX, WHEN_LEN, WHEN_MAX, chapterOf, chaptersOf, charCount, cleanThesis, cleanWhen, manualText, roman, whenTraded } from "../src/lib/playbook.js";

const trade = (o) => ({ id: "t", setup: "Sweep", symbol: "NQ", side: "long", hour: 10, r: 1, pnl: 100, followedPlan: true, ...o });

test("chapters are numbered in roman numerals", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9, 14, 40, 49].map(roman), ["I", "II", "III", "IV", "V", "IX", "XIV", "XL", "XLIX"]);
  assert.equal(roman(0), "0");
});

test("why it works is one tidy paragraph, never longer than the database allows", () => {
  assert.equal(cleanThesis("  Price runs\n\nthe high,   then snaps back. "), "Price runs the high, then snaps back.");
  assert.equal(cleanThesis("x".repeat(400)).length, THESIS_MAX);
  assert.equal(cleanThesis(null), "");
  assert.equal(cleanThesis(undefined), "");
});

test("when it's run is a few short lines, each once", () => {
  assert.deepEqual(cleanWhen("10:00–13:00 NY\n\n  NQ ·  ES \nnq · es\n"), ["10:00–13:00 NY", "NQ · ES"]);
  assert.deepEqual(cleanWhen(["a", "b", "c", "d", "e"]), ["a", "b", "c", "d"]);
  assert.equal(cleanWhen(["y".repeat(90)])[0].length, WHEN_LEN);
  assert.deepEqual(cleanWhen(null), []);
  assert.deepEqual(cleanWhen([null, 7, " "]), ["7"]);
});

test("characters are counted and cut the way the database counts them, never through an emoji", () => {
  const chart = String.fromCodePoint(0x1f4c8); // two code units, one character
  assert.equal(charCount(chart.repeat(3)), 3);
  const cut = cleanThesis(chart.repeat(300));
  assert.equal(charCount(cut), THESIS_MAX);
  assert.equal(cut, chart.repeat(THESIS_MAX));
  assert.equal(cleanWhen([`a${chart.repeat(60)}`])[0], `a${chart.repeat(WHEN_LEN - 1)}`);
});

test("the limits match the database's checks", () => {
  const sql = readFileSync(new URL("../supabase/migrations-pending/20261103120000_playbook_chapters.sql", import.meta.url), "utf8");
  assert.match(sql, new RegExp(`char_length\\(thesis\\) <= ${THESIS_MAX}\\b`));
  assert.match(sql, new RegExp(`cardinality\\(run_when\\) <= ${WHEN_MAX}\\b`));
  assert.match(sql, new RegExp(`array_to_string\\(run_when, ''\\)\\) <= ${WHEN_MAX * WHEN_LEN}\\b`));
  // Six rules of 120 characters fit the rules' size check twice over
  const [, size] = sql.match(/array_to_string\(rules, ''\)\) <= (\d+)/);
  assert.ok(RULES_MAX * 120 <= +size);
});

test("written chapters come first, then setups traded without rules", () => {
  const strategies = [{ id: "a", setup: "Sweep", name: "Liquidity sweep", rules: ["x"] }, { id: "b", setup: "VWAP", rules: ["y"] }];
  const trades = [trade({ setup: "Breakout" }), trade({ setup: "Sweep" })];
  const list = chaptersOf(strategies, ["Sweep", "VWAP", "Breakout", "Never traded"], trades);
  assert.deepEqual(list.map((c) => [c.key, c.n, c.name]), [["a", 1, "Liquidity sweep"], ["b", 2, "VWAP"], ["blank:Breakout", null, "Breakout"]]);
  assert.equal(list[2].strategy, null);
  assert.deepEqual(chaptersOf([], [], []), []);
});

test("the sample's liquidity sweep chapter: its A+ trade, its worst loss, its weakest hour", () => {
  const ch = chapterOf("Liquidity sweep", TRADES);
  assert.equal(ch.stats.trades, 17);
  assert.equal(ch.best.id, "T1011");
  assert.equal(ch.best.grade, "A+");
  assert.equal(ch.worst.id, "T1058");
  assert.equal(ch.worst.followedPlan, true);
  assert.equal(ch.weak.hour, 15);
  assert.equal(ch.weak.n, 2);
  assert.ok(Math.abs(ch.weak.r - -1.22) < 0.01);
  assert.equal(whenTraded(ch.best), "Wed 7 Oct · 10:06");
});

test("the example is the best trade that kept the plan, when there is one", () => {
  const trades = [trade({ id: "broke", r: 4, followedPlan: false }), trade({ id: "kept", r: 2 }), trade({ id: "unjudged", r: 1, followedPlan: null })];
  assert.equal(chapterOf("Sweep", trades).best.id, "kept");
  assert.equal(chapterOf("Sweep", [trade({ id: "only", r: 3, followedPlan: false })]).best.id, "only");
  assert.equal(chapterOf("Sweep", [trade({ r: -1 })]).best, null);
  assert.equal(chapterOf("Sweep", [trade({ r: 2 })]).worst, null);
});

test("trades without R are ranked by P&L instead", () => {
  const ch = chapterOf("Sweep", [trade({ id: "a", r: null, pnl: 50 }), trade({ id: "b", r: null, pnl: 300 }), trade({ id: "c", r: null, pnl: -80 })]);
  assert.equal(ch.ranked, false);
  assert.equal(ch.best.id, "b");
  assert.equal(ch.worst.id, "c");
  assert.equal(ch.weak, null);
});

test("a weakest hour needs two hours with two trades each to compare", () => {
  const one = [trade({ hour: 9, r: -1 }), trade({ hour: 9, r: -1 }), trade({ hour: 11, r: 3 })];
  assert.equal(chapterOf("Sweep", one).weak, null);
  const two = [...one, trade({ hour: 11, r: 2 })];
  assert.equal(chapterOf("Sweep", two).weak.hour, 9);
});

test("the shared manual carries each chapter's words and rules, never its numbers", () => {
  const chapters = chaptersOf(STRATEGIES, ["Range breakout"], TRADES);
  const text = manualText(chapters);
  assert.match(text, /^My playbook\n\nI\. Opening range retest\n/);
  assert.match(text, /II\. Liquidity sweep\n"Price runs the obvious high/);
  assert.match(text, /When I run it: 10:00–13:00 NY · NQ · ES · No entries 5 min around news/);
  assert.match(text, /1\. Sweep of the Asia or London high/);
  assert.doesNotMatch(text, /Range breakout/);
  assert.doesNotMatch(text, /\$|[+−-]\d+(\.\d+)?R\b|%/);
  assert.match(text, /Written in Marble · trademarble\.app$/);
});
