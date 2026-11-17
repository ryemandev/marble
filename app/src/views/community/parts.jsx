import Logo from "../../components/Logo";
import { CREWS } from "./houses";
import { CRYPTO_RISK } from "../../crypto/public";
import { useMedia } from "../../lib/useMedia.js";
import InkPicture from "../../drip/InkPicture";
import { POST_MONEY } from "../../mode";
import { STAGES, simulated } from "../../drip/accounts";
import { sourceWord } from "../../lib/trail";
import { money } from "../../drip/week";

export const BASE = import.meta.env.BASE_URL;

// A media query, live
export { useMedia };

/* ---------- Time ---------- */

export function ago(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
export const clock = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const longDate = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) + " UK";
export const dayLabel = (iso) => {
  const d = new Date(iso), now = new Date();
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

/* ---------- People ---------- */

export function Av({ who, size = 32, team, anon }) {
  if (team) return <span className="cm-av cm-av-team" style={{ width: size, height: size }} aria-hidden="true"><Logo size={Math.round(size * 0.46)} decorative /></span>;
  if (anon) return <span className="cm-av cm-av-anon" style={{ width: size, height: size }} aria-hidden="true">?</span>;
  return who?.avatar
    ? <InkPicture className="cm-av" src={who.avatar} at="50% 30%" edge={false} style={{ width: size, height: size }} />
    : <span className="cm-av cm-av-mono" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }} aria-hidden="true">{(who?.handle || "?")[0].toUpperCase()}</span>;
}
// Member number (#1 is Marble's first account); only there when its trader shows it
export const No = ({ n }) => (Number.isInteger(n) && n > 0 ? <span className="cm-no num" title={`Member #${n}`}>#{n}</span> : null);
export const Tag = ({ crew }) => (crew ? <span className="cm-tag num" title={CREWS[crew]?.name}>{crew}</span> : null);
export function Who({ who, size = 28, sub, noTag }) {
  return (
    <span className="cm-who">
      <Av who={who} size={size} />
      <span className="cm-who-text">
        <span className="cm-who-name">{who?.handle}<No n={who?.no} />{who?.mine && <span className="cm-you">You</span>}</span>
        {sub && <span className="cm-who-sub">{sub}</span>}
      </span>
      {!noTag && <Tag crew={who?.crew} />}
    </span>
  );
}

function Laurel() {
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const a = ((118 + i * 19) * Math.PI) / 180;
    const x = 24 + 15 * Math.cos(a), y = 23 + 15 * Math.sin(a);
    const rot = 118 + i * 19 + 90 + (i % 2 ? 24 : -24);
    const off = i % 2 ? 2.4 : -1.6;
    leaves.push([x + off * Math.cos(a), y + off * Math.sin(a), rot]);
  }
  const branch = (flip) => (
    <g transform={flip ? "translate(48 0) scale(-1 1)" : undefined}>
      <path d="M21.4 37.8 A15 15 0 0 1 16.5 10" fill="none" stroke="currentColor" strokeWidth="1" />
      {leaves.map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="3.5" ry="1.45" transform={`rotate(${r} ${x} ${y})`} fill="currentColor" />)}
    </g>
  );
  return <>{branch(false)}{branch(true)}<circle cx="24" cy="40" r="1.4" fill="currentColor" /></>;
}
function Enso() {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, a = ((-62 + t * 318) * Math.PI) / 180;
    pts.push([a, 3.6 * Math.pow(1 - t, 0.7) + 0.5 * Math.sin(t * Math.PI) + 0.35]);
  }
  const ring = (side) => pts.map(([a, w]) => { const r = 15 + (side * w) / 2; return [24 + r * Math.cos(a), 24 + r * Math.sin(a)]; });
  const d = [...ring(1), ...ring(-1).reverse()].map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
  return <path d={d} fill="currentColor" />;
}
function Tach() {
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const a = ((150 + i * 24) * Math.PI) / 180, r1 = i >= 8 ? 10.5 : 12, r2 = 15.5;
    ticks.push(<line key={i} x1={24 + r1 * Math.cos(a)} y1={28 + r1 * Math.sin(a)} x2={24 + r2 * Math.cos(a)} y2={28 + r2 * Math.sin(a)} stroke="currentColor" strokeWidth={i >= 8 ? 1.8 : 1} />);
  }
  const n = (318 * Math.PI) / 180;
  return (
    <>
      {ticks}
      <line x1="24" y1="28" x2={24 + 13 * Math.cos(n)} y2={28 + 13 * Math.sin(n)} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="28" r="2.2" fill="currentColor" />
      <path d="M17 38.5 H31" stroke="currentColor" strokeWidth="1" />
    </>
  );
}
const MARKS = { OLY: Laurel, NITE: Enso, PIT: Tach };
export function Crest({ crew, size = 28 }) {
  const M = MARKS[crew];
  if (!M) return null;
  return <svg className="cm-crest" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"><M /></svg>;
}

/* ---------- Discipline marks ---------- */

export function DayStrip({ strip = "" }) {
  const s = [...String(strip)];
  const kept = s.filter((d) => d === "k").length, broke = s.filter((d) => d === "b").length;
  return (
    <span className="cm-days" role="img" aria-label={`${kept} ${kept === 1 ? "day" : "days"} with every rule kept, ${broke} broken`}>
      {s.map((d, i) => <i key={i} className={d === "k" ? "k" : d === "b" ? "b" : d === "-" ? "n" : "f"} />)}
    </span>
  );
}

export const Meter = ({ value, max = 100 }) => (
  <span className="meter cm-meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></span>
);

export function Move({ n }) {
  if (n == null) return null;
  if (!n) return <span className="cm-move flat" aria-label="No change since yesterday">–</span>;
  return <span className={`cm-move ${n > 0 ? "up" : "down"} num`} aria-label={`${n > 0 ? "Up" : "Down"} ${Math.abs(n)} since yesterday`}>{n > 0 ? "▲" : "▼"}{Math.abs(n)}</span>;
}

export const Kicker = ({ children, live }) => <span className="cm-kicker">{live && <i className="cm-live-dot" aria-hidden="true" />}{children}</span>;

// A post's trade says what a card says: the stage, whether it's simulated, and the one word for where it came from
const stageLabel = (t) => (STAGES[t?.stage] ? `${STAGES[t.stage]}${simulated(t.stage) ? " · Simulated" : ""}` : null);
const tieOf = (t) => [stageLabel(t), sourceWord([{ source: t?.src }])].filter(Boolean).join(" · ");
// Dollars where a post has them. Where it doesn't, the trade still says which way it closed.
const dollarsOf = (t) => (POST_MONEY && t?.pnl != null && Number.isFinite(+t.pnl) ? +t.pnl : null);
const wayOf = (t) => (t?.r == null ? null : +t.r < 0 ? "Closed down" : "Closed up");

// The tie alone, for a post whose card already shows the trade
export function TradeTie({ t }) {
  if (!t) return null;
  return <p className="fl-ties">{tieOf(t)}</p>;
}

// A post's trade, dollars first, on a grey panel that says where it came from

export function TradeCard({ t }) {
  if (!t) return null;
  const long = /^l/i.test(t.side || "");
  const dollars = dollarsOf(t);
  const way = wayOf(t);
  return (
    <div className={`fl-slab ${dollars == null ? "plain" : ""}`}>
      {dollars != null && <b className={`fl-slab-r ${dollars < 0 ? "loss" : ""}`}>{money(dollars, { sign: true })}</b>}
      <div className="fl-slab-top">
        <span className="fl-slab-what"><b>{t.sym} {long ? "long" : "short"}</b>{t.setup && <span>{t.setup}</span>}</span>
        {dollars == null && way && <b className="fl-slab-way">{way}</b>}
      </div>
      {tieOf(t) && <div className="fl-slab-foot"><span>{tieOf(t)}</span></div>}
      {t.world === "crypto" && <p className="fl-slab-risk">{CRYPTO_RISK}</p>}
    </div>
  );
}

// A section's picture, big, with its words underneath
export function Banner({ img, pos = "50% 30%", kicker, crest, title, line2, children, side }) {
  return (
    <header className="fl-banner">
      <InkPicture className="fl-banner-pic" src={img} at={pos} />
      <div className="fl-banner-words">
        {(kicker || crest) && <div className="fl-banner-kicker">{crest && <Crest crew={crest} size={24} />}<span>{kicker}</span></div>}
        <h2 className="loud">{title}{line2 && <span>{line2}</span>}</h2>
        {children}
      </div>
      {side && <div className="fl-banner-side">{side}</div>}
    </header>
  );
}

/* ---------- Switches ---------- */

export function Seg({ items, value, onChange, label }) {
  return (
    <div className="cm-seg" role="group" aria-label={label}>
      {items.map((it) => {
        const [k, l] = Array.isArray(it) ? it : [it, it];
        return <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>;
      })}
    </div>
  );
}

export function Note({ children, retry }) {
  return (
    <p className="cm-empty">{children}{retry && <> <button type="button" className="link" onClick={retry}>Try again</button></>}</p>
  );
}

export const REPORT_REASONS = [["spam", "Spam or selling"], ["abuse", "Abuse or harassment"], ["advice", "Signals or financial advice"], ["other", "Something else"]];

// Choosing why you're reporting something, inline
export function ReportPicker({ onPick, onCancel }) {
  return (
    <span className="cm-report" role="group" aria-label="Why are you reporting this?">
      <span className="xs faint">Report for:</span>
      {REPORT_REASONS.map(([k, l]) => <button key={k} type="button" className="link xs" onClick={() => onPick(l)}>{l}</button>)}
      <button type="button" className="link xs faint" onClick={onCancel}>Cancel</button>
    </span>
  );
}
