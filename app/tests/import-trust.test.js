// Wrong trades from an import are the worst thing Marble can do. Each case here was run against the engine in the features
// audit (F3, research_notes/Marble features audit/data/engine-check.mjs) and invented or lost a trade. All files are made
// here by script: none of this has been tried against a real broker export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./fake-supabase.mjs";
import { mappingFor, presetById, readTable } from "../src/live/import/engine.js";
import { NY_CLOSE, STALE_DAYS, ZONES, build, parseWhen, zoneHint, zoneTwin } from "../src/live/import/trust.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const iso = (d) => new Date(d).toISOString();
const orders = (rows) => ["orderId,Account,B/S,Contract,avgPrice,filledQty,Fill Time,Status", ...rows].join("\n");
const row = (id, side, price, time, qty = 1, contract = "NQZ6") => `${id},ACC,${side},${contract},${price},${qty},${time},Filled`;
const run = (csv, id, opts) => { const t = readTable(csv); return build(t, mappingFor(presetById(id), t.headers), opts); };
const tradovate = (rows, opts = {}) => run(orders(rows), "tradovate-orders", { tz: "America/New_York", ...opts });
const facts = (t) => [t.symbol, t.side, t.entry, t.exit, t.net];

/* ---------- A. A file that starts in the middle of a position ---------- */

const MID_POSITION = [row(1, "Sell", 20000, "2026-11-02 09:31:00"), row(2, "Buy", 20010, "2026-11-02 09:40:00"), row(3, "Sell", 20015, "2026-11-02 09:45:00")];

test("A: a file that starts mid-position keeps the real +$100 trade and invents no short", () => {
  const r = tradovate(MID_POSITION);
  assert.deepEqual(r.trades.map(facts), [["NQ", "long", 20010, 20015, 100]]);
  assert.equal(r.open.length, 0, "nothing is left to carry into the next file");
});

test("A: the fill left out is named, with how many and which way it was read", () => {
  const { unbalanced } = tradovate(MID_POSITION);
  assert.equal(unbalanced.length, 1);
  const [u] = unbalanced;
  assert.deepEqual([u.contract, u.symbol, u.reading], ["NQZ6", "NQ", "start"]);
  assert.deepEqual(u.fills.map((f) => [f.side, f.qty, f.price, f.time]), [["sell", 1, 20000, "2026-11-02T14:31:00.000Z"]]);
});

test("A: one stale fill doesn't turn a whole file of trades the wrong way round", () => {
  const r = tradovate([
    row(1, "Sell", 20000, "2026-11-02 09:31:00"),
    row(2, "Buy", 20010, "2026-11-02 09:40:00"), row(3, "Sell", 20015, "2026-11-02 09:45:00"),
    row(4, "Buy", 20020, "2026-11-02 11:00:00"), row(5, "Sell", 20030, "2026-11-02 11:04:00"),
    row(6, "Buy", 20040, "2026-11-03 09:35:00"), row(7, "Sell", 20035, "2026-11-03 09:39:00"),
  ]);
  assert.deepEqual(r.trades.map(facts), [["NQ", "long", 20010, 20015, 100], ["NQ", "long", 20020, 20030, 200], ["NQ", "long", 20040, 20035, -100]]);
  assert.deepEqual(r.unbalanced[0].fills.map((f) => f.price), [20000]);
});

test("A: an old position closed in pieces invents nothing, and the trader can bring the real trade in", () => {
  const pieces = [
    row(1, "Sell", 20000, "2026-11-02 09:31:00"), row(2, "Sell", 20002, "2026-11-02 09:32:00"),
    row(3, "Buy", 20010, "2026-11-02 09:40:00"), row(4, "Sell", 20015, "2026-11-02 09:45:00"),
  ];
  const r = tradovate(pieces);
  assert.equal(r.trades.length, 0, "the file never goes flat read forwards, so nothing is at risk of being invented");
  assert.deepEqual(r.unbalanced.map((u) => [u.reading, u.fills.length]), [["end", 4]], "and it's in question, not a plain open position");
  const told = tradovate(pieces, { edges: { NQZ6: "start" } });
  assert.deepEqual(told.trades.map(facts), [["NQ", "long", 20010, 20015, 100]]);
  assert.deepEqual(told.unbalanced[0].fills.map((f) => f.price), [20000, 20002]);
  assert.equal(told.open.length, 0);
});

test("A: a scale-in and a partial exit stays open: no reading turns it into a trade uninvited", () => {
  const r = tradovate([row(1, "Buy", 20000, "2026-11-02 09:31:00"), row(2, "Buy", 20010, "2026-11-02 11:00:00"), row(3, "Sell", 20020, "2026-11-02 11:05:00")]);
  assert.equal(r.trades.length, 0);
  assert.deepEqual(r.open.map((o) => [o.side, o.qty]), [["long", 1]]);
  assert.deepEqual(r.unbalanced.map((u) => u.reading), ["end"]);
});

test("A: a fill that closes the old position and opens a new one is split, and the new trade stands", () => {
  const r = tradovate([row(1, "Sell", 20000, "2026-11-02 09:31:00", 3), row(2, "Buy", 19990, "2026-11-02 09:40:00", 3), row(3, "Sell", 19995, "2026-11-02 09:45:00", 2)], { edges: { NQZ6: "start" } });
  assert.deepEqual(r.trades.map((t) => [t.side, t.size, t.entry, t.exit, t.net]), [["short", 1, 20000, 19990, 200], ["long", 2, 19990, 19995, 200]]);
  assert.deepEqual(r.unbalanced[0].fills.map((f) => [f.qty, f.price]), [[2, 20000]]);
  assert.equal(r.open.length, 0);
});

test("A: only the contract that doesn't balance is touched", () => {
  const r = tradovate([...MID_POSITION, row(4, "Buy", 6000, "2026-11-02 10:00:00", 1, "ESZ6"), row(5, "Sell", 6002, "2026-11-02 10:05:00", 1, "ESZ6")]);
  assert.deepEqual(r.trades.map(facts), [["NQ", "long", 20010, 20015, 100], ["ES", "long", 6000, 6002, 100]]);
  assert.deepEqual(r.unbalanced.map((u) => u.symbol), ["NQ"]);
});

test("A: a position really open at the end, held long after the last trade, is still read that way", () => {
  const r = tradovate([row(1, "Buy", 20000, "2026-11-02 09:31:00"), row(2, "Sell", 20010, "2026-11-02 09:40:00"), row(3, "Buy", 20005, "2026-11-02 15:45:00")]);
  assert.deepEqual(r.trades.map(facts), [["NQ", "long", 20000, 20010, 200]]);
  assert.deepEqual(r.open.map((o) => [o.symbol, o.side, o.qty]), [["NQ", "long", 1]]);
  assert.deepEqual(r.unbalanced.map((u) => [u.reading, u.fills.length]), [["end", 1]]);
});

test("A: the same three fills read either way are the trader's call, both ways round", () => {
  // Fills alone can't always tell a file that starts mid-position from one that ends there
  const asOpenAtEnd = tradovate(MID_POSITION, { edges: { NQZ6: "end" } });
  assert.deepEqual(asOpenAtEnd.trades.map(facts), [["NQ", "short", 20000, 20010, -200]]);
  assert.deepEqual(asOpenAtEnd.open.map((o) => [o.side, o.qty]), [["short", 1]]);
  assert.equal(asOpenAtEnd.unbalanced[0].reading, "end");
  const held = [row(1, "Buy", 20000, "2026-11-02 09:31:00"), row(2, "Sell", 20010, "2026-11-02 09:40:00"), row(3, "Buy", 20005, "2026-11-02 15:45:00")];
  const asStart = tradovate(held, { edges: { NQZ6: "start" } });
  assert.deepEqual(asStart.trades.map(facts), [["NQ", "short", 20010, 20005, 100]]);
  assert.equal(asStart.open.length, 0);
});

test("A: fills on one side only make no trade under either reading, so they're a plain open position for the next file", () => {
  for (const fills of [
    [row(1, "Buy", 6000, "2026-11-02 11:00:00", 1, "ESZ6")],
    [row(1, "Buy", 6000, "2026-11-02 11:00:00", 1, "ESZ6"), row(2, "Buy", 6005, "2026-11-02 11:30:00", 1, "ESZ6")],
  ]) {
    const r = tradovate(fills);
    assert.equal(r.trades.length, 0);
    assert.deepEqual(r.unbalanced, []);
    assert.equal(r.open.length, 1);
  }
});

test("A: a file that marks entries and exits needs no reading: it already said", () => {
  const nt = ["Instrument,Action,Quantity,Price,Time,ID,E/X,Commission,Account",
    "NQ 12-26,Sell,1,20000,2026-11-02 09:31:00,1,Exit,0,S1",
    "NQ 12-26,Buy,1,20010,2026-11-02 09:40:00,2,Entry,0,S1",
    "NQ 12-26,Sell,1,20015,2026-11-02 09:45:00,3,Exit,0,S1",
    "NQ 12-26,Buy,1,20020,2026-11-02 09:50:00,4,Entry,0,S1"].join("\n");
  const r = run(nt, "ninjatrader-executions", { tz: "America/New_York" });
  assert.equal(r.orphans.length, 1);
  assert.deepEqual(r.trades.map(facts), [["NQ", "long", 20010, 20015, 100]]);
  assert.deepEqual(r.open.map((o) => [o.side, o.qty]), [["long", 1]]);
  assert.deepEqual(r.unbalanced, [], "open at the end, as the file says");
});

test("A: words on the side column count as the file saying so", () => {
  const csv = ["Time,Symbol,Side,Qty,Price", "2026-11-02 09:31:00,BTCUSDT,Open Long,1,100", "2026-11-02 09:40:00,BTCUSDT,Close Long,1,110", "2026-11-02 09:45:00,BTCUSDT,Open Long,1,105"].join("\n");
  const t = readTable(csv);
  const r = build(t, { ...mappingFor(presetById("generic-fills"), t.headers), world: "crypto", linear: true }, { tz: "UTC" });
  assert.deepEqual(r.trades.map((x) => [x.side, x.entry, x.exit]), [["long", 100, 110]]);
  assert.deepEqual(r.unbalanced, []);
});

test("A: a left-out fill's fee doesn't reach the trades that stand, and an unpriced market is still asked about", () => {
  const csv = ["Time,Symbol,Side,Qty,Price,Commission", "2026-11-02 09:31:00,XYZ,Sell,1,100,9", "2026-11-02 09:40:00,XYZ,Buy,1,110,1", "2026-11-02 09:45:00,XYZ,Sell,1,115,1"].join("\n");
  const t = readTable(csv);
  const mapping = mappingFor(presetById("generic-fills"), t.headers);
  const told = build(t, mapping, { tz: "UTC", points: { XYZ: 2 } });
  assert.deepEqual(told.trades.map((x) => [x.side, x.gross, x.commission, x.net]), [["long", 10, 2, 8]]);
  assert.deepEqual(build(t, mapping, { tz: "UTC" }).unknown, ["XYZ"]);
});

/* ---------- B. A stale open fill from the last import ---------- */

const stale = (at = "2026-11-02 09:31:00") => tradovate([row(10, "Buy", 20000, at)]).open.flatMap((o) => o.fills);
const LATER = [row(20, "Sell", 21000, "2026-11-23 10:00:00"), row(21, "Buy", 20990, "2026-11-23 10:05:00")];

test("B: a stale open fill three weeks old makes no $20,000 trade, and the real trade stands", () => {
  const r = tradovate(LATER, { carried: stale() });
  assert.deepEqual(r.trades.map(facts), [["NQ", "short", 21000, 20990, 200]]);
  assert.ok(r.trades.every((t) => Math.abs(t.net) < 1000));
  assert.equal(r.open.length, 0, "it goes no further: it won't come back on the next file");
});

test("B: the stale fill is named for the preview", () => {
  const r = tradovate(LATER, { carried: stale() });
  assert.deepEqual(r.stale.map((o) => [o.symbol, o.side, o.qty, o.fills.length]), [["NQ", "long", 1, 1]]);
});

test("B: a fresher open fill can't break a clean file either, and waits for the file that closes it", () => {
  const carried = stale("2026-11-20 09:31:00");
  const r = tradovate(LATER, { carried });
  assert.deepEqual(r.trades.map(facts), [["NQ", "short", 21000, 20990, 200]], "this file balances on its own");
  assert.deepEqual(r.stale, []);
  assert.deepEqual(r.open.map((o) => [o.symbol, o.side, o.qty]), [["NQ", "long", 1]]);
  assert.deepEqual(r.open[0].fills.map((f) => f.key), carried.map((f) => f.key));
  const closed = tradovate([row(30, "Sell", 20100, "2026-11-24 10:00:00")], { carried: r.open.flatMap((o) => o.fills) });
  assert.deepEqual(closed.trades.map(facts), [["NQ", "long", 20000, 20100, 2000]]);
});

test("B: a position the file needs still finishes, right up to the limit", () => {
  const close = (at) => tradovate([row(20, "Sell", 20100, at)], { carried: stale("2026-11-02 09:31:00") });
  const inside = close(`2026-11-${String(2 + STALE_DAYS).padStart(2, "0")} 09:30:00`);
  assert.deepEqual(inside.trades.map(facts), [["NQ", "long", 20000, 20100, 2000]]);
  assert.deepEqual(inside.stale, []);
  const outside = close("2026-11-17 09:32:00");
  assert.equal(outside.trades.length, 0);
  assert.equal(outside.stale.length, 1);
});

test("B: a long hold is fine when the file covers the gap", () => {
  const r = tradovate([row(19, "Buy", 6000, "2026-11-03 09:30:00", 1, "ESZ6"), row(20, "Sell", 6002, "2026-11-03 09:35:00", 1, "ESZ6"), row(21, "Sell", 21000, "2026-11-23 10:00:00")], { carried: stale() });
  assert.deepEqual(r.stale, []);
  assert.deepEqual(r.trades.map(facts), [["NQ", "long", 20000, 21000, 20000], ["ES", "long", 6000, 6002, 100]]);
});

test("B: a file that holds the carried fills itself doesn't count them twice", () => {
  const carried = stale();
  const r = tradovate([row(10, "Buy", 20000, "2026-11-02 09:31:00"), row(20, "Sell", 20010, "2026-11-02 10:00:00")], { carried });
  assert.deepEqual(r.trades.map(facts), [["NQ", "long", 20000, 20010, 200]]);
  assert.equal(r.open.length, 0);
  assert.deepEqual(r.stale, []);
});

/* ---------- C. MetaTrader's server clock ---------- */

const nyPlus7 = (s) => new Date(+parseWhen(s, { tz: "America/New_York" }) - 7 * 3600e3);

test("C: the New York close clock is right in the weeks when New York and Europe disagree", () => {
  for (const s of ["2026-03-20 12:00:00", "2026-10-28 12:00:00", "2026-07-01 12:00:00", "2026-01-15 12:00:00", "2026-03-09 10:00:00", "2026-11-02 12:00:00"]) {
    assert.equal(iso(parseWhen(s, { tz: NY_CLOSE })), iso(nyPlus7(s)), s);
  }
  assert.equal(iso(parseWhen("2026-10-28 12:00:00", { tz: NY_CLOSE })), "2026-10-28T09:00:00.000Z"); // UTC+3 until New York changes
  assert.equal(iso(parseWhen("2026-01-15 12:00:00", { tz: NY_CLOSE })), "2026-01-15T10:00:00.000Z"); // UTC+2 in winter
  assert.equal(iso(parseWhen("2026-03-08 08:00:00", { tz: NY_CLOSE })), "2026-03-08T06:00:00.000Z", "still UTC+2 here: it's 1am in New York, before the change");
  assert.equal(iso(parseWhen("2026-10-28 12:00:00", { tz: "Europe/Helsinki" })), "2026-10-28T10:00:00.000Z", "the Europe option still changes on Europe's dates");
});

test("C: a time with its own offset stands, and rubbish stays unread", () => {
  assert.equal(iso(parseWhen("2026-10-28T12:00:00Z", { tz: NY_CLOSE })), "2026-10-28T12:00:00.000Z");
  assert.equal(parseWhen("not a date", { tz: NY_CLOSE }), null);
  assert.equal(parseWhen("", { tz: NY_CLOSE }), null);
});

const MT5 = ["Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Swap,Profit", "2026.10.28 12:00:00,1,EURUSD,buy,in,0.1,1.08,1,0,0,0", "2026.10.28 12:30:00,2,EURUSD,sell,out,0.1,1.09,2,0,0,100"].join("\n");

test("C: a MetaTrader file reads an hour earlier on the New York clock in those weeks, and nothing else moves", () => {
  const ny = run(MT5, "mt5-deals", { tz: NY_CLOSE }), europe = run(MT5, "mt5-deals", { tz: "Europe/Helsinki" });
  assert.equal(iso(ny.trades[0].opened), "2026-10-28T09:00:00.000Z");
  assert.equal(iso(europe.trades[0].opened), "2026-10-28T10:00:00.000Z");
  assert.equal(iso(ny.trades[0].closed), "2026-10-28T09:30:00.000Z");
  assert.equal(ny.trades[0].fills[0].time, "2026-10-28T09:00:00.000Z");
  assert.equal(ny.trades[0].net, europe.trades[0].net);
  assert.equal(ny.trades[0].holdMs, 30 * 60e3);
  assert.equal(ny.trades[0].key, europe.trades[0].key, "the deal ids key it, so a second zone is still the same deal");
});

test("C: MetaTrader 4 statements and a date in one column and time in another read the same way", () => {
  const mt4 = ["Ticket,Open Time,Type,Size,Item,Price,S / L,T / P,Close Time,Price,Commission,Taxes,Swap,Profit", "1,2026.03.20 12:00:00,buy,0.1,EURUSD,1.08,0,0,2026.03.20 13:00:00,1.09,0,0,0,100"].join("\n");
  const r = run(mt4, "mt4-statement", { tz: NY_CLOSE });
  assert.deepEqual([iso(r.trades[0].opened), iso(r.trades[0].closed)], ["2026-03-20T09:00:00.000Z", "2026-03-20T10:00:00.000Z"]);
  const two = ["Date,Time,Symbol,Side,Qty,Price", "2026-03-20,12:00:00,EURUSD,Buy,1,1.08", "2026-03-20,12:30:00,EURUSD,Sell,1,1.09"].join("\n");
  const t = readTable(two);
  const joined = build(t, mappingFor(presetById("generic-fills"), t.headers), { tz: NY_CLOSE, points: { EURUSD: 1 } });
  assert.equal(iso(joined.trades[0].opened), "2026-03-20T09:00:00.000Z");
});

test("C: the clock keeps the date question open when a file's dates could go either way", () => {
  const csv = ["Time,Symbol,Side,Qty,Price", "03/04/2026 12:00:00,EURUSD,Buy,1,1.08", "03/04/2026 12:30:00,EURUSD,Sell,1,1.09"].join("\n");
  const t = readTable(csv);
  const mapping = mappingFor(presetById("generic-fills"), t.headers);
  assert.equal(build(t, mapping, { tz: NY_CLOSE }).dates.ambiguous, true);
  assert.equal(iso(build(t, mapping, { tz: NY_CLOSE, order: "DMY" }).trades[0].opened), iso(nyPlus7("2026-04-03 12:00:00")));
});

test("C: MetaTrader starts on the New York close clock, every other platform as before, and both summer clocks are offered", () => {
  for (const id of ["mt5-deals", "mt4-statement"]) {
    const hint = zoneHint(presetById(id), []);
    assert.equal(hint.zone, NY_CLOSE);
    assert.equal(hint.ask, true);
  }
  assert.deepEqual(zoneHint(presetById("topstepx"), []), { zone: "UTC", from: "platform" });
  assert.equal(zoneHint(presetById("tradovate-orders"), []).zone, null);
  const labels = Object.fromEntries(ZONES);
  assert.match(labels[NY_CLOSE], /US clock change/);
  assert.match(labels["Europe/Helsinki"], /Europe clock change/);
  assert.ok(labels["Etc/GMT-2"] && labels.UTC, "the rest of the list stays");
});

/* ---------- D. The same file under a second time zone ---------- */

const NT = ["Instrument,Account,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Profit,Commission", "NQ 12-26,Sim101,Long,1,20000,20010,11/2/2026 9:30:00 AM,11/2/2026 9:40:00 AM,200,4"].join("\n");
const saved = (t) => ({ symbol: t.symbol, side: t.side, size: t.size, entry: t.entry, exit: t.exit, traded_at: iso(t.opened), closedAt: iso(t.closed) });

test("D: the same no-id file under a second zone is caught, though its keys differ", () => {
  const first = run(NT, "ninjatrader-trades", { tz: "America/New_York" }).trades[0];
  const second = run(NT, "ninjatrader-trades", { tz: "Europe/London" }).trades[0];
  assert.notEqual(first.key, second.key, "the key alone can't catch this");
  assert.ok(zoneTwin(second, [saved(first)]));
});

test("D: it's caught for a fills file with no ids too", () => {
  const csv = ["Time,Symbol,Side,Qty,Price", "2026-11-02 09:30:00,NQZ6,Buy,1,20000", "2026-11-02 09:40:00,NQZ6,Sell,1,20010"].join("\n");
  const t = readTable(csv);
  const mapping = mappingFor(presetById("generic-fills"), t.headers);
  const first = build(t, mapping, { tz: "America/Chicago" }).trades[0];
  const second = build(t, mapping, { tz: "Asia/Singapore" }).trades[0];
  assert.notEqual(first.key, second.key);
  assert.ok(zoneTwin(second, [saved(first)]));
});

test("D: half-hour zones count; so does a clock change inside the trade", () => {
  const t = { symbol: "NQ", side: "long", size: 1, entry: 20000, exit: 20010, opened: new Date("2026-11-02T04:00:00Z"), closed: new Date("2026-11-02T04:30:00Z") };
  const journal = (open, close) => [{ symbol: "NQ", side: "long", size: "1", entry: "20000", exit: "20010", traded_at: open, closedAt: close }];
  assert.ok(zoneTwin(t, journal("2026-11-02T09:30:00Z", "2026-11-02T10:00:00Z")), "5h30 apart, as India would be");
  assert.ok(zoneTwin(t, journal("2026-11-02T09:00:00Z", "2026-11-02T10:30:00Z")), "the second time an hour further off");
});

test("D: a real trade that only looks alike goes in", () => {
  const t = run(NT, "ninjatrader-trades", { tz: "America/New_York" }).trades[0];
  const base = saved(t);
  const shifted = { ...base, traded_at: iso(+t.opened + 36e5), closedAt: iso(+t.closed + 36e5) };
  assert.ok(zoneTwin(t, [shifted]), "the control: an hour off, everything else the same");
  assert.equal(zoneTwin(t, [{ ...shifted, entry: 20001 }]), null, "another price");
  assert.equal(zoneTwin(t, [{ ...shifted, exit: 20011 }]), null);
  assert.equal(zoneTwin(t, [{ ...shifted, size: 2 }]), null, "another size");
  assert.equal(zoneTwin(t, [{ ...shifted, side: "short" }]), null);
  assert.equal(zoneTwin(t, [{ ...shifted, symbol: "ES" }]), null);
  assert.equal(zoneTwin(t, [{ ...base, traded_at: iso(+t.opened + 7 * 60e3), closedAt: iso(+t.closed + 7 * 60e3) }]), null, "7 minutes off is no time zone");
  assert.equal(zoneTwin(t, [{ ...base, traded_at: iso(+t.opened + 3 * 864e5), closedAt: iso(+t.closed + 3 * 864e5) }]), null, "three days later");
  assert.equal(zoneTwin(t, [{ ...shifted, closedAt: iso(+t.closed + 5 * 36e5) }]), null, "held hours longer");
  assert.equal(zoneTwin(t, [base]), null, "the very same times are the two-minute check's job, or the key's");
  assert.equal(zoneTwin(t, []), null);
});

test("D: the preview skips a twin by default, says why, and lets the trader bring it in", () => {
  const src = read("src/live/Import.jsx");
  assert.match(src, /const twin = zoneTwin\(t, mine\);\s+if \(twin\) return \{ t, status: include\[t\.key\] \? "new" : "maybe"/);
  assert.ok(src.indexOf("zoneTwin(t, mine)") < src.indexOf("const like = mine.find"), "before the softer two-minute check");
  assert.match(src, /imported under another time zone, so/);
});

/* ---------- The preview says what was left out ---------- */

test("preview: the trader sees how many fills were left out and why, and can overrule the reading", () => {
  const src = read("src/live/Import.jsx");
  assert.match(src, /build\(file\.table, mapping, \{ tz, order, points, fileAccount, carried, edges \}\)/);
  assert.match(src, /from "\.\/import\/trust"/);
  assert.match(src, /buys and sells don't match in this file, so \{fills\(u\.fills\.length\)\}/);
  assert.match(src, /opened a trade instead/);
  assert.match(src, /closed an older position instead/);
  assert.match(src, /from your last import left out/);
  assert.match(src, /import one file that covers both the open and the close/);
  assert.equal((src.match(/\{notes\}/g) || []).length, 2, "both the Markets and Crypto flows show them");
});

test("preview: a contract in question is told once, not again as a plain open position", () => {
  const r = tradovate([row(1, "Buy", 20000, "2026-11-02 09:31:00"), row(2, "Sell", 20010, "2026-11-02 09:40:00"), row(3, "Buy", 20005, "2026-11-02 15:45:00")]);
  assert.deepEqual(r.open.map((o) => o.contract), r.unbalanced.map((u) => u.contract));
  assert.match(read("src/live/Import.jsx"), /const stillOpen = result\.open\.filter\(\(o\) => !unbalanced\.has\(o\.contract\)\);/);
});

test("preview copy: plain words, dollars, no dashes and no promises", () => {
  const copy = read("src/live/Import.jsx").split("\n").filter((l) => /left out|another time zone|Any trade you've reviewed|you reviewed|keep \$\{keep\}/.test(l)).join("\n");
  assert.ok(copy.length > 200);
  assert.doesNotMatch(copy, /[—–]/);
  assert.doesNotMatch(copy, /\b(guarantee|always accurate|never wrong|verified)\b/i);
});

/* ---------- E. Undo keeps what's been reviewed ---------- */

const blank = { needs_review: true, setup: null, emotion: null, grade: null, note: "", followed_plan: null, kept: [], screenshots: [] };

function fakeTrades(rows) {
  const db = { rows: rows.map((r) => ({ ...blank, ...r })), imports: {} };
  const query = (list) => {
    const q = {
      eq: (k, v) => query(list.filter((r) => r[k] === v)),
      in: (k, vs) => query(list.filter((r) => vs.includes(r[k]))),
      order: () => q,
      range: async (a, b) => ({ data: list.slice(a, b + 1), error: null }),
      select: async () => {
        const ids = new Set(list.map((r) => r.id));
        db.rows = db.rows.filter((r) => !ids.has(r.id));
        return { data: list.map((r) => ({ id: r.id })), error: null };
      },
    };
    return q;
  };
  globalThis.fakeSupabase.from = (table) => (table === "trades"
    ? { select: () => query(db.rows), delete: () => query(db.rows) }
    : { update: (patch) => ({ eq: async (_, id) => { db.imports[id] = patch; return { data: null, error: null }; } }) });
  return db;
}
const service = async () => {
  globalThis.fakeSupabase ||= { from: () => ({}) };
  return import("../src/live/import/service.js");
};

test("E: undo removes the unreviewed trades and keeps every reviewed one", async () => {
  const { undoImport } = await service();
  const db = fakeTrades([
    { id: "plain", import_id: "i1" }, { id: "plain2", import_id: "i1" },
    { id: "setup", import_id: "i1", setup: "ORB" }, { id: "feeling", import_id: "i1", emotion: "Calm" },
    { id: "note", import_id: "i1", note: "Chased it" }, { id: "grade", import_id: "i1", grade: "A" },
    { id: "other", import_id: "i2" },
  ]);
  const out = await undoImport("i1");
  assert.deepEqual(out.removed.sort(), ["plain", "plain2"]);
  assert.equal(out.kept, 4);
  assert.deepEqual(db.rows.map((r) => r.id).sort(), ["feeling", "grade", "note", "other", "setup"]);
  assert.equal(db.imports.i1.status, "undone");
});

test("E: marked reviewed, a plan answer, ticked rules and screenshots all count as review", async () => {
  const { undoImport } = await service();
  const db = fakeTrades([
    { id: "marked", import_id: "i1", needs_review: false }, { id: "plan", import_id: "i1", followed_plan: false },
    { id: "rules", import_id: "i1", kept: ["r1"] }, { id: "shot", import_id: "i1", screenshots: ["a.webp"] }, { id: "plain", import_id: "i1" },
  ]);
  const out = await undoImport("i1");
  assert.deepEqual(out, { removed: ["plain"], kept: 4 });
  assert.equal(db.rows.length, 4);
});

test("E: an import with nothing reviewed goes as before; one with everything reviewed loses nothing", async () => {
  const { undoImport } = await service();
  fakeTrades([{ id: "a", import_id: "i1" }, { id: "b", import_id: "i1" }]);
  assert.deepEqual(await undoImport("i1"), { removed: ["a", "b"], kept: 0 });
  const db = fakeTrades([{ id: "a", import_id: "i1", grade: "B" }]);
  assert.deepEqual(await undoImport("i1"), { removed: [], kept: 1 });
  assert.equal(db.rows.length, 1);
  assert.equal(db.imports.i1.status, "undone");
});

test("E: an import past a page of 1,000 rows is undone whole", async () => {
  const { undoImport } = await service();
  const db = fakeTrades(Array.from({ length: 2300 }, (_, i) => ({ id: `t${String(i).padStart(4, "0")}`, import_id: "i1", ...(i === 2250 ? { note: "keep me" } : {}) })));
  const out = await undoImport("i1");
  assert.equal(out.removed.length, 2299);
  assert.equal(out.kept, 1);
  assert.deepEqual(db.rows.map((r) => r.note), ["keep me"]);
});

test("E: the same rule reads the app's own trades, so what the button says is what happens", async () => {
  const { wasReviewed } = await service();
  const base = { needsReview: true, setup: "", emotion: "", grade: null, note: "", followedPlan: null, kept: [], screenshots: [] };
  assert.equal(wasReviewed(base), false);
  for (const change of [{ needsReview: false }, { setup: "ORB" }, { emotion: "Calm" }, { grade: "A" }, { note: "x" }, { followedPlan: false }, { followedPlan: true }, { kept: ["a"] }, { screenshots: ["a"] }]) {
    assert.equal(wasReviewed({ ...base, ...change }), true, JSON.stringify(change));
  }
});

test("E: Past imports says what undo will do before it does it", () => {
  const src = read("src/live/Import.jsx");
  assert.doesNotMatch(src, /including ones you've reviewed/);
  assert.match(src, /Any trade you've reviewed stays in your journal/);
  assert.match(src, /`Remove \$\{n\}, keep \$\{keep\} reviewed\?`/);
  assert.match(src, /Kept \$\{kept\} you reviewed/);
  assert.match(src, /const \{ removed, kept \} = await undoImport\(imp\.id\);/);
  assert.match(src, /loadState\(\{ logged: getState\(\)\.logged\.filter\(\(t\) => !ids\.has\(t\.id\)\) \}\)/, "only what went comes off the screen");
});
