import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSIONS, inWorld, nextFunding, sessionOf, utcInstant, worldOf } from "../src/world.js";
import { grossOf, hoursOf, leverageOf, liqDistanceOf, liqDistancesOf, receiptOf, weekendOf } from "../src/crypto/stats.js";
import { CRYPTO_PICK, FIRMS, firmOf, searchFirms } from "../src/live/firms.js";
import { CRYPTO_FIRMS } from "../src/crypto/venues.js";
import { limitsHit, todayOf } from "../src/data.js";
import { datedTrade, getRawState, getState, openDialog, setState, tradedAt } from "../src/store.js";
import { CRYPTO_LIVE, CRYPTO_TRADE_COLUMNS, dataWorld, forceCryptoFull, withoutCrypto } from "../src/crypto/worlds.js";

const ct = (o) => ({ world: "crypto", pnl: 0, commission: 0, funding: null, ...o });

test("a row belongs to Markets unless it says crypto; All markets shows both", () => {
  assert.equal(worldOf({}), "markets");
  assert.equal(worldOf({ world: "markets" }), "markets");
  assert.equal(worldOf({ world: "crypto" }), "crypto");
  assert.ok(inWorld({}, "markets") && !inWorld({}, "crypto") && inWorld({}, "all"));
  assert.ok(inWorld({ world: "crypto" }, "crypto") && inWorld({ world: "crypto" }, "all") && !inWorld({ world: "crypto" }, "markets"));
});

test("a crypto trade's day and hour are UTC; a Markets trade's are New York's", () => {
  const at = "2026-11-01T02:30:00.000Z";
  const c = datedTrade({ id: "a", traded_at: at, world: "crypto" });
  const m = datedTrade({ id: "b", traded_at: at, world: "markets" });
  assert.deepEqual([c.dayKey, c.hour, c.time, c.weekday], ["2026-11-01", 2, "02:30", 0]);
  assert.deepEqual([m.dayKey, m.hour, m.time], ["2026-10-31", 22, "22:30"]);
  assert.equal(c.month, "2026-11");
  assert.equal(m.month, "2026-10");
  // The form's date and time are read in the trade's own clock
  assert.equal(tradedAt("2026-11-01", "02:30", "crypto"), at);
  assert.equal(tradedAt("2026-10-31", "22:30", "markets"), at);
  assert.equal(utcInstant(2026, 10, 1, 2, 30).toISOString(), at);
});

test("once crypto is live, the store keeps each world's plan, rules, ticks and desk account apart", () => {
  forceCryptoFull(true);
  setState({ world: "markets" });
  setState({ plan: { bias: "NQ long", levels: [], news: "", risk: "" }, rules: { checklist: ["A"], lossLimit: 500, maxTrades: null, stopAfter: null }, deskAccount: "m1" });
  setState({ world: "crypto" });
  assert.equal(getState().world, "crypto");
  assert.notEqual(getState().plan.bias, "NQ long");
  setState({ plan: { bias: "BTC long", levels: [], news: "", risk: "" }, deskAccount: "c1", checklist: [true] });
  setState((s) => ({ rules: { ...s.rules, maxLeverage: 5 } }));
  assert.equal(getState().plan.bias, "BTC long");
  assert.equal(getState().deskAccount, "c1");
  assert.equal(getState().rules.maxLeverage, 5);
  const raw = getRawState();
  assert.equal(raw.plan.bias, "NQ long", "Markets' plan is untouched");
  assert.equal(raw.deskAccount, "m1");
  assert.equal(raw.rules.lossLimit, 500);
  assert.equal(raw.crypto.plan.bias, "BTC long");
  assert.deepEqual(raw.crypto.checklist, [true]);
  setState({ world: "markets" });
  assert.equal(getState().plan.bias, "NQ long");
  assert.equal(getState().deskAccount, "m1");
  forceCryptoFull(false);
});

test("until crypto is live, Crypto is a preview: the journal stays Markets, and nothing crypto reaches the database", () => {
  assert.equal(CRYPTO_LIVE, false, "the owner's plan, 30 Oct 2026: Coming soon first");
  assert.equal(dataWorld("crypto"), "markets");
  assert.equal(dataWorld("all"), "markets");
  setState({ world: "markets", plan: { bias: "ES short", levels: [], news: "", risk: "" }, dialog: null });
  setState({ world: "crypto" });
  assert.equal(getState().plan.bias, "ES short");
  setState({ checklist: [true, false] });
  assert.deepEqual(getRawState().checklist, [true, false]);
  // The journal's forms wait for Markets
  openDialog("trade");
  assert.equal(getState().dialog, null);
  assert.match(getState().toast?.text || "", /Crypto is coming soon/);
  openDialog("idea");
  assert.equal(getState().dialog?.kind, "idea", "Community's forms still open");
  setState({ world: "markets", dialog: null });
  const row = { id: "x", symbol: "NQ", pnl: 5, world: "markets", leverage: null, funding: null, fee_maker: null, fee_taker: null, liq_price: null };
  assert.deepEqual(withoutCrypto(row), { id: "x", symbol: "NQ", pnl: 5 });
  assert.deepEqual(withoutCrypto(row, true), row);
  assert.deepEqual(CRYPTO_TRADE_COLUMNS, ["world", "leverage", "funding", "fee_maker", "fee_taker", "liq_price"]);
});

test("the receipt: what the trades made, fees (maker and taker, rebates negative), funding, and what was kept", () => {
  const trades = [
    // made 100, paid 3 taker + 1 maker, paid 2 funding: kept 94
    ct({ pnl: 94, commission: 4, feeTaker: 3, feeMaker: 1, funding: -2, entry: 100, size: 10 }),
    ct({ pnl: -48.5, commission: -0.5, feeMaker: -0.5, feeTaker: 0, funding: 1, entry: 200, size: 5 }),
    // fees with no split, no funding known
    ct({ pnl: 18, commission: 2 }),
  ];
  assert.equal(grossOf(trades[0]), 100);
  assert.equal(grossOf(trades[1]), -50);
  const r = receiptOf(trades);
  assert.equal(r.gross, 70);
  assert.equal(r.net, 63.5);
  assert.deepEqual(r.fees, { total: 5.5, maker: 0.5, taker: 3, unsplit: 2 });
  assert.deepEqual([r.funding.paid, r.funding.received, r.funding.net, r.funding.trades], [2, 1, -1, 2]);
  assert.equal(r.costs, 6.5); // fees 5.5 plus net funding paid 1
  assert.equal(r.gross - r.costs, r.net);
  assert.equal(r.costShare, 9.3);
  assert.equal(r.feeBps, 17.5);
  assert.equal(receiptOf([]).costShare, null);
});

test("24/7: P&L by UTC hour, the four sessions, and weekends against weekdays", () => {
  const trades = [ct({ hour: 1, weekday: 6, pnl: 50 }), ct({ hour: 8, weekday: 1, pnl: -20 }), ct({ hour: 14, weekday: 3, pnl: 70 }), ct({ hour: 22, weekday: 0, pnl: -10 }), ct({ hour: null, pnl: 999 })];
  const { hours, sessions } = hoursOf(trades);
  assert.equal(hours.length, 24);
  assert.equal(hours[1], 50);
  assert.deepEqual(sessions.map((s) => [s.name, s.pnl, s.trades]), [["Asia", 50, 1], ["London", -20, 1], ["New York", 70, 1], ["Late", -10, 1]]);
  assert.deepEqual(SESSIONS.map(([n]) => n), ["Asia", "London", "New York", "Late"]);
  assert.equal(sessionOf(6), "Asia");
  assert.equal(sessionOf(7), "London");
  assert.equal(sessionOf(23), "Late");
  const w = weekendOf(trades);
  assert.deepEqual([w.weekend.trades, w.weekend.net, w.weekend.wins], [2, 40, 1]);
  assert.deepEqual([w.weekday.trades, w.weekday.net], [2, 50]);
  assert.deepEqual(w.byDay.map((d) => d.weekday), [1, 2, 3, 4, 5, 6, 0], "Monday first, the weekend included");
});

test("leverage: one dot per trade at its rounded leverage, the cap counted, unknown left out", () => {
  const l = leverageOf([ct({ leverage: 5 }), ct({ leverage: 5.2 }), ct({ leverage: 12 }), ct({ leverage: null }), ct({ leverage: 2 })], 5);
  assert.deepEqual(l.stacks, [[2, 1], [5, 2], [12, 1]]);
  assert.equal(l.over, 2, "5.2× is over a 5× cap; 5× isn't");
  assert.equal(l.max, 12);
  assert.equal(l.known, 4);
  assert.equal(l.unknown, 1);
  assert.equal(leverageOf([ct({})]).max, null);
});

test("liquidation distance at entry: |entry - liquidation| / entry, only when the venue gave it", () => {
  assert.equal(liqDistanceOf({ entry: 100, liqPrice: 80 }), 20);
  assert.equal(liqDistanceOf({ entry: 2500, liqPrice: 2750 }), 10);
  assert.equal(liqDistanceOf({ entry: 100, liqPrice: null }), null);
  assert.equal(liqDistanceOf({ entry: null, liqPrice: 50 }), null);
  const d = liqDistancesOf([ct({ entry: 100, liqPrice: 95 }), ct({ entry: 100, liqPrice: 70 }), ct({})], 10);
  assert.equal(d.rows.length, 2);
  assert.equal(d.inside, 1);
  assert.equal(d.min, 5);
});

test("the next funding time: 00:00, 08:00 or 16:00 UTC, and how long until it", () => {
  assert.deepEqual(nextFunding(new Date(Date.UTC(2026, 9, 27, 17, 52))), { at: "00:00", left: 368, label: "6h 08m" });
  assert.equal(nextFunding(new Date(Date.UTC(2026, 9, 27, 7, 59))).at, "08:00");
  assert.equal(nextFunding(new Date(Date.UTC(2026, 9, 27, 8, 0))).at, "16:00");
});

test("the leverage cap is a daily rule: a trade over it today is reached", () => {
  const today = datedTrade({ id: "x", traded_at: new Date().toISOString(), world: "crypto", pnl: -10, leverage: 8 });
  const day = todayOf([today]);
  assert.equal(day.topLeverage, 8);
  assert.deepEqual(limitsHit({ maxLeverage: 10 }, day), []);
  assert.deepEqual(limitsHit({ maxLeverage: 8 }, day), [], "at the cap is fine");
  assert.deepEqual(limitsHit({ maxLeverage: 5 }, day), ["leverage"]);
});

test("the crypto picker: its own list, searchable, apart from the website's Markets wall", () => {
  const slugs = CRYPTO_PICK.map((f) => f.slug);
  for (const s of ["bybit", "binance", "okx", "hyperliquid", "hyrotrader", "breakout", "kraken-prop", "bitfunded", "propr", "carrot-funding", "klein-funding", "fundedbit", "tradeify-crypto", "ftmo", "fxify", "fundednext"]) assert.ok(slugs.includes(s), s);
  // Excluded on purpose
  assert.ok(!slugs.some((s) => /crypto-fund|cft|gt-funded/.test(s)));
  assert.ok(!CRYPTO_FIRMS.some((f) => /Crypto Fund Trader|GT Funded/i.test(f.name)));
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(searchFirms("hyro", "crypto")[0].slug, "hyrotrader");
  assert.equal(searchFirms("hl", "crypto")[0].slug, "hyperliquid");
  assert.equal(searchFirms("", "crypto").length, CRYPTO_PICK.length);
  assert.ok(!searchFirms("bybit").length, "Markets' search doesn't list exchanges");
  assert.ok(!FIRMS.some((f) => f.slug === "bybit"), "the website wall stays Markets only");
  // A crypto account still shows its venue's name
  assert.equal(firmOf("hyperliquid").name, "Hyperliquid");
  assert.equal(firmOf("ftmo").name, "FTMO");
  for (const f of CRYPTO_FIRMS) assert.ok(["file", "wallet", "template", "markets-file"].includes(f.how), f.slug);
  assert.ok(!CRYPTO_FIRMS.some((f) => /api key/i.test(`${f.reads} ${f.hint || ""}`)));
});

test("the rules line: crypto's leverage cap and liquidation distance, said plainly", async () => {
  const { rulesWords } = await import("../src/crypto/rules.js");
  assert.equal(rulesWords({ stopAfter: 3, lossLimit: 1500, maxLeverage: 5, minLiqDistance: 10 }),
    "You stop for the day after 3 losses in a row, $1,500 down or one trade over 5×. Liquidation stays at least 10% away.");
  assert.equal(rulesWords({ lossLimit: null, maxTrades: null, stopAfter: null }), "");
  assert.equal(rulesWords({ minLiqDistance: 12 }), "Liquidation stays at least 12% away.");
});

test("one switch decides whether crypto trades show publicly, in the app and in the database", async () => {
  const { CRYPTO_PUBLIC, CRYPTO_RISK, publicTrades, showsCrypto } = await import("../src/crypto/public.js");
  const ts = [{ world: "markets" }, { world: "crypto" }, {}];
  assert.equal(CRYPTO_PUBLIC, true, "the owner's call, 30 Oct 2026");
  assert.equal(publicTrades(ts).length, 3);
  assert.ok(showsCrypto(ts));
  assert.ok(!showsCrypto([{ world: "markets" }]));
  assert.match(CRYPTO_RISK, /high-risk and largely unregulated in the UK/);
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations-pending/20261031160000_crypto_world.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.crypto_public\(\)\s+returns boolean language sql stable set search_path = ''\s+as \$\$ select true \$\$;/);
  assert.equal((sql.match(/public\.crypto_public\(\)/g) || []).length, 5, "made once, read in discipline_days, enter_competition and trade_card, revoked once");
  assert.match(sql, /c\.platform in \('topstepx', 'ibkr', 'hyperliquid'\)/);
  assert.match(sql, /'world', t\.world\) c/);
});
