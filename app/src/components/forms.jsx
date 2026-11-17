import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal } from "./overlay";
import { Icon } from "./ui";
import { art } from "../data";
import { useStore } from "../store";

export function SubTabs({ items, value, onChange, label }) {
  const ref = useRef(null);
  const [ind, setInd] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current?.querySelector(`[data-k="${value}"]`);
      if (el) setInd((p) => (p && p.left === el.offsetLeft && p.width === el.offsetWidth ? p : { left: el.offsetLeft, width: el.offsetWidth, ready: !!p }));
    };
    place();
    let live = true;
    document.fonts?.ready.then(() => { if (live) place(); });
    const ro = new ResizeObserver(place);
    ro.observe(ref.current);
    ref.current.querySelectorAll("[data-k]").forEach((b) => ro.observe(b));
    return () => { live = false; ro.disconnect(); };
  }, [value, items.length]);
  return (
    <div className="subtabs has-ind" ref={ref} role="tablist" aria-label={label}>
      {ind && <span className={`subtab-ind ${ind.ready ? "ready" : ""}`} style={{ width: ind.width, transform: `translateX(${ind.left}px)` }} aria-hidden="true" />}
      {items.map(([k, l]) => (
        <button key={k} type="button" role="tab" data-k={k} aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

/* ---------- Dialog forms ---------- */

export function Sheet({ title, sub, onClose, onSubmit, submitLabel = "Save", canSubmit = true, wide, extra, cancel = true, children }) {
  return (
    <Modal label={title} onClose={onClose} className="overlay sheet-overlay">
      <form className={`sheet ${wide ? "wide" : ""}`} onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(); }}>
        <header className="sheet-head">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="sheet-body">{children}</div>
        <footer className="sheet-foot">
          {extra && <div className="sheet-extra">{extra}</div>}
          {cancel && <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>}
          <button type="submit" className="btn" disabled={!canSubmit}>{submitLabel}</button>
        </footer>
      </form>
    </Modal>
  );
}

export const Field = ({ label, hint, error, span = 1, children }) => (
  <label className={`field span-${span} ${error ? "has-error" : ""}`}>
    <span className="field-label">{label}</span>
    {children}
    {error ? <span className="field-error" role="alert">{error}</span> : hint && <span className="field-hint">{hint}</span>}
  </label>
);

// One choice from a few: a row of pill buttons
export function Choice({ options, value, onChange, label }) {
  return (
    <div className="choice" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

// Several choices: toggle chips
export function Chips({ options, value, onChange, label }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((k) => (
        <button key={k} type="button" aria-pressed={value.includes(k)} onClick={() => toggle(k)}>{k}</button>
      ))}
    </div>
  );
}

export function ArtPicker({ options, value, onChange, label, round, view = (p) => p }) {
  return (
    <div className={`art-picker ${round ? "round" : ""}`} role="group" aria-label={label}>
      {options.map(([path, name]) => (
        <button key={path} type="button" aria-pressed={value === path} aria-label={name} title={name}
          style={{ backgroundImage: `url(${art(view(path), 160)})` }} onClick={() => onChange(path)} />
      ))}
    </div>
  );
}

export async function photoDataURL(file, max = 320) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.min(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas.toDataURL("image/webp", 0.86);
}

/* ---------- Toasts ---------- */

export function Toaster() {
  const t = useStore((s) => s.toast);
  const [shown, setShown] = useState(t);
  useEffect(() => { if (t) setShown(t); }, [t]);
  return (
    <div className={`app-toast ${t ? "on" : ""}`} role="status" aria-live="polite">
      {shown && <><Icon name={shown.warn ? "alert" : "check"} size={14} /> {shown.text}{shown.action && <button type="button" className="toast-act" onClick={() => shown.action.run()}>{shown.action.label}</button>}</>}
    </div>
  );
}
