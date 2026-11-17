import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const desk = read("../src/views/Dashboard.jsx");
const close = read("../src/drip/DailyClose.jsx");
const file = read("../src/live/FirstFile.jsx");
const importer = read("../src/live/Import.jsx");

test("a first desk has the hold and nothing about steps", () => {
  assert.doesNotMatch(desk, /FirstHero|FirstSteps|useHourPrint|desk-hello/);
  assert.match(desk, /Your record starts when you close\./);
  assert.match(desk, /On record since/);
});

test("the first desk's hold goes straight to the ink, and the Close still waits for the finger", () => {
  assert.match(close, /setState\(\{ closing: "first" \}\)/);
  assert.match(close, /useRef\(opening \? firstHand\.current/);
  assert.match(desk, /closing === "first"/, "the hold stays mounted under the black, or the lift is never heard");
});

test("a first no-trade day wears the Wanderer, and only that day", () => {
  assert.match(close, /n === 1 && !trades\.length \? \{ subject:/);
  assert.match(read("../src/views/flexpics.js"), /t\.wears \|\| defaultFor\(t\)/);
});

test("the record starts on the first closed day", async () => {
  const src = read("../src/drip/week.js");
  assert.match(src, /export function recordSince/);
  assert.match(src, /Object\.keys\(closes\)\.sort\(\)\[0\]/);
});

test("the first file asks once, and any later one keeps the toast", () => {
  assert.match(importer, /const firstFile = !Object\.keys\(mappings\)\.length;/);
  assert.match(importer, /if \(firstFile && added\.length\) \{/);
  assert.match(importer, /journalReview: true/);
  assert.match(importer, /Needs review/);
  assert.match(importer, /showEverything\(\)/);
});

test("the first file never says it's right: the trader does, and equally either way", () => {
  assert.match(file, /Does this match your broker\?/);
  assert.match(file, /className="ff-btn" onClick=\{onYes\}/);
  assert.match(file, /className="ff-btn" onClick=\{onOff\}/);
  assert.doesNotMatch(file, /Verified|verified|Matched|match!/);
});

test("removing the first file keeps what the trader reviewed", () => {
  assert.match(file, /await undoImport\(file\.importId\)/);
  assert.match(file, /Kept \$\{kept\} you reviewed/);
});

test("the cost a first file shows is the one Stats opens on", () => {
  assert.match(file, /useMoney\("stats"\)/);
  assert.match(file, /statsSeeCost: true/);
  assert.match(read("../src/drip/journal/Finding.jsx"), /opened=\{asked\}/);
});
