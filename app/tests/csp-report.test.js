import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_BODY, MAX_REPORTS, browserOf, handleCspReport, readReports } from "../supabase/functions/_shared/csp-report.js";
import { clientIp, hmac } from "../supabase/functions/_shared/forms.js";

const SITE = "https://trademarble.app";
const ORIGINS = [SITE, "https://www.trademarble.app"];
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const legacy = (o = {}) => ({ "csp-report": {
  "document-uri": `${SITE}/desk/?ref=abc&token=secret#x`, referrer: "https://google.com/search?q=me",
  "violated-directive": "script-src-elem", "effective-directive": "script-src-elem", "original-policy": "default-src 'self'; ...",
  disposition: "report", "blocked-uri": "https://evil.example/path/x.js?id=123", "line-number": 12, "column-number": 40,
  "source-file": `${SITE}/assets/app-1.js?v=2`, "status-code": 200, "script-sample": "alert(document.cookie)".repeat(10), ...o,
} });
const batch = (n = 1, body = {}) => Array.from({ length: n }, (_, i) => ({
  type: "csp-violation", age: 10, url: `${SITE}/pricing`, user_agent: CHROME,
  body: { documentURL: `${SITE}/pricing?utm=${i}`, effectiveDirective: "img-src", blockedURL: "data", disposition: "report", statusCode: 200, lineNumber: i, sample: "", ...body },
}));

test("report-uri: one report, trimmed to what helps fix the policy", () => {
  const [r, ...rest] = readReports(JSON.stringify(legacy()), CHROME, ORIGINS);
  assert.equal(rest.length, 0);
  assert.deepEqual(r, {
    document_uri: `${SITE}/desk/`, violated_directive: "script-src-elem", effective_directive: "script-src-elem",
    blocked_uri: "https://evil.example", source_file: `${SITE}/assets/app-1.js`, line_number: 12, column_number: 40,
    disposition: "report", status_code: 200, sample: "alert(document.cookie)".repeat(10).slice(0, 80), browser: "Chrome 131",
  });
  assert.equal(r.sample.length, 80);
  assert.ok(!JSON.stringify(r).includes("secret") && !JSON.stringify(r).includes("google") && !JSON.stringify(r).includes("123"));
});

test("report-to: a batch, csp-violation only, at most 10 per request", () => {
  const rows = readReports(JSON.stringify([...batch(14), { type: "deprecation", body: { documentURL: `${SITE}/` } }]), "", ORIGINS);
  assert.equal(rows.length, MAX_REPORTS);
  assert.deepEqual(rows[0], {
    document_uri: `${SITE}/pricing`, violated_directive: null, effective_directive: "img-src", blocked_uri: "data",
    source_file: null, line_number: 0, column_number: null, disposition: "report", status_code: 200, sample: null, browser: "Chrome 131",
  });
});

test("only reports about Marble's own pages are kept; junk and odd values are dropped or cleaned", () => {
  assert.equal(readReports(JSON.stringify(legacy({ "document-uri": "https://evil.example/" })), CHROME, ORIGINS).length, 0);
  assert.equal(readReports(JSON.stringify(legacy({ "document-uri": "https://trademarble.app.evil.example/" })), CHROME, ORIGINS).length, 0);
  for (const raw of ["not json", "null", "[1,2]", "{}", JSON.stringify({ "csp-report": "x" })]) assert.deepEqual(readReports(raw, CHROME, ORIGINS), [], raw);
  const [r] = readReports(JSON.stringify(legacy({ "violated-directive": "script-src 'self'; drop table", "blocked-uri": "chrome-extension://abcdef/x.js", "line-number": -3, "status-code": 99999, disposition: "maybe", "script-sample": "\u202eevil\u0000" })), "", ORIGINS);
  assert.equal(r.violated_directive, "script-src");
  assert.equal(r.blocked_uri, "chrome-extension:");
  assert.equal(r.line_number, null);
  assert.equal(r.status_code, null);
  assert.equal(r.disposition, null);
  assert.equal(r.sample, "evil");
  assert.equal(r.browser, null);
  assert.equal(readReports(JSON.stringify(legacy({ "blocked-uri": "inline" })), "", ORIGINS)[0].blocked_uri, "inline");
});

test("browser families, never the whole user agent", () => {
  assert.equal(browserOf(CHROME), "Chrome 131");
  assert.equal(browserOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15"), "Safari 18");
  assert.equal(browserOf("Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0"), "Firefox 132");
  assert.equal(browserOf(`${CHROME} Edg/130.0.0.0`), "Edge 130");
  assert.equal(browserOf("curl/8.4"), "Other");
});

function deps({ secret = "salt" } = {}) {
  const saved = [], logs = [];
  return { saved, logs, origins: ORIGINS, secret, hmac, clientIp, save: async (key, reports) => { saved.push({ key, reports }); return reports.length; }, log: (l) => logs.push(l) };
}
const req = (body, { method = "POST", type = "application/csp-report", origin = SITE, ip = "203.0.113.9", length } = {}) => new Request("https://x.supabase.co/functions/v1/csp-report", {
  method, headers: { "Content-Type": type, Origin: origin, "cf-connecting-ip": ip, "User-Agent": CHROME, ...(length ? { "Content-Length": String(length) } : {}) },
  body: method === "POST" ? body : undefined,
});

test("the function: 204 for a report, the IP only as an HMAC, CORS for the site's preflight only", async () => {
  const d = deps();
  const r = await handleCspReport(req(JSON.stringify(legacy())), d);
  assert.equal(r.status, 204);
  assert.equal(d.saved.length, 1);
  assert.match(d.saved[0].key, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(d.saved).includes("203.0.113.9"));
  const pre = await handleCspReport(req(null, { method: "OPTIONS" }), d);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), SITE);
  const evil = await handleCspReport(req(null, { method: "OPTIONS", origin: "https://evil.example" }), d);
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  assert.equal((await handleCspReport(req(null, { method: "GET" }), d)).status, 405);
  // A Reporting API batch from the same page
  assert.equal((await handleCspReport(req(JSON.stringify(batch(3)), { type: "application/reports+json" }), d)).status, 204);
  assert.equal(d.saved[1].reports.length, 3);
});

test("the function: over 16 KB is refused (413) and nothing is saved; junk is answered 204 and not saved", async () => {
  const d = deps();
  const big = JSON.stringify(legacy({ "script-sample": "x".repeat(MAX_BODY) }));
  assert.equal((await handleCspReport(req(big), d)).status, 413);
  assert.equal((await handleCspReport(req("{}", { length: MAX_BODY + 1 }), d)).status, 413);
  assert.equal((await handleCspReport(req("garbage"), d)).status, 204);
  assert.equal(d.saved.length, 0);
});

test("the function: no FORMS_HASH_SALT means 503 and nothing kept (no fallback to another secret)", async () => {
  const d = deps({ secret: "" });
  assert.equal((await handleCspReport(req(JSON.stringify(legacy())), d)).status, 503);
  assert.equal(d.saved.length, 0);
  assert.equal(d.logs.length, 1);
});
