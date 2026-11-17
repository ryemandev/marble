import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasDetail, reviewOf, signedDollars, splitDollars, workOut } from "../src/lib/trade.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const base = { symbol: "NQ", side: "long", time: "09:41", date: "2026-11-05", note: "", size: "1" };
const form = () => { const all = read("../src/components/Dialogs.jsx"); return all.slice(all.indexOf("function TradeForm"), all.indexOf("/* ---------- A setup, new or edited")); };

/* ---------- The dollars ---------- */

test("typed dollars take their sign from the buttons and are saved as typed", () => {
  assert.equal(signedDollars("120", 1), "120");
  assert.equal(signedDollars("250.5", -1), "-250.5");
  assert.equal(signedDollars("1,250.50", -1), "-1250.5");
  assert.equal(signedDollars("$864", 1), "864");
  assert.equal(signedDollars("", -1), "", "nothing typed is nothing, not zero");
  assert.equal(signedDollars("abc", 1), "abc", "not a number is handed on, so the form says so");
  for (const [amount, sign, want] of [["120", 1, 120], ["250.5", -1, -250.5], ["0.01", -1, -0.01], ["99999.99", 1, 99999.99], ["0", -1, 0]]) {
    const w = workOut({ ...base, pnl: signedDollars(amount, sign) }, { rOptional: true });
    assert.equal(w.pnl, want);
    assert.equal(w.r, null);
    assert.equal(w.valid, true, `${amount} is enough to log`);
  }
  assert.equal(workOut({ ...base, pnl: signedDollars("abc", 1) }, { rOptional: true }).errors.pnl, "Not a number");
});

test("a sign typed into the box moves the buttons", () => {
  assert.deepEqual(splitDollars("-75", 1), { amount: "75", sign: -1 });
  assert.deepEqual(splitDollars("−75", 1), { amount: "75", sign: -1 }, "the long minus too");
  assert.deepEqual(splitDollars("+75", -1), { amount: "75", sign: 1 });
  assert.deepEqual(splitDollars("75", -1), { amount: "75", sign: -1 }, "no sign typed leaves the buttons alone");
  assert.deepEqual(splitDollars("", -1), { amount: "", sign: -1 });
});

test("prices under Add detail beat typed dollars, and without them the typed dollars stand", () => {
  const typed = workOut({ ...base, pnl: signedDollars("999", 1) }, { rOptional: true });
  assert.equal(typed.worked, false);
  assert.equal(typed.pnl, 999);
  const priced = workOut({ ...base, pnl: signedDollars("999", 1), entry: "21000", exit: "21010", size: "2" }, { rOptional: true });
  assert.equal(priced.worked, true, "the box locks");
  assert.equal(priced.pnl, 400);
  const unknown = workOut({ ...base, symbol: "XYZ", pnl: signedDollars("50", 1), entry: "10", exit: "12" }, { rOptional: true });
  assert.equal(unknown.worked, false, "a market Marble doesn't know can't be worked out");
  assert.equal(unknown.pnl, 50);
  assert.equal(unknown.valid, true);
});

test("what's still needed is asked for in dollars", () => {
  assert.deepEqual(workOut({ ...base }, { rOptional: true }).missing, ["the dollars"]);
});

/* ---------- The review ---------- */

test("an edit that leaves the review alone saves it as it was stored", () => {
  const old = { followedPlan: true, grade: "A+", kept: [true, true] };
  assert.deepEqual(reviewOf({ trade: old, touched: false, rules: [], plan: "" }), { followedPlan: true, grade: "A+", kept: [true, true] });
  // A stored "Not sure yet" stays unanswered
  assert.deepEqual(reviewOf({ trade: { followedPlan: null, grade: null, kept: [] }, touched: false, plan: "yes" }), { followedPlan: null, grade: null, kept: [] });
  // Even when the setup's rules have changed since, an untouched review isn't wiped
  assert.deepEqual(reviewOf({ trade: { followedPlan: false, grade: "B", kept: [true, false, true] }, touched: false, rules: ["one", "two"], kept: [true, false, true] }).grade, "B");
});

test("the grade comes from the plan alone, never from R", () => {
  assert.deepEqual(reviewOf({ plan: "yes" }), { followedPlan: true, grade: "A", kept: [] });
  assert.deepEqual(reviewOf({ plan: "no" }), { followedPlan: false, grade: "C", kept: [] });
  assert.deepEqual(reviewOf({ plan: "" }), { followedPlan: null, grade: null, kept: [] }, "nothing ticked, nothing graded");
  assert.equal(reviewOf({ rules: ["a", "b"], kept: [true, true] }).grade, "A");
  assert.equal(reviewOf({ rules: ["a", "b"], kept: [true, false] }).grade, "B");
  assert.equal(reviewOf({ rules: ["a", "b", "c"], kept: [true, false, false] }).grade, "C");
  assert.equal(reviewOf({ rules: ["a", "b"], kept: null }).followedPlan, null, "a checklist nobody ticked is no answer");
  const lib = read("../src/lib/trade.js");
  assert.doesNotMatch(lib + form(), /"A\+"/, "no A+ is worked out any more");
  // A trader who answers again on an edit gets the new answer
  assert.deepEqual(reviewOf({ trade: { followedPlan: true, grade: "A+", kept: [] }, touched: true, plan: "" }), { followedPlan: null, grade: null, kept: [] });
});

test("an edit opens unfolded when the trade holds any detail", () => {
  assert.equal(hasDetail(null), false);
  assert.equal(hasDetail({ symbol: "NQ", side: "long", pnl: 120, size: "1", entry: "", stop: "", exit: "", setup: "", emotion: "", note: "", kept: [], followedPlan: null }), false);
  for (const more of [{ stop: 18990 }, { entry: "19000" }, { setup: "Opening range" }, { emotion: "Calm" }, { note: "x" }, { followedPlan: false }, { kept: [true] }, { leverage: 5 }]) assert.equal(hasDetail({ symbol: "NQ", pnl: 1, ...more }), true, Object.keys(more)[0]);
});

/* ---------- The form ---------- */

test("the form is symbol, side and dollars, with the rest under Add detail", () => {
  const f = form();
  const at = (s) => { const i = f.indexOf(s); assert.ok(i > 0, `${s} is on the form`); return i; };
  assert.ok(at('label="Symbol"') < at('htmlFor="lt-dollars"') && at('htmlFor="lt-dollars"') < at('className="lt-fold"'));
  for (const inside of ['id="lt-plan"', 'label="Entry"', 'label="Exit"', 'label="Stop"', 'label="Setup"', 'label="Leverage"', 'label="Fees"', 'label="Funding"', 'id="lt-felt"', 'label="Note"']) assert.ok(at(inside) > at("{open && ("), `${inside} sits under Add detail`);
  assert.match(f, /\[\["yes", "Yes"\], \["no", "No"\]\]/);
  assert.match(f, /plan: x\.plan === k \? "" : k/, "tapping a chosen answer clears it");
  assert.match(f, /plan: trade\?\.followedPlan == null \? "" :/, "nothing is ticked for the trader, in the app or the demo");
  assert.doesNotMatch(f, /Result in R|Not sure yet|went off plan|<Grade|Fill in the prices and Marble works out the dollars/);
  assert.match(f, /DETAIL\.some\(\(k\) => errors\[k\]\)/, "a problem under the fold opens it");
  assert.match(f, /!!copies\?\.length \|\| hasDetail\(trade\)/);
});

test("an edit keeps the stored dollars and R unless what they come from changed", () => {
  const f = read("../src/components/Dialogs.jsx");
  assert.match(f, /const MONEY_FROM = \["symbol", "side", "entry", "exit", "size", "pointValue", "fee", "funding", "amount", "sign"\];/);
  assert.match(f, /const R_FROM = \["side", "entry", "stop", "exit"\];/);
  assert.match(f, /const pnl = untouched\(MONEY_FROM\) && Number\.isFinite\(\+trade\.pnl\) \? \+trade\.pnl : w\.pnl;/);
  assert.match(f, /const r = untouched\(R_FROM\) \? trade\.r \?\? null : w\.r;/);
});

test("the grade is off the trade's page and the Study picker, and stays on Stats and the Journal filter", () => {
  assert.doesNotMatch(read("../src/drip/journal/Detail.jsx"), /<Grade/);
  assert.doesNotMatch(read("../src/views/study/Pad.jsx"), /<Grade/);
  assert.match(read("../src/views/Journal.jsx"), /grade/i);
});
