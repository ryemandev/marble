import { EMOTIONS_BAD, EMOTIONS_GOOD, MISTAKES, NOW, SAMPLE, statsFor, summarize } from "./data";
import { COMMUNITY } from "./views/community/sample";
import { studySample } from "./views/study/samples"; // Study's notebooks, sample only
import { MONEY_SAMPLE } from "./views/money/sample";
import { seeded } from "./lib/basics.js";

export * from "./data";

export const SETUPS = ["ORB retest", "Liquidity sweep", "VWAP reclaim", "Trend pullback", "Range breakout"];
export const SYMBOLS = ["NQ", "ES", "MNQ", "GC", "CL", "EURUSD"];

// October, trade by trade, oldest first. Sample data, written out by hand so the month reads like a real one:
// under half the trades win, seven of the sixteen days traded before today are red, two weekdays have no trades, the 13th is
// a bad day and today is still open. Monday the 26th and today are the same days the website shows.
// Day, time, account, market, side, setup, dollars, dollars at risk, kept to the plan, feeling
const OCTOBER = [
  [1, "09:52", "topstep", "NQ", "short", "ORB retest", 412, 250, true, "Focused"],
  [1, "10:24", "apex", "ES", "long", "Liquidity sweep", 182, 300, true, "Patient"],
  [1, "11:36", "topstep", "ES", "long", "Trend pullback", -187, 250, true, "Calm"],
  [1, "13:08", "ibkr", "GC", "long", "Trend pullback", 115, 150, false, "Confident"],

  [5, "09:47", "topstep", "NQ", "short", "ORB retest", -231, 250, true, "Hesitant"],
  [5, "11:15", "topstep", "MNQ", "long", "VWAP reclaim", 227, 200, true, "Calm"],
  [5, "15:12", "topstep", "NQ", "long", "Trend pullback", -236, 250, false, "Revenge"],

  [6, "09:44", "topstep", "CL", "long", "VWAP reclaim", 487, 250, true, "Focused"],
  [6, "10:18", "apex", "NQ", "long", "ORB retest", 402, 300, true, "Confident"],
  [6, "11:02", "apex", "MNQ", "long", "Liquidity sweep", -217, 300, true, "Rushed"],
  [6, "12:47", "ibkr", "ES", "long", "Trend pullback", -62, 150, true, "Patient"],

  [7, "10:06", "topstep", "ES", "long", "Liquidity sweep", 483, 200, true, "Patient"],
  [7, "10:52", "topstep", "NQ", "short", "Liquidity sweep", -164, 250, false, "Rushed"],
  [7, "13:21", "ibkr", "EURUSD", "long", "Range breakout", -74, 150, true, "Calm"],

  [8, "09:58", "topstep", "NQ", "long", "ORB retest", -248, 250, true, "Focused"],
  [8, "10:35", "ftmo", "EURUSD", "short", "Range breakout", -210, 250, true, "FOMO"],
  [8, "12:14", "topstep", "GC", "short", "Trend pullback", 250, 200, true, "Patient"],
  [8, "15:24", "topstep", "ES", "long", "Range breakout", -312, 300, true, "FOMO"],

  [9, "09:49", "ftmo", "GC", "long", "Trend pullback", 274, 250, true, "Calm"],
  [9, "10:27", "topstep", "CL", "long", "VWAP reclaim", -203, 250, true, "Focused"],
  [9, "11:08", "topstep", "NQ", "long", "Liquidity sweep", 176, 250, true, "Focused"],
  [9, "15:14", "ibkr", "ES", "long", "Trend pullback", 121, 150, true, "Confident"],

  [12, "10:11", "topstep", "NQ", "long", "Liquidity sweep", -226, 250, true, "Patient"],
  [12, "11:29", "topstep", "ES", "long", "Trend pullback", 195, 250, true, "Calm"],
  [12, "15:07", "ibkr", "NQ", "short", "Liquidity sweep", -259, 200, true, "FOMO"],

  [13, "09:46", "topstep", "NQ", "long", "ORB retest", -262, 250, true, "Hesitant"],
  [13, "10:22", "apex", "ES", "long", "Liquidity sweep", -228, 300, true, "Rushed"],
  [13, "11:17", "topstep", "NQ", "long", "VWAP reclaim", 134, 250, true, "Focused"],
  [13, "13:40", "ftmo", "EURUSD", "long", "Range breakout", -267, 250, true, "FOMO"],
  [13, "15:05", "topstep", "NQ", "short", "Range breakout", -389, 300, false, "Revenge"],
  [13, "15:41", "ibkr", "ES", "short", "Trend pullback", -388, 300, false, "Revenge"],

  [15, "09:53", "topstep", "ES", "long", "ORB retest", 563, 250, true, "Focused"],
  [15, "10:34", "apex", "NQ", "long", "Liquidity sweep", 214, 300, true, "Patient"],
  [15, "11:12", "topstep", "CL", "long", "VWAP reclaim", -149, 250, false, "FOMO"],
  [15, "12:38", "ibkr", "GC", "long", "Trend pullback", 312, 200, true, "Calm"],

  [16, "09:51", "topstep", "NQ", "short", "ORB retest", 443, 250, true, "Confident"],
  [16, "10:44", "ftmo", "GC", "long", "Trend pullback", -180, 250, true, "Hesitant"],
  [16, "11:33", "topstep", "ES", "long", "Trend pullback", -142, 250, true, "Calm"],
  [16, "15:18", "topstep", "NQ", "long", "Trend pullback", 74, 200, false, "FOMO"],

  [19, "10:03", "apex", "MNQ", "long", "Liquidity sweep", 296, 300, true, "Focused"],
  [19, "10:48", "topstep", "NQ", "long", "Liquidity sweep", -195, 250, true, "Rushed"],
  [19, "11:41", "topstep", "ES", "short", "Trend pullback", 510, 250, true, "Patient"],

  [20, "09:45", "topstep", "CL", "short", "VWAP reclaim", -158, 250, true, "Hesitant"],
  [20, "10:29", "ftmo", "GC", "short", "Trend pullback", 110, 250, true, "Calm"],
  [20, "13:15", "ibkr", "GC", "long", "Trend pullback", -96, 150, true, "Patient"],
  [20, "15:33", "topstep", "NQ", "long", "VWAP reclaim", -266, 250, true, "FOMO"],

  [21, "09:57", "topstep", "NQ", "long", "ORB retest", 628, 250, true, "Focused"],
  [21, "10:36", "ftmo", "GC", "short", "Trend pullback", 318, 250, true, "Patient"],
  [21, "11:24", "topstep", "ES", "long", "Liquidity sweep", -158, 250, true, "Calm"],
  [21, "12:42", "ibkr", "EURUSD", "long", "Range breakout", 117, 150, false, "FOMO"],

  [22, "10:09", "topstep", "ES", "long", "Liquidity sweep", 418, 250, true, "Confident"],
  [22, "11:03", "topstep", "NQ", "long", "Trend pullback", -61, 250, true, "Patient"],
  [22, "15:09", "topstep", "CL", "long", "Range breakout", -133, 250, true, "Rushed"],

  [23, "09:48", "apex", "ES", "long", "ORB retest", -190, 300, true, "Hesitant"],
  [23, "10:57", "topstep", "NQ", "short", "Liquidity sweep", 212, 250, true, "Calm"],
  [23, "15:26", "topstep", "ES", "short", "Liquidity sweep", -287, 250, false, "Revenge"],

  [26, "09:50", "topstep", "NQ", "long", "ORB retest", 120, 250, true, "Calm"],
  [26, "10:26", "apex", "MNQ", "long", "Liquidity sweep", 184, 300, true, "Patient"],
  [26, "10:41", "topstep", "ES", "long", "Liquidity sweep", -390, 300, true, "Hesitant"],
  [26, "11:38", "topstep", "NQ", "short", "Trend pullback", 214, 250, true, "Focused"],
  [26, "13:25", "topstep", "ES", "short", "Range breakout", -250, 250, true, "Rushed"],

  [27, "09:41", "topstep", "CL", "long", "VWAP reclaim", 558, 250, true, "Focused"],
  [27, "12:26", "topstep", "ES", "short", "Range breakout", -306, 250, false, "Rushed"],
  [27, "13:34", "topstep", "CL", "long", "Range breakout", 215, 250, true, "Calm"],
];

export const TRADES = OCTOBER.map(([day, time, account, symbol, side, setup, pnl, risk, followedPlan, emotion], i) => {
  const r = +(pnl / risk).toFixed(2);
  return {
    id: `T${1000 + i}`,
    account,
    source: i % 7 === 3 ? "manual" : "import",
    day,
    date: `Oct ${day}`,
    time,
    hour: +time.slice(0, 2),
    weekday: new Date(2026, 9, day).getDay(),
    symbol,
    side,
    setup,
    r,
    pnl,
    grade: pnl > 0 ? (r > 2 ? "A+" : r > 1.2 ? "A" : "B") : followedPlan ? "B" : "C",
    emotion,
    followedPlan,
    mistakes: !followedPlan && pnl < 0 ? [MISTAKES[i % MISTAKES.length]] : [],
    heldMinutes: 3 + (((63 - i) * 7) % 38),
  };
}).reverse();

// Older months, for the views that reach past October. Sample data: a little under half the trades win, a month
// can end red, and the last trade of a busier day is sometimes a late one that mostly loses. The two evaluations
// only have trades from the day the Money tab shows them paid for.
const OPENED = { ftmo: "2026-08-18", apex: "2026-09-22" };
const older = seeded(22928);
const one = (list) => list[Math.floor(older() * list.length)];
export const HISTORY = [8, 7, 6, 5].flatMap((m) => {
  const days = Array.from({ length: new Date(2026, m + 1, 0).getDate() }, (_, i) => i + 1).filter((d) => ![0, 6].includes(new Date(2026, m, d).getDay()));
  const list = [];
  days.forEach((day) => {
    if (older() < 0.2) return;
    const key = `2026-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const open = ["topstep", "topstep", "topstep", "ibkr", ...(key >= OPENED.ftmo ? ["ftmo"] : []), ...(key >= OPENED.apex ? ["apex", "apex"] : [])];
    const n = 1 + Math.floor(older() * 3.4);
    const session = Array.from({ length: n }, (_, k) => {
      const late = k > 0 && k === n - 1 && older() < 0.3;
      const win = older() < (late ? 0.2 : 0.49);
      const r = win ? +(0.5 + older() * 1.6).toFixed(2) : -+(0.45 + older() * 0.8).toFixed(2);
      const risk = 150 + Math.round(older() * 4) * 50;
      const hour = late ? 15 : 9 + Math.floor(older() * 5);
      const minute = Math.floor(older() * 60);
      const followedPlan = older() < (late ? 0.4 : win ? 0.9 : 0.8);
      const steady = older() < (!followedPlan ? 0.1 : win ? 0.88 : 0.5);
      return {
        account: one(open), source: "import", day, dayKey: key, month: key.slice(0, 7), date: `${["Jun", "Jul", "Aug", "Sep"][m - 5]} ${day}`,
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, hour, weekday: new Date(2026, m, day).getDay(),
        symbol: one(SYMBOLS), side: older() < 0.56 ? "long" : "short", setup: one(SETUPS),
        r, pnl: Math.round(r * risk), size: 1 + Math.floor(older() * 6), grade: win ? (r > 2 ? "A+" : r > 1.2 ? "A" : "B") : followedPlan ? "B" : "C",
        emotion: one(steady ? EMOTIONS_GOOD : EMOTIONS_BAD), followedPlan, mistakes: !win && !followedPlan ? [MISTAKES[(day + m) % MISTAKES.length]] : [], heldMinutes: 2 + Math.floor(older() * older() * 90),
      };
    }).sort((a, b) => a.time.localeCompare(b.time));
    session.forEach((t, k) => list.push({ id: `H${m}${String(day).padStart(2, "0")}${k}`, ...t }));
  });
  return list.reverse();
});

// What each account holds: where it started plus every sample trade on it, so a tracker's balance ties to the trades.
// Room is how far the account can fall before the firm's line. Topstep's and Apex's lines trail the highest close of
// a day; FTMO's stays where it started.
const dayOf = (t) => t.dayKey || `2026-10-${String(t.day).padStart(2, "0")}`;
function standing(id, start, { trail = 0, fixed = 0 } = {}) {
  const mine = [...HISTORY, ...TRADES].filter((t) => t.account === id);
  const days = {};
  for (const t of mine) days[dayOf(t)] = (days[dayOf(t)] || 0) + t.pnl;
  const today = dayOf(TRADES[0]); // the newest day is still open, so it has no close yet
  let made = 0, high = 0;
  for (const k of Object.keys(days).sort()) { made += days[k]; if (k < today) high = Math.max(high, made); }
  const month = TRADES.reduce((a, t) => (t.account === id ? a + t.pnl : a), 0);
  const room = trail ? Math.min(trail, trail - (high - made)) : fixed ? fixed + made : null;
  return { balance: start + made, change: +((100 * month) / (start + made - month)).toFixed(2), ...(room == null ? {} : { room, roomOf: trail || fixed }) };
}
export const ACCOUNTS = [
  { id: "apex", name: "Apex 150K", firm: "apex", label: "150K", kind: "Eval · Phase 1", color: "#ffffff", status: "eval", ...standing("apex", 150000, { trail: 5000 }) },
  { id: "topstep", name: "Topstep 50K", firm: "topstep", label: "50K", kind: "Funded", color: "#c8cacf", status: "funded", ...standing("topstep", 50000, { trail: 2000 }) },
  { id: "ftmo", name: "FTMO 100K", firm: "ftmo", label: "100K", kind: "Eval · Phase 2", color: "#8e9197", status: "eval", ...standing("ftmo", 100000, { fixed: 10000 }) },
  { id: "ibkr", name: "IBKR", firm: "interactive-brokers", kind: "Live · Equities", color: "#5c5f64", status: "live", ...standing("ibkr", 24000) },
];

export const totals = summarize(TRADES);

export const CHECKLIST = [
  "Marked the higher timeframe levels",
  "Checked the news calendar",
  "Bias and invalidation written down",
  "Risk per trade set in the platform",
  "Slept well, no tilt from yesterday",
];

export const PLAN = {
  bias: "Bullish above 21,480",
  levels: ["21,560", "21,480", "21,410"],
  news: "CPI 08:30 ET. Flat 5 min either side.",
  risk: "$500 a trade · 3 losses and I stop",
};

const PLAYBOOK = [
  { id: "apollo", setup: "ORB retest", god: "The wanderer", name: "Opening range retest", img: "masters/wanderer-friedrich", rules: ["First 15m range marked", "Retest holds on 1m close", "Stop beyond the range", "Target the next liquidity pool"],
    thesis: "The first fifteen minutes show where the day's fight is. I wait for the edge of that range to hold on a retest, never the first break.", whenRun: ["09:45–11:00 NY", "ES · NQ"] },
  { id: "athena", setup: "Liquidity sweep", god: "Night figure", name: "Liquidity sweep", img: "anime/night-figure", rules: ["Sweep of the Asia or London high", "Displacement back inside", "Entry on the fair value gap", "Half size before 10:00"],
    thesis: "Price runs the obvious high, traps the late buyers, then snaps back inside. I sell the snap, never the run.", whenRun: ["10:00–13:00 NY", "NQ · ES", "No entries 5 min around news"] },
  { id: "hermes", setup: "VWAP reclaim", god: "The duel", name: "VWAP reclaim", img: "anime/samurai-duel", rules: ["Trend day only", "Two closes back over VWAP", "Stop under the reclaim candle", "Scale at the first target"],
    thesis: "On a trend day, price that loses VWAP and wins it back says the buyers never left. Two closes over it and I'm in.", whenRun: ["09:30–11:00 NY", "NQ · CL"] },
  { id: "heracles", setup: "Trend pullback", god: "The chasseur", name: "Trend pullback", img: "masters/charging-chasseur-gericault", rules: ["Higher timeframe trend aligned", "Pullback to the 20 EMA", "No entries into news", "Trail under structure"],
    thesis: "The trend does the work. I buy the pause at the 20 EMA with the bigger picture behind me, and let structure walk me out.", whenRun: ["10:00–14:00 NY", "ES · NQ · GC"] },
];
export const STRATEGIES = PLAYBOOK.map((s) => ({ ...s, ...statsFor(s.setup, TRADES) }));

export const NEWS = [
  { time: "08:30", title: "CPI m/m", full: "Consumer Price Index", period: "September 2026", impact: "high", prev: "0.4%", fcst: "0.3%", actual: "0.2%", src: "BLS" },
  { time: "10:00", title: "Consumer sentiment", full: "University of Michigan, preliminary", impact: "med", prev: "53.6", fcst: "53.0", actual: "52.1", src: "UMich" },
  { time: "14:00", title: "FOMC minutes", full: "Minutes of the September meeting", impact: "high", src: "Fed" },
  { time: "15:30", title: "Fed speaker: Waller", full: "Remarks on the economic outlook", impact: "med", src: "Fed" },
];
export const NEWS_WEEK = [
  { day: -1, time: "10:00", title: "New home sales", impact: "med", prev: "652K", fcst: "660K", actual: "671K", src: "Census" },
  { day: 1, time: "08:30", title: "GDP", full: "Gross Domestic Product, advance", period: "Q3 2026", impact: "high", prev: "+3.1%", fcst: "+2.8%", src: "BEA" },
  { day: 2, time: "08:15", title: "ECB rate decision", impact: "high", prev: "2.00%", fcst: "2.00%", src: "ECB", country: "EU" },
  { day: 2, time: "08:30", title: "Jobless claims", impact: "med", prev: "221K", fcst: "223K", src: "DOL" },
  { day: 3, time: "08:30", title: "PCE inflation", full: "Personal Income and Outlays", period: "September 2026", impact: "high", prev: "+0.3%", fcst: "+0.2%", src: "BEA" },
  { day: 7, time: "10:00", title: "JOLTS", impact: "med", prev: "7,227K", fcst: "7,200K", src: "BLS" },
  { day: 10, time: "08:30", title: "Jobs report", full: "Employment Situation", period: "October 2026", impact: "high", prev: "+142K · 4.3%", fcst: "+120K · 4.3%", src: "BLS" },
  { day: 14, time: "08:30", title: "CPI", full: "Consumer Price Index", period: "October 2026", impact: "high", prev: "+0.2%", fcst: "+0.3%", src: "BLS" },
];
export const NEWS_WIRE = [
  { time: "13:41", src: "Rates desk", h: "Treasury yields hold steady ahead of the Fed minutes" },
  { time: "13:20", src: "FX desk", h: "Dollar edges higher as traders wait for the FOMC minutes" },
  { time: "12:05", src: "Equities desk", h: "Nasdaq futures keep their morning gains after a softer CPI" },
  { time: "10:02", src: "Rates desk", h: "Consumer sentiment slips to a five-month low" },
  { time: "08:31", src: "Markets desk", h: "US consumer prices rise less than forecast in September" },
  { time: "07:45", src: "Energy desk", h: "Oil slips as US inventories build for a second week" },
  { time: "06:10", src: "Europe desk", h: "European shares open flat before US inflation data" },
];

export const STUDY_FOLDERS = [
  { name: "Price action", notes: 12, last: "Yesterday" },
  { name: "Order flow", notes: 7, last: "Oct 22" },
  { name: "Risk", notes: 9, last: "Oct 24" },
  { name: "Psychology", notes: 15, last: "Today" },
];

export const STUDY_NOTES = [
  { title: "Why the 9:45 fake-out keeps catching me", folder: "Psychology", when: "Today", video: "12:44" },
  { title: "Fair value gaps on the 1 minute", folder: "Price action", when: "Yesterday", video: "31:10" },
  { title: "Sizing down after two losses", folder: "Risk", when: "Oct 24", video: null },
  { title: "Reading absorption on the tape", folder: "Order flow", when: "Oct 22", video: "18:02" },
];

const WINS = [...TRADES].filter((t) => t.pnl > 0).sort((a, b) => b.pnl - a.pnl);

export const FEED = [
  { id: "p1", kind: "win", user: "marcus.r", crew: "OLY", time: "2h", trade: WINS[0], img: "cars/porsche-911-black", caption: "Waited for the retest.", likes: 214 },
  { id: "p2", kind: "photo", user: "priya", crew: "NITE", time: "3h", img: "japan/torii-tunnel", caption: "Walk after the close", likes: 96 },
  { id: "p3", kind: "photo", user: "leo", crew: "OLY", time: "3h", img: "masters/self-portrait-rembrandt", caption: "", likes: 151 },
  { id: "p4", kind: "win", user: "kenji", crew: "PIT", time: "4h", trade: WINS[3], img: "anime/night-figure", caption: "Waited for the close", likes: 88 },
  { id: "p5", kind: "photo", user: "ava", crew: "PIT", time: "5h", img: "cars/porsche-rear", caption: "First payout, first lap", likes: 302 },
  { id: "p6", kind: "photo", user: "sol", crew: null, time: "5h", img: "money/cash-bricks", caption: "Paid out", likes: 44 },
  { id: "p7", kind: "win", user: "tom.w", crew: null, time: "6h", trade: WINS[5], img: "masters/colossus-goya", caption: "", likes: 67 },
  { id: "p8", kind: "photo", user: "marcus.r", crew: "OLY", time: "7h", img: "masters/charging-chasseur-gericault", caption: "Closed the day early.", likes: 120 },
  { id: "p9", kind: "photo", user: "priya", crew: "NITE", time: "8h", img: "japan/ryu", caption: "", likes: 73 },
  { id: "p10", kind: "win", user: "ava", crew: "PIT", time: "9h", trade: WINS[8], img: "cars/ferrari-rear", caption: "London open", likes: 59 },
  { id: "p11", kind: "photo", user: "kenji", crew: "PIT", time: "10h", img: "cars/ferrari-wheel", caption: "", likes: 38 },
  { id: "p12", kind: "photo", user: "leo", crew: "OLY", time: "11h", img: "anime/night-figure", caption: "Queen of the range", likes: 91 },
  { id: "p13", kind: "photo", user: "sol", crew: null, time: "12h", img: "anime/samurai-duel", caption: "", likes: 64 },
  { id: "p14", kind: "win", user: "priya", crew: "NITE", time: "13h", trade: WINS[11], img: "textures/kintsugi", caption: "Broke, then mended", likes: 140 },
];

const REPLY_SEED = {
  p1: ["anime/samurai-duel", "cars/aston-front", "anime/kabuto"],
  p5: ["cars/aston-badge", "anime/ronin"],
  p8: ["masters/magdalen-la-tour"],
};

const STORIES = [
  { user: "marcus.r", img: "japan/torii-tunnel" },
  { user: "priya", img: "anime/night-figure" },
  { user: "kenji", img: "japan/ryu" },
  { user: "ava", img: "cars/aston-front" },
  { user: "leo", img: "masters/jerome-writing-caravaggio" },
  { user: "sol", img: "anime/moon-reflection" },
  { user: "tom.w", img: "cars/porsche-headlight" },
];

export const AVATARS = {
  "marcus.r": "anime/ronin", priya: "anime/night-girl", leo: "masters/self-portrait-rembrandt", kenji: "anime/kabuto",
  ava: "cars/aston-badge", sol: "textures/chrome-ripple", "tom.w": "masters/stag-at-sharkeys-bellows", You: null,
};

const LEADERS = [
  ["ava", "PIT", 48210, 68, 112], ["marcus.r", "OLY", 41980, 64, 96], ["kenji", "PIT", 36450, 61, 140],
  ["priya", "NITE", 31720, 66, 74], ["leo", "OLY", 27390, 58, 88], ["dante", "NITE", 22840, 55, 131],
  ["sol", null, 19660, 63, 52], ["mira.k", "OLY", 17120, 59, 67], ["tom.w", null, 14980, 57, 81], ["rex", "PIT", 12350, 54, 99],
].map(([user, crew, month, winRate, trades], i) => {
  const r = seeded(100 + i);
  let acc = 0;
  const curve = Array.from({ length: 24 }, () => (acc += (r() - 0.32) * month / 12));
  return { user, crew, winRate, trades, curve, pnl: { week: Math.round(month * (0.22 + r() * 0.12)), month, all: Math.round(month * (5 + r() * 3)) } };
});

const P = (no, time, text, extra = {}) => ({ no, time, text, name: "Anonymous", ...extra });
const BOARD_THREADS = [
  { no: 104001, subject: "Board rules", sticky: true, bumped: 0, posts: [
    P(104001, "Oct 20", "One board, everyone welcome.\n>no selling signals or paid groups\n>no posting other people's private info\n>losses are welcome here, nobody is judged for a red day\nReport anything that breaks these. Be good to each other.", { name: "Mod", id: "MOD" }),
  ] },
  { no: 104210, subject: "Rate my risk management", bumped: 9, img: "cars/ferrari-wheel", posts: [
    P(104210, "13:02", "Funded 50K. Risking 1% a trade, max 3 trades a day, done after 2 losses.\nToo tight or am I leaving money on the table?", { id: "k2Lp" }),
    P(104214, "13:05", ">>104210\nthat's how you keep the account. most people blow it in week one", { id: "Qe7a" }),
    P(104219, "13:11", ">>104210\n>done after 2 losses\nthis is the whole game honestly", { id: "Zx4m" }),
    P(104225, "13:20", "1% is fine. the leak is never the risk %, it's the 4th trade you take angry", { id: "b9Tr" }),
  ] },
  { no: 104190, subject: "NQ open was violent today", bumped: 8, img: "anime/ronin", posts: [
    P(104190, "09:51", "Swept the overnight high, dumped 120 points, then ripped back. Anyone actually catch it?", { id: "Ma3q" }),
    P(104192, "09:53", "got stopped on the first sweep, sat out the rest. no regrets", { id: "Tt8w" }),
    P(104197, "10:02", ">>104190\nwaited for the reclaim of the range. +$480. first time I didn't chase", { id: "p0Ls" }),
    P(104201, "10:06", ">>104197\nbased patience", { id: "Ma3q" }),
    P(104203, "10:09", ">be me\n>see 120 point candle\n>FOMO in at the top\n>mfw", { id: "R1ck" }),
    P(104204, "10:10", ">>104203\nwe've all been there anon", { id: "Tt8w" }),
  ] },
  { no: 104150, subject: "Prop firms that actually pay out?", bumped: 6, posts: [
    P(104150, "Yesterday", "Which firms have you actually received payouts from? Real experiences only.", { id: "Hn2v" }),
    P(104153, "Yesterday", "Topstep paid me twice, no issues. took 2 business days", { id: "c7Wd" }),
    P(104158, "Yesterday", ">>104150\nApex paid but read the consistency rule three times before you request", { id: "Lo9e" }),
  ] },
  { no: 104120, subject: "Why I journal every session", bumped: 4, img: "masters/jerome-writing-caravaggio", posts: [
    P(104120, "Oct 25", "Started writing down WHY I entered every trade. Found out 70% of my losses were entries before the 5m close.\nStopped doing that. Best month ever.", { id: "Fe5r" }),
    P(104124, "Oct 25", ">>104120\nthe pattern is always something stupid and obvious once you see it written down", { id: "yU6t" }),
  ] },
  { no: 104088, subject: "Post your desk setup (text edition)", bumped: 2, posts: [
    P(104088, "Oct 24", "One monitor. Chart, DOM, journal. That's it. Fewer screens = fewer bad ideas.", { id: "W3sx" }),
    P(104091, "Oct 24", "6 monitors and I still only look at the 1m chart lmao", { id: "Ny1o" }),
  ] },
];

const BOARD_CHATTER = [
  "anyone else sitting on their hands until CPI?",
  "red day. followed my rules though. that's a win in my book",
  ">tfw you take profit at $200 and it runs $1,200\nevery time",
  "the best trade today was the one I didn't take",
  "if your stop is mental it's not a stop",
  "just journaled a revenge trade. writing it down hurt more than losing it",
  "London session was clean today, NY was chop city",
];

export const WIN_POOL = WINS.slice(0, 20).map((t, i) => ({ ...t, user: ["marcus.r", "priya", "kenji", "ava", "leo", "sol", "tom.w"][i % 7] }));

export const CREWS = [
  { name: "Olympians", tag: "OLY", members: 312, img: "masters/charging-chasseur-gericault" },
  { name: "Night Shift", tag: "NITE", members: 128, img: "anime/samurai-duel" },
  { name: "Pit Lane", tag: "PIT", members: 74, img: "cars/ferrari-wheel" },
];

export const IDEAS = [
  { id: "i1", title: "Import trades straight from my broker", body: "Tradovate and NinjaTrader first. Typing fills in by hand is where I fall behind.", area: "Journal", status: "Under review", votes: 412, by: "marcus.r", when: "Oct 3" },
  { id: "i2", title: "Replay a trade on the chart, candle by candle", body: "Step through the session and see exactly where I entered against the plan.", area: "Journal", status: "Planned", votes: 298, by: "kenji", when: "Oct 9" },
  { id: "i3", title: "Hard stop after my daily loss limit", body: "Lock the log trade button for the rest of the day once I'm down my limit.", area: "Strategy", status: "Planned", votes: 251, by: "priya", when: "Oct 12" },
  { id: "i4", title: "Phone widget with today's P&L and rules kept", body: "", area: "Mobile", status: "Under review", votes: 187, by: "ava", when: "Oct 18" },
  { id: "i5", title: "Compare two setups side by side", body: "Win rate, expectancy and drawdown for two setups on one screen.", area: "Analytics", status: "Under review", votes: 143, by: "leo", when: "Oct 21" },
  { id: "i6", title: "Dark and light mode", body: "", area: "Other", status: "Shipped", votes: 520, by: "sol", when: "Sep 14" },
  { id: "i7", title: "Share cards with my handle on them", body: "", area: "Community", status: "Shipped", votes: 233, by: "tom.w", when: "Sep 22" },
  { id: "i8", title: "Tag trades with the news event they were near", body: "So I can see whether CPI days are worth trading at all.", area: "Analytics", status: "Under review", votes: 96, by: "dante", when: "Oct 25" },
  { id: "i9", title: "Live voice sessions in Community", body: "Scheduled live sessions with a host: listen in, ask questions in writing, raise your hand to speak. Never recorded.", area: "Community", status: "Under review", votes: 64, by: "juno", when: "Oct 29" },
];
export const POLLS = [
  { id: "q1", question: "What should we build next?", options: [["Trade replay", 642], ["Prop firm rule tracker", 418], ["Phone widget", 251], ["Group journals for crews", 187]], ends: "Ends in 3 days", by: "Marble team" },
  { id: "q2", question: "How do you review your trading?", options: [["After every session", 311], ["Once a week", 486], ["When I have a bad day", 223]], ends: "Ends in 6 days", by: "priya" },
];

// The note the demo's sample trades show in the journal
export const TRADE_NOTES = {
  kept: "Waited for the retest instead of chasing the first push. Entry on the 1 minute close, stop under the range.",
  broke: "Took it before the candle closed. The level wasn't confirmed. Next time: wait for the close.",
};

export const MARKET = { NQ: [21480, 12, 2], MNQ: [21480, 12, 2], ES: [5942, 4, 2], GC: [2661, 3, 1], CL: [71.2, 0.25, 2], EURUSD: [1.0845, 0.0012, 5] };

Object.assign(SAMPLE, { MARKET, TRADE_NOTES, ACCOUNTS, SETUPS, TRADES, PLAN, CHECKLIST, STRATEGIES, NEWS, NEWS_WEEK, NEWS_WIRE, STUDY_FOLDERS, STUDY_NOTES, FEED, REPLY_SEED, STORIES, AVATARS, LEADERS, BOARD_THREADS, BOARD_CHATTER, WIN_POOL, CREWS, IDEAS, POLLS, COMMUNITY });

const STUDY = studySample({ now: new Date(NOW.year, NOW.month, NOW.day, 13, 52).getTime(), trades: TRADES });
Object.assign(SAMPLE, { NOTEBOOKS: STUDY.notebooks, PAGES: STUDY.pages });

Object.assign(SAMPLE, { MONEY: MONEY_SAMPLE, HISTORY });

// Every weekday this month up to yesterday is closed, the two with no trades included. Today is the one day still
// open, and closing it makes Day 19, the card the website shows.
const closedDays = () => {
  const out = {};
  for (let day = 1; day < NOW.day; day++) {
    const at = Date.UTC(NOW.year, NOW.month, day, 12);
    if (![0, 6].includes(new Date(at).getUTCDay())) out[new Date(at).toISOString().slice(0, 10)] = { at };
  }
  return out;
};
Object.assign(SAMPLE, { CLOSES: closedDays() });
