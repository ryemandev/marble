import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COVERS, TONES, coverTone, pressLevels, toneOf } from "../src/views/study/model.js";

const src = fileURLToPath(new URL("../src", import.meta.url));
const read = (f) => readFileSync(join(src, f), "utf8");
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const code = walk(src).filter((f) => /\.(css|jsx?)$/.test(f));

test("one picture press: the value is pinned and the old soft filters are gone", () => {
  assert.ok(read("drip/drip.css").includes("--pic-press: grayscale(1) contrast(1.9) brightness(0.92);"));
  for (const f of code) {
    const text = readFileSync(f, "utf8");
    assert.ok(!/contrast\(1\.14\)/.test(text), `contrast(1.14) in ${f}`);
    assert.ok(!/contrast\(1\.42\)/.test(text), `contrast(1.42) in ${f}`);
  }
});

test("the pictures that keep a filter of their own keep it", () => {
  assert.ok(read("drip/stats/stats.css").includes(".st-pic img"));
  assert.match(read("drip/stats/stats.css"), /\.st-pic img \{[^}]*filter: grayscale\(1\) brightness\(0\.85\) contrast\(1\.44\);/);
  assert.match(read("drip/journal/journal.css"), /\.jn-well \.jn-well-pic img \{[^}]*filter: grayscale\(1\) contrast\(1\.3\) brightness\(0\.94\);/);
});

test("a picture that meets a white page stops at the panel, and black stays true", () => {
  const css = read("drip/drip.css");
  assert.ok(css.includes("--pic-sky: grayscale(1) contrast(2.2);"));
  assert.match(css, /mix-blend-mode: multiply/);
  assert.match(read("drip/study/study-screen.css"), /\.sy-tile-ink img \{[^}]*filter: var\(--tone, var\(--pic-sky\)\); mix-blend-mode: multiply;/);
});

test("each hard picture carries the brief's tone, found from its path or any address", () => {
  assert.deepEqual(TONES["prints/red-fuji-hokusai"], [0.7, 3.8]);
  assert.deepEqual(TONES["prints/night-rain-karasaki-hiroshige"], [0.66, 4.2]);
  assert.deepEqual(TONES["masters/wanderer-friedrich"], [0.72, 4]);
  assert.deepEqual(TONES["masters/self-portrait-rembrandt"], [1.25, 2.4]);
  assert.deepEqual(toneOf("/art/masters/wanderer-friedrich-960.webp"), [0.72, 4]);
  assert.deepEqual(toneOf("./art/prints/red-fuji-hokusai.webp"), [0.7, 3.8]);
  assert.equal(toneOf("./art/prints/great-wave-hokusai-clean-960.webp"), undefined);
  assert.equal(coverTone("anime/moon-reflection"), undefined);
  assert.equal(coverTone("masters/self-portrait-rembrandt"), "grayscale(1) brightness(1.25) contrast(2.4)");
  const covers = new Set(COVERS.map((c) => c[0]));
  for (const p of Object.keys(TONES)) assert.ok(p.startsWith("prints/") || covers.has(p), p);
});

test("the canvas presses to the same curve as the CSS", () => {
  const plain = pressLevels();
  assert.equal(plain[0], 0);
  assert.equal(plain[255], Math.round(0.92 * 255));
  assert.equal(plain[128], Math.round((((128 / 255 - 0.5) * 1.9 + 0.5) * 0.92) * 255));
  const fuji = pressLevels(TONES["prints/red-fuji-hokusai"]);
  assert.equal(fuji[255], 255);
  assert.equal(fuji[64], 0);
});

test("the Great Wave's painted copy is a new file and the original is untouched", () => {
  const art = (n) => new URL(`../public/art/prints/${n}.webp`, import.meta.url);
  for (const s of ["", "-160", "-480", "-960"]) {
    assert.ok(existsSync(art(`great-wave-hokusai-clean${s}`)), `clean${s}`);
    assert.ok(existsSync(art(`great-wave-hokusai${s}`)), `original${s}`);
  }
  assert.ok(existsSync(art("great-wave-hokusai-full")));
  assert.notEqual(statSync(art("great-wave-hokusai-clean")).size, statSync(art("great-wave-hokusai")).size);
});
