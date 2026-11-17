import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeEmail } from "../supabase/functions/_shared/email-norm.js";
import { AVATAR_MAX, avatarPath, sniffImage } from "../supabase/functions/_shared/image-type.js";
import { BOARD_CAPS, CUP_SOURCES, COUNTED_SOURCES, cupDays, cupRiskUnit, disciplineDays, ownRules, summarise } from "../src/views/community/scoring.js";

test("email variants are one person: +tags, Gmail dots, googlemail.com, case and spaces", () => {
  assert.equal(normalizeEmail("A.B+trial@Gmail.com"), "ab@gmail.com");
  assert.equal(normalizeEmail(" ab@googlemail.com "), "ab@gmail.com");
  assert.equal(normalizeEmail("r.e.f+2@gmail.com"), normalizeEmail("ref@gmail.com"));
  assert.equal(normalizeEmail("a.b+x+y@outlook.com"), "a.b@outlook.com");
  assert.notEqual(normalizeEmail("a.b@outlook.com"), normalizeEmail("ab@outlook.com"));
  assert.equal(normalizeEmail("Support@Example.com"), "support@example.com");
  assert.equal(normalizeEmail("nodomain"), "nodomain");
  assert.equal(normalizeEmail(null), "");
});

test("the database's email_norm() is the same rule", () => {
  const sql = readFileSync(new URL("../supabase/migrations-pending/20261029180100_signup_profiles_and_names.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("split_part(l, '+', 1)"), "drops the +tag");
  assert.ok(sql.includes("case when d = 'googlemail.com' then 'gmail.com' else d end"), "googlemail is gmail");
  assert.ok(sql.includes("case when d = 'gmail.com' then replace(l, '.', '') else l end"), "Gmail dots");
});

test("an upload is the image its bytes say, never what the browser claims", () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
  const jpg = [0xff, 0xd8, 0xff, 0xe0, 0, 16];
  const webp = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50];
  assert.equal(sniffImage(new Uint8Array(png)), "image/png");
  assert.equal(sniffImage(new Uint8Array(jpg)), "image/jpeg");
  assert.equal(sniffImage(new Uint8Array(webp)), "image/webp");
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  assert.equal(sniffImage(html), null);
  assert.equal(sniffImage(svg), null);
  assert.equal(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38])), null); // GIF isn't kept
  assert.equal(sniffImage(new Uint8Array([])), null);
  assert.equal(AVATAR_MAX, 2 * 1024 * 1024);
  const uid = "00b79bfb-5dee-414f-8d15-1e2ffd9fa209";
  const p = avatarPath(uid, "image/webp", 1761700000000);
  assert.equal(p, `${uid}/avatar-1761700000000.webp`);
  assert.match(`https://x.supabase.co/storage/v1/object/public/avatars/${p}`, new RegExp(`/avatars/${uid}/[A-Za-z0-9_-]{1,80}\\.(png|jpe?g|webp)$`));
});

const day = (k, pnl, extra = {}) => ({ id: `${k}-${pnl}`, dayKey: k, traded_at: `${k}T14:00:00Z`, pnl, r: 3, source: "sync", followedPlan: true, ...extra });

test("competitions count synced trades only; boards keep imports too", () => {
  assert.deepEqual(CUP_SOURCES, ["sync"]);
  assert.deepEqual(COUNTED_SOURCES, ["import", "sync"]);
  const trades = [day("2026-11-03", 100), day("2026-11-04", 100, { source: "import" }), day("2026-11-05", 100, { source: "manual" })];
  assert.equal(cupDays(trades, { max_trade_loss_pct: 1 }, 50000).length, 1);
  assert.equal(disciplineDays(trades, {}).length, 2);
});

test("a competition's R comes from the cup's risk unit, not the trader's own stop or R", () => {
  assert.equal(cupRiskUnit({ max_trade_loss_pct: 1 }, 50000), 500);
  assert.equal(cupRiskUnit({}, 50000), 500); // 1% when the cup sets none
  const [d] = cupDays([day("2026-11-03", 250, { r: 9 })], { max_trade_loss_pct: 1 }, 50000);
  assert.equal(d.r, 0.5);
  // Still capped at +3R
  const [big] = cupDays([day("2026-11-03", 5000, { r: 1 })], { max_trade_loss_pct: 1 }, 50000);
  assert.equal(big.r, 3);
});

test("in a competition the self-marked plan doesn't count; on the boards it still does", () => {
  const offPlan = [day("2026-11-03", 100, { followedPlan: false })];
  assert.deepEqual(cupDays(offPlan, { max_trade_loss_pct: 1 }, 50000)[0].broke, []);
  assert.deepEqual(disciplineDays(offPlan, {})[0].broke, ["plan"]);
});

test("board rules are capped so they can't be set too loose to break", () => {
  assert.deepEqual(ownRules({ lossLimit: 500, maxTrades: 100, stopAfter: 20 }), { lossLimit: 500, maxTrades: BOARD_CAPS.maxTrades, stopAfter: BOARD_CAPS.stopAfter });
  assert.deepEqual(ownRules({ maxTrades: 3, stopAfter: 2 }), { lossLimit: null, maxTrades: 3, stopAfter: 2 });
  const many = Array.from({ length: 25 }, (_, i) => ({ ...day("2026-11-03", 1), id: `t${i}`, traded_at: `2026-11-03T14:${String(i).padStart(2, "0")}:00Z` }));
  const s = summarise(disciplineDays(many, ownRules({ maxTrades: 100 })));
  assert.equal(s.kept, 0); // 25 trades breaks the capped 20-a-day rule
});
