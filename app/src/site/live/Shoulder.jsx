import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { reduced } from "../heroes/shared";
import Lines from "../ink/Lines";
import "./shoulder.css";

const SRC = `${import.meta.env.BASE_URL}demo.html#dashboard`;
const DESK = { w: 1440, h: 900 }; // the app at a real laptop size, scaled to fit
const SMALL = 640; // under this the same desktop film plays, and the camera moves in closer
const STILL_HOLD = 6500;
const TICK = 50;
const MOVE = 620, CLICK = 200, ZOOM = 900, TYPE = 55, NOTE = 240, BACK = 250;

/* ---------- Finding things in the app ---------- */

const sayOf = (beat) => beat[1];

const card = (d, title) => {
  const h = [...d.querySelectorAll(".main-scroll h3")].find((x) => x.textContent.trim().startsWith(title));
  return h ? h.closest(".card, section") || h.parentElement : null;
};
const field = (d, label) => [...d.querySelectorAll(".sheet label.field")].find((l) => l.firstChild?.textContent?.trim() === label || l.textContent.trim().startsWith(label));
const input = (d, label) => field(d, label)?.querySelector("input, textarea, select") || null;
const button = (d, text, scope = d) => [...scope.querySelectorAll("button")].find((b) => b.textContent.trim() === text) || null;
const all = (...els) => els.filter(Boolean);

// Study opens on the notepad, with its second tab holding every notebook and session
const pad = (d) => d.querySelector(".sp-pad");
const studyTab = (d, name) => [...d.querySelectorAll(".sp-tabs button")].find((b) => b.textContent.trim() === name) || null;
const unliked = (d) => d.querySelector('.fl-post .cm-act[aria-pressed="false"]')?.closest(".fl-post") || d.querySelector(".fl-post");
// The room list on a wide screen. On a phone, the room you're in.
const rooms = (d) => {
  const list = [...d.querySelectorAll(".cm-rooms .cm-room")].filter((e) => e.getBoundingClientRect().width);
  return list.length ? list.slice(1, 3) : all(d.querySelector(".cm-chat"));
};
const subtab = (d, name) => [...d.querySelectorAll(".fl-view button")].find((b) => b.getBoundingClientRect().width && b.textContent.replace(/\d+/g, "").trim() === name) || null;

// The accounts are in the rail on a wide screen and under the tank on a narrow one
const tracks = (d) => [".tracks", ".desk-tracks"].map((s) => d.querySelector(s)).find((e) => e?.getBoundingClientRect().width) || null;
// Today, Week, the month by name, All time
const period = (d, i) => d.querySelectorAll(".dk-periods button")[i] || null;
const section = (d, name) => button(d, name, d.querySelector(".st-strip") || d);
const firstCard = (d) => d.querySelector(".main-scroll .card") || d.querySelector(".main-scroll section") || null;

const CHAPTERS = [
  {
    id: "desk", view: "dashboard", label: "Desk",
    beats: [
      ["say", "Every account on one desk, with your total in dollars."],
      ["tab", "dashboard"],
      ["zoom", (d) => all(tracks(d)), "Equity and room to drawdown, by account", 1300],
      ["say", "Today, this week, this month, all time or your own dates."],
      ["in", (d) => all(d.querySelector(".dp"), d.querySelector(".dk-periods")), "Your total, any stretch"],
      ["wait", 700],
      ["click", (d) => period(d, 2)],
      ["wait", 1700],
      ["click", (d) => period(d, 3)],
      ["wait", 1500],
      ["click", (d) => period(d, 1)],
      ["wait", 1200],
      ["out"],
      ["say", "Under it, the running total, the month and every trade."],
      ["zoom", (d) => all(d.querySelector(".dk-run")), "Your running total", 1300],
      ["zoom", (d) => all(d.querySelector(".dk-factbox")), "The money, broken down", 1500],
      ["wait", 300],
    ],
  },
  {
    id: "close", view: "dashboard", label: "Close",
    beats: [
      ["say", "End the session the same way every day. Look at the day, then close it.", "Look at the day, then close it."],
      ["click", (d) => d.querySelector(".close-pill")],
      ["wait", 1500],
      ["hold", (d) => d.querySelector(".hold")],
      ["say", "Ink covers the screen, and the day becomes a card."],
      ["wait", 3400],
      ["click", (d) => d.querySelector(".close-done")],
      ["wait", 500],
      ["zoom", (d) => all(d.querySelector(".desk-flex")), "Your latest card, on the Desk", 1200],
    ],
  },
  {
    id: "log", view: "dashboard", label: "Log",
    beats: [
      ["say", "Drop in the file your platform exports, or log a trade by hand in seconds."],
      ["click", (d) => d.querySelector(".log-round")],
      ["wait", 600],
      ["in", (d) => all(field(d, "Symbol"), field(d, "Contracts"), d.querySelector(".sheet .computed")), "The dollars, worked out as you type"],
      ["type", (d) => input(d, "Entry"), "21452"],
      ["type", (d) => input(d, "Exit"), "21478"],
      ["type", (d) => input(d, "Stop"), "21442"],
      ["wait", 900],
      ["out"],
      ["key", "Escape"],
      ["wait", 400],
    ],
  },
  {
    id: "journal", view: "journal", label: "Journal",
    beats: [
      ["say", "Every day on the calendar, with its money."],
      ["tab", "journal"],
      ["wait", 700],
      ["zoom", (d) => all(d.querySelector(".jn-wells")), "Each day's money, in ink", 1500],
      ["say", "Tap a day and add a photo of your trade. It stays in the day's box."],
      ["click", (d) => d.querySelector(".jn-well.shot")],
      ["wait", 900],
      ["zoom", (d) => all(d.querySelector(".jn-daybox")), "A photo of your trade", 1700],
      ["key", "Escape"],
      ["wait", 500],
    ],
  },
  {
    id: "stats", view: "analytics", label: "Stats",
    beats: [
      ["say", "Every dollar, broken down: day, hour, setup, symbol and how long you held."],
      ["tab", "analytics"],
      ["wait", 500],
      ["click", (d) => section(d, "Time")],
      ["wait", 500],
      ["zoom", (d) => all(card(d, "Day of the week") || firstCard(d)), "How you do each day of the week", 1500],
      ["zoom", (d) => all(card(d, "Every hour of every day") || firstCard(d)), "Where the money sits in your week", 1500],
      ["click", (d) => section(d, "Duration")],
      ["wait", 500],
      ["zoom", (d) => all(card(d, "Every trade, held time") || firstCard(d)), "Time held against money", 1500],
      ["say", "Ask your journal a question, and see the trades behind the answer."],
      ["click", (d) => section(d, "Ask")],
      ["wait", 700],
      // A wide screen shows an answer beside the questions. On a phone, you pick one first.
      ["click", (d) => (d.querySelector(".ak-answer") ? null : [...d.querySelectorAll(".ak-q")].find((q) => q.textContent.startsWith("Which setup has paid"))), "optional"],
      ["wait", 500],
      ["zoom", (d) => all(d.querySelector(".ak-answer")), "The trades behind every answer", 1700],
      ["click", (d) => section(d, "Overview")],
      ["wait", 300],
    ],
  },
  {
    id: "study", view: "study", label: "Study",
    beats: [
      ["say", "One giant notepad for everything you study."],
      ["tab", "study"],
      ["wait", 900],
      ["say", "The video sits at the top, and you write underneath."],
      ["in", (d) => all(pad(d)?.querySelector(".sp-video"), pad(d)?.querySelector(".sp-title")), "Saved as you write"],
      ["wait", 1500],
      ["out"],
      ["say", "Your chart images go in with it."],
      ["zoom", (d) => all(pad(d)?.querySelector(".sp-charts")), "Each one shown whole", 1100],
      ["say", "Every notebook and session is one tab away, and so are your setups."],
      ["click", (d) => studyTab(d, "All notebooks")],
      ["wait", 1300],
      ["click", (d) => studyTab(d, "Notepad")],
      ["wait", 350],
    ],
  },
  {
    id: "floor", view: "community", label: "Floor",
    beats: [
      ["say", "The Floor: who's here, what's live, and the feed of wins, lessons and questions."],
      ["tab", "community"],
      ["wait", 500],
      ["in", (d) => all(unliked(d)), "By name or anonymously"],
      ["click", (d) => unliked(d)?.querySelector('.cm-act[aria-pressed="false"]'), "optional"],
      ["wait", 900],
      ["out"],
      ["say", "Chat in General, a topic room or your crew's private room."],
      ["click", (d) => subtab(d, "Chat")],
      ["wait", 450],
      ["zoom", rooms, "General, and your crew's room", 1400],
      ["say", "Your crew has its own room and its own board."],
      ["click", (d) => subtab(d, "Your crew")],
      ["wait", 600],
      ["zoom", (d) => all(d.querySelector(".fl-crew")), "Your crew this month", 1400],
      ["say", "Close a day and you get a card to share."],
      ["click", (d) => subtab(d, "Your cards")],
      ["wait", 600],
      ["zoom", (d) => all(d.querySelector(".fl-latest")), "Your latest card", 1400],
      ["click", (d) => subtab(d, "Feed")],
      ["wait", 300],
    ],
  },
];

const cost = ([kind, , , hold]) => ({ say: 0, wait: hold, out: 0, in: ZOOM + NOTE, key: 400, scroll: 700, hold: MOVE + 760, turn: MOVE + CLICK + 800 }[kind] ?? (kind === "zoom" ? ZOOM + NOTE + hold + BACK : MOVE + CLICK));
const lengthOf = (ch) => ch.beats.reduce((a, b) => a + (b[0] === "wait" ? b[1] : b[0] === "type" ? MOVE + CLICK + b[2].length * TYPE : cost(b)), 0);

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export default function Shoulder() {
  const root = useRef(null), box = useRef(null), frame = useRef(null);
  const [fit, setFit] = useState(null); // { k, w, h, phone }
  const [chapter, setChapter] = useState(0);
  const [progress, setProgress] = useState(0);
  const [line, setLine] = useState(CHAPTERS[0].beats[0][1]);
  const [cursor, setCursor] = useState(null);
  const [cam, setCam] = useState({ z: 1, x: 0, y: 0 }); // the camera: zoom and pan, in the box's pixels
  const [tap, setTap] = useState(0); // bumps on every click, to replay the ripple
  const [ready, setReady] = useState(false); // the app inside has drawn its tabs
  const [near, setNear] = useState(false); // load the frame only once the section is close
  const pilot = useRef({ gen: 0, paused: true, jump: null, driveable: true, touched: 0 });
  const still = useRef(reduced());

  useEffect(() => {
    let last = null;
    const track = (e) => { if (e.target !== frame.current) last = e.target; };
    const guard = () => setTimeout(() => {
      if (document.activeElement !== frame.current) return;
      safe(() => frame.current.contentWindow.document.activeElement?.blur());
      if (last && last.isConnected) last.focus({ preventScroll: true }); else frame.current.blur();
    }, 0);
    document.addEventListener("focusin", track);
    addEventListener("blur", guard);
    return () => { document.removeEventListener("focusin", track); removeEventListener("blur", guard); };
  }, []);

  const tame = () => safe(() => {
    const el = frame.current;
    el.setAttribute("inert", "");
    const w = el.contentWindow;
    w.HTMLElement.prototype.focus = function () {};
    const by = (lo, hi, plo, phi, how) => Math.round(how === "center" ? (lo + hi) / 2 - (plo + phi) / 2 : how === "end" ? hi - phi
      : how === "nearest" ? (lo < plo ? lo - plo : hi > phi ? Math.min(hi - phi, lo - plo) : 0) : lo - plo);
    w.Element.prototype.scrollIntoView = function (o) {
      const opt = o && typeof o === "object" ? o : { block: o === false ? "end" : "start" };
      const top = w.document.scrollingElement;
      for (let p = this.parentElement; p; p = p.parentElement) {
        const cs = w.getComputedStyle(p), root = p === top;
        const x = p.scrollWidth > p.clientWidth + 1 && (root || /(auto|scroll)/.test(cs.overflowX));
        const y = p.scrollHeight > p.clientHeight + 1 && (root || /(auto|scroll)/.test(cs.overflowY));
        if (!x && !y) continue;
        const r = this.getBoundingClientRect(), pr = root ? { left: 0, top: 0, right: w.innerWidth, bottom: w.innerHeight } : p.getBoundingClientRect();
        const left = x ? by(r.left, r.right, pr.left, pr.right, opt.inline || "nearest") : 0;
        const down = y ? by(r.top, r.bottom, pr.top, pr.bottom, opt.block || "start") : 0;
        // Always a glide, never a jump: it's a film
        if (left || down) p.scrollBy({ left, top: down, behavior: still.current ? "auto" : "smooth" });
      }
    };
  });

  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current;
      if (!el) return;
      const w = Math.round(el.clientWidth);
      const k = w / DESK.w;
      const h = Math.round(DESK.h * k);
      setFit((f) => (f && f.w === w && f.h === h ? f : { k, w, h, small: w < SMALL, base: DESK }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    addEventListener("resize", measure);
    return () => { ro.disconnect(); removeEventListener("resize", measure); };
  }, []);

  useEffect(() => {
    const check = () => {
      const r = root.current?.getBoundingClientRect();
      if (!r) return;
      const vh = innerHeight || 800;
      if (r.top < vh * 2 && r.bottom > -vh) setNear(true);
      const seen = r.top < vh * 0.8 && r.bottom > vh * 0.2 && !document.hidden;
      pilot.current.paused = !seen;
    };
    check();
    const t = setInterval(check, 300);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!near) return;
    let waited = 0;
    const t = setInterval(() => {
      waited += 250;
      const tabs = safe(() => frame.current.contentDocument.querySelectorAll("[data-tab]").length, -1);
      if (tabs > 0) { clearInterval(t); setReady(true); }
      else if (tabs === -1 && waited > 2000) { pilot.current.driveable = false; }
      if (waited >= 8000) { clearInterval(t); pilot.current.driveable = tabs > 0; setReady(true); }
    }, 250);
    return () => clearInterval(t);
  }, [near]);

  // The autopilot
  useEffect(() => {
    if (!ready || !fit || still.current) return;
    const p = pilot.current;
    const gen = ++p.gen;
    const alive = () => p.gen === gen;
    const win = () => safe(() => frame.current.contentWindow);
    const doc = () => safe(() => frame.current.contentDocument);
    const K = fit.k, base = fit.base, W = fit.w, H = fit.h;
    let camNow = { z: 1, x: 0, y: 0 };

    let spent = 0, budget = 1;
    const sleep = (ms) => new Promise((res, rej) => {
      let left = ms;
      const t = setInterval(() => {
        if (!alive() || p.jump != null) { clearInterval(t); rej(new Error("stop")); return; }
        if (p.paused) return;
        left -= TICK; spent += TICK;
        setProgress(Math.min(1, spent / budget));
        if (left <= 0) { clearInterval(t); res(); }
      }, TICK);
    });

    const hold = (fn) => fn();
    const scroller = () => safe(() => {
      const d = doc();
      const s = d.querySelector(".main-scroll");
      return s && s.scrollHeight > s.clientHeight + 4 ? s : d.scrollingElement;
    });
    const rectOf = (els) => {
      const rs = els.map((e) => safe(() => e.getBoundingClientRect())).filter((r) => r && r.width);
      if (!rs.length) return null;
      const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
      return { l, t, r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
    };
    const pinned = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (win().getComputedStyle(e).position === "fixed") return true; return false; };
    const bring = async (els) => {
      let r = rectOf(els);
      if (!r) return;
      const d = doc(), page = scroller();
      let moved = false;
      safe(() => {
        const off = (lo, hi, plo, phi) => (lo >= plo + 24 && hi <= phi - 24 ? 0 : hi - lo > phi - plo - 48 ? lo - plo - 24 : (lo + hi) / 2 - (plo + phi) / 2);
        for (let p = els[0].parentElement; p && p !== page && p !== d.body; p = p.parentElement) {
          const cs = win().getComputedStyle(p);
          const x = p.scrollWidth > p.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX);
          const y = p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY);
          if (!x && !y) continue;
          const pr = p.getBoundingClientRect();
          // Only as far as the box can actually go
          const fit1 = (v, at, room) => Math.round(Math.max(-at, Math.min(room - at, v)));
          const left = x ? fit1(off(r.l, r.r, pr.left, pr.right), p.scrollLeft, p.scrollWidth - p.clientWidth) : 0;
          const top = y ? fit1(off(r.t, r.b, pr.top, pr.bottom), p.scrollTop, p.scrollHeight - p.clientHeight) : 0;
          if (left || top) { p.scrollBy({ left, top, behavior: "smooth" }); moved = true; }
        }
      });
      if (moved) { await sleep(450); r = rectOf(els) || r; }
      if (safe(() => pinned(els[0]))) return;
      if ((r.t >= 56 && r.b <= base.h - 24) || (r.b - r.t) > base.h - 80) return;
      hold(() => safe(() => page.scrollBy({ top: Math.round((r.t + r.b) / 2 - base.h / 2), behavior: "smooth" })));
      await sleep(700);
    };

    const camFor = (r) => {
      const bw = (r.r - r.l) * K, bh = (r.b - r.t) * K;
      const zMax = Math.min(fit.small ? 3.4 : 1.6, 1.04 / K);
      let z = Math.max(1, Math.min(zMax, (W * 0.88) / bw, (H * 0.8) / bh));
      if (z < 1.1) z = 1;
      if (z === 1) return { z: 1, x: 0, y: 0 };
      const cx = ((r.l + r.r) / 2) * K, cy = ((r.t + r.b) / 2) * K;
      const x = Math.round(Math.min(0, Math.max(W - W * z, W / 2 - cx * z)));
      const y = Math.round(Math.min(0, Math.max(H - H * z, H / 2 - cy * z)));
      return { z: Math.round(z * 1000) / 1000, x, y };
    };
    // The camera moves in on a part of the app. No outline and no label: the cursor and the app do the showing.
    const zoomIn = async (els) => {
      await bring(els);
      const r = rectOf(els);
      if (!r) return sleep(ZOOM);
      const c = camFor(r);
      camNow = c;
      setCam(c);
      await sleep(c.z === 1 ? 300 : ZOOM);
      await sleep(NOTE);
    };
    const zoomOut = () => { camNow = { z: 1, x: 0, y: 0 }; setCam(camNow); };

    const at = (el) => {
      const r = safe(() => el.getBoundingClientRect());
      if (!r || !r.width) return null;
      const x = Math.max(8, Math.min(base.w - 8, r.left + Math.min(r.width / 2, 60)));
      const y = Math.max(8, Math.min(base.h - 8, r.top + r.height / 2 + 2));
      return { x: Math.round(x * K), y: Math.round(y * K) };
    };
    const glide = async (el) => {
      if (camNow.z === 1 && el) await bring([el]);
      const pt = el && at(el);
      if (pt) setCursor({ ...pt, ms: MOVE });
      await sleep(MOVE);
    };
    const press = async (el) => {
      setTap((n) => n + 1);
      hold(() => safe(() => el.click()));
      await sleep(CLICK);
    };
    const keyDown = (name) => hold(() => safe(() => {
      const w = win();
      w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: name, bubbles: true }));
    }));
    const typeInto = async (el, text) => {
      if (!el) return sleep(text.length * TYPE);
      const w = win();
      const setter = safe(() => Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set);
      for (let i = 1; i <= text.length; i++) {
        safe(() => { setter.call(el, text.slice(0, i)); el.dispatchEvent(new w.Event("input", { bubbles: true })); });
        await sleep(TYPE);
      }
    };

    const run = async (beat) => {
      const [kind, a, b, c] = beat;
      const d = doc();
      if (kind === "say") { setLine(sayOf(beat)); return; }
      if (kind === "wait") return sleep(a);
      if (!p.driveable || !d) {
        if (kind === "tab") { safe(() => { win().location.hash = `#${a}`; }); }
        return sleep(kind === "zoom" ? c : 600);
      }
      if (kind === "tab") {
        const el = safe(() => d.querySelector(`[data-tab="${a}"]`));
        await glide(el);
        if (el) await press(el); else { safe(() => { win().location.hash = `#${a}`; }); await sleep(CLICK); }
       
        return;
      }
      if (kind === "click" || kind === "tick") {
        const el = safe(() => a(d));
        if (!el && b === "optional") return;
        await glide(el);
        if (el) await press(kind === "tick" ? safe(() => el.querySelector("input")) || el : el); else await sleep(CLICK);
        return;
      }
      if (kind === "type") {
        const el = safe(() => a(d));
        await glide(el);
        if (el) await press(el); else await sleep(CLICK);
        return typeInto(el, b);
      }
      if (kind === "hold") {
        const el = safe(() => a(d));
        if (!el) return sleep(400);
        await glide(el);
        setTap((n) => n + 1);
        const w = win(), ev = (type) => safe(() => el.dispatchEvent(new w.PointerEvent(type, { bubbles: true, button: 0, pointerType: "touch" })));
        ev("pointerdown");
        await sleep(760);
        ev("pointerup");
        return;
      }
      if (kind === "key") {
        keyDown(a);
        await sleep(400);
        return;
      }
      if (kind === "scroll") {
        hold(() => safe(() => scroller().scrollTo({ top: a, behavior: "smooth" })));
        return sleep(700);
      }
      if (kind === "in") return zoomIn(safe(() => a(d), []));
      if (kind === "out") { zoomOut(); return; }
      if (kind === "zoom") {
        await zoomIn(safe(() => a(d), []));
        await sleep(c);
        zoomOut();
        await sleep(BACK);
      }
    };

    const reset = () => { zoomOut(); keyDown("Escape"); };

    (async () => {
      let i = 0;
      // Start with the cursor resting in the middle of the window
      setCursor((c) => c || { x: Math.round(W * 0.55), y: Math.round(H * 0.6), ms: 0 });
      for (;;) {
        if (!alive()) return;
        const ch = CHAPTERS[i];
        setChapter(i);
        spent = 0; budget = lengthOf(ch);
        setProgress(0);
        try {
          for (const beat of ch.beats) await run(beat);
          i = (i + 1) % CHAPTERS.length;
        } catch {
          if (!alive()) return;
          reset();
          await new Promise((r) => setTimeout(r, 300));
          i = p.jump ?? 0;
          p.jump = null;
        }
      }
    })();
    return () => { p.gen++; };
  }, [ready, fit?.w, fit?.h]);

  const show = (i) => {
    const ch = CHAPTERS[i];
    setChapter(i); setProgress(1); setLine(sayOf(ch.beats[0]));
    safe(() => { frame.current.contentWindow.location.hash = `#${ch.view}`; });
  };
  const pick = (i) => {
    if (still.current || !ready) { pilot.current.touched = 1; show(i); return; }
    pilot.current.jump = i;
  };
  const shown = useRef(0);
  shown.current = chapter;

  useEffect(() => {
    if (!still.current || !ready) return undefined;
    let left = STILL_HOLD;
    const t = setInterval(() => {
      if (pilot.current.paused || pilot.current.touched) return;
      left -= 500;
      if (left > 0) return;
      left = STILL_HOLD;
      show((shown.current + 1) % CHAPTERS.length);
    }, 500);
    return () => clearInterval(t);
  }, [ready]);

  const autopilot = !still.current;
  const base = fit?.base || DESK;
  return (
    <section id="app" className="lx-shoulder ink-section" ref={root} aria-labelledby="lo-title">
      <div className="lo-wrap">
        <header className="lo-head">
          <Lines id="lo-title" className="lo-title" text="The real app, running." />
          <p className="lo-lede">This is Marble itself on sample data, used the way you'd use it.</p>
        </header>

        <div className="lo-stage">
          <div className="lo-window">
            <div className="lo-screen" ref={box} style={fit ? { height: fit.h, aspectRatio: "auto" } : undefined}>
              <div className="lo-cam" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
                {near && fit && (
                  <iframe ref={frame} className="lo-frame" src={SRC} title="Marble, running" aria-hidden="true" tabIndex={-1}
                    onLoad={tame} width={base.w} height={base.h} style={{ transform: `scale(${fit.k})` }} />
                )}
                {autopilot && ready && cursor && pilot.current.driveable && (
                  <div className="lo-cursor" aria-hidden="true"
                    style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)`, transitionDuration: `${cursor.ms}ms` }}>
                    <div className="lo-cursor-size" style={{ transform: `scale(${1 / cam.z})` }}>
                      <span className="lo-ripple" key={tap} />
                      {(
                        <svg width="20" height="24" viewBox="0 0 20 24"><path d="M1.5 1.5v18.2l4.6-4.4 3.2 7.2 3.1-1.4-3.2-7.1h6.4z" fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" /></svg>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lo-chapters">
            <ol className="lo-strip" aria-label="What it's showing">
              {CHAPTERS.map((c, i) => (
                <li key={c.id}>
                  <button type="button" className={i === chapter ? "on" : ""} aria-current={i === chapter ? "step" : undefined} onClick={() => pick(i)}>
                    <span className="lo-bar-track" aria-hidden="true">
                      <span className="lo-bar-fill" style={{ transform: `scaleX(${i < chapter ? 1 : i === chapter ? (autopilot ? progress : 1) : 0})` }} />
                    </span>
                    <span className="lo-name">{c.label}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="lo-line" aria-live="polite" key={line}>{line}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
