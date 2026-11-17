import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { Modal } from "../../components/overlay";
import { MAX_CAPTION } from "./attachments";
import { clock } from "./model";
import { useStudy } from "./ctx";
import { uploading, usePhotoUrl } from "./media";
import { animate, fadeEase, reduced } from "./motion";

// Dragging a photo over a page: it says where it'll go
export function useDropPhotos(page) {
  const ctx = useStudy();
  const [over, setOver] = useState(false);
  const has = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const props = {
    onDragEnter: (e) => { if (has(e)) { e.preventDefault(); setOver(true); } },
    onDragOver: (e) => { if (has(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
    onDrop: (e) => { if (!has(e)) return; e.preventDefault(); setOver(false); ctx.addPhotos(page, [...e.dataTransfer.files]); },
  };
  const veil = over && (
    <div className="nb-drop" aria-hidden="true">
      <Icon name="image" size={18} />
      <b>Drop to save this image</b>
    </div>
  );
  return [props, veil];
}

/* ---------- The viewer ---------- */

function Full({ a }) {
  const big = usePhotoUrl(a.path, false), small = usePhotoUrl(a.path, true);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [big.url]);
  return (
    <div className="st-view-img">
      {small.url && !loaded && <img className="st-view-small" src={small.url} alt="" draggable={false} />}
      {big.url && <img className={`st-view-big ${loaded ? "on" : ""}`} src={big.url} alt={a.caption || "A photo on this page"} draggable={false} onLoad={() => setLoaded(true)} />}
      {!big.url && !small.url && <span className="st-view-wait">{big.missing ? "This photo is still on its way from another device." : "Loading…"}</span>}
    </div>
  );
}

export function PhotoViewer({ page, start, onClose }) {
  const ctx = useStudy();
  const list = page?.attachments || [];
  const [i, setI] = useState(Math.min(start, Math.max(0, list.length - 1)));
  const at = Math.min(i, list.length - 1);
  const a = list[at];
  const stage = useRef(null);
  const busy = useRef(false);
  const [caption, setCaption] = useState(a?.caption || "");
  useEffect(() => { setCaption(a?.caption || ""); }, [a?.path, a?.caption]);
  useEffect(() => { if (!list.length) onClose(); }, [list.length]);

  const go = (d) => {
    const n = at + d;
    if (busy.current || n < 0 || n >= list.length) return;
    const el = stage.current;
    const move = reduced() ? 0 : 36;
    busy.current = true;
    animate(150, (x) => { if (el) { el.style.opacity = String(1 - x); el.style.transform = `translateX(${-d * move * x}px)`; } }, fadeEase, () => {
      setI(n);
      animate(220, (x) => { if (el) { el.style.opacity = String(x); el.style.transform = `translateX(${d * move * (1 - x)}px)`; } }, fadeEase, () => { busy.current = false; if (el) el.style.transform = ""; });
    });
  };
  // Swipe sideways on the photo
  const swipe = useRef(null);
  const onDown = (e) => { if (e.button > 0) return; swipe.current = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onMove = (e) => {
    const s = swipe.current;
    if (!s || busy.current || !stage.current) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - s.y)) stage.current.style.transform = `translateX(${dx * 0.6}px)`;
  };
  const onUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !stage.current) return;
    const dx = e.clientX - s.x, v = dx / Math.max(1, performance.now() - s.t);
    if ((dx < -50 || v < -0.5) && at < list.length - 1) go(1);
    else if ((dx > 50 || v > 0.5) && at > 0) go(-1);
    else { const el = stage.current, from = dx * 0.6; animate(180, (x) => { el.style.transform = `translateX(${from * (1 - x)}px)`; }, fadeEase); }
  };
  const commit = () => { if (a && caption.trim() !== (a.caption || "")) ctx.photoCaption(page, a.path, caption); };
  if (!a) return null;
  const canSeek = a.t != null && !!page.videoId;
  return (
    <Modal label="Photos on this page" onClose={() => { commit(); onClose(); }} className="st-viewer"
      onKey={(e) => {
        if (e.target.closest?.("input, textarea")) return;
        if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      }}>
      <div className="st-view-top">
        <span className="num st-view-count">{at + 1} / {list.length}</span>
        <button type="button" className="icon-btn" onClick={() => { commit(); onClose(); }} aria-label="Close the photos" data-autofocus><Icon name="close" size={18} /></button>
      </div>
      <div className="st-view-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {at > 0 && <button type="button" className="st-view-nav prev" onClick={() => go(-1)} aria-label="The photo before"><Icon name="chevL" size={20} /></button>}
        <div className="st-view-slide" ref={stage}><Full a={a} key={a.path} /></div>
        {at < list.length - 1 && <button type="button" className="st-view-nav next" onClick={() => go(1)} aria-label="The next photo"><Icon name="chevR" size={20} /></button>}
      </div>
      <div className="st-view-bar">
        {canSeek && (
          <button type="button" className="st-view-time num" onClick={() => { commit(); onClose(); ctx.seek(page, a.t); }} aria-label={`Play the lesson from ${clock(a.t)}`}>
            <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>{clock(a.t)}
          </button>
        )}
        <textarea className="st-view-caption" rows={1} value={caption} maxLength={MAX_CAPTION} placeholder={ctx.example ? "" : "Add a caption"} readOnly={ctx.example}
          aria-label="Caption" enterKeyHint="done" onChange={(e) => setCaption(e.target.value.replace(/\n/g, " "))} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
        {uploading(a.path) && <span className="st-view-up">Uploads when you're back online</span>}
        {!ctx.example && <button type="button" className="icon-btn st-view-del" onClick={() => ctx.takeOutPhoto(page, a.path)} aria-label="Take this photo off the page"><Icon name="trash" size={16} /></button>}
      </div>
    </Modal>
  );
}
