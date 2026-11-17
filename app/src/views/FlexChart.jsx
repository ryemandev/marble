import { dayBars, scaleOf } from "./flexbars";

// The chart on a card, drawn as plain SVG so the saved image is sharp at any size. Solid candles in the
// finish's two tones, a price scale and times like any trading platform, and the trade's fills.

const money = (v, dp) => v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const clock = (at, mins) => {
  const [h, m] = String(at || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

// Each finish's candles: the card's own ink, and a grey that holds up against its paper
export const TONES = {
  white: { up: "#000", down: "#a2a2a0", soft: "#6f6f6d", grid: "#000", paper: "#fff" },
  silver: { up: "#000", down: "#737371", soft: "#3f3f3d", grid: "#000", paper: "#cfcfcc" },
  black: { up: "#fff", down: "#7a7a78", soft: "#9c9c9a", grid: "#fff", paper: "#000" },
  carbon: { up: "#fff", down: "#7a7a78", soft: "#9c9c9a", grid: "#fff", paper: "#0b0b0b" },
};

const Text = (p) => <text fontFamily="var(--mono)" style={{ fontFeatureSettings: '"tnum"' }} {...p} />;

export function TradeChart({ chart, box, finish, levels, size }) {
  const c = TONES[finish] || TONES.black;
  const { bars, ei, xi, entry, exit, side, dp, code, tf, at } = chart;
  const label = (word, p) => `${word} ${money(p, dp)}`;
  const tagW = Math.ceil(Math.max(label("Entry", entry).length, label("Exit", exit).length) * size * 0.56) + 18;
  const X0 = box.x0, AX = box.ax, Y0 = box.y0, Y1 = box.y1, X1 = AX - (levels ? tagW + 4 : 58);
  const n = bars.length;
  const low = Math.min(...bars.map((k) => k.l)), high = Math.max(...bars.map((k) => k.h));
  const pad = (high - low) * 0.07, lo = low - pad - (high - low) * 0.16, hi = high + pad;
  const y = (p) => Y1 - ((p - lo) / (hi - lo)) * (Y1 - Y0);
  const w = (X1 - X0) / n, x = (i) => X0 + w * (i + 0.5), bw = Math.max(1.6, w * 0.7);
  const { ticks, places } = scaleOf(lo, hi, dp);
  const clear = (p) => !levels || (Math.abs(y(p) - y(entry)) > 20 && Math.abs(y(p) - y(exit)) > 20);
  const topVol = Math.max(...bars.map((k) => k.v || 0)) || 1;
  const times = [ei - 20, ei + 2, ei + 24].filter((i) => i >= 0 && i < n);
  // A buy under its candle pointing up, a sell over its candle pointing down
  const fill = (i, buy) => {
    const k = bars[i], cx = x(i), yy = buy ? y(k.l) + 8 : y(k.h) - 8;
    return <path d={buy ? `M${cx} ${yy}l6.5 10h-13z` : `M${cx} ${yy}l6.5 -10h-13z`} fill={c.up} stroke={c.paper} strokeWidth="1.5" paintOrder="stroke" />;
  };
  // The two price tags sit on the scale, as a chart's own labels do
  const tag = (p, word, solid, other) => {
    let cy = y(p);
    if (Math.abs(cy - y(other)) < 26) cy += cy < y(other) ? -7 : 7;
    return (
      <g transform={`translate(${X1 + 4} ${cy - 11.5})`}>
        <rect width={AX - X1 - 4} height="23" rx="5" fill={solid ? c.up : c.paper} stroke={c.up} strokeWidth="1.4" />
        <Text x="8" y="16" fontSize={size} fontWeight="600" fill={solid ? c.paper : c.up}>{label(word, p)}</Text>
      </g>
    );
  };
  return (
    <svg className="fc-chart" viewBox={`0 0 ${box.w} ${box.h}`} width={box.w} height={box.h} aria-hidden="true">
      {ticks.map((p) => (
        <g key={p}>
          <line x1={X0} x2={X1} y1={y(p)} y2={y(p)} stroke={c.grid} strokeOpacity="0.13" />
          {clear(p) && <Text x={AX} y={y(p) + 4} textAnchor="end" fontSize="12" fill={c.soft} stroke={c.paper} strokeWidth="3" paintOrder="stroke">{money(p, places)}</Text>}
        </g>
      ))}
      {at && times.map((i) => <Text key={i} x={x(i)} y={Y1 + 16} textAnchor="middle" fontSize="12" fill={c.soft}>{clock(at, (i - ei) * tf)}</Text>)}
      {bars.map((k, i) => {
        const h = ((k.v || 0) / topVol) * 34;
        return <rect key={i} x={x(i) - bw / 2} y={Y1 - h} width={bw} height={h} fill={k.c >= k.o ? c.up : c.down} fillOpacity="0.26" />;
      })}
      {bars.map((k, i) => {
        const col = k.c >= k.o ? c.up : c.down;
        return (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(k.h)} y2={y(k.l)} stroke={col} strokeWidth="1" />
            <rect x={x(i) - bw / 2} y={y(Math.max(k.o, k.c))} width={bw} height={Math.max(1, Math.abs(y(k.o) - y(k.c)))} fill={col} />
          </g>
        );
      })}
      {levels && fill(ei, side > 0)}
      {levels && fill(xi, side < 0)}
      {levels && tag(entry, "Entry", false, exit)}
      {levels && tag(exit, "Exit", true, entry)}
      <Text x={X0} y={Y0 + 2} fontSize="12.5" fontWeight="500" fill={c.soft} stroke={c.paper} strokeWidth="3" paintOrder="stroke">{code} · {tf < 60 ? `${tf}m` : `${tf / 60}h`}</Text>
    </svg>
  );
}

// A day's trades, one candle each, opening where the last closed
export function DayChart({ steps, box, finish, total }) {
  const c = TONES[finish] || TONES.black;
  const bars = dayBars(steps);
  const X0 = box.x0, AX = box.ax, Y0 = box.y0 + 12, Y1 = box.y1, X1 = AX - (total ? 96 : 14);
  const all = [0, ...bars.map((k) => k.c)], low = Math.min(...all), high = Math.max(...all);
  const pad = (high - low || 1) * 0.1, lo = low - pad, hi = high + pad;
  const y = (p) => Y1 - ((p - lo) / (hi - lo)) * (Y1 - Y0);
  const room = (X1 - X0) / bars.length, bw = Math.min(22, room * 0.42), x = (i) => X0 + room * (i + 0.5);
  const { ticks } = scaleOf(lo, hi, 0);
  const dollars = (p) => `${p < 0 ? "−" : ""}$${Math.abs(p).toLocaleString("en-US")}`;
  return (
    <svg className="fc-chart" viewBox={`0 0 ${box.w} ${box.h}`} width={box.w} height={box.h} aria-hidden="true">
      {ticks.map((p) => (
        <g key={p}>
          <line x1={X0} x2={X1} y1={y(p)} y2={y(p)} stroke={c.grid} strokeOpacity="0.13" />
          {total && Math.abs(y(p) - y(all.at(-1))) > 20 && <Text x={AX} y={y(p) + 4} textAnchor="end" fontSize="12" fill={c.soft}>{dollars(p)}</Text>}
        </g>
      ))}
      <line x1={X0} x2={X1} y1={y(0)} y2={y(0)} stroke={c.grid} strokeOpacity="0.4" />
      {bars.map((k, i) => (
        <g key={i}>
          {i > 0 && <line x1={x(i - 1) + bw / 2} x2={x(i) - bw / 2} y1={y(k.o)} y2={y(k.o)} stroke={c.grid} strokeOpacity="0.4" />}
          <rect x={x(i) - bw / 2} y={y(Math.max(k.o, k.c))} width={bw} height={Math.max(2, Math.abs(y(k.o) - y(k.c)))} fill={k.c >= k.o ? c.up : c.down} />
        </g>
      ))}
      {total && (
        <g transform={`translate(${AX - 92} ${y(all.at(-1)) - 11.5})`}>
          <rect width="92" height="23" rx="5" fill={c.up} />
          <Text x="46" y="16" textAnchor="middle" fontSize="12.5" fontWeight="600" fill={c.paper}>{total}</Text>
        </g>
      )}
      <Text x={X0} y={box.y0 + 2} fontSize="12.5" fontWeight="500" fill={c.soft} stroke={c.paper} strokeWidth="3" paintOrder="stroke">Trade by trade</Text>
    </svg>
  );
}
