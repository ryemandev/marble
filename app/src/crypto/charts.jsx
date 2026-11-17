import { useId, useRef } from "react";
import { compactMoney, useWidth } from "../components/charts";
import { fmtMoney } from "../data";

const crisp = (v) => Math.round(v) + 0.5;
function Hatch({ id, op = 0.55 }) {
  return (
    <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="1.6" height="5" style={{ fill: "var(--loss)", opacity: op }} />
    </pattern>
  );
}

export function HourStrip({ hours, sessions, height = 170 }) {
  const box = useRef(null);
  const w = useWidth(box, 600);
  const id = useId().replace(/:/g, "");
  const top = 26, bot = 20, ph = height - top - bot;
  const pos = Math.max(0, ...hours), neg = Math.max(0, -Math.min(...hours));
  const span = pos + neg || 1;
  const zero = top + (pos / span) * ph;
  const cw = w / 24;
  const bw = Math.max(3, cw - 4);
  return (
    <div ref={box}>
      <svg width={w} height={height} className="cx-svg" role="img" aria-label="P&L by hour of the day, UTC">
        <defs><Hatch id={`s${id}`} op={0.75} /></defs>
        {sessions.map((s, i) => (
          <g key={s.name}>
            <rect x={s.from * cw + 1} y={0} width={(s.to - s.from) * cw - 2} height={16} rx={3} style={{ fill: i % 2 ? "rgba(var(--ink),0.07)" : "rgba(var(--ink),0.035)" }} />
            {(s.to - s.from) * cw > 46 && <text x={s.from * cw + 7} y={12} className="cx-band">{s.name}</text>}
          </g>
        ))}
        <line x1={0} x2={w} y1={crisp(zero)} y2={crisp(zero)} style={{ stroke: "var(--line-2)" }} />
        {hours.map((v, h) => {
          if (!v) return null;
          const len = v > 0 ? (v / span) * ph : (-v / span) * ph;
          return <rect key={h} x={h * cw + (cw - bw) / 2} y={v > 0 ? zero - len : zero} width={bw} height={Math.max(1, len)} rx={2}
            style={{ fill: v > 0 ? "var(--text)" : `url(#s${id})`, stroke: v > 0 ? "none" : "var(--loss)", strokeWidth: 0.7 }}>
            <title>{`${String(h).padStart(2, "0")}:00 UTC · ${fmtMoney(v, { sign: true })}`}</title>
          </rect>;
        })}
        {[0, 6, 12, 18].map((h) => <text key={h} x={h * cw + 2} y={height - 4}>{String(h).padStart(2, "0")}</text>)}
        <text x={w} y={height - 4} textAnchor="end">24 UTC</text>
      </svg>
    </div>
  );
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function Month7({ year, month, daily, today }) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 Sun
  const lead = (first + 6) % 7; // a Monday-first grid
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const max = Math.max(1, ...Object.values(daily).map(Math.abs));
  return (
    <div className="m7" role="table" aria-label="P&L by day, every day of the week">
      {DOW.map((d, i) => <div key={d} className={`m7-head ${i >= 5 ? "we" : ""}`} role="columnheader">{d}</div>)}
      {cells.map((d, i) => {
        if (!d) return <div key={i} className="m7-cell empty" />;
        const v = daily[d];
        const future = d > today;
        const m = v ? Math.abs(v) / max : 0;
        const wd = (lead + d - 1) % 7;
        return (
          <div key={i} role="cell" title={v ? `${d}: ${fmtMoney(v, { sign: true })}` : undefined}
            className={`m7-cell ${future ? "future" : v > 0 ? "pos" : v < 0 ? "neg" : "flat"} ${m > 0.62 && v > 0 ? "hi" : ""} ${wd >= 5 ? "we" : ""} ${d === today ? "today" : ""}`} style={{ "--m": m.toFixed(3) }}>
            <span className="m7-date num">{d}</span>
            {!future && v ? <span className="m7-val num">{compactMoney(v, true)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

export function LevDots({ stacks, cap }) {
  const hi = Math.max(20, ...stacks.map(([l]) => l), cap || 0);
  const x = (v) => ((v - 0.5) / (hi - 0.5 + 0.5)) * 100;
  const tallest = Math.max(1, ...stacks.map(([, n]) => n));
  const step = Math.min(9, 112 / tallest); // the tallest stack always fits the plot
  const ticks = hi <= 20 ? [1, 5, 10, 15, 20] : [1, Math.round(hi / 4), Math.round(hi / 2), Math.round((3 * hi) / 4), hi];
  return (
    <div className="cx-dots" role="img" aria-label="The leverage of each trade">
      <div className="cx-dots-plot">
        {cap > 0 && <span className="cx-dots-rule" style={{ left: `${x(cap + 0.5)}%` }}><i>Cap {cap}×</i></span>}
        {stacks.flatMap(([lev, n]) => Array.from({ length: n }, (_, i) => (
          <span key={`${lev}-${i}`} className={`cx-dot ${cap > 0 && lev > cap ? "over" : ""}`} style={{ left: `${x(lev)}%`, bottom: `${4 + i * step}px` }} />
        )))}
      </div>
      <div className="cx-dots-axis num">{ticks.map((v) => <span key={v} style={{ left: `${x(v)}%` }}>{v}×</span>)}</div>
    </div>
  );
}

export function LiqRuler({ rows, rule }) {
  const max = Math.max(25, ...rows.map((r) => Math.min(r.dist, 60)));
  const x = (v) => (Math.min(v, max) / max) * 100;
  return (
    <div className="cx-ruler">
      {rows.map((p) => {
        const inside = rule > 0 && p.dist < rule;
        return (
          <div key={p.key} className={`cx-ruler-row ${inside ? "inside" : ""}`}>
            <div className="cx-ruler-name"><span className="sym">{p.symbol}</span><span className={`side-tag ${p.side}`}>{p.side === "long" ? "L" : "S"}</span>{p.leverage ? <span className="lev-tag num">{+p.leverage.toFixed(1)}×</span> : null}</div>
            <div className="cx-ruler-line">
              {rule > 0 && <span className="cx-ruler-zone" style={{ width: `${x(rule)}%` }} />}
              <span className={`cx-ruler-mark ${x(p.dist) > 62 ? "far" : ""}`} style={{ left: `${x(p.dist)}%` }}><b className="num">{p.dist.toFixed(1)}%</b>{inside && <em> · inside your {rule}%</em>}</span>
            </div>
          </div>
        );
      })}
      <div className="cx-ruler-axis num"><span>Liquidation</span>{rule > 0 && <span style={{ left: `${x(rule)}%` }}>{rule}%</span>}<span style={{ left: "100%" }}>{max}%</span></div>
    </div>
  );
}

export function Receipt({ r, head, accounts }) {
  const rows = [["What the trades made", r.gross]];
  if (r.fees.maker || r.fees.taker) {
    rows.push(["Taker fees", -r.fees.taker], ["Maker fees", -r.fees.maker]);
    if (Math.abs(r.fees.unsplit) >= 0.005) rows.push(["Other fees", -r.fees.unsplit]);
  } else rows.push(["Fees", -r.fees.total]);
  if (r.funding.trades) rows.push(["Funding paid", -r.funding.paid], ["Funding received", r.funding.received]);
  const foot = [r.feeBps != null && `Fee rate ${r.feeBps} bps of volume`, r.fees.maker < 0 && `maker rebates ${fmtMoney(-r.fees.maker, { sign: true })}`, !r.funding.trades && "no funding in these trades yet"].filter(Boolean);
  return (
    <div className="cx-receipt">
      <div className="cx-receipt-head num"><span>{head}</span>{accounts != null && <span>{accounts} {accounts === 1 ? "ACCOUNT" : "ACCOUNTS"}</span>}</div>
      {rows.map(([l, v]) => <div key={l} className="cx-receipt-row"><span>{l}</span><i /><span className={`num ${v < 0 ? "loss" : ""}`}>{fmtMoney(v, { sign: true })}</span></div>)}
      <div className="cx-receipt-row total"><span>Kept</span><i /><span className="num">{fmtMoney(r.net, { sign: true })}</span></div>
      {foot.length > 0 && <div className="cx-receipt-foot num">{foot.join(" · ")}</div>}
    </div>
  );
}

// a and b are P&L by day of the month (or, with marks, by step: [step, label] names the steps along the foot)
export function TwoLines({ a, b, days, height = 240, label, marks }) {
  const box = useRef(null);
  const w = useWidth(box, 700);
  const cum = (daily) => { let c = 0; return Array.from({ length: days }, (_, i) => (c += daily[i + 1] || 0)); };
  const A = [0, ...cum(a)], B = [0, ...cum(b)], T = A.map((v, i) => v + B[i]);
  const padT = 10, padB = 24, padR = 70, pw = w - padR, ph = height - padT - padB;
  const hi = Math.max(1, ...T, ...A, ...B), lo = Math.min(0, ...T, ...A, ...B);
  const x = (i) => (i / (A.length - 1)) * pw, y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * ph;
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const tags = [[T.at(-1), "total"], [A.at(-1), "m"], [B.at(-1), "c"]].map(([v, k]) => ({ v, k, y: y(v) })).sort((p, q) => p.y - q.y);
  for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 18) tags[i].y = tags[i - 1].y + 18;
  const ticks = marks || [1, 8, 15, 22].filter((d) => d <= days).map((d) => [d, d]);
  return (
    <div ref={box}>
      <svg width={w} height={height} className="cx-svg" role="img" aria-label={label}>
        <line x1={0} x2={pw} y1={crisp(y(0))} y2={crisp(y(0))} style={{ stroke: "var(--line-2)" }} />
        <path d={path(T)} className="cx-total" />
        <path d={path(A)} className="cx-line" />
        <path d={path(B)} className="cx-line dot" />
        {tags.map((t) => <text key={t.k} x={pw + 8} y={t.y + 4} style={{ fill: t.k === "total" ? "var(--text)" : "var(--text-2)" }}>{compactMoney(t.v, true)}</text>)}
        {ticks.map(([d, text]) => <text key={d} x={x(d - 1)} y={height - 4}>{text}</text>)}
        {!marks && <text x={pw} y={height - 4} textAnchor="end">{days}</text>}
      </svg>
    </div>
  );
}
