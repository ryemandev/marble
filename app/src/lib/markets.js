import { rootOf } from "../live/import/symbols.js";

// The mark a share card shows for a market: the index owner's logo for index futures and CFDs, CME
// Group's for commodities and the Russell, both currencies' flags for FX, or just the code. Flags are
// public domain (art/CREDITS.md). The logos are behind TICKER_LOGOS in mode.js, because Nasdaq, S&P Dow
// Jones, CME Group, FTSE Russell and Deutsche Börse each ask for written permission to show theirs.
const LOGO_OF = {
  NQ: "nasdaq", MNQ: "nasdaq", ES: "sp500", MES: "sp500", YM: "dowjones", MYM: "dowjones",
  RTY: "cme", M2K: "cme", CL: "cme", MCL: "cme", QM: "cme", NG: "cme", GC: "cme", MGC: "cme", SI: "cme", SIL: "cme", HG: "cme", PL: "cme",
  NAS100: "nasdaq", US100: "nasdaq", USTEC: "nasdaq", NDX: "nasdaq", NDX100: "nasdaq",
  US500: "sp500", SPX500: "sp500", SPX: "sp500", SP500: "sp500",
  US30: "dowjones", DJ30: "dowjones", DJI: "dowjones", WS30: "dowjones",
  GER40: "dax", DE40: "dax", GER30: "dax", DAX: "dax", UK100: "ftse100", FTSE: "ftse100", FTSE100: "ftse100",
};
const FX_FUTURES = { "6E": "EUR", M6E: "EUR", "6B": "GBP", "6J": "JPY", "6A": "AUD", "6C": "CAD", "6S": "CHF" };
const CURRENCY = { EUR: "Euro", USD: "US dollar", GBP: "Pound", JPY: "Yen", AUD: "Australian dollar", CAD: "Canadian dollar", CHF: "Swiss franc", NZD: "New Zealand dollar" };

const file = (f) => `${import.meta.env?.BASE_URL ?? "/"}logos/markets/${f}.svg`;

// { logo: key } for the card to print, { flags: [{ src, name }, …] }, or null
export function marketMark(symbol) {
  const raw = String(symbol ?? "").trim().toUpperCase();
  if (!raw) return null;
  const root = rootOf(raw), bare = raw.split(/[\s./_:-]/)[0];
  const logo = LOGO_OF[root] || LOGO_OF[bare] || LOGO_OF[bare.replace(/(CASH|M)$/, "")];
  if (logo) return { logo };
  const fx = FX_FUTURES[root];
  if (fx) return { flags: [fx, "USD"].map(flag) };
  const letters = raw.replace(/[^A-Z]/g, "");
  const a = letters.slice(0, 3), b = letters.slice(3, 6);
  if (letters.length >= 6 && CURRENCY[a] && CURRENCY[b]) return { flags: [a, b].map(flag) };
  return null;
}
const flag = (c) => ({ src: file(`flag-${c.toLowerCase()}`), name: CURRENCY[c] });

// The contract a trade names, the way a card prints it ("MNQ", "EUR/USD", "AAPL")
export function marketCode(symbol) {
  const raw = String(symbol ?? "").trim().toUpperCase();
  const m = marketMark(raw);
  if (m?.flags && !FX_FUTURES[rootOf(raw)]) { const l = raw.replace(/[^A-Z]/g, ""); return `${l.slice(0, 3)}/${l.slice(3, 6)}`; }
  return rootOf(raw) || raw;
}
