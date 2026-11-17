import { test } from "node:test";
import assert from "node:assert/strict";
import { corsFor, corsHandler, withCors } from "../supabase/functions/_shared/cors.js";

const ORIGINS = ["http://localhost:5173", "https://trademarble.app", "https://www.trademarble.app"];
const req = (method, origin) => new Request("https://x.supabase.co/functions/v1/crash-report", { method, headers: origin ? { Origin: origin } : {} });

test("an allowed origin is echoed back; anything else gets no allow-origin, never *", () => {
  for (const o of ORIGINS) assert.equal(corsFor(o, ORIGINS)["Access-Control-Allow-Origin"], o);
  for (const o of ["https://evil.example", "https://trademarble.app.evil.example", "http://trademarble.app", "null", "", undefined]) {
    assert.equal(corsFor(o, ORIGINS)["Access-Control-Allow-Origin"], undefined, String(o));
  }
  assert.equal(corsFor("https://trademarble.app", ORIGINS).Vary, "Origin");
});

test("corsHandler: the preflight and every answer carry the caller's own origin only", async () => {
  const handler = corsHandler(async () => new Response(JSON.stringify({ ok: true }), { status: 201, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } }), ORIGINS);
  const pre = await handler(req("OPTIONS", "https://www.trademarble.app"));
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://www.trademarble.app");
  assert.match(pre.headers.get("access-control-allow-headers"), /authorization/);
  const evilPre = await handler(req("OPTIONS", "https://evil.example"));
  assert.equal(evilPre.headers.get("access-control-allow-origin"), null);
  // The handler's own "*" is replaced
  const ok = await handler(req("POST", "https://trademarble.app"));
  assert.equal(ok.status, 201);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://trademarble.app");
  assert.equal(ok.headers.get("content-type"), "application/json");
  assert.deepEqual(await ok.json(), { ok: true });
  const evil = await handler(req("POST", "https://evil.example"));
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  // withCors on its own
  const w = withCors(req("POST", "http://localhost:5173"), new Response("x", { headers: { "Access-Control-Allow-Origin": "*" } }), ORIGINS);
  assert.equal(w.headers.get("access-control-allow-origin"), "http://localhost:5173");
});
