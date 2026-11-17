import { supabase } from "../../live/supabase";
import { getState, loadState, setState, toast } from "../../store";
import { createOutbox } from "./outbox";
import { isExample } from "./model";
import { pathChanges, removePhoto, thumbOf } from "./attachments";
import { configureMedia, mediaChanged } from "./media";
import { delBlob, getBlob, lasting, putBlob } from "./blobs";
import { NOTEBOOK_COLUMNS, PAGE_COLUMNS, PASSIVE, applyPending, changedColumns, newer, notebookIn, notebookOut, pageIn, pageOut } from "./rows";
import { baseOf, createSaver } from "./saver";

const BUCKET = "study";
const UNDO_MS = 12000;
const RELOAD_MS = 30000;
function storageError(error) {
  const status = +(error?.statusCode || error?.status || 0), msg = String(error?.message || "");
  if (status === 403 || /row-level security|unauthori[sz]ed/i.test(msg)) return Object.assign(new Error(msg), { code: "42501" });
  if (status === 413 || status === 415 || /mime|too large|exceeded|invalid/i.test(msg)) return Object.assign(new Error(msg), { code: "22001" });
  return Object.assign(new Error(msg || "Couldn't reach storage"), { status });
}
const already = (error) => +(error?.statusCode || 0) === 409 || /already exists|duplicate/i.test(String(error?.message || ""));

async function upload(rows) {
  for (const r of rows) {
    const blob = await getBlob(r.id);
    if (!blob) throw Object.assign(new Error("This photo isn't in this browser any more"), { code: "22000" });
    const { error } = await supabase.storage.from(BUCKET).upload(r.id, blob, { contentType: r.type || blob.type, upsert: false, cacheControl: "31536000" });
    if (error && !already(error)) throw storageError(error);
    await delBlob(r.id);
  }
  mediaChanged();
}

let uid = null;
let box = null;
let bases = new Map();
let loaded = false;
let lastLoad = 0;

const saver = createSaver({ db: supabase, bases: () => bases, onMerged: show });

function show(table, o, row) {
  const waiting = box?.pending().find((x) => x.k === o.k);
  if (waiting && waiting.v !== o.v) return;
  const key = table === "pages" ? "pages" : "notebooks";
  const list = getState()[key] || [];
  const x = (table === "pages" ? pageIn : notebookIn)(row);
  if (!list.some((y) => y.id === x.id)) return;
  loadState({ [key]: list.map((y) => (y.id === x.id ? { ...x, createdAt: y.createdAt || x.createdAt } : y)) });
}

const store = (() => {
  const mem = new Map();
  const ls = () => { try { return window.localStorage; } catch { return null; } };
  return {
    getItem: (k) => { try { return ls()?.getItem(k) ?? mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
    setItem: (k, v) => { mem.set(k, v); try { ls()?.setItem(k, v); } catch {} },
    removeItem: (k) => { mem.delete(k); try { ls()?.removeItem(k); } catch {} },
  };
})();

function outboxFor(id) {
  if (box && uid === id) return box;
  box?.stop();
  uid = id;
  bases = new Map();
  loaded = false;
  box = createOutbox({
    storage: store,
    key: `marble-study-outbox:${id}`,
    send: async (table, kind, body, list) => {
      if (table === "storage") {
        if (kind === "put") return upload(body);
        const { error } = await supabase.storage.from(BUCKET).remove(body);
        if (error) throw storageError(error);
        await Promise.all(body.map((p) => delBlob(p)));
        return;
      }
      if (kind === "del") return saver.del(table, body);
      return kind === "patch" ? saver.patch(table, list) : saver.put(table, list);
    },
    onRefused: refused,
    onStatus: (s) => { const was = getState().studySync; if (!was || was.pending !== s.pending || was.waiting !== s.waiting) loadState({ studySync: s }); mediaChanged(); },
  });
  const ob = box;
  configureMedia({
    owner: id,
    getBlob,
    pending: (path) => ob.waiting("storage", path),
    async upload(path, full, thumb) {
      await putBlob(path, full.blob);
      await putBlob(thumbOf(path), thumb.blob);
      ob.put("storage", { id: path, type: full.type });
      ob.put("storage", { id: thumbOf(path), type: thumb.type });
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline && !(await lasting())) toast("You're offline. Keep Marble open until you're back online, or this photo won't upload.", { warn: true, ms: 9000 });
      return { queued: offline };
    },
    async sign(paths) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      return new Map((data || []).filter((x) => x.signedUrl && !x.error).map((x) => [x.path, x.signedUrl]));
    },
  });
  return box;
}

let reloading = false;
async function refresh() {
  if (!uid || !loaded || reloading || document.visibilityState !== "visible" || navigator.onLine === false) return;
  if (Date.now() - lastLoad < RELOAD_MS) return;
  const el = document.activeElement;
  if (el?.closest?.(".sp") && el.matches?.("input, textarea, [contenteditable]")) return;
  reloading = true;
  try { await studyReload(); } finally { reloading = false; }
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { box?.now(); refresh(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") box?.now(); else refresh(); });
}

// Every row of a table, a thousand at a time
async function every(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

function lazy(make) {
  let v = null;
  const get = () => (v ??= make());
  return { get notebooks() { return get().notebooks; }, get pages() { return get().pages; }, get studySync() { return get().studySync; }, get studyError() { return get().studyError; } };
}

function rebuild(nbs, pgs, sent) {
  const next = new Map();
  for (const r of nbs) next.set(`notebooks:${r.id}`, baseOf("notebooks", r));
  for (const r of pgs) next.set(`pages:${r.id}`, baseOf("pages", r));
  for (const o of sent) {
    if (o.kind === "del") { next.delete(o.k); continue; }
    const mine = bases.get(o.k), theirs = next.get(o.k);
    if (mine && (!theirs || newer(mine.at, theirs.at))) next.set(o.k, mine);
  }
  bases = next;
}

async function fetchStudy(id) {
  const ob = outboxFor(id);
  const mark = ob.mark();
  lastLoad = Date.now();
  try {
    const [nbs, pgs] = await Promise.all([
      every(() => supabase.from("notebooks").select(NOTEBOOK_COLUMNS).order("position").order("created_at").order("id")),
      every(() => supabase.from("pages").select(PAGE_COLUMNS).order("notebook_id").order("n").order("created_at").order("id")),
    ]);
    setTimeout(() => ob.now(), 0);
    return { ok: true, patch: lazy(() => {
      const sent = ob.sentSince(mark);
      rebuild(nbs, pgs, sent);
      const merged = applyPending(nbs.map(notebookIn), pgs.map(pageIn), [...sent, ...ob.pending()]);
      loaded = true;
      return { notebooks: merged.notebooks, pages: merged.pages, studySync: ob.status(), studyError: null };
    }) };
  } catch (e) {
    console.warn("Marble couldn't load Study:", e?.message || e);
    return { ok: false, patch: lazy(() => {
      const s = getState();
      // Already showing: it stays as it is
      if (loaded) return { notebooks: s.notebooks, pages: s.pages, studySync: ob.status(), studyError: s.studyError ?? null };
      const merged = applyPending([], [], ob.pending());
      return { notebooks: merged.notebooks, pages: merged.pages, studySync: ob.status(), studyError: e?.code || "load" };
    }) };
  }
}

export async function studyLoad(id) {
  return (await fetchStudy(id)).patch;
}
export async function studyReload() {
  if (!uid) return false;
  const { ok, patch } = await fetchStudy(uid);
  loadState(patch);
  return ok;
}

function diff(prev = [], next = []) {
  const before = new Map(prev.map((x) => [x.id, x]));
  const after = new Set(next.map((x) => x.id));
  return {
    upserts: next.filter((x) => before.get(x.id) !== x && !isExample(x)).map((x) => [x, before.get(x.id)]),
    removed: prev.filter((x) => !after.has(x.id) && !isExample(x)).map((x) => x.id),
  };
}

let known = { logged: null, ids: null };
const tradesOf = (s) => {
  if (!s.me) return null;
  if (known.logged !== s.logged) known = { logged: s.logged, ids: new Set((s.logged || []).map((t) => t.id)) };
  return known.ids;
};

// Called by live/sync.js for every change to the store
export function studyChanged(prev, next, id) {
  if (!id || (prev.notebooks === next.notebooks && prev.pages === next.pages)) return;
  const ob = outboxFor(id);
  const trades = tradesOf(next);
  const save = (table, out) => ([x, was]) => {
    const k = `${table}:${x.id}`, row = out(x, trades);
    if (was) {
      const cols = changedColumns(out(was, trades), row);
      if (!cols.length) return; // nothing the server keeps has changed
      if (cols.every((c) => PASSIVE[table].includes(c))) return ob.patch(table, x.id, Object.fromEntries(cols.map((c) => [c, row[c]])), { base: bases.get(k) });
    }
    ob.put(table, row, { createdAt: x.createdAt, base: bases.get(k) });
  };
  const nb = diff(prev.notebooks, next.notebooks), pg = diff(prev.pages, next.pages);
  nb.upserts.forEach(save("notebooks", notebookOut));
  pg.upserts.forEach(save("pages", pageOut));
  pg.removed.forEach((x) => ob.del("pages", x));
  nb.removed.forEach((x) => ob.del("notebooks", x));
  if (prev.pages !== next.pages) {
    const { gone, back } = pathChanges(prev.pages, next.pages);
    back.forEach((p) => ob.cancelDel("storage", p));
    gone.forEach((p) => ob.del("storage", p, { after: Date.now() + UNDO_MS }));
  }
}

let told = 0;
function refused(op, e) {
  console.warn("Marble couldn't save to Study:", e?.code, e?.message);
  if (op.table === "storage") {
    if (op.kind !== "put") return;
    delBlob(op.row?.id);
    if (/-t\.(webp|jpg)$/.test(op.row?.id || "")) return; // its small copy: the photo itself says so
    const path = String(op.row?.id || "");
    const page = getState().pages.find((p) => (p.attachments || []).some((a) => a.path === path));
    if (page) setState((s) => ({ pages: s.pages.map((p) => (p.id === page.id ? { ...p, attachments: removePhoto(p.attachments, path), updatedAt: new Date().toISOString() } : p)) }));
    toast("That photo couldn't be saved, so it's off the page.", { warn: true, ms: 8000 });
    return;
  }
  // Where a lesson was left, or the ribbon: nothing worth saying
  if (op.kind === "patch") return;
  const dead = op.table === "pages" && op.kind === "put" ? op.row?.trade_id : null;
  if (dead && (e?.code === "42501" || e?.code === "23503")) {
    const waiting = box?.pending().find((x) => x.k === op.k);
    if (waiting?.kind === "del") return;
    if (waiting?.kind !== "put" || waiting.row.trade_id === dead) {
      const row = waiting?.kind === "put" ? waiting.row : { ...op.row, ...waiting?.cols };
      box.put("pages", { ...row, trade_id: null }, { createdAt: op.createdAt, base: op.base });
    }
    const pages = getState().pages;
    if (pages.some((p) => p.tradeId === dead)) loadState({ pages: pages.map((p) => (p.tradeId === dead ? { ...p, tradeId: null } : p)) });
    return;
  }
  clearTimeout(told);
  told = setTimeout(async () => {
    const back = await studyReload().catch(() => false);
    toast(back ? "Marble couldn't save that page, so it's back to how it was." : "Marble couldn't save that page. Check your connection and try again.", { warn: true, ms: 6000 });
  }, 250);
}
