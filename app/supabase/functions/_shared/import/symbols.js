export const POINT_VALUES = {
  NQ: 20, MNQ: 2, ES: 50, MES: 5, CL: 1000, MCL: 100, GC: 100, MGC: 10,
  YM: 5, MYM: 0.5, RTY: 50, M2K: 5, "6E": 125000,
  M6E: 12500, "6B": 62500, "6J": 12500000, "6A": 100000, "6C": 100000, "6S": 125000,
  SI: 5000, SIL: 1000, HG: 25000, PL: 50, NG: 10000, QM: 500,
};
const ALIASES = { ENQ: "NQ", EP: "ES", CLE: "CL", GCE: "GC", EU6: "6E" };
const MONTH = "FGHJKMNQUVXZ";
const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const known = (r) => r in POINT_VALUES || r in ALIASES;
const canon = (r) => ALIASES[r] || r;

export function rootOf(raw) {
  let s = String(raw ?? "").trim().toUpperCase();
  if (!s) return "";
  // CON.F.US.MNQ.Z26 (ProjectX), F.US.ENQ.Z26 (CQG)
  const dotted = /^(?:CON\.)?F\.[A-Z]{2}\.([A-Z0-9]+)(?:\.[A-Z]\d{1,4})?$/.exec(s);
  if (dotted) return canon(dotted[1]);
  s = s.replace(/^[/.@]+/, "").replace(/=F$/, ""); // /NQZ6 (thinkorswim), @NQ, NQ=F
  s = s.replace(/:[A-Z]+$/, "").replace(/^[A-Z]+:/, ""); // CME_MINI:NQZ2026, NQZ6:CME
  // "NQ 12-26", "NQ DEC26", "NQ 12/26", "MNQ 03-27"
  const spaced = /^([A-Z0-9]{1,5})[\s_-]+(\d{1,2}[-/]\d{2,4}|[A-Z]{3}[-\s]?\d{2,4})$/.exec(s);
  if (spaced && (MONTH_NAMES.some((m) => spaced[2].startsWith(m)) || /^\d/.test(spaced[2]))) return canon(spaced[1]);
  const first = s.split(/\s+/)[0];
  const coded = /^([A-Z0-9]{1,5}?)([FGHJKMNQUVXZ])(\d{1,2}|\d{4})$/.exec(first);
  if (coded) {
    for (let n = first.length - 2; n >= 1; n--) {
      const root = first.slice(0, n), rest = first.slice(n);
      if (known(root) && new RegExp(`^[${MONTH}](\\d{1,2}|\\d{4})$`).test(rest)) return canon(root);
    }
    if (coded[1].length >= 1 && /[A-Z]/.test(coded[1])) return canon(coded[1]);
  }
  return canon(first);
}

export function pointValueOf(root, extra = {}) {
  const r = String(root || "").toUpperCase();
  if (extra[r] != null && Number.isFinite(+extra[r])) return +extra[r];
  return POINT_VALUES[r] ?? null;
}

export const isFuture = (raw) => known(rootOf(raw));

export const cryptoSymbol = (raw) => String(raw ?? "").trim().toUpperCase().slice(0, 16);

export function cryptoPointValue(symbol, extra = {}) {
  const v = extra[String(symbol || "").toUpperCase()];
  return v != null && Number.isFinite(+v) && +v > 0 ? +v : null;
}
