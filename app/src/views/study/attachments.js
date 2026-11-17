import { wholeSeconds } from "./model";

export const MAX_PHOTOS = 8; // on one page
export const MAX_CAPTION = 140;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STORED = new RegExp(`^${UUID}/${UUID}/${UUID}\\.(webp|jpg)$`, "i");
const LOCAL = new RegExp(`^local/[\\w-]+/[\\w-]+\\.(webp|jpg)$`);
const SAMPLE = /^sample\/[a-z0-9-]+$/;
export const validPath = (p) => typeof p === "string" && (STORED.test(p) || LOCAL.test(p) || SAMPLE.test(p));
export const isSample = (p) => SAMPLE.test(p || "");
export const isStored = (p) => STORED.test(p || "");

// The small copy shown on the page
export const thumbOf = (path) => (isSample(path) ? path : String(path).replace(/\.(webp|jpg)$/i, "-t.$1"));
export const photoPath = (owner, pageId, id, ext = "webp") => (owner === "local" ? `local/${pageId}/${id}.${ext}` : `${owner}/${pageId}/${id}.${ext}`);

const size = (v) => { const n = Math.round(+v); return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : null; };

// One photo, tidied; null if it isn't one
export function cleanPhoto(a) {
  if (!a || !validPath(a.path)) return null;
  const w = size(a.w), h = size(a.h);
  if (!w || !h) return null;
  const caption = String(a.caption ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CAPTION);
  return { path: a.path, w, h, caption: caption || null, t: wholeSeconds(a.t) };
}
export function cleanPhotos(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const a of list) {
    const c = cleanPhoto(a);
    if (c && !seen.has(c.path) && out.length < MAX_PHOTOS) { seen.add(c.path); out.push(c); }
  }
  return out;
}

export const roomFor = (list) => Math.max(0, MAX_PHOTOS - (list?.length || 0));
export function addPhoto(list, a) {
  const c = cleanPhoto(a);
  if (!c || (list || []).length >= MAX_PHOTOS || (list || []).some((x) => x.path === c.path)) return list || [];
  return [...(list || []), c];
}
export const removePhoto = (list, path) => (list || []).filter((x) => x.path !== path);
// Put a photo back where it was (undo)
export function insertPhoto(list, i, a) {
  const l = removePhoto(list, a.path);
  return cleanPhotos([...l.slice(0, i), a, ...l.slice(i)]);
}
export const setCaption = (list, path, caption) => (list || []).map((x) => (x.path === path ? cleanPhoto({ ...x, caption }) : x));

export function storedPaths(pages) {
  const out = new Set();
  for (const p of pages || []) for (const a of p.attachments || []) if (isStored(a.path)) { out.add(a.path); out.add(thumbOf(a.path)); }
  return out;
}
export function pathChanges(prevPages, nextPages) {
  const before = storedPaths(prevPages), after = storedPaths(nextPages);
  return { gone: [...before].filter((p) => !after.has(p)), back: [...after].filter((p) => !before.has(p)) };
}
