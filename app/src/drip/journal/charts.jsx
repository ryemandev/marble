import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { compactMoney, useWidth } from "../../components/charts";
import { cash } from "./bits";

// Marble's charts: one ink, one grey, hairlines, and the same zero line in the same place on a red month
// as on a green one. Every mark can be hovered, tapped or walked with the arrow keys.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A chart takes the height its panel gives it, and never less than it asked for. The drawing sits
// out of the flow, so the panel sets the size and the chart can't push it taller.
function useFill(ref, least) {
  const [h, setH] = useState(least);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setH(Math.max(least, Math.round(el.clientHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [least]);
  return h;
}
const crisp = (v) => Math.round(v) + 0.5;
const short = (v) => compactMoney(v, true).replace("-", "−");
const walk = (set, last) => (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    set((h) => clamp((h ?? (e.key === "ArrowRight" ? -1 : last + 1)) + (e.key === "ArrowRight" ? 1 : -1), 0, last));
  } else if (e.key === "Escape") set(null);
};

function roundScale(lo, hi, count = 3) {
  if (hi - lo < 1e-9) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw - 1e-9);
  const min = Math.floor(lo / step + 1e-9) * step, max = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}

// Point to point: a curve would draw values between days that never happened
const straight = (pts) => (pts.length < 2 ? "" : `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}`);

/* ---------- The curve ---------- */

export function Curve({ data, labels = [], xTicks = [], height: least = 220, label }) {
  const box = useRef(null);
  const w = useWidth(box);
  const height = useFill(box, least);
  const [hover, setHover] = useState(null);
  const padT = 10, padB = 24, padR = 46;
  const plotW = Math.max(40, w - padR), plotH = height - padT - padB;
  const { min, max, ticks } = useMemo(() => roundScale(Math.min(0, ...data), Math.max(0, ...data), 3), [data]);
  const last = data.length - 1;
  const x = (i) => (last ? (i / last) * plotW : 0);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * plotH;
  const pts = data.map((v, i) => [x(i), y(v)]);
  const line = straight(pts);
  const move = (e) => { const r = box.current.getBoundingClientRect(); setHover(clamp(Math.round(((e.clientX - r.left) / plotW) * last), 0, last)); };
  const room = 52;
  const shown = xTicks.filter((t) => t.i <= last).filter((t, i, all) => t.i === last || (x(all.at(-1).i) - x(t.i) >= room && (i === 0 || x(t.i) - x(all[i - 1].i) >= room)));
  return (
    <div className="jn-curve" ref={box} style={{ minHeight: least }} tabIndex={0} role="img" aria-label={label} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} onKeyDown={walk(setHover, last)} onBlur={() => setHover(null)}>
      <svg width={w} height={height} aria-hidden="true">
        {ticks.map((t) => <line key={t} x1="0" x2={plotW} y1={crisp(y(t))} y2={crisp(y(t))} className={t === 0 ? "jn-c-zero" : "jn-c-grid"} />)}
        {ticks.map((t) => <text key={`t${t}`} x={w} y={y(t) + 4} textAnchor="end" className="jn-c-tick">{compactMoney(t).replace("-", "−")}</text>)}
        {shown.map((t, i) => <text key={`${t.label}${i}`} x={x(t.i)} y={height - 5} textAnchor={t.i === 0 ? "start" : t.i === last ? "end" : "middle"} className="jn-c-tick">{t.label}</text>)}
        <path d={`${line}L${x(last)},${y(0)}L0,${y(0)}Z`} className="jn-c-wash" />
        <path d={line} className="jn-c-line" pathLength="1" />
        {hover != null && <line x1={crisp(x(hover))} x2={crisp(x(hover))} y1={padT} y2={padT + plotH} className="jn-c-cross" />}
        <circle cx={x(hover ?? last)} cy={y(data[hover ?? last])} r="4" className="jn-c-dot" />
      </svg>
      {hover != null && (
        <div className={`jn-tip ${x(hover) > plotW * 0.6 ? "flip" : ""}`} style={{ left: x(hover), top: y(data[hover]) }}>
          <b className="num">{cash(data[hover])}</b>
          {labels[hover] && <span>{labels[hover]}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- Bars either side of one zero line ---------- */

export function Spread({ rows, label, onPick }) {
  const lim = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul className="jn-spread" aria-label={label}>
      {rows.map((r, i) => {
        const size = (Math.abs(r.value) / lim) * 50;
        return (
          <li key={r.key ?? r.label} style={{ "--i": i }}>
            <button type="button" className="jn-spread-row" disabled={!onPick} onClick={() => onPick?.(r)} aria-label={`${typeof r.label === "string" ? r.label : r.name}: ${cash(r.value)}, ${r.sub}`}>
              <span className="jn-spread-top">
                <span className="jn-spread-name">{r.label}</span>
                <b className="num">{cash(r.value, { decimals: 0 })}</b>
              </span>
              <span className="jn-spread-sub">{r.sub}</span>
              <span className={`jn-spread-bar ${r.value < 0 ? "down" : "up"}`} aria-hidden="true">
                <i style={{ left: r.value < 0 ? `${50 - size}%` : "50%", width: `${size}%` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Columns: mirrored about zero, or standing on a line ---------- */

export function Columns({ items, height: least = 190, label, onPick, mirror = true, format = (v) => cash(v, { decimals: 0 }), axis = short, toneOf }) {
  const box = useRef(null);
  const w = useWidth(box);
  const height = useFill(box, least);
  const [hover, setHover] = useState(null);
  const padT = 18, padB = mirror ? 36 : 22; // the labels sit under everything, clear of any bar
  const plotH = height - padT - padB;
  const up = Math.max(0, ...items.map((d) => d.value)), down = Math.max(0, ...items.map((d) => -d.value));
  const span = up + down || 1;
  const zero = padT + plotH * (up / span || (down ? 0 : 1));
  const band = w / items.length;
  const bw = Math.min(120, band * 0.68); // the bars take the room, however few there are
  const cx = (i) => band * i + band / 2;
  const top = (v) => zero - (v / span) * plotH;
  const bar = (i, v) => {
    const yt = top(v), h = Math.abs(yt - zero);
    if (h < 0.5) return "";
    const r = Math.min(bw > 48 ? 10 : 4, h, bw / 2), x0 = cx(i) - bw / 2, x1 = cx(i) + bw / 2, s = v >= 0 ? 1 : -1;
    return `M${x0},${zero}V${yt + s * r}Q${x0},${yt} ${x0 + r},${yt}H${x1 - r}Q${x1},${yt} ${x1},${yt + s * r}V${zero}Z`;
  };
  const hi = items.reduce((a, d, i) => (d.value > items[a].value ? i : a), 0);
  const lo = items.reduce((a, d, i) => (d.value < items[a].value ? i : a), 0);
  const every = Math.max(1, Math.ceil(Math.max(...items.map((d) => String(d.label).length * 6.6 + 8)) / band));
  return (
    <div className="jn-cols-chart" ref={box} style={{ minHeight: least }} tabIndex={0} role="img" aria-label={label} onKeyDown={walk(setHover, items.length - 1)} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={height} aria-hidden="true">
        <line x1="0" x2={w} y1={crisp(zero)} y2={crisp(zero)} className="jn-c-zero" />
        {items.map((d, i) => {
          const tone = toneOf?.(d) ?? (d.value < 0 ? "down" : "up");
          const mark = i === hover || (!mirror ? false : i === hi || i === lo) && d.value !== 0;
          return (
            <g key={d.key ?? d.label} className={`jn-col ${tone} ${onPick ? "pick" : ""} ${hover != null && hover !== i ? "dim" : ""}`} style={{ "--i": i, transformOrigin: `${cx(i)}px ${zero}px` }}
              onPointerEnter={() => setHover(i)} onClick={() => onPick?.(d)}>
              <rect x={band * i} y="0" width={band} height={height} fill="transparent" />
              <path d={bar(i, d.value)} className="jn-col-bar" />
              {mark && <text x={cx(i)} y={d.value >= 0 ? top(d.value) - 6 : top(d.value) + 14} textAnchor="middle" className="jn-c-val">{axis(d.value)}</text>}
              {(items.length - 1 - i) % every === 0 && <text x={cx(i)} y={height - 5} textAnchor="middle" className="jn-c-tick">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className={`jn-tip above ${cx(hover) > w * 0.65 ? "flip" : ""} ${cx(hover) < w * 0.25 ? "start" : ""}`} style={{ left: cx(hover), top: Math.min(top(Math.max(0, items[hover].value)), height) - 6 }}>
          <b className="num">{format(items[hover].value)}</b>
          <span>{items[hover].title ?? items[hover].label}{items[hover].sub ? ` · ${items[hover].sub}` : ""}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- A trade drawn out: where it went in, where it came out, where the stop was ---------- */

export function TradeShape({ prices, fills, up, labels, height = 170 }) {
  const box = useRef(null);
  const w = useWidth(box);
  const { entry, exit, stop } = prices;
  const list = (Array.isArray(fills) ? fills : []).filter((f) => Number.isFinite(+f.price) && f.time);
  const known = [entry, exit, stop, ...list.map((f) => +f.price)].filter((v) => v != null);
  if (!known.length) return null;
  let lo = Math.min(...known), hi = Math.max(...known);
  if (hi === lo) { lo -= 1; hi += 1; }
  const room = (hi - lo) * 0.22;
  lo -= room; hi += room;
  const y = (v) => 8 + ((hi - v) / (hi - lo)) * (height - 16);
  const pad = 14;
  const a = entry ?? exit, b = exit ?? entry;
  let pts;
  if (list.length > 1) {
    const t0 = Date.parse(list[0].time), t1 = Date.parse(list.at(-1).time), span = Math.max(1, t1 - t0);
    pts = list.map((f) => [pad + ((Date.parse(f.time) - t0) / span) * (w - pad * 2), y(+f.price)]);
  } else {
    const mid = (a + b) / 2, lean = (hi - lo) * 0.09 * (b >= a ? -1 : 1);
    pts = [[pad, y(a)], [w * 0.34, y(mid + lean)], [w * 0.62, y(mid - lean)], [w - pad, y(b)]];
  }
  // Each label sits on the side of its level the line never comes from, so nothing is written over it
  const rising = b >= a;
  const level = (v, name, side, under) => v != null && (
    <g key={name}>
      <line x1="0" x2={w} y1={crisp(y(v))} y2={crisp(y(v))} className="jn-c-grid" />
      <text x={side === "end" ? w : 0} y={y(v) + (under ? 16 : -6)} textAnchor={side === "end" ? "end" : "start"} className="jn-c-tick">{name} {labels?.[name.toLowerCase()]}</text>
    </g>
  );
  return (
    <div className="jn-shape" ref={box}>
      <svg width={w} height={height} role="img" aria-label={`The trade: entry ${labels?.entry ?? "not given"}, exit ${labels?.exit ?? "not given"}${stop != null ? `, stop ${labels?.stop}` : ""}`}>
        <rect x="0" y={Math.min(y(a), y(b))} width={w} height={Math.max(1, Math.abs(y(a) - y(b)))} className="jn-c-wash" />
        {level(entry, "Entry", "start", rising)}
        {level(exit, "Exit", "end", !rising)}
        {level(stop, "Stop", "start", stop != null && stop < (entry ?? exit))}
        <path d={straight(pts)} className={`jn-c-line ${up ? "" : "down"}`} pathLength="1" />
        <circle cx={pts[0][0]} cy={pts[0][1]} r="4" className="jn-c-open" />
        <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="4" className={`jn-c-dot ${up ? "" : "down"}`} />
      </svg>
    </div>
  );
}
