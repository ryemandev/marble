import { build as readFile, effectOf, sideWords, zoneHint as zoneOfPreset } from "./engine.js";
import { norm } from "./presets.js";
import { pairFills } from "./pair.js";
import { ZONES as ZONE_LIST, guessDateOrder, parseWhen as readZoned, zonedInstant } from "./when.js";

// File imports read through here. The engine underneath is one copy, shared with the sync functions, and it pairs fills from
// flat. A file can start or end in the middle of a position, so this settles which fills can be trusted first. A fill never
// pairs across the edge of a file without evidence, and whatever is left out is listed for the preview.

// A position from the last import this long before the file's first fill: the two files don't join up, and anything could
// have closed it in between
export const STALE_DAYS = 14;
const SEED = "before-file:";

/* ---------- The broker's clock ---------- */

// New York time plus seven hours: UTC+2, or +3 while New York is on summer time. Many MetaTrader brokers keep this clock,
// and it changes on New York's dates. Europe/Helsinki has the same offsets but changes on Europe's dates, an hour out for
// about three weeks in March and one in the autumn.
export const NY_CLOSE = "NY+7";

export const ZONES = ZONE_LIST.flatMap(([zone, label]) => (zone === "Europe/Helsinki"
  ? [[NY_CLOSE, "Server time: UTC+2, +3 in summer, US clock change"], [zone, "Server time: UTC+2, +3 in summer, Europe clock change"]]
  : [[zone, label]]));

export function parseWhen(v, opts = {}) {
  if (opts.tz !== NY_CLOSE) return readZoned(v, opts);
  const wall = readZoned(v, { ...opts, tz: "UTC" });
  if (!wall) return null;
  // A time that names its own zone or offset reads the same under any clock, and stands as written
  if (+readZoned(v, { ...opts, tz: "Etc/GMT-2" }) === +wall) return wall;
  return zonedInstant(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), wall.getUTCHours() - 7, wall.getUTCMinutes(), wall.getUTCSeconds(), wall.getUTCMilliseconds(), "America/New_York");
}

// MetaTrader times are in the broker's clock, not the trader's, and the computer's own zone is the one reading that's
// sure to be wrong
export function zoneHint(preset, headers) {
  const hint = zoneOfPreset(preset, headers);
  return hint.ask ? { ...hint, zone: NY_CLOSE, from: "server" } : hint;
}

// Which column a mapping's spec points at, by the engine's rules
function columnOf(headers, spec) {
  if (spec == null || spec === "") return null;
  if (typeof spec === "string") { const i = headers.findIndex((h) => norm(h) === norm(spec)); return i < 0 ? null : i; }
  if (Array.isArray(spec)) { for (const s of spec) { const i = columnOf(headers, s); if (i != null) return i; } return null; }
  if (spec.match) { const re = new RegExp(spec.match, "i"); const i = headers.findIndex((h) => re.test(String(h).trim())); return i < 0 ? null : i; }
  if (spec.nth) { const all = headers.map((h, i) => (norm(h) === norm(spec.nth[0]) ? i : -1)).filter((i) => i >= 0); return all[spec.nth[1] - 1] ?? null; }
  return null;
}

function timeColumns({ headers }, { shape, fields: f = {} }) {
  const specs = shape === "roundtrip" ? [f.entryTime, f.exitTime] : shape === "pairs" ? [f.buyTime, f.sellTime] : [f.time];
  return specs.map((s) => (s?.join || [s]).map((x) => columnOf(headers, x)).filter((i) => i != null)).filter((c) => c.length);
}

// The engine knows real zones only, so a New York close clock goes in as exact times
function exactTimes(table, mapping, opts) {
  const cols = timeColumns(table, mapping);
  const dates = guessDateOrder(table.records.slice(0, 400).flatMap((row) => cols.map((c) => row[c[0]])).filter((v) => typeof v === "string"));
  const read = { tz: NY_CLOSE, order: opts.order || dates.order };
  const records = table.records.map((row) => {
    const next = [...row];
    for (const c of cols) {
      const cells = c.map((i) => row[i]).filter((v) => v !== "" && v != null);
      const at = (cells.length > 1 ? parseWhen(cells.join(" "), read) : null) || parseWhen(cells.at(-1), read);
      if (!at) continue;
      c.forEach((i) => { next[i] = ""; });
      next[c.at(-1)] = at.toISOString();
    }
    return next;
  });
  return { table: { ...table, records }, dates };
}

/* ---------- The edges of a file ---------- */

// Whether the file itself marks fills as opening or closing. If it does, an exit with nothing to close has already been set
// aside and the pairing can stand.
function saysOpenOrClose({ headers, records }, { fields: f = {} }) {
  const effect = columnOf(headers, f.effect), side = columnOf(headers, f.side);
  return records.some((row) => (effect != null && effectOf(row[effect]) != null) || (side != null && sideWords(row[side]).effect != null));
}

const asFills = (list) => list.map((c) => ({ ...c, account: null, time: new Date(c.time) }));
const plainKey = (k) => k.replace(/~2$/, "");
const fillsOf = (r) => [...r.trades.flatMap((t) => t.fills || []), ...r.open.flatMap((o) => o.fills), ...r.orphans];

// What to do with each position carried from the last import: use it to pair, hold it for the next file, or leave it out
function sortCarried(own, carried) {
  const inFile = new Set(fillsOf(own).map((f) => plainKey(f.key)));
  const start = Math.min(...fillsOf(own).map((f) => +new Date(f.time)));
  const books = new Map();
  for (const c of carried) books.set(c.contract, [...(books.get(c.contract) || []), c]);
  const use = [], hold = [], stale = [];
  for (const [contract, fills] of books) {
    if (fills.some((c) => inFile.has(plainKey(c.key)))) continue; // the file has these fills itself
    const last = Math.max(...fills.map((c) => +new Date(c.time)));
    if (Number.isFinite(start) && start - last > STALE_DAYS * 864e5) stale.push(...fills);
    else if (own.open.some((o) => o.contract === contract)) use.push(...fills);
    else hold.push(...fills); // this file balances without it, so pairing it would break a clean file
  }
  return { use, hold, stale };
}

// How long a reading has the trader in a position. A trader is flat between trades, so the wrong reading holds far longer.
function timeIn(r, contract) {
  const closed = r.trades.filter((t) => t.contract === contract).reduce((a, t) => a + t.holdMs, 0);
  const o = r.open.find((x) => x.contract === contract);
  return closed + (o ? Math.max(...o.fills.map((f) => Date.parse(f.time))) - +o.opened : 0);
}

// A stand-in for the position the file starts in. The fills that close it pair against this, and that trade is dropped.
function seedFor(o, own) {
  const first = Math.min(+o.opened, ...own.trades.filter((t) => t.contract === o.contract).map((t) => +t.opened));
  return { key: `${SEED}${o.contract}`, time: new Date(first - 1).toISOString(), contract: o.contract, side: o.side === "long" ? "sell" : "buy", qty: o.qty, price: o.fills[0].price, commission: 0 };
}

export function build(table, mapping, opts = {}) {
  const exact = opts.tz === NY_CLOSE ? exactTimes(table, mapping, opts) : null;
  const source = exact?.table || table;
  const read = (carried) => ({ ...readFile(source, mapping, { ...opts, ...(exact ? { tz: "UTC" } : {}), carried }), ...(exact ? { dates: exact.dates } : {}) });
  const own = read([]);
  if (mapping.shape === "roundtrip" || mapping.shape === "funding" || own.missing.length) return { ...own, unbalanced: [], stale: [] };

  const { use, hold, stale } = sortCarried(own, opts.carried || []);
  const joined = new Set(use.map((c) => c.contract));
  // A contract that doesn't end flat has two readings: open at the end, or already open at the start. They share no trades,
  // so one stale fill can turn every trade in the file the wrong way round.
  const open = saysOpenOrClose(source, mapping) ? [] : own.open.filter((o) => !joined.has(o.contract));
  const seeds = new Map(open.map((o) => [o.contract, seedFor(o, own)]));
  const seeded = open.length ? read([...use, ...seeds.values()]) : null;
  const isSeed = (t) => (t.fills || []).some((f) => f.key.startsWith(SEED));
  const made = (r, contract) => r.trades.some((t) => t.contract === contract && !isSeed(t));
  const crossing = open.filter((o) => made(own, o.contract) || made(seeded, o.contract));
  // Trades either way: go by how long each reading holds. Trades one way only: stay open and ask, because a trade missing
  // with a note beats a trade invented.
  const reading = ({ contract }) => opts.edges?.[contract] || (made(own, contract) && timeIn(seeded, contract) < timeIn(own, contract) ? "start" : "end");
  const atStart = crossing.filter((o) => reading(o) === "start");
  const carried = [...use, ...atStart.map((o) => seeds.get(o.contract))];
  const out = !carried.length ? own : seeded && atStart.length === open.length ? seeded : read(carried);

  const trades = out.trades.filter((t) => !isSeed(t));
  const unbalanced = crossing.map((o) => {
    const before = out.trades.find((t) => t.contract === o.contract && isSeed(t));
    return { contract: o.contract, symbol: o.symbol, reading: before ? "start" : "end", fills: before ? before.fills.filter((f) => !f.key.startsWith(SEED)) : o.fills };
  });
  const pairing = { points: opts.points || {}, crypto: mapping.world === "crypto" };
  return {
    ...out, trades, unknown: [...new Set(trades.filter((t) => t.gross == null).map((t) => t.symbol))],
    open: [...out.open, ...(hold.length ? pairFills(asFills(hold), pairing).open : [])],
    unbalanced, stale: stale.length ? pairFills(asFills(stale), pairing).open : [],
  };
}

/* ---------- The same file under another time zone ---------- */

// The trade already in this account that this one matches in every way but the clock: both times are off by whole quarter
// hours, as a second time zone would make them. Soft on purpose, as the trader can still bring it in.
export function zoneTwin(t, journal) {
  const shift = (a, b) => { const d = a - b; return d % 9e5 === 0 && Math.abs(d) <= 26 * 36e5 ? d : null; };
  const near = (a, b) => Math.abs(+a - +b) < 1e-6;
  return journal.find((x) => {
    if (x.symbol !== t.symbol.slice(0, 16) || x.side !== t.side || !near(x.size, t.size) || !near(x.entry, t.entry) || !near(x.exit, t.exit)) return false;
    const a = shift(+t.opened, Date.parse(x.traded_at)), b = shift(+t.closed, Date.parse(x.closedAt || x.traded_at));
    return !!a && b != null && Math.abs(a - b) <= 36e5; // a clock change can fall inside the trade
  }) || null;
}
