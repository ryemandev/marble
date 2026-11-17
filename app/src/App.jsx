import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Top from "./drip/Top";
import Trackers from "./drip/Trackers";
import DailyClose from "./drip/DailyClose";
import { reducedMotion } from "./components/overlay";
import BugButton from "./live/BugButton";
import { InstallRibbon } from "./live/Install";
import { VoiceDock } from "./views/community/voice/OnAir";
import { ExampleBar, Tour } from "./live/ExampleDesk";
import { maybeStartExample } from "./live/example";
import { pushSync } from "./live/pwa";
import "./live/calm.css";
import "./crypto/world.css";
import { cryptoFull } from "./crypto/worlds";
import { LIVE, VOICE_LIVE } from "./mode";
import Dialogs from "./components/Dialogs";
import { Toaster } from "./components/forms";
import { getState, openDialog, setState, useOwnStore, useStore } from "./store";
import { useMedia } from "./lib/useMedia.js";

// Each screen's code arrives when it's first opened; the rest follow once the first one shows
const VIEWS = { dashboard: () => import("./views/Dashboard"), journal: () => import("./views/Journal"), analytics: () => import("./views/Analytics"), study: () => import("./views/Study"), community: () => import("./views/Community"), profile: () => import("./views/Profile"), money: () => import("./views/Money"), ...(LIVE ? { team: () => import("./live/Team") } : {}) };
// Old addresses still land somewhere sensible
const MOVED = { news: "dashboard", ai: "analytics", strategy: "study", showcase: "community", earn: "dashboard", payouts: "team" };
const LOAD = { ...VIEWS, soon: () => import("./crypto/Soon") };
const shown = {};
const loadView = (id) => (shown[id] ? Promise.resolve() : LOAD[id]().then((m) => { shown[id] = m.default; }));
const Fail = ({ error }) => { throw error; };
const FirstFile = lazy(() => import("./live/FirstFile"));

const isView = (id) => Object.hasOwn(VIEWS, id);
const SOON_VIEWS = ["dashboard", "journal", "analytics"];
const initialView = () => {
  const raw = location.hash.slice(1);
  const fromHash = MOVED[raw] || raw;
  return isView(fromHash) ? fromHash : "dashboard";
};
export const firstView = loadView(initialView()).catch(() => {});

function useFloatsAway(compact) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!compact) { setAway(false); return; }
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY, end = y + innerHeight >= document.documentElement.scrollHeight - 4;
      if (Math.abs(y - last) < 6) return;
      setAway(y > last && y > 80 && !end);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [compact]);
  return away;
}

class ViewBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { window.dispatchEvent(new CustomEvent("marble:crash", { detail: error })); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="view">
        <div className="view-head"><div><h1>This screen didn't load</h1><p>Something went wrong showing it. The rest of Marble still works.</p></div></div>
        <div><button className="btn" onClick={() => this.props.onReset()}>Back to the dashboard</button></div>
      </div>
    );
  }
}

export default function App() {
  const [view, setView] = useState(initialView);
  const viewRef = useRef(view);
  const world = useStore((s) => s.world);
  const compact = useMedia("(max-width: 1100px)");
  const loadedMe = useStore((s) => s.me);
  const loggedCount = useStore((s) => (s.example?.on ? -1 : s.logged.length));
  useEffect(() => { if (LIVE && loadedMe) maybeStartExample(); }, [loadedMe, loggedCount]);
  useEffect(() => { if (LIVE && loadedMe?.id) pushSync(); }, [loadedMe?.id]);
  const swapping = useStore((s) => !!s.exampleSwap);
  const exOn = useStore((s) => !!s.example?.on);
  const firstFile = useStore((s) => !!s.firstFile);
  const exPending = useOwnStore((s) => LIVE && !!s.me && !s.me.private?.tour_done_at && s.logged.length === 0 && !s.example?.on && s.world === "markets");
  const [waitOver, setWaitOver] = useState(false);
  useEffect(() => { if (!exPending) return; const t = setTimeout(() => setWaitOver(true), 1500); return () => clearTimeout(t); }, [exPending]);
  const [entering, setEntering] = useState(false);
  useEffect(() => { if (!exOn) return; setEntering(true); const t = setTimeout(() => setEntering(false), 360); return () => clearTimeout(t); }, [exOn]);
  const exClass = swapping ? "ex-swap" : exPending && !waitOver ? "ex-wait" : entering ? "ex-enter" : "";

  useEffect(() => {
    const onHash = () => {
      const id = initialView();
      if (id === viewRef.current) return;
      viewRef.current = id;
      loadView(id).catch(() => {}).then(() => { if (viewRef.current === id) setView(id); });
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onHash); };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== "l" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]") || getState().dialog || document.querySelector("[aria-modal='true']")) return;
      e.preventDefault();
      window.dispatchEvent(new Event("marble:close-menus"));
      openDialog("trade");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const select = (to, e) => {
    const id = MOVED[to] || to;
    if (to === "showcase") setState({ communityTab: "cards" });
    if (to === "ai") setState({ statsTab: "ask" });
    if (to === "strategy") setState({ studyTab: "setups" });
    if (id === viewRef.current) return;
    viewRef.current = id;
    try { history.pushState(null, "", `#${id}`); } catch {}
    loadView(id).catch(() => {}).then(() => {
      if (viewRef.current !== id) return;
      if (compact) window.scrollTo(0, 0);
      if (!document.startViewTransition || reducedMotion()) return setView(id);
      document.startViewTransition(() => flushSync(() => setView(id)));
    });
  };

  const selectRef = useRef(null);
  selectRef.current = select;
  useEffect(() => {
    const onGo = (e) => { if (isView(MOVED[e.detail] || e.detail)) selectRef.current(e.detail); };
    window.addEventListener("marble:go", onGo);
    return () => window.removeEventListener("marble:go", onGo);
  }, []);

  const soon = world !== "markets" && !cryptoFull() && SOON_VIEWS.includes(view);
  const preview = world !== "markets" && !cryptoFull();
  const screen = soon ? "soon" : view;
  const View = shown[screen];
  const [failed, setFailed] = useState(null);
  const [, setLoaded] = useState(0);
  useEffect(() => {
    setFailed(null);
    if (!shown[screen]) loadView(screen).then(() => setLoaded((n) => n + 1), setFailed);
  }, [screen]);
  useEffect(() => {
    if (navigator.connection?.saveData) return;
    const t = setTimeout(() => { for (const id in LOAD) loadView(id).catch(() => {}); }, 2000);
    return () => clearTimeout(t);
  }, []);
  const floatsAway = useFloatsAway(compact);

  return (
    <div className={`app ${exClass} ${preview ? "preview-world" : ""} ${floatsAway ? "floats-away" : ""}`}>
      <Top view={view} onSelect={select} />
      <Trackers />
      <main className="main">
        <div className="main-scroll" key={soon ? `soon-${view}` : view}>
          {LIVE && <ExampleBar />}
          <ViewBoundary onReset={() => select("dashboard")}>
            {failed ? <Fail error={failed} /> : View && <View go={select} />}
          </ViewBoundary>
        </div>
      </main>
      {LIVE && <BugButton view={view} />}
      {LIVE && <InstallRibbon />}
      {VOICE_LIVE && <VoiceDock view={view} go={select} />}
      {(LIVE || import.meta.env.DEV) && <Tour go={select} compact={compact} />}
      <Dialogs />
      <DailyClose />
      {firstFile && <Suspense fallback={null}><FirstFile go={select} /></Suspense>}
      <Toaster />
    </div>
  );
}
