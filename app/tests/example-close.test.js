// A close made during the walkthrough stays in the example: the real store, in its live mode, with sync.js watching.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./fake-supabase.mjs";

const inserts = [];
globalThis.fakeSupabase = {
  from: (table) => ({ insert: async (row) => { inserts.push({ table, row }); return { error: null }; } }),
};
const keys = {};
globalThis.localStorage = { getItem: (k) => keys[k] ?? null, setItem: (k, v) => { keys[k] = String(v); }, removeItem: (k) => { delete keys[k]; } };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window = { MARBLE_APP: true, addEventListener() {}, dispatchEvent() {} };
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, documentElement: { dataset: {} } };
globalThis.setInterval = () => 0; // the live store's clock would keep this file running for ever

const store = await import("../src/store.js");
const { closeToday } = await import("../src/drip/week.js");
await import("../src/live/sync.js");

const { exampleOn, getRawState, getState, setState, watch } = store;
const sample = { logged: [], accounts: [{ id: "ex-1", name: "Sample" }], strategies: [], notes: [], plan: {}, rules: {} };
const start = () => setState({ example: { on: true, data: sample, ticks: [], deskAccount: null, baseline: 0 } });
const finish = () => setState({ example: null });

test("the store really is in its live mode here", () => {
  start();
  assert.equal(exampleOn(), true);
  finish();
  assert.equal(exampleOn(), false);
});

test("a close in the example never reaches real state, this device or the server", () => {
  const seen = [];
  const stop = watch((prev, next) => { if (prev.closes !== next.closes) seen.push(next.closes); });
  start();
  closeToday({ pnl: 1250, trades: 3 });
  assert.ok(Object.keys(getRawState().example.closes).length, "it shows in the example");
  assert.deepEqual(getRawState().closes, {}, "real state");
  assert.deepEqual(seen, [], "sync.js is told nothing");
  assert.equal(keys["marble-closes"], undefined, "this device");
  stop();
  finish();
  assert.deepEqual(getRawState().closes, {}, "and it's gone with the example");
  assert.deepEqual(inserts, []);
});

test("a day closed in the example can still be closed for real", () => {
  start();
  closeToday({ pnl: 1250, trades: 3 });
  finish();
  closeToday({ pnl: -40, trades: 1 });
  const days = Object.values(getRawState().closes);
  assert.equal(days.length, 1);
  assert.equal(days[0].pnl, -40);
  assert.equal(Object.values(JSON.parse(keys["marble-closes"]))[0].pnl, -40);
});

test("a sample day isn't carried over by a close made with the example already on", () => {
  const before = { ...getRawState().closes };
  start();
  closeToday({ pnl: 999, trades: 1 });
  assert.deepEqual(getRawState().closes, before);
  assert.equal(Object.keys(getRawState().example.closes).filter((d) => !(d in before)).length, 0, "today's already real, so only its copy changes");
  assert.equal(Object.values(getRawState().example.closes)[0].pnl, 999);
  finish();
  assert.deepEqual(getState().closes, before);
});
