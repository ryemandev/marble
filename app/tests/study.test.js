import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RULES, addLine, bookOf, cleanLine, cleanLines, clock, editLine, freshPage, insertLine, isEmptyPage, isExample, keyLessons,
  linkStart, nextN, notebookSummary, pageDate, pagesOf, parseClock, removeLine, ribbonOf, search, shelfCount, sortPages,
  stampFor, thisWeek, toggleKey, videoId, weekRange, wholeSeconds,
} from "../src/views/study/model.js";
import { studySample } from "../src/views/study/samples.js";

/* ---------- Times ---------- */

test("clock: seconds as m:ss, and h:mm:ss past the hour", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(5), "0:05");
  assert.equal(clock(341), "5:41");
  assert.equal(clock(341.9), "5:41");
  assert.equal(clock(1863), "31:03");
  assert.equal(clock(3600), "1:00:00");
  assert.equal(clock(3725), "1:02:05");
  for (const x of [null, undefined, "", -1, NaN, "x"]) assert.equal(clock(x), "", String(x));
});

test("parseClock reads what a trader types, and nothing else", () => {
  assert.equal(parseClock("12:44"), 764);
  assert.equal(parseClock(" 1:02:03 "), 3723);
  assert.equal(parseClock("90"), 90);
  assert.equal(parseClock("0:05"), 5);
  for (const x of ["", "12:4", "12:60", "1:2:3", "abc", "-5", "99:59:59", "999999"]) assert.equal(parseClock(x), null, x);
});

test("wholeSeconds keeps a time to whole seconds within a day, or none", () => {
  assert.equal(wholeSeconds(12.9), 12);
  assert.equal(wholeSeconds("30"), 30);
  assert.equal(wholeSeconds(999999), 86400);
  for (const x of [null, undefined, "", -3, "x", NaN]) assert.equal(wholeSeconds(x), null, String(x));
});

test("a YouTube link gives its video id and start time", () => {
  assert.equal(videoId("https://www.youtube.com/watch?v=ZVUDpCyvxfQ&t=90"), "ZVUDpCyvxfQ");
  assert.equal(videoId("https://youtu.be/9P-u7MWosFo?t=1m30s"), "9P-u7MWosFo");
  assert.equal(videoId("https://www.youtube.com/shorts/ZVUDpCyvxfQ"), "ZVUDpCyvxfQ");
  assert.equal(videoId("https://www.youtube-nocookie.com/embed/ZVUDpCyvxfQ"), "ZVUDpCyvxfQ");
  assert.equal(videoId("ZVUDpCyvxfQ"), "ZVUDpCyvxfQ");
  assert.equal(videoId("https://vimeo.com/123"), null);
  assert.equal(videoId("not a link"), null);
  assert.equal(linkStart("https://youtu.be/x?t=90"), 90);
  assert.equal(linkStart("https://youtu.be/x?t=1m30s"), 90);
  assert.equal(linkStart("https://youtu.be/x?t=1h2m3s"), 3723);
  assert.equal(linkStart("https://youtu.be/x"), 0);
});

/* ---------- Lines ---------- */

test("a new line keeps its time and words, tidied; empty words add nothing", () => {
  let lines = [];
  lines = addLine(lines, { text: "  Three candles.   Gap = wick 1 to wick 3. ", t: 31.7 });
  assert.deepEqual(lines, [{ t: 31, text: "Three candles. Gap = wick 1 to wick 3.", key: false }]);
  lines = addLine(lines, { text: "No lesson on this one", t: null });
  assert.equal(lines[1].t, null);
  assert.equal(addLine(lines, { text: "   ", t: 5 }), lines, "nothing for empty words");
  assert.equal(addLine(lines, { text: "x".repeat(900) })[2].text.length, 300, "typing stops at 300 characters");
});

test("changing a line's words keeps its time and star; clearing them takes it away; it can be put back", () => {
  const lines = [{ t: 10, text: "First", key: true }, { t: 20, text: "Second", key: false }];
  assert.deepEqual(editLine(lines, 0, "First, better"), [{ t: 10, text: "First, better", key: true }, lines[1]]);
  const gone = editLine(lines, 0, "  ");
  assert.deepEqual(gone, [lines[1]]);
  assert.deepEqual(insertLine(gone, 0, lines[0]), lines);
  assert.deepEqual(removeLine(lines, 1), [lines[0]]);
  assert.equal(editLine(lines, 5, "x"), lines, "no such line: nothing changes");
});

test("a star marks a key lesson and unmarks it", () => {
  const lines = [{ t: 1, text: "a", key: false }];
  const once = toggleKey(lines, 0);
  assert.equal(once[0].key, true);
  assert.equal(toggleKey(once, 0)[0].key, false);
  assert.equal(lines[0].key, false, "the original isn't changed");
});

test("lines from the server are tidied, and old long lines are never cut", () => {
  const long = "word ".repeat(1000).trim();
  assert.deepEqual(cleanLines([{ t: "12", text: "ok" }, { text: "" }, null, { t: -4, text: "no time", key: 1 }, { text: long }]),
    [{ t: 12, text: "ok", key: false }, { t: null, text: "no time", key: true }, { t: null, text: long, key: false }]);
  assert.deepEqual(cleanLines("nope"), []);
  assert.deepEqual(cleanLine({}), { t: null, text: "", key: false });
});

/* ---------- Timestamps ---------- */

test("the next line takes the lesson's time: live while it plays, else where it was left", () => {
  const page = { videoId: "ZVUDpCyvxfQ", videoAt: 341 };
  assert.equal(stampFor(page, 402.6), 402, "playing: the player's time");
  assert.equal(stampFor(page, null), 341, "paused or not started: where the page left it");
  assert.equal(stampFor({ videoId: "ZVUDpCyvxfQ", videoAt: null }, null), null, "never played: no time");
  assert.equal(stampFor({ videoId: null, videoAt: 50 }, 60), null, "no lesson: no time");
});

/* ---------- The book ---------- */

const P = (id, n, lines = [], extra = {}) => ({ id, notebookId: "nb", n, title: id, lines, createdAt: `2026-10-2${n % 10}T10:00:00.000Z`, ...extra });

test("pages run by number, then by when they were started (two phones writing the same page both keep theirs)", () => {
  const pages = [P("c", 3), P("a", 1), P("b2", 2, [], { createdAt: "2026-10-22T11:00:00.000Z" }), P("b1", 2, [], { createdAt: "2026-10-22T10:00:00.000Z" })];
  assert.deepEqual(sortPages(pages).map((p) => p.id), ["a", "b1", "b2", "c"]);
  assert.equal(nextN(pages), 4);
  assert.equal(nextN([]), 1);
  assert.deepEqual(pagesOf([...pages, { ...P("x", 1), notebookId: "other" }], "nb").map((p) => p.id), ["a", "b1", "b2", "c"]);
});

test("key lessons are gathered at the back in page order, saying where each came from", () => {
  const written = sortPages([
    P("p1", 1, [{ t: 10, text: "one", key: false }, { t: 20, text: "Key A", key: true }], { videoId: "ZVUDpCyvxfQ" }),
    P("p2", 2, [{ t: null, text: "Key B", key: true }, { t: 5, text: "", key: true }]),
  ]);
  const keys = keyLessons(written);
  assert.deepEqual(keys.map((k) => [k.text, k.page, k.t, k.li, k.pageId, k.videoId]), [["Key A", 1, 20, 1, "p1", "ZVUDpCyvxfQ"], ["Key B", 2, null, 0, "p2", null]]);
});

test("the book: written pages, one fresh page, then the key lessons (a page per twelve)", () => {
  const empty = bookOf([]);
  assert.deepEqual([empty.fresh, empty.keyFrom, empty.keyPages, empty.last], [1, 2, 1, 2]);
  const many = Array.from({ length: 7 }, (_, i) => P(`p${i + 1}`, i + 1, Array.from({ length: 3 }, (_, j) => ({ t: j, text: `l${j}`, key: true }))));
  const b = bookOf(many);
  assert.equal(b.keys.length, 21);
  assert.deepEqual([b.fresh, b.keyFrom, b.keyPages, b.last], [8, 9, 2, 10]);
  assert.equal(RULES, 12);
});

test("the fresh page carries on the lesson of the page before, and isn't saved until written on", () => {
  const written = [P("p1", 1, [], { videoId: "ZVUDpCyvxfQ", videoTitle: "FVG", videoLen: 596, videoAt: 341 })];
  const f = freshPage("nb", written);
  assert.equal(f.fresh, true);
  assert.equal(f.id, null);
  assert.equal(f.n, 2);
  assert.deepEqual([f.videoId, f.videoTitle, f.videoLen, f.videoAt], ["ZVUDpCyvxfQ", "FVG", 596, 341]);
  assert.equal(isEmptyPage({ ...f, lines: [] }, written[0]), true);
  assert.equal(isEmptyPage({ ...f, lines: [{ text: "x" }] }, written[0]), false);
  assert.equal(isEmptyPage({ ...f, title: "Notes" }, written[0]), false);
  assert.equal(isEmptyPage({ ...f, videoId: "9P-u7MWosFo" }, written[0]), false, "a lesson of its own is something");
});

/* ---------- The shelf ---------- */

const NOW = new Date(2026, 9, 27, 13, 52).getTime();
const sample = studySample({ now: NOW, trades: [{ id: "T1", symbol: "NQ", side: "long", pnl: 500, grade: "A" }] });

test("the sample shelf: five notebooks, their pages in order, one page linked to the NQ trade", () => {
  assert.equal(sample.notebooks.length, 5);
  const pa = pagesOf(sample.pages, sample.notebooks[0].id);
  assert.equal(pa.length, 7);
  assert.equal(pa[4].tradeId, "T1");
  assert.equal(sample.pages.filter((p) => p.tradeId).length, 1);
  const ex = studySample({ now: NOW, prefix: "ex-", example: true });
  assert.ok(ex.notebooks.every(isExample) && ex.pages.every(isExample), "the example desk's copies are marked");
  assert.ok(!sample.pages.some(isExample));
});

test("counts, and when each notebook was last written in", () => {
  const c = shelfCount(sample.pages);
  assert.equal(c.pages, sample.pages.length);
  assert.equal(c.keys, sample.pages.flatMap((p) => p.lines).filter((l) => l.key).length);
  const s = notebookSummary(sample.notebooks[0], sample.pages);
  assert.equal(s.pages, 7);
  assert.equal(s.keys, 8);
  assert.equal(pageDate(s.last, NOW), "Today");
});

test("where the ribbon is: the notebook used most recently, at the page it was left on", () => {
  const r = ribbonOf(sample.notebooks, sample.pages);
  assert.equal(r.notebook.title, "Price action");
  assert.equal(r.n, 7);
  assert.equal(r.page.title, "Rewatch, chart open");
  assert.equal(r.page.videoAt, 341);
  assert.equal(ribbonOf([], []), null);
  const past = ribbonOf([{ ...sample.notebooks[0], lastPage: 99 }], sample.pages);
  assert.equal(past.n, 8, "never past the fresh page");
  assert.equal(past.fresh, true);
});

test("search finds words on any page, in shelf order, with where they are", () => {
  const r = search(sample.notebooks, sample.pages, "midpoint");
  assert.ok(r.length >= 2);
  assert.deepEqual([r[0].nb.title, r[0].page], ["Price action", 1]);
  assert.ok(r.every((x) => /midpoint/i.test(x.text)));
  const two = search(sample.notebooks, sample.pages, "walk minutes");
  assert.deepEqual(two.map((x) => x.text), ["Two losses: walk away for 20 minutes."], "every word, any order");
  assert.equal(search(sample.notebooks, sample.pages, "Homework")[0].title, true, "page titles too");
  assert.deepEqual(search(sample.notebooks, sample.pages, "x"), [], "one letter isn't a search");
  assert.deepEqual(search(sample.notebooks, sample.pages, "zzzz"), []);
  assert.equal(search(sample.notebooks, sample.pages, "e", 3).length, 0);
  assert.equal(search(sample.notebooks, sample.pages, "the", 3).length, 3, "a limit");
});

test("this week: key lessons on pages from the last seven days, oldest first", () => {
  const week = thisWeek(sample.notebooks, sample.pages, NOW);
  assert.ok(week.length > 0);
  for (const k of week) assert.ok(NOW - Date.parse(k.createdAt) <= 7 * 864e5, k.text);
  const all = sample.notebooks.flatMap((nb) => keyLessons(pagesOf(sample.pages, nb.id)));
  assert.ok(week.length < all.length, "older pages are left out");
  const times = week.map((k) => k.createdAt);
  assert.deepEqual(times, [...times].sort());
  assert.ok(!week.some((k) => k.text.startsWith("Absorption")), "Order flow's page from two weeks ago isn't this week");
  assert.equal(weekRange(NOW), "20–27 Oct");
  assert.equal(weekRange(new Date(2026, 10, 3).getTime()), "27 Oct – 3 Nov");
});

test("page dates read as a person would say them", () => {
  assert.equal(pageDate(new Date(2026, 9, 27, 9).toISOString(), NOW), "Today");
  assert.equal(pageDate(new Date(2026, 9, 26, 23).toISOString(), NOW), "Yesterday");
  assert.equal(pageDate(new Date(2026, 9, 20, 12).toISOString(), NOW), "Tue 20 Oct");
  assert.equal(pageDate(null, NOW), "");
});
