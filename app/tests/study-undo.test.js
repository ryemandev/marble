import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteTrade, getState, setState, unlinkTrades } from "../src/store.js";
import { changePage, putBack, rememberTime, takeOutPhoto } from "../src/views/study/actions.js";
import { editLine, insertLine } from "../src/views/study/model.js";

const VIDEO = "9P-u7MWosFo";
const nb = { id: "nb1", title: "Price action", cover: null, position: 0, lastPage: 1, createdAt: "2026-10-20T09:00:00Z", updatedAt: "2026-10-20T09:00:00Z" };
const page = (id, n, over = {}) => ({
  id, notebookId: "nb1", n, title: "", videoId: VIDEO, videoTitle: null, videoChannel: null, videoLen: null, videoAt: 100, tradeId: null,
  lines: [], attachments: [], createdAt: `2026-10-2${n}T09:00:00Z`, updatedAt: `2026-10-2${n}T09:00:00Z`, ...over,
});
const first = page("pg1", 1, { title: "The open", lines: [{ t: 10, text: "Gap up", key: false }] });
const pagesNow = () => getState().pages.filter((p) => p.notebookId === "nb1");

test("Undo after clearing the only line on a new page brings the page back as it was", () => {
  const line = { t: 40, text: "one line on a new page", key: false };
  const fresh = page("pg2", 2, { lines: [line] });
  setState({ notebooks: [nb], pages: [first, fresh] });
  changePage(fresh, (p) => ({ lines: editLine(p.lines, 0, "") }));
  assert.deepEqual(pagesNow().map((p) => p.id), ["pg1"]);
  // Undo (what the notebook's "Line taken out." toast runs)
  putBack(fresh, (p) => ({ lines: insertLine(p.lines, 0, line) }));
  const back = pagesNow().find((p) => p.id === "pg2");
  assert.ok(back, "the page is back");
  assert.deepEqual(back.lines.map((l) => l.text), ["one line on a new page"]);
  assert.equal(back.n, 2);
  assert.equal(back.createdAt, fresh.createdAt);
  // On a page that's still there, Undo just puts the line back
  const two = page("pg2", 2, { lines: [line, { t: 50, text: "second", key: false }] });
  setState({ pages: [first, two] });
  changePage(two, (p) => ({ lines: editLine(p.lines, 0, "") }));
  putBack(two, (p) => ({ lines: insertLine(p.lines, 0, line) }));
  assert.deepEqual(pagesNow().find((p) => p.id === "pg2").lines.map((l) => l.text), ["one line on a new page", "second"]);
});

test("Undo after taking out the only photo on a new page brings the page back with it", () => {
  const photo = { path: "local/pg3/x1.webp", w: 2000, h: 1250, caption: null, t: 300 };
  const onlyPhoto = page("pg3", 2, { attachments: [photo] });
  setState({ notebooks: [nb], pages: [first, onlyPhoto] });
  assert.equal(takeOutPhoto(onlyPhoto, photo.path), true);
  assert.deepEqual(pagesNow().map((p) => p.id), ["pg1"]);
  getState().toast.action.run();
  const back = pagesNow().find((p) => p.id === "pg3");
  assert.ok(back, "the page is back");
  assert.deepEqual(back.attachments.map((a) => a.path), [photo.path]);
});

test("a deleted trade, or an import undone, leaves no page linked to it", () => {
  setState({ notebooks: [nb], pages: [page("pg1", 1, { tradeId: "T1", title: "a" }), page("pg2", 2, { tradeId: "T2", title: "b" }), page("pg4", 3, { tradeId: "T3", title: "c" })], logged: [{ id: "T1" }, { id: "T2" }, { id: "T3" }] });
  deleteTrade("T1");
  assert.deepEqual(pagesNow().map((p) => p.tradeId), [null, "T2", "T3"]);
  assert.deepEqual(getState().logged.map((t) => t.id), ["T2", "T3"]);
  unlinkTrades(new Set(["T2", "T9"]));
  assert.deepEqual(pagesNow().map((p) => p.tradeId), [null, null, "T3"]);
  const before = getState().pages;
  unlinkTrades(["T9"]);
  assert.equal(getState().pages, before, "nothing linked to it: nothing changes");
});

test("a lesson's place is kept only while the page still has the lesson the player was showing", () => {
  setState({ notebooks: [nb], pages: [first, page("pg2", 2, { title: "b", videoId: "NEWLESSON01", videoAt: 0 })] });
  rememberTime(page("pg2", 2, { title: "b", videoId: VIDEO, videoAt: 0 }), 1200);
  assert.equal(pagesNow().find((p) => p.id === "pg2").videoAt, 0);
  rememberTime(pagesNow().find((p) => p.id === "pg2"), 95);
  assert.equal(pagesNow().find((p) => p.id === "pg2").videoAt, 95);
});
