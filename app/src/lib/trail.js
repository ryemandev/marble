// How a figure was made. Every dollar in the Journal can be walked back to the trades under it, and each
// trade says where its number came from and whether its fees are in it.
const num = (v) => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);

export const SOURCES = { sync: "From your broker", import: "From a file", manual: "Typed in" };
export const sourceOf = (t) => (t.source === "sync" ? "sync" : t.source === "import" ? "import" : "manual");

// A copied trade counts each account's copy on its own, so nothing here is hidden by the folding
export const flat = (trades) => trades.flatMap((t) => t.copies?.members || [t]);

// in: the fees are known and already taken off the P&L. missing: it came from a broker or a file that
// sent none, so the P&L can read high. typed: a trade typed in by hand, which counts only what was typed.
export function feeOf(t) {
  const paid = num(t.commission);
  if (paid > 0) return { status: "in", paid };
  return { status: sourceOf(t) === "manual" ? "typed" : "missing", paid: 0 };
}

export const FEE_WORDS = { in: "Fees included", missing: "No fees reported", typed: "No fees entered" };
export const FEE_NOTES = {
  in: "Already taken off this figure.",
  missing: "None came through, so if any were charged the figure reads high.",
  typed: "Typed in by hand, so this counts only what you typed.",
};

export function grossOf(t) {
  return (num(t.pnl) ?? 0) + (num(t.commission) ?? 0) - (num(t.funding) ?? 0);
}

export function builtFrom(trades) {
  const list = flat(trades);
  const bucket = () => ({ n: 0, net: 0 });
  const out = { rows: trades.length, rowsSync: 0, rowsFeesIn: 0, count: list.length, net: 0, gross: 0, fees: 0, funding: 0, sync: bucket(), import: bucket(), manual: bucket(), feesIn: 0, feesMissing: 0, feesTyped: 0, missing: [] };
  for (const t of list) {
    const pnl = num(t.pnl) ?? 0;
    const fee = feeOf(t);
    out.net += pnl;
    out.gross += grossOf(t);
    out.fees += fee.paid;
    out.funding += num(t.funding) ?? 0;
    const from = out[sourceOf(t)];
    from.n += 1;
    from.net += pnl;
    if (fee.status === "in") out.feesIn += 1;
    else if (fee.status === "missing") { out.feesMissing += 1; out.missing.push(t); }
    else out.feesTyped += 1;
  }
  for (const t of trades) {
    const each = flat([t]);
    if (each.every((x) => sourceOf(x) === "sync")) out.rowsSync += 1;
    if (each.every((x) => feeOf(x).status === "in")) out.rowsFeesIn += 1;
  }
  return out;
}

// The one line under a figure
export function trustLine(b) {
  if (!b.count) return "";
  if (!b.sync.n) {
    if (b.import.n === b.count) return `All ${b.rows} from a file`;
    if (b.manual.n === b.count) return b.rows === 1 ? "Typed in" : `All ${b.rows} typed in`;
    return `${b.import.n} from a file, ${b.manual.n} typed in`;
  }
  const from = b.rowsSync === b.rows ? (b.rows === 1 ? "From your broker" : `All ${b.rows} from your broker`) : `${b.rowsSync} of ${b.rows} from your broker`;
  if (b.rows === 1) return `${from}, ${FEE_WORDS[b.rowsFeesIn ? "in" : b.feesMissing ? "missing" : "typed"].toLowerCase()}`;
  if (!b.rowsFeesIn) return `${from}, no fees reported`;
  return b.rowsFeesIn === b.rows ? `${from}, fees on all` : `${from}, fees on ${b.rowsFeesIn}`;
}

// The one word for where money came from, on cards, a trade's detail and attached trades. All of it from a file says
// so; any of it typed makes the whole figure typed. Nothing is said about money from anywhere else.
export function sourceWord(trades) {
  const b = builtFrom(trades);
  if (b.manual.n) return "Typed";
  return b.count && b.import.n === b.count ? "From a file" : null;
}

// A trade's own working: the points, what each was worth, and the fees that came off. Only shown when
// the sum really does come to the figure.
export function workingOf(t, { entry, exit, size, pointValue } = {}) {
  const gross = grossOf(t);
  if (entry == null || exit == null || !size || !pointValue) return null;
  const dir = t.side === "short" ? -1 : 1;
  const points = (exit - entry) * dir;
  const worked = points * size * pointValue;
  return Math.abs(worked - gross) <= Math.max(1, Math.abs(gross) * 0.01) ? { points, size, pointValue, gross: worked } : null;
}
