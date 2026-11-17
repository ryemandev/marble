import { pad } from "./lib/basics.js";

const WORLDS = ["markets", "crypto", "all"];
export const WORLD_NAME = { markets: "Markets", crypto: "Crypto", all: "All markets" };
export const SEAL = { markets: "市", crypto: "暗", all: "全" };

const KEY = "marble-world";
const isWorld = (w) => WORLDS.includes(w);

export function readWorld(remembered = true) {
  try {
    const q = new URLSearchParams(location.search).get("world");
    if (isWorld(q)) return q;
  } catch {}
  if (!remembered) return "markets";
  try {
    const saved = localStorage.getItem(KEY);
    if (isWorld(saved)) return saved;
  } catch {}
  return "markets";
}
export function rememberWorld(w) {
  try { localStorage.setItem(KEY, w); } catch {}
}
export function paintWorld(w) {
  if (typeof document !== "undefined") document.documentElement.dataset.world = w;
}

export const worldOf = (x) => (x?.world === "crypto" ? "crypto" : "markets");
// Whether it shows in a world: All markets shows both
export const inWorld = (x, w) => w === "all" || worldOf(x) === w;

/* ---------- UTC days, for crypto ---------- */

export function utcOf(instant = new Date()) {
  const d = new Date(instant);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay() };
}
export const utcTodayKey = () => { const n = utcOf(); return `${n.year}-${pad(n.month + 1)}-${pad(n.day)}`; };
// The instant for a UTC date and clock time
export const utcInstant = (year, month, day, hour, minute) => new Date(Date.UTC(year, month, day, hour, minute));

/* ---------- The crypto clock ---------- */

export const SESSIONS = [["Asia", 0, 7], ["London", 7, 13], ["New York", 13, 21], ["Late", 21, 24]];
export const sessionOf = (hour) => SESSIONS.find(([, s, e]) => hour >= s && hour < e)?.[0] || "Late";
export const isWeekendDay = (weekday) => weekday === 0 || weekday === 6;
export function nextFunding(now = new Date()) {
  const n = utcOf(now);
  const mins = n.hour * 60 + n.minute;
  const next = [8 * 60, 16 * 60, 24 * 60].find((m) => m > mins);
  const left = next - mins;
  return { at: `${pad((next / 60) % 24)}:00`, left, label: `${Math.floor(left / 60)}h ${pad(left % 60)}m` };
}
