// Edge functions run for real under Node: the two retired forms stay retired, and deleting an account tells the truth.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ENV = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
const USER = "11111111-1111-4111-8111-111111111111";
const handlers = [];
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handlers.push(h); } };
const fn = (name) => new URL(`../supabase/functions/${name}/index.ts`, import.meta.url);
const load = async (name) => { handlers.length = 0; await import(fn(name).href); return handlers[0]; };
const RETIRED = ["partner-apply", "career-interest"];
const serves = {};
for (const name of [...RETIRED, "delete-account"]) serves[name] = await load(name); // one at a time, before any test starts

/* ---------- Retired forms ---------- */

for (const name of RETIRED) {
  test(`${name} in the repo is a bare 410, so deploying every function can't reopen it`, async () => {
    const src = readFileSync(fn(name), "utf8");
    assert.doesNotMatch(src, /^\s*import\b/m, "nothing to wire up: no form, no database, no email");
    assert.doesNotMatch(src, /handleForm|formDeps/);
    assert.match(src, /^Deno\.serve\(\(\) => new Response\(JSON\.stringify\(\{ error: "Gone" \}\), \{ status: 410, headers: \{ "Content-Type": "application\/json" \} \}\)\);$/m);
    for (const method of ["POST", "GET", "OPTIONS"]) {
      const res = await serves[name](new Request(`https://sb.test/functions/v1/${name}`, { method, ...(method === "POST" ? { body: "{}" } : {}) }));
      assert.equal(res.status, 410, method);
      assert.deepEqual(await res.json(), { error: "Gone" });
    }
  });
}

/* ---------- Deleting an account ---------- */

const jwt = () => `h.${Buffer.from(JSON.stringify({ amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }] })).toString("base64url")}.s`;
const ask = (serve) => serve(new Request("https://sb.test/functions/v1/delete-account", { method: "POST", headers: { Authorization: `Bearer ${jwt()}` } }));
let calls = [], fail = {};
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), method = init.method || "GET", step = u.includes("/object/list/") ? "list" : u.includes("/storage/") ? "files" : u.includes("/rest/v1/card_links") ? "cards" : u.includes("/rest/v1/connections") ? "connections" : u.includes("/admin/users/") ? "user" : "me";
  calls.push(step);
  if (fail[step]) return new Response("{}", { status: fail[step] });
  if (step === "me") return new Response(JSON.stringify({ id: USER, last_sign_in_at: new Date().toISOString() }), { status: 200 });
  if (step === "list") return new Response(JSON.stringify(u.endsWith("/screenshots") ? [{ id: "1", name: "a.png" }] : []), { status: 200 });
  if (step !== "cards") assert.notEqual(method, "GET");
  return new Response(step === "connections" ? null : step === "cards" ? "[{\"id\":\"AbCdEfGh12\"}]" : "{}", { status: step === "connections" ? 204 : 200 });
};
const serve = serves["delete-account"];
const failure = async (over) => {
  calls = []; fail = over;
  const res = await ask(serve);
  fail = {};
  return { status: res.status, error: (await res.json()).error, calls };
};

test("a good deletion removes the files, then the connections, then the user", async () => {
  calls = [];
  const res = await ask(serve);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: true });
  assert.deepEqual(calls.filter((c) => c !== "list" && c !== "me"), ["files", "cards", "files", "connections", "user"]);
});

test("a connections delete that fails stops there: the saved key is never orphaned", async () => {
  const r = await failure({ connections: 500 });
  assert.equal(r.status, 502);
  assert.ok(!r.calls.includes("user"), "the user stays, so trying again can finish the job");
});

test("the failure message is true at every step, including after the files have gone", async () => {
  for (const step of ["list", "files", "connections", "user"]) {
    const r = await failure({ [step]: 500 });
    assert.equal(r.status, 502, step);
    assert.doesNotMatch(r.error, /nothing was removed/i, step);
    assert.match(r.error, /may already be gone/, step);
    assert.match(r.error, /Try again, or email support@example\.com\./, step);
  }
});
