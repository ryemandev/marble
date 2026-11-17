import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

test("no screen names a statue: only data.js may, to send old saved paths somewhere else", () => {
  for (const f of walk(join(root, "src"))) {
    if (!/\.(jsx?|css)$/.test(f) || f.endsWith(join("src", "data.js"))) continue;
    assert.ok(!/\bgods\/[a-z]/.test(readFileSync(f, "utf8")), f);
  }
});

test("every statue a saved record can name lands on a picture that exists", () => {
  const data = readFileSync(join(root, "src", "data.js"), "utf8");
  const block = data.match(/const RETIRED = \{([\s\S]*?)\n\};/)[1];
  const landed = [...block.matchAll(/"gods\/[a-z-]+": "([a-z-]+\/[a-z-]+)"/g)].map((m) => m[1]);
  assert.equal(landed.length, 14);
  for (const path of landed) assert.ok(existsSync(join(root, "public", "art", `${path}.webp`)), path);
});
