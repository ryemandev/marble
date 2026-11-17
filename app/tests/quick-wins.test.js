import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
// Every block in a sheet whose selector is exactly this one, at the start of a line
const rule = (css, selector) => {
  const found = css.split("\n").filter((l) => l.startsWith(`${selector} {`));
  assert.ok(found.length > 0, `${selector} is in the sheet`);
  return found.join("\n");
};

/* ---------- The Desk's panel ---------- */

test("the panel is still and looks the same on any day", () => {
  const plate = read("../src/drip/desk/DeskPlate.jsx");
  const desk = read("../src/views/Dashboard.jsx");
  assert.doesNotMatch(plate + desk, /<Tank|drip\/Tank|requestAnimationFrame|useRoll/, "nothing moves on the Desk");
  assert.doesNotMatch(plate.slice(plate.indexOf("function DeskPicture"), plate.indexOf("// The Desk's panel.")), /net|pnl|money/, "the picture knows nothing of the money");
});

test("the marks over the week's total show closed days, never won days", () => {
  const plate = read("../src/drip/desk/DeskPlate.jsx");
  assert.match(plate, /className=\{d\.closed \? "on" : ""\}>\{d\.letter\}/);
  assert.doesNotMatch(plate.slice(plate.indexOf('className="dp-days"'), plate.indexOf("</ol>")), /pnl|trades|won|net/);
  assert.match(read("../src/views/Dashboard.jsx"), /closed: !!closes\[d\.key\]/);
});

test("the tank's clock never runs backwards, so a first load can't paint a loss that never happened", () => {
  assert.match(read("../src/drip/Tank.jsx"), /const dt = Math\.min\(0\.033, Math\.max\(0, \(now - m\.last\) \/ 1000\) \|\| 0\.016\);/);
});

/* ---------- Unfinished touches ---------- */

test("the Story card's time axis ends above its market line", () => {
  const flex = read("../src/views/Flex.jsx");
  const y1 = +flex.match(/story: \{[^\n]*y1: (\d+) \} \},/)[1];
  // The times are drawn down to y1 + 20; the market line starts at 466 on a 640 card
  assert.ok(y1 + 20 <= 458, `y1 is ${y1}`);
});

test("a tap on a Stats dot finds its own trade", () => {
  const charts = read("../src/drip/stats/charts.jsx");
  assert.match(charts, /const open = \(e\) => \{ const p = nearest\(e\); if \(p\) onPick\?\.\(p\); \};/);
  assert.doesNotMatch(charts, /onClick=\{\(\) => hover && onPick/);
});

test("writing in Study moves the bar away and nothing else", () => {
  const pad = read("../src/views/study/Pad.jsx");
  assert.match(pad, /classList\.add\("st-writing"\)/);
  assert.doesNotMatch(pad, /st-reading/);
  for (const f of ["../src/views/study/study.css", "../src/drip/study/study-screen.css"]) {
    const hides = read(f).split("\n").filter((l) => l.includes("st-writing") && /display: none|min-height/.test(l));
    assert.deepEqual(hides, [], f);
  }
});

test("a phone's strip of accounts ends with Add an account", () => {
  const desk = read("../src/views/Dashboard.jsx");
  const strip = desk.slice(desk.indexOf("function DeskTracks"), desk.indexOf("const FIRST_CARD"));
  assert.match(strip, /className="tr-add" onClick=\{\(\) => openDialog\("account"\)\}/);
  assert.match(strip, /"Add an account" : "Add your first account"/);
  assert.match(desk, /<DeskTracks accounts=\{accounts\} active=\{active\} choose=\{choose\} \/>\n\n\s+<DeskCard/, "shown with no accounts too");
});

test("the calculators' answers are drawn in ink", () => {
  const big = rule(read("../src/site/tools/tools.css"), ".tl-big");
  assert.match(big, /color: var\(--text\)/);
  assert.doesNotMatch(big, /transparent|background-clip/);
});

/* ---------- Space and weight ---------- */

test("a phone has one gutter: the page's own", () => {
  const css = read("../src/drip/drip.css");
  assert.match(css, /\.main-scroll > \.view:not\(\.fl-hub\) \{ padding-left: 0; padding-right: 0; \}/);
  assert.match(css, /\.main-scroll \{ height: auto; overflow: visible; padding: 0 max\(16px, env\(safe-area-inset-right, 0px\)\)/);
});

test("three radii: panels 24, tiles 20, thumbnails and fields 12", () => {
  const drip = read("../src/drip/drip.css");
  assert.match(drip, /--r-panel: 24px; --r-tile: 20px; --r-thumb: 12px;/);
  const sheets = { drip, desk: read("../src/drip/desk/desk.css"), journal: read("../src/drip/journal/journal.css"), stats: read("../src/drip/stats/stats.css"), floor: read("../src/drip/floor/floor-screen.css"), hub: read("../src/drip/hub/hub.css"), study: read("../src/drip/study/study-screen.css") };
  const uses = (sheet, selector, token) => assert.match(rule(sheets[sheet], selector), new RegExp(`border-radius: var\\(--r-${token}\\)`), `${selector} is a ${token}`);
  for (const [sheet, selector] of [["desk", ".dp"], ["desk", ".dk-box"], ["journal", ".jn-group"], ["journal", ".jn-panel"], ["stats", ".st-hero"], ["study", ".sp-pad"], ["study", ".sy-plate"]]) uses(sheet, selector, "panel");
  for (const [sheet, selector] of [["drip", ".tr"], ["desk", ".dk-periods button"], ["desk", ".dk-facts button"], ["journal", ".jn-well"], ["stats", ".st-tile"], ["floor", ".fl-slab"], ["hub", ".hub-tile"], ["study", ".sp-row"], ["study", ".sp-book"], ["study", ".sy-tile"]]) uses(sheet, selector, "tile");
  for (const [sheet, selector] of [["journal", ".jn-shots figure"], ["study", ".sp-chart"], ["study", ".sp-thumb"], ["study", ".sp-slot-field"], ["floor", ".fl-crewrow-pic"]]) uses(sheet, selector, "thumb");
  // None of the old in-between sizes is left on a panel or a tile of the five tabs
  for (const [name, css] of Object.entries(sheets)) {
    const odd = [...css.matchAll(/border-radius: (18|22|26|28)px\b/g)].map((m) => m[0]);
    const kept = name === "journal" ? ["border-radius: 28px", "border-radius: 28px"] : []; // the Journal's two sheets
    assert.deepEqual(odd, kept, `${name}.css`);
  }
});

test("in a row the name steps back and the figure keeps the one 600", () => {
  const journal = read("../src/drip/journal/journal.css");
  assert.match(rule(journal, ".jn-row-what b"), /font-weight: 500/);
  assert.match(rule(journal, ".jn-row-pnl"), /font-weight: 600/);
  assert.match(rule(journal, ".jn-week b"), /font-weight: 500/);
  assert.match(rule(journal, ".jn-spread-name"), /font-weight: 500/);
  assert.match(rule(read("../src/drip/study/study-screen.css"), ".sp-row-words b"), /font-weight: 500/);
  assert.match(rule(read("../src/drip/floor/floor-screen.css"), ".fl-slab-what b"), /font-weight: 500/);
  assert.match(rule(read("../src/drip/hub/hub.css"), ".hub-p-days-who b"), /font-weight: 500/);
});
