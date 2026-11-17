import { useEffect, useState, useSyncExternalStore } from "react";
import { isSample, isStored, thumbOf } from "./attachments";

const local = new Map(); // path → object URL of the browser's own copy
const signed = new Map(); // path → { url, until }
const failed = new Set(); // paths the server has no picture for (yet)
const samples = new Map(); // sample path → () => URL
let io = { owner: "local", upload: null, sign: null, getBlob: null, pending: () => false };
const subs = new Set();
let version = 0;
const changed = () => { version++; subs.forEach((f) => f()); };
const subscribe = (f) => (subs.add(f), () => subs.delete(f));

export const configureMedia = (x) => { io = { ...io, ...x }; changed(); };
export const owner = () => io.owner;
export const registerSamples = (map) => { for (const [k, f] of Object.entries(map)) samples.set(`sample/${k}`, f); };
export const uploading = (path) => !!io.pending?.(path);
export const mediaChanged = changed;

export async function storePhoto(path, full, thumb) {
  if (typeof URL !== "undefined" && URL.createObjectURL) {
    local.set(path, URL.createObjectURL(full.blob));
    local.set(thumbOf(path), URL.createObjectURL(thumb.blob));
  }
  changed();
  return io.upload ? io.upload(path, full, thumb) : { queued: false };
}

// The URL to show a photo from right now, if there is one
function urlNow(path) {
  if (!path) return null;
  if (local.has(path)) return local.get(path);
  if (isSample(path)) return samples.get(path)?.() || null;
  const s = signed.get(path);
  return s && s.until > Date.now() ? s.url : null;
}

let wanted = new Set(), timer = null;
function want(path) {
  if (!io.sign || failed.has(path)) return;
  wanted.add(path);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const paths = [...wanted];
    wanted = new Set();
    try {
      const got = await io.sign(paths); // Map path → url (missing: no picture there yet)
      for (const p of paths) {
        if (got.get(p)) signed.set(p, { url: got.get(p), until: Date.now() + 50 * 60000 });
        else failed.add(p);
      }
    } catch { }
    changed();
  }, 30);
}

export function usePhotoUrl(path, thumb = false) {
  const p = path ? (thumb ? thumbOf(path) : path) : null;
  useSyncExternalStore(subscribe, () => version, () => version);
  const [fromDisk, setFromDisk] = useState(null);
  const now = urlNow(p);
  useEffect(() => {
    if (!p || now || !isStored(path)) return; // (the small copy is "…-t", beside the stored photo)
    let dead = false;
    (io.getBlob ? io.getBlob(p) : Promise.resolve(null)).then((blob) => {
      if (dead) return;
      if (blob && typeof URL !== "undefined") { local.set(p, URL.createObjectURL(blob)); changed(); setFromDisk(p); }
      else want(p);
    }).catch(() => want(p));
    return () => { dead = true; };
  }, [p, now]);
  return { url: now || (fromDisk && urlNow(fromDisk)) || null, missing: !!p && failed.has(p) && !now };
}
