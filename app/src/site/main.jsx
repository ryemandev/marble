import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./vh";
import Header from "./Header";
import Hero from "./home/Hero";
import "./site.css";

const LATER = [
  ["app", () => import("./live/Shoulder")],
  ["close", () => import("./home/DayClose")],
  ["cards", () => import("./home/Cards")],
  ["study", () => import("./home/Study")],
  ["community", () => import("./community/Crews")],
  ["pricing", () => import("./home/Pricing")],
  ["founder", () => import("./home/Founder")],
  ["faq", () => import("./home/End")],
];

const hashId = (hash) => { try { return decodeURIComponent(hash.slice(1)); } catch { return ""; } };
const midPage = () => !!hashId(location.hash) || ["reload", "back_forward"].includes(performance.getEntriesByType?.("navigation")[0]?.type);

const started = new Promise((go) => {
  if (document.readyState === "complete") return go();
  addEventListener("load", go, { once: true });
  addEventListener("scroll", go, { once: true, passive: true });
});

function Later({ id, load, now, next, onDrawn }) {
  const [Part, setPart] = useState(null);
  const spot = useRef(null);
  useEffect(() => {
    if (Part) return;
    let live = true, tries = 0, io = null;
    const go = () => load().then((m) => { if (live) setPart(() => m.default); }, () => {
      if (live && ++tries < 4) setTimeout(go, 2000 * tries);
    });
    if (now) go();
    else started.then(() => {
      if (!live) return;
      io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "200% 0px" });
      io.observe(spot.current);
    });
    return () => { live = false; io?.disconnect(); };
  }, [now, Part, load]);
  useEffect(() => {
    if (!Part) return;
    onDrawn(id);
    next?.().catch(() => {});
  }, [Part]); // eslint-disable-line react-hooks/exhaustive-deps
  return Part ? <Part /> : <div id={id} ref={spot} className="later" />;
}

function useLand(goal) {
  useLayoutEffect(() => {
    if (!goal) return;
    let moved = false;
    const mine = () => { moved = true; };
    const evs = ["wheel", "touchstart", "keydown", "pointerdown"];
    evs.forEach((e) => addEventListener(e, mine, { passive: true, capture: true, once: true }));
    const go = (behavior = "instant") => { if (!moved) document.getElementById(goal.id)?.scrollIntoView({ block: "start", behavior }); };
    let ts;
    if (goal.smooth) {
      go("smooth");
      ts = [1200, 2200].map((ms) => setTimeout(go, ms));
    } else {
      go();
      document.fonts?.ready.then(() => go());
      ts = [250, 700, 1500].map((ms) => setTimeout(go, ms));
    }
    return () => { ts.forEach(clearTimeout); evs.forEach((e) => removeEventListener(e, mine, { capture: true })); };
  }, [goal]);
}

function Page() {
  const [all, setAll] = useState(midPage);
  const [drawn, setDrawn] = useState(() => new Set());
  const [goal, setGoal] = useState(() => (hashId(location.hash) ? { id: hashId(location.hash) } : null));
  const ready = drawn.size === LATER.length;
  useLand(ready ? goal : null);

  useEffect(() => {
    if (ready) return;
    const click = (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
      const to = new URL(a.href, location.href);
      const id = hashId(to.hash);
      if (to.origin !== location.origin || to.pathname !== location.pathname || !id || id === "top") return;
      e.preventDefault();
      history.pushState(null, "", to.hash);
      setAll(true);
      setGoal({ id, smooth: !matchMedia("(prefers-reduced-motion: reduce)").matches });
    };
    const moved = () => { const id = hashId(location.hash); if (id) { setAll(true); setGoal({ id }); } };
    document.addEventListener("click", click);
    addEventListener("hashchange", moved);
    return () => { document.removeEventListener("click", click); removeEventListener("hashchange", moved); };
  }, [ready]);

  const onDrawn = (id) => setDrawn((s) => (s.has(id) ? s : new Set(s).add(id)));
  return (
    <>
      <Header />
      <main>
        <Hero />
        {LATER.map(([id, load], i) => <Later key={id} id={id} load={load} now={all} next={LATER[i + 1]?.[1]} onDrawn={onDrawn} />)}
      </main>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
