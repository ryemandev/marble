import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { MAX_SENDS, VIEW_IDS, createGate, crashOf, deviceOf, fingerprintOf, frameOf as appFrame, framesOf, isNoise, messageOf, viewOf } from "../src/live/crash-alerts.js";
import { MAX_BODY, MAX_LISTED, digestMail, frameOf, handleCrashReport, html, readCrash, stackOf } from "../supabase/functions/_shared/crash-report.js";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./supabase" && context.parentURL?.endsWith("/src/live/bugs.js")) {
      return { url: `data:text/javascript,${encodeURIComponent("export const supabase = {};")}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { clean } = await import("../src/live/bugs.js");

const SITE = "https://trademarble.app";
const ORIGINS = [SITE, "https://www.trademarble.app"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXN0dWZm";
// The same crash, as each browser writes it
const CHROME = [
  "TypeError: Cannot read properties of undefined (reading 'pnl')",
  `    at Ui (${SITE}/desk/assets/index-B2x9.js?v=3#top:41:2210)`,
  `    at ${SITE}/desk/assets/index-B2x9.js:41:9000`,
  "    at async Promise.all (index 0)",
  `    at Object.render (${SITE}/desk/assets/Journal-AbC.js:2:30)`,
  `    at new Store (${SITE}/desk/assets/index-B2x9.js:7:1)`,
  `    at a (${SITE}/desk/assets/index-B2x9.js:8:1)`,
  `    at b (${SITE}/desk/assets/index-B2x9.js:9:1)`,
  `    at c (${SITE}/desk/assets/index-B2x9.js:10:1)`,
].join("\n");
const FIREFOX = `Ui@${SITE}/desk/assets/index-B2x9.js?v=3:41:2210\n@${SITE}/desk/assets/index-B2x9.js:41:9000\n`;
const SAFARI = `Ui@${SITE}/desk/assets/index-B2x9.js:41:2210\nglobal code@${SITE}/desk/:1:1\n[native code]`;

/* ---------- The app's side ---------- */

test("a stack line becomes function, file path and line: never the origin, query or hash", () => {
  assert.deepEqual(framesOf(CHROME).slice(0, 4), [
    "Ui /desk/assets/index-B2x9.js:41:2210", "/desk/assets/index-B2x9.js:41:9000", "Object.render /desk/assets/Journal-AbC.js:2:30", "new Store /desk/assets/index-B2x9.js:7:1",
  ]);
  assert.deepEqual(framesOf(FIREFOX), ["Ui /desk/assets/index-B2x9.js:41:2210", "/desk/assets/index-B2x9.js:41:9000"]);
  assert.deepEqual(framesOf(SAFARI), ["Ui /desk/assets/index-B2x9.js:41:2210", "global code /desk/:1:1"]);
  for (const l of ["TypeError: x (y)", "    at async Promise.all (index 0)", "[native code]", "", null]) assert.equal(appFrame(l), null, String(l));
  // Another scheme is kept as the scheme only
  assert.equal(appFrame("at chrome-extension://abcdef/content.js?id=9:1:2"), "chrome-extension::1:2");
  assert.ok(!framesOf(CHROME).join("\n").includes("trademarble.app") && !framesOf(CHROME).join("\n").includes("?v="));
});

test("the top six places only, and the app's reading and the function's agree (and trimming twice changes nothing)", () => {
  assert.equal(framesOf(CHROME).length, 6);
  for (const line of [...CHROME.split("\n"), ...FIREFOX.split("\n"), ...SAFARI.split("\n"), "at x (http://localhost:5173/src/App.jsx?t=12:10:5)", "fn /a.js:1:2", "async  run\u202e /b.js:3:4"]) {
    assert.equal(frameOf(line), appFrame(line), line);
    const once = appFrame(line);
    if (once) assert.equal(appFrame(once), once, `idempotent: ${line}`);
  }
  assert.equal(stackOf(CHROME), framesOf(CHROME).join("\n"));
});

test("a crash as it's sent: emails and tokens blanked, capped, the screen only if it's one of the app's", () => {
  const err = Object.assign(new TypeError(`Couldn't load trader@example.com with ${JWT}\n\u0000 ${"long words ".repeat(40)}`), { stack: CHROME });
  const c = crashOf("view", err, { hash: "#journal", path: "/desk/", width: 390, build: "2026-10-29 14:05" }, clean);
  assert.equal(c.kind, "view");
  assert.ok(c.message.startsWith("TypeError: Couldn't load [email] with [token] long words"), c.message);
  assert.equal(c.message.length, 300);
  assert.equal(c.stack.split("\n").length, 6);
  assert.ok(c.stack.length <= 800);
  assert.deepEqual({ view: c.view, path: c.path, build: c.build, device: c.device }, { view: "journal", path: "/desk/", build: "2026-10-29 14:05", device: "phone" });
  assert.ok(!JSON.stringify(c).includes("example.com") && !JSON.stringify(c).includes(JWT));
  assert.deepEqual(Object.keys(c).sort(), ["build", "device", "kind", "message", "path", "stack", "view"]);
  assert.equal(crashOf("fatal", "boom", { hash: "", path: "/desk/?ref=1#x", width: 1440 }, clean).kind, "window");
  assert.equal(crashOf("promise", "boom", { hash: "", path: "/desk/?ref=1#x", width: 1440 }, clean).path, "/desk/");
  assert.equal(crashOf("promise", null, { hash: "" }, clean).message, "(no message)");
  // The screen: one of App.jsx's VIEWS, or nothing
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const views = [.../const VIEWS = \{([^}]*)\}/.exec(app)[1].matchAll(/(\w+):/g)].map((m) => m[1]);
  assert.deepEqual([...VIEW_IDS].sort(), views.sort());
  assert.equal(viewOf("#analytics"), "analytics");
  for (const h of ["#constructor", "#__proto__", "#journal?x=1", "#settings", "", null]) assert.equal(viewOf(h), null, String(h));
  assert.deepEqual([390, 640, 641, 1100, 1101, 2560, 0, NaN].map(deviceOf), ["phone", "phone", "tablet", "tablet", "desktop", "desktop", null, null]);
  assert.equal(messageOf({ note: "my trade notes", email: "a@b.co" }), "Unhandled object");
  assert.equal(messageOf(new RangeError("too far")), "RangeError: too far");
  assert.equal(messageOf("Uncaught boom"), "boom");
});

test("noise is never sent: cross-origin scripts, ResizeObserver, dropped or cancelled requests, extensions", () => {
  const own = `    at Ui (${SITE}/desk/assets/index.js:1:2)`;
  for (const n of [
    { message: "Script error." }, { message: "Uncaught Script error" },
    { message: "ResizeObserver loop completed with undelivered notifications." }, { message: "ResizeObserver loop limit exceeded" },
    { message: "TypeError: Failed to fetch", stack: own }, { message: "Load failed" }, { message: "NetworkError when attempting to fetch resource." },
    { message: "The network connection was lost." }, { message: "FunctionsFetchError: Failed to send a request to the Edge Function" },
    { message: "AbortError: signal is aborted without reason" }, { message: "The operation was aborted.", name: "AbortError" }, { message: "x", name: "AbortError" },
    { message: "TypeError: x", filename: "chrome-extension://abc/content.js" },
    { message: "TypeError: x", stack: "TypeError: x\n    at f (moz-extension://abc/inject.js:1:2)\n" + own },
    { message: "TypeError: x", stack: "f@https://accounts.google.com/gsi/client:1:2" },
    { message: "TypeError: x", stack: "at f (https://trademarble.app.evil.example/x.js:1:2)" },
  ]) assert.equal(isNoise(n, SITE), true, JSON.stringify(n));
  for (const n of [
    { message: "TypeError: x is undefined", stack: CHROME }, { message: "x", filename: `${SITE}/desk/assets/index.js` }, { message: "boom" },
    { message: "Script error.", stack: own }, // a real stack: not the cross-origin kind
    { message: "TypeError: Failed to fetch dynamically imported module: https://trademarble.app/desk/assets/Study-1.js", stack: own }, // an old tab after a deploy
  ]) assert.equal(isNoise(n, SITE), false, JSON.stringify(n));
});

test("one send per distinct crash and five in all per page load", () => {
  const gate = createGate();
  const c = { kind: "window", message: "boom", stack: "a /x.js:1:2\nb /x.js:3:4" };
  assert.equal(gate(fingerprintOf(c)), true);
  assert.equal(gate(fingerprintOf({ ...c, stack: "a /x.js:1:2\nsomewhere else /y.js:9:9" })), false, "same message, same first place: the same crash");
  assert.equal(gate(fingerprintOf({ ...c, kind: "promise" })), true);
  for (const m of ["two", "three", "four"]) assert.equal(gate(fingerprintOf({ ...c, message: m })), true);
  assert.equal(MAX_SENDS, 5);
  assert.equal(gate(fingerprintOf({ ...c, message: "six" })), false);
});

/* ---------- The function ---------- */

test("the function trims everything again: never trusts what the browser sent", () => {
  const sent = crashOf("view", Object.assign(new Error("boom"), { stack: CHROME }), { hash: "#journal", path: "/desk/", width: 1440, build: "2026-10-29 14:05" }, clean);
  assert.deepEqual(readCrash(JSON.stringify(sent), UA), { ...sent, browser: "Chrome 131" }, "the app's own report passes as it is");
  const r = readCrash(JSON.stringify({
    kind: "promise", message: `\u202eLeaked trader@example.com ${JWT}\n${"and more ".repeat(60)}`, stack: `${CHROME}\n${CHROME}\nf@https://x.example/p?q=secret#h:1:2`,
    view: "../etc", path: "/desk/?token=abc#access_token=xyz", build: "<script>", device: "watch", extra: "ignored", ip: "203.0.113.9",
  }), UA);
  assert.ok(r.message.startsWith("Leaked [email] [token] and more"), r.message);
  assert.equal(r.message.length, 300);
  assert.equal(r.stack.split("\n").length, 6);
  assert.ok(!r.stack.includes("secret") && !r.stack.includes("trademarble.app"));
  assert.deepEqual({ view: r.view, path: r.path, build: r.build, device: r.device }, { view: null, path: "/desk/", build: null, device: null });
  assert.deepEqual(Object.keys(r).sort(), ["browser", "build", "device", "kind", "message", "path", "stack", "view"]);
  assert.ok(!JSON.stringify(r).includes("Windows NT"), "the browser family only, never the user agent");
  for (const path of ["https://evil.example/x", `/r/${JWT}`, "/u/trader@example.com", "desk", "/a b"]) {
    assert.equal(readCrash(JSON.stringify({ kind: "app", message: "x", path }), UA).path, null, path);
  }
  for (const raw of ["not json", "null", "1", '"x"', "[]", JSON.stringify([{ kind: "app" }]), "{}", JSON.stringify({ kind: "fatal", message: "x" }), JSON.stringify({ kind: ["app"] })]) {
    assert.equal(readCrash(raw, UA), null, raw);
  }
  assert.equal(readCrash(JSON.stringify({ kind: "app" }), "").message, "(no message)");
  assert.equal(readCrash(JSON.stringify({ kind: "app" }), "").browser, null);
});

const NOW = Date.parse("2026-10-30T08:00:00Z");
const SECRET = "a".repeat(64);
const UID = "11111111-1111-4111-8111-111111111111";
const ANON = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlLWFub24";
const GROUP = {
  fingerprint: "0123456789abcdef", kind: "view", message: "TypeError: Cannot read properties of undefined (reading 'pnl')", times: 3, users: 2,
  views: ["journal"], builds: ["2026-10-29 14:05"], browsers: ["Chrome 131", "Safari 18"], devices: ["phone"],
  first_seen: "2026-10-30T06:00:00Z", last_seen: "2026-10-30T07:58:00Z", stack: "Ui /desk/assets/index-B2x9.js:41:2210\n/desk/assets/index-B2x9.js:41:9000",
};
function deps(o = {}) {
  const d = { saved: [], mails: [], logs: [], checked: [], digests: 0 };
  return Object.assign(d, {
    origins: ORIGINS, anonKey: ANON, resendKey: "re_test", now: () => NOW,
    userOf: async (t) => { d.checked.push(t); return t === JWT ? UID : null; },
    save: async (sender, user, report) => { d.saved.push({ sender, user, report }); return 1; },
    cronOk: async (s) => s === SECRET,
    digest: async () => { d.digests++; return { owners: ["owner@marble.test"], crashes: [] }; },
    sendMail: async (m) => { d.mails.push(m); },
    log: (l) => d.logs.push(l),
  }, o);
}
const body = JSON.stringify({ kind: "window", message: "boom", stack: CHROME, view: "journal", path: "/desk/", build: "dev", device: "desktop" });
const req = (text, { method = "POST", origin = SITE, auth, cron, length } = {}) => new Request("https://x.supabase.co/functions/v1/crash-report", {
  method,
  headers: {
    "Content-Type": "application/json", Origin: origin, "cf-connecting-ip": "203.0.113.9", "User-Agent": UA,
    ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(cron != null ? { "x-marble-cron": cron } : {}), ...(length ? { "Content-Length": String(length) } : {}),
  },
  body: method === "POST" ? text : undefined,
});

test("the function: 204 with nothing in it, the trader checked with Supabase Auth, otherwise the IP as the sender", async () => {
  const d = deps();
  let r = await handleCrashReport(req(body, { auth: "sb_publishable_abc" }), d);
  assert.equal(r.status, 204);
  assert.equal(await r.text(), "");
  r = await handleCrashReport(req(body, { auth: ANON }), d);
  assert.equal(d.checked.length, 0);
  assert.deepEqual(d.saved.map((s) => [s.sender, s.user]), [["203.0.113.9", null], ["203.0.113.9", null]]);
  assert.equal(d.saved[0].report.browser, "Chrome 131");
  r = await handleCrashReport(req(body, { auth: JWT }), d);
  assert.equal(r.status, 204);
  assert.deepEqual(d.checked, [JWT]);
  assert.deepEqual([d.saved[2].sender, d.saved[2].user], [UID, UID]);
  for (const userOf of [async () => null, async () => { throw new Error("down"); }, async () => "not-an-id"]) {
    const e = deps({ userOf });
    assert.equal((await handleCrashReport(req(body, { auth: "eyJa.eyJb.c2ln" }), e)).status, 204);
    assert.deepEqual([e.saved[0].sender, e.saved[0].user], ["203.0.113.9", null]);
  }
  const e = deps({ save: async () => { throw Object.assign(new Error("x"), { status: 500 }); } });
  for (const t of ["garbage", "[]", JSON.stringify({ kind: "nope" })]) assert.equal((await handleCrashReport(req(t), d)).status, 204);
  assert.equal(d.saved.length, 3);
  assert.equal((await handleCrashReport(req(body, { auth: JWT }), e)).status, 204);
  assert.equal(e.logs.length, 1);
  assert.ok(!e.logs[0].includes("203.0.113.9") && !e.logs[0].includes(JWT));
});

test("the function: 413 too big, 405 other methods, CORS for the site's own pages only", async () => {
  const d = deps();
  assert.equal((await handleCrashReport(req(JSON.stringify({ kind: "app", message: "x".repeat(MAX_BODY) })), d)).status, 413);
  assert.equal((await handleCrashReport(req("{}", { length: MAX_BODY + 1 }), d)).status, 413);
  assert.equal(d.saved.length, 0);
  assert.equal((await handleCrashReport(req(null, { method: "GET" }), d)).status, 405);
  const pre = await handleCrashReport(req(null, { method: "OPTIONS" }), d);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), SITE);
  assert.match(pre.headers.get("access-control-allow-headers"), /authorization/);
  assert.match(pre.headers.get("access-control-allow-headers"), /apikey/);
  const evil = await handleCrashReport(req(null, { method: "OPTIONS", origin: "https://evil.example" }), d);
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
});

test("the cron path: refused without the right secret; nothing to report means no email", async () => {
  const d = deps({ cronOk: async (s) => { d.checked.push(s); return s === SECRET; } });
  assert.equal((await handleCrashReport(req(JSON.stringify({ digest: true })), d)).status, 204);
  for (const cron of ["", "short", "b".repeat(64)]) {
    const r = await handleCrashReport(req(JSON.stringify({ digest: true }), { cron }), d);
    assert.equal(r.status, 401, cron);
  }
  assert.deepEqual(d.checked, ["b".repeat(64)], "only a 64-character secret is even asked about");
  assert.equal(d.digests, 0);
  const r = await handleCrashReport(req(JSON.stringify({ digest: true }), { cron: SECRET }), d);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, crashes: 0, sent: 0 });
  assert.equal(d.mails.length, 0);
});

test("the cron path: dry shows the email, no Resend key sends nothing, otherwise one email a day to the owner", async () => {
  const withCrashes = { digest: async () => ({ owners: ["owner@marble.test"], crashes: [GROUP] }) };
  let d = deps(withCrashes);
  let r = await handleCrashReport(req(JSON.stringify({ digest: true, dry: true }), { cron: SECRET }), d);
  const dry = await r.json();
  assert.equal(dry.dry, true);
  assert.equal(dry.to, 1);
  assert.match(dry.text, /reading 'pnl'/);
  assert.equal(d.mails.length, 0);
  d = deps({ ...withCrashes, resendKey: "" });
  r = await handleCrashReport(req(JSON.stringify({ digest: true }), { cron: SECRET }), d);
  assert.equal((await r.json()).sent, 0);
  assert.equal(d.mails.length, 0);
  assert.match(d.logs[0], /RESEND_API_KEY/);
  d = deps(withCrashes);
  r = await handleCrashReport(req(JSON.stringify({ digest: true }), { cron: SECRET }), d);
  assert.equal((await r.json()).sent, 1);
  assert.equal(d.mails.length, 1);
  assert.deepEqual(d.mails[0].to, ["owner@marble.test"]);
  assert.equal(d.mails[0].key, "marble-crash-digest-2026-10-30");
  assert.equal(d.mails[0].html, html(d.mails[0].text));
  d = deps({ digest: async () => { throw new Error("db"); } });
  assert.equal((await handleCrashReport(req("{}", { cron: SECRET }), d)).status, 500);
});

test("the daily email: plain words, nothing personal, no links, and none at all when nothing broke", () => {
  assert.equal(digestMail([], NOW), null);
  assert.equal(digestMail(null, NOW), null);
  assert.equal(digestMail([{ ...GROUP, times: 0 }], NOW), null);
  const m = digestMail([GROUP, { ...GROUP, fingerprint: "f".repeat(16), kind: "promise", message: "<script>alert(1)</script> https://evil.example", times: 1, users: 0, first_seen: "2026-10-20T10:00:00Z", views: [], stack: null }], NOW);
  assert.equal(m.subject, "Marble crashed 4 times in the last day");
  assert.equal(m.crashes, 2);
  assert.match(m.text, /^Marble crashed 4 times in the 24 hours to 30 Oct 08:00 UTC: 2 different crashes\./);
  assert.match(m.text, /1\. TypeError: Cannot read properties of undefined \(reading 'pnl'\)\n3 times, 2 signed-in traders\. A screen didn't load\. New\./);
  assert.match(m.text, /Screen: journal · build 2026-10-29 14:05 · Chrome 131, Safari 18 · phone/);
  assert.match(m.text, /\n {2}Ui \/desk\/assets\/index-B2x9\.js:41:2210\n/);
  assert.match(m.text, /2\. <script>alert\(1\)<\/script> https:\/\/evil\.example\n1 time\. A promise nothing caught\. First seen 20 Oct 10:00 UTC\./);
  assert.ok(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(m.text), "no email address in it");
  const h = html(m.text);
  assert.ok(h.includes("&lt;script&gt;") && !h.includes("<script>") && !h.includes("<a "), "escaped, and no links");
  const many = digestMail(Array.from({ length: MAX_LISTED + 5 }, (_, i) => ({ ...GROUP, fingerprint: String(i), message: `crash ${i}`, times: 1 })), NOW);
  assert.match(many.text, /\n\n20\. crash 19\n/);
  assert.ok(!many.text.includes("21. crash 20"));
  assert.match(many.text, /And 5 more crashes, in the table\./);
});

/* ---------- The function's code and the migration ---------- */

test("the function stays small: one import, fetch to Supabase's own APIs, no npm client", () => {
  const index = readFileSync(new URL("../supabase/functions/crash-report/index.ts", import.meta.url), "utf8");
  const shared = readFileSync(new URL("../supabase/functions/_shared/crash-report.js", import.meta.url), "utf8");
  assert.deepEqual([...index.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ["../_shared/crash-report.js"]);
  assert.deepEqual([...shared.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), []);
  assert.ok(Buffer.byteLength(index + shared) < 14000, "the whole function, comments and all, under 14 KB");
  assert.ok(!/npm:|esm\.sh|supabase-js/.test(index + shared));
  assert.match(index, /Marble <support@example\.com>/);
  assert.match(index, /"Idempotency-Key": m\.key/);
});

const SQL = readFileSync(new URL("../supabase/migrations-pending/20261031170000_crash_reports.sql", import.meta.url), "utf8");
function fn(name) {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name}() is defined`);
  const body = SQL.indexOf("$$", start);
  return SQL.slice(start, SQL.indexOf("$$;", body + 2) + 3);
}
const FUNCTIONS = [...SQL.matchAll(/create (?:or replace )?function public\.([a-z_]+)\(/g)].map((m) => m[1]);
const TABLES = [...SQL.matchAll(/create table public\.([a-z_]+) \(/g)].map((m) => m[1]);

test("the migration: row security on with no policies, nothing for the browser roles, every function pinned and closed", () => {
  assert.match(SQL, /^-- Crash alerts, first-party\. NOT APPLIED\./);
  assert.match(SQL, /\nbegin;\n[\s\S]*\ncommit;\n$/);
  assert.deepEqual(TABLES, ["crash_reports", "crash_report_hits"]);
  for (const t of TABLES) {
    assert.match(SQL, new RegExp(`alter table public\\.${t} enable row level security;`), `${t}: row security`);
    assert.match(SQL, new RegExp(`revoke all on table public\\.${t} from anon, authenticated;`), `${t}: grants revoked`);
  }
  assert.ok(!/create policy/i.test(SQL), "no policies");
  assert.ok(!/grant [^;]* to (anon|authenticated|public)\b/i.test(SQL), "nothing granted to the browser roles");
  assert.deepEqual(FUNCTIONS, ["crash_clean", "crash_report_save", "crash_cron_ok", "crash_digest", "crash_reports_purge"]);
  for (const name of FUNCTIONS) {
    const def = fn(name);
    assert.match(def.slice(0, def.indexOf("$$")), /set search_path = ''/, `${name}: search_path`);
    assert.ok(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`).test(SQL), `${name}: revoked`);
  }
  for (const name of ["crash_report_save", "crash_cron_ok", "crash_digest", "crash_reports_purge"]) {
    assert.match(fn(name), /security definer/);
    assert.ok(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role;`).test(SQL), `${name}: the service role's`);
  }
});

test("the migration: nothing raw is kept, hashes with the Vault key, limits, retention and the two jobs", () => {
  const columns = (t) => [...SQL.slice(SQL.indexOf(`create table public.${t} (`), SQL.indexOf(`comment on table public.${t}`)).matchAll(/^ {2}([a-z_]+) /gm)].map((m) => m[1]);
  assert.deepEqual(columns("crash_reports"), ["id", "received_at", "kind", "message", "stack", "view", "path", "build", "device", "browser", "user_hash", "fingerprint"]);
  assert.deepEqual(columns("crash_report_hits"), ["id", "sender_hash", "at"]);
  for (const name of ["crash_pepper", "crash_digest_cron"]) {
    assert.match(SQL, new RegExp(`vault\\.create_secret\\(encode\\(extensions\\.gen_random_bytes\\(32\\), 'hex'\\), '${name}'`));
  }
  const save = fn("crash_report_save");
  assert.ok(save.includes("where s.name = 'crash_pepper'"));
  assert.ok(save.includes("encode(extensions.hmac('crash:sender:' || left(p_sender, 100), v_pepper, 'sha256'), 'hex')"));
  assert.ok(save.includes("encode(extensions.hmac('crash:user:' || p_user::text, v_pepper, 'sha256'), 'hex')"));
  assert.ok(save.includes("pg_advisory_xact_lock(hashtextextended('crash_report_save', 0))"));
  assert.ok(save.includes("v_mine_10m >= 10 or v_mine_day >= 50 or v_all_1h >= 300"));
  assert.ok(save.includes("public.crash_clean(p_report->>'message', 300)") && save.includes("limit 6") && save.includes(", 800)"));
  assert.ok(!/p_sender[^;]*\) values \(|values \([^;]*p_sender\b/.test(save.replace(/extensions\.hmac\([^)]*\)/g, "")), "the sender is only ever hashed");
  assert.ok(fn("crash_cron_ok").includes("where s.name = 'crash_digest_cron'"));
  assert.ok(fn("crash_digest").includes("from public.admins a join public.staff s on s.user_id = a.user_id join auth.users u on u.id = a.user_id"));
  assert.ok(fn("crash_reports_purge").includes("interval '30 days'") && fn("crash_reports_purge").includes("interval '1 day'"));
  assert.match(SQL, /cron\.schedule\('crash-reports-purge', '\d+ 3 \* \* \*', 'select public\.crash_reports_purge\(\)'\)/);
  const job = SQL.slice(SQL.indexOf("select cron.schedule(\n  'crash-digest'"));
  assert.match(job, /^select cron\.schedule\(\n {2}'crash-digest',\n {2}'0 8 \* \* \*'/);
  assert.ok(job.includes("url := 'https://your-project-ref.supabase.co/functions/v1/crash-report'"));
  assert.ok(job.includes("'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'crash_digest_cron' limit 1)"));
  assert.ok(job.includes(`body := '{"digest": true}'::jsonb`));
});
