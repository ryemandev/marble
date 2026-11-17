import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { SHELVES, isOwn, shelfOf } from "../src/views/flexpics.js";

const art = (path, w) => new URL(`../public/art/${path}${w ? `-${w}` : ""}.webp`, import.meta.url);
const original = (path) => new URL(`../../art/${path}.jpg`, import.meta.url);

test("every picture on the flex card's shelves has its four sizes and its original", () => {
  const all = SHELVES.flatMap((s) => s[2]);
  assert.equal(new Set(all).size, all.length, "a picture sits on one shelf only");
  for (const p of all) {
    for (const w of [160, 480, 960, null]) assert.ok(existsSync(art(p, w)), `${p}-${w ?? 1600}`); // the 1600 has no suffix
    assert.ok(existsSync(original(p)), `${p}.jpg`);
  }
});

test("the old masters have a shelf of their own, credited", () => {
  const masters = SHELVES.find((s) => s[0] === "masters");
  assert.ok(masters && masters[2].length === 15);
  const credits = readFileSync(new URL("../../art/CREDITS.md", import.meta.url), "utf8");
  for (const p of masters[2]) assert.ok(credits.includes(`| ${p}.jpg |`), p);
  assert.equal(shelfOf("masters/pale-horse-dore"), "masters");
  assert.equal(shelfOf("own:abc"), "yours");
  assert.ok(isOwn("own:abc") && !isOwn("masters/pale-horse-dore"));
});

test("a trader's own pictures are never sent anywhere", () => {
  for (const file of ["../src/views/flexpics.js", "../src/views/Flex.jsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(!/supabase|fetch\(|XMLHttpRequest|sendBeacon|upload\(/.test(src), file);
  }
});

test("the desk's strip over the greeting has a print for each time of day", () => {
  const desk = readFileSync(new URL("../src/drip/desk/DeskPlate.jsx", import.meta.url), "utf8");
  const srcs = [...desk.matchAll(/src: "(prints\/[a-z-]+)"/g)].map((m) => m[1]);
  assert.equal(srcs.length, 3);
  for (const s of srcs) assert.ok(existsSync(art(s, 960)) && existsSync(art(s)), s);
});
