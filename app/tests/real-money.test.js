import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadState } from "../src/store.js";
import { splitMoney } from "../src/drip/week.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const accounts = [{ id: "live", stage: "live" }, { id: "funded", stage: "funded" }, { id: "eval", stage: "eval" }, { id: "paper", stage: "paper" }];
const t = (account, pnl) => ({ id: account + pnl, account, pnl });

test("real dollars and simulated dollars never share a total", () => {
  loadState({ accounts: [] });
  const m = splitMoney([t("live", 100), t("funded", 250), t("eval", 1000), t("paper", -40)], accounts);
  assert.equal(m.money, 350, "live and funded");
  assert.equal(m.aside, 960, "evaluation and paper, kept apart");
  assert.equal(m.mixed, true);
  assert.equal(m.simulated, false);
});

test("a day of only evaluation money is its own total, and says simulated", () => {
  const m = splitMoney([t("eval", 300), t("eval", -100)], accounts);
  assert.deepEqual([m.money, m.aside, m.simulated, m.mixed], [200, null, true, false]);
});

test("a day of only real money is unchanged, and a trade on no account counts as real", () => {
  const m = splitMoney([t("live", 300), { id: "x", account: null, pnl: 50 }], accounts);
  assert.deepEqual([m.money, m.aside, m.simulated, m.mixed], [350, null, false, false]);
  assert.deepEqual(splitMoney([], accounts), { mixed: false, simulated: false, money: 0, aside: null });
});

test("the Desk's total splits the money, and the Journal and Stats say when simulated money is in theirs", () => {
  const view = read("../src/drip/view.js");
  assert.match(view, /const split = scope === "desk" && kinds\.mixed;/);
  assert.match(view, /"Live and funded accounts"/);
  assert.match(view, /kinds\.simulated \? "Simulated money" : kinds\.mixed \? "Includes simulated money" : null/);
  assert.match(read("../src/views/Dashboard.jsx"), /Evaluation and paper: <b className="num">\{money\(aside, \{ sign: true \}\)\}<\/b> simulated<\/p>/);
  assert.match(read("../src/drip/DailyClose.jsx"), /dayMoney\.simulated \? "Today, simulated" : "Today"/);
  assert.match(read("../src/views/Journal.jsx"), /kindWord\(useKinds\(whole\)\)/);
});
