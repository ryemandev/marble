import { FIRMS } from "../../live/firms";

// What a post is tied to, read from the words of the post, so it works on every post that already
// exists. Capitals only, so "es" in a sentence and a trader called sol aren't taken for markets.
const MARKETS = "MNQ NQ MES ES MYM YM M2K RTY MCL CL MGC GC SI NG ZB ZN 6E 6B EURUSD GBPUSD USDJPY AUDUSD XAUUSD BTC ETH SOL SPX SPY QQQ NAS100 US30 DAX".split(" ");
const MARKET = new RegExp(`(?<![A-Za-z0-9])(${MARKETS.join("|")})(?![A-Za-z0-9])`, "g");
const LOOSE = ["Apex", "Topstep", "TopstepX"]; // the short names traders actually write
const FIRM_NAMES = [...new Set([...LOOSE, ...FIRMS.map((f) => f.name)])].sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FIRM = new RegExp(`(?<![A-Za-z0-9])(${FIRM_NAMES.map(escape).join("|")})(?![A-Za-z0-9])`, "gi");
const proper = new Map(FIRM_NAMES.map((n) => [n.toLowerCase(), n]));

export function tiesOf(text, trade) {
  const body = String(text || "");
  const markets = [...new Set(body.match(MARKET) || [])].filter((m) => m !== trade?.sym);
  const firms = [...new Set((body.match(FIRM) || []).map((f) => proper.get(f.toLowerCase()) || f))];
  return [...markets, ...firms].slice(0, 4);
}
