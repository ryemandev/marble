import { exampleBlocked, getState, setState, toast } from "../../store";
import { LIVE } from "../../mode";
import { NOW } from "../../data";
import { MAX_NB_TITLE, MAX_TITLE, isEmptyPage, isExample, nextN, pagesOf, wholeSeconds } from "./model";
import { MAX_PHOTOS, addPhoto, insertPhoto, photoPath, removePhoto, roomFor, setCaption } from "./attachments";
import { MESSAGES, processImage } from "./image";
import { owner, storePhoto } from "./media";

const iso = () => new Date().toISOString();
const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const newId = uuid;
const tidy = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export const studyNow = () => (LIVE ? Date.now() : new Date(NOW.year, NOW.month, NOW.day, 13, 52).getTime());

const meta = new Map();
const rememberMeta = (videoId, m) => { if (videoId) meta.set(videoId, { ...meta.get(videoId), ...m }); };
const metaOf = (videoId) => meta.get(videoId) || null;

/* ---------- Notebooks ---------- */

export function createNotebook({ title, cover }) {
  const id = uuid(), at = iso();
  setState((s) => ({ notebooks: [...s.notebooks, {
    id, title: tidy(title, MAX_NB_TITLE) || "Notebook", cover: cover || null, lastPage: 1, createdAt: at, updatedAt: at,
    position: s.notebooks.reduce((m, x) => Math.max(m, (x.position ?? 0) + 1), 0),
  }] }));
  return id;
}

export function updateNotebook(nb, change) {
  if (isExample(nb)) return exampleBlocked();
  const next = { ...change };
  if ("title" in next) next.title = tidy(next.title, MAX_NB_TITLE) || nb.title;
  setState((s) => ({ notebooks: s.notebooks.map((x) => (x.id === nb.id ? { ...x, ...next, updatedAt: iso() } : x)) }));
}

// Taking a notebook off the shelf takes its pages with it
export function deleteNotebook(nb) {
  if (isExample(nb)) return exampleBlocked();
  setState((s) => ({ notebooks: s.notebooks.filter((x) => x.id !== nb.id), pages: s.pages.filter((p) => p.notebookId !== nb.id) }));
}

export function setRibbon(nb, n) {
  if (!nb || isExample(nb) || nb.lastPage === n) return;
  setState((s) => ({ notebooks: s.notebooks.map((x) => (x.id === nb.id ? { ...x, lastPage: n, updatedAt: iso() } : x)) }));
}

/* ---------- Pages ---------- */

// alone: the page stands on its own, so sharing a video with the page before it doesn't make it empty
export function changePage(page, change, { quiet = false, alone = false } = {}) {
  const s0 = getState();
  const nb = (s0.example?.on ? s0.example.data.notebooks : s0.notebooks).find((x) => x.id === page.notebookId) || null;
  if (isExample(page) || isExample(nb)) { if (!quiet) exampleBlocked(); return false; }
  const at = iso();
  // A new session that has already been saved, by the words or the chart that got there first, is that session
  if (page.fresh && !(page.id && s0.pages.some((x) => x.id === page.id))) {
    const patch = typeof change === "function" ? change(page) : change;
    const { fresh, ...base } = page;
    const v = base.videoId ? metaOf(base.videoId) : null;
    setState((s) => {
      const written = pagesOf(s.pages, page.notebookId);
      const made = {
        ...base, id: base.id || uuid(), n: nextN(written), createdAt: at, updatedAt: at,
        videoTitle: base.videoTitle || v?.title || null, videoChannel: base.videoChannel || v?.channel || null, videoLen: base.videoLen ?? v?.len ?? null,
        ...patch,
      };
      if (isEmptyPage(made, null)) return {};
      return { pages: [...s.pages, made] };
    });
    return true;
  }
  setState((s) => {
    const p = s.pages.find((x) => x.id === page.id);
    if (!p) return {};
    const next = { ...p, ...(typeof change === "function" ? change(p) : change), updatedAt: at };
    const written = pagesOf(s.pages, p.notebookId);
    const i = written.findIndex((x) => x.id === p.id);
    if (i === written.length - 1 && isEmptyPage(next, alone ? null : written[i - 1])) return { pages: s.pages.filter((x) => x.id !== p.id) };
    return { pages: s.pages.map((x) => (x.id === p.id ? next : x)) };
  });
  return true;
}

// Taking a session away, with a way to put it back
export function deletePage(page) {
  if (isExample(page)) return exampleBlocked();
  setState((s) => ({ pages: s.pages.filter((p) => p.id !== page.id) }));
  undoable("Session deleted.", () => putBack(page, () => ({})));
}

export const setPageTitle = (page, title) => changePage(page, { title: tidy(title, MAX_TITLE) });
export const linkTrade = (page, tradeId) => changePage(page, { tradeId: tradeId || null });

export function setLesson(page, id, start = 0) {
  const v = id ? metaOf(id) : null;
  return changePage(page, id
    ? { videoId: id, videoTitle: v?.title || null, videoChannel: v?.channel || null, videoLen: v?.len ?? null, videoAt: wholeSeconds(start) || 0 }
    : { videoId: null, videoTitle: null, videoChannel: null, videoLen: null, videoAt: null });
}

export function rememberTime(page, t) {
  const x = wholeSeconds(t);
  if (!page || page.fresh || x == null || isExample(page)) return;
  const now = getState().pages.find((p) => p.id === page.id);
  if (!now || now.videoId !== page.videoId || Math.abs((now.videoAt ?? -99) - x) < 1) return;
  changePage(now, { videoAt: x }, { quiet: true, alone: true });
}

export function learnMeta(pages, videoId, m) {
  rememberMeta(videoId, m);
  for (const p of pages) {
    if (p.fresh || isExample(p) || p.videoId !== videoId) continue;
    if ((m.title && p.videoTitle !== m.title) || (m.channel && p.videoChannel !== m.channel) || (m.len && p.videoLen !== m.len)) {
      changePage(p, { videoTitle: m.title || p.videoTitle, videoChannel: m.channel || p.videoChannel, videoLen: m.len || p.videoLen }, { quiet: true, alone: true });
    }
  }
}

/* ---------- Photos ---------- */

const notebookOf = (page) => { const s0 = getState(); return (s0.example?.on ? s0.example.data.notebooks : s0.notebooks).find((x) => x.id === page.notebookId) || null; };

export async function addPhotos(page, files, t = null) {
  if (isExample(page) || isExample(notebookOf(page))) { exampleBlocked(); return 0; }
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return 0;
  const started = iso();
  const now0 = page.fresh ? [] : getState().pages.find((x) => x.id === page.id)?.attachments || [];
  const room = roomFor(now0);
  if (!room) { toast(MESSAGES.full, { warn: true }); return 0; }
  const take = list.slice(0, room);
  const ready = [];
  for (const f of take) {
    try { ready.push(await processImage(f)); } catch (e) { toast(e?.message || MESSAGES.broken, { warn: true, ms: 6000 }); }
  }
  if (!ready.length) return 0;
  let target = page;
  if (page.fresh) {
    const made = getState().pages.find((x) => x.id === page.id) || pagesOf(getState().pages, page.notebookId).find((x) => x.n === page.n && String(x.createdAt) >= started);
    target = made || { ...page, id: page.id || uuid() };
  }
  const added = [];
  let queued = false;
  for (const r of ready) {
    const path = photoPath(owner(), target.id, uuid(), r.full.type === "image/jpeg" ? "jpg" : "webp");
    const kept = await storePhoto(path, r.full, r.thumb);
    queued ||= !!kept?.queued;
    added.push({ path, w: r.full.w, h: r.full.h, caption: null, t: wholeSeconds(t) });
  }
  changePage(target, (p) => ({ ...(target.fresh ? { id: target.id } : {}), attachments: added.reduce((l, a) => addPhoto(l, a), p.attachments || []) }));
  if (list.length > take.length) { const n = list.length - take.length; toast(`A page holds ${MAX_PHOTOS} photos, so ${n} ${n === 1 ? "wasn't" : "weren't"} added.`, { warn: true }); }
  else if (queued) toast(added.length === 1 ? "Photo added. It uploads when you're back online." : "Photos added. They upload when you're back online.");
  return added.length;
}

export function takeOutPhoto(page, path) {
  const list = page.attachments || [];
  const i = list.findIndex((a) => a.path === path);
  if (i < 0) return false;
  const a = list[i];
  if (!changePage(page, (p) => ({ attachments: removePhoto(p.attachments, path) }))) return false;
  undoable("Photo taken out.", () => putBack(page, (p) => ({ attachments: insertPhoto(p.attachments, i, a) })));
  return true;
}

export const setPhotoCaption = (page, path, caption) => changePage(page, (p) => ({ attachments: setCaption(p.attachments, path, caption) }));

// A line taken away, with a way to put it back
export function undoable(text, undo) {
  toast(text, { action: { label: "Undo", run: undo } });
}

export function putBack(page, change) {
  const s0 = getState();
  if (!page?.id || s0.pages.some((x) => x.id === page.id)) return changePage({ ...page, fresh: false }, change);
  if (isExample(page) || !s0.notebooks.some((nb) => nb.id === page.notebookId)) return false;
  const { fresh, ...was } = page;
  setState((s) => (s.pages.some((x) => x.id === was.id) ? {} : { pages: [...s.pages, { ...was, updatedAt: iso() }] }));
  return true;
}
