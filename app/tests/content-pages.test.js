// The search pages: weekly release by date, and the prop firm pages built from the rules data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGuides } from "../scripts/build-guides.mjs";
import { buildFirms } from "../scripts/build-firms.mjs";
import { RULE_FIRMS } from "../src/lib/firm-rules/catalog.js";

const root = join(import.meta.dirname, "..");
const doc = (date, title = "A page") => `---\ntitle: ${title}\ndescription: About it.\ndate: ${date}\n---\nBody.\n`;

test("a page dated after today waits for its week", () => {
  const dir = mkdtempSync(join(tmpdir(), "marble-docs-"));
  writeFileSync(join(dir, "now.md"), doc("2026-11-02"));
  writeFileSync(join(dir, "later.md"), doc("2026-11-09"));
  writeFileSync(join(dir, "_draft.md"), doc("2026-11-01"));
  assert.deepEqual(readGuides(dir, "2026-11-02").map((g) => g.slug), ["now"]);
  assert.deepEqual(readGuides(dir, "2026-11-09").map((g) => g.slug).sort(), ["later", "now"]);
});

test("every firm with rules has a page (the comparison tool links to each), and each fits a search result", () => {
  const dir = join(root, "content", "prop-firms");
  const slugs = new Set(RULE_FIRMS.map((f) => f.slug));
  for (const s of slugs) assert.ok(existsSync(join(dir, `${s}.md`)), `content/prop-firms/${s}.md`);
  for (const d of readGuides(dir, "9999-12-31")) {
    assert.ok(slugs.has(d.fm.firm || d.slug), `${d.file} names a firm with rules`);
    assert.ok(`${d.title} — Marble`.length <= 60 || d.title.length <= 60, `${d.file} title`);
    assert.ok(d.description.length <= 160, `${d.file} description`);
  }
});

test("firm pages: one per file, each with its tables, sources and questions", () => {
  const out = mkdtempSync(join(tmpdir(), "marble-firms-"));
  const pages = buildFirms(root, out);
  assert.equal(pages.length, readdirSync(join(root, "content", "prop-firms")).filter((f) => f.endsWith(".md") && !/^readme/i.test(f)).length);
  const index = readFileSync(join(out, "prop-firms", "index.html"), "utf8");
  for (const p of pages) {
    const html = readFileSync(join(out, "prop-firms", p.slug, "index.html"), "utf8");
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, p.slug);
    assert.ok(html.includes(`<link rel="canonical" href="${p.url}" />`), p.slug);
    assert.ok(html.includes("<table>") && html.includes("g-facts") && html.includes("g-sources"), p.slug);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    const types = ld["@graph"].map((x) => x["@type"]);
    assert.ok(types.includes("Article") && types.includes("BreadcrumbList") && types.includes("FAQPage"), p.slug);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(html), `${p.slug} has no broken values`);
    assert.ok(index.includes(`href="/prop-firms/${p.slug}/"`), `${p.slug} is on the index`);
  }
});

test("a firm page dated in the future isn't built", () => {
  const dir = mkdtempSync(join(tmpdir(), "marble-firm-docs-"));
  writeFileSync(join(dir, "apex.md"), doc("2999-01-01", "Apex rules"));
  const out = mkdtempSync(join(tmpdir(), "marble-firms-"));
  assert.deepEqual(buildFirms(root, out, dir), []);
  assert.ok(!existsSync(join(out, "prop-firms")));
});
