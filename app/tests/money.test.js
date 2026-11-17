import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkEntry, dayLabel, firmsOf, isDay, lastAmount, money, pick, plain, sections, span, spanLabel, timesLabel, toMinor, totals, typed,
} from "../src/views/money/model.js";
import { MONEY_SAMPLE } from "../src/views/money/sample.js";

let n = 0;
const e = (day, kind, amount, more = {}) => ({ id: `m${++n}`, day, kind, minor: Math.round(amount * 100), currency: "GBP", firm: "apex", account: null, note: "", ...more });

/* ---------- Amounts ---------- */

test("toMinor reads what a trader types, in pence", () => {
  assert.equal(toMinor("49"), 4900);
  assert.equal(toMinor("£1,240.50"), 124050);
  assert.equal(toMinor("1240,5"), 124050); // a decimal comma
  assert.equal(toMinor(" $119.99 "), 11999);
  assert.equal(toMinor("0.01"), 1);
  assert.equal(toMinor("1000000"), 100000000);
  assert.equal(toMinor(""), null);
  assert.equal(toMinor(null), null);
  for (const x of ["0", "-5", "(49)", "abc", "1000000.01", "49.999", "1e3"]) assert.ok(Number.isNaN(toMinor(x)), x);
});

test("money and plain print a receipt's figures: two places, a real minus, the currency's sign", () => {
  assert.equal(plain(124000), "1,240.00");
  assert.equal(plain(-4900), "49.00");
  assert.equal(money(124000), "$1,240.00", "dollars unless the entry says otherwise");
  assert.equal(money(186000, "GBP", { sign: true }), "+£1,860.00");
  assert.equal(money(-45000, "USD", { sign: true }), "−$450.00");
  assert.equal(money(0, "EUR", { sign: true }), "€0.00");
  assert.equal(typed(4900), "49");
  assert.equal(typed(124050), "1240.50");
  assert.equal(toMinor(typed(124050)), 124050, "an amount opened to edit reads back the same");
});

test("dates: real days only, and the receipt's labels", () => {
  assert.ok(isDay("2026-03-14"));
  for (const x of ["2026-02-30", "2026-13-01", "14/03/2026", "", null]) assert.equal(isDay(x), false, String(x));
  assert.equal(dayLabel("2026-03-14"), "14 Mar 2026");
  assert.equal(dayLabel("2026-01-03", { year: false, pad: true }), "03 Jan");
  assert.equal(spanLabel({ from: "2026-01-01", to: "2026-10-30" }), "1 Jan – 30 Oct 2026");
  assert.equal(spanLabel({ from: "2025-11-04", to: "2026-10-30" }), "4 Nov 2025 – 30 Oct 2026");
});

/* ---------- The totals ---------- */

test("totals: fees in, payouts out, the true return and how many times over", () => {
  const list = [e("2026-01-03", "eval", 49), e("2026-01-10", "reset", 49), e("2026-02-02", "eval", 147), e("2026-03-06", "activation", 85),
    e("2026-03-14", "payout", 2140), e("2026-04-22", "payout", 960), e("2026-05-04", "eval", 207), e("2026-05-19", "reset", 80),
    e("2026-07-01", "eval", 119), e("2026-08-01", "eval", 119), e("2026-08-12", "eval", 118), e("2026-09-09", "activation", 149), e("2026-09-15", "reset", 118)];
  const [t] = totals(list);
  assert.equal(t.currency, "GBP");
  assert.equal(t.fees, 124000);
  assert.equal(t.paid, 310000);
  assert.equal(t.net, 186000);
  assert.equal(t.count, 13);
  assert.equal(timesLabel(t.multiple), "2.5×");
  assert.equal(t.aheadSince, "2026-03-14", "ahead from the first payout and never behind again");
});

test("totals: pence add up exactly (no floating-point drift)", () => {
  const list = Array.from({ length: 10 }, () => e("2026-02-01", "data", 0.1));
  assert.equal(totals(list)[0].fees, 100);
  assert.equal(totals([e("2026-02-01", "eval", 0.1), e("2026-02-02", "eval", 0.2)])[0].fees, 30);
});

test("ahead since: the start of the last stretch above nothing, read at the end of each day", () => {
  const list = [e("2026-01-05", "eval", 100), e("2026-03-01", "payout", 300), e("2026-05-01", "eval", 500), e("2026-06-10", "payout", 600)];
  assert.equal(totals(list)[0].aheadSince, "2026-06-10");
  const same = [e("2026-01-05", "eval", 100), e("2026-02-01", "payout", 150), e("2026-02-01", "reset", 40)];
  assert.equal(totals(same)[0].aheadSince, "2026-02-01");
  // Exactly even isn't ahead
  assert.equal(totals([e("2026-01-05", "eval", 100), e("2026-02-01", "payout", 100)])[0].aheadSince, null);
  // Behind overall: no date, whatever happened before
  const behind = totals([e("2026-01-05", "eval", 100), e("2026-02-01", "payout", 200), e("2026-03-01", "eval", 300)])[0];
  assert.equal(behind.net, -20000);
  assert.equal(behind.aheadSince, null);
  assert.equal(timesLabel(behind.multiple), "0.5×");
});

test("no fees, no payouts: nothing divides by zero", () => {
  const [t] = totals([e("2026-02-01", "payout", 500)]);
  assert.equal(t.fees, 0);
  assert.equal(t.multiple, null);
  assert.equal(timesLabel(t.multiple), "");
  assert.equal(t.aheadSince, "2026-02-01");
  assert.deepEqual(totals([]), []);
  assert.deepEqual(totals(undefined), []);
  const [f] = totals([e("2026-02-01", "eval", 50)]);
  assert.equal(f.paid, 0);
  assert.equal(f.multiple, 0);
  assert.equal(f.aheadSince, null);
});

test("currencies are never converted: each gets its own total, the most used first", () => {
  const list = [e("2026-01-05", "eval", 100), e("2026-01-06", "eval", 50, { currency: "USD" }), e("2026-01-07", "eval", 20, { currency: "USD" }),
    e("2026-02-01", "payout", 400, { currency: "USD" })];
  const t = totals(list);
  assert.deepEqual(t.map((x) => x.currency), ["USD", "GBP"]);
  assert.equal(t[0].fees, 7000);
  assert.equal(t[0].net, 33000);
  assert.equal(t[1].fees, 10000);
  assert.equal(t[1].net, -10000);
  // A tie goes pounds, dollars, euros
  assert.deepEqual(totals([e("2026-01-05", "eval", 1, { currency: "EUR" }), e("2026-01-05", "eval", 1)]).map((x) => x.currency), ["GBP", "EUR"]);
});

/* ---------- Which entries ---------- */

test("pick: this month, this year, all time, one firm or one account", () => {
  const list = [e("2025-12-30", "eval", 10, { firm: "topstep" }), e("2026-01-04", "eval", 20, { account: "a1" }), e("2026-10-02", "payout", 30, { firm: "Topstep" }),
    e("2026-10-29", "reset", 40, { firm: "My Own Firm" })];
  const today = "2026-10-30";
  assert.equal(pick(list, { period: "month", today }).length, 2);
  assert.equal(pick(list, { period: "year", today }).length, 3);
  assert.equal(pick(list, { period: "all", today }).length, 4);
  assert.equal(pick(list, { period: "all", show: "firm:topstep", today }).length, 2, "a slug and the same name typed are one firm");
  assert.equal(pick(list, { period: "all", show: "firm:my own firm", today }).length, 1);
  assert.equal(pick(list, { period: "all", show: "acct:a1", today }).length, 1);
  assert.deepEqual(span(list, "month", today), { from: "2026-10-01", to: today });
  assert.deepEqual(span(list, "year", today), { from: "2026-01-01", to: today });
  assert.deepEqual(span(list, "all", today), { from: "2025-12-30", to: today });
  assert.deepEqual(span([], "all", today), { from: today, to: today });
});

test("sections: account by account in the order they started, firm-only entries by firm", () => {
  const byId = { a1: { id: "a1", name: "Apex 50K", firm: "apex", label: "50K", kind: "Funded", status: "funded" } };
  const list = [e("2026-03-14", "payout", 2140, { account: "a1" }), e("2026-01-03", "eval", 49, { firm: "topstep" }), e("2026-02-02", "eval", 147, { account: "a1" }),
    e("2026-05-04", "eval", 207, { account: "gone", acct: { id: "gone", name: "Apex 100K", firm: "apex", label: "100K", kind: "Evaluation", archived: true } })];
  const s = sections(list, byId);
  assert.deepEqual(s.map((x) => x.name), ["Topstep", "Apex 50K", "Apex 100K"], "short firm names, as traders say them");
  assert.deepEqual(s.map((x) => x.state), ["", "Funded", "Archived"]);
  assert.deepEqual(s[1].entries.map((x) => x.day), ["2026-02-02", "2026-03-14"], "oldest first inside a section");
  assert.deepEqual(s[1].fees, { GBP: 14700 });
  assert.deepEqual(s[1].paid, { GBP: 214000 });
  assert.deepEqual(firmsOf(list).map((f) => f.name), ["Topstep", "Apex"]);
});

/* ---------- An entry, checked ---------- */

test("checkEntry: what the form sends, and what's wrong with it", () => {
  const today = "2026-10-30";
  const good = checkEntry({ firm: " apex ", kind: "eval", amount: "£147", currency: "GBP", day: "2026-02-02", note: " code SAVE80 ", account: "" }, { today });
  assert.ok(good.ok);
  assert.deepEqual(good.entry, { firm: "apex", account: null, kind: "eval", minor: 14700, currency: "GBP", day: "2026-02-02", note: "code SAVE80" });
  const bad = checkEntry({ firm: "", kind: "bonus", amount: "-3", currency: "JPY", day: "2026-11-02", note: "x".repeat(141) }, { today });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["amount", "currency", "day", "firm", "kind", "note"]);
  assert.equal(checkEntry({ firm: "apex", kind: "payout", amount: "", currency: "GBP", day: today }, { today }).errors.amount, "The amount");
});

test("lastAmount fills in what was paid last time for the same firm and kind", () => {
  const list = [e("2026-01-03", "eval", 49, { firm: "topstep" }), e("2026-02-03", "eval", 39, { firm: "Topstep" }), e("2026-02-05", "reset", 99, { firm: "topstep" })];
  assert.deepEqual(lastAmount(list, "topstep", "eval"), { minor: 3900, currency: "GBP" });
  assert.equal(lastAmount(list, "apex", "eval"), null);
});

/* ---------- The demo's sample ---------- */

test("the demo's receipt adds up: one currency, in dollars, every kind valid, a believable year", () => {
  const today = "2026-10-27";
  for (const x of MONEY_SAMPLE) assert.ok(checkEntry({ ...x, amount: typed(x.minor) }, { today }).ok, x.id);
  const [t] = totals(pick(MONEY_SAMPLE, { period: "year", today }));
  assert.equal(t.currency, "USD");
  assert.ok(t.paid > t.fees, "the sample trader has come out ahead");
  assert.ok(t.aheadSince);
  assert.equal(new Set(MONEY_SAMPLE.map((x) => x.id)).size, MONEY_SAMPLE.length);
});
