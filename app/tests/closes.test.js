import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEY, closeIn, closeOut, closesFrom, keepCloses, localCloses, mergeCloses, savedAnyway, unsent } from "../src/drip/closes.js";

const memory = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};
const ME = "6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const THEM = "7f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

test("a close goes to the server as the day's plain facts, and comes back as the app holds it", () => {
  const row = closeOut(ME, "2026-11-04", { at: 1790000000000, pnl: 240, trades: 3 });
  assert.deepEqual(row, { user_id: ME, day: "2026-11-04", facts: { pnl: 240, trades: 3 } });
  assert.deepEqual(closeIn({ facts: { pnl: 240, trades: 3 }, closed_at: "2026-11-04T21:00:00Z" }), { pnl: 240, trades: 3, at: Date.parse("2026-11-04T21:00:00Z") });
  assert.deepEqual(Object.keys(closesFrom([{ day: "2026-11-03", facts: {}, closed_at: "2026-11-03T21:00:00Z" }])), ["2026-11-03"]);
  assert.deepEqual(closesFrom(null), {});
});

test("the server wins on a day both have, and this device's other days stay", () => {
  const all = mergeCloses({ "2026-11-03": { pnl: 1 } }, { "2026-11-03": { pnl: 2 }, "2026-11-02": { pnl: 3 } });
  assert.deepEqual(all, { "2026-11-03": { pnl: 1 }, "2026-11-02": { pnl: 3 } });
});

test("a save that failed goes up on the next visit, inside the days the server takes", () => {
  const local = { "2026-11-01": {}, "2026-11-03": {}, "2026-11-04": {} };
  assert.deepEqual(unsent(local, { "2026-11-04": {} }, "2026-11-04"), ["2026-11-03"]);
  assert.deepEqual(unsent({ "2026-10-31": {} }, {}, "2026-11-01"), ["2026-10-31"], "across a month end");
  assert.deepEqual(unsent(local, local, "2026-11-04"), []);
});

test("a retried close that's already there counts as saved; anything else doesn't", () => {
  assert.equal(savedAnyway(null), true);
  assert.equal(savedAnyway({ code: "23505" }), true);
  assert.equal(savedAnyway({ code: "42P01" }), false);
});

test("this device's copy belongs to whoever closed it", () => {
  const store = memory();
  keepCloses({ "2026-11-04": { pnl: 240 } }, ME, store);
  assert.deepEqual(localCloses(ME, store), { "2026-11-04": { pnl: 240 } });
  assert.deepEqual(localCloses(THEM, store), {}, "someone else on the same browser sees none of it");
  assert.deepEqual(localCloses(ME, memory({ [KEY]: '{"2026-11-01":{"pnl":1}}' })), { "2026-11-01": { pnl: 1 } }, "a copy from before it had an owner is kept");
  assert.deepEqual(localCloses(ME, memory({ [KEY]: "not json" })), {});
  const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  assert.doesNotThrow(() => keepCloses({}, ME, full));
});

test("the migration's table is what the app reads and writes", () => {
  const sql = readFileSync(new URL("../supabase/migrations-pending/20261104100000_drip_closes_cards_stage.sql", import.meta.url), "utf8");
  assert.match(sql, /create table[^;]*public\.closes/);
  for (const col of ["user_id", "day", "facts", "closed_at"]) assert.ok(sql.includes(col), col);
  const sync = readFileSync(new URL("../src/live/sync.js", import.meta.url), "utf8");
  assert.match(sync, /from\("closes"\)\.select\("day, facts, closed_at"\)/);
  assert.match(sync, /from\("closes"\)\.insert\(closeOut\(/);
  assert.ok(sync.includes('"closes", "card_links"];'), "closes go with Download my data");
});
