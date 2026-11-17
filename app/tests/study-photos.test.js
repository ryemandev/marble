import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PHOTOS, addPhoto, cleanPhoto, cleanPhotos, insertPhoto, isStored, pathChanges, photoPath, removePhoto, roomFor, setCaption, storedPaths, thumbOf, validPath,
} from "../src/views/study/attachments.js";
import { LIMIT, MAX_SIDE, MESSAGES, TARGET, THUMB_SIDE, fitSize, processImage, sniff } from "../src/views/study/image.js";
import { isEmptyPage } from "../src/views/study/model.js";
import { pageOut } from "../src/views/study/rows.js";
import { createOutbox } from "../src/views/study/outbox.js";

const U = "0b0b0b0b-1111-4222-8333-444455556666", P = "2b2b2b2b-1111-4222-8333-444455556666";
const id = (n) => `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const photo = (n, extra = {}) => ({ path: photoPath(U, P, id(n)), w: 2000, h: 1250, caption: null, t: 300 + n, ...extra });

/* ---------- The model ---------- */

test("paths: the trader's own folder for the page, the demo's memory, or a sample; and a small copy beside each", () => {
  assert.equal(photoPath(U, P, id(1)), `${U}/${P}/${id(1)}.webp`);
  assert.equal(photoPath(U, P, id(1), "jpg"), `${U}/${P}/${id(1)}.jpg`);
  assert.equal(photoPath("local", "pg1", "x1"), "local/pg1/x1.webp");
  assert.equal(thumbOf(`${U}/${P}/${id(1)}.webp`), `${U}/${P}/${id(1)}-t.webp`);
  assert.equal(thumbOf("sample/chart-fvg"), "sample/chart-fvg");
  for (const p of [`${U}/${P}/${id(1)}.webp`, "local/pg1/x1.jpg", "sample/chart-fvg"]) assert.ok(validPath(p), p);
  for (const p of ["../etc/passwd", `${U}/${id(1)}.webp`, `${U}/${P}/${id(1)}.png`, "https://evil.example/x.webp", `${U}/${P}/${id(1)}.webp?x`, "", null]) assert.equal(validPath(p), false, String(p));
  assert.equal(isStored("local/pg1/x1.webp"), false);
});

test("a photo is tidied: size, a short caption, the lesson's time in whole seconds; anything else is dropped", () => {
  assert.deepEqual(cleanPhoto({ path: photoPath(U, P, id(1)), w: 1999.6, h: "1250", caption: "  my   chart ", t: 330.9, extra: "x" }),
    { path: photoPath(U, P, id(1)), w: 2000, h: 1250, caption: "my chart", t: 330 });
  assert.equal(cleanPhoto({ path: photoPath(U, P, id(1)), w: 0, h: 10 }), null);
  assert.equal(cleanPhoto({ path: "nope", w: 10, h: 10 }), null);
  assert.equal(cleanPhoto({ path: photoPath(U, P, id(1)), w: 10, h: 10, caption: "x".repeat(400) }).caption.length, 140);
  assert.equal(cleanPhoto({ path: photoPath(U, P, id(1)), w: 10, h: 10, t: -5 }).t, null);
});

test("at most eight on a page, no repeats; taken out and put back where it was; captions", () => {
  let list = [];
  for (let n = 1; n <= 10; n++) list = addPhoto(list, photo(n));
  assert.equal(list.length, MAX_PHOTOS);
  assert.equal(roomFor(list), 0);
  assert.equal(addPhoto(list.slice(0, 2), photo(1)).length, 2, "the same photo isn't added twice");
  const out = removePhoto(list, photo(3).path);
  assert.equal(out.length, 7);
  assert.deepEqual(insertPhoto(out, 2, photo(3)).map((a) => a.path), list.map((a) => a.path));
  assert.equal(setCaption(list, photo(2).path, " The gap held ")[1].caption, "The gap held");
  assert.equal(cleanPhotos([photo(1), photo(1), { path: "bad" }, photo(2)]).length, 2);
});

test("a page with only a photo on it isn't empty", () => {
  assert.equal(isEmptyPage({ lines: [], attachments: [photo(1)], title: "" }, null), false);
  assert.equal(isEmptyPage({ lines: [], attachments: [], title: "" }, null), true);
});

test("what storage should drop and keep when pages change: each photo and its small copy", () => {
  const a = { id: "p1", attachments: [photo(1), photo(2)] }, b = { id: "p2", attachments: [photo(3), { path: "sample/chart-fvg", w: 1, h: 1 }] };
  assert.equal(storedPaths([a, b]).size, 6, "samples aren't in storage");
  const { gone, back } = pathChanges([a, b], [{ ...a, attachments: [photo(1)] }]);
  assert.deepEqual(gone.sort(), [photo(2).path, thumbOf(photo(2).path), photo(3).path, thumbOf(photo(3).path)].sort());
  assert.deepEqual(back, []);
  assert.deepEqual(pathChanges([{ ...a, attachments: [photo(1)] }], [a]).back.sort(), [photo(2).path, thumbOf(photo(2).path)].sort());
});

test("only photos in the trader's own folder are sent with the page", () => {
  const row = pageOut({ id: P, notebookId: "n", n: 1, lines: [], attachments: [photo(1), { path: "local/pg/x.webp", w: 5, h: 5 }, { path: "sample/chart-fvg", w: 5, h: 5 }] });
  assert.deepEqual(row.attachments.map((a) => a.path), [photo(1).path]);
});

/* ---------- Making a photo ready ---------- */

const bytes = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52],
  gif: [...Buffer.from("GIF89a"), 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  webp: [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")],
  heic: [0, 0, 0, 0x18, ...Buffer.from("ftypheic"), 0, 0, 0, 0],
  pdf: [...Buffer.from("%PDF-1.7 hello world")],
  exe: [0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0],
};
const file = (kind, { name = `photo.${kind}`, type = `image/${kind}`, size } = {}) => {
  const b = new Uint8Array(size ? Math.max(size, 16) : 4096);
  b.set(bytes[kind].slice(0, 16));
  return new Blob([b], { type }).constructor === Blob ? Object.assign(new Blob([b], { type }), { name }) : null;
};
const fakeIO = ({ w = 4032, h = 3024, decodes = true, bytesPerPixel = 0.5, webp = true } = {}) => {
  const calls = [];
  return {
    calls,
    decode: async () => { if (!decodes) throw new Error("can't decode"); return { width: w, height: h, close() { calls.push("close"); } }; },
    encode: async (img, W, H, q) => {
      calls.push([W, H, q]);
      const type = webp ? "image/webp" : "image/jpeg";
      return { blob: new Blob([new Uint8Array(Math.round(W * H * bytesPerPixel * q))], { type }), type };
    },
  };
};

test("a file is known by its first bytes, not its name", () => {
  const head = (k) => new Uint8Array(bytes[k]);
  assert.equal(sniff(head("jpeg")), "image/jpeg");
  assert.equal(sniff(head("png")), "image/png");
  assert.equal(sniff(head("gif")), "image/gif");
  assert.equal(sniff(head("webp")), "image/webp");
  assert.equal(sniff(head("heic")), "image/heic");
  assert.equal(sniff(head("pdf")), null);
  assert.equal(sniff(head("exe")), null);
  assert.equal(sniff(new Uint8Array(3)), null);
});

test("the size it's drawn at: at most 2000px on the long side, never larger than it was", () => {
  assert.deepEqual(fitSize(4032, 3024, MAX_SIDE), { w: 2000, h: 1500 });
  assert.deepEqual(fitSize(1440, 2560, MAX_SIDE), { w: 1125, h: 2000 });
  assert.deepEqual(fitSize(1080, 1920, MAX_SIDE), { w: 1080, h: 1920 });
  assert.deepEqual(fitSize(800, 600, MAX_SIDE), { w: 800, h: 600 });
  assert.deepEqual(fitSize(4032, 3024, THUMB_SIDE), { w: 480, h: 360 });
});

test("a phone photo is redrawn small (≤2000px, about 1 MB) with a small copy; the original is never what's kept", async () => {
  const io = fakeIO({ w: 4032, h: 3024, bytesPerPixel: 0.45 });
  const f = file("jpeg", { size: 6_000_000 });
  const out = await processImage(f, io);
  assert.ok(out.full.w <= MAX_SIDE && out.full.h <= MAX_SIDE, `${out.full.w}×${out.full.h}`);
  assert.ok(out.full.blob.size <= TARGET, `${out.full.blob.size}`);
  assert.ok(out.thumb.w <= THUMB_SIDE && out.thumb.blob.size < out.full.blob.size);
  assert.notEqual(out.full.blob, f, "a new picture, not the file");
  assert.equal(out.full.type, "image/webp");
  assert.ok(io.calls.includes("close"), "the decoded picture is let go");
});

test("a heavy picture goes down in quality, then in size, until it's about 1 MB", async () => {
  const io = fakeIO({ w: 2000, h: 2000, bytesPerPixel: 0.9 });
  const out = await processImage(file("png"), io);
  assert.ok(out.full.blob.size <= TARGET);
  assert.ok(out.full.w < 2000, "it had to be drawn smaller");
  const qs = io.calls.filter(Array.isArray).map((c) => c[2]);
  assert.deepEqual(qs.slice(0, 3), [0.86, 0.78, 0.7]);
});

test("where the browser can't write WebP, it's a JPEG", async () => {
  const out = await processImage(file("png"), fakeIO({ webp: false }));
  assert.equal(out.full.type, "image/jpeg");
});

test("anything that isn't a picture is turned away calmly; HEIC the browser can't open asks for a JPEG", async () => {
  await assert.rejects(processImage(file("pdf", { name: "chart.png", type: "image/png" }), fakeIO()), (e) => e.message === MESSAGES.type);
  await assert.rejects(processImage(file("exe", { name: "x.jpg", type: "image/jpeg" }), fakeIO()), (e) => e.message === MESSAGES.type);
  await assert.rejects(processImage(file("heic", { name: "IMG_0001.HEIC", type: "image/heic" }), fakeIO({ decodes: false })), (e) => e.message === MESSAGES.heic && /JPEG/.test(e.message));
  await assert.rejects(processImage(file("jpeg"), fakeIO({ decodes: false })), (e) => e.message === MESSAGES.broken);
  await assert.rejects(processImage(Object.assign(new Blob([]), { name: "empty.jpg" }), fakeIO()), (e) => e.message === MESSAGES.broken);
  await assert.rejects(processImage(file("jpeg", { size: 45_000_000 }), fakeIO()), (e) => e.message === MESSAGES.big);
});

test("HEIC this browser can open (Safari) is made ready like any other photo", async () => {
  const out = await processImage(file("heic", { name: "IMG_0001.HEIC", type: "image/heic" }), fakeIO());
  assert.equal(out.full.type, "image/webp");
  assert.ok(out.full.blob.size <= LIMIT);
});

/* ---------- Uploads and deletes through the outbox ---------- */

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const manual = () => { const due = []; return { setTimer: (f, ms) => { const t = { f, ms }; due.push(t); return t; }, clearTimer: (t) => { const i = due.indexOf(t); if (i >= 0) due.splice(i, 1); }, step: async () => { const t = due.shift(); if (t) await t.f(); }, due }; };

test("a photo goes up before the page that shows it, and leaves storage after its page", async () => {
  const sent = [], c = manual();
  const box = createOutbox({ storage: memory(), key: "k", send: async (t, k, b) => { sent.push(`${k} ${t}`); }, ...c, clock: () => 0 });
  box.put("pages", { id: P });
  box.put("storage", { id: photo(1).path, type: "image/webp" });
  box.del("storage", photo(2).path);
  box.del("pages", "gone-page");
  await c.step();
  assert.deepEqual(sent, ["put storage", "put pages", "del pages", "del storage"]);
});

test("a photo taken out waits for Undo's time before it's deleted, and Undo keeps it", async () => {
  let t = 0;
  const sent = [], c = manual();
  const box = createOutbox({ storage: memory(), key: "k", send: async (tb, k, b) => { sent.push(`${k} ${b.join()}`); }, ...c, clock: () => t });
  box.del("storage", "a", { after: 12000 });
  await c.step();
  assert.deepEqual(sent, [], "not before its time");
  assert.equal(box.status().pending, 1);
  assert.ok(box.cancelDel("storage", "a"), "Undo");
  assert.equal(box.status().pending, 0);
  box.del("storage", "b", { after: 12000 });
  t = 12001;
  while (c.due.length) await c.step();
  assert.deepEqual(sent, ["del b"]);
});

test("a photo taken out before it uploaded, then put back with Undo, still uploads", async () => {
  const sent = [], c = manual();
  const box = createOutbox({ storage: memory(), key: "k", send: async (tb, k, b) => { sent.push(`${k} ${tb}`); }, ...c, clock: () => 0 });
  box.put("storage", { id: "p.webp", type: "image/webp" });
  box.del("storage", "p.webp", { after: 12000 });
  assert.equal(box.waiting("storage", "p.webp"), false, "no longer waiting to go up");
  box.cancelDel("storage", "p.webp");
  assert.equal(box.waiting("storage", "p.webp"), true, "waiting to go up again");
  await c.step();
  assert.deepEqual(sent, ["put storage"]);
});

test("a photo the bucket refuses (too big, not a picture, no plan) is let go and reported; the page still saves", async () => {
  const refused = [], sent = [], c = manual();
  const send = async (t, k, rows) => { if (t === "storage") throw Object.assign(new Error("Payload too large"), { code: "22001" }); sent.push(t); };
  const box = createOutbox({ storage: memory(), key: "k", send, onRefused: (op) => refused.push(op.row.id), ...c, clock: () => 0 });
  box.put("storage", { id: "big.webp" });
  box.put("pages", { id: P });
  await c.step();
  assert.deepEqual(refused, ["big.webp"]);
  assert.deepEqual(sent, ["pages"]);
});

test("offline, a photo waits (with everything after it) and goes up once it can", async () => {
  let online = false;
  const sent = [], c = manual();
  const send = async (t) => { if (!online) throw new TypeError("Failed to fetch"); sent.push(t); };
  const box = createOutbox({ storage: memory(), key: "k", send, ...c, clock: () => 0, isOnline: () => online });
  box.put("storage", { id: "p.webp" });
  box.put("pages", { id: P });
  await c.step();
  assert.deepEqual(sent, []);
  assert.equal(box.status().waiting, true);
  online = true;
  await box.now();
  assert.deepEqual(sent, ["storage", "pages"]);
});
