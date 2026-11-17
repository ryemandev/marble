// The security headers: runs the real block from scripts/build-web.mjs, without a build, and applies its rules the way
// Cloudflare's asset worker does: every matching rule in file order, and inside a rule, removals before additions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { VOICE_LIVE } from "../src/mode.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const build = read("scripts/build-web.mjs");
const START = "// ---------- Security headers", END = "// ---------- End of the security headers";
const block = build.slice(build.indexOf(START), build.indexOf(END));
const PAGES = [{ slug: "features" }, { slug: "faq" }, { slug: "pricing" }];
const HASHES = Array.from({ length: 8 }, (_, i) => `'sha256-${String(i).repeat(43)}='`);
const make = ({ voice = false, env = {} } = {}) => new Function("VOICE_LIVE", "PAGES", "inlineHashes", "process", `${block}\nreturn headersFile;`)(voice, PAGES, HASHES, { env });

function parse(text) {
  const rules = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("/")) rules.push({ path: line, set: [], unset: [] });
    else if (line.startsWith("! ")) rules.at(-1).unset.push(line.slice(2));
    else { const at = line.indexOf(":"); rules.at(-1).set.push([line.slice(0, at), line.slice(at + 1).trim()]); }
  }
  return rules;
}
const matches = (rule, path) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(path);
function send(text, path) {
  const h = new Headers(), seen = new Set();
  for (const r of parse(text)) {
    if (!matches(r.path, path)) continue;
    for (const k of r.unset) h.delete(k);
    for (const [k, v] of r.set) { if (seen.has(k.toLowerCase())) h.append(k, v); else h.set(k, v); seen.add(k.toLowerCase()); }
  }
  return h;
}
const CSP = "content-security-policy";
const framing = (h) => h.get(CSP).match(/frame-ancestors [^;,]+/g);
const policies = (h) => h.get(CSP).match(/default-src/g).length;

test("the block is whole, and the build writes what the block makes", () => {
  assert.ok(build.indexOf(START) > 0 && build.indexOf(END) > build.indexOf(START));
  assert.match(block, /^const headersFile = \[/m);
  assert.doesNotMatch(block, /writeFileSync|readFileSync|execSync/);
  assert.ok(build.includes('writeFileSync(join(out, "_headers"), headersFile);'));
});

test("nothing can frame the app or the admin area, and they lose no other rule", () => {
  const all = make();
  const site = send(all, "/unknown").get(CSP);
  for (const path of ["/desk/", "/desk/index.html", "/admin/"]) {
    const h = send(all, path);
    assert.equal(policies(h), 1, `${path} has one policy, not two joined`);
    assert.deepEqual(framing(h), ["frame-ancestors 'none'"], path);
    assert.equal(h.get(CSP), site.replace("frame-ancestors 'self'", "frame-ancestors 'none'"), path);
    assert.equal(h.get("x-frame-options"), "DENY");
    assert.equal(h.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(h.get("x-content-type-options"), "nosniff");
  }
});

test("the website's own demo frame keeps working", () => {
  const shoulder = read("src/site/live/Shoulder.jsx");
  assert.match(shoulder, /const SRC = `\$\{import\.meta\.env\.BASE_URL\}demo\.html#dashboard`;/);
  assert.match(shoulder, /<iframe ref=\{frame\} className="lo-frame" src=\{SRC\}/);
  const h = send(make(), "/demo.html");
  assert.deepEqual(framing(h), ["frame-ancestors 'self'"]);
  assert.equal(h.get("x-frame-options"), "SAMEORIGIN");
});

test("nothing that frames a page points at the app or the admin area", () => {
  // The device preview is dev-only (the build deletes it) and frames the page at /
  assert.match(read("public/devices.html"), /\.src = `\/#\$\{sel\.value\}`/);
  assert.match(build, /for \(const f of \["devices\.html"\]\) if \(existsSync\(join\(out, f\)\)\) rmSync\(join\(out, f\)\);/);
  // The only other frame is the lesson video, from youtube-nocookie.com
  assert.match(read("src/views/study/Video.jsx"), /<iframe title=\{title\} src=\{`https:\/\/www\.youtube-nocookie\.com/);
  assert.doesNotMatch(read("src/site/live/Shoulder.jsx"), /src="[^"]*\/(desk|admin)\//);
});

test("every other page keeps its one policy and lets the site frame it", () => {
  for (const path of ["/", "/index.html", "/faq", "/features.html", "/legal", "/guides/x/", "/prop-firms/", "/404.html", "/unknown"]) {
    const h = send(make(), path);
    assert.equal(policies(h), 1, path);
    assert.deepEqual(framing(h), ["frame-ancestors 'self'"], path);
  }
});

test("with voice off the headers name neither LiveKit nor the microphone", () => {
  const all = make({ voice: false });
  assert.doesNotMatch(all, /livekit/i);
  assert.doesNotMatch(all, /microphone=\(self\)/);
  assert.equal(send(all, "/desk/").get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
});

test("one switch brings both back, for the app alone", () => {
  const all = make({ voice: true });
  const desk = send(all, "/desk/");
  assert.match(desk.get(CSP), /connect-src [^;]*https:\/\/\*\.livekit\.cloud wss:\/\/\*\.livekit\.cloud/);
  assert.equal(desk.get("permissions-policy"), "camera=(), microphone=(self), geolocation=()");
  for (const path of ["/", "/faq", "/guides/x/", "/prop-firms/x/", "/admin/", "/demo.html"]) assert.equal(send(all, path).get("permissions-policy"), "camera=(), microphone=(), geolocation=()", path);
  assert.doesNotMatch(desk.get(CSP), /script-src[^;]*livekit/);
});

test("the build takes that switch from src/mode.js", () => {
  assert.equal(typeof VOICE_LIVE, "boolean");
  assert.match(build, /import \{ VOICE_LIVE \} from "\.\.\/src\/mode\.js";/);
});

test("the firm pages get the same rule as the guides", () => {
  const all = make();
  for (const path of ["/prop-firms/", "/prop-firms/topstep/"]) {
    const firm = send(all, path), guide = send(all, "/guides/x/");
    assert.equal(firm.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(firm.get("permissions-policy"), guide.get("permissions-policy"));
  }
});

test("the inline scripts' hashes reach every policy", () => {
  const all = make();
  for (const path of ["/", "/desk/", "/admin/", "/guides/x/"]) for (const hash of HASHES) assert.ok(send(all, path).get(CSP).includes(hash), path);
});

test("a Report-Only build takes off the header it actually set", () => {
  const all = make({ env: { CSP_ENFORCE: "0" } });
  const h = send(all, "/desk/");
  assert.equal(h.get(CSP), null);
  assert.equal(h.get("content-security-policy-report-only").match(/default-src/g).length, 1);
  assert.equal(h.get("x-frame-options"), "DENY", "framing stays closed either way");
});

test("the file stays inside Cloudflare's limits", () => {
  for (const voice of [false, true]) {
    const all = make({ voice });
    assert.ok(all.split("\n").every((l) => l.length <= 2000));
    assert.ok(parse(all).length <= 100);
  }
});

test("_headers is made by the build, so a hand edit can't last", () => {
  assert.ok(existsSync(new URL("../scripts/build-web.mjs", import.meta.url)));
  assert.match(build, /rmSync\(out, \{ recursive: true, force: true \}\);/);
});
