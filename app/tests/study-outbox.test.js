import { test } from "node:test";
import assert from "node:assert/strict";
import { createOutbox, waitable } from "../src/views/study/outbox.js";
import { applyPending, notebookIn, notebookOut, pageIn, pageOut } from "../src/views/study/rows.js";

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
// Timers the test runs by hand
const clock = () => {
  const due = [];
  return {
    setTimer: (f, ms) => { const t = { f, ms }; due.push(t); return t; },
    clearTimer: (t) => { const i = due.indexOf(t); if (i >= 0) due.splice(i, 1); },
    step: async () => { const t = due.shift(); if (t) await t.f(); },
    run: async () => { for (let i = 0; due.length && i < 50; i++) { const t = due.shift(); await t.f(); } },
    next: () => due[0]?.ms,
    count: () => due.length,
  };
};
const NB = "11111111-1111-4111-8111-111111111111", PG = "22222222-2222-4222-8222-222222222222", PG2 = "33333333-3333-4333-8333-333333333333";

test("many changes to one page while it waits are sent once, as the newest", async () => {
  const sent = [], c = clock(), storage = memory();
  const box = createOutbox({ storage, key: "k", send: async (table, kind, body) => { sent.push([table, kind, body]); }, ...c });
  box.put("pages", { id: PG, title: "F" });
  box.put("pages", { id: PG, title: "Fa" });
  box.put("pages", { id: PG, title: "Fair value" });
  assert.equal(box.status().pending, 1);
  assert.equal(c.count(), 1, "one timer, pushed back by each change");
  await c.run();
  assert.deepEqual(sent, [["pages", "put", [{ id: PG, title: "Fair value" }]]]);
  assert.equal(box.status().pending, 0);
  assert.equal(storage.getItem("k"), null, "nothing left in the browser once sent");
});

test("a notebook goes before its pages, and pages are taken out before their notebook", async () => {
  const sent = [], c = clock();
  const box = createOutbox({ storage: memory(), key: "k", send: async (t, k, b) => { sent.push(`${k} ${t} ${b.length}`); }, ...c });
  box.put("pages", { id: PG, notebook_id: NB });
  box.put("notebooks", { id: NB });
  box.del("pages", PG2);
  box.del("notebooks", "44444444-4444-4444-8444-444444444444");
  await c.run();
  assert.deepEqual(sent, ["put notebooks 1", "put pages 1", "del pages 1", "del notebooks 1"]);
});

test("offline: everything is kept in the browser and tried again, then sent when the connection is back", async () => {
  let online = false;
  const sent = [], c = clock(), storage = memory(), statuses = [];
  const send = async (t, k, b) => { if (!online) throw Object.assign(new TypeError("Failed to fetch"), { code: "" }); sent.push(b[0].title); };
  const box = createOutbox({ storage, key: "k", send, ...c, isOnline: () => online, onStatus: (s) => statuses.push(s) });
  box.put("pages", { id: PG, title: "Written on the train" });
  await c.step();
  // the first try failed and a retry is waiting
  assert.equal(c.next(), 2000);
  assert.equal(box.status().pending, 1);
  assert.equal(box.status().waiting, true);
  assert.ok(JSON.parse(storage.getItem("k")).length === 1, "kept in the browser");
  const again = createOutbox({ storage, key: "k", send, ...clock(), isOnline: () => online });
  assert.equal(again.pending().length, 1);
  assert.equal(again.pending()[0].row.title, "Written on the train");
  online = true;
  await again.now();
  assert.deepEqual(sent, ["Written on the train"]);
  assert.equal(again.status().pending, 0);
  assert.equal(storage.getItem("k"), null);
  assert.ok(statuses.some((s) => s.waiting));
});

test("a save that can't get through is tried again less often each time: 2s, 5s, 15s, 30s, then every minute", async () => {
  const c = clock();
  const box = createOutbox({ storage: memory(), key: "k", send: async () => { throw Object.assign(new Error("Service Unavailable"), { status: 503 }); }, ...c });
  box.put("pages", { id: PG });
  const waits = [];
  for (let i = 0; i < 7; i++) { waits.push(c.next()); await c.step(); }
  assert.deepEqual(waits, [700, 2000, 5000, 15000, 30000, 60000, 60000]);
  assert.equal(box.status().pending, 1, "never dropped");
  await box.now();
  assert.equal(box.status().pending, 1);
});

test("a save the database refuses is let go and reported; the others still go", async () => {
  const sent = [], refused = [], c = clock();
  const send = async (t, k, rows) => {
    if (rows.some((r) => r.title === "bad")) throw Object.assign(new Error("violates check constraint"), { code: "23514" });
    sent.push(...rows.map((r) => r.title));
  };
  const box = createOutbox({ storage: memory(), key: "k", send, onRefused: (op, e) => refused.push([op.row.title, e.code]), ...c });
  box.put("pages", { id: PG, title: "good" });
  box.put("pages", { id: PG2, title: "bad" });
  await c.run();
  assert.deepEqual(sent, ["good"]);
  assert.deepEqual(refused, [["bad", "23514"]]);
  assert.equal(box.status().pending, 0);
});

test("a change made while a save is on its way is kept and sent after it", async () => {
  let release;
  const sent = [], c = clock();
  const send = (t, k, rows) => new Promise((r) => { sent.push(rows[0].title); release = r; });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const box = createOutbox({ storage: memory(), key: "k", send, ...c });
  box.put("pages", { id: PG, title: "one" });
  const first = c.step();
  await tick();
  box.put("pages", { id: PG, title: "two" }); // typed while "one" is on its way
  release();
  await first;
  assert.equal(box.status().pending, 1, "the newer change is still waiting");
  const second = c.step();
  await tick();
  release();
  await second;
  assert.deepEqual(sent, ["one", "two"]);
  assert.equal(box.status().pending, 0);
});

test("what waits counts as a dropped connection, and what's refused", () => {
  assert.equal(waitable({ name: "TypeError", message: "Failed to fetch" }), true);
  assert.equal(waitable({ code: "PGRST205", message: "Could not find the table 'public.pages'" }), true, "tables not there yet");
  assert.equal(waitable({ code: "PGRST301", message: "JWT expired" }), true);
  assert.equal(waitable({ status: 503 }), true);
  assert.equal(waitable({ code: "23514" }), false);
  assert.equal(waitable({ code: "23503" }), false);
  assert.equal(waitable({ code: "22001" }), false);
  assert.equal(waitable({ code: "42501" }), false);
  assert.equal(waitable({ code: "23514" }, false), true, "offline: always wait");
});

/* ---------- Rows ---------- */

test("a page to a row and back keeps everything, and only the right things are sent", () => {
  const page = {
    id: PG, notebookId: NB, n: 3, title: "  Imbalance,   the auction view ", videoId: "9P-u7MWosFo", videoTitle: "Market Mechanics", videoChannel: "Brad Goh",
    videoLen: 1863.4, videoAt: 341.8, tradeId: "ex-T1", lines: [{ t: 72.5, text: " An FVG is a one-sided auction. ", key: false }, { text: "" }],
  };
  const row = pageOut(page);
  assert.deepEqual(row, {
    id: PG, notebook_id: NB, n: 3, title: "Imbalance, the auction view", video_id: "9P-u7MWosFo", video_title: "Market Mechanics", video_channel: "Brad Goh",
    video_len: 1863, video_at: 341, trade_id: null, lines: [{ t: 72, text: "An FVG is a one-sided auction.", key: false }], attachments: [],
  });
  assert.equal(pageOut({ ...page, videoId: "https://evil" }).video_id, null);
  assert.equal(pageOut({ ...page, videoId: "short" }).video_id, null);
  assert.equal(pageOut({ ...page, tradeId: "55555555-5555-4555-8555-555555555555" }).trade_id, "55555555-5555-4555-8555-555555555555");
  const back = pageIn({ ...row, created_at: "2026-10-22T10:00:00Z", updated_at: "2026-10-22T11:00:00Z" });
  assert.equal(back.notebookId, NB);
  assert.equal(back.title, "Imbalance, the auction view");
  assert.deepEqual(back.lines, row.lines);
});

test("a notebook to a row and back", () => {
  const row = notebookOut({ id: NB, title: "  Price   action ", cover: "gods/apollo-light", position: 2, lastPage: 7 });
  assert.deepEqual(row, { id: NB, title: "Price action", cover: "gods/apollo-light", position: 2, last_page: 7 });
  assert.equal(notebookOut({ id: NB, title: "", cover: "../../evil" }).cover, null);
  assert.equal(notebookOut({ id: NB, title: "" }).title, "Notebook");
  assert.deepEqual(notebookIn({ ...row, created_at: "a", updated_at: "b" }), { id: NB, title: "Price action", cover: "gods/apollo-light", position: 2, lastPage: 7, createdAt: "a", updatedAt: "b" });
});

test("after a load, saves still waiting in the browser are laid over what the server sent", () => {
  const server = { notebooks: [notebookIn({ id: NB, title: "Old", created_at: "2026-10-01T00:00:00Z" })], pages: [pageIn({ id: PG, notebook_id: NB, n: 1, title: "Server", lines: [], created_at: "2026-10-01T00:00:00Z" })] };
  const ops = [
    { table: "pages", kind: "put", row: { id: PG, notebook_id: NB, n: 1, title: "Offline edit", lines: [{ t: 3, text: "kept", key: true }] }, at: "2026-10-29T10:00:00Z" },
    { table: "pages", kind: "put", row: { id: PG2, notebook_id: NB, n: 2, title: "Written on the train", lines: [] }, at: "2026-10-29T10:01:00Z", createdAt: "2026-10-29T09:59:00Z" },
    { table: "notebooks", kind: "put", row: { id: NB, title: "Renamed", last_page: 2 }, at: "2026-10-29T10:02:00Z" },
  ];
  const out = applyPending(server.notebooks, server.pages, ops);
  assert.equal(out.notebooks[0].title, "Renamed");
  assert.equal(out.notebooks[0].createdAt, "2026-10-01T00:00:00Z", "keeps when it was made");
  const pages = Object.fromEntries(out.pages.map((p) => [p.id, p]));
  assert.equal(pages[PG].title, "Offline edit");
  assert.equal(pages[PG].lines[0].key, true);
  assert.equal(pages[PG2].title, "Written on the train");
  assert.equal(pages[PG2].createdAt, "2026-10-29T09:59:00Z");
  const out2 = applyPending(server.notebooks, server.pages, [{ table: "pages", kind: "del", id: PG }]);
  assert.equal(out2.pages.length, 0);
  const out3 = applyPending(server.notebooks, server.pages, [{ table: "notebooks", kind: "del", id: NB }]);
  assert.deepEqual([out3.notebooks.length, out3.pages.length], [0, 0]);
});

test("a passive change is sent as just its columns, after the whole rows", async () => {
  const sent = [], c = clock();
  const box = createOutbox({ storage: memory(), key: "k", send: async (t, k, b) => { sent.push([t, k, b]); }, ...c });
  box.patch("pages", PG, { video_at: 300 }, { base: { at: "t1" } });
  box.patch("pages", PG, { video_title: "Market Mechanics" });
  box.put("pages", { id: PG2, title: "Another page" });
  box.patch("notebooks", NB, { last_page: 4 }, { base: { at: "t0" } });
  assert.equal(box.status().pending, 3, "two patches to one page are one");
  assert.equal(box.pending().find((o) => o.k === `pages:${PG}`).base.at, "t1", "made from the first one's copy");
  await c.run();
  assert.deepEqual(sent, [
    ["notebooks", "patch", [{ id: NB, last_page: 4 }]],
    ["pages", "put", [{ id: PG2, title: "Another page" }]],
    ["pages", "patch", [{ id: PG, video_at: 300, video_title: "Market Mechanics" }]],
  ]);
});

test("a passive change to a page whose save is waiting goes with that save; one to a page being taken out is dropped", async () => {
  const sent = [], c = clock();
  const box = createOutbox({ storage: memory(), key: "k", send: async (t, k, b) => { sent.push([k, b]); }, ...c });
  box.put("pages", { id: PG, title: "Fair value", video_at: 10 }, { base: { at: "t1" } });
  box.patch("pages", PG, { video_at: 95 });
  assert.equal(box.pending().length, 1);
  assert.equal(box.pending()[0].kind, "put");
  assert.equal(box.pending()[0].base.at, "t1");
  box.del("pages", PG2);
  box.patch("pages", PG2, { video_at: 5 });
  await c.run();
  assert.deepEqual(sent, [["put", [{ id: PG, title: "Fair value", video_at: 95 }]], ["del", [PG2]]]);
});

test("a save keeps the copy it was made from; once it goes, the next is made from the copy it left", async () => {
  const c = clock(), lists = [];
  const send = async (t, k, body, list) => { lists.push(list.map((o) => o.base?.at ?? null)); return new Map(body.map((r) => [r.id, { at: `after-${r.title}`, row: r }])); };
  const box = createOutbox({ storage: memory(), key: "k", send, ...c });
  box.put("pages", { id: PG, title: "one" }, { base: { at: "server" } });
  box.put("pages", { id: PG, title: "two" }, { base: { at: "ignored: a save is still waiting" } });
  await c.run();
  box.put("pages", { id: PG, title: "three" }, { base: { at: "after-two" } });
  await c.run();
  assert.deepEqual(lists, [["server"], ["after-two"]]);
  box.put("pages", { id: PG2, title: "x" }, { base: { at: "s2" } });
  box.del("pages", PG2);
  box.cancelDel("pages", PG2);
  assert.equal(box.pending().find((o) => o.k === `pages:${PG2}`).base.at, "s2");
});

test("what was sent after a mark is listed, for a load that was on its way meanwhile", async () => {
  const c = clock();
  const box = createOutbox({ storage: memory(), key: "k", send: async () => {}, ...c });
  box.put("pages", { id: PG, title: "before" });
  await c.run();
  const mark = box.mark();
  box.put("pages", { id: PG2, title: "during" });
  box.del("pages", PG);
  await c.run();
  assert.deepEqual(box.sentSince(mark).map((o) => `${o.kind} ${o.row?.title || o.id}`), ["put during", `del ${PG}`]);
  assert.deepEqual(box.sentSince(box.mark()), []);
});
