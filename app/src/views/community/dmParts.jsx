import Logo from "../../components/Logo";
import { Icon } from "../../components/ui";
import { Modal } from "../../components/overlay";
import { clock } from "../study/model";
import { Av, No, Tag } from "./parts";
import { SAFETY } from "./dms";
import "./dms.css";

const PATHS = {
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z",
  block: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.7 5.7l12.6 12.6",
  book: "M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5v-15zM5 20.5A2.5 2.5 0 0 0 7.5 23H19M9 7h6",
  eyeOff: "M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.5.9-1.5 2.4-3 3.7M6.6 7.6C4.6 9 3.2 10.9 2.5 12c1 1.8 4.5 6 9.5 6 1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  mute: "M8.6 4.9A6 6 0 0 1 18 10v4.5M6 10.5V16l-2 2h14M10 21a2 2 0 0 0 4 0M3 3l18 18",
  inbox: "M4 13.5 6.6 5h10.8L20 13.5V19H4v-5.5zM4 13.5h4.5a3.5 3.5 0 0 0 7 0H20",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.2 14.2A6.5 6.5 0 0 1 21.5 20",
  pen: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  chevD: "M6 9l6 6 6-6",
  save: "M7 3.5h10v17l-5-4-5 4v-17z",
  undo: "M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.7 7.7 0 0 1-2 1.2L14.8 21h-4l-.3-2.4a7.7 7.7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7.5 7.5 0 0 1 0-2.4L4.6 9.9l2-3.4 1.9.7a7.7 7.7 0 0 1 2-1.2L10.8 3h4l.3 2.4a7.7 7.7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7.5 7.5 0 0 1 0 2.4z",
};
export function Ico({ name, size = 16 }) {
  if (name === "dots") {
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="18.5" cy="12" r="1.6" fill="currentColor" /></svg>;
  }
  if (!PATHS[name]) return <Icon name={name} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
export const Star = ({ size = 11 }) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 6.1 6.4.5-4.9 4.2 1.5 6.4L12 16.8 6.4 20.2l1.5-6.4L3 9.6l6.4-.5z" fill="currentColor" /></svg>;
export const Tri = ({ size = 8 }) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>;

/* ---------- People ---------- */

export function Seal({ size = 15 }) {
  return (
    <span className="dm-seal" style={{ width: size, height: size }} title="Verified Marble staff" aria-label="Verified Marble staff" role="img">
      <Logo size={Math.round(size * 0.53)} color="#0a0a0a" decorative />
    </span>
  );
}
export function Person({ who, size = 30 }) {
  if (who?.staff) return <span className="dm-av-staff" style={{ width: size, height: size }} aria-hidden="true"><Av team size={size - 4} /></span>;
  return <Av who={who} size={size} />;
}
export function Handle({ who, chip = true }) {
  return (
    <span className="dm-handle">
      <b>{who?.handle || "trader"}</b>
      <No n={who?.no} />
      {who?.staff ? <><Seal />{chip && <span className="dm-staff-chip">Marble staff</span>}</> : <Tag crew={who?.crew} />}
    </span>
  );
}

// The one calm line every conversation starts with
export function SafetyLine({ children }) {
  return (
    <div className="dm-safety">
      <Ico name="shield" size={15} />
      <span>{children || SAFETY}</span>
    </div>
  );
}

export function Sheet({ title, sub, children, foot, className = "", onClose }) {
  return (
    <Modal label={title} onClose={onClose} className="overlay sheet-overlay dm-overlay cm-view">
      <div className={`sheet ${className}`}>
        <header className="sheet-head">
          <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="dm-sheet-body">{children}</div>
        {foot && <footer className="sheet-foot">{foot}</footer>}
      </div>
    </Modal>
  );
}

export function Leaf({ c, onOpen, size = "" }) {
  if (!c) return null;
  if (c.gone) {
    return (
      <div className={`sh-leaf gone ${size}`}>
        <span className="sh-leaf-kicker num">{c.notebook || "Study"}{c.n ? ` · p.${c.n}` : ""}</span>
        <b className="sh-leaf-title">{c.owner ? `${c.owner} stopped sharing this ${c.whole ? "notebook" : "page"}` : "This page isn't shared any more"}</b>
        <span className="sh-leaf-gone-sub">Copies people saved stay in their own notebook.</span>
      </div>
    );
  }
  const where = c.whole ? `${c.notebook} · ${c.of} page${c.of === 1 ? "" : "s"}` : `${c.notebook} · page ${c.n}`;
  const inner = (
    <>
      <span className="sh-leaf-top"><span className="sh-leaf-kicker num">{where}</span></span>
      <b className="sh-leaf-title">{c.title || "Untitled"}</b>
      {c.lesson && <span className="sh-leaf-lesson"><Tri /> {c.lesson}</span>}
      {c.lines?.length > 0 && (
        <span className="sh-leaf-lines">
          {c.lines.map(([t, text, key], i) => (
            <span key={i} className={`sh-leaf-ln ${key ? "key" : ""}`}>
              <span className="num">{t == null ? "" : clock(t)}</span><span className="sh-leaf-tx"><span>{text}</span></span>{key ? <Star size={10} /> : <i />}
            </span>
          ))}
        </span>
      )}
      <span className="sh-leaf-foot">
        <span className="num">{c.count} line{c.count === 1 ? "" : "s"} · <Star size={9} /> {c.keys} key</span>
        {onOpen && <span className="sh-leaf-open">Open {c.whole ? "notebook" : "page"} <Icon name="chevR" size={13} /></span>}
      </span>
    </>
  );
  return onOpen
    ? <button type="button" className={`sh-leaf ${size}`} onClick={onOpen} aria-label={`Open ${c.owner}'s ${c.whole ? "notebook" : "page"}: ${c.title || c.notebook}`}>{inner}</button>
    : <div className={`sh-leaf ${size}`}>{inner}</div>;
}
