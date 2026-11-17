import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRules, limitsSaved, limitsSavedLine, nyDay, rulesOf } from "../supabase/functions/_shared/limits.js";

const NOW = Date.parse("2026-10-29T20:00:00Z"); // Thursday 29 October, 16:00 in New York
const at = (day, hhmm) => new Date(`2026-10-${String(day).padStart(2, "0")}T${hhmm}:00-04:00`).toISOString();
const tr = (day, hhmm, pnl, extra = {}) => ({ traded_at: at(day, hhmm), pnl, ...extra });
const money = (n) => `$${Math.abs(n).toLocaleString("en-US")}`;

test("no rules: says so, and counts nothing", () => {
  const r = limitsSaved([tr(28, "10:00", -100)], {}, { now: NOW });
  assert.equal(r.status, "no-rules");
  assert.equal(r.kept, 0);
  assert.match(limitsSavedLine(r, money), /Set your daily limits/);
  // Blank, zero and junk values are no rule at all
  assert.equal(limitsSaved([tr(28, "10:00", -100)], { lossLimit: "", maxTrades: 0, stopAfter: "x" }, { now: NOW }).status, "no-rules");
  assert.equal(hasRules({ lossLimit: null, maxTrades: 0 }), false);
});

test("no trades: a gentle nudge to import", () => {
  const r = limitsSaved([], { lossLimit: 500 }, { now: NOW });
  assert.equal(r.status, "no-trades");
  assert.match(limitsSavedLine(r, money), /Import your trade history/);
  // Trades older than the window don't count
  assert.equal(limitsSaved([tr(1, "10:00", -900)], { lossLimit: 500 }, { now: NOW, days: 7 }).status, "no-trades");
});

test("loss limit: the trades after the day reached minus the limit are what stopping would have kept", () => {
  const trades = [
    tr(27, "09:40", -300),
    tr(27, "10:05", -250), // day at -550: the $500 limit is reached here
    tr(27, "10:30", -200), // after
    tr(27, "11:00", 50), //   after
  ];
  const r = limitsSaved(trades, { lossLimit: 500 }, { now: NOW });
  assert.equal(r.status, "saved");
  assert.equal(r.daysHit, 1);
  assert.equal(r.daysOver, 1);
  assert.equal(r.tradesAfter, 2);
  assert.equal(r.afterPnl, -150);
  assert.equal(r.kept, 150);
  assert.deepEqual(r.byDay[0].hit, ["loss"]);
  assert.equal(limitsSavedLine(r, money), "If you'd stopped at your limits, you'd have kept $150 over 1 day.");
});

test("trades arrive newest first (as the app keeps them) and are still walked in the order they were taken", () => {
  const trades = [tr(27, "11:00", 50), tr(27, "10:30", -200), tr(27, "10:05", -250), tr(27, "09:40", -300)];
  assert.equal(limitsSaved(trades, { lossLimit: 500 }, { now: NOW }).afterPnl, -150);
});

test("most trades a day: everything after the Nth trade counts", () => {
  const trades = [tr(26, "09:31", 100), tr(26, "09:45", 100), tr(26, "10:10", -80), tr(26, "10:20", -40)];
  const r = limitsSaved(trades, { maxTrades: 2 }, { now: NOW });
  assert.equal(r.tradesAfter, 2);
  assert.equal(r.afterPnl, -120);
  assert.deepEqual(r.byDay[0].hit, ["trades"]);
});

test("losses in a row: breakeven trades neither add to the run nor end it, a win ends it", () => {
  const trades = [
    tr(23, "09:31", -100), tr(23, "09:40", 0), tr(23, "09:50", -100),
    tr(23, "10:00", -60), // after
  ];
  const r = limitsSaved(trades, { stopAfter: 2 }, { now: NOW });
  assert.equal(r.tradesAfter, 1);
  assert.equal(r.afterPnl, -60);
  const won = [tr(22, "09:31", -100), tr(22, "09:40", 30), tr(22, "09:50", -100), tr(22, "10:00", -60)];
  const w = limitsSaved(won, { stopAfter: 2 }, { now: NOW });
  assert.equal(w.status, "stopped");
  assert.equal(w.daysHit, 1);
});

test("once a limit is reached the rest of the day counts, even if the day climbs back", () => {
  const trades = [tr(21, "09:31", -600), tr(21, "09:50", 400), tr(21, "10:15", 500)];
  const r = limitsSaved(trades, { lossLimit: 500 }, { now: NOW });
  assert.equal(r.status, "cost");
  assert.equal(r.afterPnl, 900);
  assert.equal(r.kept, -900);
  assert.equal(limitsSavedLine(r, money), "Trades after your limit made $900 this time, over 1 day.");
});

test("several days add up, newest day first, and a day that stopped at its limit adds nothing", () => {
  const trades = [
    tr(20, "09:31", -500), tr(20, "09:40", -100), // reached, then -100
    tr(19, "09:31", -500), // reached, stopped
    tr(16, "09:31", -500), tr(16, "09:40", -50), tr(16, "09:50", -50), // reached, then -100
    tr(15, "09:31", 200), // never reached
  ];
  const r = limitsSaved(trades, { lossLimit: 500 }, { now: NOW });
  assert.equal(r.daysTraded, 4);
  assert.equal(r.daysHit, 3);
  assert.equal(r.daysOver, 2);
  assert.equal(r.kept, 200);
  assert.deepEqual(r.byDay.map((d) => d.day), ["2026-10-20", "2026-10-16"]);
});

test("a limit reached by the last trade of the day, every day, reads as stopping each time", () => {
  const r = limitsSaved([tr(20, "09:31", -500), tr(21, "09:31", -700)], { lossLimit: 500 }, { now: NOW });
  assert.equal(r.status, "stopped");
  assert.equal(limitsSavedLine(r, money), "You reached a limit on 2 days and stopped each time.");
  // One day doesn't have an "each time"
  const one = limitsSaved([tr(20, "09:31", -500)], { lossLimit: 500 }, { now: NOW });
  assert.equal(limitsSavedLine(one, money), "You reached a limit on 1 day and stopped there.");
});

test("never reached, and broke even", () => {
  assert.equal(limitsSaved([tr(20, "09:31", -100)], { lossLimit: 500 }, { now: NOW }).status, "never-hit");
  const even = limitsSaved([tr(20, "09:31", -500), tr(20, "09:40", 100), tr(20, "09:50", -100)], { lossLimit: 500 }, { now: NOW });
  assert.equal(even.status, "even");
  assert.equal(even.kept, 0);
});

test("imported trades with no grade, setup or review count like any other; junk P&L counts as nothing", () => {
  const trades = [
    tr(20, "09:31", -500, { grade: null, setup: "", followed_plan: null, needs_review: true, source: "tradovate" }),
    tr(20, "09:40", "-75.5", { grade: null }), // P&L as text, the way numeric columns can arrive
    tr(20, "09:50", null),
    { traded_at: "not a date", pnl: -999 },
    null,
  ];
  const r = limitsSaved(trades, { lossLimit: 500 }, { now: NOW });
  assert.equal(r.tradesAfter, 2);
  assert.equal(r.afterPnl, -75.5);
});

test("days are New York trading days, and a known dayKey is used as given", () => {
  assert.equal(nyDay("2026-10-21T03:30:00Z"), "2026-10-20");
  const late = [tr(20, "09:31", -500), { traded_at: "2026-10-21T03:30:00Z", pnl: -40 }];
  assert.equal(limitsSaved(late, { lossLimit: 500 }, { now: NOW }).afterPnl, -40);
  const keyed = [{ traded_at: at(20, "09:31"), dayKey: "2026-10-20", pnl: -500 }, { traded_at: at(20, "09:40"), dayKey: "2026-10-20", pnl: -10 }];
  assert.equal(limitsSaved(keyed, { lossLimit: 500 }, { now: NOW }).afterPnl, -10);
});

test("rules read from the database's column names as well as the app's", () => {
  assert.deepEqual(rulesOf({ daily_loss_limit: "500.00", max_trades: 5, stop_after_losses: null }), { lossLimit: 500, maxTrades: 5, stopAfter: null });
  const r = limitsSaved([tr(20, "09:31", -500), tr(20, "09:40", -10)], { daily_loss_limit: "500" }, { now: NOW });
  assert.equal(r.kept, 10);
});

test("cents add up without floating-point dust", () => {
  const trades = [tr(20, "09:31", -500), tr(20, "09:40", -0.1), tr(20, "09:41", -0.2)];
  assert.equal(limitsSaved(trades, { lossLimit: 500 }, { now: NOW }).kept, 0.3);
});
