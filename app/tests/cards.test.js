import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { canChart, dayBars, frameFor, sampleBars, scaleOf, seedOf, tickOf } from "../src/views/flexbars.js";
import { LOOK, WINDOWS, keepOf, placement, upOf } from "../src/views/engrave.js";
import { CREWS, CREW_ORDER } from "../src/views/community/houses.js";
import { marketCode, marketMark } from "../src/lib/markets.js";
import { FINISHES, byStage, finishFor, finishesFor, keyOf, money, nextFinish, today, weekOf } from "../src/drip/week.js";
import { SAMPLE, fmtMoney, summarize } from "../src/data.js";
import { statsOf } from "../src/drip/stats/model.js";
import { spanOf, totalOf } from "../src/drip/view.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-7, `${why}: ${a} is not ${b}`);
const onTick = (p, tick) => Math.abs(p / tick - Math.round(p / tick)) < 1e-6;

/* ---------- The candles on a sample card ---------- */

const MARKETS = [["NQ", 2, 21480.25, 21512.75], ["YM", 0, 42150, 42234], ["RTY", 1, 2241.3, 2248.9], ["CL", 2, 71.24, 71.86], ["SI", 3, 31.245, 31.415], ["NG", 3, 2.914, 2.962], ["EURUSD", 5, 1.08451, 1.08612]];

test("each market has its own tick, and an unknown one falls back to its price's decimals", () => {
  assert.equal(tickOf("NQ", 2), 0.25);
  assert.equal(tickOf("MNQ", 2), 0.25);
  assert.equal(tickOf("YM", 0), 1);
  assert.equal(tickOf("CL", 2), 0.01);
  assert.equal(tickOf("SI", 3), 0.005);
  near(tickOf("EURUSD", 5), 0.00001, "five places");
  near(tickOf("AAPL", 2), 0.01, "two places");
});

test("the entry and the exit sit on the bars the chart says they do, long and short, on the market's own tick", () => {
  for (const [symbol, dp, a, b] of MARKETS) {
    const tick = tickOf(symbol, dp);
    for (const [entry, exit, side] of [[a, b, 1], [b, a, 1], [b, a, -1], [a, b, -1]]) {
      for (const held of [1, 30, 300]) {
        const tf = frameFor(held);
        const { bars, ei, xi } = sampleBars({ entry, exit, side, tick, held, tf, seed: seedOf(`${symbol}${entry}${held}`) });
        const why = `${symbol} ${side > 0 ? "long" : "short"} ${entry} to ${exit} over ${held}m`;
        assert.equal(bars.length, 66, why);
        assert.ok(ei > 0 && xi > ei && xi < bars.length - 1, `${why}: bars ${ei} and ${xi}`);
        assert.ok(bars[ei].l - tick / 2 <= entry && entry <= bars[ei].h + tick / 2, `${why}: entry is outside bar ${ei}`);
        assert.ok(bars[xi].l - tick / 2 <= exit && exit <= bars[xi].h + tick / 2, `${why}: exit is outside bar ${xi}`);
        for (const k of bars) {
          for (const p of [k.o, k.h, k.l, k.c]) assert.ok(onTick(p, tick), `${why}: ${p} is off the tick`);
          assert.ok(k.l <= Math.min(k.o, k.c) && k.h >= Math.max(k.o, k.c), `${why}: open or close outside the bar`);
          assert.ok(k.v > 0, why);
        }
      }
    }
  }
});

test("a chart's candles join up: each opens where the last one closed", () => {
  const { bars } = sampleBars({ entry: 21480, exit: 21510, side: 1, tick: 0.25, held: 30, tf: 1, seed: 7 });
  for (let i = 1; i < bars.length; i++) near(bars[i].o, bars[i - 1].c, `bar ${i}`);
});

test("the same trade always draws the same chart, and another trade a different one", () => {
  const spec = { entry: 21480, exit: 21510, side: 1, tick: 0.25, held: 30, tf: 1 };
  assert.deepEqual(sampleBars({ ...spec, seed: seedOf("t12") }), sampleBars({ ...spec, seed: seedOf("t12") }));
  assert.notDeepEqual(sampleBars({ ...spec, seed: seedOf("t12") }).bars, sampleBars({ ...spec, seed: seedOf("t13") }).bars);
  assert.equal(seedOf("t12"), seedOf("t12"));
  assert.notEqual(seedOf("t12"), seedOf("t13"));
});

test("a trade that goes nowhere still draws a chart with its prices on it", () => {
  const { bars, ei, xi } = sampleBars({ entry: 21480, exit: 21480, side: 1, tick: 0.25, held: 12, tf: 1, seed: 3 });
  for (const k of [bars[ei], bars[xi]]) assert.ok(k.l <= 21480 && 21480 <= k.h);
  for (const k of bars) assert.ok([k.o, k.h, k.l, k.c].every(Number.isFinite));
});

test("frameFor picks the smallest frame that fits the trade in 30 bars", () => {
  const cases = [[0, 1], [1, 1], [30, 1], [31, 2], [60, 2], [61, 3], [90, 3], [91, 5], [150, 5], [151, 15], [450, 15], [451, 30], [900, 30], [901, 60], [1800, 60], [1801, 240], [7200, 240], [7201, 1440], [99999, 1440]];
  for (const [minutes, frame] of cases) assert.equal(frameFor(minutes), frame, `${minutes} minutes`);
  assert.equal(frameFor(null), 1);
  assert.equal(frameFor(undefined), 1);
});

test("the price scale steps cleanly and stays inside the range", () => {
  const { ticks, places } = scaleOf(21480, 21540, 2);
  assert.ok(ticks.length >= 4 && ticks.length <= 8, `${ticks.length} ticks`);
  assert.ok(ticks[0] >= 21480 && ticks.at(-1) <= 21540);
  assert.equal(places, 0);
  assert.equal(scaleOf(1.0841, 1.0862, 5).places, 4);
});

test("a day's candles open where the last trade closed, from nothing", () => {
  assert.deepEqual(dayBars([120, -50, 25]), [{ o: 0, c: 120 }, { o: 120, c: 70 }, { o: 70, c: 95 }]);
  assert.deepEqual(dayBars([]), []);
  const bars = dayBars([-300, 410, -5, 90.5, 0]);
  bars.forEach((k, i) => { if (i) assert.equal(k.o, bars[i - 1].c, `candle ${i}`); });
  assert.equal(bars.at(-1).c, -300 + 410 - 5 + 90.5);
});

/* ---------- A made-up chart never sits next to real money ---------- */

test("a real trade with no bars gets no chart; only real candles or labelled sample data draw one", () => {
  const prices = { entry: 21480, exit: 21510 };
  assert.equal(canChart(prices, false), false, "real trade, no bars");
  assert.equal(canChart({ ...prices, bars: null }, false), false);
  assert.equal(canChart({ ...prices, bars: { bars: [], ei: 0, xi: 0 } }, false), true, "real trade, market bars");
  assert.equal(canChart(prices, true), true, "sample data");
  assert.equal(canChart({ entry: 21480, exit: null }, true), false, "an open trade has no exit to draw");
  assert.equal(canChart({ entry: null, exit: 21510 }, true), false);
});

test("the card asks that same rule, and says Sample data whenever the numbers are made up", () => {
  const flex = read("../src/views/Flex.jsx");
  assert.match(flex, /if \(!canChart\(\{ entry, exit, bars: t\.bars \}, isSample\(\)\)\) return null;/);
  assert.match(flex, /sample \? "Sample data" : null/);
  assert.match(flex, /const sample = isSample\(\);/);
  assert.doesNotMatch(flex, /sampleBars\(t\b/, "candles are only ever drawn from the spec chartOf allowed");
});

/* ---------- Market marks ---------- */

test("every market with a logo gets its logo key, under every spelling a broker uses", () => {
  const keys = {
    nasdaq: ["NQ", "MNQ", "NAS100", "US100", "USTEC", "NDX", "NDX100"],
    sp500: ["ES", "MES", "US500", "SPX500", "SPX", "SP500"],
    dowjones: ["YM", "MYM", "US30", "DJ30", "DJI", "WS30"],
    cme: ["RTY", "M2K", "CL", "MCL", "QM", "NG", "GC", "MGC", "SI", "SIL", "HG", "PL"],
    dax: ["GER40", "DE40", "GER30", "DAX"],
    ftse100: ["UK100", "FTSE", "FTSE100"],
  };
  for (const [logo, symbols] of Object.entries(keys)) {
    for (const s of symbols) assert.deepEqual(marketMark(s), { logo }, s);
    assert.ok(existsSync(new URL(`../src/views/marketlogos/${logo}.svg`, import.meta.url)), `${logo}.svg`);
  }
  for (const [s, logo] of [["NQZ6", "nasdaq"], ["MNQH27", "nasdaq"], ["CON.F.US.MNQ.Z26", "nasdaq"], ["F.US.ENQ.Z26", "nasdaq"], ["NQ 12-26", "nasdaq"], ["/ESZ6", "sp500"],
    ["nas100", "nasdaq"], [" US30 ", "dowjones"], ["NAS100.cash", "nasdaq"], ["US30m", "dowjones"], ["US500_m", "sp500"], ["GER40.pro", "dax"], ["US100 cash", "nasdaq"], ["UK100:FXCM", "ftse100"]]) {
    assert.deepEqual(marketMark(s), { logo }, s);
  }
});

test("forex gets both currencies' flags, and the flag files exist", () => {
  const eur = { src: "/logos/markets/flag-eur.svg", name: "Euro" }, usd = { src: "/logos/markets/flag-usd.svg", name: "US dollar" };
  assert.deepEqual(marketMark("EURUSD"), { flags: [eur, usd] });
  assert.deepEqual(marketMark("EUR/USD"), { flags: [eur, usd] });
  assert.deepEqual(marketMark("eurusd.m"), { flags: [eur, usd] });
  assert.deepEqual(marketMark("6E"), { flags: [eur, usd] }, "an FX future reads against the dollar");
  assert.deepEqual(marketMark("6EZ6"), { flags: [eur, usd] });
  for (const [s, a, b] of [["GBPJPY", "gbp", "jpy"], ["AUDCAD", "aud", "cad"], ["NZDCHF", "nzd", "chf"], ["6B", "gbp", "usd"], ["6J", "jpy", "usd"]]) {
    assert.deepEqual(marketMark(s).flags.map((f) => f.src), [`/logos/markets/flag-${a}.svg`, `/logos/markets/flag-${b}.svg`], s);
  }
  for (const c of ["aud", "cad", "chf", "eur", "gbp", "jpy", "nzd", "usd"]) assert.ok(existsSync(new URL(`../public/logos/markets/flag-${c}.svg`, import.meta.url)), c);
});

test("a market with no mark gets null, so the card prints its code alone", () => {
  for (const s of ["AAPL", "TSLA", "BTCUSDT", "BTCUSD", "XAUUSD", "SOL", "ZZZ", "", "   ", null, undefined]) assert.equal(marketMark(s), null, String(s));
});

test("the code a card prints: the contract's root, or a pair with its slash", () => {
  assert.equal(marketCode("MNQZ6"), "MNQ");
  assert.equal(marketCode("NQ"), "NQ");
  assert.equal(marketCode("EURUSD"), "EUR/USD");
  assert.equal(marketCode("6EZ6"), "6E");
  assert.equal(marketCode("aapl"), "AAPL");
  assert.equal(marketCode(null), "");
});

/* ---------- Finishes ---------- */

test("finishes: White and Black from day one, Carbon at 60 closed days", () => {
  assert.deepEqual(FINISHES.map((f) => [f.id, f.need]), [["white", 0], ["black", 0], ["carbon", 60]]);
  assert.deepEqual(finishesFor(0).map((f) => f.id), ["white", "black"]);
  assert.deepEqual(finishesFor(59).map((f) => f.id), ["white", "black"]);
  assert.deepEqual(finishesFor(60).map((f) => f.id), ["white", "black", "carbon"]);
  assert.equal(finishFor(0), "black", "a first card is black");
  assert.equal(finishFor(59), "black");
  assert.equal(finishFor(60), "carbon", "the newest finish comes on by itself");
  assert.equal(finishFor(400), "carbon");
  assert.equal(nextFinish(0).id, "carbon");
  assert.equal(nextFinish(59).need, 60);
  assert.equal(nextFinish(60), null);
});

test("the trader's own choice of finish holds only once it's earned", () => {
  assert.equal(finishFor(0, "white"), "white");
  assert.equal(finishFor(0, "black"), "black");
  assert.equal(finishFor(60, "white"), "white", "keeps White after Carbon opens");
  assert.equal(finishFor(60, "black"), "black");
  assert.equal(finishFor(60, "carbon"), "carbon");
  assert.equal(finishFor(0, "carbon"), "black", "Carbon isn't theirs yet");
  assert.equal(finishFor(59, "carbon"), "black");
  assert.equal(finishFor(10, "silver"), "black", "a retired finish falls back");
  assert.equal(finishFor(10, undefined), "black");
});

/* ---------- Where the picture lands ---------- */

const CARDS = { post: [1080, 1080], story: [1080, 1920], wide: [1920, 1080] };
const PICTURES = [[1600, 2400], [2400, 1600], [1600, 1600], [3000, 1000], [900, 3000]];
const box = (win, W, H) => {
  const x = Math.max(0, win.cx - win.rx) * W, y = Math.max(0, win.cy - win.ry) * H;
  return { x, y, r: Math.min(1, win.cx + win.rx) * W, b: Math.min(1, win.cy + win.ry) * H };
};
const everyPlace = function* () {
  for (const [kind, [W, H]] of Object.entries(CARDS)) for (const plate of ["chart", "open"]) for (const [iw, ih] of PICTURES) yield { kind, plate, W, H, iw, ih, win: WINDOWS[kind][plate] };
};

test("however far a picture is dragged or zoomed, it covers its window and no edge of it shows", () => {
  const pulls = [-9, -1, -0.3, -0.01, 0, 0.01, 0.3, 1, 9];
  for (const { kind, plate, W, H, iw, ih, win } of everyPlace()) {
    const b = box(win, W, H);
    for (const x of pulls) for (const y of pulls) for (const zoom of [1, 1.4, 3]) {
      const at = placement(iw, ih, W, H, win, { ...LOOK, x, y, zoom });
      const why = `${kind} ${plate} ${iw}x${ih} at ${x},${y} zoom ${zoom}`;
      assert.ok(at.x <= b.x + 1e-6, `${why}: left edge shows`);
      assert.ok(at.y <= b.y + 1e-6, `${why}: top edge shows`);
      assert.ok(at.x + at.w >= b.r - 1e-6, `${why}: right edge shows`);
      assert.ok(at.y + at.h >= b.b - 1e-6, `${why}: bottom edge shows`);
      near(at.w / at.h, iw / ih, `${why}: stretched`);
    }
  }
});

test("a picture stays whole in shape and sits a little past its window, so there's room to move it", () => {
  for (const { W, H, iw, ih, win } of everyPlace()) {
    const b = box(win, W, H);
    const at = placement(iw, ih, W, H, win);
    assert.ok(at.w > b.r - b.x + 1 || at.h > b.b - b.y + 1);
  }
});

test("the place a picture was clamped to is the place it stays", () => {
  for (const { W, H, iw, ih, win } of everyPlace()) {
    const first = placement(iw, ih, W, H, win, { ...LOOK, x: 4, y: -4, zoom: 1.6 });
    const again = placement(iw, ih, W, H, win, first.look);
    near(again.x, first.x, "x");
    near(again.y, first.y, "y");
  }
});

test("a look with parts missing lands where a fresh one does", () => {
  for (const { W, H, iw, ih, win } of everyPlace()) {
    const fresh = placement(iw, ih, W, H, win);
    const bare = placement(iw, ih, W, H, win, {});
    assert.deepEqual([bare.x, bare.y, bare.w, bare.h], [fresh.x, fresh.y, fresh.w, fresh.h]);
  }
});

test("a tall picture keeps its top in view and a wide one is framed through the middle", () => {
  const win = WINDOWS.post.open, [W, H] = CARDS.post, b = box(win, W, H);
  const tall = placement(1600, 2400, W, H, win);
  const spare = tall.h - (b.b - b.y);
  assert.ok(b.y - tall.y < spare * 0.5, "more of a tall picture is lost from its foot than its head");
  near(tall.y, b.y - spare * 0.1, "tall");
  assert.ok(placement(1600, 2400, W, H, { ...win, top: 0.3 }).y < tall.y, "a window can ask for a lower start");
  const wide = placement(2400, 1600, W, H, win);
  near(wide.y, b.y + (b.b - b.y - wide.h) * 0.45, "wide");
});

test("a mini frames a picture by the same rule as a full card, so a tall picture keeps its head", () => {
  assert.equal(upOf(1600, 2400), 0.1, "tall: most of the loss comes off the foot");
  assert.equal(upOf(2400, 1600), 0.45, "wide: through the middle");
  assert.equal(upOf(1600, 1600), 0.45, "square counts as wide");
  assert.equal(upOf(1600, 2400, 0.3), 0.3, "a window can ask for its own start");
  assert.equal(upOf(1600, 2400, 0), 0, "a start of nothing is a real start, not a missing one");
  assert.equal(upOf(2400, 1600, 0.3), 0.45, "a window's start only moves a tall picture");
  const flex = readFileSync(new URL("../src/views/Flex.jsx", import.meta.url), "utf8");
  assert.match(flex, /naturalHeight - sh\) \* upOf\(/, "the mini uses the shared rule");
  assert.doesNotMatch(flex, /naturalHeight - sh\) \* 0\.5/, "and no longer cuts through the middle");
});

test("a crew's picture is set to keep its subject in frame", () => {
  const pos = (tag) => +/^50% (\d+)%$/.exec(CREWS[tag].pos)[1];
  assert.ok(pos("NITE") <= 20, "the moon and the swordsman both stay in");
  assert.ok(pos("PIT") >= 70, "the badge and the road, not the black roof");
  for (const tag of CREW_ORDER) assert.ok(CREWS[tag].small, tag);
});

test("a picture fades out of its window and stops short of the logo", () => {
  for (const { W, H, win } of everyPlace()) {
    const keep = keepOf(win, W, H);
    assert.equal(keep((win.cx + win.rx * 1.2) * W, (win.cy + win.ry * 1.2) * H), 0, "past the window");
    if (win.clear) assert.equal(keep(0, 0), 0, "over the logo");
    const k = keep(win.cx * W * 0.999, win.cy * H + 1);
    assert.ok(k >= 0 && k <= 1, `${k}`);
  }
  assert.equal(keepOf(WINDOWS.post.open, 1080, 1080)(1079, 1), 1, "the full picture in its corner");
});

/* ---------- A brand-new account ---------- */

const allNumbers = (v, path = "", out = []) => {
  if (typeof v === "number") out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => allNumbers(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) allNumbers(x, `${path}.${k}`, out);
  return out;
};
const noBadNumbers = (v, what) => { for (const [p, n] of allNumbers(v)) assert.ok(!Number.isNaN(n), `${what}${p} is NaN`); };

test("a brand-new account adds up to nothing: no NaN anywhere in its figures", () => {
  noBadNumbers(summarize([]), "summarize");
  noBadNumbers(statsOf([]), "statsOf");
  noBadNumbers(weekOf([]), "weekOf");
  noBadNumbers(byStage([], []), "byStage");
  assert.equal(weekOf([]).net, 0);
  assert.equal(totalOf([]), 0);
  for (const kind of ["day", "week", "month", "all"]) assert.ok(spanOf({ kind }).label, kind);
});

test("money with nothing behind it reads as missing, never as $NaN", () => {
  for (const v of [undefined, NaN, "nope", Infinity, -Infinity, {}]) {
    assert.equal(fmtMoney(v), "–", String(v));
    assert.doesNotMatch(money(v), /NaN|Infinity/, String(v));
  }
  assert.equal(fmtMoney(0), "$0");
  assert.equal(fmtMoney(null), "$0");
  assert.equal(fmtMoney("1250.5"), "$1,250.50", "a number held as text still reads");
});

test("a trade without a P&L can't turn a new account's week into NaN", () => {
  const key = keyOf(today());
  const week = weekOf([{ dayKey: key, pnl: null }, { dayKey: key }, { dayKey: key, pnl: "x" }, { dayKey: key, pnl: 120 }]);
  assert.equal(week.net, 120);
  noBadNumbers(week, "weekOf");
});

test("made-up numbers aren't in the live app: the sample only ever comes in through the demo and the labelled example", () => {
  assert.deepEqual(Object.keys(SAMPLE), [], "the live path starts with no sample data");
  assert.doesNotMatch(read("../src/data.js"), /from ["']\.\/sample/);
  assert.doesNotMatch(read("../src/main.jsx"), /sample/i);
});

test("a first desk says Day 1 with the hold under it, never $0, and its empty card names no money", () => {
  const desk = read("../src/views/Dashboard.jsx");
  const first = desk.slice(desk.indexOf("if (firstTime) {"), desk.indexOf("const closeBlock"));
  assert.match(first, /dayWord=/);
  assert.match(first, /<FirstHold \/>/);
  assert.match(first, /<FirstLinks /);
  assert.doesNotMatch(first, /money\(|fmtMoney|\$\{net\}/, "no figure on a first desk");
  assert.match(desk, /const firstTime = all\.length === 0;/);
  assert.match(desk, /const FIRST_CARD = \{[^}]*money: null[^}]*fallback: "Closed"/, "the empty card prints a word, not a number");
});
