import { shortMoney } from "../lib/money";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CAL, NOW, dailyOf, dayName, equityOf, fmtMoney, monthName, monthShort, todayInView, viewingNow } from "../data";
import { MON, MONTHS, pad } from "../lib/basics.js";
import { reducedMotion } from "./overlay";
import { svgRef } from "./svgRef";

const tickWidth = (text) => String(text).length * 6.6;

export function useWidth(ref, fallback = 600) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(120, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

// Round axis steps: 1, 2, 2.5 or 5 times a power of ten
function niceScale(lo, hi, count = 4) {
  if (hi - lo < 1e-9) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw - 1e-9);
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}

export const compactMoney = (v, sign = false) => shortMoney(v, { sign });
const signedMoney = (v) => fmtMoney(v, { sign: true });
const crisp = (v) => Math.round(v) + 0.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const resample = (arr, n) => (arr.length === n ? arr : Array.from({ length: n }, (_, i) => {
  const t = (i / Math.max(1, n - 1)) * (arr.length - 1), j = Math.floor(t), f = t - j;
  return arr[j] + ((arr[j + 1] ?? arr[j]) - arr[j]) * f;
}));

function useTween(values, ms = 650, rise = false) {
  const key = values.join(",");
  const [start] = useState(() => (rise && !reducedMotion() ? values.map(() => 0) : values));
  const [shown, setShown] = useState(start);
  const from = useRef(start);
  const first = useRef(rise);
  useEffect(() => {
    const a = resample(from.current, values.length), b = values;
    const wait = first.current ? 220 : 0;
    first.current = false;
    if (reducedMotion() || a.every((v, i) => v === b[i])) { from.current = b; setShown(b); return; }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, Math.max(0, (t - t0 - wait) / ms)), e = 1 - Math.pow(1 - p, 3);
      const cur = b.map((v, i) => a[i] + (v - a[i]) * e);
      from.current = cur;
      setShown(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return shown.length === values.length ? shown : values;
}

// Arrow keys walk a chart's points, Escape lets go
const walk = (set, last) => (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    set((h) => clamp((h ?? (e.key === "ArrowRight" ? -1 : last + 1)) + (e.key === "ArrowRight" ? 1 : -1), 0, last));
  } else if (e.key === "Escape") set(null);
};

/* ---------- Line: equity and cumulative P&L ---------- */

export function equityProps(trades) {
  const chrono = [...trades].reverse();
  const data = equityOf(trades);
  const labels = [CAL.all ? "Start" : `Start of ${monthName()}`, ...chrono.map((t) => `${t.date} · ${t.symbol} ${t.side} · ${t.setup}`)];
  const last = data.length - 1;
  if (CAL.all) {
    // Every month at once: a tick where each month starts (with its year once there's more than one), and the last day traded
    const years = new Set(chrono.map((t) => t.month?.slice(0, 4))).size > 1;
    const xTicks = chrono.flatMap((t, i) => (t.month && t.month !== chrono[i - 1]?.month
      ? [{ label: `${MON[+t.month.slice(5, 7) - 1]}${years && (i === 0 || t.month.endsWith("-01")) ? ` ${t.month.slice(0, 4)}` : ""}`, i }] : []))
      .filter((t) => t.i < last)
      .concat(chrono.length ? [{ label: `${chrono.at(-1).day} ${MON[+(chrono.at(-1).month || "").slice(5, 7) - 1] || ""}`.trim(), i: last }] : []);
    return { data, labels, xTicks };
  }
  const xTicks = [1, 8, 15, 22].map((d) => ({ label: `${d} ${monthShort()}`, i: chrono.findIndex((t) => t.day >= d) }))
    .filter((t) => t.i >= 0 && t.i < last)
    .concat([{ label: `${Math.min(todayInView(), new Date(CAL.year, CAL.month + 1, 0).getDate()) || chrono.at(-1)?.day || 1} ${monthShort()}`, i: last }]);
  return { data, labels, xTicks };
}

function fitTicks(ticks, x, last) {
  const extent = (t) => {
    const w = tickWidth(t.label), at = x(t.i);
    return t.i === 0 ? [at, at + w] : t.i === last ? [at - w, at] : [at - w / 2, at + w / 2];
  };
  const kept = [];
  const clear = (t) => { const [a, b] = extent(t); return kept.every((k) => { const [c, d] = extent(k); return b + 10 <= c || d + 10 <= a; }); };
  const end = ticks.find((t) => t.i === last);
  if (end) kept.push(end);
  for (const t of ticks) if (t !== end && t.label !== end?.label && clear(t)) kept.push(t);
  return kept;
}

// The last n trading days as columns (by date, so all time runs across months; mon names each day's month)
export function sessionItems(trades, n = 10) {
  const by = new Map();
  for (const t of trades) {
    const k = t.dayKey ?? String(t.day).padStart(2, "0");
    const d = by.get(k) || { day: t.day, value: 0, count: 0 };
    d.value += t.pnl; d.count++;
    by.set(k, d);
  }
  return [...by.keys()].sort().slice(-n).map((k) => {
    const { day, value, count } = by.get(k), dated = k.length === 10;
    return { key: k, label: String(day), mon: dated ? MON[+k.slice(5, 7) - 1] : monthShort(), title: dayName(day, dated ? k : null), value, sub: `${count} trade${count === 1 ? "" : "s"}` };
  });
}

export function LineChart({ data, labels = [], xTicks = [], height = 240, format = signedMoney, axisFormat = compactMoney, label }) {
  const box = useRef(null);
  const w = useWidth(box);
  const id = useId().replace(/:/g, "");
  const vals = useTween(data, 1000, true);
  const [hover, setHover] = useState(null);
  const padT = 12, padB = 26, padR = 64;
  const plotW = w - padR, plotH = height - padT - padB;
  const { min, max, ticks } = useMemo(() => niceScale(Math.min(0, ...data), Math.max(0, ...data), 4), [data]);
  const last = vals.length - 1;
  const x = (i) => (last ? (i / last) * plotW : 0);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * plotH;
  const y0 = y(clamp(0, min, max));
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const lx = x(last), ly = y(vals[last]);
  const tagY = clamp(ly, padT + 10, padT + plotH - 10);
  const at = hover;
  const move = (e) => {
    const r = box.current.getBoundingClientRect();
    setHover(clamp(Math.round(((e.clientX - r.left) / plotW) * last), 0, last));
  };
  return (
    <div className="lchart" ref={box} tabIndex={0} role="img" aria-label={label}
      onPointerMove={move} onPointerLeave={() => setHover(null)} onKeyDown={walk(setHover, last)} onBlur={() => setHover(null)}>
      <svg width={w} height={height} className="chart-svg" aria-hidden="true">
        <defs>
          <linearGradient id={`fill${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--text)", stopOpacity: 0.12 }} />
            <stop offset="1" style={{ stopColor: "var(--text)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {ticks.map((t) => <line key={t} x1="0" x2={plotW} y1={crisp(y(t))} y2={crisp(y(t))} className={t === 0 ? "c-zero" : "c-grid"} />)}
        {ticks.map((t) => Math.abs(y(t) - tagY) > 16 && <text key={`t${t}`} x={w} y={y(t) + 4} textAnchor="end" className="c-tick">{axisFormat(t)}</text>)}
        {fitTicks(xTicks, x, last).map((t) => (
          <g key={`${t.label}-${t.i}`}>
            <line x1={crisp(x(t.i))} x2={crisp(x(t.i))} y1={padT + plotH} y2={padT + plotH + 5} className="c-axis" />
            <text x={x(t.i)} y={height - 6} textAnchor={t.i === 0 ? "start" : t.i === last ? "end" : "middle"} className="c-tick">{t.label}</text>
          </g>
        ))}
        <path d={`${line}L${lx},${y0}L0,${y0}Z`} fill={svgRef(`fill${id}`)} className="c-area" />
        <path d={line} className="c-line draw" pathLength="1" />
        <circle cx={lx} cy={ly} r="4" className="c-dot" />
        <line x1={lx + 6} x2={plotW + 8} y1={crisp(tagY)} y2={crisp(tagY)} className="c-axis" />
        <g transform={`translate(${plotW + 8},${tagY})`}>
          <rect x="0" y="-10" width={padR - 8} height="20" rx="4" className="c-tag" />
          <text x={(padR - 8) / 2} y="4" textAnchor="middle" className="c-tag-text">{axisFormat(data[last])}</text>
        </g>
        {at != null && (
          <g className="c-cross">
            <line x1={crisp(x(at))} x2={crisp(x(at))} y1={padT} y2={padT + plotH} />
            <circle cx={x(at)} cy={y(vals[at])} r="4.5" className="c-dot" />
          </g>
        )}
      </svg>
      {at != null && (
        <div className={`chart-tip ${x(at) > plotW * 0.62 ? "flip" : ""}`} style={{ left: x(at), top: y(vals[at]) }}>
          <b className="num">{format(data[at])}</b>
          {labels[at] && <span>{labels[at]}</span>}
        </div>
      )}
    </div>
  );
}

export function Columns({ items, height = 190, format = signedMoney, axisFormat = compactMoney, label, toneOf, labelAll = true }) {
  const box = useRef(null);
  const w = useWidth(box);
  const vals = useTween(items.map((d) => d.value));
  const [hover, setHover] = useState(null);
  const hasNeg = items.some((d) => d.value < 0);
  const padT = 22, padB = hasNeg ? 40 : 26;
  const plotH = height - padT - padB;
  const { min, max } = useMemo(() => niceScale(Math.min(0, ...items.map((d) => d.value)), Math.max(0, ...items.map((d) => d.value)), 3), [items]);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * plotH;
  const y0 = y(0);
  const band = w / items.length;
  const bw = Math.min(24, band * 0.56);
  const cx = (i) => band * i + band / 2;
  const ext = items.reduce((a, d, i) => ({ hi: d.value > items[a.hi].value ? i : a.hi, lo: d.value < items[a.lo].value ? i : a.lo }), { hi: 0, lo: 0 });
  const roomy = band >= Math.max(34, Math.max(...items.map((d) => tickWidth(axisFormat(d.value)))) + 8);
  const showLabel = (i) => labelAll && roomy ? true : i === ext.hi || (hasNeg && i === ext.lo);
  const every = Math.max(1, Math.ceil((Math.max(...items.map((d) => tickWidth(d.label))) + 8) / band));
  const showTick = (i) => (items.length - 1 - i) % every === 0;
  const bar = (i, v) => {
    const yt = y(v), h = Math.abs(yt - y0);
    if (h < 0.5) return "";
    const r = Math.min(4, h, bw / 2), x0 = cx(i) - bw / 2, x1 = cx(i) + bw / 2, s = v >= 0 ? 1 : -1;
    return `M${x0},${y0}V${yt + s * r}Q${x0},${yt} ${x0 + r},${yt}H${x1 - r}Q${x1},${yt} ${x1},${yt + s * r}V${y0}Z`;
  };
  const tone = (d) => toneOf?.(d) ?? (d.value < 0 ? "loss" : "win");
  return (
    <div className="cchart" ref={box} tabIndex={0} role="img" aria-label={label}
      onKeyDown={walk(setHover, items.length - 1)} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={height} className="chart-svg" aria-hidden="true">
        <line x1="0" x2={w} y1={crisp(y0)} y2={crisp(y0)} className="c-zero" />
        {items.map((d, i) => (
          <g key={d.key ?? d.label} className={`c-col ${tone(d)} ${hover === i ? "on" : ""} ${hover != null && hover !== i ? "dim" : ""}`} style={{ "--n": i }} onPointerEnter={() => setHover(i)}>
            <rect x={band * i} y="0" width={band} height={height} fill="transparent" />
            <path d={bar(i, vals[i])} className="c-bar" />
            {showLabel(i) && Math.abs(vals[i]) > 0 && (
              <text x={cx(i)} y={vals[i] >= 0 ? y(vals[i]) - 7 : y(vals[i]) + 15} textAnchor="middle" className="c-val">{axisFormat(d.value)}</text>
            )}
            {showTick(i) && <text x={cx(i)} y={height - 7} textAnchor="middle" className="c-tick">{d.label}</text>}
          </g>
        ))}
      </svg>
      {hover != null && (
        <div className={`chart-tip above ${cx(hover) > w * 0.7 ? "flip" : ""}`} style={{ left: cx(hover), top: y(Math.max(0, items[hover].value)) - 8 }}>
          <b className="num">{format(items[hover].value)}</b>
          <span>{items[hover].title ?? items[hover].label}{items[hover].sub ? ` · ${items[hover].sub}` : ""}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Horizontal bars: which setups pay ---------- */

export function HBars({ rows, format = signedMoney, label }) {
  const lo = Math.min(0, ...rows.map((r) => r.value)), hi = Math.max(0, ...rows.map((r) => r.value));
  const span = hi - lo || 1;
  const zero = (-lo / span) * 100;
  return (
    <div className="hbars" role="list" aria-label={label}>
      {rows.map((r) => {
        const width = (Math.abs(r.value) / span) * 100;
        return (
          <div key={r.label} className={`hbar ${r.value < 0 ? "loss" : "win"}`} role="listitem">
            <div className="hbar-name"><span>{r.label}</span>{r.sub && <span className="hbar-sub num">{r.sub}</span>}</div>
            <div className="hbar-track">
              {lo < 0 && <span className="hbar-zero" style={{ left: `${zero}%` }} />}
              <span className="hbar-fill" style={{ left: `${r.value < 0 ? zero - width : zero}%`, width: `${width}%` }} />
            </div>
            <span className="hbar-val num">{format(r.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Heat grids: best hours, and the month ---------- */

const heatStyle = (v, max) => (v ? { "--m": Math.min(1, Math.abs(v) / (max || 1)).toFixed(3) } : undefined);
const heatClass = (v, max) => (v > 0 ? `pos ${Math.abs(v) / (max || 1) > 0.5 ? "hi" : ""}` : v < 0 ? "neg" : "zero");
const compactNum = (v, sign = true) => compactMoney(v, sign).replace("$", "");

function HeatLegend({ max }) {
  return (
    <div className="heat-legend" aria-hidden="true">
      <span className="num">Loss</span>
      {[1, 0.6, 0.25].map((m) => <i key={`n${m}`} className="heat-cell neg" style={{ "--m": m }} />)}
      <i className="heat-cell zero" />
      {[0.25, 0.6, 1].map((m) => <i key={`p${m}`} className={`heat-cell pos ${m > 0.5 ? "hi" : ""}`} style={{ "--m": m }} />)}
      <span className="num">Profit</span>
    </div>
  );
}

export function Heatmap({ rows, cols, cell, label }) {
  const [tip, setTip] = useState(null);
  const all = rows.flatMap((_, r) => cols.map((_, c) => cell(r, c).value));
  const max = Math.max(...all.map(Math.abs), 1);
  const traded = rows.flatMap((_, r) => cols.map((_, c) => cell(r, c))).filter((d) => d.count > 0).map((d) => d.value);
  const best = traded.length ? Math.max(...traded) : null, worst = traded.length ? Math.min(...traded) : null;
  const readout = !traded.length ? "No trades in these hours yet"
    : [best > 0 && `best: ${compactMoney(best, true)}`, worst < 0 && `worst: ${compactMoney(worst, true)}`].filter(Boolean).join(" · ").replace(/^b|^w/, (c) => c.toUpperCase()) || "Every hour so far broke even";
  return (
    <div className="heatmap" style={{ "--cols": cols.length }} aria-label={label} role="group">
      <span />
      {cols.map((c) => <span key={c} className="heat-head num">{c}</span>)}
      {rows.map((row, r) => [
        <span key={`r${r}`} className="heat-row">{row}</span>,
        ...cols.map((col, c) => {
          const d = cell(r, c);
          const text = `${row} ${col}: ${d.count ? `${fmtMoney(d.value, { sign: true })}, ${d.count} trade${d.count === 1 ? "" : "s"}` : "no trades"}`;
          const marked = d.count > 0 && ((d.value === best && best > 0) || (d.value === worst && worst < 0));
          return (
            <div key={`${r}-${c}`} className={`heat-cell ${heatClass(d.value, max)} ${tip?.k === `${r}-${c}` ? "on" : ""}`} style={heatStyle(d.value, max)}
              tabIndex={0} aria-label={text} onPointerEnter={() => setTip({ k: `${r}-${c}`, text })} onPointerLeave={() => setTip(null)}
              onFocus={() => setTip({ k: `${r}-${c}`, text })} onBlur={() => setTip(null)}>
              {marked && <span className="heat-mark num">{compactMoney(d.value, true)}</span>}
            </div>
          );
        }),
      ])}
      <div className="heat-foot">
        <span className="heat-readout">{tip ? tip.text : readout}</span>
        <HeatLegend max={max} />
      </div>
    </div>
  );
}

export function MonthHeat({ daily, year = CAL.year, month = CAL.month, today, compact }) {
  const [tip, setTip] = useState(null);
  const days = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let week = null;
  const newWeek = () => { week = Array(5).fill(null); week.weekend = []; weeks.push(week); };
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow === 6) { if (!week) newWeek(); week.weekend.push(d); continue; }
    if (dow === 0) { newWeek(); week.weekend.push(d); continue; }
    if (!week || (dow === 1 && week.some(Boolean))) newWeek();
    week[dow - 1] = d;
  }
  const max = Math.max(...Object.values(daily).map(Math.abs), 1);
  const label = (d) => `${d} ${monthShort()}`;
  const net = Object.values(daily).reduce((a, v) => a + v, 0);
  const sessions = Object.keys(daily).length;
  return (
    <div className={`month ${compact ? "compact" : ""}`}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Week"].map((h) => <span key={h} className="heat-head">{h}</span>)}
      {weeks.map((wk, i) => {
        const weekend = wk.weekend.reduce((a, d) => a + (daily[d] || 0), 0);
        const hasWeekend = wk.weekend.some((d) => daily[d] != null);
        const total = wk.reduce((a, d) => a + (d && daily[d] ? daily[d] : 0), 0) + weekend;
        return [
          ...wk.map((d, j) => {
            if (!d) return <span key={`${i}-${j}`} className="month-day empty" />;
            const v = daily[d];
            const future = d > today;
            const text = `${label(d)}: ${v != null ? fmtMoney(v, { sign: true }) : future ? "still to come" : "no trades"}`;
            return (
              <div key={`${i}-${j}`} className={`month-day heat-cell ${v != null ? heatClass(v, max) : "zero"} ${d === today ? "today" : ""} ${future ? "future" : ""}`}
                style={heatStyle(v, max)} tabIndex={0} aria-label={text}
                onPointerEnter={() => setTip(text)} onPointerLeave={() => setTip(null)} onFocus={() => setTip(text)} onBlur={() => setTip(null)}>
                <span className="month-date num">{d}</span>
                {!compact && v != null && <span className="month-val num">{compactNum(v)}</span>}
              </div>
            );
          }),
          <div key={`w${i}`} className="month-week" title={hasWeekend ? `Includes ${fmtMoney(weekend, { sign: true })} traded at the weekend` : undefined}
            aria-label={hasWeekend ? `Week total ${fmtMoney(total, { sign: true })}, including ${fmtMoney(weekend, { sign: true })} at the weekend` : undefined}>
            <span className={`num ${total < 0 ? "loss" : ""}`}>{total || hasWeekend ? compactNum(total) : "–"}</span>
            {hasWeekend && <span className="month-wkend xs faint">incl. wknd</span>}
          </div>,
        ];
      })}
      <div className="heat-foot">
        <span className="heat-readout">{tip || (sessions ? `${monthName()}: ${fmtMoney(net, { sign: true })} over ${sessions} session${sessions === 1 ? "" : "s"}` : `No trades in ${monthName()}${viewingNow() ? " yet" : ""}`)}</span>
        <HeatLegend max={max} />
      </div>
    </div>
  );
}

// Every month at once: a year to a block, a month to a cell, and a cell opens its month
export function MonthsHeat({ trades, onPick }) {
  const [tip, setTip] = useState(null);
  const by = {};
  for (const t of trades) if (t.month) by[t.month] = (by[t.month] || 0) + t.pnl;
  const keyOf = (y, m) => `${y}-${pad(m + 1)}`;
  const nowKey = keyOf(NOW.year, NOW.month);
  const first = Object.keys(by).sort()[0];
  const from = first ? Math.min(+first.slice(0, 4), NOW.year) : NOW.year;
  const years = Array.from({ length: NOW.year - from + 1 }, (_, i) => from + i);
  const max = Math.max(...Object.values(by).map(Math.abs), 1);
  const net = Object.values(by).reduce((a, v) => a + v, 0);
  const traded = Object.keys(by).length;
  return (
    <div className="months">
      {years.map((y) => {
        const keys = MON.map((_, m) => keyOf(y, m));
        const total = keys.reduce((a, k) => a + (by[k] || 0), 0);
        const any = keys.some((k) => by[k] != null);
        return [
          <div key={`y${y}`} className="months-year">
            <span className="num">{y}</span>
            <span className={`num ${total < 0 ? "loss" : ""}`}>{any ? compactNum(total) : "–"}</span>
          </div>,
          ...MON.map((name, m) => {
            const k = keys[m], v = by[k], future = k > nowKey;
            const text = `${MONTHS[m]} ${y}: ${v != null ? fmtMoney(v, { sign: true }) : future ? "still to come" : "no trades"}`;
            const open = !future && onPick ? () => onPick(y, m) : undefined;
            return (
              <div key={k} className={`month-day months-cell heat-cell ${v != null ? heatClass(v, max) : "zero"} ${k === nowKey ? "today" : ""} ${future ? "future" : ""} ${open ? "opens" : ""}`}
                style={heatStyle(v, max)} tabIndex={future ? -1 : 0} role={open ? "button" : undefined} aria-label={open ? `${text}. Open ${MONTHS[m]}` : text}
                onClick={open} onKeyDown={open && ((e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } })}
                onPointerEnter={() => setTip(text)} onPointerLeave={() => setTip(null)} onFocus={() => setTip(text)} onBlur={() => setTip(null)}>
                <span className="month-date">{name}</span>
                {v != null && <span className="month-val num">{compactNum(v)}</span>}
              </div>
            );
          }),
        ];
      })}
      <div className="heat-foot">
        <span className="heat-readout">{tip || (traded ? `All time: ${fmtMoney(net, { sign: true })} over ${traded} month${traded === 1 ? "" : "s"} traded` : "No trades yet")}</span>
        <HeatLegend max={max} />
      </div>
    </div>
  );
}

// The calendar for the period on show: the month's days, or every month
export function PeriodHeat({ trades, onPick }) {
  return CAL.all ? <MonthsHeat trades={trades} onPick={onPick} /> : <MonthHeat daily={dailyOf(trades)} today={todayInView()} />;
}

export function ScoreGauge({ value, label = "Discipline" }) {
  const gid = useId().replace(/:/g, "");
  const box = useRef(null);
  const settled = useRef(null); // the value the arc last came to rest on
  const target = value ?? 0;
  // The arc fills from 0 up to the score each time it appears
  const [shown, setShown] = useState(() => (reducedMotion() ? target : 0));
  useLayoutEffect(() => {
    if (reducedMotion() || settled.current === target) { settled.current = target; setShown(target); return; }
    let raf;
    const from = shown, t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - p, 3);
      setShown(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else settled.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const r = 80, cx = 100, cy = 96, start = -210, sweep = 240;
  const polar = (deg, rad = r) => [cx + rad * Math.cos((deg * Math.PI) / 180), cy + rad * Math.sin((deg * Math.PI) / 180)];
  const arc = (from, to, rad = r) => {
    const [x1, y1] = polar(from, rad), [x2, y2] = polar(to, rad);
    return `M${x1},${y1} A${rad},${rad} 0 ${to - from > 180 ? 1 : 0} 1 ${x2},${y2}`;
  };
  const frac = Math.min(1, Math.max(0, shown / 100));
  const ticks = Array.from({ length: 21 }, (_, i) => start + (sweep / 20) * i);
  const [ex, ey] = polar(start + sweep * frac);
  const [lx, ly] = polar(start, r), [rx, ry] = polar(start + sweep, r);
  return (
    <div className="score" ref={box} role="img" aria-label={value == null ? `${label}: no score yet` : `${label}: ${value} out of 100`}>
      <svg viewBox="0 0 200 160" aria-hidden="true">
        <defs>
          <linearGradient id={`score${gid}`} x1="0" x2="1">
            <stop offset="0" style={{ stopColor: "var(--gauge-from)" }} />
            <stop offset="1" style={{ stopColor: "var(--gauge-to)" }} />
          </linearGradient>
        </defs>
        <path d={arc(start, start + sweep)} className="score-track" />
        {frac > 0.001 && <path d={arc(start, start + sweep * frac)} stroke={svgRef(`score${gid}`)} className="score-fill" />}
        {ticks.map((d, i) => {
          const [x1, y1] = polar(d, 68), [x2, y2] = polar(d, i % 5 === 0 ? 61 : 64);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={`score-tick ${i % 5 === 0 ? "major" : ""}`} />;
        })}
        {value != null && <circle cx={ex} cy={ey} r="5.5" className="score-end" />}
        <text x="100" y="100" textAnchor="middle" className="score-value">{value == null ? "–" : Math.round(shown)}</text>
        <text x="100" y="127" textAnchor="middle" className="score-label">{label.toUpperCase()}</text>
        <text x={lx} y={ly + 17} textAnchor="middle" className="score-num">0</text>
        <text x={rx} y={ry + 17} textAnchor="middle" className="score-num">100</text>
      </svg>
    </div>
  );
}

/* ---------- Numbers that count ---------- */

// The first count while the app opens waits for its figure to rise into view, and takes longer
const opening = () => document.documentElement.classList.contains("opening");
function useCount(target, ms = 1000) {
  const [shown, setShown] = useState(() => (reducedMotion() || !Number.isFinite(target) ? target : 0));
  const now = useRef(shown);
  useEffect(() => {
    const from = now.current;
    if (reducedMotion() || !Number.isFinite(target) || !Number.isFinite(from) || from === target) { now.current = target; setShown(target); return; }
    let raf;
    const slow = from === 0 && opening();
    const t0 = performance.now() + (slow ? 1300 : 0), span = slow ? ms * 1.8 : ms;
    const tick = (t) => {
      const p = Math.max(0, Math.min(1, (t - t0) / span)), e = 1 - Math.pow(1 - p, 4);
      now.current = p < 1 ? from + (target - from) * e : target;
      setShown(now.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

const seps = (text) => text.split(/([,.])/).map((p, i) => (i % 2 ? <span key={i} className="roll-sep">{p}</span> : p));

export function Rolling({ value, format = (v) => String(v), className = "" }) {
  const shown = useCount(value);
  const text = format(value);
  const live = format(Number.isInteger(value) ? Math.round(shown) : shown);
  return (
    <span className={`roll ${className}`}>
      <span className="roll-size" aria-hidden="true">{seps(text)}</span>
      <span className="roll-live" aria-hidden="true">{seps(live)}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/* ---------- Slim meter ---------- */

export function Meter({ value, max = 100, mark, label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter" role={label ? "meter" : undefined} aria-label={label} aria-valuenow={label ? value : undefined} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? max : undefined}>
      <span style={{ width: `${pct}%` }} />
      {mark != null && <i style={{ left: `${(mark / max) * 100}%` }} />}
    </div>
  );
}
