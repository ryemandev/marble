import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BACKDROP, NONE, OWN, PICTURES, backdropOf, newerBackdrop, ownPathOk } from "../src/backdrop.js";
import { getState, setBackdrop } from "../src/store.js";

const UID = "0b7c6f1e-2d3a-4c5b-8e9f-a1b2c3d4e5f6";
const file = (src, w) => new URL(`../public${src}${w ? `-${w}` : ""}.webp`, import.meta.url);

test("nothing saved is the plain white page", () => {
  assert.deepEqual(backdropOf(null), { ...BACKDROP, at: 0 });
  assert.deepEqual(backdropOf("porsche-rear"), backdropOf({}));
  assert.equal(BACKDROP.pic, NONE);
});

test("every choice the sheet offers is kept as it is", () => {
  for (const p of [...PICTURES.map((x) => x.id), NONE, OWN]) assert.equal(backdropOf({ pic: p }).pic, p);
  for (const k of ["glass", "soft"]) assert.equal(backdropOf({ panels: k }).panels, k);
  assert.equal(backdropOf({ mono: true }).mono, true);
  assert.equal(backdropOf({ own: `${UID}/mf2k3x.jpg` }).own, `${UID}/mf2k3x.jpg`);
});

test("anything else falls back to the default, field by field", () => {
  const b = backdropOf({ pic: "../../etc", panels: "clear", mono: "yes", at: -4 });
  assert.deepEqual(b, { ...BACKDROP, at: 0 });
  assert.equal(backdropOf({ pic: "ferrari-black", panels: 3 }).pic, "ferrari-black");
});

test("a trader's own photo is only ever a plain file in a folder of their own", () => {
  assert.ok(ownPathOk(`${UID}/mf2k3x.jpg`));
  for (const p of [`${UID}/../x.jpg`, `${UID}/a.png`, `${UID}/a b.jpg`, "mf2k3x.jpg", `x/${UID}/a.jpg`, `${UID}/${"a".repeat(25)}.jpg`, null, 4]) {
    assert.equal(ownPathOk(p), false, String(p));
    assert.equal(backdropOf({ own: p }).own, null);
  }
});

test("the newer of two copies wins, and either alone stands", () => {
  const a = { pic: "aston-dbs", at: 10 }, b = { pic: "ferrari-black", at: 20 };
  assert.equal(newerBackdrop(a, b).pic, "ferrari-black");
  assert.equal(newerBackdrop(b, a).pic, "ferrari-black");
  assert.equal(newerBackdrop(a, null).pic, "aston-dbs");
  assert.equal(newerBackdrop(null, b).pic, "ferrari-black");
  assert.equal(newerBackdrop(null, undefined), null);
  // A tie keeps the server's
  assert.equal(newerBackdrop({ pic: "aston-dbs", at: 5 }, { pic: "aston-road", at: 5 }).pic, "aston-dbs");
});

test("the store keeps the choice and stamps when it changed", () => {
  const before = Date.now();
  setBackdrop({ pic: "great-wave-hokusai", panels: "soft" });
  const b = getState().backdrop;
  assert.equal(b.pic, "great-wave-hokusai");
  assert.equal(b.panels, "soft");
  assert.ok(b.at >= before);
  setBackdrop({ panels: "glass" });
  assert.equal(getState().backdrop.pic, "great-wave-hokusai");
  assert.equal(getState().backdrop.panels, "glass");
  setBackdrop({ pic: "nope" });
  assert.equal(getState().backdrop.pic, BACKDROP.pic);
});

test("every picture is there, with the sheet's small copy", () => {
  assert.equal(new Set(PICTURES.map((p) => p.id)).size, PICTURES.length);
  for (const p of PICTURES) {
    assert.ok(existsSync(file(p.src)), p.src);
    assert.ok(existsSync(file(p.src, 480)), `${p.src}-480`);
  }
});

test("every picture the sheet offers has the file the ink draws, and a thumbnail for the tile", () => {
  for (const p of PICTURES) {
    assert.ok(existsSync(file(p.src)), `${p.src}.webp`);
    assert.ok(existsSync(file(p.src, 480)), `${p.src}-480.webp`);
  }
});
