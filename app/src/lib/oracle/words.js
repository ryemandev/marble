import { fmtMoney, plural } from "../../data.js";
import { pad } from "../../live/time.js";
import { DOW as WEEKDAYS_SHORT, MON as MONTHS_SHORT, MONTHS, WEEKDAYS } from "../basics.js";

export { fmtMoney, plural };
export const money = (n) => fmtMoney(n);
export const signed = (n) => fmtMoney(n, { sign: true });
export const pct = (x) => `${Math.round(x)}%`;
export const trades = (n) => plural(n, "trade");

export const madeOrCost = (n) => (Math.round(n * 100) === 0 ? "broke even" : n > 0 ? `made ${money(n)}` : `cost ${money(-n)}`);
// The amount inside madeOrCost, for highlighting
export const amountOf = (n) => (Math.round(n * 100) === 0 ? "broke even" : money(Math.abs(n)));

export { MONTHS, WEEKDAYS_SHORT, WEEKDAYS };

export const hhmm = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
export const hourSpan = (h) => `${pad(h)}:00\u2060–\u2060${pad((h + 1) % 24)}:00`;

// "Tue 14 Oct" (with the year when it isn't this one)
export function dayLabel(key, thisYear) {
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS_SHORT[wd]} ${d} ${MONTHS_SHORT[m - 1]}${thisYear && y !== thisYear ? ` ${y}` : ""}`;
}
export function monthLabel(key, thisYear, short = false) {
  const [y, m] = key.split("-").map(Number);
  return `${(short ? MONTHS_SHORT : MONTHS)[m - 1]}${thisYear && y !== thisYear ? ` ${y}` : ""}`;
}

// 1st, 2nd, 3rd, 4th, 11th, 12th, 21st
export const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${s}`;
};

export function duration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return plural(s, "second");
  const m = Math.round(s / 60);
  if (m < 60) return plural(m, "minute");
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${plural(h, "hour")} ${plural(rest, "minute")}` : plural(h, "hour");
}

// "a, b and c"
export const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
