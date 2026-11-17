import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAABURU, SEAL_D, SEAL_S, sealCut, sealMask, sealSVG, wordmarkMetrics } from "../src/components/seal.js";

test("the detailed cut from 64px up, the simple cut below", () => {
  assert.equal(sealCut(16), SEAL_S);
  assert.equal(sealCut(63), SEAL_S);
  assert.equal(sealCut(64), SEAL_D);
  assert.equal(sealCut(512), SEAL_D);
  assert.notEqual(SEAL_D, SEAL_S);
});

test("the wordmark's seal is about 0.84 of the type, an even number of pixels shorter, so it centres on a whole pixel", () => {
  for (let f = 12; f <= 240; f++) {
    const m = wordmarkMetrics(f);
    assert.ok(Number.isInteger(m.seal) && Number.isInteger(m.gap) && Number.isInteger(m.lift), `whole pixels at ${f}`);
    assert.equal((m.font - m.seal) % 2, 0, `even difference at ${f}`);
    assert.ok(Math.abs(m.seal / f - 0.84) < 0.08, `0.84 of ${f}`);
  }
  assert.deepEqual(wordmarkMetrics(22), { font: 22, seal: 18, gap: 6, lift: 0 });
});

test("pictures of the seal: one evenodd path, the silver only when asked, the paper filled only when asked", () => {
  const plain = sealSVG({ px: 32, fill: "#000" });
  assert.equal((plain.match(/<path /g) || []).length, 1);
  assert.ok(plain.includes('fill-rule="evenodd"') && !plain.includes("linearGradient"));
  assert.ok(sealSVG({ size: 180, px: 101, scale: 0.56, tile: "#000", silver: true }).includes('fill="url(#s)"'));
  assert.equal((sealSVG({ px: 16, paper: "#fff" }).match(/<path /g) || []).length, 2);
  assert.match(sealMask(150), /^url\("data:image\/svg\+xml,/);
  assert.ok(MAABURU.d.length > 1000 && MAABURU.h === 430);
});

test("the favicon is the black m on white, light only, and nothing still asks for the old M's files", () => {
  const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
  assert.ok(svg.includes('fill="#fff"') && svg.includes('stroke="#000"') && !svg.includes("prefers-color-scheme"));
  for (const f of ["../index.html", "../site.html", "../src/views/Flex.jsx", "../scripts/build-guides.mjs"]) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/mark-m(-nodrip)?\.png|mark-orb\.png|\/mark\.svg/.test(s), f);
  }
});

test("every page asks for the icons by the manifest's version, so phones don't keep an old one", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  const v = manifest.icons[0].src.split("?v=")[1];
  assert.ok(v && manifest.icons.every((i) => i.src.endsWith(`?v=${v}`)));
  const pages = ["index.html", "demo.html", "site.html", "legal.html", "admin.html", "public/404.html", "public/unsubscribe.html", "scripts/build-guides.mjs", "public/sw.js", "src/live/Install.jsx",
    ...["drawdown-calculator", "everything", "faq", "features", "founder", "journal", "position-size-calculator", "pricing", "prop-firm-rules"].map((p) => `pages/${p}.html`)];
  for (const f of pages) {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    const asks = [...s.matchAll(/[/}](favicon\.ico|favicon\.svg|favicon-96\.png|apple-touch-icon\.png|icon-192\.png|badge-96\.png|splash\/apple-\d+x\d+\.png)([^"`\s]*)/g)];
    assert.ok(asks.length, f);
    for (const [, file, rest] of asks) assert.equal(rest, `?v=${v}`, `${f}: ${file}`);
  }
});
