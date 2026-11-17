import { useMemo, useSyncExternalStore } from "react";
import { CAL, NOW, SAMPLE, refreshNow, statsFor, todayKey } from "./data";
import { LIVE } from "./mode";
import { monthKey, nyInstant, nyOf, pad } from "./live/time";
import { inWorld, paintWorld, readWorld, rememberWorld, utcInstant, utcOf, utcTodayKey, worldOf } from "./world";
import { cryptoFull, dataWorld, worldsOn } from "./crypto/worlds";
import { DEFAULT_VIEW, counted, findCopies, fold } from "./lib/copies";
import { BACKDROP, OWN, backdropOf } from "./backdrop";
import { MON as SHORT } from "./lib/basics.js";

const KEY = "marble-store-v1";
let saved = {};
if (!LIVE) { try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {} }

export const DEFAULT_PROFILE = LIVE
  ? { name: "", handle: "", bio: "", avatar: null, avatarArt: null, cover: "masters/wanderer-friedrich", markets: ["Futures"], style: "Day trader", show: "dollars" }
  : { name: "Jules", handle: "jules", no: 42, showNumber: true, bio: "", avatar: null, avatarArt: null, cover: "masters/wanderer-friedrich", markets: ["Futures"], style: "Day trader", show: "dollars" };
const EMPTY_PLAN = { bias: "", levels: [], news: "", risk: "" };
let demoSource = null, demoCrypto = null, demoSorted = [];
const demoTrades = () => {
  const src = SAMPLE.TRADES || [];
  if (src !== demoSource || SAMPLE.CRYPTO !== demoCrypto) { demoSource = src; demoCrypto = SAMPLE.CRYPTO; demoSorted = [...src, ...(SAMPLE.CRYPTO?.TRADES || [])].sort((a, b) => b.day - a.day || String(b.time).localeCompare(String(a.time))); }
  return demoSorted;
};
const demoIn = (world) => demoTrades().filter((t) => inWorld(t, world));
const NO_RULES = { checklist: [], lossLimit: null, maxTrades: null, stopAfter: null };
const DEMO_RULES = { checklist: SAMPLE.CHECKLIST || [], lossLimit: 2000, maxTrades: 5, stopAfter: 3 };
const NO_CRYPTO_RULES = { ...NO_RULES, maxLeverage: null, minLiqDistance: null };
const DEMO_CRYPTO = () => ({
  plan: { ...EMPTY_PLAN, ...SAMPLE.CRYPTO?.PLAN },
  rules: { ...NO_CRYPTO_RULES, ...SAMPLE.CRYPTO?.RULES },
  checklist: SAMPLE.CRYPTO?.TICKS || [],
  deskAccount: null,
});
const LIVE_CRYPTO = () => ({ plan: EMPTY_PLAN, rules: NO_CRYPTO_RULES, checklist: [], deskAccount: null, planDay: utcTodayKey() });

const COPY_KEY = "marble-copies";
function savedCopyView() {
  try { const v = JSON.parse(localStorage.getItem(COPY_KEY)); if (v?.mode === "each" || v?.mode === "combined") return { mode: v.mode, account: typeof v.account === "string" ? v.account : null }; } catch {}
  return DEFAULT_VIEW;
}

const BACKDROP_KEY = "marble-backdrop";
const deviceBackdrops = () => { try { return JSON.parse(localStorage.getItem(BACKDROP_KEY)) || {}; } catch { return {}; } };
export const deviceBackdrop = (who) => (who ? deviceBackdrops()[who] || null : null);
function rememberBackdrop(who, b) {
  if (!who) return;
  try { localStorage.setItem(BACKDROP_KEY, JSON.stringify({ ...deviceBackdrops(), [who]: b })); } catch {}
}
const chapterOnly = ({ id, setup, god, name, img, rules, thesis, whenRun }) => ({ id, setup, god, name, img, rules, thesis, whenRun });
const demoBackdrop = (raw) => { const b = backdropOf(raw); return !b.at ? backdropOf(BACKDROP) : b.pic === OWN ? { ...b, pic: BACKDROP.pic } : b; };

const readCloses = () => { try { return JSON.parse(localStorage.getItem("marble-closes")) || {}; } catch { return {}; } };
let state = {
  world: worldsOn() && cryptoFull() ? readWorld(LIVE) : "markets",
  crypto: LIVE ? LIVE_CRYPTO() : { ...DEMO_CRYPTO(), ...saved.crypto },
  profile: { ...DEFAULT_PROFILE, ...saved.profile },
  plan: LIVE ? EMPTY_PLAN : { ...SAMPLE.PLAN, ...saved.plan },
  rules: LIVE ? NO_RULES : { ...DEMO_RULES, ...saved.rules },
  // Today's ticks, one per checklist item
  checklist: LIVE ? [] : saved.checklist || [true, true, false, false, false],
  logged: saved.logged || [],
  edits: saved.edits || {}, // changes to demo trades, by id
  // The demo's playbook starts as the sample's chapters, kept here so they can be edited or taken out
  strategies: LIVE || saved.playbookSeeded ? saved.strategies || [] : [...(SAMPLE.STRATEGIES || []).map(chapterOnly), ...(saved.strategies || [])],
  playbookSeeded: !LIVE,
  notes: saved.notes || [],
  notebooks: saved.notebooks || (LIVE ? [] : SAMPLE.NOTEBOOKS || []),
  pages: saved.pages || (LIVE ? [] : SAMPLE.PAGES || []),
  accounts: saved.accounts || [],
  newsRule: LIVE ? null : saved.newsRule || null,
  // The days the trader has closed: this device's copy to start with, then the server's (live/sync.js)
  closes: LIVE ? readCloses() : saved.closes || SAMPLE.CLOSES || {},
  closing: null, // the daily close, when it is open
  money: saved.money || (LIVE ? [] : SAMPLE.MONEY || []),
  moneyView: saved.moneyView || { period: "year", show: "all" }, // the receipt's dates and who it's printed for
  month: monthKey(CAL.year, CAL.month), // the month the views show (live)
  copyView: savedCopyView(),
  backdrop: LIVE ? null : demoBackdrop(saved.backdrop),
  dialog: null, // { kind, ...props }: which form is open
  toast: null,
};

const subs = new Set();
const watchers = new Set();
const persist = () => {
  if (LIVE) return;
  try {
    const { dialog, toast, world, closing, ...keep } = state;
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch {}
};

const PER_WORLD = ["plan", "rules", "checklist", "deskAccount", "planDay"];
const scoped = (s) => (dataWorld(s.world) === "crypto" ? { ...s, plan: s.crypto.plan, rules: s.crypto.rules, checklist: s.crypto.checklist, deskAccount: s.crypto.deskAccount, planDay: s.crypto.planDay } : s);
export const getState = () => scoped(state);
export const getRawState = () => state;

// What the example stands in for while it's on
const OVERLAY = ["logged", "accounts", "strategies", "notes", "notebooks", "pages", "plan", "rules", "checklist", "deskAccount", "closes"];
let viewCache = { src: null, out: null };
const exampleShows = (s) => !!s.example?.on && dataWorld(s.world) === "markets";
function viewOf(s) {
  if (viewCache.src === s) return viewCache.out;
  let out;
  const ex = s.example;
  if (exampleShows(s)) {
    const d = ex.data;
    out = { ...s, logged: d.logged, accounts: d.accounts, strategies: d.strategies, notes: d.notes, notebooks: d.notebooks || [], pages: d.pages || [], plan: d.plan, rules: d.rules, checklist: ex.ticks, deskAccount: ex.deskAccount ?? d.accounts[0]?.id ?? null, closes: ex.closes || s.closes };
  } else {
    const w = dataWorld(s.world);
    out = { ...scoped(s), logged: s.logged.filter((t) => inWorld(t, w)), accounts: s.accounts.filter((a) => inWorld(a, w)) };
  }
  viewCache = { src: s, out };
  return out;
}
export const exampleOn = () => exampleShows(state);
let exampleHooks = null;
export const setExampleHooks = (h) => { exampleHooks = h; };
export const exampleBlocked = () => toast("This is an example. Your own trades replace it.");
export function leaveExample() {
  if (!exampleOn()) return false;
  exampleHooks?.end({ now: true, reason: "action" });
  return true;
}
const isExampleItem = (x) => !!x && (x.example === true || String(x.id || "").startsWith("ex-"));

export function setState(patch) {
  let p = typeof patch === "function" ? patch(scoped(state)) : patch;
  if (dataWorld(state.world) === "crypto" && PER_WORLD.some((k) => k in p)) {
    p = { ...p };
    const crypto = { ...state.crypto, ...p.crypto };
    for (const k of PER_WORLD) if (k in p) { crypto[k] = p[k]; delete p[k]; }
    p.crypto = crypto;
  }
  if (LIVE && exampleShows(state)) {
    const touched = Object.keys(p).filter((k) => OVERLAY.includes(k));
    if (touched.length) {
      p = { ...p };
      const ex = { ...state.example };
      if ("checklist" in p) { ex.ticks = p.checklist; delete p.checklist; }
      if ("deskAccount" in p) { ex.deskAccount = p.deskAccount; delete p.deskAccount; }
      if ("closes" in p) { ex.closes = p.closes; delete p.closes; }
      const heavy = Object.keys(p).filter((k) => OVERLAY.includes(k));
      if (heavy.length) {
        const fromExample = heavy.some((k) => k === "plan" || k === "rules" || (Array.isArray(p[k]) && p[k].some(isExampleItem)));
        if (fromExample) { heavy.forEach((k) => delete p[k]); exampleBlocked(); }
        else { leaveExample(); return setState(p); }
      }
      p.example = ex;
    }
  }
  const prev = state;
  state = { ...state, ...p };
  persist();
  watchers.forEach((f) => f(prev, state));
  subs.forEach((f) => f());
}
export function loadState(patch) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
// The live sync layer listens for every change
export const watch = (f) => (watchers.add(f), () => watchers.delete(f));
const subscribe = (f) => (subs.add(f), () => subs.delete(f));
// Every change, loads included
export const onAnyChange = subscribe;
export const useStore = (select) => useSyncExternalStore(subscribe, () => select(viewOf(state)));
export const useOwnStore = (select) => useSyncExternalStore(subscribe, () => select(state));

export const newId = (prefix) => (LIVE ? crypto.randomUUID() : `${prefix}${Date.now()}`);

const COMMUNITY_FORMS = ["idea", "poll"];
const MARKETS_FORMS = ["trade", "import", "account", "cryptoAccount", "rules", "strategy"];
export const openDialog = (kind, props = {}) => {
  if (state.world !== "markets" && dataWorld(state.world) === "markets" && MARKETS_FORMS.includes(kind)) {
    return toast("Crypto is coming soon. Switch to Markets to log, import or edit trades.");
  }
  if (LIVE && exampleOn() && !COMMUNITY_FORMS.includes(kind)) {
    if ([props.trade, props.strategy, props.note, props.account].some(isExampleItem)) return exampleBlocked();
    leaveExample();
  }
  setState({ dialog: { kind, ...props } });
};
export const closeDialog = () => setState({ dialog: null });

let toastTimer = 0;
export function toast(text, opts = {}) {
  clearTimeout(toastTimer);
  const action = opts.action ? { label: opts.action.label, run: () => { clearTimeout(toastTimer); setState({ toast: null }); opts.action.run(); } } : null;
  setState({ toast: { text, id: Date.now(), action, warn: !!opts.warn } });
  toastTimer = setTimeout(() => setState({ toast: null }), opts.ms ?? (action ? 8000 : 2600));
}

/* ---------- The month on show (live) ---------- */

// Move the views to another month; "now" goes back to this one
export function showMonth(year, month) {
  CAL.year = year + Math.floor(month / 12);
  CAL.month = ((month % 12) + 12) % 12;
  CAL.all = false;
  setState({ month: monthKey(CAL.year, CAL.month) });
}
// Every month at once; showMonth goes back to one
export function showAll() {
  CAL.all = true;
  setState({ month: "all" });
}
const dayHooks = new Set();
export const onNewDay = (f) => (dayHooks.add(f), () => dayHooks.delete(f));
const utcDayHooks = new Set();
export const onNewUtcDay = (f) => (utcDayHooks.add(f), () => utcDayHooks.delete(f));
let lastDay = LIVE ? todayKey() : null;
let lastUtcDay = LIVE ? utcTodayKey() : null;
function tickClock() {
  const wasNow = CAL.year === NOW.year && CAL.month === NOW.month;
  refreshNow();
  const day = todayKey();
  if (day !== lastDay) {
    lastDay = day;
    if (wasNow && !CAL.all && (CAL.year !== NOW.year || CAL.month !== NOW.month)) { CAL.year = NOW.year; CAL.month = NOW.month; loadState({ month: monthKey(CAL.year, CAL.month) }); }
    dayHooks.forEach((f) => f(day));
  }
  const utcDay = utcTodayKey();
  if (utcDay !== lastUtcDay) { lastUtcDay = utcDay; utcDayHooks.forEach((f) => f(utcDay)); }
  loadState({ tick: Date.now() });
}
if (LIVE) setInterval(tickClock, 15000);

const clockOf = (world) => (world === "crypto" ? utcOf : nyOf);
export function datedTrade(t) {
  const at = new Date(t.traded_at);
  const of = clockOf(worldOf(t));
  const n = of(at), today = of();
  return {
    ...t,
    traded_at: at.toISOString(),
    month: monthKey(n.year, n.month),
    day: n.day, weekday: n.weekday, hour: n.hour,
    date: `${SHORT[n.month]} ${n.day}`,
    dayKey: `${n.year}-${pad(n.month + 1)}-${pad(n.day)}`,
    time: `${pad(n.hour)}:${pad(n.minute)}`,
    today: n.year === today.year && n.month === today.month && n.day === today.day,
  };
}
export function tradedAt(date, time, world = "markets") {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  return (world === "crypto" ? utcInstant : nyInstant)(y, mo - 1, d, h, m).toISOString();
}
export const dateOf = (trade, world = worldOf(trade)) => { const of = clockOf(world); const d = trade?.traded_at ? of(trade.traded_at) : of(); return `${d.year}-${pad(d.month + 1)}-${pad(d.day)}`; };

/* ---------- Switching world ---------- */

export function setWorld(world) {
  if (world === state.world || !worldsOn()) return;
  if (LIVE) rememberWorld(world);
  paintWorld(world);
  try { const u = new URL(location.href); if (u.searchParams.has("world")) { u.searchParams.delete("world"); history.replaceState(history.state, "", u); } } catch {}
  state = { ...state, world };
  subs.forEach((f) => f());
}

/* ---------- Derived data ---------- */

const demoWhen = (t) => {
  const day = t.day ?? parseInt(String(t.date || "").replace(/\D+/g, ""), 10);
  const [h, m] = String(t.time || "").split(":").map(Number);
  const k = day * 1440 + h * 60 + m;
  return Number.isFinite(k) ? k : Infinity;
};
function demoMerged(logged, sample) {
  if (!logged.length) return sample;
  const mine = [...logged].sort((a, b) => demoWhen(b) - demoWhen(a));
  const out = [];
  let i = 0;
  for (const t of sample) {
    while (i < mine.length && demoWhen(mine[i]) >= demoWhen(t)) out.push(mine[i++]);
    out.push(t);
  }
  return out.concat(mine.slice(i));
}

export function useTrades() {
  const logged = useStore((s) => s.logged);
  const edits = useStore((s) => s.edits);
  const month = useStore((s) => s.month);
  const world = useStore((s) => s.world);
  return useMemo(() => (LIVE
    ? (month === "all" ? logged : logged.filter((t) => t.month === month))
    : demoMerged(logged, demoIn(dataWorld(world)).map((t) => (edits[t.id] ? { ...t, ...edits[t.id] } : t)))), [logged, edits, month, world]);
}
export function useOwnTrades() {
  const logged = useOwnStore((s) => s.logged);
  const month = useOwnStore((s) => s.month);
  return useMemo(() => (LIVE && month !== "all" ? logged.filter((t) => t.month === month) : logged), [logged, month]);
}
// Every trade the trader has ever logged (live), or the demo's
export function useAllTrades() {
  const logged = useStore((s) => s.logged);
  const edits = useStore((s) => s.edits);
  const world = useStore((s) => s.world);
  return useMemo(() => (LIVE ? logged : demoMerged(logged, demoIn(dataWorld(world)).map((t) => (edits[t.id] ? { ...t, ...edits[t.id] } : t)))), [logged, edits, world]);
}

/* ---------- Copied trades (lib/copies.js) ---------- */

let copiesCache = { src: null, out: null };
const copiesIn = (all) => (copiesCache.src === all ? copiesCache.out : (copiesCache = { src: all, out: findCopies(all) }).out);
export function useCopies() {
  const all = useAllTrades();
  return useMemo(() => copiesIn(all), [all]);
}
export const setCopyView = (view) => {
  const v = { mode: view.mode === "each" ? "each" : "combined", account: view.mode === "each" ? view.account || null : null };
  try { localStorage.setItem(COPY_KEY, JSON.stringify(v)); } catch {}
  setState({ copyView: v });
};
export function setBackdrop(patch) {
  const b = backdropOf({ ...(state.backdrop || BACKDROP), ...patch, at: Date.now() });
  if (LIVE) rememberBackdrop(state.me?.id, b);
  setState({ backdrop: b });
}
export function useCounted(trades) {
  const copies = useCopies();
  const view = useStore((s) => s.copyView);
  return useMemo(() => counted(trades, copies, view), [trades, copies, view]);
}
export function useFolded(trades) {
  const copies = useCopies();
  return useMemo(() => fold(trades, copies), [trades, copies]);
}

export function useStrategies() {
  const added = useStore((s) => s.strategies);
  const trades = useCounted(useAllTrades());
  return useMemo(() => added.map((s) => ({ ...s, ...statsFor(s.setup, trades) })), [added, trades]);
}

function useNotes() {
  const added = useStore((s) => s.notes);
  return useMemo(() => [...added, ...(LIVE ? [] : SAMPLE.STUDY_NOTES || [])], [added]);
}

export const saveTrade = (trade) => {
  if (LIVE && isExampleItem(trade)) return exampleBlocked();
  const t = LIVE ? datedTrade(trade) : trade;
  setState((s) => (t.id.startsWith("T") && demoTrades().some((x) => x.id === t.id)
    ? { edits: { ...s.edits, [t.id]: t } }
    : { logged: (s.logged.some((x) => x.id === t.id) ? s.logged.map((x) => (x.id === t.id ? t : x)) : [t, ...s.logged]).sort((a, b) => (LIVE ? b.traded_at.localeCompare(a.traded_at) : 0)) }));
};
export const saveTrades = (list) => {
  const ts = list.filter((t) => !(LIVE && isExampleItem(t))).map((t) => (LIVE ? datedTrade(t) : t));
  if (!ts.length) return exampleBlocked();
  const byId = new Map(ts.map((t) => [t.id, t]));
  setState((s) => {
    const demo = ts.filter((t) => t.id.startsWith("T") && demoTrades().some((x) => x.id === t.id));
    const edits = demo.length ? { ...s.edits, ...Object.fromEntries(demo.map((t) => [t.id, t])) } : s.edits;
    const known = new Set(s.logged.map((x) => x.id));
    const fresh = ts.filter((t) => !known.has(t.id) && !demo.includes(t));
    const logged = [...fresh, ...s.logged.map((x) => byId.get(x.id) || x)].sort((a, b) => (LIVE ? b.traded_at.localeCompare(a.traded_at) : 0));
    return { logged, edits };
  });
};
export const deleteTrade = (id) => {
  if (LIVE && String(id).startsWith("ex-")) return exampleBlocked();
  setState((s) => ({ logged: s.logged.filter((t) => t.id !== id) }));
  unlinkTrades([id]);
};
export function unlinkTrades(ids) {
  const gone = new Set(ids);
  if (!state.pages.some((p) => p.tradeId && gone.has(p.tradeId))) return;
  const pages = state.pages.map((p) => (p.tradeId && gone.has(p.tradeId) ? { ...p, tradeId: null } : p));
  if (LIVE) loadState({ pages }); else setState({ pages });
}

/* ---------- Fees & payouts ---------- */

export function saveMoney(entry) {
  if (!Array.isArray(state.money)) return;
  setState((s) => ({ money: s.money.some((x) => x.id === entry.id) ? s.money.map((x) => (x.id === entry.id ? entry : x)) : [...s.money, entry] }));
}
export function deleteMoney(id) {
  if (!Array.isArray(state.money)) return;
  setState((s) => ({ money: s.money.filter((x) => x.id !== id) }));
}
export function dropAccountMoney(accountId) {
  if (!Array.isArray(state.money) || !state.money.some((x) => x.account === accountId)) return;
  const money = state.money.filter((x) => x.account !== accountId);
  if (LIVE) loadState({ money }); else setState({ money });
}
export const goTo = (view) => window.dispatchEvent(new CustomEvent("marble:go", { detail: view }));

/* ---------- The trader's own names for things ---------- */

export function useSetups() {
  const strategies = useStore((s) => s.strategies);
  const trades = useAllTrades();
  return useMemo(() => {
    const names = [...(LIVE ? [] : SAMPLE.SETUPS || []), ...strategies.map((s) => s.setup), ...[...trades].reverse().map((t) => t.setup)];
    return [...new Set(names.map((n) => (n || "").trim()).filter(Boolean))];
  }, [strategies, trades]);
}
export function useFolders() {
  const notes = useNotes();
  return useMemo(() => {
    const names = [...(LIVE ? [] : (SAMPLE.STUDY_FOLDERS || []).map((f) => f.name)), ...notes.map((n) => n.folder)];
    return [...new Set(names.map((n) => (n || "").trim()).filter(Boolean))];
  }, [notes]);
}
