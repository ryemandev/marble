import { supabase } from "./supabase";
import { userId } from "./sync";

const BUCKET = "backdrops";
const HOUR = 3600; // how long a link to a private photo lasts, the same as day photos and Study
const SPARE = 600e3; // a link this close to its end is replaced, so a long visit never shows a dead one
const signed = new Map(); // path -> { url, until }, for this visit. A new visit always signs a new link.

export async function uploadOwn(blob) {
  const uid = userId();
  if (!uid) throw new Error("Not signed in");
  const path = `${uid}/${Date.now().toString(36)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
  if (error) {
    const status = +(error.statusCode || error.status || 0), msg = String(error.message || "");
    throw Object.assign(new Error(msg || "Couldn't upload"), { refused: status === 403 || /row-level security|unauthori[sz]ed/i.test(msg) });
  }
  signed.set(path, { url: URL.createObjectURL(blob), until: Infinity });
  tidy(uid, path);
  return path;
}

async function tidy(uid, keep) {
  try {
    const { data } = await supabase.storage.from(BUCKET).list(uid, { limit: 100 });
    const old = (data || []).map((f) => `${uid}/${f.name}`).filter((p) => p !== keep);
    if (old.length) await supabase.storage.from(BUCKET).remove(old);
  } catch {}
}

// Its address for now
export async function ownUrl(path) {
  const kept = signed.get(path);
  if (kept && Date.now() < kept.until) return kept.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, HOUR);
  if (error || !data?.signedUrl) throw error || new Error("No link");
  signed.set(path, { url: data.signedUrl, until: Date.now() + HOUR * 1000 - SPARE });
  return data.signedUrl;
}

export async function removeOwn(path) {
  if (!path) return;
  const was = signed.get(path)?.url;
  signed.delete(path);
  if (was?.startsWith("blob:")) URL.revokeObjectURL(was);
  try { await supabase.storage.from(BUCKET).remove([path]); } catch {}
}
