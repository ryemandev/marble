// The candles on a trade card. Real cards will carry real bars from the market. Sample cards draw theirs
// here, walked tick by tick from the trade's own entry and exit, so they read like a real chart and are
// only ever shown labelled as sample data.

const BARS = 66, TICKS = 16, ENTRY_BAR = 26;
const FRAMES = [1, 2, 3, 5, 15, 30, 60, 240];

// The smallest chart timeframe that keeps the whole trade on screen with room either side
export const frameFor = (minutes) => FRAMES.find((m) => (minutes || 0) / m <= 30) || 1440;

// Each market's own smallest price step
const TICK_SIZE = { NQ: 0.25, MNQ: 0.25, ES: 0.25, MES: 0.25, YM: 1, MYM: 1, RTY: 0.1, M2K: 0.1, CL: 0.01, MCL: 0.01, GC: 0.1, MGC: 0.1, SI: 0.005, NG: 0.001 };
export const tickOf = (symbol, dp) => TICK_SIZE[symbol] || 10 ** -dp;

// Whether a trade's card may draw candles. A real trade's have to come from the market, so one without
// them shows its prices alone: a made-up chart must never sit next to a trader's real numbers.
export const canChart = ({ entry, exit, bars }, sample) => entry != null && exit != null && (!!bars || !!sample);

// A small repeatable random source, so a trade always draws the same chart
const seeded = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const seedOf = (text) => [...String(text)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

export function sampleBars({ entry, exit, side = 1, tick = 0.25, held = 30, tf = 1, seed = 1 }) {
  const n = BARS, sub = TICKS, ei = ENTRY_BAR, xi = Math.min(n - 8, ei + Math.max(8, Math.round(held / tf)));
  const R = exit - entry, abs = Math.max(Math.abs(R), tick * 12), r = seeded(seed), T = n * sub;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const sigma = (0.22 * abs) / (1.6 * Math.sqrt(sub));
  let v = 1;
  const W = [0];
  for (let t = 1; t <= T; t++) {
    if (r() < 0.012) v = 1.6 + r() * 2.2; // a burst of activity
    v = 0.985 * v + 0.015 * 0.72; // and it dies away
    W.push(W[t - 1] + gauss() * sigma * v);
  }
  // The walk is bent to pass exactly through the entry and the exit, keeping all its noise
  const mid = (i) => i * sub + (sub >> 1);
  const pins = [[0, entry - side * abs * 0.42], [mid(ei - 9), entry - side * abs * 0.05], [mid(ei), entry], [mid(xi), exit], [T, exit - (Math.sign(R) || 1) * abs * 0.22]];
  const raw = W.slice();
  for (let k = 0; k + 1 < pins.length; k++) {
    const [ta, va] = pins[k], [tb, vb] = pins[k + 1], miss = raw[tb] - raw[ta] - (vb - va);
    for (let t = ta; t <= tb; t++) W[t] = va + (raw[t] - raw[ta]) - (miss * (t - ta)) / (tb - ta);
  }
  const round = (p) => Math.round(p / tick) * tick;
  const bars = [];
  for (let i = 0; i < n; i++) {
    const part = W.slice(i * sub, (i + 1) * sub + 1).map(round);
    bars.push({ o: part[0], c: part[part.length - 1], h: Math.max(...part), l: Math.min(...part) });
  }
  const most = Math.max(...bars.map((k) => k.h - k.l)) || 1;
  bars.forEach((k) => { k.v = (0.3 + 0.7 * ((k.h - k.l) / most)) * (0.65 + 0.7 * r()); });
  return { bars, ei, xi };
}

// A clean price step for the scale beside the candles
export function scaleOf(lo, hi, dp) {
  const raw = (hi - lo) / 6, mag = 10 ** Math.floor(Math.log10(raw || 1));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) || mag;
  const ticks = [];
  for (let p = Math.ceil(lo / nice) * nice; p <= hi; p += nice) ticks.push(p);
  return { ticks, places: Math.max(0, Math.min(dp, -Math.floor(Math.log10(nice)))) };
}

// A day's trades as candles: each one opens where the last closed. No market data in it, only the
// trader's own results in order.
export function dayBars(steps) {
  let at = 0;
  return steps.map((pnl) => {
    const o = at;
    at += pnl;
    return { o, c: at };
  });
}
