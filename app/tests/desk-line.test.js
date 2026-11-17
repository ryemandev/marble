import test from "node:test";
import assert from "node:assert/strict";
import { deskLine, lastDay } from "../src/drip/desk/line.js";

const none = { trades: false, net: 0 };
const yesterday = { word: "Yesterday", net: -679 };

test("the line keeps one form every day", () => {
  assert.equal(deskLine({ today: { trades: true, net: 558 }, last: yesterday, left: 2000 }), "+$558 today. $2,000 drawdown left. Estimate.");
  assert.equal(deskLine({ today: { trades: true, net: -679 }, last: null, left: 1175 }), "\u2212$679 today. $1,175 drawdown left. Estimate.");
  assert.equal(deskLine({ today: none, last: yesterday, left: 1175 }), "Yesterday \u2212$679. $1,175 drawdown left. Estimate.");
});

test("Today on the panel drops its first part, and no firm account means money only", () => {
  assert.equal(deskLine({ today: { trades: true, net: 558 }, last: null, left: 2000, todayChosen: true }), "$2,000 drawdown left. Estimate.");
  assert.equal(deskLine({ today: { trades: true, net: 558 }, last: null, left: null }), "+$558 today.");
  assert.equal(deskLine({ today: none, last: yesterday, left: null }), "Yesterday \u2212$679.");
  assert.equal(deskLine({ today: none, last: null, left: null }), "");
});

test("a drawdown past its line reads nothing left, never a negative room", () => {
  assert.equal(deskLine({ today: none, last: null, left: -120 }), "$0 drawdown left. Estimate.");
});

test("the last day is the latest before today, named plainly", () => {
  const dayOf = (t) => t.day;
  const pool = [{ day: "2026-11-02", pnl: 100 }, { day: "2026-11-02", pnl: -250 }, { day: "2026-10-30", pnl: 900 }, { day: "2026-11-06", pnl: 40 }];
  assert.deepEqual(lastDay(pool, "2026-11-03", dayOf), { word: "Yesterday", net: -150 });
  assert.deepEqual(lastDay(pool, "2026-11-06", dayOf), { word: "Monday", net: -150 });
  assert.deepEqual(lastDay(pool, "2026-11-20", dayOf), { word: "6 Nov", net: 40 });
  assert.equal(lastDay([], "2026-11-06", dayOf), null);
});
