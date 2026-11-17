import { useMemo } from "react";
import { SAMPLE } from "../data";
import { MON } from "../lib/basics.js";
import { LIVE } from "../mode";
import { setState, showAll, useAllTrades, useCounted, useStore } from "../store";
import { simulated, stageOf, useAccounts, useSample } from "./accounts";
import { withFees } from "./journal/stage";
import { keyOf, mondayOf, stampOf, today, todayId } from "./week";

// One total, in dollars: over a day, a week, a month, all time or a set range, for any accounts you pick.

const DAY = 86400000;
const KEY = "marble-pnl-view";
const FIRST = { desk: { kind: "week" }, stats: { kind: "month" } };

// What's stored may be old or broken, and the sums below can't take it, so keep only what still makes sense
const KINDS = ["day", "week", "month", "all", "range"];
const dayOk = (k) => (typeof k === "string" && /^\d{4}-\d\d-\d\d$/.test(k) && !Number.isNaN(Date.parse(`${k}T12:00:00Z`)) ? k : null);
const periodOk = (p, first) => (KINDS.includes(p?.kind) ? { ...p, back: Number.isInteger(p.back) && p.back > 0 && p.back < 5000 ? p.back : 0 } : first);
const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (!v || typeof v !== "object") return {};
    return { accounts: Array.isArray(v.accounts) ? v.accounts : null, desk: periodOk(v.desk, FIRST.desk), stats: periodOk(v.stats, FIRST.stats) };
  } catch { return {}; }
};
let view = null;
const current = () => (view ||= { accounts: null, desk: FIRST.desk, stats: FIRST.stats, ...read() });
const write = (patch) => {
  view = { ...current(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(view)); } catch {}
  setState({ pnlView: view });
};
const useView = () => useStore((s) => s.pnlView) || current();

const short = (ms) => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const shortKey = (key) => short(Date.parse(`${key}T12:00:00Z`));
const NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const monthName = (ms) => NAMES[new Date(ms).getUTCMonth()];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// A period in the words the Stats page uses: this month goes by its name, and a day or a week by its dates
export const periodWord = (span, now = today()) => (span.kind === "month" && !span.back ? monthName(now) : span.label);
export function periodDates(span) {
  if (!span.from || !span.to) return span.label;
  if (span.from !== span.to) return `${shortKey(span.from)} to ${shortKey(span.to)}`;
  const d = new Date(`${span.from}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${NAMES[d.getUTCMonth()]}`;
}
export const tradeDay = (t) => t.dayKey || keyOf(stampOf(t));

export function spanOf({ kind, back = 0, from: start = null, to: end = null }, now = today()) {
  if (kind === "all") return { kind, back: 0, from: null, to: null, label: "All time" };
  if (kind === "range") {
    const from = dayOk(start), to = dayOk(end);
    if (!from || !to) return { kind, back: 0, from, to, label: "Set a range" };
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { kind, back: 0, from: a, to: b, label: a === b ? shortKey(a) : `${shortKey(a)} to ${shortKey(b)}` };
  }
  if (kind === "day") {
    const at = now - back * DAY, key = keyOf(at);
    return { kind, back, from: key, to: key, label: back === 0 ? "Today" : back === 1 ? "Yesterday" : short(at) };
  }
  if (kind === "week") {
    const mon = mondayOf(now) - back * 7 * DAY;
    return { kind, back, from: keyOf(mon), to: keyOf(mon + 6 * DAY), label: back === 0 ? "This week" : back === 1 ? "Last week" : `${short(mon)} to ${short(mon + 6 * DAY)}` };
  }
  const d = new Date(now);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() - back;
  const first = Date.UTC(y, m, 1, 12), last = Date.UTC(y, m + 1, 0, 12);
  const at = new Date(first);
  return { kind: "month", back, from: keyOf(first), to: keyOf(last), label: back === 0 ? "This month" : `${NAMES[at.getUTCMonth()]} ${at.getUTCFullYear()}` };
}

// The stretch just before this one, the same length, to set it against
export function before(span) {
  if (span.kind === "all" || !span.from || !span.to) return null;
  if (span.kind !== "range") return spanOf({ kind: span.kind, back: span.back + 1 });
  const a = Date.parse(`${span.from}T12:00:00Z`), b = Date.parse(`${span.to}T12:00:00Z`), n = b - a + DAY;
  return spanOf({ kind: "range", from: keyOf(a - n), to: keyOf(b - n) });
}

export const inSpan = (t, s) => { const k = tradeDay(t); return (!s.from || k >= s.from) && (!s.to || k <= s.to); };
export const totalOf = (ts) => ts.reduce((a, t) => a + (+t.pnl || 0), 0);

// Every trade there is. The demo adds its older months here, so the other screens keep to October.
export function useEverything() {
  const all = useAllTrades();
  const world = useStore((s) => s.world);
  return useMemo(() => (LIVE || world === "crypto" ? all : [...all, ...(SAMPLE.HISTORY || [])]), [all, world]);
}

// Which accounts are in the total. Nothing picked means all of them.
export function useAccountPick() {
  const live = useAccounts();
  const added = useStore((s) => s.accounts);
  const accounts = useMemo(() => [...live, ...added.filter((a) => !a.archived && !live.some((x) => x.id === a.id))], [live, added]);
  const saved = useView().accounts;
  const ids = useMemo(() => {
    const here = (saved || []).filter((id) => accounts.some((a) => a.id === id));
    return here.length && here.length < accounts.length ? new Set(here) : null;
  }, [saved, accounts]);
  const label = !ids ? "All accounts" : ids.size === 1 ? accounts.find((a) => ids.has(a.id))?.name || "One account" : `${ids.size} accounts`;
  const has = useMemo(() => (t) => !ids || ids.has(t.account), [ids]);
  const toggle = (id) => {
    const now = ids ? new Set(ids) : new Set();
    if (now.has(id)) now.delete(id); else now.add(id);
    write({ accounts: now.size ? [...now] : null });
  };
  return { accounts, ids, label, has, toggle, all: () => write({ accounts: null }) };
}

// Where a first file lands. Its trades are mostly in the past, so every total opens on all of them.
export const showEverything = () => {
  showAll();
  write({ accounts: null, desk: { kind: "all", back: 0 }, stats: { kind: "all", back: 0 } });
};

export function usePeriod(scope) {
  const v = useView();
  const period = v[scope] || FIRST[scope];
  const day = useStore(() => keyOf(today())); // today moves on at midnight
  const span = useMemo(() => spanOf(period), [period, day]);
  const set = (patch) => write({ [scope]: { ...period, ...patch } });
  const pick = (kind) => set({ kind, back: 0 });
  const step = (by) => set({ back: Math.max(0, (period.back || 0) + by) });
  return { period, span, set, pick, step };
}

// Which of these trades are real money and which are simulated. Live and funded money is real; evaluation and paper
// money is simulated. An archived account still counts as what it was, and a trade on no account counts as real.
const NONE = [];
export function useKinds(raw) {
  const shown = useAccounts();
  const added = useStore((s) => s.accounts);
  return useMemo(() => {
    const stage = new Map(added.map((a) => [a.id, stageOf(a)]));
    for (const a of shown) stage.set(a.id, a.stage);
    const sim = raw.filter((t) => simulated(stage.get(t.account)));
    const mixed = sim.length > 0 && sim.length < raw.length;
    return { real: mixed ? raw.filter((t) => !simulated(stage.get(t.account))) : raw, sim: mixed ? sim : NONE, mixed, simulated: sim.length > 0 && !mixed };
  }, [raw, shown, added]);
}
// What a screen that keeps every trade says about the money in it
export const kindWord = (kinds) => (kinds.simulated ? "Simulated money" : kinds.mixed ? "Includes simulated money" : null);

// The money for a screen: pool is every trade in the picked accounts, trades is the stretch on show. The Desk's total
// is real money only when the accounts hold both kinds, and the simulated dollars come back as aside. Stats keeps
// every trade, because it's the trading that's being studied there, and says so.
export function useMoney(scope) {
  const everything = useEverything();
  const pick = useAccountPick();
  const period = usePeriod(scope);
  const sample = useSample();
  const every = useMemo(() => everything.filter(pick.has).map(withFees), [everything, pick.has]);
  const kinds = useKinds(every);
  const split = scope === "desk" && kinds.mixed;
  const raw = split ? kinds.real : every;
  const pool = useCounted(raw);
  const apart = useCounted(split ? kinds.sim : NONE);
  const trades = useMemo(() => pool.filter((t) => inSpan(t, period.span)), [pool, period.span]);
  const aside = useMemo(() => (split ? totalOf(apart.filter((t) => inSpan(t, period.span))) : null), [split, apart, period.span]);
  const who = split ? (pick.ids ? `${pick.label}, live and funded` : "Live and funded accounts") : pick.label;
  const tag = [who, split ? null : kindWord(kinds), sample ? "Sample data" : null].filter(Boolean).join(" · ");
  return { ...period, accounts: pick, pool, raw, trades, tag, sample, everything, aside, simulated: kinds.simulated };
}
