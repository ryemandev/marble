import { useMemo, useRef, useState } from "react";
import { compactMoney, useWidth } from "../../components/charts";
import { marketCode } from "../../lib/markets";
import { cash } from "../journal/bits";
import { heldText } from "./model";

const dollars = (v) => cash(v, { decimals: 0 });
const short = (v) => compactMoney(v, true).replace("-", "−");

/* ---------- Hours across, days down: ink for money made, hatching for money lost ---------- */

export function Heat({ heat, onPick }) {
  const [hover, setHover] = useState(null);
  const most = Math.max(1, ...heat.cells.map((c) => Math.abs(c.net)));
  const cols = heat.hours.length;
  return (
    <div className="st-heat-wrap">
      <div className="st-heat" style={{ "--cols": cols }} role="table" aria-label="Money by weekday and hour">
        <span />
        {heat.hours.map((h) => <span key={h} className="st-heat-h num">{h}</span>)}
        {heat.days.map((d) => (
          <div className="st-heat-row" key={d.d} role="row">
            <span className="st-heat-d">{d.label}</span>
            {heat.cells.filter((c) => c.day === d.d).map((c) => {
              const share = Math.abs(c.net) / most;
              return (
                <button type="button" key={c.hour} className={`st-cell ${!c.n ? "none" : c.net >= 0 ? "up" : "down"}`} style={{ "--a": (0.14 + 0.86 * share ** 0.7).toFixed(2) }}
                  disabled={!c.n} onPointerEnter={() => setHover(c)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(c)} onBlur={() => setHover(null)} onClick={() => onPick?.(c)}
                  aria-label={`${c.dayLabel} ${c.hour}:00: ${c.n ? dollars(c.net) : "no trades"}`} />
              );
            })}
          </div>
        ))}
      </div>
      <p className="st-heat-note" aria-live="polite">
        {hover ? <><b>{hover.dayLabel} {hover.hour}:00</b> {hover.n ? `${dollars(hover.net)}, ${hover.n} ${hover.n === 1 ? "trade" : "trades"}` : "No trades"}</>
          : <span className="st-key"><i className="up" /> Made <i className="down" /> Lost <span>Darker is more money. New York time.</span></span>}
      </p>
    </div>
  );
}

/* ---------- Every trade: how long it was held against what it made ---------- */

export function Scatter({ points, height = 260, label, onPick }) {
  const box = useRef(null);
  const w = useWidth(box);
  const [hover, setHover] = useState(null);
  const padL = 8, padR = 44, padT = 10, padB = 24;
  const plotW = Math.max(40, w - padL - padR), plotH = height - padT - padB;
  const most = Math.max(1, ...points.map((p) => p.x));
  const sx = (v) => padL + (Math.sqrt(v) / Math.sqrt(most)) * plotW;
  const reach = Math.max(1, ...points.map((p) => Math.abs(p.y)));
  const hi = Math.max(0, ...points.map((p) => p.y)), lo = Math.min(0, ...points.map((p) => p.y));
  const span = hi - lo || reach;
  const sy = (v) => padT + (1 - (v - lo) / span) * plotH;
  const ticks = [1, 5, 15, 30, 60, 120, 240, 480].filter((m) => m <= most);
  const shown = ticks.filter((m, i) => i === 0 || sx(m) - sx(ticks[i - 1]) > 32);
  const nearest = (e) => {
    const r = box.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, d = 1600;
    for (const p of points) { const dd = (sx(p.x) - x) ** 2 + (sy(p.y) - y) ** 2; if (dd < d) { d = dd; best = p; } }
    return best;
  };
  const near = (e) => setHover(nearest(e));
  // A finger leaves the chart before its tap arrives, which clears the dot it was on. So a tap finds its own dot.
  const open = (e) => { const p = nearest(e); if (p) onPick?.(p); };
  return (
    <div className="st-scatter" ref={box} role="img" aria-label={label} onPointerMove={near} onPointerDown={near} onPointerLeave={() => setHover(null)} onClick={open}>
      <svg width={w} height={height} aria-hidden="true">
        {[hi, lo].filter((v) => v).map((v) => <text key={v} x={w} y={sy(v) + 4} textAnchor="end" className="jn-c-tick">{short(v)}</text>)}
        <line x1={padL} x2={padL + plotW} y1={Math.round(sy(0)) + 0.5} y2={Math.round(sy(0)) + 0.5} className="jn-c-zero" />
        {shown.map((m) => <text key={m} x={sx(m)} y={height - 5} textAnchor="middle" className="jn-c-tick">{heldText(m)}</text>)}
        {points.map((p) => <circle key={p.t.id} cx={sx(p.x)} cy={sy(p.y)} r={hover === p ? 6 : 4} className={p.y >= 0 ? "st-dot up" : "st-dot down"} />)}
      </svg>
      {hover && (
        <div className={`jn-tip above ${sx(hover.x) > w * 0.6 ? "flip" : ""}`} style={{ left: sx(hover.x), top: sy(hover.y) - 8 }}>
          <b className="num">{dollars(hover.y)}</b>
          <span>{marketCode(hover.t.symbol || "")}, held {heldText(hover.x)}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- A table of rows, money first ---------- */

export function Table({ rows, onPick, label, first = "" }) {
  return (
    <div className="st-table" role="table" aria-label={label}>
      <div className="st-tr head" role="row"><span>{first}</span><span>Money</span><span>Trades</span><span>Won</span><span>Average</span></div>
      {rows.map((r) => (
        <button type="button" key={r.key} className="st-tr" role="row" disabled={!r.n} onClick={() => onPick?.(r)}>
          <span className="st-tn">{r.label}</span>
          <b className="num">{r.n ? dollars(r.net) : "–"}</b>
          <span className="num">{r.n}</span>
          <span className="num">{r.n ? `${r.rate}%` : "–"}</span>
          <span className="num">{r.n ? dollars(r.avg) : "–"}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Two sides of a thing ---------- */

export function Sides({ left, right, onPick }) {
  const total = Math.abs(left.net) + Math.abs(right.net) || 1;
  const share = (Math.abs(left.net) / total) * 100;
  return (
    <div className="st-sides">
      <div className="st-sides-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /><i className="other" /></div>
      <div className="st-sides-pair">
        {[left, right].map((s) => (
          <button type="button" key={s.key} onClick={() => s.n && onPick?.(s)} disabled={!s.n}>
            <span>{s.label}</span>
            <b className="num">{dollars(s.net)}</b>
            <small>{s.n} {s.n === 1 ? "trade" : "trades"}, {s.rate}% won</small>
            <small>{dollars(s.avg)} a trade</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- This stretch against the one before ---------- */

export function Against({ now, was, label }) {
  const rows = useMemo(() => [
    ["Money", dollars(now.net), dollars(was.net), now.net - was.net, dollars],
    ["Trades", now.count, was.count, null],
    ["Won", `${Math.round(now.rate)}%`, `${Math.round(was.rate)}%`, null],
    ["Average trade", dollars(now.perTrade), dollars(was.perTrade), now.perTrade - was.perTrade, dollars],
    ["Average day", dollars(now.perDay), dollars(was.perDay), now.perDay - was.perDay, dollars],
    ["Best day", now.bestDay ? dollars(now.bestDay.net) : "None", was.bestDay ? dollars(was.bestDay.net) : "None", null],
    ["Worst day", now.worstDay ? dollars(now.worstDay.net) : "None", was.worstDay ? dollars(was.worstDay.net) : "None", null],
    ["Fees", dollars(-now.fees), dollars(-was.fees), null],
  ], [now, was]);
  return (
    <div className="st-against" role="table" aria-label="Against the stretch before">
      <div className="st-ag head" role="row"><span /><span>Now</span><span>{label}</span><span>Change</span></div>
      {rows.map(([k, a, b, d, fmt]) => (
        <div className="st-ag" role="row" key={k}>
          <span>{k}</span><b className="num">{a}</b><span className="num">{b}</span>
          <span className="num">{d == null ? "" : fmt(d)}</span>
        </div>
      ))}
    </div>
  );
}
