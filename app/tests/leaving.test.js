// A trader's own data: what the export file holds, and what leaves the device with the account. Runs src/live/sync.js
// and src/live/backdrop.js for real against a fake Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./fake-supabase.mjs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const SECRET = "the-broker-api-key";
const CONNECTION = { id: "c1", platform: "topstepx", username: "jules", accounts: [{ id: 1, name: "50K" }], settings: { queryId: "123" }, status: "ok", last_error: `failed t=${SECRET}`, last_synced_at: "2026-11-05T10:00:00Z", api_key: SECRET, token_cipher: SECRET };
const NEWS = { enabled: true, before_min: 5, after_min: 5, medium: false, updated_at: "2026-11-05T10:00:00Z", user_id: "u1" };

let asked = [], calls = [], invoked = { error: null };
const pick = (row, cols) => (cols === "*" ? row : Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, row[c]])));
globalThis.fakeSupabase = {
  from: (table) => ({
    select: (cols) => ({
      eq: async () => {
        asked.push({ table, cols });
        if (table === "connections") return { data: [pick(CONNECTION, cols)], error: null };
        if (table === "news_rules") return { data: [pick(NEWS, cols)], error: null };
        return { data: [], error: null };
      },
    }),
  }),
  rpc: async () => ({ data: {}, error: null }),
  functions: { invoke: async (name) => { calls.push(`invoke ${name}`); return invoked; } },
  auth: { signOut: async () => { calls.push(`signOut, marble keys left: ${marbleKeys().length}`); return { error: null }; } },
};

function box(seed) {
  const b = Object.create({
    getItem(k) { return k in this ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  });
  return Object.assign(b, seed);
}
const marbleKeys = () => [...Object.keys(globalThis.localStorage), ...Object.keys(globalThis.sessionStorage)].filter((k) => k.startsWith("marble"));

// IndexedDB, as far as the app uses it. `held` is a connection left open, as the Study photos' is: a delete waits on it.
function fakeIndexedDb(seed) {
  const dbs = new Map(Object.entries(seed));
  const later = (f) => setTimeout(f, 0);
  return {
    dbs,
    open(name) {
      const req = {};
      later(() => {
        const db = dbs.get(name);
        if (!db) { req.transaction = { abort: () => later(() => req.onerror?.({})) }; req.onupgradeneeded?.(); return; }
        req.result = {
          objectStoreNames: Object.keys(db.stores),
          close() {},
          transaction(stores) {
            const t = { objectStore: (s) => ({ clear: () => db.stores[s].clear() }) };
            assert.ok(stores.length);
            later(() => t.oncomplete?.());
            return t;
          },
        };
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase(name) {
      const req = {};
      later(() => {
        if (dbs.get(name)?.held) { req.onblocked?.(); return; }
        dbs.delete(name);
        req.onsuccess?.();
      });
      return req;
    },
  };
}
const fill = () => {
  globalThis.localStorage = box({
    "marble-closes": "{}", "marble-closes-by": "u1", "marble.flex.style": "{}", "marble.flex.looks": "{}", "marble.flex.pictures": "{}", "marble.flex.plain": "{}",
    "marble-backdrop": "{}", "marble-chapters": "{}", "marble-study-outbox:u1": "[]", "marble-chat-seen-general": "1", "someone-elses": "stays",
  });
  globalThis.sessionStorage = box({ "marble-setup-draft": "{}", "marble-ask": "a question", "someone-elses": "stays" });
  globalThis.indexedDB = fakeIndexedDb({
    "marble-study": { held: true, stores: { photos: new Map([["u1/a.jpg", "photo"]]) } },
    "marble-flex": { stores: { pictures: new Map([["own:1", "picture"]]) } },
    "another-db": { stores: { x: new Map([["k", "v"]]) } },
  });
};
fill();
const { deleteAccount, exportAll } = await import("../src/live/sync.js");
const { ownUrl, removeOwn } = await import("../src/live/backdrop.js");

/* ---------- The export ---------- */

test("the export holds broker connections and news rules, by named columns", async () => {
  asked = [];
  const out = await exportAll();
  assert.equal(out.connections[0].username, "jules");
  assert.equal(out.connections[0].status, "ok");
  assert.deepEqual(out.connections[0].accounts, CONNECTION.accounts);
  assert.equal(out.news_rules[0].before_min, 5);
  for (const t of ["connections", "news_rules"]) assert.notEqual(asked.find((a) => a.table === t).cols, "*", t);
});

test("no key, token or broker error ever reaches the export file", async () => {
  const out = JSON.stringify(await exportAll());
  assert.ok(!out.includes(SECRET));
  assert.doesNotMatch(asked.find((a) => a.table === "connections").cols, /key|token|secret|cipher|password|last_error/i);
});

test("the export asks for connections with the columns the app itself reads, less the error", () => {
  const app = /from\("connections"\)\.select\("([^"]+)"\)/.exec(read("src/live/import/connect.js"))[1].split(", ");
  const sent = /connections: "([^"]+)"/.exec(read("src/live/sync.js"))[1].split(", ");
  assert.deepEqual(sent, app.filter((c) => c !== "last_error"));
});

test("everything the export held before is still there", async () => {
  const out = await exportAll();
  for (const t of ["profiles", "profile_private", "accounts", "strategies", "trades", "imports", "notes", "notebooks", "pages", "daily_plans", "ideas", "bug_reports", "prop_money", "closes", "posts", "messages_and_sharing"]) assert.ok(t in out, t);
});

/* ---------- Deleting the account ---------- */

test("a deleted account leaves nothing of Marble's on the device, and it's cleared before the sign-out reloads the page", async () => {
  fill();
  calls = []; invoked = { error: null };
  await deleteAccount();
  assert.deepEqual(calls, ["invoke delete-account", "signOut, marble keys left: 0"]);
  assert.equal(globalThis.localStorage["someone-elses"], "stays");
  assert.equal(globalThis.sessionStorage["someone-elses"], "stays");
  assert.ok(!globalThis.indexedDB.dbs.has("marble-flex"), "the flex pictures' database is deleted");
  assert.equal(globalThis.indexedDB.dbs.get("marble-study").stores.photos.size, 0, "a Study database held open is still emptied");
  assert.equal(globalThis.indexedDB.dbs.get("another-db").stores.x.size, 1);
});

test("the four things the audit named are all cleared", async () => {
  fill();
  invoked = { error: null };
  await deleteAccount();
  for (const k of ["marble-closes", "marble.flex.style", "marble.flex.looks"]) assert.ok(!(k in globalThis.localStorage), k);
  assert.ok(!globalThis.indexedDB.dbs.has("marble-flex"));
});

test("a database never made on this device isn't made by clearing it", async () => {
  fill();
  invoked = { error: null };
  globalThis.indexedDB = fakeIndexedDb({});
  await deleteAccount();
  assert.equal(globalThis.indexedDB.dbs.size, 0);
});

test("a failed deletion clears nothing and keeps the trader signed in", async () => {
  fill();
  calls = [];
  invoked = { error: { context: { json: async () => ({ error: "Your account couldn't be deleted just now.", code: null }) } } };
  await assert.rejects(deleteAccount(), /couldn't be deleted just now/);
  assert.deepEqual(calls, ["invoke delete-account"]);
  assert.ok("marble-closes" in globalThis.localStorage);
  assert.equal(globalThis.indexedDB.dbs.get("marble-study").stores.photos.size, 1);
});

test("a blocked browser can't stop the sign-out once the account is gone", async () => {
  fill();
  calls = []; invoked = { error: null };
  globalThis.indexedDB = { open() { throw new Error("blocked"); } };
  await deleteAccount();
  assert.equal(calls.length, 2);
  delete globalThis.localStorage; // storage turned off
  calls = [];
  await deleteAccount().catch(() => {});
  fill();
});

/* ---------- The legal copy says so ---------- */

test("the policy says what stays after sign-out, how to clear it, and what deletion clears", () => {
  const docs = read("src/site/legal/docs.js");
  assert.match(docs, /When you sign out or leave/);
  assert.match(docs, /stays in this browser/);
  assert.match(docs, /delete the site data for trademarble\.app/);
  assert.match(docs, /Deleting your account clears all of it from the browser you delete from/);
  assert.match(docs, /Any other device or browser you've used keeps its copy/);
});

/* ---------- The link to a private backdrop ---------- */

test("a backdrop link lasts an hour and is replaced before it runs out", async (t) => {
  const signs = [];
  globalThis.fakeSupabase.storage = { from: () => ({ createSignedUrl: async (path, secs) => { signs.push(secs); return { data: { signedUrl: `https://sb.test/${path}?token=${signs.length}` }, error: null }; } }) };
  const clock = t.mock.method(Date, "now", () => 1_000_000_000_000);
  const path = "u1/a.jpg";
  const first = await ownUrl(path);
  assert.deepEqual(signs, [3600]);
  assert.equal(await ownUrl(path), first, "the same link while it's good");

  clock.mock.mockImplementation(() => 1_000_000_000_000 + 49 * 60e3);
  assert.equal(await ownUrl(path), first, "still good 49 minutes on");

  clock.mock.mockImplementation(() => 1_000_000_000_000 + 51 * 60e3);
  const second = await ownUrl(path);
  assert.notEqual(second, first, "a new one before the hour is up");
  assert.deepEqual(signs, [3600, 3600]);
  globalThis.fakeSupabase.storage = { from: () => ({ remove: async () => {} }) };
  await removeOwn(path);
});

test("a failed link says so, and doesn't keep a dead one", async () => {
  globalThis.fakeSupabase.storage = { from: () => ({ createSignedUrl: async () => ({ data: null, error: new Error("nope") }) }) };
  await assert.rejects(ownUrl("u1/b.jpg"), /nope/);
});

test("nothing keeps a link to a private photo for a day any more", () => {
  const src = read("src/live/backdrop.js");
  assert.doesNotMatch(src, /86400/);
  assert.match(src, /const HOUR = 3600;/);
});
