import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, Icon } from "../components/ui";
import { toast } from "../store";

const PATHS = {
  overview: "M4 13h4v7H4zM10 4h4v16h-4zM16 9h4v11h-4z",
  traders: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M15.5 4.6a3.5 3.5 0 0 1 0 6.3M17.5 14.2A6.5 6.5 0 0 1 21.5 20",
  health: "M3 12h4l2.5-6 5 12 2.5-6h4",
  ext: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  eyeOff: "M4 4l16 16M10.6 6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-2.8 3.6M6.4 7.4C3.9 9.2 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z",
  seal: "M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM9 12.5 7.5 21l4.5-2.5 4.5 2.5-1.5-8.5",
};
export const I = ({ n, size = 16 }) => (PATHS[n]
  ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[n]} /></svg>
  : <Icon name={n} size={size} />);

export const go = (hash) => { if (location.hash.slice(1) !== hash) location.hash = hash; };

export const St = ({ tone = "", children, title }) => <span className={`st ${tone}`} title={title}>{children}</span>;

export function Who({ handle, name, sub, avatar, no, size = 30 }) {
  return (
    <span className="who">
      <Avatar name={name || handle} src={avatar && /^https:\/\//.test(avatar) ? avatar : undefined} size={size} />
      <span className="who-text"><b>{name || `@${handle}`}{Number.isInteger(no) && <span className="who-no num">#{no}</span>}</b><span className="num faint">{name ? `@${handle}` : ""}{sub ? <>{name ? " · " : ""}{sub}</> : null}</span></span>
    </span>
  );
}

export function Drawer({ title, sub, onClose, children, foot, extra, wide, label }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    document.documentElement.classList.add("scroll-locked");
    return () => { removeEventListener("keydown", k); document.documentElement.classList.remove("scroll-locked"); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <>
      <div className="adm-scrim" onClick={onClose} aria-hidden="true" />
      <aside className={`adm-drawer ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={label || (typeof title === "string" ? title : "Details")}>
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>{typeof title === "string" ? <h2>{title}</h2> : title}{sub && <p>{sub}</p>}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="adm-drawer-body">{children}</div>
        {foot && <div className="sheet-foot">{extra && <div className="sheet-extra">{extra}</div>}{foot}</div>}
      </aside>
    </>,
    document.body,
  );
}

export function State({ q, empty, children }) {
  if (q.loading && !q.data) return <p className="muted adm-state">Loading…</p>;
  if (q.error) return <p className="muted adm-state">Couldn't load this: {q.error.message} <button type="button" className="link" onClick={q.reload}>Try again</button></p>;
  if (empty) return <p className="muted adm-state">{empty}</p>;
  return children;
}

export function useAct() {
  const [busy, setBusy] = useState(null);
  const run = async (key, fn, done) => {
    setBusy(key);
    try {
      const out = await fn();
      if (done) toast(typeof done === "function" ? done(out) : done);
      return out;
    } catch (e) {
      toast(e.message || "That didn't work. Try again.", { warn: true });
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return [busy, run];
}

export async function copy(text, what = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(what); } catch { toast("Couldn't copy. Select it and copy by hand.", { warn: true }); }
}

// A yes-or-no setting (the desk's .check box, without its crossed-off "done" look)
export const Tick = ({ checked, onChange, children }) => (
  <label className={`check adm-check ${checked ? "on" : ""}`}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="box" aria-hidden="true"><Icon name="check" size={11} /></span><span>{children}</span>
  </label>
);

export function Reason({ value, onChange, label, max = 300, placeholder }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <textarea className="input" rows={2} maxLength={max} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <span className="field-hint">{value.trim().length < 3 ? "At least 3 characters" : `${value.length} of ${max}`}</span>
    </label>
  );
}
