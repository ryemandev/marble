import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const jsx = readFileSync("src/site/home/Hero.jsx", "utf8");
const css = readFileSync("src/site/home/hero.css", "utf8");

test("the massive logo stays pinned while the ink rises over it, with every height held still for Instagram's browser", () => {
  assert.match(css, /\.hero-stage \{ position: sticky/);
  assert.match(jsx, /usePinned\(root, stage\)/);
  assert.match(jsx, /jerome-writing-caravaggio/);
  assert.doesNotMatch(css.split("var(--vh, 1vh)").join(""), /\d(s|d|l)?vh\b/, "screen heights go through var(--vh)");
});

test("the price line stays in live text", () => {
  assert.ok(jsx.includes("Nothing to pay. No card, no plans."));
  assert.ok(jsx.includes('const TITLE = "Stop paying to build better habits.";'), "the main line is the headline");
});
