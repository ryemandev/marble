// The demo's sample month. It has to read like a real trader's month, never like a run of wins, and every
// figure a screen shows has to come from these same trades. Change a number here only with the trades.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACCOUNTS, HISTORY, SAMPLE, TRADES } from "../src/sample.js";
import { prepare } from "../src/lib/oracle/prepare.js";
import { findLeak } from "../src/lib/finding.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const sum = (ts) => ts.reduce((a, t) => a + t.pnl, 0);
const REAL = new Set(ACCOUNTS.filter((a) => a.status === "funded" || a.status === "live").map((a) => a.id));
const real = (ts) => ts.filter((t) => REAL.has(t.account));
const sim = (ts) => ts.filter((t) => !REAL.has(t.account));
const TODAY = 27;
const weekdays = Array.from({ length: TODAY }, (_, i) => i + 1).filter((d) => ![0, 6].includes(new Date(2026, 9, d).getDay()));
const dayNet = (d, ts = TRADES) => sum(ts.filter((t) => t.day === d));
const steps = (d, account) => TRADES.filter((t) => t.day === d && t.account === account).sort((a, b) => a.time.localeCompare(b.time)).map((t) => t.pnl);
const EVERY = [...TRADES, ...HISTORY];

test("October is a believable month: about half the trades lose and the days are mixed", () => {
  assert.equal(TRADES.length, 64);
  assert.equal(sum(TRADES), 1840);
  assert.deepEqual([TRADES.filter((t) => t.pnl > 0).length, TRADES.filter((t) => t.pnl < 0).length], [31, 33], "48% won");
  const before = weekdays.filter((d) => d < TODAY);
  assert.equal(before.filter((d) => dayNet(d) > 0).length, 9, "days up");
  assert.equal(before.filter((d) => dayNet(d) < 0).length, 7, "days down");
  assert.deepEqual(before.filter((d) => !TRADES.some((t) => t.day === d)), [2, 14], "weekdays with no trades");
  assert.equal(dayNet(13), -1400, "the one bad day");
  assert.equal(Math.min(...before.filter((d) => d !== 13).map((d) => dayNet(d))), -520, "no other day comes near it");
  assert.equal(Math.max(...weekdays.map((d) => dayNet(d))), 940, "and no day is a windfall");
  assert.ok(Math.max(...TRADES.map((t) => t.pnl)) < 700 && Math.min(...TRADES.map((t) => t.pnl)) > -400, "no single trade carries the month");
});

test("real money and simulated money are each modest, and add up to every trade", () => {
  assert.deepEqual([sum(real(TRADES)), sum(sim(TRADES))], [1152, 688], "October");
  assert.deepEqual([sum(real(EVERY)), sum(sim(EVERY))], [3977, 2586], "all time");
  assert.equal(sum(EVERY), 6563);
  assert.ok(weekdays.filter((d) => dayNet(d, real(TRADES)) < 0).length >= 6, "the real money has red days of its own");
  const months = ["2026-06", "2026-07", "2026-08", "2026-09"].map((m) => sum(HISTORY.filter((t) => t.month === m)));
  assert.deepEqual(months, [2016, -71, 2489, 289], "the older months, one of them red");
  const won = EVERY.filter((t) => t.pnl > 0).length, lost = EVERY.filter((t) => t.pnl < 0).length;
  assert.ok(won / (won + lost) < 0.5, "under half of all trades win");
  const days = {};
  for (const t of HISTORY) days[t.dayKey] = (days[t.dayKey] || 0) + t.pnl;
  assert.ok(Math.min(...Object.values(days)) > -1400 && Math.max(...Object.values(days)) < 1000, "no older day outdoes October's");
});

test("the evaluations have no trades from before the Money tab shows them paid for", () => {
  assert.ok(HISTORY.filter((t) => t.account === "ftmo").every((t) => t.dayKey >= "2026-08-18"));
  assert.ok(HISTORY.filter((t) => t.account === "apex").every((t) => t.dayKey >= "2026-09-22"));
  assert.ok(HISTORY.some((t) => t.account === "ftmo") && HISTORY.some((t) => t.account === "apex"));
});

test("this week is the week the website shows: Monday -$306, today +$467, both on the funded account", () => {
  assert.deepEqual(steps(26, "topstep"), [120, -390, 214, -250]);
  assert.deepEqual(steps(27, "topstep"), [558, -306, 215]);
  assert.equal(sum(real(TRADES.filter((t) => t.day >= 26))), 161);
  assert.ok(TRADES.filter((t) => t.day === TODAY).every((t) => t.account === "topstep" && t.time < "13:52"), "today is funded money only, and nothing is later than now");
  const close = read("../src/site/home/DayClose.jsx"), cards = read("../src/site/home/Cards.jsx");
  assert.ok(close.includes(`["Today", "+$467"], ["This week", "+$161"]`));
  assert.ok(close.includes(`title: "Day 19", when: "27 Oct", money: 467, stage: "funded", steps: [558, -306, 215]`));
  assert.ok(cards.includes(`title: "Day 18", when: "26 Oct", money: -306, stage: "funded", steps: [120, -390, 214, -250]`));
});

test("eighteen days are closed, the two with no trades among them, and today is the one left open", () => {
  const closed = Object.keys(SAMPLE.CLOSES).sort();
  assert.equal(closed.length, 18, "so closing today makes Day 19");
  assert.deepEqual(closed, weekdays.filter((d) => d < TODAY).map((d) => `2026-10-${String(d).padStart(2, "0")}`));
  assert.ok(closed.includes("2026-10-02") && closed.includes("2026-10-14"));
  assert.ok(!closed.includes("2026-10-27"));
});

test("nothing in the sample came from a broker, so no sample card can say Verified", () => {
  assert.ok(EVERY.every((t) => t.source === "import" || t.source === "manual"));
});

test("each account's balance is where it started plus every trade on it, and none has crossed its firm's line", () => {
  const START = { apex: 150000, topstep: 50000, ftmo: 100000, ibkr: 24000 };
  for (const a of ACCOUNTS) assert.equal(a.balance, START[a.id] + sum(EVERY.filter((t) => t.account === a.id)), a.id);
  assert.deepEqual(ACCOUNTS.map((a) => a.balance), [150319, 53272, 102267, 24705]);
  // Topstep and Apex: never further below the highest close of a day than the firm allows
  for (const [id, most] of [["topstep", 2000], ["apex", 5000]]) {
    const days = {};
    for (const t of EVERY.filter((x) => x.account === id)) { const k = t.dayKey || `2026-10-${String(t.day).padStart(2, "0")}`; days[k] = (days[k] || 0) + t.pnl; }
    let at = 0, high = 0, deepest = 0;
    for (const k of Object.keys(days).sort()) { at += days[k]; deepest = Math.min(deepest, at - high); high = Math.max(high, at); }
    assert.ok(deepest > -most, `${id} fell ${-deepest} from a high, under ${most}`);
    const a = ACCOUNTS.find((x) => x.id === id);
    assert.ok(a.room > 0 && a.room <= a.roomOf && a.roomOf === most, `${id} room`);
  }
  const topstep = {};
  for (const t of EVERY.filter((x) => x.account === "topstep")) { const k = t.dayKey || t.day; topstep[k] = (topstep[k] || 0) + t.pnl; }
  assert.ok(Math.min(...Object.values(topstep)) > -1000, "Topstep never lost its daily limit");
});

test("the biggest cost is a real pattern in the trades: the last hour, this month and all time", () => {
  const month = findLeak(prepare(TRADES, { cal: { year: 2026, month: 9 } }));
  assert.deepEqual([month.status, month.id, month.net, month.n, month.won, Math.round(month.share * 100)], ["ok", "hour-15", -2075, 10, 2, 32]);
  assert.equal(month.setup, null, "so it stands over the Narcissus, not a setup's picture");
  const all = findLeak(prepare(EVERY, { cal: { year: 2026, month: 9 } }));
  assert.deepEqual([all.status, all.id, all.net, all.n, all.won, Math.round(all.share * 100)], ["ok", "hour-15", -5190, 24, 2, 23]);
});

test("the example desk in the real app keeps the sample's own days and accounts", async () => {
  const mine = Object.fromEntries(ACCOUNTS.map((a) => [`ex-${a.id}`, sum(TRADES.filter((t) => t.account === a.id))]));
  const { buildExample } = await import("../src/live/exampleData.js");
  const ex = buildExample();
  assert.equal(ex.logged.length, 64);
  assert.equal(sum(ex.logged), 1840);
  for (const [id, net] of Object.entries(mine)) assert.equal(sum(ex.logged.filter((t) => t.account === id)), net, id);
  assert.deepEqual(ex.accounts.map((a) => a.balance + mine[a.id]), ACCOUNTS.map((a) => a.balance), "a tracker shows the same balance as the demo");
  assert.ok(new Set(ex.logged.map((t) => t.traded_at.slice(0, 10))).size <= 18, "trades sit on the sample's seventeen days, never spread over every weekday");
});
