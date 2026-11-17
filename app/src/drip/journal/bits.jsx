import { useEffect, useRef, useState } from "react";
import { Modal, reducedMotion } from "../../components/overlay";
import { Icon } from "../../components/ui";
import { fmtMoney } from "../../data";
import { marketCode } from "../../lib/markets";
import { STAGES } from "../accounts";

// Dollars with a true minus sign, cents only where there are some
export const cash = (v, opts = {}) => fmtMoney(v, { sign: true, ...opts }).replace("-", "−");
export const exact = (v) => fmtMoney(v, { sign: true, decimals: 2 }).replace("-", "−");

// The Verified mark: money that came straight from a broker, and nothing else
export const Tick = ({ size = 14 }) => (
  <svg className="jn-tick" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="8" fill="currentColor" />
    <path d="M4.5 8.3 7 10.7l4.6-5.2" fill="none" stroke="var(--jn-tick, var(--paper))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const verified = (t) => (t.copies ? t.copies.members.every((m) => m.source === "sync") : t.source === "sync");

export function StageChips({ offered, stage, pick }) {
  if (offered.length < 2) return null;
  return (
    <div className="stage-chips" role="group" aria-label="Which money to show">
      {offered.map((s) => <button key={s} type="button" aria-pressed={s === stage} onClick={() => pick(s)}>{STAGES[s]}</button>)}
    </div>
  );
}

/* ---------- The phone's back button closes a page before it leaves the screen ---------- */

const pages = [];
let passing = 0; // history.back() calls of our own, still on their way
addEventListener("popstate", () => {
  if (passing) { passing -= 1; return; }
  pages.pop()?.current?.();
});
function useBack(onBack) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    // A microtask, so React's practice run of this effect never touches the history
    let on = true, pushed = false;
    queueMicrotask(() => {
      if (!on) return;
      history.pushState({ page: true }, "");
      pages.push(latest);
      pushed = true;
    });
    return () => {
      on = false;
      if (!pushed) return;
      const at = pages.lastIndexOf(latest);
      if (at < 0) return; // the back button closed it
      pages.splice(at, 1);
      passing += 1;
      history.back();
    };
  }, []);
}

// Where the last tap landed, so a page can open out of the row that was tapped and close back into it
let tap = null;
addEventListener("click", (e) => {
  const el = e.target.closest?.(".jn-row, .jn-dayhead, .jn-well, .jn-week, .ak-q");
  if (el) tap = { box: el.getBoundingClientRect(), at: performance.now() };
}, true);

// A phone's full page, over the list. On a desk the same content sits in the side panel.
export function Page({ label, onClose, children, onPicture }) {
  const [from] = useState(() => (tap && performance.now() - tap.at < 600 ? tap.box : null));
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    if (leaving) return;
    if (reducedMotion()) { onClose(); return; }
    setLeaving(true);
    setTimeout(onClose, 230);
  };
  useBack(close);
  const edges = from ? { "--t": `${from.top}px`, "--r": `${innerWidth - from.right}px`, "--b": `${innerHeight - from.bottom}px`, "--l": `${from.left}px` } : undefined;
  return (
    <Modal label={label} onClose={close} className="jn-page-wrap">
      <div className={`jn-page-sheet ${from ? "grown" : ""} ${leaving ? "leaving" : ""}`} style={edges}>
        <div className="jn-page">
          <button type="button" className={`jn-back ${onPicture ? "on-picture" : ""}`} onClick={close} aria-label="Back" data-autofocus><Icon name="chevL" size={22} /></button>
          {children}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Rows ---------- */

export function TradeRow({ t, on, onOpen, sub, tag, indent }) {
  return (
    <div className={`jn-row ${on ? "on" : ""} ${indent ? "indent" : ""}`}>
      <button type="button" className="jn-row-hit" aria-pressed={on} onClick={() => onOpen(t)}
        aria-label={`${marketCode(t.symbol)} ${t.side}, ${t.time || ""}, ${cash(t.pnl)}`} />
      <span className="jn-row-what">
        <b>{indent ? sub : `${marketCode(t.symbol)} ${t.side}`}</b>
        <small>{indent ? [t.size ? `${t.size} @ ${t.entry || "–"}` : null, t.time].filter(Boolean).join(" · ") : sub ?? [t.time, t.setup].filter(Boolean).join(" · ")}</small>
      </span>
      {tag}
      <span className="jn-row-money">
        <span className={`num jn-row-pnl ${t.pnl < 0 ? "minus" : ""}`}>{verified(t) && <Tick size={13} />}{cash(t.pnl)}</span>
      </span>
    </div>
  );
}

export function CopyCount({ n, open, onToggle }) {
  return (
    <button type="button" className="jn-copies num" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the ${n} accounts`} onClick={onToggle}>×{n}</button>
  );
}
