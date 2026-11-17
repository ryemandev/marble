import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIEW, NEAR, alike, combine, copiesAmong, counted, findCopies, fold, reviewFrom } from "../src/lib/copies.js";
import { summarize } from "../src/data.js";
import { prepare } from "../src/lib/oracle/prepare.js";

const AT = Date.parse("2026-10-14T13:41:07Z");
const iso = (ms) => new Date(ms).toISOString();
let n = 0;
const trade = (account, extra = {}) => ({
  id: `t${++n}`, account, symbol: "NQZ6", side: "long", traded_at: iso(AT), closedAt: iso(AT + 4 * 60e3),
  entry: 21034.25, exit: 21052.5, size: 2, pnl: 730, r: 1.8, source: "sync", needsReview: true, ...extra,
});
const twelve = () => Array.from({ length: 12 }, (_, i) => trade(`acct${i}`, {
  traded_at: iso(AT + i * 180), closedAt: iso(AT + 4 * 60e3 + i * 210), entry: 21034.25 + (i % 3) * 0.25, exit: 21052.5 - (i % 2) * 0.25, pnl: 730 - (i % 3) * 10,
}));

test("twelve copies of one trade are one group, led by the first opened", () => {
  const ts = twelve().reverse(); // newest first, as the app keeps them
  const { groups, of } = findCopies(ts);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].ids.length, 12);
  assert.equal(groups[0].accounts.length, 12);
  assert.equal(groups[0].id, ts.at(-1).id); // the earliest
  assert.equal(of.get(ts[0].id), groups[0]);
});

test("imported, synced and typed-in copies all count", () => {
  const a = trade("a", { source: "import" }), b = trade("b", { source: "sync" }), c = trade("c", { source: "manual", closedAt: null });
  assert.equal(findCopies([a, b, c]).groups[0].ids.length, 3);
  // Typed in with only an R and a P&L, same minute
  const m1 = trade("a", { entry: "", exit: "", closedAt: null, r: 1.5, pnl: 300 }), m2 = trade("b", { entry: "", exit: "", closedAt: null, r: 1.6, pnl: 290 });
  assert.equal(findCopies([m1, m2]).groups.length, 1);
  assert.equal(findCopies([m1, trade("b", { entry: "", exit: "", closedAt: null, r: -1, pnl: -300 })]).groups.length, 0);
});

test("not copies: same account, other market or side, too far apart, different prices", () => {
  const base = trade("a");
  const none = (other) => assert.equal(findCopies([base, other]).groups.length, 0);
  none(trade("a")); // two trades on one account are two trades
  none(trade("b", { symbol: "ESZ6" }));
  none(trade("b", { side: "short" }));
  none(trade("b", { traded_at: iso(AT + NEAR.openMs + 1000) }));
  none(trade("b", { closedAt: iso(AT + 4 * 60e3 + NEAR.closeMs + 1000) }));
  none(trade("b", { entry: 21034.25 * 1.001 }));
  none(trade("b", { exit: 21100 }));
  none(trade(null)); // no account: Marble can't tell it's another one
  none(trade("b", { traded_at: null }));
  // Symbols match however they were typed
  assert.equal(findCopies([base, trade("b", { symbol: " nqz6 " })]).groups.length, 1);
});

test("one copy per account: a second trade on the same account starts its own group", () => {
  const a1 = trade("a"), b1 = trade("b"), a2 = trade("a", { traded_at: iso(AT + 5000) }), b2 = trade("b", { traded_at: iso(AT + 5200) });
  const { groups } = findCopies([a1, b1, a2, b2]);
  assert.deepEqual(groups.map((g) => g.ids.sort()), [[a1.id, b1.id].sort(), [a2.id, b2.id].sort()]);
});

test("alike is symmetric", () => {
  const x = { account: "a", symbol: "NQ", side: "long", open: AT, close: AT + 1, entry: 100, exit: 101, r: 1, pnl: 10 };
  const y = { ...x, account: "b", open: AT + 9000, entry: 100.02 };
  assert.equal(alike(x, y), alike(y, x));
  assert.equal(alike(x, y), true);
});

test("folded: one row per decision, the money is the total, the R the average, in the list's own order", () => {
  const before = trade("solo", { traded_at: iso(AT + 3600e3), symbol: "ESZ6", pnl: -100, r: -1 });
  const copies = twelve();
  const list = [before, ...copies.reverse()];
  const found = findCopies(list);
  const out = fold(list, found);
  assert.equal(out.length, 2);
  assert.equal(out[0], before);
  const g = out[1];
  assert.equal(g.copies.n, 12);
  assert.equal(g.pnl, copies.reduce((a, t) => a + t.pnl, 0));
  assert.equal(g.size, 24);
  assert.equal(g.r, 1.8);
  assert.equal(g.account, null);
  assert.equal(g.accounts.length, 12);
  assert.equal(g.needsReview, true);
  assert.equal(g.id, found.groups[0].id);
  // Folding twice changes nothing
  assert.deepEqual(fold(out, found).map((t) => t.id), out.map((t) => t.id));
});

test("combined, copies don't double-count; per account, every copy counts", () => {
  const list = twelve();
  const found = findCopies(list);
  const once = summarize(counted(list, found, DEFAULT_VIEW));
  const each = summarize(counted(list, found, { mode: "each", account: null }));
  assert.equal(once.count, 1);
  assert.equal(once.wins, 1);
  assert.equal(each.count, 12);
  assert.equal(once.net, each.net); // the same money either way
  // One account at a time
  const one = counted(list, found, { mode: "each", account: "acct3" });
  assert.equal(one.length, 1);
  assert.equal(one[0].account, "acct3");
});

test("a losing copied trade is one loss in a row, not twelve", () => {
  const lose = twelve().map((t) => ({ ...t, exit: 21020, pnl: -500, r: -1 }));
  const found = findCopies(lose);
  const rows = counted(lose, found);
  let run = 0; for (const t of rows) if (t.pnl < 0) run++;
  assert.equal(run, 1);
});

test("the Oracle reads a combined trade as one trade", () => {
  const list = twelve();
  const found = findCopies(list);
  const journal = prepare(counted(list, found));
  assert.equal(journal.length, 1);
  assert.equal(journal[0].pnl, list.reduce((a, t) => a + t.pnl, 0));
  assert.equal(prepare(counted(list, found, { mode: "each" })).length, 12);
});

test("a month that holds only some of a group's copies folds just those", () => {
  const list = twelve();
  const found = findCopies(list);
  const out = fold(list.slice(0, 1), found);
  assert.equal(out.length, 1);
  assert.equal(out[0].copies, undefined);
});

test("graded per account: the review that differs is marked mixed, and the lead's stands for the group", () => {
  const [a, b] = [trade("a", { grade: "A", setup: "ORB", needsReview: false }), trade("b", { grade: "C", setup: "ORB", needsReview: false })];
  const g = combine([a, b]);
  assert.equal(g.grade, "A");
  assert.deepEqual(g.mixed, ["grade"]);
  assert.equal(g.needsReview, false);
  assert.deepEqual(combine([trade("a", { note: "" }), trade("b", { note: null })]).mixed, []);
});

test("grading once puts the review on every copy and keeps each copy's own numbers", () => {
  const lead = trade("a", { setup: "ORB", grade: "A", emotion: "Calm", followedPlan: true, kept: [true, true], note: "Waited for the close", needsReview: false, stop: "21024.25" });
  const copy = trade("b", { entry: 21034.5, exit: 21052.25, pnl: 710, r: null, size: 1 });
  const out = reviewFrom(lead, copy);
  assert.equal(out.id, copy.id);
  assert.equal(out.account, "b");
  assert.equal(out.pnl, 710);
  assert.equal(out.size, 1);
  assert.equal(out.setup, "ORB");
  assert.equal(out.grade, "A");
  assert.equal(out.followedPlan, true);
  assert.deepEqual(out.kept, [true, true]);
  assert.equal(out.note, "Waited for the close");
  assert.equal(out.needsReview, false);
  assert.equal(out.stop, "21024.25");
  assert.equal(out.r, Math.round(((21052.25 - 21034.5) / (21034.5 - 21024.25)) * 100) / 100); // its own R
  assert.equal(reviewFrom({ ...lead, stop: "", r: 1.5 }, { ...copy, r: null }).r, 1.5);
  assert.equal(reviewFrom({ ...lead, stop: "", r: 1.5 }, { ...copy, r: 1.4 }).r, 1.4);
  // A stop on the wrong side is ignored
  assert.equal(reviewFrom({ ...lead, stop: "21060" }, { ...copy, r: 1.2 }).r, 1.2);
});

test("lots of trades: grouping stays quick", () => {
  const many = [];
  for (let d = 0; d < 400; d++) for (let a = 0; a < 10; a++) many.push(trade(`acct${a}`, { traded_at: iso(AT + d * 3600e3 + a * 100), closedAt: iso(AT + d * 3600e3 + 60e3 + a * 100) }));
  const t0 = performance.now();
  const { groups } = findCopies(many);
  assert.equal(groups.length, 400);
  assert.ok(performance.now() - t0 < 500);
});

test("importing: a file's trades that copy ones already on other accounts are found, one per account", () => {
  const journal = twelve().slice(0, 3);
  const fresh = [trade("new-acct", { id: "f1", traded_at: iso(AT + 300) }), trade("new-acct", { id: "f2", symbol: "ESZ6" })];
  const found = copiesAmong(fresh, [...journal, trade(journal[0].account, { traded_at: iso(AT + 50) })]);
  assert.equal(found.get("f1").length, 3);
  assert.equal(found.has("f2"), false);
  // A trade never counts as a copy of one on its own account
  assert.equal(copiesAmong([trade("acct0", { id: "f3" })], journal).get("f3").length, 2);
});
