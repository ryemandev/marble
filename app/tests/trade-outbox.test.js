// A closed tab can't lose a trade. Runs src/live/sync.js and the store for real against a fake Supabase that applies
// the live trades policy (user_id = auth.uid()). A "tab" is a fresh copy of every module, so it starts with empty
// memory and shares only what a real new tab would: this browser's localStorage, and the server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import "./fake-supabase.mjs";
import { KEY, clearTrades, keepTrades, sentTrades, unsentTrades, withUnsent } from "../src/live/tradeOutbox.js";

registerHooks({
  resolve(specifier, context, next) {
    const out = next(specifier, context);
    if (!out.url.startsWith("file:") || !/\/src\//.test(out.url)) return out;
    const tab = /tab=\d+/.exec(`${out.url} ${context.parentURL || ""}`)?.[0];
    return tab ? { ...out, url: `${out.url.split("?")[0]}?${tab}` } : out;
  },
});

const ME = "6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const THEM = "7f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const ID = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000001";
const HOUR = 36e5;

/* ---------- The browser ---------- */

const keys = new Map();
globalThis.localStorage = {
  getItem: (k) => (keys.has(k) ? keys.get(k) : null),
  setItem: (k, v) => { keys.set(k, String(v)); },
  removeItem: (k) => { keys.delete(k); },
};
Object.defineProperty(globalThis.localStorage, "length", { get: () => keys.size });
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let online = true, heard = [];
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
globalThis.window = { MARBLE_APP: true, addEventListener: (type, f) => heard.push([type, f]), dispatchEvent() {} };
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener: (type, f) => heard.push([type, f]), documentElement: { dataset: {} }, visibilityState: "visible" };
globalThis.setInterval = () => 0; // the live store's clock would keep this file running for ever
const later = globalThis.setTimeout;
globalThis.setTimeout = (f, ms, ...rest) => { const t = later(f, ms, ...rest); t.unref?.(); return t; }; // nor may a toast
const fire = (type) => heard.filter(([t]) => t === type).forEach(([, f]) => f());

/* ---------- The server ---------- */

const server = { trades: [], upserts: [], deletes: [], refuse: null, hang: false, signedIn: ME, signOutError: null };
const reset = () => {
  Object.assign(server, { trades: [], upserts: [], deletes: [], refuse: null, hang: false, signedIn: ME, signOutError: null });
  keys.clear();
  online = true;
};
const DOWN = { message: "TypeError: Failed to fetch", code: "" };

function answer(table, q) {
  if (q.upsert) {
    server.upserts.push(q.upsert);
    if (server.hang) return new Promise(() => {});
    const error = server.refuse?.(q.upsert);
    if (error) return { data: null, error };
    if (table === "trades") {
      if (q.upsert.some((r) => r.user_id !== server.signedIn)) return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
      for (const r of q.upsert) {
        const i = server.trades.findIndex((t) => t.id === r.id);
        const row = { pnl: 0, updated_at: new Date().toISOString(), ...server.trades[i], ...r };
        if (i < 0) server.trades.push(row); else server.trades[i] = row;
      }
    }
    return { data: null, error: null };
  }
  if (q.remove) {
    server.deletes.push(q.ids);
    const error = server.refuse?.(q.ids);
    if (error) return { data: null, error };
    server.trades = server.trades.filter((t) => !(q.ids.includes(t.id) && t.user_id === server.signedIn));
    return { data: [], error: null };
  }
  if (table === "trades") return { data: server.trades.filter((t) => t.user_id === server.signedIn), error: null };
  if (q.one) return { data: { id: server.signedIn, handle: "trader", name: "Trader", checklist: [] }, error: null };
  if (q.maybe) return { data: null, error: null };
  return { data: [], error: null };
}
const query = (table) => {
  const state = {};
  const q = new Proxy({}, {
    get: (_, key) => {
      if (key === "then") return (yes, no) => Promise.resolve(answer(table, state)).then(yes, no);
      if (key === "upsert") return (rows) => { state.upsert = [rows].flat(); return q; };
      if (key === "delete") return () => { state.remove = true; return q; };
      if (key === "in") return (_col, ids) => { state.ids = ids; return q; };
      if (key === "single") return () => { state.one = true; return q; };
      if (key === "maybeSingle") return () => { state.maybe = true; return q; };
      return () => q;
    },
  });
  return q;
};
const rawSignOut = async () => {
  if (server.signOutError) return { error: server.signOutError };
  server.signedIn = null;
  return { error: null };
};
const fake = globalThis.fakeSupabase = {
  from: query,
  rpc: async () => ({ data: {}, error: null }),
  functions: { invoke: async () => ({ error: null }) },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  auth: {
    getUser: async () => ({ data: { user: server.signedIn ? { id: server.signedIn, email: "trader@example.com" } : null } }),
    getSession: async () => ({ data: { session: server.signedIn ? { user: { id: server.signedIn } } : null } }),
    signOut: rawSignOut,
  },
};

/* ---------- A tab ---------- */

let tabs = 0;
async function open() {
  tabs += 1;
  heard = [];
  fake.auth.signOut = rawSignOut; // an old tab's hook on it would be a tab still open
  const [sync, store] = await Promise.all([import(`../src/live/sync.js?tab=${tabs}`), import(`../src/store.js?tab=${tabs}`)]);
  await sync.load();
  return { ...sync, ...store, log: (t) => store.setState((s) => ({ logged: [store.datedTrade(t), ...s.logged] })) };
}
const trade = (id, extra = {}) => ({ id, traded_at: "2026-11-05T14:30:00.000Z", symbol: "NQ", side: "long", pnl: 120, note: "", kept: [], world: "markets", ...extra });
const stored = (who = ME) => JSON.parse(keys.get(KEY + who) || "[]");
const refuseAll = () => DOWN;
const toastOf = (tab) => tab.getRawState().toast?.text || "";

/* ---------- The list itself ---------- */

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
};
const row = (id, extra = {}) => ({ id, user_id: ME, traded_at: "2026-11-05T14:30:00.000Z", symbol: "NQ", side: "long", pnl: 1, ...extra });

test("deleting an account sweeps the list, by its name alone", () => {
  assert.match(KEY + ME, /^marble[-.]/);
});

test("the newest word on a trade replaces whatever was waiting for it", () => {
  const box = memory();
  keepTrades(ME, { rows: [row(ID(1), { pnl: 1 })] }, box);
  keepTrades(ME, { rows: [row(ID(1), { pnl: 2 })], known: new Set([ID(1)]) }, box);
  let list = unsentTrades(ME, box);
  assert.equal(list.length, 1);
  assert.equal(list[0].row.pnl, 2);
  assert.equal(list[0].v, 2);
  assert.equal(list[0].fresh, true, "still a trade the server has never seen");
  keepTrades(ME, { ids: [ID(1)] }, box);
  list = unsentTrades(ME, box);
  assert.equal(list.length, 1);
  assert.equal(list[0].del, true, "a delete cancels the save");
  assert.equal(list[0].row, undefined);
});

test("a trade changed while it was on its way isn't crossed off", () => {
  const box = memory();
  keepTrades(ME, { rows: [row(ID(1))] }, box);
  const sent = unsentTrades(ME, box);
  keepTrades(ME, { rows: [row(ID(1), { pnl: 9 })] }, box);
  sentTrades(ME, sent, box);
  assert.equal(unsentTrades(ME, box)[0].row.pnl, 9);
  sentTrades(ME, unsentTrades(ME, box), box);
  assert.equal(box.m.size, 0, "an empty list leaves no key behind");
});

test("a list holds one trader's rows, and nothing that could stop the app opening", () => {
  const box = memory();
  keepTrades(ME, { rows: [row(ID(1))] }, box);
  assert.deepEqual(unsentTrades(THEM, box), [], "someone else on this browser sees none of it");
  box.setItem(KEY + THEM, JSON.stringify([{ id: ID(2), row: row(ID(2)), at: "2026-11-05T00:00:00Z", v: 1 }]));
  assert.deepEqual(unsentTrades(THEM, box), [], "a row with another owner is no use to anyone");
  box.setItem(KEY + THEM, "not json");
  assert.deepEqual(unsentTrades(THEM, box), []);
  box.setItem(KEY + THEM, JSON.stringify([{ id: ID(3), row: row(ID(3), { user_id: THEM, traded_at: "never" }), v: 1 }]));
  assert.deepEqual(unsentTrades(THEM, box), [], "a date that would break the load");
});

test("a browser that won't keep the list still gets the trade sent from this page", () => {
  const who = "blocked-trader";
  const box = { getItem: () => null, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
  keepTrades(who, { rows: [row(ID(1), { user_id: who })] }, box);
  assert.equal(unsentTrades(who, box).length, 1);
  clearTrades(who, box);
  assert.deepEqual(unsentTrades(who, box), []);
});

test("unsent changes are laid over what the server sent", () => {
  const at = "2026-11-05T12:00:00.000Z";
  const change = (id, extra) => ({ id, at, v: 1, ...extra });
  const server = [{ id: ID(1), pnl: 1, source: "import", fills: ["f"], updated_at: "2026-11-05T11:00:00.000Z" }, { id: ID(2), pnl: 2, updated_at: "2026-11-05T11:00:00.000Z" }];
  const { rows, waiting, overtaken } = withUnsent(server, [
    change(ID(1), { row: { id: ID(1), pnl: 50 } }),
    change(ID(2), { del: true }),
    change(ID(3), { row: { id: ID(3), pnl: 3 }, fresh: true }),
  ]);
  assert.deepEqual(rows.find((r) => r.id === ID(1)), { ...server[0], pnl: 50 }, "what the app doesn't send stays");
  assert.ok(!rows.some((r) => r.id === ID(2)), "a waiting delete hides the trade");
  assert.ok(rows.some((r) => r.id === ID(3)), "a new trade shows before it's sent");
  assert.equal(waiting.length, 3);
  assert.equal(overtaken.length, 0);
});

test("a change the server has moved past stands down, with room for clocks that differ", () => {
  const at = "2026-11-05T12:00:00.000Z", put = { id: ID(1), at, v: 1, row: { id: ID(1) } };
  const after = (mins) => [{ id: ID(1), updated_at: new Date(Date.parse(at) + mins * 6e4).toISOString() }];
  assert.equal(withUnsent(after(4), [put]).waiting.length, 1, "a save that landed as its tab closed");
  assert.equal(withUnsent(after(6), [put]).overtaken.length, 1, "changed somewhere else since");
  assert.equal(withUnsent([], [put]).overtaken.length, 1, "an edit to a trade deleted somewhere else doesn't bring it back");
  assert.equal(withUnsent([], [{ ...put, fresh: true }]).waiting.length, 1, "a new trade is meant to be missing");
  assert.equal(withUnsent([], [{ id: ID(1), at, v: 1, del: true }]).overtaken.length, 0);
});

/* ---------- The save path, for real ---------- */

test("a save that can't get through is written down, and the next open sends it", async () => {
  reset();
  server.refuse = refuseAll;
  const first = await open();
  first.log(trade(ID(1), { note: "kept" }));
  await first.saved();
  assert.equal(server.trades.length, 0);
  assert.equal(stored().length, 1, "on this device, under this trader");
  assert.equal(stored()[0].row.user_id, ME, "and it carries its owner");
  assert.match(toastOf(first), /isn't saved yet\. It's kept here/);

  server.refuse = null;
  server.upserts = [];
  const second = await open();
  assert.ok(second.getRawState().logged.some((t) => t.id === ID(1) && t.note === "kept"), "the trade is on screen");
  await second.saved();
  assert.equal(server.trades.length, 1);
  assert.equal(server.trades[0].user_id, ME);
  assert.equal(server.trades[0].note, "kept");
  assert.equal(server.upserts.length, 1, "sent once");
  assert.equal(keys.has(KEY + ME), false, "and crossed off");
});

test("a tab closed with the save still on its way doesn't lose it either", async () => {
  reset();
  server.hang = true;
  const first = await open();
  first.log(trade(ID(1)));
  await new Promise((done) => later(done, 5));
  assert.equal(stored().length, 1, "written down before it was sent");
  server.hang = false;
  await (await open()).saved();
  assert.equal(server.trades.length, 1);
  assert.equal(keys.has(KEY + ME), false);
});

test("the trade still shows on the next open when it still can't get through", async () => {
  reset();
  server.refuse = refuseAll;
  const first = await open();
  first.log(trade(ID(1)));
  await first.saved();
  const second = await open();
  await second.saved();
  assert.ok(second.getRawState().logged.some((t) => t.id === ID(1)));
  assert.equal(stored().length, 1);
  assert.match(toastOf(second), /isn't saved yet/);
  server.refuse = null;
  fire("online");
  await second.saved();
  assert.equal(server.trades.length, 1, "and goes when the connection is back");
});

test("a retry sends only the newest word on a trade", async () => {
  reset();
  server.refuse = refuseAll;
  const tab = await open();
  tab.log(trade(ID(1), { note: "first" }));
  await tab.saved();
  tab.setState((s) => ({ logged: s.logged.map((t) => ({ ...t, note: "second" })) }));
  await tab.saved();
  server.refuse = null;
  server.upserts = [];
  fire("online");
  await tab.saved();
  assert.equal(server.trades[0].note, "second");
  assert.deepEqual(server.upserts.flat().map((r) => r.note), ["second"]);
});

test("coming back to the app sends what's waiting, but not while offline", async () => {
  reset();
  server.refuse = refuseAll;
  const tab = await open();
  tab.log(trade(ID(1)));
  await tab.saved();
  server.refuse = null;
  online = false;
  server.upserts = [];
  fire("visibilitychange");
  await tab.saved();
  assert.equal(server.upserts.length, 0);
  online = true;
  fire("visibilitychange");
  await tab.saved();
  assert.equal(server.trades.length, 1);
});

test("a trade deleted before it was sent doesn't come back", async () => {
  reset();
  server.refuse = refuseAll;
  const first = await open();
  first.log(trade(ID(1)));
  await first.saved();
  first.setState((s) => ({ logged: s.logged.filter((t) => t.id !== ID(1)) }));
  await first.saved();
  server.refuse = null;
  server.upserts = [];
  const second = await open();
  await second.saved();
  assert.equal(server.upserts.length, 0, "nothing is created");
  assert.equal(server.trades.length, 0);
  assert.equal(keys.has(KEY + ME), false, "a delete of nothing still counts as done");
  assert.doesNotMatch(toastOf(second), /back to how it was/, "and no one's told it failed");
});

test("a delete that couldn't get through holds on the next open", async () => {
  reset();
  server.trades = [{ ...trade(ID(1)), user_id: ME, updated_at: "2026-11-05T14:31:00.000Z" }];
  server.refuse = refuseAll;
  const first = await open();
  first.setState((s) => ({ logged: s.logged.filter((t) => t.id !== ID(1)) }));
  await first.saved();
  assert.equal(server.trades.length, 1);
  server.refuse = null;
  const second = await open();
  assert.ok(!second.getRawState().logged.some((t) => t.id === ID(1)), "it doesn't flash back");
  await second.saved();
  assert.equal(server.trades.length, 0);
});

/* ---------- Whose trade it is ---------- */

test("the next trader on this browser never sends or sees the last one's trade", async () => {
  reset();
  server.refuse = refuseAll;
  const mine = await open();
  mine.log(trade(ID(1)));
  await mine.saved();

  server.refuse = null;
  server.upserts = [];
  server.signedIn = THEM;
  const theirs = await open();
  await theirs.saved();
  assert.equal(server.upserts.length, 0, "nothing goes up");
  assert.equal(theirs.getRawState().logged.length, 0, "nothing shows");
  assert.equal(server.trades.length, 0);
  assert.equal(stored(ME).length, 1, "and it's still mine");

  server.signedIn = ME;
  const back = await open();
  await back.saved();
  assert.deepEqual(server.trades.map((t) => t.user_id), [ME]);
});

test("a tab still open as one trader sends nothing under another's sign-in", async () => {
  reset();
  server.refuse = refuseAll;
  const tab = await open();
  tab.log(trade(ID(1)));
  await tab.saved();
  server.refuse = null;
  server.upserts = [];
  server.signedIn = THEM; // another tab signed in as someone else, and this one hasn't reloaded yet
  fire("online");
  await tab.saved();
  assert.equal(server.upserts.length, 0);
  assert.equal(stored(ME).length, 1, "kept, not refused");
});

test("every row names its owner, so the database's own policy has the last word", async () => {
  reset();
  const tab = await open();
  tab.log(trade(ID(1)));
  await tab.saved();
  assert.deepEqual(server.upserts.flat().map((r) => r.user_id), [ME]);
});

/* ---------- Leaving ---------- */

test("signing out clears what's unsent, whichever way it's asked", async () => {
  for (const options of [undefined, { scope: "local" }]) {
    reset();
    server.refuse = refuseAll;
    const tab = await open();
    tab.log(trade(ID(1)));
    await tab.saved();
    await fake.auth.signOut(options);
    assert.equal(keys.has(KEY + ME), false);
  }
});

test("a sign-out that failed leaves the trader here, with their trades still to send", async () => {
  reset();
  server.refuse = refuseAll;
  server.signOutError = { message: "offline" };
  const tab = await open();
  tab.log(trade(ID(1)));
  await tab.saved();
  assert.equal((await fake.auth.signOut()).error.message, "offline", "the answer still comes back");
  assert.equal(stored().length, 1);
});

test("signing out leaves another trader's list alone", async () => {
  reset();
  keys.set(KEY + THEM, JSON.stringify([{ id: ID(2), at: "2026-11-05T00:00:00.000Z", v: 1, fresh: true, row: { ...row(ID(2)), user_id: THEM } }]));
  await open();
  await fake.auth.signOut();
  assert.equal(stored(THEM).length, 1);
});

test("deleting the account leaves nothing of it, and a save on its way can't write it back", async () => {
  reset();
  server.refuse = refuseAll;
  const tab = await open();
  tab.log(trade(ID(1)));
  await tab.saved();
  assert.equal(stored().length, 1);
  await tab.deleteAccount();
  assert.equal(keys.has(KEY + ME), false);
  fire("online");
  await tab.saved();
  assert.equal(keys.has(KEY + ME), false);
});

/* ---------- When the server says no ---------- */

test("one refused trade doesn't hold back the others", async () => {
  reset();
  server.refuse = (rows) => (rows.some?.((r) => r.id === ID(2)) ? { code: "23514", message: "note too long" } : null);
  const list = [
    { id: ID(1), at: new Date().toISOString(), v: 1, fresh: true, row: { ...row(ID(1)) } },
    { id: ID(2), at: new Date().toISOString(), v: 1, fresh: true, row: { ...row(ID(2)) } },
  ];
  keys.set(KEY + ME, JSON.stringify(list));
  const tab = await open();
  await tab.saved();
  assert.deepEqual(server.trades.map((t) => t.id), [ID(1)]);
  assert.equal(keys.has(KEY + ME), false, "a refusal is the server's last word, so it isn't sent for ever");
  assert.match(toastOf(tab), /too long or out of range, so it's back to how it was/);
  assert.ok(!tab.getRawState().logged.some((t) => t.id === ID(2)), "and the screen says what the server says");
});

test("a trade whose account never reached the server is saved without it", async () => {
  reset();
  server.refuse = (rows) => (rows.some?.((r) => r.account_id) ? { code: "23503", message: "violates foreign key" } : null);
  keys.set(KEY + ME, JSON.stringify([{ id: ID(1), at: new Date().toISOString(), v: 1, fresh: true, row: { ...row(ID(1)), account_id: ACCOUNT } }]));
  await (await open()).saved();
  assert.equal(server.trades.length, 1);
  assert.equal(server.trades[0].account_id, null);
  assert.equal(keys.has(KEY + ME), false);
});

test("an expired sign-in or a busy server isn't a refusal: the trade waits", async () => {
  for (const error of [{ code: "PGRST301", message: "JWT expired" }, { code: "PGRST000", message: "could not connect" }, { code: "57014", message: "statement cancelled" }]) {
    reset();
    server.refuse = () => error;
    const tab = await open();
    tab.log(trade(ID(1)));
    await tab.saved();
    assert.equal(stored().length, 1, error.code);
    assert.doesNotMatch(toastOf(tab), /back to how it was/);
    assert.match(toastOf(tab), /It's kept here/);
  }
});

test("a trade changed somewhere else since stands, and the trader is told", async () => {
  reset();
  const now = Date.now();
  server.trades = [{ ...trade(ID(1), { note: "from my phone" }), user_id: ME, updated_at: new Date(now).toISOString() }];
  keys.set(KEY + ME, JSON.stringify([{ id: ID(1), at: new Date(now - HOUR).toISOString(), v: 1, fresh: false, row: { ...row(ID(1)), note: "old, from my laptop" } }]));
  const tab = await open();
  await tab.saved();
  assert.equal(server.upserts.length, 0);
  assert.equal(server.trades[0].note, "from my phone");
  assert.equal(tab.getRawState().logged[0].note, "from my phone");
  assert.equal(keys.has(KEY + ME), false);
  assert.match(toastOf(tab), /the newer version stands/);
});

test("a trade changed here after it landed goes up as usual, with every other table left on its own path", async () => {
  reset();
  server.trades = [{ ...trade(ID(1), { note: "before" }), user_id: ME, updated_at: new Date().toISOString() }];
  const tab = await open();
  tab.setState((s) => ({ logged: s.logged.map((t) => ({ ...t, note: "after" })) }));
  await tab.saved();
  assert.equal(server.trades[0].note, "after");
  assert.equal(keys.has(KEY + ME), false);
});
