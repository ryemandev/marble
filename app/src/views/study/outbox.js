const RETRY = [2000, 5000, 15000, 30000, 60000];
const CHUNK = 100;
const LOG = 200;
const ORDER = [["storage", "put"], ["notebooks", "put"], ["notebooks", "patch"], ["pages", "put"], ["pages", "patch"], ["pages", "del"], ["notebooks", "del"], ["storage", "del"]];

export function waitable(e, online = true) {
  if (!online) return true;
  const code = String(e?.code || "");
  return !(code.startsWith("23") || code.startsWith("22") || code === "42501");
}

const sameBase = (a, b) => (a?.at ?? null) === (b?.at ?? null);

export function createOutbox({
  storage, key, send, onRefused, onStatus,
  setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t),
  isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  delay = 700, now = () => new Date().toISOString(), clock = () => Date.now(),
}) {
  let ops = [];
  try { ops = JSON.parse(storage.getItem(key) || "[]"); if (!Array.isArray(ops)) ops = []; } catch { ops = []; }
  let v = ops.reduce((m, o) => Math.max(m, o.v || 0), 0);
  let timer = null, flushing = null, again = false, tries = 0, stuck = false;
  let log = [], seq = 0;

  const status = () => ({ pending: ops.length, waiting: stuck && ops.length > 0 });
  const save = () => {
    try { if (ops.length) storage.setItem(key, JSON.stringify(ops)); else storage.removeItem(key); } catch { }
    onStatus?.(status());
  };
  const schedule = (ms = delay) => { if (timer != null) clearTimer(timer); timer = setTimer(() => { timer = null; return flush(); }, ms); };
  const forget = (list) => { const vs = new Set(list.map((o) => o.v)); ops = ops.filter((o) => !vs.has(o.v)); };
  const rebase = (x, sent, next) => {
    if (x.k !== sent.k) return x;
    if (x.kind === "del") return x.undo && sameBase(x.undo.base, sent.base) ? { ...x, undo: { ...x.undo, base: next } } : x;
    return sameBase(x.base, sent.base) ? { ...x, base: next } : x;
  };
  const done = (list, results) => {
    forget(list);
    for (const o of list) {
      const next = results?.get?.(o.kind === "put" ? o.row.id : o.id);
      if (next) ops = ops.map((x) => rebase(x, o, next));
      log.push({ ...o, seq: ++seq });
    }
    if (log.length > LOG) log = log.slice(-LOG);
    save();
  };
  const baseFor = (before, extra) => {
    if (!before) return extra.base ?? null;
    if (before.kind === "del") return before.undo ? before.undo.base ?? null : extra.base ?? null;
    return before.base ?? null;
  };

  function put(table, row, extra = {}) {
    const k = `${table}:${row.id}`;
    const before = ops.find((o) => o.k === k);
    ops = ops.filter((o) => o.k !== k);
    ops.push({ k, table, kind: "put", row, v: ++v, at: now(), createdAt: extra.createdAt || before?.createdAt || before?.undo?.createdAt || null, base: baseFor(before, extra) });
    save();
    schedule();
  }
  function patch(table, id, cols, extra = {}) {
    const k = `${table}:${id}`;
    const before = ops.find((o) => o.k === k);
    if (before?.kind === "del") return;
    if (before?.kind === "put") return put(table, { ...before.row, ...cols });
    ops = ops.filter((o) => o.k !== k);
    ops.push({ k, table, kind: "patch", id, cols: { ...before?.cols, ...cols }, v: ++v, at: now(), base: baseFor(before, extra) });
    save();
    schedule();
  }
  function del(table, id, { after = null } = {}) {
    const k = `${table}:${id}`;
    const before = ops.find((o) => o.k === k);
    ops = ops.filter((o) => o.k !== k);
    ops.push({ k, table, kind: "del", id, v: ++v, at: now(), after, undo: before?.kind === "put" ? before : before?.undo || null });
    save();
    if (!after) schedule();
    else if (timer == null) schedule(Math.max(delay, after - clock() + 50)); // what's already due goes first, and comes back for this
  }
  function cancelDel(table, id) {
    const k = `${table}:${id}`;
    const o = ops.find((x) => x.k === k && x.kind === "del");
    if (!o) return false;
    ops = ops.filter((x) => x !== o);
    if (o.undo) ops.push({ ...o.undo, v: ++v });
    save();
    if (o.undo) schedule();
    return true;
  }

  async function flush() {
    if (flushing) { again = true; return flushing; }
    if (!ops.length) { stuck = false; return; }
    flushing = (async () => {
      const t = clock();
      const snap = ops.filter((o) => !o.after || o.after <= t);
      const deferred = ops.filter((o) => o.after && o.after > t).map((o) => o.after);
      for (const [table, kind] of ORDER) {
        const all = snap.filter((o) => o.table === table && o.kind === kind);
        for (let i = 0; i < all.length; i += CHUNK) {
          const chunk = all.slice(i, i + CHUNK);
          const body = (list) => (kind === "put" ? list.map((o) => o.row) : kind === "patch" ? list.map((o) => ({ id: o.id, ...o.cols })) : list.map((o) => o.id));
          try {
            done(chunk, await send(table, kind, body(chunk), chunk));
          } catch (e) {
            if (waitable(e, isOnline())) return later();
            // Refused: find which one, so the rest still go
            for (const o of chunk) {
              try { done([o], await send(table, kind, body([o]), [o])); } catch (e2) {
                if (waitable(e2, isOnline())) return later();
                forget([o]);
                save();
                onRefused?.(o, e2);
              }
            }
          }
        }
      }
      tries = 0;
      stuck = false;
      onStatus?.(status());
      if (deferred.length) schedule(Math.max(50, Math.min(...deferred) - clock() + 50));
    })().finally(() => {
      flushing = null;
      if (again) { again = false; if (ops.length) schedule(0); }
    });
    return flushing;
  }
  function later() {
    stuck = true;
    onStatus?.(status());
    schedule(RETRY[Math.min(tries++, RETRY.length - 1)]);
  }

  return {
    put, patch, del, cancelDel, flush, status,
    pending: () => ops.map((o) => ({ ...o })),
    // Is this still waiting to be sent? (a photo not uploaded yet)
    waiting: (table, id, kind = "put") => ops.some((o) => o.k === `${table}:${id}` && o.kind === kind),
    mark: () => seq,
    sentSince: (m) => log.filter((o) => o.seq > m).map((o) => ({ ...o })),
    now: () => { tries = 0; if (ops.length) return flush(); },
    stop: () => { if (timer != null) clearTimer(timer); timer = null; },
  };
}
