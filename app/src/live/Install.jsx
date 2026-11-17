import { useEffect, useState } from "react";
import { Icon } from "../components/ui";
import { useStore } from "../store";
import { installKind, installNow, installPromptDue, markInstallAsked, onInstallChange } from "./pwa";
import "./install.css";

function useInstallPrompt() {
  const settled = useStore((s) => !!s.me?.private?.tour_done_at && !s.example?.on);
  const [kind, setKind] = useState(installKind);
  const [open, setOpen] = useState(false);
  useEffect(() => onInstallChange(() => setKind(installKind())), []);
  useEffect(() => {
    if (!settled || open) return;
    const t = setTimeout(() => {
      if (!installPromptDue()) return;
      markInstallAsked(); // shown is asked: a reload never brings it back
      setOpen(true);
    }, 20000);
    return () => clearTimeout(t);
  }, [settled, kind, open]);
  return {
    open,
    kind,
    close: () => setOpen(false),
    install: async () => { await installNow().catch(() => false); setOpen(false); },
  };
}

const Share = () => (
  <span className="in-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" /></svg></span>
);
const Add = () => (
  <span className="in-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></svg></span>
);

export function InstallSteps({ kind, className = "" }) {
  const first = {
    safari26: <>Tap <b>⋯</b> beside the address, then <b>Share</b> <Share /></>,
    safari: <>Tap <b>Share</b> <Share /> in Safari's bar</>,
    "ios-other": <>Tap <b>Share</b> <Share /> in the address bar</>,
  }[kind];
  if (!first) return <p className="in-other">Open <b>trademarble.app/desk</b> in Safari, then add it to your home screen from Share.</p>;
  return (
    <ol className={`in-steps ${className}`}>
      <li><span className="in-n">1</span><span>{first}</span></li>
      <li><span className="in-n">2</span><span>Tap <b>Add to Home Screen</b> <Add />, then <b>Add</b></span></li>
    </ol>
  );
}

export function InstallRibbon() {
  const { open, kind, close, install } = useInstallPrompt();
  const [steps, setSteps] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!open) return null;
  const android = kind === "android";
  const away = () => { setLeaving(true); setTimeout(close, 180); };
  return (
    <aside className={`in-ribbon ${leaving ? "leaving" : ""}`} aria-label="Add Marble to your home screen">
      <div className="in-row">
        <img className="in-icon" src={`${import.meta.env.BASE_URL}icon-192.png?v=4`} alt="" width="36" height="36" />
        <span className="in-text">
          <b>Put Marble on your home screen</b>
          <span>{android ? "One tap. Opens like an app." : "Two taps. Opens like an app."}</span>
        </span>
        {!steps && (
          <button type="button" className="btn silver in-go" onClick={android ? () => { setLeaving(true); install(); } : () => setSteps(true)}>
            {android ? "Install" : "Show me"}
          </button>
        )}
        <button type="button" className="icon-btn in-x" aria-label="Not now" onClick={away}><Icon name="close" size={16} /></button>
      </div>
      {steps && <div className="in-open"><InstallSteps kind={kind} /></div>}
    </aside>
  );
}
