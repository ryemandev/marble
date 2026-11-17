import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, QUESTIONS, ask, prepare } from "../src/lib/oracle/index.js";
import { summarize } from "../src/data.js";
import { nyInstant } from "../src/live/time.js";
import { limitsSaved } from "../supabase/functions/_shared/limits.js";
import * as SAMPLE from "../src/sample.js";

const NOW = +nyInstant(2026, 9, 27, 16, 0);
let n = 0;
const T = (day, time, pnl, x = {}) => {
  const [h, m] = time.split(":").map(Number);
  const { month = 9, ...rest } = x;
  return { id: `t${++n}`, traded_at: nyInstant(2026, month, day, h, m).toISOString(), pnl, r: null, followedPlan: null, ...rest };
};
// The app's lists are newest first
const newest = (ts) => [...ts].sort((a, b) => Date.parse(b.traded_at) - Date.parse(a.traded_at));
const run = (id, trades, extra = {}, opts = {}) => ask(id, { trades: newest(trades), now: NOW, ...extra }, opts);

test("the menu: 15 to 20 questions in five groups, each worded as a question about the past", () => {
  assert.ok(QUESTIONS.length >= 15 && QUESTIONS.length <= 20, `${QUESTIONS.length} questions`);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length);
  for (const g of GROUPS) assert.ok(QUESTIONS.some((q) => q.group === g.id), g.id);
  for (const q of QUESTIONS) {
    assert.match(q.text(), /\?$/);
    assert.ok(q.min, `${q.id} says its minimum sample`);
  }
  // The two questions that read like advice are gone
  const texts = QUESTIONS.map((q) => q.text()).join(" ");
  assert.doesNotMatch(texts, /ready to trade a funded|should I stop/i);
});

test("prepare: demo trades (a day and a time) and real trades (traded_at, closedAt) come out the same shape", () => {
  const [demo] = prepare([{ id: "T1", day: 2, time: "14:45", hour: 14, weekday: 5, pnl: 10, r: 1 }], { cal: { year: 2026, month: 9 } });
  assert.equal(demo.dayKey, "2026-10-02");
  assert.equal(demo.minutes, 14 * 60 + 45);
  assert.equal(demo.weekday, 5);
  assert.equal(demo.traded_at, "2026-10-02T18:45:00.000Z"); // 14:45 in New York, summer time
  const real = prepare([{ id: "a", traded_at: "2026-10-05T13:35:00Z", closedAt: "2026-10-05T13:47:30Z", pnl: -20, r: -0.5, size: 2 }])[0];
  assert.equal(real.dayKey, "2026-10-05");
  assert.equal(real.minutes, 9 * 60 + 35);
  assert.equal(real.weekday, 1);
  assert.equal(real.held, 750e3);
  assert.equal(real.risk, 40); // what it stood to lose at its stop: $20 over 0.5R
  const same = prepare([{ id: "late", traded_at: "2026-10-05T13:35:00Z", pnl: 1 }, { id: "early", traded_at: "2026-10-05T13:35:00Z", pnl: 1 }, { id: "first", traded_at: "2026-10-05T13:30:00Z", pnl: 1 }]);
  assert.deepEqual(same.map((t) => t.id), ["first", "early", "late"]);
  // A trade with no date at all is left out rather than guessed
  assert.equal(prepare([{ id: "x", pnl: 5 }]).length, 0);
});

test("below the minimum it says so honestly, with no figures", () => {
  const seven = Array.from({ length: 7 }, (_, i) => T(5 + i, "10:00", 100));
  const a = run("hours", seven);
  assert.equal(a.status, "short");
  assert.equal(a.headline, "Not enough trades yet: 7 of the 20 this needs.");
  assert.deepEqual(a.ids, []);
  assert.equal(run("expectancy", []).headline, "Not enough trades yet: 0 of the 20 this needs.");
  assert.equal(run("consistency", seven.slice(0, 3)).headline, "Not enough trading days yet: 3 of the 5 this needs.");
  assert.equal(run("hold", seven).headline, "Not enough trades with an exit time yet: 0 of the 10 this needs.");
});

test("Friday afternoons: what they cost, and exactly which trades", () => {
  const fri = [T(2, "13:00", -500), T(2, "14:45", -300), T(9, "12:30", 200), T(16, "15:00", -400), T(23, "14:40", -240)];
  const other = [T(2, "10:00", 900), T(5, "10:00", 100), T(6, "13:00", 100)];
  const a = run("slot", [...fri, ...other], {}, { weekday: 5, session: "afternoon" });
  assert.equal(a.status, "ok");
  assert.equal(a.question, "What do my Friday afternoons cost?");
  assert.equal(a.headline, "Your Friday afternoons cost $1,240 across 5 trades.");
  assert.equal(a.key, "$1,240");
  assert.deepEqual(a.ids, [fri[4].id, fri[3].id, fri[2].id, fri[1].id, fri[0].id]); // newest first
  assert.ok(a.facts.includes("They fell on 4 Fridays."));
  // Another weekday and session, below its minimum
  assert.equal(run("slot", [...fri, ...other], {}, { weekday: 5, session: "morning" }).headline, "Not enough trades on Friday mornings yet: 1 of the 5 this needs.");
});

test("broken rules: what they cost, against trades by the plan, and the rule missed most often", () => {
  const strategies = [{ setup: "ORB", rules: ["Range marked", "Retest holds", "Stop beyond range"] }];
  const broke = Array.from({ length: 4 }, (_, i) => T(5 + i, "10:00", -100, { r: -1, followedPlan: false, setup: "ORB", kept: [true, false, true] }));
  const kept = Array.from({ length: 8 }, (_, i) => T(12 + i, "10:00", 200, { r: 2, followedPlan: true, setup: "ORB", kept: [true, true, true] }));
  const unreviewed = [T(20, "10:00", 50), T(21, "10:00", 50)];
  const a = run("broken", [...broke, ...kept, ...unreviewed], { strategies });
  assert.equal(a.headline, "Trades off plan cost $400 across 4 trades.");
  assert.ok(a.facts.includes("Trades by the plan made $1,600 across 8 trades."));
  assert.ok(a.facts.includes("Missed most often: “Retest holds” (ORB), on 4 trades."));
  assert.ok(a.facts.includes("2 trades aren't reviewed yet and are left out."));
  assert.equal(a.look, "Per trade, that's -$100 against +$200 by the plan.");
  assert.deepEqual(new Set(a.ids), new Set(broke.map((t) => t.id)));
});

test("after a daily limit: the same sums as limitsSaved, and the exact trades after the limit", () => {
  const day = [T(5, "09:40", 100), T(5, "10:10", -50), T(5, "10:40", -200), T(5, "11:00", 30)];
  const rest = Array.from({ length: 8 }, (_, i) => T(12 + i, "10:00", 75));
  const trades = [...day, ...rest];
  const rules = { lossLimit: null, maxTrades: 2, stopAfter: null };
  const a = run("limits", trades, { rules });
  const ref = limitsSaved(trades, rules, { days: 36500, now: NOW });
  assert.equal(ref.afterPnl, -170);
  assert.equal(a.headline, "Trades taken after reaching a daily limit cost $170 across 2 trades on 1 day.");
  assert.deepEqual(a.ids, [day[3].id, day[2].id]);
  assert.ok(a.facts.includes("Your daily limits: 2 trades a day."));
  // No rules: nothing to check against, and a way to set them
  const none = run("limits", trades, { rules: {} });
  assert.equal(none.status, "none");
  assert.equal(none.action, "rules");
});

test("rules kept, month on month", () => {
  const sep = Array.from({ length: 6 }, (_, i) => T(7 + i, "10:00", 10, { month: 8, followedPlan: i < 3 }));
  const oct = Array.from({ length: 6 }, (_, i) => T(5 + i, "10:00", 10, { followedPlan: i < 5 }));
  const a = run("kept", [...sep, ...oct]);
  assert.equal(a.headline, "You went by the plan on 83% of reviewed trades in October, up from 50% in September.");
  assert.equal(a.key, "83%");
  assert.ok(a.facts[0].startsWith("Month by month: Sep 50% · Oct 83%"));
});

test("after the first loss of the day", () => {
  const trades = [];
  for (let d = 5; d < 10; d++) trades.push(T(d, "09:45", -100), T(d, "10:15", 50), T(d, "10:45", 50));
  const a = run("firstloss", trades);
  assert.equal(a.headline, "After the first loss of the day, the trades that followed made $500 across 10 trades on 5 days.");
  assert.equal(a.ids.length, 10);
  assert.ok(a.facts.includes("On 0 of the 5 days with a loss, that first loss was the day's last trade."));
});

test("size after a loss: risk in dollars, from P&L over R", () => {
  const trades = [];
  for (let d = 5; d < 15; d++) trades.push(T(d, "09:45", -100, { r: -1 }), T(d, "10:15", 300, { r: 1.5 }));
  const a = run("size", trades);
  assert.equal(a.headline, "After a loss, you risked $200 a trade on average: 100% more than the $100 on your other trades.");
  assert.ok(a.facts.includes("10 of the 10 trades after a loss were bigger than the losing trade before them."));
});

test("trades per day: where results drop off", () => {
  const trades = [];
  for (let d = 1; d <= 16; d++) {
    if (new Date(Date.UTC(2026, 9, d)).getUTCDay() % 6 === 0) continue;
    trades.push(T(d, "09:40", 100), T(d, "10:00", 100), T(d, "10:30", -150), T(d, "11:00", -150));
  }
  const days = new Set(trades.map((t) => t.traded_at.slice(0, 10))).size;
  const a = run("perday", trades);
  assert.equal(a.headline, `Your first 2 trades of the day made $${(200 * days).toLocaleString("en-US")} across ${2 * days} trades; from the 3rd trade on, they cost $${(300 * days).toLocaleString("en-US")} across ${2 * days} trades.`);
  assert.equal(a.ids.length, 2 * days);
});

test("holding losers against winners", () => {
  const trades = [];
  for (let i = 0; i < 5; i++) trades.push(T(5 + i, "10:00", 100, { closedAt: nyInstant(2026, 9, 5 + i, 10, 10).toISOString() }));
  for (let i = 0; i < 5; i++) trades.push(T(12 + i, "10:00", -50, { closedAt: nyInstant(2026, 9, 12 + i, 10, 20).toISOString() }));
  const a = run("hold", trades);
  assert.equal(a.headline, "You held losing trades for 20 minutes on average, and winners for 10 minutes.");
  assert.ok(a.facts.includes("Losers stayed open 100% longer than winners."));
});

test("feelings: the one that cost the most", () => {
  const trades = [...Array.from({ length: 4 }, (_, i) => T(5 + i, "10:00", -100, { emotion: "FOMO" })), ...Array.from({ length: 6 }, (_, i) => T(12 + i, "10:00", 50, { emotion: "Calm" }))];
  const a = run("feelings", trades);
  assert.equal(a.headline, "Trades you tagged FOMO have cost the most: $400 across 4 trades.");
  assert.equal(a.ids.length, 4);
});

test("consistency: the best day as a share of total profit", () => {
  const trades = [T(2, "10:00", 500), T(5, "10:00", 300), T(6, "10:00", 200), T(7, "10:00", -100), T(8, "10:00", 100)];
  const a = run("consistency", trades);
  assert.equal(a.headline, "Your best day, Fri 2 Oct, made $500: 50% of your total profit of $1,000.");
  assert.deepEqual(a.ids, [trades[0].id]);
  assert.ok(a.facts.includes("Without your best day, the other 4 days made $500."));
});

test("expectancy matches the app's own summary", () => {
  const trades = [...Array.from({ length: 12 }, (_, i) => T(1 + i, "10:00", 100, { r: 1 })), ...Array.from({ length: 8 }, (_, i) => T(14 + i, "10:00", -50, { r: -0.5 }))];
  const s = summarize(trades);
  const a = run("expectancy", trades);
  assert.equal(a.headline, `Your average win is $${s.avgWin} and your average loss $${s.avgLoss}, so an average trade has made $40.`);
  assert.ok(a.facts.includes("For every $1 lost, $3 was won."));
});

test("the period: the last 30 days leaves older trades out and says so", () => {
  const old = Array.from({ length: 20 }, (_, i) => T(1 + i, "10:00", 100, { month: 7 }));
  const recent = Array.from({ length: 20 }, (_, i) => T(1 + i, "10:00", i % 2 ? -50 : 80));
  const all = run("expectancy", [...old, ...recent]);
  const last = run("expectancy", [...old, ...recent], {}, { scope: "30" });
  assert.equal(all.count, 40);
  assert.equal(last.count, 20);
  assert.match(last.headline, /in the last 30 days\.$/);
});

const BANNED = /\byou should\b|\bstop trading\b|\btrade more\b|\bready (for|to trade) a funded\b|\bguarantee|\bwill make\b|\bbuy\b|\bsell\b|\bAI\b/i;

test("copy rules, across every question, period and journal", () => {
  const sample = prepare(SAMPLE.TRADES, { cal: { year: 2026, month: 9 } });
  const now = +nyInstant(2026, 9, 27, 13, 52);
  const journals = [
    { prepared: sample, rules: { lossLimit: 2000, maxTrades: 5, stopAfter: 3 }, strategies: SAMPLE.STRATEGIES, now },
    { prepared: sample, rules: { lossLimit: 500, maxTrades: 2, stopAfter: 1 }, strategies: SAMPLE.STRATEGIES, now },
    { prepared: [], now },
  ];
  const ids = new Set(SAMPLE.TRADES.map((t) => t.id));
  let answered = 0;
  for (const j of journals) for (const scope of ["all", "90", "30"]) for (const q of QUESTIONS) for (const weekday of [1, 5]) {
    const a = ask(q.id, j, { scope, weekday, session: "afternoon" });
    const words = [a.question, a.headline, ...a.facts, a.look || "", ...a.groups.map((g) => g.label)].join(" ");
    assert.doesNotMatch(words, BANNED, `${q.id}: ${words}`);
    assert.doesNotMatch(words, /undefined|NaN|Infinity|null|\[object/, `${q.id}: ${a.headline}`);
    if (a.status === "short") {
      assert.match(a.headline, /^Not enough .+ yet: \d+ of the \d+ this needs\.$/);
      assert.equal(a.ids.length, 0);
    }
    if (a.status === "ok") {
      answered++;
      if (a.key) assert.ok(a.headline.includes(a.key), `${q.id}: key "${a.key}" in "${a.headline}"`);
      assert.ok(a.facts.length >= 1 && a.facts.length <= 4, `${q.id}: ${a.facts.length} facts`);
      for (const id of a.ids) assert.ok(ids.has(id), `${q.id}: ${id}`);
    }
  }
  // The sample journal answers most questions
  assert.ok(answered > 60, `${answered} answered`);
});
