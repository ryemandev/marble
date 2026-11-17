import { money } from "../week.js";

const DAY = 86400000;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const noon = (key) => Date.parse(`${key}T12:00:00Z`);

// What to call an earlier day on the Desk's line: the words read the same on any day of the week
function dayWord(key, todayKey) {
  const back = Math.round((noon(todayKey) - noon(key)) / DAY);
  const d = new Date(noon(key));
  if (back === 1) return "Yesterday";
  if (back < 7) return DAYS[d.getUTCDay()];
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

// The latest day before today that has trades, and what it came to. dayOf reads a trade's day.
export function lastDay(pool, todayKey, dayOf) {
  let key = null;
  for (const t of pool) { const k = dayOf(t); if (k < todayKey && (!key || k > key)) key = k; }
  if (!key) return null;
  return { word: dayWord(key, todayKey), net: pool.reduce((a, t) => a + (dayOf(t) === key ? +t.pnl || 0 : 0), 0) };
}

// One line, the same form every day. today is { trades, net }, last comes from lastDay, left is the firm's drawdown
// room or null with no firm account, and todayChosen says the figure above already reads today.
export function deskLine({ today, last, left, todayChosen }) {
  const head = todayChosen ? null
    : today.trades ? `${money(today.net, { sign: true })} today.`
    : last ? `${last.word} ${money(last.net, { sign: true })}.`
    : null;
  const room = left == null ? null : `${money(Math.max(0, left))} drawdown left. Estimate.`;
  return [head, room].filter(Boolean).join(" ");
}
