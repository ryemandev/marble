import { build, mappingFor, presetById, readTable } from "./engine.js";

export const PLATFORM = "ibkr-sync";
export const DEFAULT_TZ = "America/New_York";
const NONE = { trades: [], open: [], orphans: [], skipped: [], unknown: [], missing: [] };

export function buildIbkr(csv, account, { carried = [], tz = DEFAULT_TZ, points = {} } = {}) {
  const table = readTable(csv);
  if (!table.headers.length) return { ...NONE, accounts: [] };
  const preset = presetById("ibkr-flex");
  const mapping = mappingFor(preset, table.headers);
  const result = build(table, mapping, { tz, order: "MDY", points, carried, fileAccount: account === "*" ? null : account });
  if (account !== "*" && result.accounts.length && !result.accounts.includes(account)) return { ...NONE, accounts: result.accounts };
  return result;
}

export const SETUP = [
  "In Client Portal open Performance & Reports → Flex Queries, and create an Activity Flex Query.",
  "Sections: tick Trades, choose Executions, and select Account ID, Symbol, Date/Time, Buy/Sell, Quantity, Trade Price, IB Commission, Multiplier, Trade ID and Open/Close Indicator.",
  "Delivery Configuration: Format CSV, Include header and trailer records No, Include column headers Yes, Include section code and line descriptor No, Period Last 365 Calendar Days.",
  "General Configuration: Date Format yyyyMMdd, Time Format HHmmss, Date/Time Separator ; (semi-colon). Save, and note the Query ID shown next to it.",
  "Back on Flex Queries, open Flex Web Service Configuration, turn it on and generate a token. Choose how long it lasts (up to a year).",
];
