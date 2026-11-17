import { useRef, useState } from "react";
import Tank from "../../drip/Tank";
import { StartFree } from "../heroes/shared";
import { CREWS } from "../../sample";
import DripEdge from "../ink/DripEdge";
import Lines from "../ink/Lines";
import { between, useIn, useProgress } from "../ink/useRise";
import "./crews.css";

const BASE = import.meta.env.BASE_URL;
// 96px squares; traders without one get their initial
const AVATARS = {
  "marcus.r": "site/fl-av-marcus-r.webp", priya: "site/fl-av-priya.webp", leo: "site/fl-av-leo.webp", kenji: "site/fl-av-kenji.webp",
  ava: "site/fl-av-ava.webp", sol: "site/fl-av-sol.webp", "tom.w": "site/fl-av-tom-w.webp",
};

const TOP = 7;
// Sample days and trades, latest first. Never sorted by money: red sits where its time puts it.
const SHARED = [
  { user: "priya", crew: "NITE", what: "Closed · 2 trades", at: "16:52", money: "+$312" },
  { user: "kenji", crew: "PIT", what: "Closed · 5 trades", at: "16:48", money: "−$640" },
  { user: "marcus.r", crew: "OLY", what: "Closed · 3 trades", at: "16:41", money: "+$467" },
  { user: "ava", crew: "PIT", what: "NQ long", at: "16:20", money: "+$1,320" },
  { user: "leo", crew: "OLY", what: "Closed · 1 trade", at: "16:05", money: "−$185" },
  { user: "sol", crew: null, what: "GC short", at: "15:48", money: "+$890" },
  { user: "tom.w", crew: null, what: "Closed · 4 trades", at: "15:31", money: "−$228" },
  { user: "mira.k", crew: "OLY", what: "Closed · 2 trades", at: "15:12", money: "+$96" },
  { user: "cato", crew: "OLY", what: "ES short", at: "14:37", money: "−$410" },
  { user: "theo", crew: "OLY", what: "Closed · 3 trades", at: "14:02", money: "+$275" },
  { user: "ines", crew: "OLY", what: "CL long", at: "13:46", money: "+$558" },
  { user: "felix", crew: "OLY", what: "Closed · 2 trades", at: "13:15", money: "−$121" },
];
const LISTS = { OLY: SHARED.filter((r) => r.crew === "OLY").slice(0, TOP), all: SHARED.slice(0, TOP) };

// How many of each sample crew are in its room right now
const HERE = { OLY: 268, NITE: 112, PIT: 62 }; // full enough that each picture shows, not just its foot
const HOUSES = [
  { tag: "OLY", src: "art/masters/charging-chasseur-gericault.webp", at: [0.5, 0.3] },
  { tag: "NITE", src: "art/anime/night-figure.webp", at: [0.5, 0.42] },
  { tag: "PIT", src: "art/cars/aston-dbs-tall.webp", at: [0.5, 0.7] },
].map((h) => ({ ...CREWS.find((c) => c.tag === h.tag), ...h, here: HERE[h.tag] }));

function Avatar({ user, size = 28 }) {
  const src = AVATARS[user];
  return src
    ? <img className="fl-av" src={BASE + src} width={size} height={size} alt="" loading="lazy" decoding="async" />
    : <span className="fl-av fl-av-mono" style={{ width: size, height: size }} aria-hidden="true">{user[0].toUpperCase()}</span>;
}

/* ---------- The crews: each a tank, and what fills it is who's in the room ---------- */

// Drawn inside the tank, so the words turn at the ink's edge
const painted = (name, here) => (ctx, { w, h, colour }) => {
  const pad = Math.max(16, Math.min(26, w * 0.06));
  const big = Math.round(Math.min(w * 0.2, h * 0.3, 92)), small = Math.round(Math.min(w * 0.058, 22) + 4);
  ctx.fillStyle = colour;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${small}px Unbounded, sans-serif`;
  ctx.fillText(name, pad, pad + small * 0.86);
  ctx.font = `800 ${big}px Unbounded, sans-serif`;
  const n = String(here);
  ctx.fillText(n, pad - big * 0.04, h - pad);
  const after = ctx.measureText(n).width;
  ctx.font = `800 ${small}px Unbounded, sans-serif`;
  ctx.fillText("here", pad + after + small * 0.4, h - pad);
  // The label rides on the tank, so a picture of one tank alone still says what its number is. It sits low, in the
  // ink, where the moving edge doesn't cut through it.
  ctx.font = `500 ${Math.max(12, Math.round(small * 0.52))}px Geist, system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("Sample data", w - pad, h - pad);
};

function House({ h, level }) {
  const paint = painted(h.name, Math.round(h.here * level));
  return (
    <Tank className="fl-tank" ratio={(h.here / h.members) * level} zero={0.98} paint={paint} picture={{ src: BASE + h.src, at: h.at, alpha: 1 }}
      label={`${h.name}: ${h.here} of ${h.members} traders in the room now, sample data`} />
  );
}

/* ---------- What traders shared today ---------- */

const SCOPES = [["OLY", "Olympians"], ["all", "Everyone"]];
const ROW = 60;

function SharedList() {
  const [scope, setScope] = useState("all");
  const list = LISTS[scope];
  const people = [...new Set(Object.values(LISTS).flatMap((l) => l.map((r) => r.user)))];
  return (
    <div className="fl-board">
      <div className="fl-board-head">
        <div><h3>On the Floor today</h3><p>Sample data, not real traders' results.</p></div>
        <div className="fl-seg" role="group" aria-label="Who">
          {SCOPES.map(([k, label]) => <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}>{label}</button>)}
        </div>
      </div>
      <ol className="fl-rows" style={{ height: ROW * list.length }}>
        {people.map((user) => {
          const at = list.findIndex((r) => r.user === user);
          const r = SHARED.find((x) => x.user === user);
          return (
            <li key={user} style={{ transform: `translate3d(0, ${(at < 0 ? TOP : at) * ROW}px, 0)`, opacity: at < 0 ? 0 : 1, visibility: at < 0 ? "hidden" : "visible" }} aria-hidden={at < 0 || undefined}>
              <Avatar user={user} size={32} />
              <span className="fl-who">{user}<small>{r.what} · {r.at}</small></span>
              {r.crew && <span className="fl-tag">{r.crew}</span>}
              <span className="num fl-rate">{r.money}</span>
            </li>
          );
        })}
      </ol>
      <p className="fl-foot">Sample days and trades, green and red alike. A post shows dollars only when its trader attaches a trade or a card.</p>
    </div>
  );
}

/* ---------- The section ---------- */

export default function Crews() {
  const root = useRef(null), stage = useRef(null);
  const p = useProgress(root, stage);
  const rest = useIn();
  return (
    <section id="community" className="fl" aria-labelledby="fl-h">
      <div className="fl-run" ref={root}>
        <div className="fl-stage" ref={stage}>
          <DripEdge />
          <header className="fl-head">
            <Lines id="fl-h" className="fl-title" text="Traders who journal," silver="in one place." />
            <p className="fl-lede">The Floor is Marble's live home. Three crews, each with its own room, and a feed of trades and lessons, red ones included.</p>
          </header>
          <div className="fl-tanks">
            {HOUSES.map((h, i) => <House key={h.tag} h={h} level={between(p, 0.03 + i * 0.1, 0.52 + i * 0.1)} />)}
          </div>
          <p className="fl-note">Traders in each crew's room right now. Sample data.</p>
        </div>
      </div>
      <div className="fl-rest" ref={rest}>
        <div className="up"><SharedList /></div>
        <div className="fl-also up" style={{ "--i": 1 }}>
          <ul>
            <li><b>Feed</b><span>Post your wins, your losses, your lessons and your questions, under your name or anonymously.</span></li>
            <li><b>Chat</b><span>General, seven topic rooms and your crew's private room. Share what you see, not what to do.</span></li>
            <li><b>Your crew</b><span>A team you trade the month with, and a private room to talk your days through.</span></li>
            <li><b>Your cards</b><span>Close a day and you get a card to share. Every one you've made is kept here.</span></li>
          </ul>
          <StartFree>Pick your crew</StartFree>
        </div>
      </div>
    </section>
  );
}
