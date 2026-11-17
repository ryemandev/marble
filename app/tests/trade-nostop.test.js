import test from "node:test";
import assert from "node:assert/strict";
import { workOut } from "../src/lib/trade.js";
import { linesOf, textOf } from "../src/views/study/model.js";

const base = { symbol: "NQ", side: "long", time: "09:41", date: "2026-11-05", note: "" };

test("entry, exit and size are enough for the dollars", () => {
  const w = workOut({ ...base, entry: "21000", exit: "21010", size: "2" }, { rOptional: true });
  assert.equal(w.pnl, 400);
  assert.equal(w.r, null);
  assert.equal(w.valid, true);
});

test("a short works the same way round without a stop", () => {
  assert.equal(workOut({ ...base, side: "short", entry: "21010", exit: "21000", size: "1" }, { rOptional: true }).pnl, 200);
});

test("a stop still adds the R", () => {
  const w = workOut({ ...base, entry: "21000", stop: "20990", exit: "21020", size: "1" }, { rOptional: true });
  assert.equal(w.r, 2);
  assert.equal(w.pnl, 400);
});

test("an unknown market still asks for its dollars per point", () => {
  const w = workOut({ ...base, symbol: "XYZ", entry: "100", exit: "102", size: "1" }, { rOptional: true });
  assert.equal(w.needsPointValue, true);
  assert.equal(w.valid, false);
});

test("an edited line keeps its time and mark", () => {
  const was = [{ t: 120, text: "first", key: true }, { t: 300, text: "second", key: false }];
  const out = linesOf("first edited\nsecond", was, 999);
  assert.equal(out[0].t, 120);
  assert.equal(out[0].key, true);
  assert.equal(out[1], was[1]);
});

test("a brand new line takes the video's time", () => {
  const was = [{ t: 120, text: "first", key: false }];
  const out = linesOf("first\nnew line", was, 500);
  assert.equal(out[1].t, 500);
});

test("passing the row limit keeps times and marks, and every word", () => {
  const was = Array.from({ length: 400 }, (_, i) => ({ t: i, text: `line ${i}`, key: i === 0 }));
  const text = `${textOf(was)}\nline 400`;
  const out = linesOf(text, was, null);
  assert.ok(out.length <= 400);
  assert.equal(out[0].t, 0);
  assert.equal(out[0].key, true);
  assert.ok(out.filter((l) => l.t != null).length > 190);
  assert.equal(textOf(out), text);
});
