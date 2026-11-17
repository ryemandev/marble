import { toRow } from "./engine.js";
import { SOURCE, alreadyLogged, openChanged } from "./topstepx.js";

export const BROKER_FIELDS = ["traded_at", "closed_at", "symbol", "side", "entry", "exit", "size", "pnl", "commission", "fills", "external_id",
  "leverage", "funding", "fee_maker", "fee_taker", "liq_price"];

const MAX_OPEN_FILLS = 2000;

export function planSync({ result, accountId, existing = new Set(), logged = [], risk = null, carried = [] }) {
  const have = existing instanceof Set ? existing : new Set(existing);
  const left = logged.filter((x) => x && x.source !== SOURCE);
  const rows = [], upgrades = [];
  let duplicates = 0, unpriced = 0;
  for (const t of result.trades || []) {
    if (t.gross == null) { unpriced++; continue; }
    if (have.has(t.key.slice(0, 200))) { duplicates++; continue; }
    const row = { ...toRow(t, { accountId, importId: null, risk: risk > 0 ? risk : null }), source: SOURCE };
    const match = alreadyLogged(t, left);
    if (match) {
      left.splice(left.indexOf(match), 1);
      upgrades.push({ id: match.id, ...Object.fromEntries(BROKER_FIELDS.map((k) => [k, row[k]])) });
      continue;
    }
    rows.push(row);
  }
  const openFills = (result.open || []).flatMap((o) => o.fills).slice(0, MAX_OPEN_FILLS);
  return {
    rows, upgrades, duplicates, unpriced, openFills,
    worthSaving: rows.length > 0 || upgrades.length > 0 || openChanged(carried, openFills),
  };
}

export const FROZEN = "That account is in a competition, so its link to the broker stays as it is until the results are final.";
export function linkProblem({ platform, next = [], frozen = [] }) {
  for (const e of frozen) {
    for (const a of next) {
      const ours = e.broker_platform === platform && String(a.id) === String(e.broker_account);
      if (ours && a.linked && a.linked !== e.account_id) return FROZEN;
      if (!ours && a.linked && a.linked === e.account_id) return FROZEN;
    }
  }
  return null;
}

export function twinWindow(trades = []) {
  const t = trades.map((x) => +new Date(x.opened)).filter(Number.isFinite);
  if (!t.length) return null;
  return { from: new Date(Math.min(...t) - 120000).toISOString(), to: new Date(Math.max(...t) + 120000).toISOString() };
}
