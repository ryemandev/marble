import { useEffect, useMemo, useSyncExternalStore } from "react";
import { CAL } from "../../data";
import { pad } from "../../lib/basics.js";
import { LIVE } from "../../mode";
import { exampleOn, getState, onAnyChange, toast } from "../../store";
import { supabase } from "../../live/supabase";

// A photo of a trade, kept against its day. Live they sit in the trader's own folder of the private
// screenshots bucket, named for the day, so no table is needed. The demo and the example desk keep them in memory.

const BUCKET = "screenshots";
const WIDEST = 1800;
const MOST = 6; // a day

export const dayKeyOf = (id) => (typeof id === "number" ? `${CAL.year}-${pad(CAL.month + 1)}-${pad(id)}` : String(id));

// The demo's photos: a plain chart drawn from the date, so it's the same each time
function sampleChart(seed, up) {
  let v = 300, x = 20, s = seed * 9301 + 49297, marks = "";
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 34; i++) {
    const move = (rnd() - (up ? 0.6 : 0.4)) * 34;
    const o = v, c = v + move, hi = Math.min(o, c) - rnd() * 14, lo = Math.max(o, c) + rnd() * 14;
    marks += `<path d="M${x + 5} ${hi.toFixed(1)}V${lo.toFixed(1)}" stroke="#000"/><rect x="${x}" y="${Math.min(o, c).toFixed(1)}" width="10" height="${Math.max(2, Math.abs(move)).toFixed(1)}" fill="${c < o ? "#000" : "#fff"}" stroke="#000"/>`;
    v = Math.max(70, Math.min(530, c));
    x += 15;
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="600" viewBox="0 0 560 600"><rect width="560" height="600" fill="#fff"/><g stroke="#eee"><path d="M0 150H560M0 300H560M0 450H560"/></g>${marks}</svg>`)}`;
}
const SAMPLE_DAYS = [[6, true], [13, false], [21, true]];
const sampleDays = () => Object.fromEntries(SAMPLE_DAYS.map(([d, up]) => {
  const key = `2026-10-${pad(d)}`;
  return [key, [{ path: `sample-${d}`, url: sampleChart(d, up) }]];
}));

let days = LIVE ? {} : sampleDays();
let signedAt = 0;
const FRESH = 50 * 60000; // the signed links last an hour
const subs = new Set();
const put = (next) => { days = next; subs.forEach((f) => f()); };
const watch = (f) => (subs.add(f), () => subs.delete(f));

// The example's photos live in memory and go when it does
let onExample = false;
onAnyChange(() => {
  const on = exampleOn();
  if (onExample && !on && LIVE) put(Object.fromEntries(Object.entries(days).map(([k, list]) => [k, list.filter((p) => !p.path.startsWith("memory-"))])));
  onExample = on;
});

async function load() {
  const uid = getState().me?.id;
  if (!uid || Date.now() - signedAt < FRESH) return;
  signedAt = Date.now();
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list(uid, { limit: 1000, search: "day-" });
    if (error) throw error;
    const paths = (data || []).map((f) => f.name).filter((n) => /^day-\d{4}-\d{2}-\d{2}-/.test(n)).map((n) => `${uid}/${n}`);
    if (!paths.length) return;
    const signed = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    const out = {};
    for (const row of signed.data || []) {
      if (!row.signedUrl) continue;
      const key = /day-(\d{4}-\d{2}-\d{2})-/.exec(row.path)?.[1];
      if (key) (out[key] ||= []).push({ path: row.path, url: row.signedUrl });
    }
    const next = { ...days };
    for (const [key, list] of Object.entries(out)) next[key] = [...list, ...(days[key] || []).filter((p) => !list.some((x) => x.path === p.path))];
    put(next);
  } catch { signedAt = 0; }
}

export async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, WIDEST / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * k);
  c.height = Math.round(bitmap.height * k);
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close?.();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/jpeg", 0.86));
}

export async function addDayPhoto(id, file) {
  const key = dayKeyOf(id);
  const had = days[key] || [];
  if (had.length >= MOST) { toast(`A day holds ${MOST} photos`, { warn: true }); return false; }
  if (!file?.type?.startsWith("image/")) { toast("That isn't a photo", { warn: true }); return false; }
  let blob;
  try { blob = await shrink(file); } catch { toast("Couldn't read that photo", { warn: true }); return false; }
  if (!LIVE || exampleOn()) {
    put({ ...days, [key]: [...had, { path: `memory-${Date.now()}`, url: URL.createObjectURL(blob) }] });
    return true;
  }
  const uid = getState().me?.id;
  const path = `${uid}/day-${key}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
  if (error) { toast("Couldn't save that photo. Try again.", { warn: true }); return false; }
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  put({ ...days, [key]: [...(days[key] || []), { path, url: data?.signedUrl || URL.createObjectURL(blob) }] });
  return true;
}

export async function removeDayPhoto(id, path) {
  const key = dayKeyOf(id);
  if (LIVE && !exampleOn()) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) { toast("Couldn't remove that photo. Try again.", { warn: true }); return; }
  }
  put({ ...days, [key]: (days[key] || []).filter((p) => p.path !== path) });
}

export function useDayPhotos() {
  const map = useSyncExternalStore(watch, () => days);
  useEffect(() => { if (LIVE) load(); }, []);
  return useMemo(() => ({ byDay: map, of: (id) => map[dayKeyOf(id)] || [] }), [map]);
}
