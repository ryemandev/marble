import { art } from "../../data";
import { registerSamples } from "./media";

registerSamples({ "chart-fvg": () => chartGrab(), "brush-hand": () => art("japan/brush-hand", 960) });

const LESSONS = {
  fvg: { videoId: "ZVUDpCyvxfQ", videoTitle: "Understanding Fair Value Gaps", videoChannel: "TTrades", videoLen: 596 },
  mm9: { videoId: "9P-u7MWosFo", videoTitle: "Market Mechanics Ep 9: Fair Value Gaps", videoChannel: "Brad Goh", videoLen: 1863 },
};
// "m:ss" in seconds
const s = (t) => (t == null ? null : t.split(":").reduce((a, x) => a * 60 + +x, 0));
const L = (t, text, key = false) => ({ t: s(t), text, key });

const NOTEBOOKS = [
  { key: "pa", title: "Price action", cover: "masters/calling-of-matthew-caravaggio", ribbon: 7, pages: [
    { lesson: "fvg", ago: 7, title: "Fair value gaps, the basics", lines: [
      L("0:31", "Three candles. Gap = wick 1 to wick 3."),
      L("1:05", "Candle 2 moved too fast to fill."),
      L("1:48", "Price comes back to rebalance it."),
      L("2:40", "Only trade it in the move's direction.", true),
      L("3:12", "Bigger candle 2 = stronger gap."),
      L("3:55", "Midpoint = consequent encroachment."),
      L("4:30", "Watch the midpoint, not the edge."),
      L("5:18", "Close through it and it's done."),
      L("6:02", "Best ones come after a sweep."),
      L("6:47", "Gaps inside a range are noise."),
      L("7:35", "15m gap first, then drop to the 1m.", true),
      L("9:10", "Rewatch from 4:30 with a chart open."),
    ] },
    { lesson: "fvg", ago: 7, title: "Homework", lines: [
      L(null, "Find 5 gaps that held, 5 that failed."),
      L(null, "Held: all came after an Asia sweep."),
      L(null, "Failed: 4 of 5 against the 15m trend."),
      L(null, "Trend first. The gap is the entry.", true),
      L("6:02", "Sweep, displacement, gap. In order."),
      L("6:40", "Displacement: big bodies, small wicks."),
      L("7:05", "No displacement, no trade."),
    ] },
    { lesson: "mm9", ago: 5, title: "Imbalance, the auction view", lines: [
      L("1:12", "An FVG is a one-sided auction."),
      L("2:30", "Price comes back for the other side."),
      L("3:45", "So the first touch reacts hardest."),
      L("5:20", "First touch best. Third, a coin flip.", true),
      L("6:58", "Volume on the way out = it's real."),
      L("8:15", "Low volume gap fills straight through."),
      L("9:40", "Higher timeframe gaps act as magnets."),
      L("11:02", "1m gaps fill all day. Ignore them."),
      L("13:30", "1m entries only inside a 15m gap.", true),
    ] },
    { lesson: "mm9", ago: 5, title: "Entries and stops", lines: [
      L("14:10", "Entry: 1m shift inside the 15m gap."),
      L("15:20", "Stop beyond candle 1, not the gap."),
      L("16:05", "My stops have been inside the gap."),
      L("17:30", "Target liquidity, not a fixed 2R."),
      L("18:06", "Partial at the far edge, run the rest."),
      L("19:15", "Back through the midpoint: cut it."),
      L("20:02", "No gap trades 5 min around news.", true),
      L("21:40", "CPI spread blows straight through."),
    ] },
    { lesson: "mm9", ago: 4, title: "Took it today", trade: true, lines: [
      L("22:30", "Like his example. 15m gap after the sweep."),
      L(null, "Waited for the 1m shift inside the gap."),
      L(null, "Stop beyond candle 1. First touch."),
      L(null, "Partial at the far edge, ran the rest."),
      L(null, "Waiting for the shift made it an A.", true),
      L("24:15", "Moved my stop to break-even early."),
      L("25:02", "Stop moves only after the far edge."),
    ] },
    { lesson: "mm9", ago: 1, title: "Stacked gaps", lines: [
      L("26:10", "Gaps in a row = strong trend."),
      L("27:05", "Defend the last gap in the stack."),
      L("27:50", "If the last gap fails, trend's done."),
      L("28:40", "A failed gap is a signal. Flip bias.", true),
      L("29:30", "Inversion: support turns resistance."),
      L("30:15", "Find a full lesson on inversions."),
    ] },
    { lesson: "fvg", ago: 0, at: 341, title: "Rewatch, chart open", photos: [
      { path: "sample/chart-fvg", w: 1200, h: 750, caption: "My 15m chart: the gap held at the midpoint.", t: 330 },
      { path: "sample/brush-hand", w: 960, h: 640, caption: "Drew the three candles out by hand.", t: 352 },
    ], lines: [
      L("4:30", "Midpoint holds cleaner than I thought."),
      L("4:52", "Best when the gap is on the 15m."),
      L("5:18", "Closes through = invalid. I ignore it."),
    ] },
  ] },
  { key: "ps", title: "Psychology", cover: "masters/joseph-carpenter-la-tour", ribbon: 2, pages: [
    { lesson: null, ago: 2, title: "The 9:45 fake-out", lines: [
      L(null, "Caught by the 9:45 fake-out again."),
      L(null, "Not the setup. I need a trade early."),
      L(null, "Nothing before 9:50. On the plan.", true),
      L(null, "Two losses and I size up. Every time."),
      L(null, "Two losses: walk away for 20 minutes.", true),
    ] },
    { lesson: null, ago: 1, title: "After a big win", lines: [
      L(null, "Best day of the month, then gave half back."),
      L(null, "Felt like I couldn't lose. Sized up."),
      L(null, "A big win ends the day. Screens off.", true),
    ] },
  ] },
  { key: "of", title: "Order flow", cover: "masters/self-portrait-rembrandt", ribbon: 1, pages: [
    { lesson: null, ago: 13, title: "Absorption", lines: [
      L(null, "Sellers hit the bid, price won't drop."),
      L(null, "Fat cluster at the low on the footprint."),
      L(null, "Absorption at a 15m gap: best long.", true),
    ] },
    { lesson: null, ago: 12, title: "Delta at the high", lines: [
      L(null, "New high, delta lower. Buyers are tired."),
      L(null, "Wait for the low of the bar to break."),
    ] },
  ] },
  { key: "rk", title: "Risk", cover: "masters/both-members-bellows", ribbon: 1, pages: [
    { lesson: null, ago: 11, title: "Sizing", lines: [
      L(null, "Half size after two losses in a row."),
      L(null, "Daily stop $1,500. Came close once."),
      L(null, "Risk is set before the open.", true),
    ] },
  ] },
  { key: "ex", title: "Execution", cover: "masters/magdalen-la-tour", ribbon: 1, pages: [
    { lesson: null, ago: 16, title: "Checklist", lines: [
      L(null, "Bias, levels, news. Before 9:00."),
      L(null, "No trade without the stop in first."),
      L(null, "Screenshot every entry for the review."),
    ] },
  ] },
];

export function studySample({ now = Date.now(), prefix = "s-", example = false, trades = [] } = {}) {
  const at = (ago, minutes = 0) => new Date(now - ago * 864e5 - minutes * 60000).toISOString();
  const linked = trades.find((t) => t.symbol === "NQ" && t.side === "long" && t.pnl > 0 && /^A/.test(t.grade || ""))
    || trades.find((t) => t.pnl > 0) || null;
  const notebooks = [], pages = [];
  NOTEBOOKS.forEach((nb, i) => {
    const id = `${prefix}nb-${nb.key}`;
    const oldest = Math.max(...nb.pages.map((p) => p.ago));
    const newest = Math.min(...nb.pages.map((p) => p.ago));
    notebooks.push({ id, title: nb.title, cover: nb.cover, position: i, lastPage: nb.ribbon, createdAt: at(oldest, 600), updatedAt: at(newest, 20 + i), ...(example ? { example: true } : {}) });
    nb.pages.forEach((p, j) => {
      const lesson = p.lesson ? LESSONS[p.lesson] : null;
      pages.push({
        id: `${prefix}pg-${nb.key}-${j + 1}`, notebookId: id, n: j + 1, title: p.title,
        videoId: lesson?.videoId ?? null, videoTitle: lesson?.videoTitle ?? null, videoChannel: lesson?.videoChannel ?? null, videoLen: lesson?.videoLen ?? null,
        videoAt: p.at ?? (p.lines.filter((l) => l.t != null).at(-1)?.t ?? null),
        tradeId: p.trade && linked ? linked.id : null,
        lines: p.lines.map((l) => ({ ...l })),
        attachments: (p.photos || []).map((a) => ({ ...a })),
        createdAt: at(p.ago, 120 - j), updatedAt: at(p.ago, 60 - j),
        ...(example ? { example: true } : {}),
      });
    });
  });
  return { notebooks, pages };
}

let grab = null;
function chartGrab() {
  if (grab) return grab;
  const W = 1200, H = 750, n = 46, left = 40, right = 1090, top = 70, bottom = 690;
  let p = 100, seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bars = [];
  for (let i = 0; i < n; i++) {
    const drift = i < 16 ? -0.5 : i < 22 ? 0.2 : i === 24 ? 6.5 : i < 34 ? 0.9 : i < 38 ? -1.1 : 1.2;
    const o = p, c = p + drift + (rnd() - 0.5) * 2.4;
    bars.push({ o, c, h: Math.max(o, c) + rnd() * 1.4, l: Math.min(o, c) - rnd() * 1.4 });
    p = c;
  }
  const hi = Math.max(...bars.map((b) => b.h)), lo = Math.min(...bars.map((b) => b.l));
  const y = (v) => top + ((hi - v) / (hi - lo)) * (bottom - top);
  const step = (right - left) / n, bw = step * 0.56;
  const gapTop = bars[25].l, gapBot = bars[23].h, mid = (gapTop + gapBot) / 2;
  const grid = Array.from({ length: 6 }, (_, i) => `<line x1="0" x2="${W}" y1="${top + i * 124}" y2="${top + i * 124}" stroke="#1d1d1d"/>`).join("");
  const candles = bars.map((b, i) => {
    const x = left + i * step + step / 2, up = b.c >= b.o;
    const y1 = y(Math.max(b.o, b.c)), y2 = y(Math.min(b.o, b.c));
    return `<line x1="${x}" x2="${x}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${up ? "#e9e9e9" : "#7a7a7a"}" stroke-width="2"/>` +
      `<rect x="${x - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(2, y2 - y1)}" fill="${up ? "#0b0b0b" : "#7a7a7a"}" stroke="${up ? "#e9e9e9" : "#7a7a7a"}" stroke-width="2"/>`;
  }).join("");
  const gx = left + 23 * step;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#0b0b0b"/>${grid}
<rect x="${gx}" y="${y(gapTop)}" width="${right - gx}" height="${y(gapBot) - y(gapTop)}" fill="#ffffff" fill-opacity="0.08" stroke="#cfcfcf" stroke-dasharray="6 6"/>
<line x1="${gx}" x2="${right}" y1="${y(mid)}" y2="${y(mid)}" stroke="#cfcfcf" stroke-width="1.5" stroke-dasharray="2 6"/>
${candles}
<text x="${right - 8}" y="${y(gapTop) - 10}" fill="#e9e9e9" font-family="Arial, sans-serif" font-size="20" text-anchor="end">15m FVG</text>
<text x="${right - 8}" y="${y(mid) - 8}" fill="#9a9a9a" font-family="Arial, sans-serif" font-size="16" text-anchor="end">midpoint</text>
<text x="28" y="44" fill="#e9e9e9" font-family="Arial, sans-serif" font-size="22" font-weight="700">NQ · 15</text>
<rect x="${right + 10}" y="0" width="${W - right - 10}" height="${H}" fill="#0f0f0f"/>
${[0, 1, 2, 3, 4, 5].map((i) => `<text x="${right + 22}" y="${top + i * 124 + 6}" fill="#6f6f6f" font-family="Arial, sans-serif" font-size="15">${(21480 + (5 - i) * 25).toFixed(2)}</text>`).join("")}
</svg>`;
  grab = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return grab;
}
