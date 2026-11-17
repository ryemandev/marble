import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { b64u, encrypt, vapid } from "../supabase/functions/_shared/webpush.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SQL = read("supabase/migrations-pending/20261031120000_push_notifications.sql");

/* ---------- Encryption and signing ---------- */

test("a push is encrypted exactly as RFC 8291's worked example", async () => {
  const asPublic = b64u.dec("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
  const jwk = { kty: "EC", crv: "P-256", x: b64u.enc(asPublic.slice(1, 33)), y: b64u.enc(asPublic.slice(33)), d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw" };
  const keys = {
    privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, true, []),
  };
  const body = await encrypt("When I grow up, I want to be a watermelon",
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg",
    { keys, salt: b64u.dec("DGv6ra1nlYgDCS1FRnbzlw") });
  assert.equal(b64u.enc(body),
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
});

test("every push gets a fresh key and salt", async () => {
  const a = await encrypt("x", "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
  const b = await encrypt("x", "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
  assert.notDeepEqual(a.slice(0, 86), b.slice(0, 86));
});

test("the VAPID token is a valid ES256 signature for the push service, short-lived, with a contact", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = b64u.enc(await crypto.subtle.exportKey("raw", pair.publicKey));
  const now = Date.UTC(2026, 9, 31, 12);
  const header = await vapid("https://fcm.googleapis.com/fcm/send/abc", { publicKey, privateKey: jwk.d, subject: "mailto:support@example.com" }, now);
  const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, publicKey);
  const [h, p, s] = token.split(".");
  const claims = JSON.parse(new TextDecoder().decode(b64u.dec(p)));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64u.dec(h))), { typ: "JWT", alg: "ES256" });
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "mailto:support@example.com");
  assert.ok(claims.exp - now / 1000 <= 24 * 3600, "at most 24 hours, as the push services require");
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, b64u.dec(s), new TextEncoder().encode(`${h}.${p}`)));
});

/* ---------- The function ---------- */

test("push-send is small, checks the cron secret, and forgets gone devices", () => {
  const fn = read("supabase/functions/push-send/index.ts");
  const size = statSync(new URL("../supabase/functions/push-send/index.ts", import.meta.url)).size
    + statSync(new URL("../supabase/functions/_shared/webpush.js", import.meta.url)).size;
  assert.ok(size < 7200, `push-send and webpush.js are ${size} bytes (the function is ~3 KB, its encryption ~4 KB)`);
  assert.ok(fn.includes('rpc("push_cron_ok"') && fn.includes('json({ error: "Not allowed" }, 401)'));
  assert.ok(fn.includes("status === 404 || status === 410") && fn.includes('rpc("push_gone"'));
  assert.ok(!/console\.(log|error)\([^)]*(payload|p256dh|auth\b|privateKey)/.test(fn), "never logs a push, a device key or the private key");
});

/* ---------- The migration ---------- */

test("the push tables are closed to the browser, and every function pins search_path", () => {
  for (const t of ["push_subscriptions", "push_outbox"]) assert.match(SQL, new RegExp(`alter table public\\.${t} enable row level security;`));
  assert.match(SQL, /revoke all on table public\.push_subscriptions, public\.push_outbox from anon, authenticated;/);
  assert.ok(!/create policy/i.test(SQL), "no policies: everything goes through the functions");
  for (const [, name, head] of SQL.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\$\$/g)) {
    if (/security definer/.test(head)) assert.match(head, /set search_path = ''/, `${name}: search_path`);
    assert.ok(new RegExp(`revoke all on function public\\.${name}\\(`).test(SQL), `${name}: revoked`);
  }
  for (const f of ["push_subscribe", "push_unsubscribe", "push_settings"]) assert.match(SQL, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated;`));
  for (const f of ["push_batch", "push_gone", "push_cron_ok"]) assert.match(SQL, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`));
  assert.ok(!/grant execute on function public\.push_queue/.test(SQL), "nobody outside the database can queue a push");
});

test("pushes go only to the browsers' push services", () => {
  const ok = SQL.match(/p_endpoint ~ '([^']+)'/)[1];
  const re = new RegExp(ok);
  for (const good of ["https://fcm.googleapis.com/fcm/send/abc:APA91b", "https://updates.push.services.mozilla.com/wpush/v2/gAAA", "https://web.push.apple.com/QGuQyavXutnMH", "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA"]) assert.ok(re.test(good), good);
  for (const bad of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.com/x", "https://evil.com/fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com/a b"]) assert.ok(!re.test(bad), bad);
});

test("no push carries what anyone wrote, or an amount", () => {
  assert.ok(SQL.includes("'New message on Marble'"));
  assert.ok(!/push_queue\([^;]*(new\.body|sealed|dm_open)/.test(SQL), "a push never reads a message");
  const limits = SQL.slice(SQL.indexOf("function public.push_limits_check"), SQL.indexOf("create trigger trades_push_limits"));
  assert.ok(!/v_pnl\s*\|\||v_used\s*\|\||daily_loss_limit\s*\|\|/.test(limits), "no money in a limit push");
});

test("the limit rules: a live day only, once a day, close never after reached", () => {
  assert.ok(SQL.includes("new.traded_at < greatest(v_from, now() - interval '3 hours')"), "a trade from today's last 3 hours");
  assert.ok(SQL.includes("v_key || 'loss:hit'") && SQL.includes("v_key || 'loss:near'"));
  assert.match(SQL, /elsif v_used >= r\.daily_loss_limit \* 0\.8 and not exists \(select 1 from public\.push_outbox o where o\.user_id = new\.user_id and o\.dedupe = v_key \|\| 'loss:hit'\)/);
  assert.ok(SQL.includes("unique (user_id, dedupe)") && SQL.includes("on conflict (user_id, dedupe) do nothing"));
});

test("the queue only calls the function when something is waiting, and its undo is written down", () => {
  assert.match(SQL, /\nbegin;\n/);
  assert.ok(SQL.trimEnd().endsWith("commit;"));
  assert.ok(SQL.includes("where exists (select 1 from public.push_outbox where sent_at is null);"));
  const rb = read("supabase/migrations-pending/ROLLBACK.md");
  assert.ok(rb.includes("## 22. 20261031120000_push_notifications.sql"));
  for (const x of ["push_subscriptions", "push_outbox", "trades_push_limits", "dm_messages_push", "chat_messages_push", "'push-send'", "push_cron"]) assert.ok(rb.includes(x), `undo covers ${x}`);
});

/* ---------- The key script ---------- */

test("vapid-keys.mjs writes both keys to a gitignored file and never prints the private one", () => {
  const dir = mkdtempSync(join(tmpdir(), "marble-vapid-"));
  try {
    mkdirSync(join(dir, "scripts"));
    copyFileSync(new URL("../scripts/vapid-keys.mjs", import.meta.url), join(dir, "scripts", "vapid-keys.mjs"));
    writeFileSync(join(dir, ".env"), "VITE_SUPABASE_URL=https://example.supabase.co\n");
    const out = execFileSync(process.execPath, [join(dir, "scripts", "vapid-keys.mjs")], { encoding: "utf8" });
    const pair = Object.fromEntries(readFileSync(join(dir, ".env.vapid"), "utf8").split("\n").filter((l) => /^\w+=/.test(l)).map((l) => l.split("=")));
    assert.match(pair.VAPID_PUBLIC_KEY, /^B[A-Za-z0-9_-]{86}$/, "a 65-byte uncompressed P-256 point");
    assert.match(pair.VAPID_PRIVATE_KEY, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!out.includes(pair.VAPID_PRIVATE_KEY), "the private key is never printed");
    const env = readFileSync(join(dir, ".env"), "utf8");
    assert.ok(env.includes("VITE_SUPABASE_URL=https://example.supabase.co") && env.includes(`VITE_VAPID_PUBLIC_KEY=${pair.VAPID_PUBLIC_KEY}`));
    assert.ok(!env.includes(pair.VAPID_PRIVATE_KEY), "the app's .env only gets the public key");
    execFileSync(process.execPath, [join(dir, "scripts", "vapid-keys.mjs")], { encoding: "utf8" });
    assert.ok(readFileSync(join(dir, ".env.vapid"), "utf8").includes(pair.VAPID_PRIVATE_KEY));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const ignore = read("../.gitignore");
  assert.ok(/^\.env\.\*$/m.test(ignore), ".env.vapid is covered by .env.* in .gitignore");
});

/* ---------- The service worker ---------- */

test("the service worker never keeps the journal, sign-in or anything but GET, and pages come from the network", () => {
  const sw = read("public/sw.js");
  assert.ok(sw.includes('if (req.method !== "GET") return;'));
  assert.ok(!/supabase/i.test(sw.replace(/\/\/.*$/gm, "")), "no Supabase address is ever handled");
  assert.ok(sw.includes("url.origin === self.location.origin") && sw.includes("if (FONTS.test(req.url))"), "other sites: fonts only");
  assert.ok(/async function page\(req, e\) \{\s*const net = fetch\(req\)/.test(sw), "the page: network first");
  assert.ok(sw.includes("return (await kept()) || net;"), "the kept page only when the network is slow or down");
  assert.ok(sw.includes("self.skipWaiting()") && sw.includes("self.clients.claim()"), "a new copy takes over at once");
  assert.ok(sw.includes('if (url.pathname.startsWith("/assets/")) e.respondWith(file(req));'));
});

test("the install ribbon: once, in the real app, after the walkthrough, never in Instagram or TikTok, never installed", () => {
  const app = read("src/App.jsx");
  const ui = read("src/live/Install.jsx");
  const pwa = read("src/live/pwa.js");
  assert.ok(app.includes("{LIVE && <InstallRibbon />}"), "only in the real app (never the demo the website runs)");
  assert.ok(ui.includes("s.me?.private?.tour_done_at && !s.example?.on"), "not during setup or the example desk");
  assert.match(ui, /markInstallAsked\(\);[^\n]*\n\s*setOpen\(true\)/, "counted as asked the moment it shows");
  assert.ok(ui.includes("}, 20000);"), "20 seconds into a visit");
  assert.ok(/Instagram/.test(pwa) && /TikTok/.test(pwa) && pwa.includes("if (standalone() || inApp()) return null;"), "never in an in-app browser or once installed");
  assert.ok(pwa.includes("export const installPromptDue = () => phone() && !installAsked() && !!installKind();"), "phones only, once");
  assert.ok(!/backdrop-filter|filter:\s*blur/.test(read("src/live/install.css")), "no blur");
});
