// Signing out and the device's alerts, and the public name at sign-up. Runs src/live/pwa.js for real against a fake Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./fake-supabase.mjs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

let log = [], rpc = async () => ({ error: null }), sub = null;
const signOutReply = { error: null };
globalThis.fakeSupabase = {
  rpc: (name, args) => { log.push(`rpc ${name} ${args.p_endpoint}`); return rpc(); },
  auth: {
    signOut: async function (options) { assert.equal(this, globalThis.fakeSupabase.auth); log.push(`signOut ${JSON.stringify(options ?? null)}`); return signOutReply; },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
globalThis.window = { addEventListener() {} };
globalThis.addEventListener = () => {};
Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) } });
const device = (name = "https://fcm.googleapis.com/fcm/send/this-device") => ({ endpoint: name, unsubscribe: async () => { log.push("browser unsubscribed"); sub = null; return true; } });

const { pushGone, startPwa } = await import("../src/live/pwa.js");
startPwa();
const { signOut } = globalThis.fakeSupabase.auth;
const reset = () => { log = []; rpc = async () => ({ error: null }); sub = device(); };

test("a sign-out removes the device's row while the session is alive, then stops the browser, then signs out", async () => {
  reset();
  await signOut();
  assert.deepEqual(log, ["rpc push_unsubscribe https://fcm.googleapis.com/fcm/send/this-device", "browser unsubscribed", "signOut null"]);
});

test("the sign-out still gets its options and gives back its answer", async () => {
  reset();
  assert.equal(await signOut({ scope: "local" }), signOutReply);
  assert.equal(log.at(-1), 'signOut {"scope":"local"}');
});

test("with no alerts on this device, it's a plain sign-out", async () => {
  log = []; sub = null;
  await signOut();
  assert.deepEqual(log, ["signOut null"]);
});

test("a failed removal still stops the browser and signs out", async () => {
  reset();
  rpc = async () => ({ error: { message: "offline" } });
  await signOut();
  assert.deepEqual(log.slice(1), ["browser unsubscribed", "signOut null"]);
});

test("a network that throws can't stop a sign-out", async () => {
  reset();
  rpc = async () => { throw new TypeError("Failed to fetch"); };
  await signOut();
  assert.equal(log.at(-1), "signOut null");
});

test("a network that hangs holds the sign-out for three seconds at most", async (t) => {
  reset();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  rpc = () => new Promise(() => {});
  const leaving = signOut();
  await new Promise((r) => setImmediate(r));
  assert.ok(!log.includes("signOut null"), "not yet");
  t.mock.timers.tick(3000);
  await leaving;
  assert.equal(log.at(-1), "signOut null");
});

test("after a session ended some other way, the browser still stops, and the reload waits for it", async () => {
  log = []; sub = device();
  let slowDone = false;
  sub.unsubscribe = async () => { await new Promise((r) => setTimeout(r, 30)); slowDone = true; return true; };
  await pushGone();
  assert.equal(slowDone, true);
  assert.deepEqual(log, [], "no call that needs a session");

  const gate = read("src/live/Gate.jsx");
  assert.match(gate, /pushGone\(\)\.then\(\(\) => location\.reload\(\)\)/);
  assert.equal(gate.match(/location\.reload\(\)/g).length, 1, "no other reload can get ahead of it");
});

test("the hook is in place before any button can be pressed, in every live page load", () => {
  const pwa = read("src/live/pwa.js");
  const start = pwa.slice(pwa.indexOf("export function startPwa()"));
  assert.ok(start.indexOf("stopAlertsBeforeSignOut();") < start.indexOf('import.meta.env.PROD'), "ahead of the production-only part");
  assert.match(read("src/main.jsx"), /if \(LIVE\) startPwa\(\);/);
});

/* ---------- The public name at sign-up ---------- */

test("the name from Google or Discord is never copied into the public name", () => {
  const gate = read("src/live/Gate.jsx");
  assert.doesNotMatch(gate, /name:[^\n]*private\?\.full_name \|\|/);
  assert.equal(gate.replace(/^\s*\/\/.*$/gm, "").match(/full_name/g).length, 1, "read once, only to spot a name that repeats it");
  assert.match(gate, /bareName\(name\) === bareName\(getState\(\)\.me\?\.private\?\.full_name\) \? ""/);
});

test("the field says it's public, can be left empty, and doesn't invite the browser's saved legal name", () => {
  const gate = read("src/live/Gate.jsx");
  assert.match(gate, /label="Public name"/);
  assert.match(gate, /Everyone on Marble sees this/);
  assert.doesNotMatch(gate, /autoComplete="name"/);
  assert.match(gate, /name: f\.name\.trim\(\) \|\| f\.handle/);
  assert.doesNotMatch(gate, /const valid = [^\n]*f\.name/);
});
