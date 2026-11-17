import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { DRIPS, LETTERS, VIEW } from "../../components/Logo";
import Tank, { moneyFont } from "../../drip/Tank";
import "./looks.css";

const params = import.meta.env.DEV && typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
export const FORCE_PHASE = params ? params.get("phase") : null;

const BASE = import.meta.env.BASE_URL;
const HALL = {
  signin: { level: 0.6, picture: { src: `${BASE}art/masters/wanderer-friedrich-960.webp`, at: [0.5, 0.3], alpha: 0.64 }, lines: ["A place", "traders come."] },
  sent: { level: 0.68, picture: { src: `${BASE}art/japan/torii-tunnel-960.webp`, at: [0.5, 0.5], alpha: 0.86 }, lines: ["Open the email.", "Walk in."] },
  setup: { level: 0.76, picture: { src: `${BASE}art/masters/jerome-writing-caravaggio-960.webp`, at: [0.5, 0.42], alpha: 0.86 }, lines: ["Make the desk", "yours."] },
};

const FrameCtx = createContext(null);
const letters = typeof Path2D === "undefined" ? null : new Path2D(LETTERS);
const drips = typeof Path2D === "undefined" ? null : new Path2D(DRIPS);

// The panel beside the form: the logo and a line of words, with the ink rising a little each step
function paintHall(lines) {
  return (ctx, { w, h, colour }) => {
    const pad = w < 560 ? 20 : Math.min(64, w * 0.07);
    const width = w < 560 ? 176 : Math.min(300, w * 0.42), scale = width / VIEW.w;
    ctx.fillStyle = colour;
    ctx.save();
    ctx.translate(pad - 6 - VIEW.x * scale, (w < 560 ? 14 : pad - 14) - VIEW.y * scale);
    ctx.scale(scale, scale);
    if (letters) { ctx.fill(letters); ctx.fill(drips); }
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const size = Math.min(w < 560 ? 36 : 72, ...lines.map((l) => {
      ctx.font = moneyFont(100);
      return ((w - pad * 2) / ctx.measureText(l).width) * 100;
    }));
    ctx.font = moneyFont(size);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${(-size * 0.04).toFixed(2)}px`;
    const line = size * 1.06, foot = h - (w < 560 ? 20 : pad);
    lines.forEach((l, i) => ctx.fillText(l, pad - size * 0.02, foot - (lines.length - 1 - i) * line));
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  };
}

export function HallFrame({ screen: base = "loading", busy = false, children }) {
  const [over, setOver] = useState(null);
  const screen = over || base;
  const [last, setLast] = useState("signin");
  useEffect(() => { if (HALL[screen]) setLast(screen); }, [screen]);
  const a = HALL[screen] || HALL[last];
  return (
    <FrameCtx.Provider value={setOver}>
      <div className="gate gl gl-hall" data-screen={screen} aria-busy={busy || undefined}>
        <a className="hall-home" href={import.meta.env.PROD ? "/" : "./site.html"} aria-label="Marble, back to the website" />
        <div className={`hall-progress ${busy ? "on" : ""}`} aria-hidden="true"><i /></div>
        <Tank className="hall-ink" zero={0.5} ratio={a.level} paint={paintHall(a.lines)} picture={a.picture} label={a.lines.join(" ")} />
        <div className="hall-side">{children}</div>
      </div>
    </FrameCtx.Provider>
  );
}

function Hall({ screen, children }) {
  return <HallFrame screen={screen}><Stage screen={screen}>{children}</Stage></HallFrame>;
}

export default function Stage({ screen = "other", children }) {
  const setOver = useContext(FrameCtx);
  useLayoutEffect(() => {
    if (!setOver || screen === "other") return undefined;
    setOver(screen);
    return () => setOver(null);
  }, [screen, setOver]);
  if (setOver) return <div className="hall-pane" key={screen}>{children}</div>;
  if (screen !== "other") return <Hall screen={screen}>{children}</Hall>;
  return <div className="gate">{children}</div>;
}
