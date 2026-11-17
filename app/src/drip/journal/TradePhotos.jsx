import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLayer } from "../../components/overlay";
import { Icon } from "../../components/ui";
import { LIVE } from "../../mode";
import { exampleBlocked, exampleOn, getState, saveTrade, toast } from "../../store";
import { supabase } from "../../live/supabase";
import { shrink } from "./dayPhotos";

// Up to three chart pictures on one trade. Live they sit in the trader's own folder of the private screenshots
// bucket and trades.screenshots holds their paths. The demo and the example keep them in memory.
const BUCKET = "screenshots";
export const MOST = 3;
const memory = new Map();
const offline = () => !LIVE || exampleOn();

async function saveOne(t, file) {
  let blob;
  try { blob = await shrink(file); } catch { toast("Couldn't read that photo", { warn: true }); return null; }
  if (offline()) {
    const path = `memory-${Date.now()}-${memory.size}`;
    memory.set(path, URL.createObjectURL(blob));
    return path;
  }
  const path = `${getState().me?.id}/trade-${t.id}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
  if (error) { toast("Couldn't save that photo. Try again.", { warn: true }); return null; }
  return path;
}

// When a trade goes, so do its pictures
export async function dropTradePhotos(t) {
  const paths = (t.screenshots || []).filter((p) => !memory.has(p));
  if (paths.length && !offline()) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
}

function useUrls(paths) {
  const [urls, setUrls] = useState({});
  const key = paths.join();
  useEffect(() => {
    let on = true;
    const stored = paths.filter((p) => !memory.has(p));
    if (!stored.length || offline()) return undefined;
    supabase.storage.from(BUCKET).createSignedUrls(stored, 3600).then(({ data }) => {
      if (on) setUrls(Object.fromEntries((data || []).filter((r) => r.signedUrl).map((r) => [r.path, r.signedUrl])));
    }).catch(() => {});
    return () => { on = false; };
  }, [key]);
  return (p) => memory.get(p) || urls[p] || null;
}

export default function TradePhotos({ t }) {
  const paths = (t.screenshots || []).filter((p) => !p.startsWith("memory-") || memory.has(p));
  const urlOf = useUrls(paths);
  const input = useRef(null);
  const latest = useRef(t);
  latest.current = t;
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(null);
  useLayer(!!big, { onEscape: () => setBig(null) });

  const add = async (files) => {
    if (t.example) return exampleBlocked();
    const room = MOST - paths.length;
    const images = files.filter((f) => f.type?.startsWith("image/"));
    if (!images.length) { toast("That isn't a photo", { warn: true }); return undefined; }
    if (room <= 0) { toast(`A trade holds ${MOST} photos`, { warn: true }); return undefined; }
    setBusy(true);
    const made = [];
    for (const f of images.slice(0, room)) { const p = await saveOne(t, f); if (p) made.push(p); }
    setBusy(false);
    if (made.length) saveTrade({ ...latest.current, screenshots: [...(latest.current.screenshots || []), ...made] });
    return undefined;
  };
  const remove = async (path) => {
    if (t.example) return exampleBlocked();
    if (!memory.has(path) && !offline()) {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) { toast("Couldn't remove that photo. Try again.", { warn: true }); return undefined; }
    }
    memory.delete(path);
    saveTrade({ ...latest.current, screenshots: (latest.current.screenshots || []).filter((p) => p !== path) });
    return undefined;
  };

  // A chart copied from anywhere can be pasted straight on, unless the trader is typing in a box
  useEffect(() => {
    const onPaste = (e) => {
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.some((f) => f.type?.startsWith("image/"))) { e.preventDefault(); add(files); }
    };
    addEventListener("paste", onPaste);
    return () => removeEventListener("paste", onPaste);
  });

  return (
    <section className={`jn-shots ${paths.length ? "" : "empty"} slim`} aria-label="Chart photos">
      {paths.map((p, i) => (
        <figure key={p}>
          <button type="button" className="jn-shot" onClick={() => setBig(urlOf(p))} aria-label={`Open photo ${i + 1}`}>{urlOf(p) && <img src={urlOf(p)} alt={`Chart photo ${i + 1} for this trade`} loading="lazy" />}</button>
          <button type="button" className="jn-shot-x" onClick={() => remove(p)} aria-label={`Remove photo ${i + 1}`}><Icon name="close" size={14} /></button>
        </figure>
      ))}
      {paths.length < MOST && (
        <button type="button" className="jn-shot-add" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="plus" size={18} />
          <span>{busy ? "Adding" : paths.length ? "Add another" : "Add a chart photo"}</span>
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; if (files.length) add(files); }} />
      {big && createPortal(<button type="button" className="jn-shot-big" onClick={() => setBig(null)} aria-label="Close the photo"><img src={big} alt="" /></button>, document.body)}
    </section>
  );
}
