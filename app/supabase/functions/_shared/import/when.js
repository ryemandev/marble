export const ZONES = [
  ["local", "This computer's time"],
  ["America/New_York", "New York (ET)"],
  ["America/Chicago", "Chicago (CT)"],
  ["America/Los_Angeles", "Pacific (PT)"],
  ["UTC", "UTC"],
  ["Europe/London", "London"],
  ["Europe/Berlin", "Central Europe"],
  ["Australia/Sydney", "Sydney"],
  ["Asia/Singapore", "Singapore"],
  ["Europe/Helsinki", "Server time: UTC+2, +3 in summer"],
  ["Etc/GMT-2", "Server time: UTC+2 all year"],
  ["Etc/GMT-3", "Server time: UTC+3 all year"],
];
const ABBR = {
  ET: "America/New_York", EST: "America/New_York", EDT: "America/New_York", CT: "America/Chicago", CST: "America/Chicago", CDT: "America/Chicago",
  PT: "America/Los_Angeles", PST: "America/Los_Angeles", PDT: "America/Los_Angeles", UTC: "UTC", GMT: "UTC", Z: "UTC",
  BST: "Europe/London", CET: "Europe/Berlin", CEST: "Europe/Berlin", EET: "Europe/Helsinki", EEST: "Europe/Helsinki",
};
export function zoneOfHeader(header) {
  const h = String(header ?? "").trim();
  const m = /\(([A-Z]{1,4})\)\s*$/.exec(h);
  if (m) return ABBR[m[1]] || null;
  const o = /\(\s*(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\s*\)\s*$/i.exec(h);
  if (!o || (o[3] && +o[3] !== 0)) return null;
  const hours = +o[2];
  if (hours === 0) return "UTC";
  if (hours > 14 || (o[1] === "-" && hours > 12)) return null;
  return `Etc/GMT${o[1] === "+" ? "-" : "+"}${hours}`;
}

const fmts = new Map();
function offsetMs(ts, tz) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmts.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - Math.floor(ts / 1000) * 1000;
}

export function zonedInstant(y, mo, d, h = 0, mi = 0, s = 0, ms = 0, tz = "local") {
  if (tz === "local") return new Date(y, mo, d, h, mi, s, ms);
  const guess = Date.UTC(y, mo, d, h, mi, s, ms);
  let t = guess - offsetMs(guess, tz);
  const again = guess - offsetMs(t, tz);
  if (again !== t) t = again; // across a clock change
  return new Date(t);
}

export function guessDateOrder(values) {
  let dmy = false, mdy = false, seen = 0;
  for (const v of values) {
    const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(String(v ?? ""));
    if (!m) continue;
    seen++;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  return { order: dmy && !mdy ? "DMY" : "MDY", ambiguous: seen > 0 && !dmy && !mdy, conflicting: dmy && mdy };
}

const year4 = (y) => (y < 100 ? 2000 + y : y);

export function parseWhen(v, { tz = "local", order = "MDY" } = {}) {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(+v)) return null;
    return zonedInstant(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds(), v.getUTCMilliseconds(), tz);
  }
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v).trim())) {
    const n = +v;
    if (n > 1e12) return new Date(n); // epoch milliseconds
    if (n > 1e9 && n < 1e11) return new Date(n * 1000); // epoch seconds
    if (n > 20000 && n < 80000) { // Excel's day count from 30 Dec 1899
      const ms = Math.round((n - 25569) * 864e5);
      const d = new Date(ms);
      return zonedInstant(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), 0, tz);
    }
    // 20261027 or 20261027093105
    const s = String(v).trim();
    if (/^\d{8}(\d{6})?$/.test(s)) return zonedInstant(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +(s.slice(8, 10) || 0), +(s.slice(10, 12) || 0), +(s.slice(12, 14) || 0), 0, tz);
    return null;
  }
  let s = String(v).trim().replace(/\s+/g, " ");
  // 20261027;093105 (IBKR Flex)
  const packed = /^(\d{4})(\d{2})(\d{2})[;, T-]?(\d{2}):?(\d{2}):?(\d{2})$/.exec(s);
  if (packed) return zonedInstant(+packed[1], +packed[2] - 1, +packed[3], +packed[4], +packed[5], +packed[6], 0, tz);
  // A zone written after the time
  const abbr = /\s([A-Z]{1,4})$/.exec(s);
  if (abbr && ABBR[abbr[1]]) { tz = ABBR[abbr[1]]; s = s.slice(0, abbr.index); }
  // ISO with its own offset: trust it
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const iso = s.replace(" ", "T").replace(/\s(?=[+-]|Z)/i, "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    const d = new Date(iso);
    return Number.isNaN(+d) ? null : d;
  }
  let offset = null;
  const off = /\s?([+-])(\d{2}):?(\d{2})$/.exec(s);
  if (off && /\d:\d{2}/.test(s.slice(0, off.index))) { offset = (off[1] === "-" ? -1 : 1) * (+off[2] * 60 + +off[3]); s = s.slice(0, off.index).trim(); }

  let y, mo, d, rest;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](.*))?$/.exec(s);
  if (m) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; rest = m[4]; }
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[T ,]+(.*))?$/.exec(s))) {
    const [a, b] = [+m[1], +m[2]];
    [mo, d] = order === "DMY" ? [b - 1, a] : [a - 1, b];
    y = year4(+m[3]); rest = m[4];
  } else if ((m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{2,4})(?:[T ,]+(.*))?$/.exec(s))) { // 27 Oct 2026, 27-Oct-26
    mo = MONTHS.indexOf(m[2].toLowerCase()); d = +m[1]; y = year4(+m[3]); rest = m[4];
  } else if ((m = /^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})(?:[T ,]+(.*))?$/.exec(s))) { // Oct 27, 2026
    mo = MONTHS.indexOf(m[1].toLowerCase()); d = +m[2]; y = +m[3]; rest = m[4];
  } else return null;
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;

  let h = 0, mi = 0, sec = 0, ms = 0;
  if (rest) {
    const t = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?\s*([AaPp][Mm])?$/.exec(rest.trim());
    if (!t) return null;
    h = +t[1]; mi = +t[2]; sec = +(t[3] || 0); ms = t[4] ? Math.round(+`0.${t[4]}` * 1000) : 0;
    if (t[5]) { const pm = /p/i.test(t[5]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    if (h > 23 || mi > 59 || sec > 60) return null;
  }
  if (offset != null) return new Date(Date.UTC(y, mo, d, h, mi, sec, ms) - offset * 6e4);
  return zonedInstant(y, mo, d, h, mi, sec, ms, tz);
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// The trader's own zone, for the default
export const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "local"; } catch { return "local"; } };
