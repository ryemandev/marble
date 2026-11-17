import { readFirm } from "./catalog";

const FILES = import.meta.glob("./firms/*.json", { import: "default" });
const cache = new Map();

export function loadFirm(slug) {
  const file = FILES[`./firms/${slug}.json`];
  if (!file) return Promise.resolve(null);
  if (!cache.has(slug)) cache.set(slug, file().then(readFirm).catch((e) => { cache.delete(slug); throw e; }));
  return cache.get(slug);
}
const ready = new Map();
export const loadedFirm = (slug) => ready.get(slug) || null;
export const loadFirmNow = (slug) => loadFirm(slug).then((f) => { if (f) ready.set(slug, f); return f; });
