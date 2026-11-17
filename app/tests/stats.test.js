import { test } from "node:test";
import assert from "node:assert/strict";
import { CAL, dayName, fmtMoney, hourSpan, inPeriod, limitsHit, noTradesYet, periodName, plural, rBins, runOf, summarize, todayKey, todayOf, word } from "../src/data.js";
import { parseNum, pointValueFor, workOut } from "../src/lib/trade.js";
import { videoSeconds, videoTime } from "../src/lib/video.js";
import { nyInstant } from "../src/live/time.js";

const t = (pnl, extra = {}) => ({ pnl, r: null, followedPlan: null, ...extra });

test("plurals: 1 trade, 2 trades, 1 loss, 3 losses", () => {
  assert.equal(plural(1, "trade"), "1 trade");
  assert.equal(plural(0, "trade"), "0 trades");
  assert.equal(plural(1, "loss"), "1 loss");
  assert.equal(plural(3, "loss"), "3 losses");
  assert.equal(plural(2, "win"), "2 wins");
  assert.equal(word(1, "win"), "win");
  assert.equal(word(4, "note"), "notes");
});

test("breakeven: a $0 trade is neither a win nor a loss, and doesn't drag the averages", () => {
  const s = summarize([t(200), t(0), t(-200), t(-200), t(0)]);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 2);
  assert.equal(s.breakeven, 2);
  assert.equal(s.avgLoss, 200); // not 400/3 or 400/4
  assert.equal(Math.round(s.winRate), 33); // 1 of the 3 decided trades
  assert.equal(summarize([]).winRate, 0);
});

test("empty figures know they're empty: no R, no verdicts", () => {
  const s = summarize([t(100), t(-50)]);
  assert.equal(s.withR, 0);
  assert.equal(s.judged, 0);
  const s2 = summarize([t(100, { r: 2, followedPlan: true }), t(-50, { r: -1, followedPlan: null })]);
  assert.equal(s2.withR, 2);
  assert.equal(s2.judged, 1);
  assert.equal(s2.rulesKept, 100); // 1 of 1 judged, not 1 of 2
});

test("money keeps its cents only when there are some", () => {
  assert.equal(fmtMoney(100.5), "$100.50");
  assert.equal(fmtMoney(100), "$100");
  assert.equal(fmtMoney(12.5, { sign: true }), "+$12.50");
  assert.equal(fmtMoney(-0.25, { sign: true }), "-$0.25");
  assert.equal(fmtMoney(1234.567), "$1,234.57");
  assert.equal(fmtMoney(0, { sign: true }), "$0");
});

test("hours: the session and every hour that has a trade", () => {
  assert.deepEqual(hourSpan([]), [9, 10, 11, 12, 13]);
  assert.deepEqual(hourSpan([{ hour: 2 }, { hour: 15 }]), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(hourSpan([{ hour: 0 }]).slice(0, 2), [0, 1]);
});

test("R distribution: every trade with an R lands in a bucket", () => {
  const rs = [-2.5, -1, 0.2, 1.7, 4.5, null];
  const bins = rBins(rs);
  assert.equal(bins.reduce((a, b) => a + b.value, 0), 5);
  assert.equal(bins[0].lo, -2.5);
  assert.equal(bins.at(-1).lo, 4.5);
  const wide = rBins([-40, 0.5, 60]);
  assert.equal(wide.reduce((a, b) => a + b.value, 0), 3);
  assert.ok(wide.length <= 31);
  assert.match(wide[0].label, /^≤/);
  assert.match(wide.at(-1).label, /^≥/);
  // The default span with nothing in it
  assert.equal(rBins([]).length, 9);
});

test("runs: losses in a row at the end of the day (newest first), breakeven skipped", () => {
  assert.deepEqual(runOf([t(-10), t(0), t(-5), t(20), t(-1)]), { wins: 0, losses: 2 });
  assert.deepEqual(runOf([t(10), t(5), t(-5)]), { wins: 2, losses: 0 });
});

test("daily rules: which are reached", () => {
  const rules = { lossLimit: 100.5, maxTrades: 2, stopAfter: 2 };
  assert.deepEqual(limitsHit(rules, { lossUsed: 101, trades: 3, lossesInARow: 2 }), ["loss", "trades", "streak"]);
  assert.deepEqual(limitsHit(rules, { lossUsed: 50, trades: 1, lossesInARow: 1 }), []);
  assert.deepEqual(limitsHit({ lossLimit: null, maxTrades: null, stopAfter: null }, { lossUsed: 999, trades: 99, lossesInARow: 9 }), []);
});

test("today is worked out against the clock, so a trade from before midnight becomes yesterday's", () => {
  const today = todayKey();
  const trades = [{ pnl: -300, dayKey: today, followedPlan: null }, { pnl: 50, dayKey: "2000-01-01", followedPlan: null }];
  const day = todayOf(trades);
  assert.equal(day.trades, 1);
  assert.equal(day.pnl, -300);
  assert.equal(day.lossesInARow, 1);
  assert.equal(todayOf([{ pnl: -300, dayKey: "2000-01-01" }]).trades, 0);
});

test("numbers as traders type them", () => {
  assert.equal(parseNum("21000,5"), 21000.5);
  assert.equal(parseNum("21,000.50"), 21000.5);
  // European: the separator that comes last is the decimal one
  assert.equal(parseNum("21.000,50"), 21000.5);
  assert.equal(parseNum("12.345,67"), 12345.67);
  assert.equal(parseNum("1.234.567,89"), 1234567.89);
  assert.equal(parseNum("21,000"), 21000);
  assert.equal(parseNum("$750"), 750);
  assert.equal(parseNum("(250)"), -250);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
  assert.ok(Number.isNaN(parseNum("1.2.3")));
});

test("point values: every contract month of a known market, and unknown is asked for", () => {
  for (const [sym, pv] of [["YM", 5], ["MYM", 0.5], ["RTY", 50], ["M2K", 5], ["6E", 125000], ["NQZ6", 20], ["MNQ 12-26", 2], ["EURUSD", 100000]]) assert.equal(pointValueFor(sym), pv, sym);
  assert.equal(pointValueFor("XYZ"), null);
  assert.equal(pointValueFor("XYZ", { XYZ: 12.5 }), 12.5);
});

test("the trade form: P&L from the prices to the cent, for every market", () => {
  const base = { side: "long", size: "1", time: "09:41", date: "2026-10-27", r: "", pnl: "", pointValue: "", note: "" };
  const pnl = (symbol, entry, stop, exit, size = "1") => workOut({ ...base, symbol, entry, stop, exit, size }).pnl;
  assert.equal(pnl("YM", "42000", "41990", "42010"), 50);
  assert.equal(pnl("RTY", "2200", "2190", "2210"), 500);
  assert.equal(pnl("M2K", "2200", "2190", "2210"), 50);
  assert.equal(pnl("MYM", "42000", "41990", "42010"), 5);
  assert.equal(pnl("6E", "1.085", "1.084", "1.086"), 125);
  assert.equal(pnl("NQZ6", "21000", "20990", "21010"), 200);
  assert.equal(pnl("MNQ", "21000", "20990", "21000.25"), 0.5); // not rounded to $1
  assert.equal(pnl("NQ", "21000,5", "20990", "21010,5", "2"), 400); // decimal commas
  const short = workOut({ ...base, symbol: "ES", side: "short", entry: "5000", stop: "5010", exit: "4990" });
  assert.equal(short.pnl, 500);
  assert.equal(short.r, 1);
});

test("the trade form: what's wrong is said, and nothing is guessed", () => {
  const base = { symbol: "NQ", side: "long", size: "1", time: "09:41", date: "2026-10-27", r: "", pnl: "", pointValue: "", note: "" };
  assert.equal(workOut({ ...base, entry: "21000", stop: "21010", exit: "21020" }).errors.stop, "For a long, the stop sits below the entry");
  assert.equal(workOut({ ...base, side: "short", entry: "21000", stop: "20990", exit: "20980" }).errors.stop, "For a short, the stop sits above the entry");
  assert.equal(workOut({ ...base, entry: "21000", stop: "20990", exit: "21010", size: "-2" }).errors.size, "More than 0");
  assert.equal(workOut({ ...base, entry: "21000", stop: "20990", exit: "21010", size: "0" }).errors.size, "More than 0");
  assert.equal(workOut({ ...base, entry: "21000", stop: "20990", exit: "21010", size: "abc" }).errors.size, "Not a number");
  assert.equal(workOut({ ...base, time: "25:99", entry: "21000", stop: "20990", exit: "21010" }).errors.time, "A time like 09:41");
  assert.equal(workOut({ ...base, symbol: "MICRONASDAQDEC2026", entry: "1", stop: "0", exit: "2" }).errors.symbol, "16 characters at most");
  assert.ok(workOut({ ...base, note: "x".repeat(4001), entry: "1", stop: "0", exit: "2" }).errors.note);
  const unknown = workOut({ ...base, symbol: "XYZ", entry: "100", stop: "99", exit: "102" });
  assert.equal(unknown.needsPointValue, true);
  assert.equal(unknown.pnl, null);
  assert.equal(unknown.valid, false);
  assert.equal(workOut({ ...base, symbol: "XYZ", entry: "100", stop: "99", exit: "102", pointValue: "50" }).pnl, 100);
  assert.equal(workOut({ ...base, symbol: "XYZ", entry: "100", stop: "99", exit: "102", pnl: "75" }).pnl, 75);
  // Typed R and P&L, to the cent
  const typed = workOut({ ...base, r: "1,5", pnl: "12.50" });
  assert.equal(typed.r, 1.5);
  assert.equal(typed.pnl, 12.5);
  assert.equal(typed.valid, true);
});

test("video times: m:ss, h:mm:ss or seconds; anything else is refused", () => {
  assert.deepEqual(videoTime("12:44"), { ok: true, value: "12:44" });
  assert.deepEqual(videoTime(""), { ok: true, value: null });
  assert.equal(videoTime("abc").ok, false);
  assert.equal(videoTime("12:99").ok, false);
  assert.equal(videoSeconds("1:02:03"), 3723);
  assert.equal(videoSeconds("90"), 90);
  assert.equal(videoSeconds("abc"), null);
});

test("New York time: the instant for a trade typed as a New York date and time", () => {
  assert.equal(nyInstant(2026, 8, 30, 23, 30).toISOString(), "2026-10-01T03:30:00.000Z");
  // and in winter, 5 hours behind
  assert.equal(nyInstant(2026, 11, 1, 9, 30).toISOString(), "2026-12-01T14:30:00.000Z");
});

test("all time: the best day is a date (28 Oct and 28 Nov stay apart), and the wording follows the period on show", () => {
  const ts = [t(300, { day: 28, dayKey: "2026-10-28" }), t(-100, { day: 28, dayKey: "2026-11-28" }), t(250, { day: 3, dayKey: "2026-11-03" })];
  assert.deepEqual(summarize(ts).bestDay, { d: 28, key: "2026-10-28", v: 300 });
  assert.equal(dayName(28, "2026-10-28"), "Wed 28 Oct");
  const was = { ...CAL };
  try {
    CAL.all = true;
    assert.equal(periodName(), "All time");
    assert.equal(inPeriod(), "so far");
    assert.equal(noTradesYet(), "No trades yet");
    Object.assign(CAL, { all: false, year: 2026, month: 8 });
    assert.equal(periodName(), "September");
    assert.equal(inPeriod(), "in September");
    assert.equal(noTradesYet(), "No trades in September");
  } finally { Object.assign(CAL, was); }
});
