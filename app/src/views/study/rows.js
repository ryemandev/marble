import { MAX_LINES, MAX_NB_TITLE, MAX_TITLE, cleanLines, videoId as parseVideoId, wholeSeconds } from "./model";
import { MAX_PHOTOS, cleanPhotos, isStored } from "./attachments";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v) => typeof v === "string" && UUID.test(v);
const text = (v, max) => { const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max); return s || null; };
const COVER = /^[a-z0-9/_-]{1,80}$/;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const NOTEBOOK_COLUMNS = "id, title, cover, position, last_page, created_at, updated_at";
export const PAGE_COLUMNS = "id, notebook_id, n, title, video_id, video_title, video_channel, video_len, video_at, trade_id, lines, attachments, created_at, updated_at";
export const PASSIVE = { notebooks: ["last_page"], pages: ["video_at", "video_title", "video_channel", "video_len"] };

export const notebookIn = (r) => ({
  id: r.id, title: r.title, cover: r.cover || null, position: r.position ?? 0, lastPage: r.last_page ?? 1,
  createdAt: r.created_at, updatedAt: r.updated_at || r.created_at,
});
export const notebookOut = (nb) => ({
  id: nb.id, title: text(nb.title, MAX_NB_TITLE) || "Notebook", cover: COVER.test(nb.cover || "") ? nb.cover : null,
  position: Math.max(0, Math.round(+nb.position || 0)), last_page: Math.min(9999, Math.max(1, Math.round(+nb.lastPage || 1))),
});

export const pageIn = (r) => ({
  id: r.id, notebookId: r.notebook_id, n: r.n, title: r.title || "", videoId: r.video_id || null, videoTitle: r.video_title || null,
  videoChannel: r.video_channel || null, videoLen: r.video_len ?? null, videoAt: r.video_at ?? null, tradeId: r.trade_id || null,
  lines: cleanLines(r.lines), attachments: cleanPhotos(r.attachments), createdAt: r.created_at, updatedAt: r.updated_at || r.created_at,
});
export const pageOut = (p, trades = null) => {
  const row = {
    id: p.id, notebook_id: p.notebookId, n: Math.min(9999, Math.max(1, Math.round(+p.n || 1))), title: text(p.title, MAX_TITLE) || "",
    video_id: parseVideoId(p.videoId) === p.videoId ? p.videoId : null, video_title: text(p.videoTitle, 200), video_channel: text(p.videoChannel, 120),
    video_len: wholeSeconds(p.videoLen), video_at: wholeSeconds(p.videoAt), trade_id: isId(p.tradeId) ? p.tradeId : null,
    lines: cleanLines(p.lines),
    attachments: cleanPhotos(p.attachments).filter((a) => isStored(a.path)),
  };
  if (trades && row.trade_id && !trades.has(row.trade_id)) delete row.trade_id;
  return row;
};

// The columns two copies of a row differ in
export const changedColumns = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k]));

export function micros(iso) {
  const s = String(iso || ""), ms = Date.parse(s.replace(/\.\d+/, ""));
  if (Number.isNaN(ms)) return 0;
  return ms * 1000 + +`${/\.(\d+)/.exec(s)?.[1] || ""}000000`.slice(0, 6);
}
export const newer = (a, b) => micros(a) > micros(b);

/* ---------- Two copies of one row ---------- */

const lineKey = (l) => `${l.t ?? ""}|${l.text}`;
const counts = (lines) => lines.reduce((m, l) => m.set(lineKey(l), (m.get(lineKey(l)) || 0) + 1), new Map());

export function mergeLines(server, mine, base = null) {
  const S = cleanLines(server), M = cleanLines(mine), B = base ? cleanLines(base) : null;
  const inM = counts(M), inB = B ? counts(B) : null;
  const gone = new Map();
  if (inB) for (const [k, n] of inB) if (n > (inM.get(k) || 0)) gone.set(k, n - (inM.get(k) || 0));
  const out = S.map((l) => {
    const k = lineKey(l), drop = gone.get(k) > 0;
    if (drop) gone.set(k, gone.get(k) - 1);
    return { l: { ...l }, k, drop };
  });
  const kept = counts(out.filter((x) => !x.drop).map((x) => x.l)), add = new Map();
  for (const [k, n] of inM) {
    const wrote = inB ? n - (inB.get(k) || 0) : n;
    const need = Math.min(wrote, n - (kept.get(k) || 0));
    if (need > 0) add.set(k, need);
  }
  const theirs = (x) => !x.drop && !inM.has(x.k) && !inB?.has(x.k); // written on the other copy only
  let at = -1;
  for (const l of M) {
    const k = lineKey(l);
    const i = out.findIndex((x, j) => j > at && !x.drop && x.k === k);
    if (i >= 0) { at = i; continue; }
    if (!(add.get(k) > 0)) continue;
    add.set(k, add.get(k) - 1);
    let j = at + 1;
    while (j < out.length && theirs(out[j])) j++;
    out.splice(j, 0, { l: { ...l }, k, drop: false });
    at = j;
  }
  const starM = new Map(M.map((l) => [lineKey(l), l.key]));
  const starB = B ? new Map(B.map((l) => [lineKey(l), l.key])) : null;
  const lines = out.filter((x) => !x.drop).map((x) => x.l);
  for (const l of lines) {
    const k = lineKey(l);
    if (!starM.has(k)) continue;
    if (starB ? starB.has(k) && starB.get(k) !== starM.get(k) : starM.get(k)) l.key = starM.get(k);
  }
  return lines.slice(0, MAX_LINES);
}

export function mergePhotos(server, mine, base = null) {
  const S = cleanPhotos(server), M = cleanPhotos(mine), B = base ? cleanPhotos(base) : null;
  const find = (list, p) => list?.find((a) => a.path === p) || null;
  const out = [];
  for (const a of S) {
    const m = find(M, a.path), b = find(B, a.path);
    if (b && !m) continue;
    out.push(m && (!b || !same(m, b)) ? m : a);
  }
  for (const a of M) if (!find(out, a.path) && !find(B, a.path)) out.push(a);
  return out.slice(0, MAX_PHOTOS);
}

export function mergeRow(server, mine, base = null) {
  const out = { ...server };
  for (const k of Object.keys(mine)) {
    if (k === "id" || k === "lines" || k === "attachments") continue;
    if (!base || !same(mine[k], base[k])) out[k] = mine[k];
  }
  if ("lines" in mine) out.lines = mergeLines(server.lines, mine.lines, base?.lines ?? null);
  if ("attachments" in mine) out.attachments = mergePhotos(server.attachments, mine.attachments, base?.attachments ?? null);
  return out;
}

export function applyPending(notebooks, pages, ops) {
  const nbs = new Map(notebooks.map((x) => [x.id, x]));
  const pgs = new Map(pages.map((x) => [x.id, x]));
  const now = new Date().toISOString();
  for (const op of ops) {
    const into = op.table === "notebooks" ? nbs : op.table === "pages" ? pgs : null;
    if (!into) continue;
    if (op.kind === "del") { into.delete(op.id); continue; }
    const [rowIn, rowOut] = op.table === "notebooks" ? [notebookIn, notebookOut] : [pageIn, pageOut];
    const id = op.kind === "patch" ? op.id : op.row.id;
    const before = into.get(id);
    if (op.kind === "patch" && !before) continue;
    const server = before ? rowOut(before) : null;
    const row = op.kind === "patch" ? { ...server, ...op.cols }
      : !server ? op.row
      : op.base && op.base.at === before.updatedAt ? { ...server, ...op.row }
      : mergeRow(server, op.row, op.base?.row ?? null);
    const x = rowIn({ created_at: now, ...row });
    into.set(x.id, { ...x, createdAt: before?.createdAt || op.createdAt || x.createdAt, updatedAt: op.at || now });
  }
  // A page whose notebook is gone has nowhere to show
  return { notebooks: [...nbs.values()], pages: [...pgs.values()].filter((p) => nbs.has(p.notebookId)) };
}
