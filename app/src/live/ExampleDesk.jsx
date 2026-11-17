import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { useLayer } from "../components/overlay";
import { openDialog, setState, useStore } from "../store";
import { endExample, markDone, startExample } from "./example";
import "./example.css";

// One strip says what the numbers are and how to leave them. It stays at the top of the screen on every tab.
function Strip({ replay, ...rest }) {
  return (
    <button type="button" className="ex-strip" onClick={() => endExample()} {...rest}>
      <span>Sample data&nbsp;·&nbsp;<b>{replay ? "Back to my desk" : "Start with my own"}</b></span>
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M10.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

export function ExampleBar() {
  const on = useStore((s) => s.example?.on);
  const replay = useStore((s) => s.example?.replay);
  if (!on) return null;
  return <Strip replay={replay} data-ex-strip="" />;
}

const STEPS = [
  { view: "dashboard", target: "[data-tour=tank] > :first-child", title: "Your money", text: "Your total in dollars: today, this week, this month, all time or dates you set, for any of your accounts." },
  { view: "dashboard", target: "[data-tour=log]", title: "Log a trade", text: "The symbol, the side and the dollars. Prices are there if you want them. L opens it from anywhere." },
  { view: "journal", target: "[data-tour=calendar]", title: "Every day and every trade", text: "Tap a day on the calendar to see its money and add a photo of your trade. Open any trade to see it drawn from its prices and fills." },
  { view: "analytics", tab: "numbers", target: "[data-tour=analytics]", title: "Where your money comes from", text: "Every dollar by day, hour, setup, symbol, account and how long you held." },
  { view: "journal", target: "[data-tour=import]", title: "Bring your history", text: "Import the file your platform exports. Marble pairs the fills into trades and skips any it already has." },
  { view: "dashboard", target: "[data-tour=start]", title: "Your turn", text: "Log your first trade or bring in your history, and this example clears away for your own.", last: true },
];

const PAD = 6; // room around a lit-up spot that has no shape of its own
const STUCK = 44; // where the strip's foot sits once the page has scrolled under it
const stripBox = () => document.querySelector("[data-ex-strip]")?.getBoundingClientRect() || null;

export function Tour({ go, compact }) {
  const open = useStore((s) => !!s.tourOpen && !!s.example?.on);
  const step = useStore((s) => s.tourStep || 0);
  const replay = useStore((s) => s.example?.replay);
  const [rect, setRect] = useState(null);
  const [strip, setStrip] = useState(null);
  const [glide, setGlide] = useState(false);
  const [ready, setReady] = useState(false);
  const card = useRef(null);
  const titleId = useId();
  const s = STEPS[step];
  const phone = typeof window !== "undefined" && matchMedia("(max-width: 640px)").matches;

  const close = () => setState({ tourOpen: false });
  const finish = (then) => { endExample(); then?.(); };
  // Skipping ends the walkthrough for good and leaves the example to look round. On a replay there's a desk to go back to.
  const skip = () => { if (replay) return finish(); markDone(); close(); };
  const to = (n) => setState({ tourStep: Math.max(0, Math.min(STEPS.length - 1, n)) });
  useLayer(open, { onEscape: close });

  useEffect(() => {
    if (!open) return;
    if (s.tab) setState({ statsTab: s.tab });
    go(s.view);
    setGlide(true);
    setReady(false);
    const glideOff = setTimeout(() => setGlide(false), 520);
    let raf = 0, found = null, waited = 0, last = "", lastStrip = "";
    const settles = [];
    const started = performance.now();
    // The card never waits on the page: if the spot isn't there yet it shows in the middle, and moves when it is.
    const showAnyway = setTimeout(() => setReady(true), 1200);
    const follow = () => {
      if (found && !found.isConnected) { found = null; last = ""; setRect(null); } // the page changed under it
      if (!found) {
        found = document.querySelector(s.target);
        if (found) {
          const behavior = "auto";
          // Twice: once as the page lands, and again once anything above the spot has finished loading
          const settle = () => {
            if (!found) return;
            if (!phone) {
              const scroller = found.closest(".main-scroll");
              if (!scroller) return;
              const r = found.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
              if (r.top >= sr.top + STUCK + 16 && r.bottom <= sr.bottom - 8) return;
              scroller.scrollBy({ top: r.top + r.height / 2 - (sr.top + sr.height / 2), behavior });
              return;
            }
            // The spot has to clear the strip above it and the card below it
            const sb = stripBox();
            const bar = sb ? Math.max(sb.bottom, STUCK) : Math.max(document.querySelector(".top")?.getBoundingClientRect().bottom || 0, 0);
            const sheet = (card.current?.offsetHeight || 300) + 16;
            const r = found.getBoundingClientRect();
            if (r.top >= bar - 2 && r.bottom <= innerHeight - sheet - 8) return;
            // A spot right under the strip stays where it is: scrolling would only slide it beneath
            if (sb && sb.top > STUCK - sb.height && r.top < sb.bottom + 12) return;
            window.scrollBy({ top: r.top - STUCK - 12, behavior });
          };
          settles.push(setTimeout(settle, 60), setTimeout(settle, 520));
        } else if (performance.now() - started > 6000) { setRect(null); setReady(true); return; }
      }
      if (found) {
        const r = found.getBoundingClientRect();
        const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        // The hole keeps the spot's own corners, so a panel stays a panel and a round button stays round
        const own = Math.min(parseFloat(getComputedStyle(found).borderTopLeftRadius) || 0, r.height / 2), pad = own >= 12 ? 0 : PAD;
        if (key !== last && r.width && r.height) { last = key; setRect({ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2, borderRadius: own >= 12 ? own : 16 }); }
        if (r.width && r.height && performance.now() - started > 420) setReady(true);
      }
      // The strip stays lit through the tour, so the numbers always carry their label
      const sb = stripBox();
      const sk = sb ? `${Math.round(sb.left)},${Math.round(sb.top)},${Math.round(sb.width)}` : "";
      // While the tour holds the page still the real strip can't stick, so the lit one keeps its place at the top
      if (sk !== lastStrip) { lastStrip = sk; setStrip(sb ? { left: sb.left, top: Math.max(STUCK - sb.height, sb.top), width: sb.width } : null); }
      waited++;
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => { cancelAnimationFrame(raf); clearTimeout(glideOff); clearTimeout(showAnyway); settles.forEach(clearTimeout); };
  }, [open, step, compact]);

  useEffect(() => { if (open) card.current?.focus({ preventScroll: true }); }, [open, step]);
  useEffect(() => {
    if (!open) return;
    const keep = (e) => { if (card.current && !card.current.contains(e.target)) card.current.focus({ preventScroll: true }); };
    document.addEventListener("focusin", keep);
    const later = setTimeout(() => keep({ target: document.activeElement }), 450);
    return () => { document.removeEventListener("focusin", keep); clearTimeout(later); };
  }, [open, step]);

  // Arrow keys move between steps; Tab stays inside the card
  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); s.last ? finish() : to(step + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); to(step - 1); }
    else if (e.key === "Tab") {
      const items = [...card.current.querySelectorAll("button")];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items.at(-1).focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    }
  };

  const [pos, setPos] = useState({});
  useLayoutEffect(() => {
    if (!open || phone) return setPos({});
    const w = 340, h = card.current?.offsetHeight || 220, vw = innerWidth, vh = innerHeight, m = 16;
    if (!rect) return setPos({ left: (vw - w) / 2, top: (vh - h) / 2 });
    const clampX = (x) => Math.max(m, Math.min(vw - w - m, x));
    // The card keeps clear of the strip, so the numbers behind it never lose their label
    const roof = strip ? strip.top + 36 + 8 : m;
    const clampY = (y) => Math.max(roof, Math.min(vh - h - m, y));
    if (rect.top + rect.height + 14 + h < vh - m) return setPos({ left: clampX(rect.left), top: rect.top + rect.height + 14 });
    if (rect.top - 14 - h > roof) return setPos({ left: clampX(rect.left), top: rect.top - 14 - h });
    if (rect.left + rect.width + 14 + w < vw - m) return setPos({ left: rect.left + rect.width + 14, top: clampY(rect.top) });
    return setPos({ left: clampX(rect.left - w - 14), top: clampY(rect.top) });
  }, [open, rect, strip, step, phone]);

  if (!open) return null;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      <div className={`tour-hole ${rect ? "" : "none"} ${glide ? "glide" : ""}`} style={rect || undefined} aria-hidden="true" />
      {strip && <Strip replay={replay} className="ex-strip lit" style={strip} tabIndex={-1} />}
      <div className={`tour-card ${phone ? "tour-sheet" : ""}`} ref={card} tabIndex={-1} onKeyDown={onKey} style={{ ...pos, opacity: ready ? 1 : 0 }} key={step}>
        <div className="tour-top">
          <span className="tour-count num">{String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}</span>
          <button className="tour-x" onClick={close} aria-label="Close the tour"><Icon name="close" size={18} /></button>
        </div>
        <h2 className="tour-title" id={titleId}>{s.title}</h2>
        <p className="tour-text">{s.text}</p>
        <div className="tour-dots" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={i === step ? "on" : i < step ? "past" : ""} />)}</div>
        <div className="tour-actions">
          {s.last ? (
            replay ? (
              <><button className="link tour-skip" onClick={() => to(step - 1)}>Back</button><button className="tour-go" onClick={() => finish()}>Back to my desk</button></>
            ) : (
              <>
                <button className="link tour-skip" onClick={() => finish(() => openDialog("import"))}>Import trades</button>
                <button className="tour-go" onClick={() => finish(() => openDialog("trade"))}>Log my first trade</button>
              </>
            )
          ) : (
            <>
              <button className="link tour-skip" onClick={skip}>{replay ? "End the tour" : "Skip the tour"}</button>
              {step > 0 && <button className="tour-go back" onClick={() => to(step - 1)}>Back</button>}
              <button className="tour-go" onClick={() => to(step + 1)}>Next</button>
            </>
          )}
        </div>
        <p className="sr-only" aria-live="polite">{`Step ${step + 1} of ${STEPS.length}: ${s.title}. ${s.text}`}</p>
      </div>
    </div>
  );
}

// "Replay the tour", from the avatar menu
export const replayTour = () => startExample({ tour: true, replay: true });
