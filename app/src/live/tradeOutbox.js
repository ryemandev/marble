// Trades on their way to the server. A change is written down here before it's sent and crossed off once the server
// has it, so a closed tab or a dropped connection can't lose it: the next open sends it. One list a trader, on this
// browser only, and every row carries its owner, so the database refuses it under anyone else's sign-in. The key
// starts marble-, so deleting an account sweeps it. No imports, so the tests can run it.

export const KEY = "marble-trade-outbox:";

// How far past a change the server has to be before that change counts as overtaken. Clocks differ, and a save can
// reach the server just as its tab closes.
const GRACE = 5 * 60 * 1000;

const held = new Map(); // a trader's list, when this browser won't keep it (storage blocked or full)
const boxOf = (store) => store || globalThis.localStorage;
const sound = (who) => (o) => !!o?.id && (o.del === true || (o.row?.user_id === who && Date.parse(o.row.traded_at) > 0));

export function unsentTrades(who, store) {
  if (held.has(who)) return held.get(who);
  try {
    const list = JSON.parse(boxOf(store).getItem(KEY + who));
    return Array.isArray(list) ? list.filter(sound(who)) : [];
  } catch { return []; }
}

function write(who, list, store) {
  try {
    if (list.length) boxOf(store).setItem(KEY + who, JSON.stringify(list));
    else boxOf(store).removeItem(KEY + who);
    held.delete(who);
  } catch { held.set(who, list); }
}

// rows: changed trades as rows, each with its user_id. ids: deleted trades. known: the ids the server may already
// hold. The newest word on a trade replaces whatever was waiting for it, so a delete also cancels an unsent save.
export function keepTrades(who, { rows = [], ids = [], known = new Set() }, store, at = new Date().toISOString()) {
  const by = new Map(unsentTrades(who, store).map((o) => [o.id, o]));
  const next = (id) => (by.get(id)?.v || 0) + 1;
  for (const row of rows) {
    const was = by.get(row.id);
    by.set(row.id, { id: row.id, row, at, v: next(row.id), fresh: was ? !!was.fresh : !known.has(row.id) });
  }
  for (const id of ids) by.set(id, { id, del: true, at, v: next(id) });
  write(who, [...by.values()], store);
}

// Crosses off what the server has. A trade changed again while it was on its way stays, for the next send.
export function sentTrades(who, sent, store) {
  const done = new Map(sent.map((o) => [o.id, o.v]));
  write(who, unsentTrades(who, store).filter((o) => done.get(o.id) !== o.v), store);
}

export function clearTrades(who, store) {
  held.delete(who);
  try { boxOf(store).removeItem(KEY + who); } catch {}
}

// The server's rows with this device's unsent changes on top, so a trade shows before it's sent. A change the server
// has moved past stands down: that trade was changed, or deleted, somewhere else after it was made here.
export function withUnsent(rows, list) {
  const by = new Map(rows.map((r) => [r.id, r]));
  const waiting = [], overtaken = [];
  for (const o of list) {
    const there = by.get(o.id);
    if (there ? Date.parse(there.updated_at) - Date.parse(o.at) > GRACE : !o.del && !o.fresh) { overtaken.push(o); continue; }
    waiting.push(o);
    if (o.del) by.delete(o.id);
    else by.set(o.id, { ...there, ...o.row });
  }
  return { rows: [...by.values()], waiting, overtaken };
}
