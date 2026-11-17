import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eased, lineAt, pourPath } from "../src/drip/pour-path.js";
import { realStage, splitMoney } from "../src/drip/week.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const close = read("../src/drip/DailyClose.jsx");
const pour = read("../src/drip/Pour.jsx");
const css = read("../src/drip/drip.css");
const rule = (sheet, selector) => {
  const at = sheet.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} is there`);
  return sheet.slice(at, sheet.indexOf("}", at));
};

test("the ink's edge is on the screen from the first frame and covers it by the last", () => {
  const H = 844;
  assert.equal(lineAt(H, 0, true), 0);
  assert.ok(lineAt(H, 1 / 60, true) >= 0 && lineAt(H, 1 / 60, true) < 2, "it hasn't jumped");
  assert.equal(lineAt(H, 1, true), H + 2);
  assert.ok(Math.abs(eased(0.5) - 0.5) < 1e-3, "the curve is even about its middle");
  let last = -1;
  for (let t = 0; t <= 1; t += 0.02) { assert.ok(eased(t) >= last, "and never runs back"); last = eased(t); }
  assert.match(pourPath(390, H, 0.5, true), new RegExp(`L390 ${lineAt(H, 0.5, true).toFixed(1)}`), "the path is on that line");
});

test("the website's ink still arrives from above the screen", () => {
  const H = 844;
  assert.equal(lineAt(H, 0), -0.66 * H);
  assert.ok(Math.abs(lineAt(H, 1) - 1.08 * H) < 1e-9);
  assert.match(pourPath(390, H, 0), /L390 -557\.0/);
  const site = read("../src/site/home/DayClose.jsx");
  assert.match(site, /<Pour className="dc-pour close-pour" onDone=/, "no onScreen on the site");
  assert.match(pour, /onScreen = false/);
  assert.match(pour, /if \(!onScreen\) \{ done\.current\?\.\(\); return undefined; \}/, "reduced motion there skips to the end");
});

test("the close's timings, and reduced motion is a 200ms cut to black", () => {
  assert.match(close, /TIMES = \{ fill: 640, drain: 260, ink: 1000, beat: 120, buttons: 200, lift: 250 \}/);
  assert.match(close, /<Pour className="close-pour" onScreen ms=\{TIMES\.ink\}/);
  assert.match(pour, /node\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: 200, easing: "linear" \}\)/);
  assert.match(rule(css, ".hold-fill"), /transition: transform 0\.26s linear/);
  assert.match(rule(css, ".hold.held .hold-fill"), /transition: transform 0\.64s linear/);
});

test("the hold: a lift after it has filled does nothing, a lift before drains, and no leftover click lands", () => {
  assert.match(close, /if \(finished\.current\) \{\s+hand\.current\.quiet = performance\.now\(\) \+ TIMES\.lift;/);
  assert.match(close, /clearTimeout\(timer\.current\);\s+setHeld\(false\);/);
  assert.match(close, /timer\.current = setTimeout\(finish, TIMES\.fill\);/);
  assert.match(close, /onClickCapture=\{quiet\}/);
  assert.match(close, /if \(!up\.current \|\| hand\.current\.who !== null\) return;/, "Done sleeps while a finger is down");
  assert.doesNotMatch(close, /onPointerLeave/, "sliding off the tube isn't a lift");
});

test("what went from the close is gone, and what replaced it is there", () => {
  for (const gone of [/dayLine/, /recordLine/, /Log a trade first/, /reviewed/, /See you next session/, />Close today</, /<textarea/, /close-note/, /btn on-ink/]) {
    assert.doesNotMatch(close, gone, String(gone));
  }
  assert.doesNotMatch(read("../src/site/home/DayClose.jsx"), /reviewed/, "the site shows the same words");
  assert.match(close, /"Nothing left to do today\."/);
  assert.match(close, /`You've earned the \$\{earned\.name\} finish\.`/);
  assert.match(close, />Log a trade</);
  assert.match(close, /show=\{\{ money: true, record: false, handle: true \}\}/);
  assert.match(close, /<Money value=\{dayMoney\.money\} \/>/);
  assert.match(read("../src/drip/Money.jsx"), /"--size": digits > 3 \? "72px" : "88px"/);
});

test("a no-trade day closes through the same hold and the same stamp", () => {
  assert.equal((close.match(/<HoldToClose /g) || []).length, 2, "the same Hold on the review and on a first desk");
  assert.match(close, /closeToday\(\{ pnl: null, trades: 0 \}\)/);
  assert.match(close, /closeToday\(\{ pnl: card\.money, trades: trades\.length, \.\.\.\(said \? \{ line: said \} : \{\}\) \}\)/, "the line goes in only when there is one");
  const hold = close.lastIndexOf("<HoldToClose ");
  assert.ok(close.lastIndexOf(")}", hold) > close.lastIndexOf("trades.length > 0 ? (", hold), "the Hold sits after the rows, not inside them");
});

test("the word under the figure tells the truth about the money", () => {
  const accounts = [{ id: "l", stage: "live" }, { id: "f", stage: "funded" }, { id: "e", stage: "eval" }, { id: "p", stage: "paper" }];
  const t = (account, pnl) => ({ id: `${account}${pnl}`, account, pnl });
  assert.equal(realStage([t("f", 864), t("f", -306)], accounts), "funded");
  assert.equal(realStage([t("l", 100)], accounts), "live");
  assert.equal(realStage([t("l", 100), t("f", 200)], accounts), null, "live and funded together");
  assert.equal(realStage([t(null, 100)], accounts), null, "a trade on no account");
  assert.equal(realStage([t("e", 100)], accounts), null, "evaluation only");
  assert.equal(realStage([t("f", 558), t("e", -521)], accounts), "funded", "two stages: the real one leads and the other stays aside");
  assert.equal(splitMoney([t("f", 558), t("e", -521)], accounts).aside, -521);
  assert.match(close, /Evaluation and paper, simulated /);
  assert.match(close, /kind \? STAGES\[kind\] : dayMoney\.simulated \? "Today, simulated" : "Today"/);
});

test("black is this one screen, the Hold is an empty tube, and nothing shines", () => {
  assert.match(rule(css, ".close-reveal"), /background: #000/);
  assert.match(rule(css, ".close-fit::after"), /inset 0 0 0 1px rgba\(255, 255, 255, 0\.18\)/);
  assert.match(rule(css, ".hold"), /height: 66px/);
  assert.match(rule(css, ".hold"), /box-shadow: inset 0 0 0 2px #000/);
  assert.match(rule(css, ".hold-label"), /font: 600 16px/);
  assert.match(rule(css, ".close-done"), /height: 56px/);
  assert.match(rule(css, ".close-share"), /width: 80px/);
  const closeRules = css.slice(css.indexOf("/* ------- The daily close ------- */"), css.indexOf(".flex-overlay"));
  assert.doesNotMatch(closeRules, /blur|backdrop|#16db65|\bsteps\(/);
});

test("no builder's word reaches the screen", () => {
  for (const f of ["../src/drip/DailyClose.jsx", "../src/site/home/DayClose.jsx", "../src/site/live/Shoulder.jsx"]) {
    const s = read(f);
    const words = [...s.matchAll(/>([^<>{}]+)</g), ...s.matchAll(/"([A-Z][^"\n]* [^"\n]*)"/g)].map((m) => m[1]);
    for (const w of words) assert.doesNotMatch(w, /\b(press|presses|print|prints|plate|pour|pours|tank|droplet)\b/i, `${f}: ${w}`);
  }
});

test("the site keeps working without the app's close rules", () => {
  const site = read("../src/site/home/day-close.css");
  assert.match(site, /\.dc-sheet \.close-trades \{ list-style: none;/);
  assert.match(site, /\.dc-sheet \.close-line \{[^}]*background: var\(--panel\)/);
  assert.doesNotMatch(site.replaceAll("var(--vh, 1vh)", ""), /\b\d+[sdl]?vh\b/, "screen heights stay on var(--vh)");
  assert.match(read("../src/site/everything/features.js"), /name: "The daily close", text: "[^"]*Ink covers the screen/);
  assert.doesNotMatch(css, /^\.close-trades/m);
  assert.match(read("../src/site/live/Shoulder.jsx"), /querySelector\("\.close-done"\)/);
});
