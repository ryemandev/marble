import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reloadOnce } from "../src/live/stale.js";

const shelf = (start = {}) => {
  const kept = { ...start };
  return { getItem: (k) => kept[k] ?? null, setItem: (k, v) => { kept[k] = v; } };
};

test("a tab on an old build reloads once, then lets the error through", () => {
  const storage = shelf();
  let reloads = 0;
  const reload = () => { reloads += 1; };
  assert.equal(reloadOnce(storage, 100000, reload), true);
  assert.equal(reloadOnce(storage, 130000, reload), false, "still failing after the reload: no loop");
  assert.equal(reloads, 1);
});

test("a later deploy in the same tab gets its own reload", () => {
  const storage = shelf();
  let reloads = 0;
  reloadOnce(storage, 100000, () => { reloads += 1; });
  assert.equal(reloadOnce(storage, 100000 + 61000, () => { reloads += 1; }), true);
  assert.equal(reloads, 2);
});

test("with no storage it never reloads, because it couldn't stop itself looping", () => {
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  const full = { getItem: () => null, setItem: () => { throw new Error("full"); } };
  let reloads = 0;
  assert.equal(reloadOnce(broken, 100000, () => { reloads += 1; }), false);
  assert.equal(reloadOnce(full, 100000, () => { reloads += 1; }), false);
  assert.equal(reloads, 0);
});

test("the real app watches for it, before anything else can fail", () => {
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(main, /if \(LIVE\) watchForNewBuild\(\);/);
  assert.ok(main.indexOf("watchForNewBuild();") < main.indexOf("captureErrors();"));
});
