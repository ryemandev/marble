import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StartFree, reduced } from "../heroes/shared";
import { svgRef } from "../../components/svgRef";
import "./anatomy.css";

const PARTS = ["setup", "entry", "stop", "feel", "exit", "result", "stats", "note"];
const NUMERAL = { setup: "1", entry: "2", stop: "3", feel: "4", exit: "5", result: "6", stats: "7", note: "8" };
const LEFT = ["setup", "entry", "stop", "feel"];
const RIGHT = ["exit", "result", "stats", "note"];

const q = (v) => Math.round(v * 4) / 4; // NQ moves in quarter points
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const fmt = (p) => p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function walk(points, n, r, amp) {
  return Array.from({ length: n }, (_, i) => {
    const k = points.findIndex(([at]) => at >= i);
    const [x1, y1] = points[Math.max(0, k)], [x0, y0] = points[Math.max(0, k - 1)];
    const t = x1 === x0 ? 1 : (i - x0) / (x1 - x0);
    const edge = points.some(([at]) => at === i);
    return q(y0 + (y1 - y0) * t + (edge ? 0 : (r() - 0.5) * amp));
  });
}
function bars(closes, open0, r) {
  let prev = open0;
  return closes.map((c) => {
    const o = prev;
    prev = c;
    return { o, c, h: q(Math.max(o, c) + 0.25 + r() * 1.5), l: q(Math.min(o, c) - 0.25 - r() * 1.5) };
  });
}

function plateKept() {
  const r = rng(20261021);
  const orHi = 21410, orLo = 21404, entry = 21412.25, stop = 21402.25, target = 21432.25;
  const range = [21406.5, 21408.75, 21405.25, 21407.5, 21409.25, 21406, 21404.75, 21407, 21408.5, 21405.75, 21407.25, 21409, 21406.5, 21408, 21409.5];
  const breakout = [21411.75, 21414.5, 21417.25, 21416, 21413.25, 21411.5, 21412];
  const trend = walk([[0, 21413.5], [4, 21419.75], [8, 21414.25], [12, 21421.5], [16, 21418.25], [21, 21426.75], [25, 21423.5], [29, 21431]], 30, r, 2.2);
  const after = [21430.25, 21429, 21429.75, 21428.25, 21427.5];
  const c = bars([...range, ...breakout, ...trend, ...after], 21405.75, r);
  c.forEach((b, i) => {
    if (i < 15) { b.h = Math.min(b.h, orHi); b.l = Math.max(b.l, orLo); }
    if (i >= 22) b.l = Math.max(b.l, 21408.5);
    if (i !== 51) b.h = Math.min(b.h, target - 0.5);
  });
  c[4].h = orHi; c[6].l = orLo;
  c[20].l = 21410.25;
  c[51].h = target;
  return {
    id: "kept", tab: "Trade 1", title: "A long, on the retest", meta: "+$400", day: "Wed 21 Oct",
    t0: 9 * 60 + 30, bars: c, lo: 21399, hi: 21436,
    entry: { i: 22, s: 0, p: entry }, exit: { i: 51, s: 40, p: target }, stop, target, orHi, orLo,
    win: true,
    calls: {
      setup: { cap: "Setup", val: "ORB retest", sub: "The first 15 minutes marked, then a one-minute close back above the range." },
      entry: { cap: "Entry", val: `Long 1 NQ at ${fmt(entry)}`, sub: "09:52 ET, on the first close back above the range." },
      stop: { cap: "Stop", val: `${fmt(stop)} · 10 pts`, sub: "Beyond the range, with $200 at risk." },
      feel: { cap: "Feeling at entry", val: "Calm", sub: "Waited six minutes for the retest to hold." },
      exit: { cap: "Exit", val: `${fmt(target)} at 10:21`, sub: "Target: yesterday's high, the next pool of liquidity." },
      result: { cap: "Result", val: "+$400", sub: "20 points on one contract, worked out from the prices." },
      stats: { cap: "In your Stats", val: "ORB retest: +$2,180 this month", sub: "It joins its setup, its hour and its weekday, so you can see where the money comes from." },
      note: { cap: "Note", val: "“Let the retest close before I clicked. Same size, same patience tomorrow.”" },
    },
    row: { when: "Wed 21 Oct · 09:52", what: "NQ long · ORB retest", feel: "Calm", held: "Held 29 min", pnl: "+$400" },
  };
}

function plateBroken() {
  const r = rng(77);
  const entry = 21448.75, planned = 21438.75, moved = 21433.75;
  const drift = walk([[0, 21429.5], [5, 21432.25], [9, 21431], [13, 21435.25]], 14, r, 1.6);
  const c = bars(drift, 21429, r);
  c.push(
    { o: 21435.5, h: 21450.25, l: 21434.75, c: 21447.75 }, // 10:00 the release
    { o: 21447.75, h: 21448.5, l: 21443, c: 21444.25 },
    { o: 21444.25, h: 21445, l: 21440.25, c: 21441.5 },
    { o: 21441.5, h: 21442.5, l: 21439.25, c: 21440.25 }, // 10:03 stop moved down
    { o: 21440.25, h: 21440.75, l: 21437, c: 21437.5 },   // 10:04 the planned stop would have filled
    { o: 21437.5, h: 21438.5, l: 21435.25, c: 21436.25 },
    { o: 21436.25, h: 21437, l: 21433.75, c: 21434.5 },   // 10:06 stopped at the moved stop
  );
  let prev = 21434.5;
  for (const close of [21435.75, 21437.25, 21436.5, 21438, 21437.25, 21439]) {
    c.push({ o: prev, c: close, h: q(Math.max(prev, close) + 0.5 + r()), l: q(Math.min(prev, close) - 0.5 - r()) });
    prev = close;
  }
  let e = 21427.25;
  const ema = c.map((b) => (e = e + (b.c - e) * (2 / 21)));
  const gap = Math.round(entry - ema[14]);
  return {
    id: "broken", tab: "Trade 2", title: "A long, taken in revenge", meta: "−$300", day: "Thu 22 Oct",
    t0: 9 * 60 + 46, bars: c, lo: 21427, hi: 21453, ema, gap,
    entry: { i: 14, s: 46, p: entry }, exit: { i: 20, s: 30, p: moved }, stop: planned, moved, prev: { i: 14, s: 6, p: 21441 },
    win: false,
    calls: {
      setup: { cap: "Setup", val: "Trend pullback", sub: "Meant to be a pullback to the 20 EMA. It came in on the news instead." },
      entry: { cap: "Entry", val: `Long 1 NQ at ${fmt(entry)}`, sub: `10:00:46 ET, into the release, ${gap} points above the 20 EMA.` },
      stop: { cap: "Stop", val: `${fmt(planned)} → ${fmt(moved)}`, sub: "Planned 10 pts away, then moved 5 lower. That made $200 at risk into $300." },
      feel: { cap: "Feeling at entry", val: "Revenge", sub: "40 seconds after the last trade stopped out." },
      exit: { cap: "Exit", val: `${fmt(moved)} at 10:06`, sub: "Stopped, at the stop it was moved to." },
      result: { cap: "Result", val: "−$300", sub: "15 points on one contract. The first stop would have lost $200." },
      stats: { cap: "In your Stats", val: "Revenge trades: −$1,140 this month", sub: "It joins the feeling it came from, so you can see what that feeling has cost." },
      note: { cap: "Note", val: "“Chased the spike to win the last one back. After a stop-out, walk away for five minutes.”" },
    },
    row: { when: "Thu 22 Oct · 10:00", what: "NQ long · Trend pullback", feel: "Revenge", held: "Held 6 min", pnl: "−$300" },
  };
}

function geometry(P, w, h, compact) {
  const padL = compact ? 6 : 14, padR = compact ? 50 : 66, padT = compact ? 22 : 30, padB = compact ? 24 : 30;
  const plotW = Math.max(1, w - padL - padR), plotH = Math.max(1, h - padT - padB);
  const n = P.bars.length, cw = plotW / n;
  const x = (i, s = 30) => padL + (i + s / 60) * cw; // a bar's minute, and the second within it
  const cx = (i) => Math.round(padL + (i + 0.5) * cw);
  const y = (p) => padT + (1 - (p - P.lo) / (P.hi - P.lo)) * plotH;
  const right = padL + plotW, bottom = padT + plotH;
  const ex = x(P.entry.i, P.entry.s), ey = y(P.entry.p), xx = x(P.exit.i, P.exit.s), xy = y(P.exit.p);
  const kept = P.id === "kept";
  const waitY = Math.round(y(Math.min(...P.bars.slice(16, 22).map((b) => b.l))) + 16);
  const bracketX = Math.round(xx + Math.max(12, cw * 1.6));
  const anchors = kept
    ? {
        setup: [x(7.5, 0), y(P.orHi)],
        entry: [ex, ey],
        stop: [ex + cw * 3, y(P.stop)],
        feel: [(x(16, 0) + x(22, 0)) / 2, waitY],
        exit: [xx, xy],
        result: [bracketX, (ey + xy) / 2],
        stats: [xx - 18, y(P.target) - 12],
        note: [(ex + xx) / 2 + cw * 4, (ey + xy) / 2 + 8],
      }
    : {
        setup: [x(6), y(P.ema[6])],
        entry: [ex, ey],
        stop: [ex + cw * 1.5, y(P.stop)],
        feel: [x(P.prev.i, P.prev.s), y(P.prev.p)],
        exit: [xx, xy],
        result: [bracketX, (ey + xy) / 2],
        stats: [x(17, 0) - 12, (y(P.stop) + y(P.moved)) / 2],
        note: [(ex + xx) / 2 + cw, (ey + xy) / 2 + 10],
      };
  const tips = { ...anchors, stats: [anchors.stats[0] + 12, anchors.stats[1]] };
  const keepOut = kept ? [{ l: Math.round(x(0, 0)) + 2, r: Math.round(x(0, 0)) + 2 + 13 * (compact ? 6.6 : 7.4), t: Math.round(y(P.orLo)) + 15 - 9, b: Math.round(y(P.orLo)) + 15 + 2 }] : [];
  return { padL, padR, padT, padB, plotW, plotH, cw, x, cx, y, right, bottom, ex, ey, xx, xy, waitY, bracketX, anchors, tips, keepOut, compact };
}

const crisp = (v) => Math.round(v) + 0.5;

function pins(g) {
  const placed = [];
  for (const part of PARTS) {
    const label = NUMERAL[part], pw = Math.round(10 + label.length * 6.5);
    let [ax, ay] = g.anchors[part];
    for (const k of g.keepOut) {
      if (ax - pw / 2 < k.r + 6 && ax + pw / 2 > k.l - 6 && ay - 8 < k.b + 3 && ay + 8 > k.t - 3) ax = Math.min(g.right - pw / 2, k.r + 6 + pw / 2);
    }
    const hit = (y) => placed.some((p) => Math.abs(p.ax - ax) < (p.pw + pw) / 2 + 3 && Math.abs(p.ay - y) < 17);
    for (let k = 1, y0 = ay; hit(ay) && k < 12; k++) {
      const step = Math.ceil(k / 2) * 17 * (k % 2 ? 1 : -1);
      ay = Math.max(g.padT + 8, Math.min(g.bottom - 8, y0 + step));
    }
    placed.push({ part, ax, ay, label, pw });
  }
  return placed;
}

function barParts(P, i) {
  if (P.id === "kept") {
    const p = [];
    if (i < 15) p.push("setup");
    if (i >= 16 && i < 22) p.push("feel");
    if (i === 20) p.push("setup", "stats");
    if (i >= 22 && i <= 51) p.push("note");
    if (i === 22) p.push("entry");
    if (i === 51) p.push("exit");
    return p;
  }
  const p = [];
  if (i === 14) p.push("entry", "feel", "stats");
  if (i >= 14 && i <= 20) p.push("note");
  if (i === 20) p.push("exit");
  return p;
}

/* ---------- The plate ---------- */

function Plate({ P, w, h, active, drawn, numbered }) {
  const id = useId().replace(/:/g, "");
  const g = geometry(P, w, h, w < 520);
  const on = (...parts) => (active ? (parts.includes(active) ? " on" : " dim") : "");
  const bw = Math.max(1, Math.floor(g.cw * 0.62) | 1);
  const hatch = bw >= 5;
  const ticks = [];
  for (let p = Math.ceil(P.lo); p <= P.hi; p++) ticks.push(p);
  const last = P.bars.length - 1;
  const kept = P.id === "kept";

  return (
    <div className="ja-chart" style={{ height: h }}>
      <svg className="ja-base" width={w} height={h} aria-hidden="true">
        {ticks.filter((p) => p % 5 === 0).map((p) => <line key={`g${p}`} x1={g.padL} x2={g.right} y1={crisp(g.y(p))} y2={crisp(g.y(p))} className="ja-guide" />)}
        <line x1={crisp(g.right + 6)} x2={crisp(g.right + 6)} y1={g.padT} y2={g.bottom} className="ja-ruler" />
        {ticks.map((p) => (
          <line key={p} x1={crisp(g.right + 6)} x2={crisp(g.right + 6) + (p % 5 === 0 ? 7 : 3)} y1={crisp(g.y(p))} y2={crisp(g.y(p))} className="ja-ruler" />
        ))}
        {ticks.filter((p) => p % 5 === 0).map((p) => (
          <text key={`t${p}`} x={g.right + 16} y={Math.round(g.y(p)) + 3.5} className="ja-tick">{g.compact ? String(p).slice(-3) : p.toLocaleString("en-US")}</text>
        ))}
        <line x1={g.padL} x2={g.right} y1={crisp(g.bottom + 6)} y2={crisp(g.bottom + 6)} className="ja-ruler" />
        {P.bars.map((_, i) => {
          const m = P.t0 + i, major = m % 10 === 0;
          return <line key={`m${i}`} x1={crisp(g.x(i, 0))} x2={crisp(g.x(i, 0))} y1={crisp(g.bottom + 6)} y2={crisp(g.bottom + 6) + (major ? 7 : 3)} className="ja-ruler" />;
        })}
        {P.bars.map((_, i) => (P.t0 + i) % 10 === 0 && g.x(i, 0) - g.padL >= 16 && (
          <text key={`l${i}`} x={g.x(i, 0)} y={h - 4} textAnchor="middle" className="ja-tick">{clock(P.t0 + i)}</text>
        ))}
      </svg>

      <div className={`ja-ink ${drawn ? "drawn" : ""}`}>
        <svg width={w} height={h} role="img" aria-label={`${P.title}: NQ, one-minute bars. ${P.calls.entry.val}, exit ${P.calls.exit.val}, ${P.calls.result.val}.`}>
          <defs>
            <pattern id={`u${id}`} patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><line x1="0.5" y1="0" x2="0.5" y2="3" className="ja-hatch-up" /></pattern>
            <pattern id={`d${id}`} patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><line x1="0.5" y1="0" x2="0.5" y2="3" className="ja-hatch-dn" /><line x1="0" y1="0.5" x2="3" y2="0.5" className="ja-hatch-dn" /></pattern>
            <pattern id={`f${id}`} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(-45)"><line x1="0.5" y1="0" x2="0.5" y2="4" className="ja-hatch-zone" /></pattern>
            <pattern id={`r${id}`} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0.5" y1="0" x2="0.5" y2="4" className="ja-hatch-risk" /></pattern>
          </defs>

          {kept ? (
            <>
              <rect className={`ja-m ja-zone${on("setup")}`} x={Math.round(g.x(0, 0)) + 0.5} y={crisp(g.y(P.orHi))} width={Math.round(g.x(15, 0) - g.x(0, 0)) - 1} height={Math.round(g.y(P.orLo) - g.y(P.orHi))} fill={svgRef(`f${id}`)} />
              <text className={`ja-m ja-lab${on("setup")}`} x={Math.round(g.x(0, 0)) + 2} y={Math.round(g.y(P.orLo)) + 15} style={g.compact ? { letterSpacing: "0.06em" } : undefined}>Opening range</text>
              <rect className={`ja-m ja-zone reward${on("note", "exit")}`} x={Math.round(g.ex)} y={Math.round(g.y(P.target))} width={Math.round(g.xx - g.ex)} height={Math.round(g.ey - g.y(P.target))} fill={svgRef(`f${id}`)} />
              <rect className={`ja-m ja-zone risk${on("stop")}`} x={Math.round(g.ex)} y={Math.round(g.ey)} width={Math.round(g.xx - g.ex)} height={Math.round(g.y(P.stop) - g.ey)} fill={svgRef(`r${id}`)} />
              <line className={`ja-m ja-level${on("exit", "stats")}`} x1={g.padL} x2={g.right} y1={crisp(g.y(P.target))} y2={crisp(g.y(P.target))} />
              <text className={`ja-m ja-lab${on("exit", "stats")}`} x={g.padL + 4} y={Math.round(g.y(P.target)) - 6}>Yesterday's high</text>
            </>
          ) : (
            <>
              <polyline className={`ja-m ja-ema${on("setup", "stats")}`} points={P.ema.map((v, i) => `${g.x(i).toFixed(1)},${g.y(v).toFixed(1)}`).join(" ")} />
              <text className={`ja-m ja-lab${on("setup")}`} x={g.padL + 4} y={Math.round(g.y(P.ema[0])) + 16}>20 EMA</text>
              <line className={`ja-m ja-news${on("stats")}`} x1={crisp(g.x(14, 0))} x2={crisp(g.x(14, 0))} y1={g.padT} y2={g.bottom} />
              <text className={`ja-m ja-lab${on("stats")}`} x={Math.round(g.x(14, 0)) + 6} y={g.bottom - 6}>{g.compact ? "10:00 release" : "10:00 · Consumer sentiment"}</text>
              <rect className={`ja-m ja-zone risk${on("note", "result")}`} x={Math.round(g.ex)} y={Math.round(g.ey)} width={Math.round(g.xx - g.ex)} height={Math.round(g.y(P.moved) - g.ey)} fill={svgRef(`r${id}`)} />
            </>
          )}

          {P.bars.map((b, i) => {
            const up = b.c >= b.o, parts = barParts(P, i);
            const lit = active ? (parts.includes(active) ? " on" : " dim") : "";
            const after = i > P.exit.i ? " after" : "";
            const x0 = g.cx(i) - (bw >> 1);
            const top = Math.round(g.y(Math.max(b.o, b.c))), bot = Math.round(g.y(Math.min(b.o, b.c)));
            return (
              <g key={i} className={`ja-bar ${up ? "up" : "dn"}${lit}${after}`}>
                <line x1={g.cx(i) + 0.5} x2={g.cx(i) + 0.5} y1={Math.round(g.y(b.h))} y2={Math.round(g.y(b.l))} />
                {bot - top < 2
                  ? <line x1={x0} x2={x0 + bw} y1={top + 0.5} y2={top + 0.5} />
                  : <rect x={x0 + 0.5} y={top + 0.5} width={bw - 1} height={bot - top - 1} fill={hatch ? svgRef(`${up ? "u" : "d"}${id}`) : undefined} className={hatch ? "" : "solid"} />}
              </g>
            );
          })}

          <line className={`ja-m ja-entry${on("entry", "note")}`} x1={Math.round(g.ex)} x2={Math.round(g.xx)} y1={crisp(g.ey)} y2={crisp(g.ey)} />
          {kept ? (
            <>
              <line className={`ja-m ja-stop${on("stop", "stats")}`} x1={Math.round(g.ex)} x2={Math.round(g.xx)} y1={crisp(g.y(P.stop))} y2={crisp(g.y(P.stop))} />
              <text className={`ja-m ja-lab${on("stop")}`} x={Math.round(g.xx) - 4} y={Math.round(g.y(P.stop)) + 14} textAnchor="end">Stop</text>
              <g className={`ja-m ja-dim-line${on("feel")}`}>
                <line x1={Math.round(g.x(16, 0))} x2={Math.round(g.x(22, 0))} y1={g.waitY + 0.5} y2={g.waitY + 0.5} />
                <line x1={Math.round(g.x(16, 0)) + 0.5} x2={Math.round(g.x(16, 0)) + 0.5} y1={g.waitY - 4} y2={g.waitY + 5} />
                <line x1={Math.round(g.x(22, 0)) + 0.5} x2={Math.round(g.x(22, 0)) + 0.5} y1={g.waitY - 4} y2={g.waitY + 5} />
                {!g.compact && <text x={(g.x(16, 0) + g.x(22, 0)) / 2} y={g.waitY + (numbered ? 21 : 16)} textAnchor="middle">6 min</text>}
              </g>
            </>
          ) : (
            <>
              <line className={`ja-m ja-stop planned${on("stop", "result")}`} x1={Math.round(g.ex)} x2={Math.round(g.x(18))} y1={crisp(g.y(P.stop))} y2={crisp(g.y(P.stop))} />
              <circle className={`ja-m ja-ghost${on("stop", "result")}`} cx={g.x(18)} cy={g.y(P.stop)} r="3.5" />
              {!g.compact && <text className={`ja-m ja-lab${on("stop", "result")}`} x={Math.round(g.x(18)) + 8} y={Math.round(g.y(P.stop)) - 6}>First stop: −$200</text>}
              <line className={`ja-m ja-stop moved${on("stop", "exit")}`} x1={Math.round(g.x(17, 0))} x2={Math.round(g.xx)} y1={crisp(g.y(P.moved))} y2={crisp(g.y(P.moved))} />
              <g className={`ja-m ja-arrow${on("stop", "stats")}`}>
                <line x1={crisp(g.x(17, 0))} x2={crisp(g.x(17, 0))} y1={Math.round(g.y(P.stop)) + 3} y2={Math.round(g.y(P.moved)) - 2} />
                <path d={`M${crisp(g.x(17, 0)) - 3},${Math.round(g.y(P.moved)) - 6} L${crisp(g.x(17, 0))},${Math.round(g.y(P.moved)) - 1} L${crisp(g.x(17, 0)) + 3},${Math.round(g.y(P.moved)) - 6}`} />
              </g>
              {!g.compact && <text className={`ja-m ja-lab${on("stop")}`} x={Math.round(g.x(17, 0)) - 6} y={Math.round(g.y(P.moved)) + 14} textAnchor="end">Moved 10:03</text>}
              <g className={`ja-m ja-dim-line${on("setup", "stats", "entry")}`}>
                <line x1={Math.round(g.ex) - 10.5} x2={Math.round(g.ex) - 10.5} y1={Math.round(g.ey)} y2={Math.round(g.y(P.ema[14]))} />
                <line x1={Math.round(g.ex) - 14} x2={Math.round(g.ex) - 6} y1={crisp(g.ey)} y2={crisp(g.ey)} />
                <line x1={Math.round(g.ex) - 14} x2={Math.round(g.ex) - 6} y1={crisp(g.y(P.ema[14]))} y2={crisp(g.y(P.ema[14]))} />
              </g>
              <g className={`ja-m ja-prev${on("feel")}`} transform={`translate(${Math.round(g.x(P.prev.i, P.prev.s))},${Math.round(g.y(P.prev.p))})`}>
                <path d="M-3.5,-3.5 L3.5,3.5 M3.5,-3.5 L-3.5,3.5" />
              </g>
              <g className={`ja-m ja-dim-line${on("feel")}`}>
                <line x1={Math.round(g.x(P.prev.i, P.prev.s))} x2={Math.round(g.ex)} y1={crisp(g.y(P.bars[14].h) - 14)} y2={crisp(g.y(P.bars[14].h) - 14)} />
                <line x1={crisp(g.x(P.prev.i, P.prev.s))} x2={crisp(g.x(P.prev.i, P.prev.s))} y1={Math.round(g.y(P.bars[14].h) - 18)} y2={Math.round(g.y(P.bars[14].h) - 9)} />
                <line x1={crisp(g.ex)} x2={crisp(g.ex)} y1={Math.round(g.y(P.bars[14].h) - 18)} y2={Math.round(g.y(P.bars[14].h) - 9)} />
                <text x={(g.x(P.prev.i, P.prev.s) + g.ex) / 2} y={Math.round(g.y(P.bars[14].h) - 22)} textAnchor="middle">40 s</text>
              </g>
            </>
          )}

          <g className={`ja-m ja-dim-line${on("result")}`}>
            <line x1={g.bracketX + 0.5} x2={g.bracketX + 0.5} y1={Math.round(Math.min(g.ey, g.xy))} y2={Math.round(Math.max(g.ey, g.xy))} />
            <line x1={g.bracketX - 4} x2={g.bracketX + 5} y1={crisp(g.ey)} y2={crisp(g.ey)} />
            <line x1={g.bracketX - 4} x2={g.bracketX + 5} y1={crisp(g.xy)} y2={crisp(g.xy)} />
            {!g.compact && !numbered && <text x={g.bracketX + 9} y={Math.round((g.ey + g.xy) / 2) + 3.5}>{kept ? "+20 pts" : "−15 pts"}</text>}
          </g>

          <circle className={`ja-m ja-pt entry${on("entry")}`} cx={g.ex} cy={g.ey} r="4" />
          <circle className={`ja-m ja-pt exit ${P.win ? "win" : "loss"}${on("exit")}`} cx={g.xx} cy={g.xy} r="4" />

          {numbered && pins(g).map(({ part, ax, ay, label, pw }) => {
            return (
              <g key={part} className={`ja-pin${active === part ? " on" : ""}`} transform={`translate(${Math.round(ax)},${Math.round(ay)})`}>
                <rect x={-pw / 2} y="-8" width={pw} height="16" rx="8" />
                <text y="3" textAnchor="middle">{label}</text>
              </g>
            );
          })}
          {!numbered && PARTS.map((part) => {
            const [ax, ay] = g.tips[part];
            return <circle key={part} className={`ja-dot${active === part ? " on" : ""}`} cx={ax} cy={ay} r="2.5" />;
          })}
        </svg>
      </div>
    </div>
  );
}

/* ---------- Callouts ---------- */

function Callout({ P, part, active, setHot, setPin, refFn, style }) {
  const c = P.calls[part];
  return (
    <button
      type="button" ref={refFn} style={style}
      className={`ja-call ${active === part ? "on" : ""} ${active && active !== part ? "dim" : ""}`}
      aria-pressed={active === part}
      onMouseEnter={() => setHot(part)} onMouseLeave={() => setHot(null)}
      onFocus={() => setHot(part)} onBlur={() => setHot(null)}
      onClick={() => setPin((p) => (p === part ? null : part))}>
      <span className="ja-call-head"><span className="ja-num">{NUMERAL[part]}</span><span className="hx-kicker">{c.cap}</span></span>
      <b className={`ja-val ${part === "note" ? "note" : ""}`}>{c.val}</b>
      {c.sub && <span className="ja-sub">{c.sub}</span>}
    </button>
  );
}

/* ---------- The section ---------- */

const mq = (w) => (w >= 1100 ? "wide" : w > 640 ? "mid" : "phone");

export default function Anatomy() {
  const plates = useMemo(() => [plateKept(), plateBroken()], []);
  const [which, setWhich] = useState(0);
  const P = plates[which];
  const [hot, setHot] = useState(null);
  const [pin, setPin] = useState(null);
  const [auto, setAuto] = useState(null);
  const [mode, setMode] = useState(() => mq(typeof innerWidth === "number" ? innerWidth : 1440));
  const active = hot ?? pin ?? (mode === "phone" ? auto : null);

  const root = useRef(null), fig = useRef(null), plateEl = useRef(null), chartBox = useRef(null), cols = useRef({}), calls = useRef({});
  const [cw, setCw] = useState(0);
  const [shown, setShown] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [lay, setLay] = useState(null);

  // Size: the chart is drawn at its real pixel width
  useLayoutEffect(() => {
    const measure = () => {
      setMode(mq(innerWidth));
      if (chartBox.current) setCw(Math.round(chartBox.current.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(chartBox.current);
    addEventListener("resize", measure);
    return () => { ro.disconnect(); removeEventListener("resize", measure); };
  }, []);
  const ch = mode === "wide" ? 440 : mode === "mid" ? 400 : 248;

  // Engrave the plate once it scrolls into view
  useEffect(() => {
    if (reduced()) { setShown(true); return; }
    const check = () => {
      const b = root.current?.getBoundingClientRect();
      if (b && b.top < innerHeight * 0.7 && b.bottom > 0) setShown(true);
    };
    check();
    addEventListener("scroll", check, { passive: true });
    addEventListener("resize", check);
    return () => { removeEventListener("scroll", check); removeEventListener("resize", check); };
  }, []);
  // Each plate engraves itself afresh when it's chosen
  useEffect(() => {
    if (!shown) return;
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), reduced() ? 0 : 40);
    return () => clearTimeout(t);
  }, [shown, which]);

  useLayoutEffect(() => {
    if (mode !== "wide" || !cw) { setLay(null); return; }
    const place = () => {
      const F = fig.current?.getBoundingClientRect(), C = chartBox.current?.getBoundingClientRect(), PL = plateEl.current?.getBoundingClientRect();
      if (!F || !C || !PL) return;
      const g = geometry(P, cw, ch, false);
      const leads = [];
      for (const [side, parts] of [["left", LEFT], ["right", RIGHT]]) {
        for (const part of parts) {
          const num = calls.current[part]?.querySelector(".ja-num")?.getBoundingClientRect();
          if (!num) continue;
          const [gx, gy] = g.tips[part];
          const ax = C.left - F.left + gx, ay = C.top - F.top + gy;
          const sy = Math.round(num.top + num.height / 2 - F.top) + 0.5;
          const sx = side === "left" ? Math.round(num.right - F.left) + 8 : Math.round(num.left - F.left) - 8;
          const kx = side === "left" ? Math.round(PL.left - F.left) + 14 : Math.round(PL.right - F.left) - 14;
          leads.push({ part, side, out: `M${sx},${sy} L${kx},${sy}`, inn: `M${kx},${sy} L${ax.toFixed(1)},${ay.toFixed(1)}`, sx, sy });
        }
      }
      setLay({ leads, w: Math.round(F.width), h: Math.round(F.height) });
    };
    place();
    document.fonts?.ready.then(place);
    const ro = new ResizeObserver(place);
    ro.observe(fig.current);
    return () => ro.disconnect();
  }, [mode, cw, ch, which]);

  useEffect(() => {
    if (mode !== "phone") { setAuto(null); return; }
    const read = () => {
      const pl = plateEl.current?.getBoundingClientRect();
      if (!pl) return;
      const line = pl.bottom + 72;
      let best = null, dist = Infinity;
      for (const part of PARTS) {
        const b = calls.current[part]?.getBoundingClientRect();
        if (!b) continue;
        const d = b.top <= line && b.bottom >= line ? 0 : Math.min(Math.abs(b.top - line), Math.abs(b.bottom - line));
        if (d < dist) { dist = d; best = part; }
      }
      setAuto(dist < 60 ? best : null);
    };
    read();
    addEventListener("scroll", read, { passive: true });
    return () => removeEventListener("scroll", read);
  }, [mode, which]);

  useEffect(() => {
    if (!pin) return;
    const key = (e) => { if (e.key === "Escape") setPin(null); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [pin]);

  const choose = (i) => { setWhich(i); setPin(null); setHot(null); };
  const callout = (part, i) => (
    <Callout key={part} P={P} part={part} active={active} setHot={setHot} setPin={setPin}
      refFn={(el) => (calls.current[part] = el)}
      style={{ "--i": i }} />
  );

  return (
    <section id="journal" className="jx jx-anat" ref={root} aria-labelledby="ja-title">
      <div className="ja-wrap">
        <header className="ja-head">
          <div className="ja-head-text">
            <span className="hx-kicker">Journal · Anatomy of a trade</span>
            <h2 id="ja-title" className="ja-title">Every trade,<br /><span className="silver">taken apart.</span></h2>
            <p className="hx-sub ja-lede">One entry holds the whole trade: the setup, the stop, how it felt, what it made or lost and the lesson. Here are two sample trades, taken apart.</p>
          </div>
          <figure className={`ja-fig ${shown ? "on" : ""}`} aria-hidden="true">
            <img src={`${import.meta.env.BASE_URL}site/j3-kabuto.webp`} srcSet={`${import.meta.env.BASE_URL}site/j3-kabuto-320.webp 320w, ${import.meta.env.BASE_URL}site/j3-kabuto.webp 640w`} sizes="(max-width: 1099px) 240px, 320px" width="320" height="364" alt="" loading="lazy" decoding="async" />
            <figcaption>Fig. I · Kabuto, a samurai helmet</figcaption>
          </figure>
        </header>

        <div className="ja-tabs" role="group" aria-label="Which trade">
          {plates.map((p, i) => (
            <button key={p.id} type="button" aria-pressed={which === i} onClick={() => choose(i)} className={which === i ? "on" : ""}>
              <span className="ja-tab-no">{p.tab}</span>
              <span className="ja-tab-name">{i === 0 ? "The green one" : "The red one"}</span>
              <span className="ja-tab-meta num">{p.meta}</span>
            </button>
          ))}
        </div>

        <div className={`ja-figure ${mode} ${drawn ? "drawn" : ""}`} ref={fig}>
          {mode === "wide" && (
            <div className="ja-col left" ref={(el) => (cols.current.left = el)}>{LEFT.map(callout)}</div>
          )}

          <div className="ja-plate" ref={plateEl}>
            <div className="ja-frame">
              <span className="ja-corner tl" /><span className="ja-corner tr" /><span className="ja-corner bl" /><span className="ja-corner br" />
              <div className="ja-cartouche">
                <span className="ja-tabno">{P.tab}</span>
                <span className="ja-cart-title">{P.title}</span>
                <span className="ja-cart-sub">NQ · 1 minute · {P.day} · sample trade</span>
              </div>
              <div className="ja-chart-box" ref={chartBox}>
                {cw > 0 && <Plate P={P} w={cw} h={ch} active={active} drawn={drawn} numbered={mode !== "wide"} />}
              </div>
              <div className="ja-key" aria-hidden="true">
                <span><i className="k-up" />Rising minute</span>
                <span><i className="k-dn" />Falling minute</span>
                <span><i className="k-level" />{P.id === "kept" ? "Level" : "Stop, planned"}</span>
                {P.id === "broken" && <span><i className="k-ema" />20 EMA</span>}
                <span><i className="k-dim" />Measure</span>
              </div>
            </div>
          </div>

          {mode === "wide" && (
            <div className="ja-col right" ref={(el) => (cols.current.right = el)}>{RIGHT.map((p, i) => callout(p, i + 4))}</div>
          )}

          {mode !== "wide" && <div className="ja-list">{PARTS.map(callout)}</div>}

          {mode === "wide" && lay && (
            <svg className="ja-leads" width={lay.w} height={lay.h} aria-hidden="true">
              {lay.leads.map((l, i) => (
                <g key={l.part} className={`ja-lead ${active === l.part ? "on" : active ? "dim" : ""}`} style={{ "--i": i }}>
                  <path d={l.out} pathLength="1" className="out" />
                  <path d={l.inn} pathLength="1" className="inn" />
                  <circle cx={l.sx + (l.side === "left" ? -4 : 4)} cy={l.sy} r="1.5" />
                </g>
              ))}
            </svg>
          )}
        </div>

        <div className="ja-foot">
          <div className="ja-row-wrap">
            <span className="hx-kicker">As it lands in your journal · sample trade</span>
            <div className="ja-row" key={P.id}>
              <span className="num ja-row-when">{P.row.when}</span>
              <span className="ja-row-what">{P.row.what}</span>
              <span className="ja-row-feel">{P.row.feel}</span>
              <span className="num ja-row-held">{P.row.held}</span>
              <b className={`num ja-row-pnl ${P.win ? "" : "neg"}`}>{P.row.pnl}</b>
            </div>
            <p className="ja-row-note">Then find it again by symbol, setup or feeling, or see it on the calendar inside that day's P&L.</p>
          </div>
          <div className="hx-actions"><StartFree>Start your journal</StartFree></div>
        </div>
      </div>
    </section>
  );
}
