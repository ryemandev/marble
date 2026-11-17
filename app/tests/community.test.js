import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BROKEN_DAY_R, MIN_DAYS, costOf, cupRules, disciplineDays, fmtR1, halfR, hasRules, houseCup, ordinal, periodOf, rank, stripDays, stripOf, summarise,
} from "../src/views/community/scoring.js";
import { drawPicks, listText, sha256hex, verifyDraw } from "../src/views/community/draw.js";

// [day, time, id, pnl, r, followedPlan]
const ROWS = [
  ["2026-10-05", "14:00", 1, 200, 1, null], ["2026-10-05", "15:00", 2, -100, -0.5, null], ["2026-10-05", "16:00", 3, 300, 4, true],
  ["2026-10-06", "14:00", 4, -300, -1, null], ["2026-10-06", "14:10", 5, -250, -1, null], ["2026-10-06", "14:20", 6, 100, 0.5, null],
  ["2026-10-07", "14:00", 7, 50, 0.2, null], ["2026-10-07", "14:01", 8, 50, 0.2, null], ["2026-10-07", "14:02", 9, 50, 0.2, null],
  ["2026-10-07", "14:03", 10, 50, 0.2, null], ["2026-10-07", "14:04", 11, 50, null, null],
  ["2026-10-08", "14:00", 12, 100, 1, false],
  ["2026-10-09", "14:00", 13, -100, -1, null], ["2026-10-09", "14:01", 14, 50, 0.5, null], ["2026-10-09", "14:02", 15, -100, -1, null], ["2026-10-09", "14:03", 16, -100, -1, null],
  ["2026-10-12", "14:00", 17, -100, -1, null], ["2026-10-12", "14:01", 18, -100, -1, null],
];
const trades = ROWS.map(([dayKey, time, id, pnl, r, followedPlan]) => ({ id, dayKey, traded_at: `${dayKey}T${time}:00Z`, pnl, r, followedPlan, source: "sync" }));
const RULES = { lossLimit: 500, maxTrades: 4, stopAfter: 2 };

test("clean days: each rule, checked the same way as the database", () => {
  const days = disciplineDays(trades, RULES);
  assert.deepEqual(days.map((d) => [d.day, d.trades, d.r, d.broke]), [
    ["2026-10-05", 3, 3.5, []], // the +4R trade counts +3R
    ["2026-10-06", 3, -1.5, ["loss", "streak"]],
    ["2026-10-07", 5, 0.8, ["trades"]],
    ["2026-10-08", 1, 1, ["plan"]], // marked as not following the plan
    ["2026-10-09", 4, -2.5, []], // a win in between resets the losses in a row
    ["2026-10-12", 2, -2, []], // stopping right at the limit keeps the rule
  ]);
});

test("only imported and synced trades count; hand-typed ones never do", () => {
  const mixed = [
    { id: "a", dayKey: "2026-10-05", pnl: 100, r: 1, source: "manual" },
    { id: "b", dayKey: "2026-10-05", pnl: 100, r: 1, source: "import" },
    { id: "c", dayKey: "2026-10-06", pnl: -900, r: -1, source: "manual" },
  ];
  const days = disciplineDays(mixed, RULES);
  assert.equal(days.length, 1);
  assert.equal(days[0].trades, 1);
  // The demo counts everything
  assert.equal(disciplineDays(mixed, RULES, { sources: null }).length, 2);
});

test("no rules set: only a trade marked off-plan breaks a day", () => {
  const days = disciplineDays(trades, {});
  assert.deepEqual(days.filter((d) => !d.kept).map((d) => d.day), ["2026-10-08"]);
  assert.equal(hasRules({}), false);
  assert.equal(hasRules({ lossLimit: 0, maxTrades: null }), false);
  assert.equal(hasRules({ stopAfter: 2 }), true);
});

test("a period, summed up: rules kept, R, disciplined R and the streak", () => {
  const s = summarise(disciplineDays(trades, RULES));
  assert.equal(s.traded, 6);
  assert.equal(s.kept, 3);
  assert.equal(s.pct, 50);
  assert.equal(s.r, -0.7);
  assert.equal(s.keptR, -1); // 3.5 - 2.5 - 2
  assert.equal(s.score, -1 - BROKEN_DAY_R * 3);
  assert.equal(s.streak, 2); // the two kept days after the last broken one
  assert.equal(s.best, 2);
  assert.equal(s.trades, 18);
});

test("competition rules in the entrant's own money, including the most a trade may lose", () => {
  const rules = cupRules({ max_trade_loss_pct: 1, daily_loss_pct: 2, max_trades: 4, stop_after: 2 }, 50000);
  assert.deepEqual(rules, { lossLimit: 1000, maxTradeLoss: 500, maxTrades: 4, stopAfter: 2 });
  const day = disciplineDays([{ id: 1, dayKey: "2026-11-03", pnl: -600, r: -1.2, source: "sync" }], rules);
  assert.deepEqual(day[0].broke, ["size"]);
});

test("leaderboard order: rules kept %, then disciplined R, then fewer trades; too few days aren't ranked", () => {
  const rows = [
    { handle: "a", traded: 10, kept: 9, trades: 30, r: 9, score: 5 },
    { handle: "b", traded: 12, kept: 12, trades: 40, r: 6, score: 6 },
    { handle: "c", traded: 6, kept: 6, trades: 10, r: 8, score: 8 },
    { handle: "d", traded: 3, kept: 3, trades: 5, r: 20, score: 20 },
    { handle: "e", traded: 20, kept: 18, trades: 50, r: 12, score: 5 }, // 90%, same as a, same score: fewer trades wins
  ];
  const ranked = rank(rows, { order: "board", minDays: MIN_DAYS.month });
  assert.deepEqual(ranked.map((x) => [x.handle, x.rank]), [["c", 1], ["b", 2], ["a", 3], ["e", 4], ["d", null]]);
  // Crew standings use R after the rules kept %
  const crew = rank(rows, { order: "crew", minDays: 0 });
  assert.deepEqual(crew.map((x) => x.handle), ["d", "c", "b", "e", "a"]);
});

test("a competition ranks on its score, then days kept", () => {
  const rows = [
    { handle: "x", traded: 12, kept: 11, trades: 30, score: 10 },
    { handle: "y", traded: 12, kept: 12, trades: 30, score: 10 },
    { handle: "z", traded: 12, kept: 10, trades: 30, score: 12 },
  ];
  assert.deepEqual(rank(rows, { order: "cup" }).map((x) => x.handle), ["z", "y", "x"]);
});

test("the house cup: an average of members with 5+ days, shown once 3 qualify, ties share a place", () => {
  const m = (crew, traded, kept) => ({ crew, traded, kept });
  const cup = houseCup([
    m("OLY", 10, 9), m("OLY", 10, 8), m("OLY", 5, 5), m("OLY", 4, 4), // the last has too few days
    m("NITE", 10, 10), m("NITE", 10, 10), m("NITE", 10, 7),
    m("PIT", 10, 10), m("PIT", 10, 10), // only two qualify
  ]);
  assert.deepEqual(cup, [
    { crew: "OLY", qualifying: 3, pct: 90, place: 1 },
    { crew: "NITE", qualifying: 3, pct: 90, place: 1 },
    { crew: "PIT", qualifying: 2, pct: null, place: null },
  ]);
});

test("periods and day strips, in New York dates", () => {
  assert.deepEqual(periodOf("week", "2026-10-27"), { period: "week", from: "2026-10-26", to: "2026-10-30", today: "2026-10-27" });
  assert.deepEqual(periodOf("month", "2026-10-27"), { period: "month", from: "2026-10-01", to: "2026-10-31", today: "2026-10-27" });
  assert.deepEqual(periodOf("season", "2026-01-15"), { period: "season", from: "2025-11-01", to: "2026-01-31", today: "2026-01-15" });
  assert.deepEqual(periodOf("week", "2026-11-01"), { period: "week", from: "2026-10-26", to: "2026-10-30", today: "2026-11-01" }); // a Sunday
  const month = stripDays(periodOf("month", "2026-10-27"));
  assert.equal(month.length, 22);
  const season = stripDays(periodOf("season", "2026-10-27"));
  assert.equal(season.length, 23);
  assert.equal(season.at(-1), "2026-10-27");
  const days = disciplineDays(trades, RULES);
  assert.equal(stripOf(days, month.slice(0, 10), "2026-10-12"), "--kbbbkk..");
});

test("what cost you places names each broken day once, under the first rule it broke", () => {
  const text = costOf(disciplineDays(trades, RULES));
  assert.equal(text, "6 Oct went past your daily loss limit. 7 Oct went over your trades-a-day limit. 8 Oct had a trade marked off-plan. Every other day was clean.");
  assert.equal(costOf(disciplineDays(trades.filter((t) => t.dayKey === "2026-10-05"), RULES)), null);
  // Many days of one kind are counted, not listed
  const offPlan = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"].map((dayKey, i) => ({ id: i, dayKey, pnl: 10, r: 0.1, followedPlan: false, source: "import" }));
  assert.equal(costOf(disciplineDays(offPlan, RULES)), "5 days had a trade marked off-plan, the latest on 7 Oct.");
});

test("R is shown in R, never dollars, and places read naturally", () => {
  assert.equal(fmtR1(6.44), "+6.4R");
  assert.equal(fmtR1(-2), "−2.0R");
  assert.equal(fmtR1(0), "0.0R");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 42, 111].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "42nd", "111th"]);
});

test("the giveaway draw: the browser gets the same winners as the database", async () => {
  const seed = "a3f1c2d4e5b60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
  const entries = [21, 1, 13, 2, 3, 8, 5];
  assert.equal(listText(entries), "1,2,3,5,8,13,21");
  const sealed = await sha256hex(seed);
  const listHash = await sha256hex(listText(entries));
  assert.equal(sealed, "55a35c4b914a23edcb8e68fed6c47a72a959c2be3700b5882439d732f7640d85");
  assert.equal(listHash, "accc5b92359d640176367b623b55e5dde4f282f567f6b6ad8e319da3ce4ec3a8");
  // Postgres picked 5, 8, 2, 13 for n = 1..4
  assert.deepEqual(await drawPicks({ seed, listHash, entries, count: 4 }), [5, 8, 2, 13]);
  // A redraw skips the numbers already picked
  assert.deepEqual(await drawPicks({ seed, listHash, entries, count: 1, exclude: [5, 8, 2] }), [13]);
  // Never more picks than entries
  assert.equal((await drawPicks({ seed, listHash, entries, count: 50 })).length, 7);
  const record = { sealed, draws: [{ round: 1, seed, entries: [1, 2, 3, 5, 8, 13, 21], list_hash: listHash, picks: [5, 8, 2] }] };
  assert.equal((await verifyDraw(record)).ok, true);
  const tampered = { sealed, draws: [{ ...record.draws[0], picks: [5, 8, 21] }] };
  const check = await verifyDraw(tampered);
  assert.equal(check.ok, false);
  assert.equal(check.checks.find((c) => /winning numbers/.test(c.label)).ok, false);
});

test("trade cards carry no trade id or date, and an anonymous post's card has no setup and R to the nearest 0.5", () => {
  const sql = readFileSync(new URL("../supabase/migrations-pending/20261029160000_community_1_crews_and_feed.sql", import.meta.url), "utf8");
  const builder = sql.slice(sql.indexOf("create or replace function public.trade_card("), sql.indexOf("revoke all on function public.trade_card("));
  assert.ok(builder.length > 100, "trade_card() found");
  const card = builder.slice(builder.indexOf("jsonb_build_object("), builder.indexOf("from public.trades"));
  assert.match(card, /'sym', t\.symbol/);
  assert.ok(!card.includes("'id'") && !card.includes("'day'"), "no id or day in the card");
  assert.ok(builder.includes("when p_anonymous then public.anon_card(c)"));
  assert.ok(sql.includes("new.trade := public.trade_card(new.user_id, new.trade, new.anonymous);"));
  assert.ok(sql.includes("new.trade := public.trade_card(old.user_id, new.trade, new.anonymous);"));
  assert.ok(sql.includes("new.trade := public.anon_card(old.trade);"));
  assert.deepEqual([1.24, 1.25, 1.47, 2.4, -1, -1.25, -0.2, 0, 3.76].map(halfR), [1, 1.5, 1.5, 2.5, -1, -1.5, -0, 0, 4]);
  assert.equal(halfR(null), null);
  assert.equal(halfR(""), null);
});
