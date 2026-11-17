import * as S from "../sample";
import { SAMPLE } from "../data";
import { datedTrade } from "../store";
import { nyInstant, nyOf } from "./time";
import { studySample } from "../views/study/samples";

const { TRADES, ACCOUNTS, CHECKLIST, PLAN, STRATEGIES, STUDY_NOTES, TRADE_NOTES, MARKET } = S;
for (const k of Object.keys(SAMPLE)) delete SAMPLE[k];

const MORE_NOTES = [
  { title: "Opening range: when to wait for the second test", folder: "Price action", video: "08:15" },
  { title: "Inside bars before the open", folder: "Price action", video: null },
  { title: "Delta divergence at the high of day", folder: "Order flow", video: "22:40" },
  { title: "Daily loss limit: why it's a number, not a feeling", folder: "Risk", video: null },
  { title: "Scaling out at 1R and letting the rest run", folder: "Risk", video: "05:30" },
  { title: "The trade after a big win", folder: "Psychology", video: null },
  { title: "Boredom trades between 11:30 and 13:30", folder: "Psychology", video: "14:05" },
];

// The last weekdays up to today, newest first, in New York
function weekdays(n) {
  const out = [];
  const today = nyOf();
  for (let back = 0; out.length < n && back < n * 2 + 7; back++) {
    const d = new Date(Date.UTC(today.year, today.month, today.day - back));
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), back });
  }
  return out;
}

const round = (v, dp) => +(+v).toFixed(dp);

// How many weekdays back from the sample's newest day each of its days sits. Each sample day lands on the weekday
// that far back from today, so a day with no trades there is a day with no trades here, and a red day stays red.
const BACK = (() => {
  const out = {};
  for (let day = TRADES[0].day, back = 0; day >= 1; day--) {
    if ([0, 6].includes(new Date(2026, 9, day).getDay())) continue;
    out[day] = back++;
  }
  return out;
})();

export function buildExample() {
  const days = weekdays(20);
  const now = Date.now();
  const trades = TRADES.map((t, i) => {
    let at = null;
    for (let k = BACK[t.day] ?? 0; k < days.length && !at; k++) {
      const d = days[k];
      const minute = +t.time.slice(3);
      const instant = nyInstant(d.year, d.month, d.day, t.hour, minute);
      if (instant.getTime() <= now) at = instant; // a trade can't be later than now
    }
    at ||= nyInstant(days.at(-1).year, days.at(-1).month, days.at(-1).day, t.hour, +t.time.slice(3));
    const [base, unit, dp] = MARKET[t.symbol] || [100, 1, 2];
    const dir = t.side === "long" ? 1 : -1;
    const entry = round(base + (((i * 37) % 40) - 20) * unit * 0.25, dp);
    const stop = round(entry - dir * unit, dp);
    const exit = round(entry + dir * t.r * unit, dp);
    const size = 1 + (i % 3 === 0 ? 1 : 0);
    const held = 3 + ((i * 7) % 38); // minutes
    const closed = new Date(at.getTime() + held * 60000);
    const fills = [{ price: entry, qty: size, time: at.toISOString(), role: "entry" }];
    if (t.pnl > 0 && i % 4 === 1) {
      const part = round(entry + dir * Math.max(0.5, t.r * 0.55) * unit, dp);
      fills.push({ price: part, qty: 1, time: new Date(at.getTime() + held * 30000).toISOString(), role: "exit" });
    }
    fills.push({ price: exit, qty: size, time: closed.toISOString(), role: "exit" });
    return {
      ...datedTrade({
        id: `ex-${t.id}`, traded_at: at.toISOString(), symbol: t.symbol, side: t.side, setup: t.setup,
        entry, stop, exit, size, r: t.r, pnl: t.pnl, grade: t.grade, emotion: t.emotion, followedPlan: t.followedPlan,
        kept: [], note: TRADE_NOTES[t.followedPlan ? "kept" : "broke"], account: `ex-${t.account}`,
        screenshots: [], source: "manual", importId: null, needsReview: false, commission: null,
        closedAt: closed.toISOString(), fills: { list: fills },
      }),
      example: true,
    };
  }).sort((a, b) => b.traded_at.localeCompare(a.traded_at));

  const pnlOf = (id) => trades.reduce((sum, t) => (t.account === id ? sum + t.pnl : sum), 0);
  const accounts = ACCOUNTS.map((a) => {
    const id = `ex-${a.id}`;
    return { id, name: a.name, firm: a.firm || null, label: a.label || null, kind: a.kind, status: a.status, color: a.color, balance: Math.round(a.balance - pnlOf(id)), change: 0, example: true };
  });

  const strategies = STRATEGIES.map(({ id, setup, god, name, img, rules, thesis, whenRun }) => ({ id: `ex-${id}`, setup, god, name, img, rules, thesis, whenRun, example: true }));
  const notes = [...STUDY_NOTES, ...MORE_NOTES].map((n, i) => ({
    id: `ex-n${i}`, title: n.title, folder: n.folder, body: "", video: n.video, when: n.when || ["Today", "Yesterday", "Mon", "Fri"][i % 4], example: true,
  }));

  return {
    logged: trades,
    accounts,
    strategies,
    notes,
    ...studySample({ now, prefix: "ex-", example: true, trades }),
    plan: { ...PLAN, levels: [...PLAN.levels] },
    rules: { checklist: [...CHECKLIST], lossLimit: 2000, maxTrades: 5, stopAfter: 3 },
    ticks: CHECKLIST.map((_, i) => i < 2),
  };
}
