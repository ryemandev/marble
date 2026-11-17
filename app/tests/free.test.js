import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (f) => readFileSync(join(root, f), "utf8");

const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
  const p = `${dir}/${e.name}`;
  return e.isDirectory() ? walk(p) : /\.(js|jsx|css)$/.test(e.name) ? [p] : [];
});

test("the old Earn, Partners and Careers addresses, and referral links, go to the home page", () => {
  const build = read("scripts/build-web.mjs");
  for (const line of ["/earn / 301", "/partners / 301", "/careers / 301", "/r/* / 301"]) assert.ok(build.includes(`"${line}"`), line);
  for (const page of ["earn", "partners", "careers"]) assert.equal(existsSync(join(root, `pages/${page}.html`)), false, page);
});

test("payments have left the security headers", () => {
  assert.doesNotMatch(read("scripts/build-web.mjs"), /stripe/i);
});

test("nothing in the app or the admin area still asks for a paid feature", () => {
  const paid = /\bstripe\b|create-checkout|customer-portal|my_billing|my_referral|claim_referral|ref_click|funnel_step|funnel_report|has_access|free50|payout_settings|admin_finance/i;
  const words = walk("src").filter((f) => !/\/(docs|answers)\.js$/.test(f)).filter((f) => paid.test(read(f)));
  assert.deepEqual(words, []);
});
