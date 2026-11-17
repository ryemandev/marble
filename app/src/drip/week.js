import { useMemo } from "react";
import { NOW, fmtMoney, todayKey } from "../data";
import { LIVE } from "../mode";
import { exampleOn, getState, setState, useStore } from "../store";
import { stageOf } from "./accounts";
import { keepCloses } from "./closes";

const DAY = 86400000;
const noon = (y, m, d) => Date.UTC(y, m, d, 12);
export const today = () => noon(NOW.year, NOW.month, NOW.day);
export const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const stampOf = (t) => (t.dayKey ? Date.parse(`${t.dayKey}T12:00:00Z`) : noon(NOW.year, NOW.month, t.day));
export const todayId = () => (LIVE ? todayKey() : keyOf(today()));
export const mondayOf = (ms) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;

export const money = (v, opts = {}) => fmtMoney(v, { decimals: 0, ...opts }).replace("-", "−");

// This week, Monday to Friday, and the same for any week before it
export function weekOf(trades, back = 0) {
  const start = mondayOf(today()) - back * 7 * DAY;
  const days = Array.from({ length: 5 }, (_, i) => {
    const at = start + i * DAY;
    return { at, key: keyOf(at), letter: "MTWTF"[i], pnl: 0, trades: 0, today: at === today(), future: at > today() };
  });
  for (const t of trades) {
    const d = days[Math.round((stampOf(t) - start) / DAY)];
    if (d) { d.pnl += +t.pnl || 0; d.trades += 1; }
  }
  return { days, net: days.reduce((a, d) => a + d.pnl, 0) };
}

// Money is only ever added up within one stage. Evaluation is never added to live.
export const unfolded = (trades) => trades.flatMap((t) => t.copies?.members || [t]);

export function byStage(trades, accounts) {
  const stage = Object.fromEntries(accounts.map((a) => [a.id, a.stage]));
  for (const a of getState().accounts || []) stage[a.id] ||= stageOf(a); // an archived account isn't on show, and its money is still what it was
  const out = {};
  for (const one of unfolded(trades)) (out[stage[one.account] || "live"] ||= []).push(one);
  return out;
}

// Real dollars and simulated dollars never share a total. Live and funded money is real; evaluation and paper money
// is simulated. money is the real total when there is any, else the simulated one, and aside is the simulated total
// that was kept out.
export function splitMoney(trades, accounts) {
  const stages = byStage(trades, accounts);
  const all = (keys) => keys.flatMap((k) => stages[k] || []);
  const sum = (list) => list.reduce((a, t) => a + (+t.pnl || 0), 0);
  const real = all(["live", "funded"]), sim = all(["eval", "paper"]);
  const mixed = real.length > 0 && sim.length > 0;
  return { mixed, simulated: !real.length && sim.length > 0, money: real.length ? sum(real) : sum(sim), aside: mixed ? sum(sim) : null };
}

// The one kind of real money a day was in, if it was one. Live and funded together can't be named, and nor can a trade
// on no account.
export function realStage(trades, accounts) {
  const stages = byStage(trades, accounts);
  const real = ["live", "funded"].filter((s) => stages[s]?.length);
  return real.length === 1 && stages[real[0]].every((t) => t.account) ? real[0] : null;
}

/* ---------- Closed days ---------- */

export const FINISHES = [
  { id: "white", name: "White", need: 0 },
  { id: "black", name: "Black", need: 0 },
  { id: "carbon", name: "Carbon", need: 60 },
];
export const finishesFor = (n) => FINISHES.filter((f) => n >= f.need);
// The finish a card wears: the one the trader chose while it's open to them, else the newest they have
export const finishFor = (n, wanted) => { const open = finishesFor(n); return (open.find((f) => f.id === wanted) || open.at(-1)).id; };
export const nextFinish = (n) => FINISHES.find((f) => n < f.need) || null;

export const useCloses = () => useStore((s) => s.closes);
export function closeToday(facts) {
  const closes = { ...getState().closes, [todayId()]: { at: Date.now(), ...facts } };
  setState({ closes });
  if (LIVE && !exampleOn()) keepCloses(closes);
}

// The first day a trader closed: "5 Nov 2026"
export function recordSince(closes) {
  const first = Object.keys(closes).sort()[0];
  return first ? new Date(`${first}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
}

export function useWeekClosed(closes) {
  return useMemo(() => {
    const { days } = weekOf([]);
    const due = days.filter((d) => !d.future);
    return { done: due.filter((d) => closes[d.key]).length, of: due.length, days };
  }, [closes]);
}
