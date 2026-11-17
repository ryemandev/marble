import { pad } from "../lib/basics.js";

const NY = "America/New_York";
const parts = new Intl.DateTimeFormat("en-US", { timeZone: NY, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" });
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// The New York calendar date and clock time of an instant
export function nyOf(instant = new Date()) {
  const p = Object.fromEntries(parts.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month - 1, day: +p.day, hour: +p.hour, minute: +p.minute, weekday: DOW[p.weekday] };
}

export function nyInstant(year, month, day, hour, minute) {
  let guess = Date.UTC(year, month, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const n = nyOf(guess);
    const seen = Date.UTC(n.year, n.month, n.day, n.hour, n.minute);
    guess += Date.UTC(year, month, day, hour, minute) - seen;
  }
  return new Date(guess);
}

export { pad };
export const monthKey = (year, month) => `${year}-${pad(month + 1)}`;
