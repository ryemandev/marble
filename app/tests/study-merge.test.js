import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSIVE, applyPending, changedColumns, mergeLines, mergePhotos, mergeRow, micros, newer, pageIn, pageOut } from "../src/views/study/rows.js";
import { baseOf, createSaver } from "../src/views/study/saver.js";
import { createOutbox } from "../src/views/study/outbox.js";

const NB = "11111111-1111-4111-8111-111111111111", PG = "22222222-2222-4222-8222-222222222222", PG2 = "33333333-3333-4333-8333-333333333333";
const TRADE = "55555555-5555-4555-8555-555555555555", GONE = "66666666-6666-4666-8666-666666666666";
const U = "0b0b0b0b-1111-4222-8333-444455556666";
const L = (text, t = null, key = false) => ({ t, text, key });
const words = (lines) => lines.map((l) => l.text);
const photo = (n, caption = null) => ({ path: `${U}/${PG}/${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`, w: 2000, h: 1250, caption, t: null });
// A page as the app sends it
const row = (over = {}) => ({
  id: PG, notebook_id: NB, n: 5, title: "Opening drive", video_id: "9P-u7MWosFo", video_title: "Market Mechanics", video_channel: "Brad Goh",
  video_len: 1863, video_at: 100, trade_id: null, lines: [], attachments: [], ...over,
});

/* ---------- Lines, photos and rows ---------- */

test("lines: what was written on each copy is kept, this copy's after the other's", () => {
  const base = [L("Gap up", 10)];
  const server = [L("Gap up", 10), L("phone 1", 40), L("phone 2", 50)];
  const mine = [L("Gap up", 10), L("desktop", 60)];
  assert.deepEqual(words(mergeLines(server, mine, base)), ["Gap up", "phone 1", "phone 2", "desktop"]);
});

test("lines: a line taken out or changed here goes from the server's copy too, in its place", () => {
  const base = [L("a", 1), L("b", 2), L("c", 3)];
  const server = [L("a", 1), L("b", 2), L("c", 3), L("there", 9)];
  // b changed here, c taken out here
  assert.deepEqual(words(mergeLines(server, [L("a", 1), L("b, better", 2)], base)), ["a", "b, better", "there"]);
  assert.deepEqual(words(mergeLines([L("a", 1), L("c", 3)], base, base)), ["a", "c"]);
  assert.deepEqual(words(mergeLines([L("a", 1), L("x", 2), L("b", 2), L("c", 3)], [L("a", 1), L("b!", 2), L("c", 3)], base)), ["a", "x", "b!", "c"]);
});

test("lines: a save that went before its answer was lost isn't written twice", () => {
  const base = [L("a", 1)];
  const mine = [L("a", 1), L("b", 2)];
  assert.deepEqual(words(mergeLines(mine, mine, base)), ["a", "b"]);
  assert.deepEqual(words(mergeLines(mine, [...mine, L("c", 3)], base)), ["a", "b", "c"]);
});

test("lines: a star changed here stays changed; one changed on the other copy stays too", () => {
  const base = [L("a", 1), L("b", 2)];
  const server = [L("a", 1, true), L("b", 2)]; // starred there
  const mine = [L("a", 1), L("b", 2, true)]; // starred here
  assert.deepEqual(mergeLines(server, mine, base).map((l) => l.key), [true, true]);
  // unstarred here
  assert.deepEqual(mergeLines([L("a", 1, true)], [L("a", 1)], [L("a", 1, true)]).map((l) => l.key), [false]);
});

test("lines: without the copy it was made from, every line from both is kept", () => {
  assert.deepEqual(words(mergeLines([L("a"), L("there")], [L("a"), L("here")])), ["a", "there", "here"]);
});

test("photos: added on either copy, taken out here, a caption changed here; never more than eight", () => {
  const base = [photo(1), photo(2)];
  const server = [photo(1), photo(2), photo(3)];
  const mine = [photo(1, "the open"), photo(4)]; // 2 taken out, 1 captioned, 4 added
  const out = mergePhotos(server, mine, base);
  assert.deepEqual(out.map((a) => a.path), [photo(1).path, photo(3).path, photo(4).path]);
  assert.equal(out[0].caption, "the open");
  const many = Array.from({ length: 8 }, (_, i) => photo(i + 10));
  assert.equal(mergePhotos(many, [photo(30)], []).length, 8);
});

test("a row: a column changed here wins, one changed only elsewhere stays as the server has it", () => {
  const base = row({ title: "Opening drive", n: 5 });
  const server = row({ title: "Opening drive, renamed on the phone", trade_id: TRADE });
  const mine = row({ video_at: 300, lines: [L("new here")] });
  const out = mergeRow(server, mine, base);
  assert.equal(out.title, "Opening drive, renamed on the phone");
  assert.equal(out.trade_id, TRADE);
  assert.equal(out.video_at, 300);
  assert.deepEqual(words(out.lines), ["new here"]);
  const { trade_id, ...noLink } = row({ title: "Mine" });
  assert.equal(mergeRow(server, noLink, base).trade_id, TRADE);
});

test("passive changes are the lesson's place and details and the ribbon; nothing else", () => {
  assert.deepEqual(changedColumns(row(), row({ video_at: 400 })), ["video_at"]);
  assert.deepEqual(changedColumns(row(), row({ video_title: "T", video_len: 9 })), ["video_title", "video_len"]);
  assert.ok(changedColumns(row(), row({ video_at: 400, lines: [L("x")] })).some((c) => !PASSIVE.pages.includes(c)));
  assert.deepEqual(changedColumns(row(), row()), []);
  assert.deepEqual(PASSIVE.notebooks, ["last_page"]);
});

test("a page linked to a trade that isn't loaded here leaves the link out of its row", () => {
  const page = pageIn({ ...row({ trade_id: GONE }), created_at: "2026-10-29T10:00:00Z" });
  assert.equal(pageOut(page).trade_id, GONE, "trades not known yet: sent as it is");
  assert.equal("trade_id" in pageOut(page, new Set([TRADE])), false);
  assert.equal(pageOut({ ...page, tradeId: TRADE }, new Set([TRADE])).trade_id, TRADE);
  assert.equal(pageOut({ ...page, tradeId: null }, new Set([TRADE])).trade_id, null, "unlinking is sent");
});

test("server times compare to the microsecond", () => {
  assert.ok(newer("2026-10-29T10:00:00.000002+00:00", "2026-10-29T10:00:00.000001+00:00"));
  assert.ok(newer("2026-10-29T10:00:00.2+00:00", "2026-10-29T10:00:00.12+00:00"));
  assert.ok(newer("2026-10-29T10:00:01+00:00", "2026-10-29T10:00:00.999999+00:00"));
  assert.equal(micros("2026-10-29T10:00:00.5+00:00") - micros("2026-10-29T10:00:00+00:00"), 500000);
});

test("an old offline save is merged with the newer server row at load, never laid over it", () => {
  const before = { ...row({ lines: [L("first", 5)] }), created_at: "2026-10-20T09:00:00Z", updated_at: "2026-10-26T18:00:00.000001+00:00" };
  const server = { ...row({ lines: [L("first", 5), ...[1, 2, 3, 4, 5].map((i) => L(`desktop ${i}`, 100 + i))] }), created_at: before.created_at, updated_at: "2026-10-28T21:00:00.000004+00:00" };
  const op = { table: "pages", kind: "put", row: row({ lines: [L("first", 5), L("phone line 1", 60), L("phone line 2", 70)] }), at: "2026-10-27T08:30:00Z", base: baseOf("pages", before) };
  const out = applyPending([{ id: NB, title: "Price action" }], [pageIn(server)], [op]);
  assert.deepEqual(words(out.pages[0].lines), ["first", "desktop 1", "desktop 2", "desktop 3", "desktop 4", "desktop 5", "phone line 1", "phone line 2"]);
  // Made from the copy the server still has: laid on as it is
  const same = applyPending([{ id: NB }], [pageIn(before)], [op]);
  assert.deepEqual(words(same.pages[0].lines), ["first", "phone line 1", "phone line 2"]);
});

test("a waiting passive save at load changes only its columns", () => {
  const server = { ...row({ lines: [L("kept")], title: "Renamed elsewhere" }), created_at: "2026-10-20T09:00:00Z", updated_at: "2026-10-28T21:00:00Z" };
  const out = applyPending([{ id: NB }], [pageIn(server)], [{ table: "pages", kind: "patch", id: PG, cols: { video_at: 777 }, at: "2026-10-27T08:30:00Z", base: { at: "old" } }]);
  assert.equal(out.pages[0].videoAt, 777);
  assert.equal(out.pages[0].title, "Renamed elsewhere");
  assert.deepEqual(words(out.pages[0].lines), ["kept"]);
  // ...and nothing for a row that isn't there
  assert.equal(applyPending([{ id: NB }], [], [{ table: "pages", kind: "patch", id: PG2, cols: { video_at: 1 } }]).pages.length, 0);
});

/* ---------- Writing to the database ---------- */

function fakeDb({ deny = false } = {}) {
  let tick = 0;
  const stamp = () => `2026-10-29T10:00:00.${String(++tick).padStart(6, "0")}+00:00`;
  const tables = {}, calls = [];
  const from = (table) => {
    const t = (tables[table] ||= new Map());
    let op = null, payload = null, single = false;
    const filters = [];
    const q = {
      select() { if (!op) op = "select"; return q; },
      upsert(rows) { op = "upsert"; payload = rows; return q; },
      update(cols) { op = "update"; payload = cols; return q; },
      delete() { op = "delete"; return q; },
      eq(k, v) { filters.push((r) => r[k] === v); return q; },
      in(k, vs) { filters.push((r) => vs.includes(r[k])); return q; },
      maybeSingle() { single = true; return q; },
      then(ok, no) { return Promise.resolve().then(run).then(ok, no); },
    };
    const run = () => {
      calls.push(`${op} ${table}${filters.length > 1 ? " checked" : ""}`);
      const match = [...t.values()].filter((r) => filters.every((f) => f(r)));
      if (op === "select") return { data: single ? match[0] ?? null : match, error: null };
      if (op === "update") {
        if (deny) return { data: [], error: null };
        return { data: match.map((r) => { const n = { ...r, ...payload, updated_at: stamp() }; t.set(r.id, n); return n; }), error: null };
      }
      if (op === "upsert") return { data: payload.map((r) => { const at = stamp(); const n = { created_at: at, ...t.get(r.id), ...r, updated_at: at }; t.set(r.id, n); return n; }), error: null };
      match.forEach((r) => t.delete(r.id));
      return { data: null, error: null };
    };
    return q;
  };
  return { from, tables, calls, stamp };
}
function device(db) {
  const bases = new Map(), merged = [];
  const saver = createSaver({ db, bases: () => bases, onMerged: (table, op, r) => merged.push(r) });
  const due = [];
  const box = createOutbox({
    storage: { getItem: () => null, setItem() {}, removeItem() {} }, key: "k",
    send: (table, kind, body, list) => (kind === "del" ? saver.del(table, body) : kind === "patch" ? saver.patch(table, list) : saver.put(table, list)),
    setTimer: (f) => { due.push(f); return f; }, clearTimer: (f) => { const i = due.indexOf(f); if (i >= 0) due.splice(i, 1); },
  });
  const run = async () => { for (let i = 0; due.length && i < 20; i++) await due.shift()(); };
  return { bases, merged, box, run, saver };
}
// The server holds a page; a device loads it
function served(db, over = {}) {
  const at = db.stamp();
  db.tables.pages = new Map([[PG, { ...row(over), created_at: at, updated_at: at }]]);
  return db.tables.pages.get(PG);
}

test("a tab with an old copy pausing the lesson changes only where it was left: newer notes stay", async () => {
  const db = fakeDb();
  const desktop = device(db);
  desktop.bases.set(`pages:${PG}`, baseOf("pages", served(db, { lines: [L("old line", 5)] })));
  // The phone writes six lines on page 5
  await db.from("pages").update({ lines: [L("old line", 5), ...[1, 2, 3, 4, 5, 6].map((i) => L(`phone ${i}`, 10 * i))] }).eq("id", PG);
  // The desktop, open since the morning, pauses the lesson there
  desktop.box.patch("pages", PG, { video_at: 300 }, { base: desktop.bases.get(`pages:${PG}`) });
  await desktop.run();
  const now = db.tables.pages.get(PG);
  assert.equal(now.lines.length, 7, "the phone's lines are all still there");
  assert.equal(now.video_at, 300);
  assert.equal(desktop.box.status().pending, 0);
});

test("a line written in a tab with an old copy is merged with the newer server row, and shown merged", async () => {
  const db = fakeDb();
  const desktop = device(db);
  const base = baseOf("pages", served(db, { lines: [L("old line", 5)], title: "Opening drive" }));
  await db.from("pages").update({ lines: [L("old line", 5), L("phone 1", 10), L("phone 2", 20)], title: "Renamed on the phone" }).eq("id", PG);
  desktop.box.put("pages", row({ lines: [L("old line", 5), L("desktop", 30)] }), { base });
  await desktop.run();
  const now = db.tables.pages.get(PG);
  assert.deepEqual(words(now.lines), ["old line", "phone 1", "phone 2", "desktop"]);
  assert.equal(now.title, "Renamed on the phone", "the title wasn't changed here, so the phone's stays");
  assert.equal(desktop.merged.length, 1, "the merged page is shown here");
  assert.equal(desktop.bases.get(`pages:${PG}`).at, now.updated_at, "and is what the next change here is based on");
  assert.deepEqual(db.calls.filter((c) => c.startsWith("update")), ["update pages", "update pages checked", "update pages checked"]);
});

test("a save made from the copy the server still has is written straight over it; the next one follows on", async () => {
  const db = fakeDb();
  const tab = device(db);
  const base = baseOf("pages", served(db, { lines: [L("a")] }));
  db.calls.length = 0;
  tab.box.put("pages", row({ lines: [L("a"), L("b")] }), { base });
  await tab.run();
  tab.box.put("pages", row({ lines: [L("a"), L("b"), L("c")] }), { base: tab.bases.get(`pages:${PG}`) });
  await tab.run();
  assert.deepEqual(words(db.tables.pages.get(PG).lines), ["a", "b", "c"]);
  assert.deepEqual(db.calls, ["update pages checked", "update pages checked"], "no merge needed");
  assert.equal(tab.merged.length, 0);
});

test("a change made while the save before it is on its way is moved onto the copy that save left", async () => {
  const db = fakeDb();
  const bases = new Map();
  const saver = createSaver({ db, bases: () => bases });
  let release;
  const gate = new Promise((r) => { release = r; });
  const due = [];
  const box = createOutbox({
    storage: { getItem: () => null, setItem() {}, removeItem() {} }, key: "k",
    send: async (table, kind, body, list) => { await gate; return saver.put(table, list); },
    setTimer: (f) => { due.push(f); return f; }, clearTimer: () => {},
  });
  const base = baseOf("pages", served(db, { lines: [L("a")] }));
  box.put("pages", row({ lines: [L("a"), L("b")] }), { base });
  const first = due.shift()();
  await new Promise((r) => setTimeout(r, 0));
  box.put("pages", row({ lines: [L("a"), L("b"), L("c")] }), { base }); // typed while "b" is on its way
  assert.equal(box.pending()[0].base.at, base.at);
  release();
  await first;
  assert.equal(box.pending()[0].base.at, db.tables.pages.get(PG).updated_at, "moved onto what the first save left");
  db.calls.length = 0;
  while (due.length) await due.shift()();
  assert.deepEqual(words(db.tables.pages.get(PG).lines), ["a", "b", "c"]);
  assert.deepEqual(db.calls, ["update pages checked"], "written straight over it, no merge");
});

test("a page taken out on another device is put back by what was written here", async () => {
  const db = fakeDb();
  const tab = device(db);
  const base = baseOf("pages", served(db, { lines: [L("a")] }));
  await db.from("pages").delete().in("id", [PG]);
  tab.box.put("pages", row({ lines: [L("a"), L("written here")] }), { base, createdAt: "2026-10-20T09:00:00Z" });
  await tab.run();
  assert.deepEqual(words(db.tables.pages.get(PG).lines), ["a", "written here"]);
});

test("the paywall saying no to a change is a refusal, not a merge", async () => {
  const db = fakeDb({ deny: true });
  const bases = new Map();
  const saver = createSaver({ db, bases: () => bases });
  const base = baseOf("pages", served(db, { lines: [L("a")] }));
  await assert.rejects(saver.put("pages", [{ k: `pages:${PG}`, row: row({ lines: [L("a"), L("b")] }), base }]), (e) => e.code === "42501");
  // a passive change just doesn't happen, quietly
  await saver.patch("pages", [{ id: PG, cols: { video_at: 5 }, base }]);
});

test("new rows go up together, each with when it was made (a page written offline keeps its date)", async () => {
  const db = fakeDb();
  const bases = new Map();
  const saver = createSaver({ db, bases: () => bases });
  const out = await saver.put("pages", [
    { row: row({ id: PG, lines: [L("a")] }), base: null, createdAt: "2026-10-27T08:30:00Z", at: "2026-10-27T08:31:00Z" },
    { row: row({ id: PG2, n: 6 }), base: null, createdAt: null, at: "2026-10-27T08:32:00Z" },
  ]);
  assert.deepEqual(db.calls, ["upsert pages"]);
  assert.equal(db.tables.pages.get(PG).created_at, "2026-10-27T08:30:00Z");
  assert.equal(db.tables.pages.get(PG2).created_at, "2026-10-27T08:32:00Z", "no date of its own: when it was saved here");
  assert.equal(out.get(PG).at, db.tables.pages.get(PG).updated_at);
  assert.equal(bases.get(`pages:${PG2}`).at, db.tables.pages.get(PG2).updated_at);
});
