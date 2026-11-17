import { pad, seeded } from "../lib/basics.js";

const rand = seeded(7);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export const ACCOUNTS = [
  { id: "c-bybit", world: "crypto", name: "Bybit Main", firm: "bybit", label: "Main", kind: "USDT perps", balance: 17240, color: "#ffffff", status: "live", quoteCcy: "USDT" },
  { id: "c-binance", world: "crypto", name: "Binance Futures", firm: "binance", label: "Futures", kind: "USD-M", balance: 9660, color: "#c8cacf", status: "live", quoteCcy: "USDT" },
  { id: "c-hl", world: "crypto", name: "Hyperliquid 0x4f…a91c", firm: "hyperliquid", label: "0x4f…a91c", kind: "Wallet", balance: 6320, color: "#8e9197", status: "live", quoteCcy: "USDC" },
  { id: "c-breakout", world: "crypto", name: "Breakout 50K", firm: "breakout", label: "50K", kind: "1-Step · Eval", balance: 50000, color: "#5c5f64", status: "eval", quoteCcy: "USD" },
  { id: "c-hyro", world: "crypto", name: "HyroTrader 25K", firm: "hyrotrader", label: "25K", kind: "Funded", balance: 25000, color: "#3a3c40", status: "funded", quoteCcy: "USDT" },
];

const MARKETS = {
  BTCUSDT: { px: 67200, acct: ["c-bybit", "c-binance", "c-hyro", "c-breakout"] },
  ETHUSDT: { px: 2560, acct: ["c-bybit", "c-binance", "c-hyro"] },
  SOLUSDT: { px: 152, acct: ["c-bybit", "c-breakout"] },
  BTC: { px: 67200, acct: ["c-hl"] },
  HYPE: { px: 38.4, acct: ["c-hl"] },
};
const SYMS = ["BTCUSDT", "BTCUSDT", "ETHUSDT", "ETHUSDT", "SOLUSDT", "BTC", "HYPE"];
const SETUPS = ["Reclaim", "Funding fade", "Asia range", "Sweep and reclaim", "Trend pullback"];
const LEVS = [1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 7, 8, 10, 12, 15, 18];
const HOURS = [1, 2, 3, 5, 7, 8, 8, 9, 10, 12, 13, 13, 14, 14, 15, 15, 16, 17, 19, 20, 22, 23];

const NOW_DAY = 27, NOW_MIN = 17 * 60 + 52; // 27 October, 17:52 UTC (13:52 in New York)

export const TRADES = Array.from({ length: 54 }, (_, i) => {
  const day = 1 + Math.floor((i * NOW_DAY) / 54);
  const weekday = new Date(Date.UTC(2026, 9, day)).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  let hour = pick(HOURS);
  if (day === NOW_DAY && hour * 60 > NOW_MIN - 30) hour = 9 + (i % 7);
  const minute = Math.floor(rand() * 60);
  const symbol = pick(SYMS);
  const m = MARKETS[symbol];
  const account = pick(m.acct);
  const side = rand() < 0.56 ? "long" : "short";
  const leverage = pick(LEVS);
  // Weekends were harder (thin books): fewer wins
  const win = rand() < (weekend ? 0.42 : 0.61);
  const r = win ? round(0.5 + rand() * 2.2) : -round(0.35 + rand() * 0.65);
  const risk = 110 + Math.round(rand() * 6) * 20;
  const entry = round(m.px * (0.94 + rand() * 0.1), m.px > 1000 ? 1 : 3);
  const stopDist = entry * (0.004 + rand() * 0.008);
  const size = round(risk / stopDist, m.px > 1000 ? 3 : 1);
  const dir = side === "long" ? 1 : -1;
  const exit = round(entry + dir * r * stopDist, m.px > 1000 ? 1 : 3);
  const gross = round((exit - entry) * dir * size);
  const notional = entry * size;
  const makerIn = rand() < 0.36;
  const feeMaker = round(makerIn ? notional * (symbol === "BTC" || symbol === "HYPE" ? -0.0001 : 0.0002) : 0);
  const feeTaker = round(notional * 0.00055 * (makerIn ? 1 : 2));
  const commission = round(feeMaker + feeTaker);
  const funding = rand() < 0.36 ? round((rand() < 0.68 ? -1 : 1) * notional * (0.00005 + rand() * 0.0002)) : null;
  const pnl = round(gross - commission + (funding || 0));
  const mmr = 0.005;
  const liqPrice = round(side === "long" ? entry * (1 - 1 / leverage + mmr) : entry * (1 + 1 / leverage - mmr), m.px > 1000 ? 1 : 3);
  return {
    id: `C${2000 + i}`, world: "crypto", account, day, date: `Oct ${day}`, time: `${pad(hour)}:${pad(minute)}`, hour, weekday,
    symbol, side, setup: pick(SETUPS), entry, exit, size, stop: round(entry - dir * stopDist, m.px > 1000 ? 1 : 3),
    r: round(pnl / risk), pnl, commission, feeMaker, feeTaker, funding, leverage, liqPrice,
    grade: win ? (r > 1.6 ? "A" : "B") : rand() < 0.5 ? "C" : "B",
    emotion: win ? pick(["Calm", "Patient", "Focused"]) : pick(["Rushed", "FOMO", "Hesitant"]),
    followedPlan: leverage <= 5 ? rand() < 0.85 : rand() < 0.3,
    source: account === "c-hl" ? "sync" : "import",
  };
}).reverse();

export const POSITIONS = [
  { key: "p1", symbol: "BTC", side: "long", leverage: 5, entry: 66940, liqPrice: 53240, dist: 20.5 },
  { key: "p2", symbol: "ETH", side: "short", leverage: 8, entry: 2548, liqPrice: 2879, dist: 13.0 },
  { key: "p3", symbol: "HYPE", side: "long", leverage: 10, entry: 38.9, liqPrice: 35.87, dist: 7.8 },
];

export const PLAN = { bias: "BTC long above 66,800", levels: ["68,400", "66,800", "64,950"], news: "Funding 00:00 UTC · BTC +0.010%", risk: "1% a trade · 5× max · liquidation 10% away" };
export const RULES = {
  checklist: ["Leverage set before the entry", "Liquidation outside my invalidation", "Funding rate checked", "Size from the stop, not the leverage", "No new trades after 22:00 UTC"],
  lossLimit: 1500, maxTrades: 6, stopAfter: 3, maxLeverage: 5, minLiqDistance: 10,
};
export const TICKS = [true, true, true, false, false];

export const CRYPTO = { ACCOUNTS, TRADES, POSITIONS, PLAN, RULES, TICKS };
