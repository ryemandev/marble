// node --test tests/   (from app/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeBytes, parseCSV, parseNumber, tableOf } from "../src/live/import/csv.js";
import { rootOf, pointValueOf } from "../src/live/import/symbols.js";
import { parseWhen, zonedInstant, guessDateOrder } from "../src/live/import/when.js";
import { pairFills } from "../src/live/import/pair.js";
import { build, detect, mappingFor, readTable, toRow, holdLabel, zoneHint, PRESETS } from "../src/live/import/engine.js";

const fixture = (name) => readFileSync(new URL(`../.scratch/fixtures/${name}`, import.meta.url), "utf8");
const iso = (d) => d.toISOString();
let n = 0;
const fill = (side, qty, price, min, extra = {}) => ({ key: `k${++n}`, time: new Date(Date.UTC(2026, 9, 27, 14, min)), contract: "NQZ6", side, qty, price, commission: 0, account: null, ...extra });

/* ---------- Numbers and CSV ---------- */

test("numbers: currency, thousands, parentheses, decimal commas", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("($50.00)"), -50);
  assert.equal(parseNumber("-$25"), -25);
  assert.equal(parseNumber("$-25.10"), -25.1);
  assert.equal(parseNumber("1.234,50"), 1234.5);
  assert.equal(parseNumber("12,5", true), 12.5);
  assert.equal(parseNumber("1,234"), 1234);
  assert.equal(parseNumber("1.234", true), 1234);
  assert.equal(parseNumber("€ 4,10", true), 4.1);
  assert.equal(parseNumber("USD 12.50"), 12.5);
  assert.equal(parseNumber("25.00-"), -25);
  assert.equal(parseNumber("+3"), 3);
  assert.ok(Number.isNaN(parseNumber("")));
  assert.ok(Number.isNaN(parseNumber("Buy")));
  assert.ok(Number.isNaN(parseNumber("10/27/2026")));
});

test("csv: BOM, quotes, doubled quotes, CRLF, semicolons, title lines", () => {
  const a = parseCSV('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n2,,3');
  assert.equal(a.delimiter, ",");
  assert.deepEqual(a.rows, [["a", "b", "c"], ["1", "x, y", 'say "hi"'], ["2", "", "3"]]);
  const b = parseCSV("Date;Qty;Price\n27.10.2026;2;6000,25\n");
  assert.equal(b.delimiter, ";");
  assert.deepEqual(b.rows[1], ["27.10.2026", "2", "6000,25"]);
  const t = tableOf(parseCSV("My broker export\nAccount: 123\nSymbol,Qty,Price\nNQ,1,21000\nNQ,1,21010").rows);
  assert.deepEqual(t.headers, ["Symbol", "Qty", "Price"]);
  assert.equal(t.records.length, 2);
});

test("bytes: UTF-16 reports (MetaTrader), UTF-8 with a BOM, Windows-1252", () => {
  const text = "<html><table><tr><td>Deals</td></tr></table></html>";
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  assert.equal(decodeBytes(le), text);
  assert.equal(decodeBytes(Buffer.from(text, "utf16le")), text);
  assert.equal(decodeBytes(Buffer.from("﻿a,b", "utf8")), "a,b"); // the decoder drops the BOM
  assert.equal(decodeBytes(Buffer.from([0x50, 0x72, 0x69, 0x63, 0x65, 0x20, 0x80])), "Price €");
});

/* ---------- Futures roots and point values ---------- */

test("symbols: month codes and spellings map to the root", () => {
  for (const [raw, root] of [["NQZ6", "NQ"], ["NQ 12-26", "NQ"], ["MNQZ2026", "MNQ"], ["MNQZ26", "MNQ"], ["/ESZ6", "ES"], ["CON.F.US.MNQ.Z26", "MNQ"],
    ["F.US.ENQ.Z26", "NQ"], ["6EZ6", "6E"], ["M2KZ6", "M2K"], ["MYMZ6", "MYM"], ["MES 12-26", "MES"], ["CL DEC26", "CL"], ["GCZ2026", "GC"], ["AAPL", "AAPL"], ["ZBZ6", "ZB"], ["mgcz6", "MGC"]]) {
    assert.equal(rootOf(raw), root, raw);
  }
  assert.equal(pointValueOf("NQ"), 20);
  assert.equal(pointValueOf("MYM"), 0.5);
  assert.equal(pointValueOf("6E"), 125000);
  assert.equal(pointValueOf("ZB"), null);
  assert.equal(pointValueOf("ZB", { ZB: 1000 }), 1000);
});

/* ---------- Times and zones ---------- */

test("times: zones, offsets, AM/PM, day-first, spreadsheet numbers", () => {
  assert.equal(iso(parseWhen("10/27/2026 09:31:05", { tz: "America/New_York" })), "2026-10-27T13:31:05.000Z");
  assert.equal(iso(parseWhen("10/27/2026 09:31:05", { tz: "America/Chicago" })), "2026-10-27T14:31:05.000Z");
  assert.equal(iso(parseWhen("2026-10-27 09:31:05", { tz: "Europe/London" })), "2026-10-27T09:31:05.000Z");
  assert.equal(iso(parseWhen("2026-10-27T09:31:05Z", { tz: "America/Chicago" })), "2026-10-27T09:31:05.000Z");
  assert.equal(iso(parseWhen("2026-10-27T09:31:05-04:00")), "2026-10-27T13:31:05.000Z");
  assert.equal(iso(parseWhen("10/27/2026 09:31:05 -05:00")), "2026-10-27T14:31:05.000Z");
  assert.equal(iso(parseWhen("10/28/2026 1:05:00 PM", { tz: "UTC" })), "2026-10-28T13:05:00.000Z");
  assert.equal(iso(parseWhen("10/28/2026 12:05:00 AM", { tz: "UTC" })), "2026-10-28T00:05:00.000Z");
  assert.equal(iso(parseWhen("27.10.2026 15:31:05", { tz: "UTC", order: "DMY" })), "2026-10-27T15:31:05.000Z");
  assert.equal(iso(parseWhen("10/27/2026 09:31 ET", { tz: "UTC" })), "2026-10-27T13:31:00.000Z");
  assert.equal(iso(parseWhen(46322.5, { tz: "UTC" })), "2026-10-27T12:00:00.000Z"); // Excel day number
  assert.equal(iso(parseWhen(new Date(Date.UTC(2026, 9, 27, 9, 30)), { tz: "America/New_York" })), "2026-10-27T13:30:00.000Z");
  assert.equal(parseWhen("not a date"), null);
  // Summer time in New York (UTC-4) and winter (UTC-5)
  assert.equal(iso(zonedInstant(2026, 6, 1, 9, 30, 0, 0, "America/New_York")), "2026-07-01T13:30:00.000Z");
  assert.equal(iso(zonedInstant(2026, 11, 1, 9, 30, 0, 0, "America/New_York")), "2026-12-01T14:30:00.000Z");
  assert.deepEqual(guessDateOrder(["27/10/2026 10:00", "01/11/2026 10:00"]), { order: "DMY", ambiguous: false, conflicting: false });
  assert.equal(guessDateOrder(["10/02/2026"]).ambiguous, true);
});

/* ---------- FIFO pairing ---------- */

test("fifo: scale in, partial exits, one trade from flat to flat", () => {
  const { trades, open } = pairFills([fill("buy", 2, 21000, 0), fill("buy", 1, 20990, 1), fill("sell", 1, 21010, 4), fill("sell", 2, 21020, 9)]);
  assert.equal(trades.length, 1);
  assert.equal(open.length, 0);
  const t = trades[0];
  assert.equal(t.side, "long");
  assert.equal(t.size, 3);
  assert.equal(t.entry, 20996.666667);
  assert.equal(t.exit, 21016.666667);
  assert.equal(t.grossPoints, 60);
  assert.equal(t.gross, 1200); // 60 points on NQ at $20
  assert.equal(t.holdMs, 9 * 60e3);
  assert.ok(t.scaled && t.partial);
});

test("fifo: a flip through zero makes two trades and splits the fill's commission", () => {
  const { trades, open } = pairFills([
    fill("sell", 1, 21050, 0, { contract: "MNQZ6", commission: 0.5 }),
    fill("buy", 3, 21040, 5, { contract: "MNQZ6", commission: 1.5 }),
    fill("sell", 2, 21030, 20, { contract: "MNQZ6", commission: 1 }),
  ]);
  assert.equal(trades.length, 2);
  assert.equal(open.length, 0);
  const [a, b] = trades;
  assert.equal(a.side, "short"); assert.equal(a.size, 1); assert.equal(a.gross, 20); // 10 points on MNQ at $2
  assert.equal(a.commission, 1); // 0.50 + a third of 1.50
  assert.equal(a.net, 19);
  assert.equal(b.side, "long"); assert.equal(b.size, 2); assert.equal(b.entry, 21040); assert.equal(b.gross, -40);
  assert.equal(b.commission, 2); // two thirds of 1.50 + 1.00
  assert.equal(b.net, -42);
  assert.ok(b.key.endsWith("~2"), "the second half of a split fill keys the new trade");
});

test("fifo: an open position isn't a trade; an exit with no entry is set aside", () => {
  const { trades, open, orphans } = pairFills([
    fill("sell", 1, 21000, 0, { effect: "close" }),
    fill("buy", 1, 21000, 1), fill("sell", 1, 21005, 2),
    fill("buy", 2, 6000, 3, { contract: "ESZ6" }),
  ]);
  assert.equal(orphans.length, 1);
  assert.equal(trades.length, 1);
  assert.equal(open.length, 1);
  assert.deepEqual([open[0].symbol, open[0].side, open[0].qty], ["ES", "long", 2]);
});

test("fifo: contracts pair separately and duplicate fills count once", () => {
  const f1 = fill("buy", 1, 100, 0, { contract: "NQZ6" }), f2 = fill("buy", 1, 100, 0, { contract: "NQH7" });
  const { trades, open } = pairFills([f1, f2, { ...f1 }, fill("sell", 1, 110, 1, { contract: "NQZ6" })]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].gross, 200);
  assert.equal(open.length, 1);
  assert.equal(open[0].contract, "NQH7");
});

/* ---------- Whole files ---------- */

const run = (text, opts = {}) => {
  const table = readTable(text);
  const preset = detect(table.headers);
  return { preset, out: build(table, mappingFor(preset, table.headers), opts) };
};

test("tradovate orders: detected, filled orders only, trades and an open position", () => {
  const { preset, out } = run(fixture("tradovate-orders.csv"), { tz: "America/Chicago" });
  assert.equal(preset.id, "tradovate-orders");
  assert.equal(out.skipped.length, 0);
  assert.equal(out.trades.length, 3);
  assert.deepEqual(out.trades.map((t) => [t.symbol, t.side, t.size, t.gross]), [["NQ", "long", 3, 1200], ["MNQ", "short", 1, 20], ["MNQ", "long", 2, -40]]);
  assert.equal(iso(out.trades[0].opened), "2026-10-27T14:31:05.000Z");
  assert.equal(out.open.length, 1);
  assert.equal(out.open[0].symbol, "ES");
  const again = run(fixture("tradovate-orders.csv"), { tz: "America/Chicago" }).out;
  assert.deepEqual(again.trades.map((t) => t.key), out.trades.map((t) => t.key));
});

test("partials across files: the next file finishes a carried position, an overlapping file doesn't double it", () => {
  const first = run(fixture("tradovate-orders.csv"), { tz: "America/Chicago" }).out;
  const carried = first.open.flatMap((o) => o.fills);
  const next = run(fixture("tradovate-orders-part2.csv"), { tz: "America/Chicago", carried }).out;
  assert.equal(next.trades.length, 1);
  const t = next.trades[0];
  assert.deepEqual([t.symbol, t.side, t.size, t.entry, t.exit, t.gross], ["ES", "long", 2, 6002.5, 6010, 750]);
  assert.equal(next.open.length, 0);
  const overlap = run(fixture("tradovate-orders-overlap.csv"), { tz: "America/Chicago", carried }).out;
  assert.equal(overlap.trades.length, 1);
  assert.equal(overlap.trades[0].size, 2);
  assert.equal(overlap.trades[0].key, t.key);
});

test("ninjatrader trades: a title line, $ and (negative) P&L, commissions, futures roots", () => {
  const { preset, out } = run(fixture("ninjatrader-trades.csv"), { tz: "America/New_York" });
  assert.equal(preset.id, "ninjatrader-trades");
  assert.equal(out.trades.length, 4);
  const [nq, mes, cl, zb] = out.trades;
  assert.deepEqual([nq.symbol, nq.gross, nq.commission, nq.net], ["NQ", 510, 4.12, 505.88]);
  assert.deepEqual([mes.symbol, mes.side, mes.size, mes.gross, mes.net], ["MES", "short", 2, -40, -41.24]);
  assert.equal(cl.holdMs, 125 * 60e3);
  assert.equal(zb.pointValue, null); // unknown market, but the file's P&L stands
  assert.equal(zb.net, 498);
  assert.deepEqual(out.unknown, []);
  // Told the file's P&L is already after commission
  const net = build(readTable(fixture("ninjatrader-trades.csv")), { ...mappingFor(preset, readTable(fixture("ninjatrader-trades.csv")).headers), pnlIs: "net" }, { tz: "America/New_York" });
  assert.equal(net.trades[0].net, 510);
});

test("generic: semicolons, decimal commas, separate date and time, day-first dates", () => {
  const { preset, out } = run(fixture("generic-eu.csv"), { tz: "Europe/Berlin" });
  assert.equal(preset.id, "generic-fills");
  assert.equal(out.dates.order, "DMY");
  assert.equal(out.trades.length, 2);
  const [mes, rty] = out.trades;
  assert.equal(iso(mes.opened), "2026-10-27T14:31:05.000Z"); // Berlin is UTC+1 after 25 Oct
  assert.equal(mes.gross, 105); // 10.5 points x 2 x $5
  assert.equal(mes.commission, 2.48);
  assert.deepEqual([rty.symbol, rty.side, rty.gross], ["M2K", "short", 50]);
});

test("unknown symbols ask for a point value; signed quantities need no side column", () => {
  const csv = "Time,Symbol,Qty,Price\n2026-10-27 10:00:00,XYZ,5,10\n2026-10-27 10:05:00,XYZ,-5,12\n";
  const first = run(csv, { tz: "UTC" }).out;
  assert.deepEqual(first.unknown, ["XYZ"]);
  assert.equal(first.trades[0].gross, null);
  const told = run(csv, { tz: "UTC", points: { XYZ: 1 } }).out;
  assert.deepEqual(told.unknown, []);
  assert.equal(told.trades[0].gross, 10);
});

test("tradovate performance: lot pairs become fills again, so one scaled trade stays one trade", () => {
  const { preset, out } = run(fixture("tradovate-performance.csv"), { tz: "America/New_York" });
  assert.equal(preset.id, "tradovate-performance");
  assert.equal(out.trades.length, 2);
  assert.deepEqual(out.trades.map((t) => [t.symbol, t.side, t.size, t.gross, t.commission]), [["NQ", "long", 2, 600, 0], ["MNQ", "short", 1, 20, 0]]);
  assert.equal(out.trades[0].key, "f:NQZ6:id:501"); // the fill ids are the external id
});

test("topstepx: times are UTC whatever the computer says", () => {
  const table = readTable(fixture("topstepx.csv"));
  const preset = detect(table.headers);
  assert.equal(preset.id, "topstepx");
  assert.deepEqual(zoneHint(preset, table.headers), { zone: "UTC", from: "platform" });
  const out = build(table, mappingFor(preset, table.headers), { tz: "UTC" });
  assert.deepEqual(out.trades.map((t) => [t.symbol, t.side, t.size, t.gross, t.net]), [["MNQ", "long", 1, 25, 24.26], ["MES", "short", 2, -40, -41.48]]);
  assert.equal(iso(out.trades[0].opened), "2026-10-27T13:31:05.000Z");
});

test("rithmic: the zone comes from the time column's name; hidden columns are asked for", () => {
  const table = readTable(fixture("rithmic.csv"));
  const preset = detect(table.headers);
  assert.equal(preset.id, "rithmic");
  const hint = zoneHint(preset, table.headers);
  assert.equal(hint.zone, "America/Los_Angeles");
  const out = build(table, mappingFor(preset, table.headers), { tz: hint.zone });
  assert.equal(out.trades.length, 1); // the cancelled order is left out
  const t = out.trades[0];
  assert.deepEqual([t.symbol, t.size, t.gross, t.commission, t.net], ["MNQ", 2, 40, 2.08, 37.92]);
  assert.equal(iso(t.opened), "2026-10-27T13:31:05.000Z"); // 06:31 PDT
  const hidden = readTable(fixture("rithmic.csv").replace("Qty Filled", "Qty"));
  const h = build(hidden, mappingFor(detect(hidden.headers), hidden.headers), {});
  assert.deepEqual(h.missing, ["qty"]);
  assert.match(h.hint, /Qty Filled and Order Number/);
});

test("ninjatrader executions: semicolons, decimal commas, day-first dates, no commission, an exit from before the file", () => {
  const { preset, out } = run(fixture("ninjatrader-executions.csv"), { tz: "America/New_York" });
  assert.equal(preset.id, "ninjatrader-executions");
  assert.equal(out.dates.order, "DMY");
  assert.equal(out.orphans.length, 1);
  assert.deepEqual(out.trades.map((t) => [t.symbol, t.side, t.size, t.entry, t.gross, t.commission]), [["NQ", "long", 2, 20997.75, 500, 0], ["MES", "short", 1, 6000, 10, 0]]);
});

const mt5Check = (out) => {
  assert.deepEqual(out.unknown, []);
  const [eu, xau] = out.trades;
  assert.deepEqual([eu.symbol, eu.side, eu.size, eu.entry, eu.exit, eu.gross, eu.commission, eu.net], ["EURUSD", "long", 0.2, 1.0845, 1.086, 30, 2.8, 27.2]);
  assert.deepEqual([xau.symbol, xau.side, xau.gross, xau.commission, xau.net], ["XAUUSD", "short", -25, 2.2, -27.2]);
  assert.equal(iso(eu.opened), "2026-10-27T09:00:00.000Z"); // 11:00 server time at UTC+2
};
test("mt5 html: the Deals section of a several-section report, server time, the file's profit", () => {
  const table = readTable(fixture("mt5-history.html"));
  assert.equal(table.section, "Deals");
  const preset = detect(table.headers);
  assert.equal(preset.id, "mt5-deals");
  assert.equal(zoneHint(preset, table.headers).ask, true);
  mt5Check(build(table, mappingFor(preset, table.headers), { tz: "Etc/GMT-2" }));
});
test("mt5 xlsx: the same report as a spreadsheet", async () => {
  const { readSheet } = await import("read-excel-file/node");
  const table = readTable(await readSheet(readFileSync(new URL("../.scratch/fixtures/mt5-history.xlsx", import.meta.url))));
  const preset = detect(table.headers);
  assert.equal(preset.id, "mt5-deals");
  mt5Check(build(table, mappingFor(preset, table.headers), { tz: "Etc/GMT-2" }));
});

test("mt4 statement: the second Price is the exit, S / L gives R, balance and cancelled rows are skipped", () => {
  const table = readTable(fixture("mt4-statement.htm"));
  assert.equal(table.section, "Closed Transactions");
  const preset = detect(table.headers);
  assert.equal(preset.id, "mt4-statement");
  const out = build(table, mappingFor(preset, table.headers), { tz: "Etc/GMT-2" });
  assert.equal(out.skipped.length, 0);
  assert.deepEqual(out.trades.map((t) => [t.symbol, t.side, t.size, t.entry, t.exit, t.stop, t.gross, t.net]), [["EURUSD", "long", 0.1, 1.085, 1.088, 1.083, 30, 29.3], ["XAUUSD", "short", 0.05, 2650, 2655, 2660, -25, -26.7]]);
  assert.deepEqual(out.trades.map((t) => toRow(t, { accountId: "a", importId: "i", risk: null }).r), [1.5, -0.5]);
});

test("ctrader: Net <currency> header, lots, day-first times with milliseconds", () => {
  const { preset, out } = run(fixture("ctrader.csv"), { tz: "UTC" });
  assert.equal(preset.id, "ctrader");
  assert.deepEqual(out.trades.map((t) => [t.symbol, t.side, t.size, t.gross, t.commission, t.net]), [["EURUSD", "long", 0.1, 15, 0.6, 14.4], ["XAUUSD", "short", 1, 200, 1, 199]]);
  assert.equal(iso(out.trades[0].opened), "2026-10-27T09:31:05.123Z");
});

test("ibkr flex: packed date-times, negative commissions, the file's multiplier", () => {
  const { preset, out } = run(fixture("ibkr-flex.csv"), { tz: "America/New_York" });
  assert.equal(preset.id, "ibkr-flex");
  assert.deepEqual(out.unknown, []);
  assert.deepEqual(out.trades.map((t) => [t.symbol, t.side, t.size, t.gross, t.commission, t.net]), [["AAPL", "long", 100, 125, 2.02, 122.98], ["MES", "short", 2, 50, 2.48, 47.52]]);
  assert.equal(iso(out.trades[0].opened), "2026-10-27T13:31:05.000Z");
});

test("every preset has a fixture that it, and only it, detects", () => {
  const files = { "tradovate-performance": "tradovate-performance.csv", "tradovate-orders": "tradovate-orders.csv", topstepx: "topstepx.csv", rithmic: "rithmic.csv",
    "ninjatrader-executions": "ninjatrader-executions.csv", "ninjatrader-trades": "ninjatrader-trades.csv", "mt5-deals": "mt5-history.html", "mt4-statement": "mt4-statement.htm",
    ctrader: "ctrader.csv", "ibkr-flex": "ibkr-flex.csv", "generic-fills": "generic-eu.csv" };
  for (const p of PRESETS.filter((x) => x.id !== "generic-roundtrip" && x.world !== "crypto")) {
    assert.ok(files[p.id], `no fixture for ${p.id}`);
    assert.equal(detect(readTable(fixture(files[p.id])).headers).id, p.id, files[p.id]);
  }
  assert.equal(detect(["Symbol", "Entry Price", "Exit Price", "Opened", "Closed", "Qty", "Side"]).id, "generic-roundtrip");
});

test("a file with several accounts imports one of them", () => {
  const csv = "Time,Account,Symbol,Side,Qty,Price\n2026-10-27 10:00,A1,NQZ6,Buy,1,100\n2026-10-27 10:01,A2,NQZ6,Buy,1,100\n2026-10-27 10:02,A1,NQZ6,Sell,1,101\n2026-10-27 10:03,A2,NQZ6,Sell,1,105\n";
  const a = run(csv, { tz: "UTC" }).out;
  assert.deepEqual(a.accounts, ["A1", "A2"]);
  assert.deepEqual(a.trades.map((t) => t.gross), [20]);
  const b = run(csv, { tz: "UTC", fileAccount: "A2" }).out;
  assert.deepEqual(b.trades.map((t) => t.gross), [100]);
});

test("rows the engine can't read are listed with why; required columns are checked", () => {
  const csv = "Time,Symbol,Side,Qty,Price\n2026-10-27 10:00,NQZ6,Buy,1,100\nyesterday,NQZ6,Buy,1,100\n2026-10-27 10:02,NQZ6,Hold,1,101\n2026-10-27 10:03,NQZ6,Sell,1,105\n";
  const { out } = run(csv, { tz: "UTC" });
  assert.deepEqual(out.skipped.map((s) => s.row), [2, 3]);
  assert.match(out.skipped[0].reason, /time/);
  assert.equal(out.trades.length, 1);
  const none = build(readTable("A,B\n1,2\n"), { shape: "fills", fields: { time: "A" } }, {});
  assert.deepEqual(none.missing, ["symbol", "qty", "price"]);
});

test("rows for the database: R only from a default risk, no grade, marked for review", () => {
  const { out } = run(fixture("tradovate-orders.csv"), { tz: "America/Chicago" });
  const row = toRow(out.trades[0], { accountId: "acc", importId: "imp", risk: null });
  assert.equal(row.r, null);
  assert.equal(row.grade, null);
  assert.equal(row.needs_review, true);
  assert.equal(row.source, "import");
  assert.equal(row.followed_plan, null);
  assert.equal(row.pnl, 1200);
  assert.equal(toRow(out.trades[0], { accountId: "acc", importId: "imp", risk: 400 }).r, 3);
  assert.equal(holdLabel(9 * 60e3), "9m 00s");
  assert.equal(holdLabel(125 * 60e3), "2h 05m");
});
