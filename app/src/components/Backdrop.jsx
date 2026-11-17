import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "./forms";
import { Icon } from "./ui";
import { setBackdrop, toast, useOwnStore } from "../store";
import { LIVE } from "../mode";
import { ownBackdropReady } from "../live/sync";
import { BACKDROP, NONE, OWN, PICTURES, backdropOf } from "../backdrop";
import "./backdrop.css";

const live = () => import("../live/backdrop");
// The demo's own photo stays in this tab and is never uploaded
let demoOwn = null;

async function ownAddress(path) {
  if (!LIVE) return demoOwn;
  return path ? (await live()).ownUrl(path) : null;
}

// The picture you chose for your ink, or null to leave it to the hour
export function useInkPicture() {
  const b = useOwnStore((s) => s.backdrop);
  const pic = b?.pic, own = b?.own;
  const [ownSrc, setOwnSrc] = useState(null);
  useEffect(() => {
    if (pic !== OWN) { setOwnSrc(null); return undefined; }
    let gone = false;
    ownAddress(own).then((u) => { if (!gone) setOwnSrc(u); }, () => { if (!gone) setOwnSrc(null); });
    return () => { gone = true; };
  }, [pic, own]);
  return useMemo(() => {
    if (pic === OWN) return ownSrc ? { src: ownSrc } : null;
    const p = PICTURES.find((x) => x.id === pic);
    return p ? { src: `${import.meta.env.BASE_URL}${p.src.slice(1)}.webp`, at: p.at } : null;
  }, [pic, ownSrc]);
}

// Your own photo, as sharp as the bucket allows: up to 4K on its long side, at the best JPEG quality that fits in 3 MB
const EDGES = [3840, 3200, 2560], QUALITIES = [0.92, 0.88, 0.84, 0.8], ROOM = 3.0e6;

async function shrink(file) {
  const bmp = await createImageBitmap(file);
  try {
    for (const edge of EDGES) {
      const canvas = scaled(bmp, edge);
      for (const q of QUALITIES) {
        const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
        if (!blob) throw new Error("Couldn't read that picture");
        if (blob.size <= ROOM) return blob;
      }
    }
    throw new Error("That picture is too big to keep sharp");
  } finally {
    bmp.close?.();
  }
}

// Down to edge on the long side, halving first while it's more than twice too big: one big jump loses detail and shimmers
function scaled(src, edge) {
  const k = Math.min(1, edge / Math.max(src.width, src.height));
  const W = Math.round(src.width * k), H = Math.round(src.height * k);
  let from = src, w = src.width, h = src.height;
  while (w / 2 >= W) { w = Math.round(w / 2); h = Math.round(h / 2); from = drawn(from, w, h); }
  return drawn(from, W, H);
}
function drawn(src, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high"; // the browsers' default is "low", which is what made photos soft
  g.drawImage(src, 0, 0, w, h);
  return canvas;
}

export function BackdropForm({ onClose }) {
  const b = useOwnStore((s) => s.backdrop) || backdropOf(BACKDROP);
  const file = useRef(null);
  const [busy, setBusy] = useState(false);
  const [ownSrc, setOwnSrc] = useState(null);
  const hasOwn = LIVE ? !!b.own : !!ownSrc;
  const ownOk = !LIVE || ownBackdropReady();
  useEffect(() => {
    let gone = false;
    ownAddress(b.own).then((u) => { if (!gone) setOwnSrc(u); }, () => { if (!gone) setOwnSrc(null); });
    return () => { gone = true; };
  }, [b.own, b.at]);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) return toast("That isn't a picture. Choose a photo.", { warn: true });
    setBusy(true);
    try {
      const blob = await shrink(f);
      if (LIVE) {
        const was = b.own, mod = await live();
        const path = await mod.uploadOwn(blob);
        setBackdrop({ pic: OWN, own: path });
        if (was && was !== path) mod.removeOwn(was);
      } else {
        if (demoOwn) URL.revokeObjectURL(demoOwn);
        demoOwn = URL.createObjectURL(blob);
        setBackdrop({ pic: OWN });
      }
    } catch (err) {
      toast(err?.refused ? "Your own photo couldn't be saved just now. Marble's pictures are yours to use." : "Couldn't use that picture. Try another one.", { warn: true, ms: 6000 });
    } finally {
      setBusy(false);
    }
  };
  const chooseOwn = () => (hasOwn ? setBackdrop({ pic: OWN }) : file.current?.click());
  const removeOwn = async () => {
    const was = b.own;
    setBackdrop({ pic: b.pic === OWN ? BACKDROP.pic : b.pic, own: null, mono: false });
    if (LIVE) (await live()).removeOwn(was);
    else if (demoOwn) { URL.revokeObjectURL(demoOwn); demoOwn = null; setOwnSrc(null); }
  };

  return (
    <Sheet title="Your picture" sub="It shows inside the ink on your Desk, in black and white." onClose={onClose} onSubmit={onClose} submitLabel="Done" cancel={false} wide>
      <div className="field span-4">
        <span className="field-label">Picture</span>
        <div className="bd-tiles" role="group" aria-label="Picture">
          <button type="button" className="bd-tile plain" aria-pressed={b.pic === NONE} onClick={() => setBackdrop({ pic: NONE })}>
            <span className="bd-art" aria-hidden="true" style={{ backgroundImage: "url(/art/prints/red-fuji-hokusai-480.webp)" }} /><span className="bd-name">Changes with the hour</span>
          </button>
          {PICTURES.map((p) => (
            <button key={p.id} type="button" className="bd-tile" aria-pressed={b.pic === p.id} onClick={() => setBackdrop({ pic: p.id })}>
              <span className="bd-art" aria-hidden="true" style={{ backgroundImage: `url(${p.src}-480.webp)` }} /><span className="bd-name">{p.name}</span>
            </button>
          ))}
          {ownOk && <button type="button" className={`bd-tile own ${hasOwn ? "" : "empty"}`} aria-pressed={b.pic === OWN && hasOwn} onClick={chooseOwn} disabled={busy}>
            <span className={`bd-art ${b.mono ? "mono" : ""}`} aria-hidden="true" style={ownSrc ? { backgroundImage: `url("${ownSrc}")` } : undefined}>
              {!ownSrc && <Icon name={busy ? "image" : "upload"} size={18} />}
            </span>
            <span className="bd-name">{busy ? "Uploading…" : "Your own photo"}</span>
          </button>}
        </div>
        <input ref={file} type="file" accept="image/*" className="bd-file" tabIndex={-1} aria-hidden="true" onChange={pick} />
        {hasOwn && (
          <div className="bd-own-links">
            <button type="button" className="link" onClick={() => file.current?.click()} disabled={busy}>Change your photo</button>
            <button type="button" className="link" onClick={removeOwn} disabled={busy}>Take it away</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
