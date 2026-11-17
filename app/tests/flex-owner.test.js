import test from "node:test";
import assert from "node:assert/strict";

// A browser can be shared. One trader's picks and own line of words must never print on the next trader's card.
const box = new Map();
globalThis.localStorage = {
  getItem: (k) => (box.has(k) ? box.get(k) : null),
  setItem: (k, v) => box.set(k, String(v)),
  removeItem: (k) => box.delete(k),
};
box.set("marble.flex.looks", JSON.stringify({ "day:2026-11-05": { note: "my private line" } }));
box.set("marble.flex.pictures", JSON.stringify({ t1: "masters/narcissus-caravaggio" }));
box.set("marble.flex.style", JSON.stringify({ finish: "black" }));
box.set("marble.flex.plain", JSON.stringify({ "day:2026-11-05": true }));

const { flexOwner, onFlexReset, setLook } = await import("../src/views/flexpics.js");

test("the first trader seen on a browser keeps what's already there", () => {
  flexOwner("trader-a");
  assert.equal(box.get("marble.flex.by"), "trader-a");
  assert.match(box.get("marble.flex.looks"), /my private line/);
});

test("the same trader coming back keeps their choices", () => {
  flexOwner("trader-a");
  assert.match(box.get("marble.flex.looks"), /my private line/);
});

test("someone else signing in starts clean, in storage and in memory", () => {
  let reset = 0;
  onFlexReset(() => { reset += 1; });
  flexOwner("trader-b");
  assert.equal(box.get("marble.flex.by"), "trader-b");
  for (const k of ["marble.flex.looks", "marble.flex.pictures", "marble.flex.style", "marble.flex.plain"]) assert.ok(!box.has(k), `${k} is gone`);
  assert.equal(reset, 1);
  // What's in memory went too: the next save writes only the new trader's own choice
  setLook("day:2026-11-06", { note: "b" });
  assert.deepEqual(JSON.parse(box.get("marble.flex.looks")), { "day:2026-11-06": { note: "b" } });
});

test("no user yet changes nothing", () => {
  flexOwner(null);
  assert.equal(box.get("marble.flex.by"), "trader-b");
});
