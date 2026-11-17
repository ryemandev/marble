// The service worker, run for real: a stored /desk/ keeps the security headers of the response it came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://trademarble.app";
const LOCKS = {
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Reporting-Endpoints": 'csp="https://sb.test/csp"',
  "Report-To": '{"group":"csp"}',
  "X-Robots-Tag": "noindex, nofollow",
};
const HTML = "<!doctype html><title>Marble</title><script type=module src=/assets/a.js></script>";

function worker() {
  const on = {}, stores = new Map();
  const box = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name), key = (k) => (typeof k === "string" ? k : k.url);
    return { put: async (k, v) => { m.set(key(k), v); }, match: async (k) => m.get(key(k))?.clone(), keys: async () => [...m.keys()].map((url) => ({ url })), delete: async (k) => m.delete(key(k)) };
  };
  const caches = { open: async (n) => box(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n) };
  const self = { addEventListener: (t, f) => { on[t] = f; }, skipWaiting() {}, clients: { claim() {} }, location: new URL(`${ORIGIN}/sw.js`) };
  const w = { net: null };
  const quick = (f, _ms, ...a) => setTimeout(f, 0, ...a); // the four-second wait, without the wait
  new Function("self", "caches", "fetch", "setTimeout", SOURCE)(self, caches, (...a) => w.net(...a), quick);
  w.navigate = async (path = "/desk/", { settle = true } = {}) => {
    let reply, kept = Promise.resolve();
    on.fetch({ request: { method: "GET", url: `${ORIGIN}${path}`, mode: "navigate" }, respondWith: (p) => { reply = p; }, waitUntil: (p) => { kept = p; } });
    const res = await reply;
    if (settle) await kept;
    return res;
  };
  w.page = () => caches.open("marble-page").then((c) => c.match("/desk/"));
  return w;
}
function fromNetwork(extra = {}, status = 200) {
  const res = new Response(HTML, { status, headers: { "Content-Type": "text/html", "Content-Encoding": "br", ETag: '"abc"', "Set-Cookie": "a=b", ...LOCKS, ...extra } });
  Object.defineProperty(res, "url", { value: `${ORIGIN}/desk/` });
  return res;
}

test("the stored page keeps every security header from the network", async () => {
  const w = worker();
  w.net = async () => fromNetwork();
  await w.navigate();
  const kept = await w.page();
  for (const [name, value] of Object.entries(LOCKS)) assert.equal(kept.headers.get(name), value, name);
  assert.equal(kept.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(await kept.text(), HTML);
});

test("offline, the page still opens, and as locked down as ever", async () => {
  const w = worker();
  w.net = async () => fromNetwork();
  await w.navigate();
  w.net = async () => { throw new TypeError("Failed to fetch"); };
  const res = await w.navigate();
  assert.equal(res.status, 200);
  assert.equal(await res.clone().text(), HTML);
  for (const [name, value] of Object.entries(LOCKS)) assert.equal(res.headers.get(name), value, name);
});

test("on a slow network, the stored page comes with the same headers", async () => {
  const w = worker();
  w.net = async () => fromNetwork();
  await w.navigate();
  w.net = () => new Promise(() => {}); // never answers
  const res = await w.navigate("/desk/", { settle: false });
  assert.equal(await res.clone().text(), HTML);
  for (const [name, value] of Object.entries(LOCKS)) assert.equal(res.headers.get(name), value, name);
});

test("a Report-Only policy goes with the page too", async () => {
  const w = worker();
  const res = fromNetwork({ "Content-Security-Policy-Report-Only": "default-src 'self'" });
  res.headers.delete("Content-Security-Policy");
  w.net = async () => res;
  await w.navigate();
  const kept = await w.page();
  assert.equal(kept.headers.get("Content-Security-Policy-Report-Only"), "default-src 'self'");
  assert.equal(kept.headers.get("Content-Security-Policy"), null);
});

test("only the listed headers are copied: the stored body is no longer compressed, and cookies never stay", async () => {
  const w = worker();
  w.net = async () => fromNetwork();
  await w.navigate();
  const kept = await w.page();
  for (const name of ["Content-Encoding", "ETag", "Set-Cookie"]) assert.equal(kept.headers.get(name), null, name);
});

test("a failed page is never stored", async () => {
  const w = worker();
  w.net = async () => fromNetwork({}, 500);
  await w.navigate();
  assert.equal(await w.page(), undefined);
});
