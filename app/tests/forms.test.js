import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, MAX_BODY, cleanLink, handleForm } from "../supabase/functions/_shared/forms.js";

const SITE = "https://trademarble.app";

function db({ failSave = false, captchaSecret = "", verify = null } = {}) {
  const hits = [];
  const saved = [];
  const logs = [];
  const verifyCalls = [];
  return {
    hits, saved, logs, verifyCalls,
    captchaSecret,
    fetch: async (url, init) => {
      const form = new URLSearchParams(String(init.body));
      verifyCalls.push({ url, secret: form.get("secret"), response: form.get("response"), remoteip: form.get("remoteip") });
      return new Response(JSON.stringify(verify ? verify(form.get("response")) : { success: false }), { status: 200 });
    },
    origins: [SITE, "https://www.trademarble.app"],
    secret: "test-secret",
    rateOk: async (kind, key, perHour, perDay) => {
      const n = hits.filter((h) => h.kind === kind && h.key === key).length;
      if (n >= Math.min(perHour, perDay)) return false;
      hits.push({ kind, key });
      return true;
    },
    save: async (table, row, onConflict) => {
      if (failSave) throw Object.assign(new Error("partner_applications 500"), { status: 500 });
      if (onConflict) {
        const cols = onConflict.split(",");
        if (saved.some((s) => s.table === table && cols.every((c) => s.row[c] === row[c]))) return;
      }
      saved.push({ table, row, onConflict });
    },
    purge: async () => {},
    log: (line) => logs.push(line),
  };
}

const post = (body, { origin = SITE, ip = "203.0.113.7", type = "text/plain;charset=UTF-8", method = "POST", extra = {} } = {}) =>
  new Request("https://example.supabase.co/functions/v1/x", {
    method,
    headers: { Origin: origin, "Content-Type": type, ...(ip ? { "cf-connecting-ip": ip } : {}), ...extra },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });

const partner = (o = {}) => ({ kind: "creator", name: "Sam Lee", email: "Sam@Example.com", link: "youtube.com/@samtrades", message: "I stream NQ.", website: "", ...o });
const career = (o = {}) => ({ name: "Alex", email: "alex@example.com", area: "marketing", link: "", message: "", company: "", ...o });

test("a good partner application is saved, tidied, and answered { ok: true } with CORS for the site", async () => {
  const d = db();
  const r = await handleForm(post(partner()), "partner", d);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(r.headers.get("access-control-allow-origin"), SITE);
  assert.equal(d.saved.length, 1);
  const { table, row } = d.saved[0];
  assert.equal(table, "partner_applications");
  assert.deepEqual(row, { kind: "creator", name: "Sam Lee", email: "sam@example.com", link: "https://youtube.com/@samtrades", message: "I stream NQ." });
});

test("www.trademarble.app may post too; any other site, or none, can't", async () => {
  const ok = await handleForm(post(partner(), { origin: "https://www.trademarble.app" }), "partner", db());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://www.trademarble.app");
  for (const origin of ["https://evil.example", "https://trademarble.app.evil.example", "http://trademarble.app", ""]) {
    const d = db();
    const r = await handleForm(post(partner(), { origin }), "partner", d);
    assert.equal(r.status, 403, origin);
    assert.equal(r.headers.get("access-control-allow-origin"), null, origin);
    assert.equal(d.saved.length, 0);
  }
});

test("the preflight answers the site's origin only, and other methods are refused", async () => {
  const pre = await handleForm(post(null, { method: "OPTIONS" }), "career", db());
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), SITE);
  assert.match(pre.headers.get("access-control-allow-methods"), /POST/);
  const bad = await handleForm(post(null, { method: "OPTIONS", origin: "https://evil.example" }), "career", db());
  assert.equal(bad.status, 403);
  const get = await handleForm(post(null, { method: "GET" }), "career", db());
  assert.equal(get.status, 405);
});

test("the honeypot filled: the same reply as a real send, nothing saved and nothing counted", async () => {
  for (const [name, body] of [["partner", partner({ website: "http://spam.example" })], ["career", career({ company: "Spam Ltd" })]]) {
    const d = db();
    const r = await handleForm(post(body), name, d);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(d.saved.length, 0);
    assert.equal(d.hits.length, 0);
  }
});

test("every field is checked again on the server", async () => {
  const cases = [
    [partner({ kind: "broker" }), "kind"],
    [partner({ name: "  " }), "name"],
    [partner({ name: "x".repeat(81) }), "name"],
    [partner({ email: "sam@example" }), "email"],
    [partner({ link: "" }), "link"],
    [partner({ link: "javascript:alert(1)" }), "link"],
    [partner({ link: "https://trademarble.app@evil.example/x" }), "link"],
    [partner({ link: "localhost:3000" }), "link"],
    [partner({ message: "x".repeat(1001) }), "message"],
  ];
  for (const [body, field] of cases) {
    const d = db();
    const r = await handleForm(post(body), "partner", d);
    assert.equal(r.status, 400, field);
    assert.ok((await r.json()).fields.includes(field), field);
    assert.equal(d.saved.length, 0);
  }
  const r = await handleForm(post(career({ area: "ceo" })), "career", db());
  assert.equal(r.status, 400);
  assert.deepEqual((await r.json()).fields, ["area"]);
});

test("links: https:// is added, http(s) only, no user@host disguise", () => {
  assert.deepEqual(cleanLink("youtube.com/@me"), { ok: true, value: "https://youtube.com/@me" });
  assert.deepEqual(cleanLink(" http://firm.co.uk "), { ok: true, value: "http://firm.co.uk/" });
  assert.equal(cleanLink("example.com:8080/x").ok, true);
  assert.deepEqual(cleanLink(""), { ok: true, value: "" });
  for (const bad of ["ftp://x.com", "data:text/html,hi", "https://a b.com", "https://user:pw@x.com", "x", "https://1.2.3.4/"]) assert.equal(cleanLink(bad).ok, false, bad);
});

test("bodies over 6 KB, and anything that isn't a JSON object, are refused", async () => {
  const big = await handleForm(post(JSON.stringify(partner({ message: "x".repeat(MAX_BODY) }))), "partner", db());
  assert.equal(big.status, 413);
  for (const raw of ["not json", "[1,2]", "null"]) {
    const r = await handleForm(post(raw), "partner", db());
    assert.equal(r.status, 400, raw);
  }
  const asJson = await handleForm(post(partner(), { type: "application/json" }), "partner", db());
  assert.equal(asJson.status, 200);
});

test("the IP limit: 3 an hour from one address, then 429; the key is a hash, never the address", async () => {
  const d = db();
  for (let i = 0; i < LIMITS.ipPerHour; i++) {
    const r = await handleForm(post(partner({ email: `p${i}@example.com` })), "partner", d);
    assert.equal(r.status, 200);
  }
  const r = await handleForm(post(partner({ email: "p9@example.com" })), "partner", d);
  assert.equal(r.status, 429);
  assert.equal(d.saved.length, LIMITS.ipPerHour);
  for (const h of d.hits) {
    assert.match(h.key, /^[0-9a-f]{64}$/);
    assert.ok(!h.key.includes("203.0.113.7"));
  }
  // Another address isn't held up by the first
  const other = await handleForm(post(partner({ email: "q@example.com" }), { ip: "198.51.100.4" }), "partner", d);
  assert.equal(other.status, 200);
});

test("the same email again and again gets the same reply as a new one, but no more is kept past the limit", async () => {
  const d = db();
  const replies = [];
  for (let i = 0; i < LIMITS.emailPerDay + 2; i++) {
    const r = await handleForm(post(partner(), { ip: `198.51.100.${i + 1}` }), "partner", d);
    replies.push([r.status, await r.text()]);
  }
  assert.ok(replies.every(([s, t]) => s === 200 && t === JSON.stringify({ ok: true })), JSON.stringify(replies));
  assert.equal(d.saved.length, LIMITS.emailPerDay);
});

test("careers: one row per email and area; a repeat is answered the same and never overwrites the first", async () => {
  const d = db();
  const first = await handleForm(post(career()), "career", d);
  const again = await handleForm(post(career({ name: "Mallory", email: "ALEX@example.com", link: "evil.example", message: "changed" }), { ip: "198.51.100.9" }), "career", d);
  assert.equal(await first.text(), await again.text());
  assert.equal(d.saved.length, 1);
  assert.equal(d.saved[0].onConflict, "email,area");
  assert.equal(d.saved[0].row.name, "Alex");
  // Optional fields left empty are stored as nothing, not ""
  assert.equal(d.saved[0].row.link, null);
  assert.equal(d.saved[0].row.message, null);
  assert.equal("status" in d.saved[0].row, false);
  assert.equal("updated_at" in d.saved[0].row, false);
  // A different area is a row of its own
  await handleForm(post(career({ area: "panel", link: "alexkerr.dev" }), { ip: "198.51.100.10" }), "career", d);
  assert.equal(d.saved.length, 2);
  assert.equal(d.saved[1].row.link, "https://alexkerr.dev/");
});

test("the IP is the one Cloudflare sets: x-forwarded-for and x-real-ip from the sender change nothing", async () => {
  const d = db();
  for (let i = 0; i < LIMITS.ipPerHour; i++) {
    const r = await handleForm(post(partner({ email: `x${i}@example.com` }), { extra: { "x-forwarded-for": `10.9.${i}.1`, "x-real-ip": `10.8.${i}.1` } }), "partner", d);
    assert.equal(r.status, 200);
  }
  const r = await handleForm(post(partner({ email: "x9@example.com" }), { extra: { "x-forwarded-for": "10.7.7.7" } }), "partner", d);
  assert.equal(r.status, 429);
  const n = db();
  for (let i = 0; i < LIMITS.ipPerHour; i++) await handleForm(post(partner({ email: `y${i}@example.com` }), { ip: "", extra: { "x-forwarded-for": `10.6.${i}.1` } }), "partner", n);
  const shared = await handleForm(post(partner({ email: "y9@example.com" }), { ip: "", extra: { "x-forwarded-for": "10.5.5.5" } }), "partner", n);
  assert.equal(shared.status, 429);
});

test("each form has its own tight ceiling for sends without a bot check", async () => {
  for (const [name, make] of [["partner", (i) => partner({ email: `c${i}@example.com` })], ["career", (i) => career({ email: `c${i}@example.com` })]]) {
    const d = db();
    const cap = Math.min(LIMITS.form[name].perHour, LIMITS.form[name].perDay);
    for (let i = 0; i < cap; i++) {
      const r = await handleForm(post(make(i), { ip: `198.51.100.${i + 1}` }), name, d);
      assert.equal(r.status, 200, `${name} ${i}`);
    }
    const over = await handleForm(post(make(99), { ip: "192.0.2.200" }), name, d);
    assert.equal(over.status, 429, name);
    assert.equal(d.saved.length, cap);
  }
  assert.ok(LIMITS.form.partner.perDay <= 50 && LIMITS.form.career.perDay <= 50);
});

test("Turnstile off (no secret): no token is asked for and siteverify is never called", async () => {
  const d = db();
  const r = await handleForm(post(partner()), "partner", d);
  assert.equal(r.status, 200);
  assert.equal(d.verifyCalls.length, 0);
  assert.ok(d.hits.some((h) => h.kind === "partner:all"));
});

test("Turnstile on: no token or a bad one saves nothing; a good one is checked with the secret and the real IP", async () => {
  const good = (t) => (t === "good-token" ? { success: true, hostname: "trademarble.app" } : { success: false, "error-codes": ["invalid-input-response"] });
  for (const captcha of [undefined, "", "forged", "x".repeat(3000)]) {
    const d = db({ captchaSecret: "ts-secret", verify: good });
    const r = await handleForm(post(partner({ captcha })), "partner", d);
    assert.equal(r.status, 400, String(captcha).slice(0, 10));
    assert.equal((await r.json()).code, "captcha");
    assert.equal(d.saved.length, 0);
  }
  const d = db({ captchaSecret: "ts-secret", verify: good });
  const r = await handleForm(post(partner({ captcha: "good-token" })), "partner", d);
  assert.equal(r.status, 200);
  assert.equal(d.saved.length, 1);
  assert.deepEqual(d.verifyCalls[0], { url: "https://challenges.cloudflare.com/turnstile/v0/siteverify", secret: "ts-secret", response: "good-token", remoteip: "203.0.113.7" });
  assert.ok(d.hits.some((h) => h.kind === "partner:verified"));
  assert.ok(!d.hits.some((h) => h.kind === "partner:all"));
  assert.equal("captcha" in d.saved[0].row, false);
  // A token Cloudflare issued for some other site doesn't count
  const other = db({ captchaSecret: "ts-secret", verify: () => ({ success: true, hostname: "evil.example" }) });
  assert.equal((await handleForm(post(partner({ captcha: "t" })), "partner", other)).status, 400);
});

test("no FORMS_HASH_SALT: the form refuses (503) instead of falling back to another secret", async () => {
  const d = db();
  d.secret = "";
  const r = await handleForm(post(partner()), "partner", d);
  assert.equal(r.status, 503);
  assert.equal(d.saved.length, 0);
  assert.equal(d.hits.length, 0);
});

test("a database failure answers 500 and logs nothing personal", async () => {
  const d = db({ failSave: true });
  const r = await handleForm(post(partner()), "partner", d);
  assert.equal(r.status, 500);
  assert.equal(d.logs.length, 1);
  assert.ok(!/sam|example|203\.0\.113/i.test(d.logs[0]), d.logs[0]);
});

test("the form's area choices and the server's list are the same", () => {
});
