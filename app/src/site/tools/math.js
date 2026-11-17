export const INSTRUMENTS = [
  { id: "ES", name: "E-mini S&P 500", tick: 0.25, value: 12.5 },
  { id: "MES", name: "Micro E-mini S&P 500", tick: 0.25, value: 1.25, micro: true },
  { id: "NQ", name: "E-mini Nasdaq-100", tick: 0.25, value: 5 },
  { id: "MNQ", name: "Micro E-mini Nasdaq-100", tick: 0.25, value: 0.5, micro: true },
  { id: "YM", name: "E-mini Dow", tick: 1, value: 5 },
  { id: "MYM", name: "Micro E-mini Dow", tick: 1, value: 0.5, micro: true },
  { id: "RTY", name: "E-mini Russell 2000", tick: 0.1, value: 5 },
  { id: "M2K", name: "Micro E-mini Russell 2000", tick: 0.1, value: 0.5, micro: true },
  { id: "CL", name: "Crude oil", tick: 0.01, value: 10 },
  { id: "MCL", name: "Micro crude oil", tick: 0.01, value: 1, micro: true },
  { id: "GC", name: "Gold", tick: 0.1, value: 10 },
  { id: "MGC", name: "Micro gold", tick: 0.1, value: 1, micro: true },
  { id: "EURUSD", name: "EUR/USD", tick: 0.0001, value: 10, fx: true },
  { id: "GBPUSD", name: "GBP/USD", tick: 0.0001, value: 10, fx: true },
  { id: "XAUUSD", name: "Gold (XAU/USD)", tick: 0.01, value: 1, fx: true, note: "per 1 lot of 100 oz, $1 a cent" },
];
export const instrumentOf = (id) => INSTRUMENTS.find((x) => x.id === id) || INSTRUMENTS[0];

// A typed number, or NaN for a blank field (+"" would be 0)
const finite = (x) => (x === "" || x == null || !Number.isFinite(+x) ? NaN : +x);

export function lossesToFloor(left, risk) {
  left = finite(left); risk = finite(risk);
  if (!(risk > 0) || !(left > 0)) return left <= 0 && risk > 0 ? 0 : null;
  return Math.ceil(left / risk - 1e-9);
}

export const lossesToDaily = (limit, risk) => lossesToFloor(limit, risk);

export function floorOf({ start, drawdown, peak, type = "static", lockAt = null }) {
  start = finite(start); drawdown = finite(drawdown);
  if (!(start > 0) || !(drawdown > 0)) return null;
  if (type === "static") return start - drawdown;
  const high = Math.max(start, finite(peak) || start);
  const trail = high - drawdown;
  return lockAt != null && Number.isFinite(+lockAt) ? Math.min(trail, +lockAt) : trail;
}

export function ladder(balance, floor, risk, max = 40) {
  const out = [];
  const n = lossesToFloor(balance - floor, risk);
  if (n == null) return out;
  for (let i = 1; i <= Math.min(n, max); i++) out.push(Math.max(floor, balance - i * risk));
  return out;
}

export function positionSize({ risk, stop, instrument, unit = "ticks" }) {
  const ins = typeof instrument === "string" ? instrumentOf(instrument) : instrument;
  risk = finite(risk); stop = finite(stop);
  if (!ins || !(risk > 0) || !(stop > 0)) return null;
  const ticks = unit === "points" ? stop / ins.tick : stop;
  if (!ins.fx && ticks < 1 - 1e-9) return null;
  const perOne = ticks * ins.value;
  if (!(perOne > 0)) return null;
  if (ins.fx) {
    // Lots in steps of 0.01
    const lots = Math.floor((risk / perOne) * 100 + 1e-9) / 100;
    return { size: lots, unit: "lots", perOne, atStop: lots * perOne, ticks };
  }
  const size = Math.floor(risk / perOne + 1e-9);
  return { size, unit: size === 1 ? "contract" : "contracts", perOne, atStop: size * perOne, ticks };
}
