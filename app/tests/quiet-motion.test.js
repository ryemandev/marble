import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const drip = read("../src/drip/drip.css");
const journal = read("../src/drip/journal/journal.css");

/* ---------- Tabs ---------- */

test("a tab change is one 120ms fade that never blocks a tap", () => {
  assert.match(drip, /::view-transition \{ pointer-events: none; \}/);
  assert.match(drip, /::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation-duration: 120ms; animation-timing-function: linear;/);
  // Nothing slides any more, in any sheet, and no screen sets its own tab change
  for (const f of ["../src/drip/drip.css", "../src/design.css", "../src/live/calm.css"]) {
    assert.doesNotMatch(read(f), /::view-transition-(old|new)\(main\) \{ animation:(?! none)/, f);
    assert.doesNotMatch(read(f), /data-vt/, f);
  }
  assert.doesNotMatch(read("../src/App.jsx"), /dataset\.vt/);
  assert.doesNotMatch(drip, /\.view > \*, \.desk > \* \{ animation: rise-in/, "the new screen is all there when the fade ends");
});

test("the tab bar's drop moves on touch, and a tap during a change still lands", () => {
  const bar = read("../src/drip/TabBar.jsx");
  assert.match(bar, /onPointerDown=\{touch\(t\.id\)\}/);
  assert.match(bar, /const at = aim \?\? value;/);
  assert.match(bar, /e\.target !== document\.documentElement \? null :/);
  assert.match(bar, /document\.addEventListener\("click", click, true\);/);
});

/* ---------- Figures ---------- */

test("no figure counts up: a rolled number is the number", () => {
  const motion = read("../src/drip/motion.js");
  const roll = motion.slice(motion.indexOf("export function useRoll"), motion.indexOf("// Put this ref on"));
  assert.match(roll, /return Number\.isFinite\(\+value\) \? \+value : 0;/);
  assert.doesNotMatch(roll, /requestAnimationFrame|useState|useEffect/);
});

/* ---------- Sheets ---------- */

test("every sheet sits on ink at .72 and leaves with a fade", () => {
  const light = drip.slice(drip.indexOf(':root[data-theme="light"]'));
  assert.match(light.slice(0, light.indexOf("}")), /--scrim: rgba\(0, 0, 0, 0\.72\);/);
  assert.match(read("../src/components/search.css"), /:root\[data-theme="light"\] \.sx-scrim \{ background: var\(--scrim\); \}/);
  const overlay = read("../src/components/overlay.jsx");
  assert.match(overlay, /useLeaving\(ref\);/);
  assert.match(overlay, /copy\.inert = true;/);
  assert.match(drip, /body > \.leaving \{ animation: sheet-leave 120ms linear both !important; \}/);
  assert.doesNotMatch(drip + journal + read("../src/components/logtrade.css"), /backdrop-filter|blur\(/);
});

test("a press is 0.97 wherever these sheets set one, and anything else you can tap gets it too", () => {
  assert.match(drip, /:where\(button, \[role="button"\], a\.btn, summary\):where\(:active\):where\(:not\(:disabled, \[aria-disabled="true"\]\)\) \{ transform: scale\(0\.97\); \}/);
  for (const f of ["../src/drip/drip.css", "../src/drip/journal/journal.css", "../src/drip/desk/desk.css", "../src/drip/study/study-screen.css", "../src/views/study/study.css", "../src/components/logtrade.css"]) {
    const odd = read(f).split("\n").filter((l) => l.includes(":active")).flatMap((l) => [...l.matchAll(/([^{}]*:active[^{}]*)\{[^{}]*transform: scale\((0\.\d+)\)/g)].filter((m) => m[2] !== "0.97").map((m) => m[1].trim()));
    assert.deepEqual(odd, [], f);
  }
});

/* ---------- The calendar ---------- */

test("every traded day carries the same ink, whatever it made or lost", () => {
  const wells = read("../src/drip/journal/Wells.jsx");
  assert.doesNotMatch(wells, /levelOf|--level/, "nothing grows with the dollars, by day or by month");
  assert.doesNotMatch(journal, /--level|clip-path: inset\(calc\(100% - var/);
  const ink = journal.split("\n").find((l) => l.startsWith(".jn-well .jn-well-ink {"));
  assert.match(ink, /height: 30px;/);
  assert.match(ink, /color: #fff; background: #000;/);
  assert.match(ink, /font: 600 12px\/16px var\(--sans\)/);
  assert.match(journal, /\.jn-well\.down \.jn-well-ink \{ color: var\(--loss-black\); \}/, "a loss is grey on the same black");
  assert.match(drip, /--loss-black: #a8a8a6;/);
  assert.match(journal.split("\n").find((l) => l.startsWith(".jn-well {")), /height: 76px;/);
  assert.match(journal, /\.jn-well\.today::after \{[^}]*box-shadow: inset 0 0 0 2px #000, inset 0 0 0 3px #fff;/);
  assert.match(wells, /fmtMoney\(v, \{ sign: true, decimals: 0 \}\)\.replace\("-", "−"\)/, "one minus, the long one");
});

test("the small photo is pressed and the popup's photo keeps its tone", () => {
  assert.match(journal, /\.jn-well \.jn-well-pic img \{[^}]*filter: grayscale\(1\) contrast\(1\.3\) brightness\(0\.94\);/); // softer than the shared press: thin chart lines break up at this size
  assert.match(drip, /--pic-press: grayscale\(1\) contrast\(1\.9\) brightness\(0\.92\);/);
  assert.doesNotMatch(journal.split("\n").find((l) => l.startsWith(".jn-shot img {")), /filter/);
});
