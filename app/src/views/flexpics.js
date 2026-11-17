import { useSyncExternalStore } from "react";
import { SAMPLE, art } from "../data";
import { LIVE } from "../mode";
import { getState } from "../store";

// The pictures a flex card can wear: the library on shelves, and the trader's own, which stay on
// this device. Every trade wears one: the one the trader picked for it, or its own by default.
const shelf = (folder, names) => names.split(" ").map((n) => `${folder}/${n}`);
export const SHELVES = [
  ["masters", "Old masters", shelf("masters", "narcissus-caravaggio calling-of-matthew-caravaggio jerome-writing-caravaggio joseph-carpenter-la-tour magdalen-la-tour self-portrait-rembrandt charging-chasseur-gericault pale-horse-dore colossus-goya stag-at-sharkeys-bellows both-members-bellows wanderer-friedrich sower-millet yasumasa-flute-yoshitoshi crow-kyosai")],
  ["anime", "Anime", shelf("anime", "ronin samurai-duel night-figure night-girl kabuto moon-reflection")],
  ["japan", "Japan", [...shelf("japan", "torii-tunnel ryu brush-hand"), ...shelf("prints", "great-wave-hokusai red-fuji-hokusai storm-below-fuji-hokusai night-rain-karasaki-hiroshige sudden-shower-atake-hiroshige evening-snow-kanbara-hiroshige kajikazawa-hokusai ejiri-hokusai kirifuri-waterfall-hokusai mystical-bird-hokusai ghosts-of-the-taira-kuniyoshi hakkenden-kuniyoshi")]],
  ["cars", "Cars", shelf("cars", "porsche-rear porsche-911-black porsche-wing ferrari-rear ferrari-night ferrari-black ferrari-curves aston-dbs aston-road aston-front porsche-headlight ferrari-wheel aston-badge")],
  ["money", "Money", shelf("money", "franklin-eyes cash-bricks hundreds-spread franklin-portrait")],
  ["textures", "Textures", shelf("textures", "liquid-metal chrome-ripple kintsugi marble-rose")],
];
// What a card wears unless the trader picks. Paintings, anime and Japan only, since a car or a stack
// of cash under a losing day reads wrong, and only pictures that stay clean on the White finish.
const ROTATION = [
  ...shelf("masters", "self-portrait-rembrandt jerome-writing-caravaggio magdalen-la-tour wanderer-friedrich charging-chasseur-gericault sower-millet yasumasa-flute-yoshitoshi crow-kyosai"),
  ...shelf("anime", "ronin samurai-duel kabuto"),
  ...shelf("japan", "ryu brush-hand"),
  ...shelf("prints", "great-wave-hokusai storm-below-fuji-hokusai evening-snow-kanbara-hiroshige kajikazawa-hokusai ejiri-hokusai kirifuri-waterfall-hokusai mystical-bird-hokusai"),
];
const LIBRARY = new Set(SHELVES.flatMap((s) => s[2]));
export const shelfOf = (id) => (isOwn(id) ? "yours" : SHELVES.find((s) => s[2].includes(id))?.[0] || SHELVES[0][0]);

/* ---------- Which picture a trade wears ---------- */

const hash = (text) => [...String(text)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const monthOf = (t) => t.month || String(t.date || "").split(" ")[0];
const poolOf = (t) => (LIVE ? getState().logged : [...getState().logged, ...(SAMPLE.TRADES || [])]).filter((x) => monthOf(x) === monthOf(t));
const order = (x) => x.traded_at || `${String(x.day).padStart(2, "0")} ${x.time || ""}`;

// The month's trades in order each take the next picture, stepping through the rotation from a
// start of the month's own, so trades in the same month never share one until it runs out
function defaultFor(t) {
  const n = ROTATION.length;
  const pool = poolOf(t).sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  const k = Math.max(0, pool.findIndex((x) => x.id === t.id));
  const step = [7, 11, 13, 17].find((p) => n % p) || 1;
  return ROTATION[(hash(monthOf(t)) + k * step) % n];
}

const KEY = "marble.flex.pictures";
const listeners = new Set();
let picked = (() => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
})();
const tell = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export function pick(tradeId, id) {
  picked = { ...picked, [tradeId]: id };
  try { localStorage.setItem(KEY, JSON.stringify(picked)); } catch {}
  tell();
}
// A pick stands while its picture does; one taken off the shelves, or removed from this device, gives
// the trade its own back
const wears = (t) => {
  const id = picked[t.id];
  return id && (isOwn(id) ? own.urls.has(id) : LIBRARY.has(id)) ? id : t.wears || defaultFor(t);
};
export const pictureOf = (t) => wears(t);
// The trade's picture, kept current as the trader picks or adds pictures
export function usePicture(t) {
  return useSyncExternalStore(subscribe, () => wears(t));
}

/* ---------- How the trader likes their cards ---------- */

// The trader's house style follows them from card to card. Where a picture sits and their own line of
// words belong to one card. All of it stays on this device.
const STYLE = "marble.flex.style", LOOKS = "marble.flex.looks";
const stored = (key) => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
let style = stored(STYLE), looks = stored(LOOKS);
const keep = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} tell(); };
export const useFlexStyle = () => useSyncExternalStore(subscribe, () => style);
export const setFlexStyle = (patch) => { style = { ...style, ...patch }; keep(STYLE, style); };
export const useLook = (id) => useSyncExternalStore(subscribe, () => looks[id] || NO_LOOK);
export const setLook = (id, patch) => {
  const next = { ...looks[id], ...patch };
  looks = { ...looks };
  if (patch == null) delete looks[id]; else looks[id] = next;
  keep(LOOKS, looks);
};
const NO_LOOK = {};

/* ---------- Whose choices these are ---------- */

// Picks, looks and a trader's own line of words are kept per browser, and a browser can be shared. These
// belong to one person: when someone else signs in here, the next person starts clean.
const OWNER = "marble.flex.by", PLAIN_KEY = "marble.flex.plain";
const resets = new Set();
export const onFlexReset = (fn) => { resets.add(fn); };
export function flexOwner(id) {
  if (!id) return;
  try {
    const by = localStorage.getItem(OWNER);
    if (by === id) return;
    if (by) {
      for (const k of [KEY, STYLE, LOOKS, PLAIN_KEY]) localStorage.removeItem(k);
      picked = {}; style = {}; looks = {};
      resets.forEach((fn) => fn());
      tell();
    }
    localStorage.setItem(OWNER, id);
  } catch {}
}

/* ---------- The trader's own pictures, on this device ---------- */

export const OWN_LIMIT_MB = 15;
const OWN_MAX = 24; // kept at most; the oldest goes first
const EDGE = 2400; // pictures are kept at most this wide or high
export const isOwn = (id) => String(id).startsWith("own:");
const own = { records: [], list: [], urls: new Map(), loaded: null, who: "" };
const DB = "marble-flex", STORE = "pictures";
const who = () => (LIVE ? getState().me?.id || "me" : "demo");

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("No storage on this device"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  } finally { db.close(); }
}
// The demo keeps them for the visit only
const device = () => LIVE;

// Shows these records (newest first), keeping the addresses of any already showing
const show = (records) => {
  const urls = new Map(records.map((r) => [r.id, own.urls.get(r.id) || URL.createObjectURL(r.blob)]));
  for (const [id, url] of own.urls) if (!urls.has(id)) URL.revokeObjectURL(url);
  Object.assign(own, { records, urls, list: records.map((r) => r.id) });
  tell();
};
export function loadOwn() {
  if (own.loaded && own.who === who()) return own.loaded;
  own.who = who();
  own.loaded = (device() ? tx("readonly", (s) => s.getAll()) : Promise.resolve([]))
    .then((all) => show((all || []).filter((r) => r.who === own.who && r.blob instanceof Blob).sort((a, b) => b.at - a.at)))
    .catch(() => show([]));
  return own.loaded;
}
const ownList = () => own.list;
export function useOwnPictures() {
  return useSyncExternalStore(subscribe, ownList);
}
export const ownUrl = (id) => own.urls.get(id) || null;

// Keeps a picture file, made at most EDGE across, as a JPEG; says what's wrong in words if it can't
export async function addOwn(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("That file isn't a picture.");
  if (file.size > OWN_LIMIT_MB * 1048576) throw new Error(`That's ${(file.size / 1048576).toFixed(1)} MB. The limit is ${OWN_LIMIT_MB} MB.`);
  const unreadable = "That picture couldn't be opened here. Try a JPEG or PNG.";
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(unreadable); }
  const k = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * k), height: Math.round(bitmap.height * k) });
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error(unreadable);
  await loadOwn();
  const record = { id: `own:${Date.now().toString(36)}`, who: own.who, blob, name: String(file.name || "picture").slice(0, 120), at: Date.now() };
  const records = [record, ...own.records].slice(0, OWN_MAX);
  const gone = own.records.filter((r) => !records.includes(r));
  if (device()) await tx("readwrite", (s) => { gone.forEach((r) => s.delete(r.id)); return s.put(record); }).catch(() => {});
  show(records);
  return record.id;
}
export async function dropOwn(id) {
  if (device()) await tx("readwrite", (s) => s.delete(id)).catch(() => {});
  show(own.records.filter((r) => r.id !== id));
}

// The address to load a picture from, at about this width
export const pictureUrl = (id, w) => (isOwn(id) ? ownUrl(id) : art(id, w));
