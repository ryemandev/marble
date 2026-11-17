import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import {
  CARD_RUN, FLAG_RULES, MAX_BODY, SAFETY, WHY, addressParts, blockedBetween, canSend, canStart, canViewShare, copyNotebookTitle,
  copyOf, evidenceOf, flagNote, hasCardNumber, heldView, hideBlocked, leafLines, namesLine, pagesNow, requestLimit, scamFlags,
  shareLines, snapshotOf, unreadTotal,
} from "../src/views/community/dms.js";

const SQL = readFileSync(new URL("../supabase/migrations-pending/20261030100000_dms_and_sharing.sql", import.meta.url), "utf8");
const sqlText = (s) => s.replace(/'/g, "''"); // how a message is written inside a SQL string
function fn(name) {
  const at = SQL.indexOf(`create or replace function public.${name}(`);
  const start = at >= 0 ? at : SQL.indexOf(`create function public.${name}(`);
  assert.ok(start >= 0, `${name}() is defined`);
  const body = SQL.indexOf("$$", start);
  const end = SQL.indexOf("$$;", body + 2);
  return SQL.slice(start, end + 3);
}
const FUNCTIONS = [...SQL.matchAll(/create (?:or replace )?function public\.([a-z_]+)\(/g)].map((m) => m[1]);
const TABLES = [...SQL.matchAll(/create table public\.([a-z_]+) \(/g)].map((m) => m[1]);

/* ---------- Requests ---------- */

test("a first message is a request; staff skip it; the other trader's setting and the daily limits apply", () => {
  assert.deepEqual(canStart({}), { ok: true, request: true });
  assert.deepEqual(canStart({ staff: true, theirSetting: "nobody", startedToday: 50, waiting: 50 }), { ok: true, request: false });
  assert.equal(canStart({ theirSetting: "nobody" }).why, "closed");
  assert.equal(canStart({ theirSetting: "crew", myCrew: "OLY", theirCrew: "PIT" }).why, "closed");
  assert.equal(canStart({ theirSetting: "crew", myCrew: null, theirCrew: null }).why, "closed");
  assert.equal(canStart({ theirSetting: "crew", myCrew: "OLY", theirCrew: "OLY" }).ok, true);
  assert.equal(canStart({ emailConfirmed: false }).why, "email");
  assert.equal(requestLimit(13), 3);
  assert.equal(requestLimit(14), 10);
  assert.equal(canStart({ accountDays: 2, startedToday: 3 }).why, "today");
  assert.equal(canStart({ accountDays: 2, startedToday: 2 }).ok, true);
  assert.equal(canStart({ accountDays: 90, startedToday: 9 }).ok, true);
  assert.equal(canStart({ accountDays: 90, startedToday: 10 }).why, "today");
  assert.equal(canStart({ waiting: 20 }).why, "waiting");
});

test("a request is one message until they accept; writing back accepts it", () => {
  const asker = { state: "active", status: "request", startedByMe: true };
  assert.equal(canSend({ ...asker, body: "Hi", sentAlready: 0 }).ok, true);
  assert.equal(canSend({ ...asker, body: "Hello again?", sentAlready: 1 }).why, "wait");
  const asked = canSend({ state: "request", status: "request", body: "Sure" });
  assert.deepEqual(asked, { ok: true, accepts: true });
  assert.equal(canSend({ state: "ignored", status: "request", body: "Changed my mind" }).accepts, true);
  assert.equal(canSend({ state: null, body: "x" }).why, "not_open");
  const m = { id: "1", mine: false, body: "A page for you", card: { type: "page", share: "s" } };
  assert.deepEqual(heldView(m, true), { ...m, card: null, held: "page" });
  assert.deepEqual(heldView(m, false), { ...m, held: null });
  assert.equal(heldView({ ...m, mine: true }, true).card.type, "page");
});

test("what a message may be: text up to 2,000, never a card number; staff need two-step sign-in", () => {
  const open = { state: "active", status: "open" };
  assert.equal(canSend({ ...open, body: "   " }).why, "empty");
  assert.equal(canSend({ ...open, body: "x".repeat(MAX_BODY) }).ok, true);
  assert.equal(canSend({ ...open, body: "x".repeat(MAX_BODY + 1) }).why, "long");
  assert.equal(canSend({ ...open, body: "my card is 4242 4242 4242 4242 ok" }).why, "card_number");
  assert.equal(canSend({ ...open, body: "From Marble", staff: true, aal2: false }).why, "aal2");
  assert.equal(canSend({ ...open, body: "From Marble", staff: true, aal2: true }).ok, true);
  assert.equal(canSend({ ...open, body: "hi", banned: true }).why, "paused");
});

/* ---------- Blocks ---------- */

test("a block is two-way for messages and shares, and quiet: it reads as a closed inbox", () => {
  const blocks = [{ blocker: "a", blocked: "b" }];
  assert.equal(blockedBetween(blocks, "a", "b"), true);
  assert.equal(blockedBetween(blocks, "b", "a"), true);
  assert.equal(blockedBetween(blocks, "a", "c"), false);
  assert.equal(canStart({ blocked: true }).why, "closed");
  assert.equal(WHY.closed, "This trader isn't taking new messages.");
  assert.equal(canSend({ state: "active", status: "open", body: "hi", blocked: true }).why, "undelivered");
  const share = { owner: "a", audience: "community" };
  assert.equal(canViewShare(share, "b", { blocked: true }), false);
  assert.equal(canViewShare(share, "a", { blocked: true }), true);
  assert.equal(canViewShare(share, "c"), true);
});

test("a block hides the blocked trader's named posts and chat for you, never their anonymous posts", () => {
  const posts = [
    { id: 1, author: { handle: "nico" } },
    { id: 2, anonymous: true, author: null }, // could be nico's: hiding it would say so
    { id: 3, author: { handle: "kenji" } },
    { id: 4, team: true },
  ];
  assert.deepEqual(hideBlocked(posts, new Set(["nico"])).map((p) => p.id), [2, 3, 4]);
  assert.deepEqual(hideBlocked(posts, new Set()).map((p) => p.id), [1, 2, 3, 4]);
  const feed = fn("feed");
  assert.ok(feed.includes("(p.anonymous or not exists (select 1 from public.dm_blocks b where b.blocker = (select auth.uid()) and b.blocked = p.user_id))"));
  assert.match(SQL, /create policy "chat: not from people you blocked" on public\.chat_messages as restrictive for select to authenticated/);
});

/* ---------- Sharing ---------- */

const PAGES = [
  { id: "p3", notebookId: "nb", n: 3, createdAt: "2026-10-03", lines: [] },
  { id: "p1", notebookId: "nb", n: 1, createdAt: "2026-10-01", lines: [] },
  { id: "p2", notebookId: "nb", n: 2, createdAt: "2026-10-02", lines: [] },
  { id: "x1", notebookId: "other", n: 1, createdAt: "2026-10-01", lines: [] },
  { id: null, notebookId: "nb", n: 4, fresh: true, lines: [] }, // the fresh page isn't a page yet
];

test("a whole-notebook share covers only the pages it had when it was shared", () => {
  const snap = snapshotOf(PAGES, "nb");
  assert.deepEqual(snap, [{ pageId: "p1", n: 1 }, { pageId: "p2", n: 2 }, { pageId: "p3", n: 3 }]);
  // A page written afterwards isn't in it
  const later = [...PAGES, { id: "p4", notebookId: "nb", n: 4, createdAt: "2026-10-30", lines: [] }];
  assert.deepEqual(pagesNow(snap, later).map((x) => x.pageId), ["p1", "p2", "p3"]);
  assert.deepEqual(pagesNow(snap, PAGES.filter((p) => p.id !== "p2")).map((x) => [x.pageId, x.i]), [["p1", 1], ["p3", 2]]);
  assert.deepEqual(snapshotOf(PAGES, "nb", "p3"), [{ pageId: "p3", n: 3 }]);
  const share = fn("share_page");
  assert.ok(share.includes("row_number() over (order by p.n, p.created_at, p.id)::int as i"));
  assert.ok(share.includes("where p_page is null or x.id = p_page"));
  assert.ok(fn("share_pages_now").includes("join public.pages p on p.id = sp.page_id"));
});

test("a page's card: up to three lines, key lessons first, shown in page order", () => {
  const lines = [
    { t: 10, text: "one" }, { t: 20, text: "two" }, { t: 30, text: "three", key: true }, { t: 40, text: "four" }, { t: null, text: "five", key: true },
  ];
  assert.deepEqual(leafLines(lines), [[10, "one", false], [30, "three", true], [null, "five", true]]);
  assert.deepEqual(leafLines([{ text: "a" }, { text: "b" }]), [[null, "a", false], [null, "b", false]]);
  assert.equal(leafLines([{ text: "x".repeat(300) }])[0][1].length, 140);
  assert.ok(fn("share_card").includes("order by k desc, e.ord limit 3"));
});

test("readers only get lines, times and key lessons, whatever a page row holds", () => {
  const odd = [{ t: 12.6, text: "ok", key: true, trade: "secret" }, { t: -5, text: "neg" }, { t: 999999, text: "big" }, { text: "  " }, "str", null,
    { t: "12", text: "string time", key: "yes" }, { text: 42 }];
  assert.deepEqual(shareLines(odd), [
    { t: 13, text: "ok", key: true }, { t: 0, text: "neg", key: false }, { t: 86400, text: "big", key: false }, { t: null, text: "string time", key: false },
  ]);
  assert.deepEqual(shareLines(null), []);
  const page = { title: "Stacked gaps", lines: odd, attachments: [{ path: "u/p/a.webp" }], tradeId: "t1", videoId: "abcdefghijk", videoTitle: "Ep 9", videoAt: 1720 };
  const copy = copyOf(page);
  assert.deepEqual(copy.attachments, []);
  assert.equal(copy.tradeId, null);
  assert.equal(copy.videoAt, null);
  assert.equal(copy.videoId, "abcdefghijk");
  assert.equal(copy.lines.length, 4);
  assert.equal(copyNotebookTitle("Price action", "kenji"), "Price action, from kenji");
  assert.equal(copyNotebookTitle("x".repeat(70), "kenji").length, 60);
  for (const name of ["share_view", "share_card"]) {
    const body = fn(name);
    assert.ok(!/trade_id|attachments|pg\.id\b|'page_id'/.test(body), `${name} returns no trade, photos or page id`);
  }
  const save = fn("share_save");
  assert.ok(save.includes("public.share_lines(pg.lines), '[]'::jsonb)"), "a copy has no photos");
  assert.ok(!save.includes("trade_id"), "a copy has no trade");
});

test("unsharing takes the card away and keeps the post's words", () => {
  const stop = fn("share_stop");
  assert.ok(stop.includes("set revoked_at = now()"));
  assert.ok(!/delete from public\.posts/.test(stop));
  assert.ok(fn("feed").includes("(select case when (c ->> 'gone')::boolean then null else c end"));
  assert.equal(canViewShare({ owner: "a", audience: "community", revokedAt: "2026-10-30" }, "b"), false);
  const guard = fn("posts_share_guard");
  assert.ok(guard.includes("new.anonymous or new.parent_id is not null"));
  assert.ok(guard.includes("s.owner = new.user_id and s.audience = 'community'"));
});

/* ---------- The scam check ---------- */

test("the scam check flags card details, codes, payment wording, staff claims and links, and only warns", () => {
  const jay = "Congrats! You won the October giveaway. Jules asked me to collect your card details so the payout can go out today. Fill in the form here: marble-payouts.co/claim";
  assert.deepEqual(scamFlags(jay), ["card", "staff_claim", "link"]);
  assert.deepEqual(scamFlags("Send me your 2FA code and the seed phrase"), ["credentials"]);
  assert.deepEqual(scamFlags("Just pay the fee with a gift card"), ["payment"]);
  assert.deepEqual(scamFlags("Hi, it's Jules from Marble."), ["staff_claim"]);
  assert.deepEqual(scamFlags("Hi, it's Jules from Marble.", true), []); // staff saying who they are
  assert.deepEqual(scamFlags("Crew room at 9? Going through the cup rules."), []);
  assert.deepEqual(scamFlags("Thinking of trying"), [], "a word that contains jules isn't a claim");
  assert.equal(flagNote(["card", "staff_claim", "link"]).lead, "This asks for card details and says it's from Jules or Marble.");
  assert.equal(flagNote(["link"]), null);
  const flags = fn("dm_flags");
  for (const [k, re] of FLAG_RULES) { assert.ok(flags.includes(`'${re}'`), `${k} pattern in SQL`); assert.ok(flags.includes(`f := f || '${k}'::text`)); }
  assert.ok(!/raise|update|delete|insert/.test(flags));
});

test("card numbers are refused: a Luhn-valid 13 to 19 digit run, the same rule in SQL", () => {
  assert.equal(hasCardNumber("4242 4242 4242 4242"), true);
  assert.equal(hasCardNumber("5555-5555-5555-4444"), true);
  assert.equal(hasCardNumber("card 378282246310005 thanks"), true); // 15 digits (Amex test number)
  assert.equal(hasCardNumber("4242 4242 4242 4241"), false); // fails Luhn
  assert.equal(hasCardNumber("call 07700 900123"), false); // 11 digits
  assert.equal(hasCardNumber("Out at 13:45, +2.1R on 4 trades"), false);
  assert.equal(hasCardNumber(""), false);
  assert.ok(fn("dm_has_card_number").includes(`'${CARD_RUN}'`));
  assert.ok(fn("dm_post").includes("if public.dm_has_card_number(v_body) then"));
});

test("every refusal the demo and the screens use is word for word what the database says", () => {
  for (const [k, words] of Object.entries(WHY)) assert.ok(SQL.includes(sqlText(words)), `${k}: "${words}"`);
  assert.equal(SAFETY, "Marble will never ask for your card details or password.");
});

test("small things the screens rely on", () => {
  assert.equal(unreadTotal([{ state: "request" }, { state: "active", unread: 2 }, { state: "active", unread: 5, muted: true }, { state: "active" }]), 3);
  assert.equal(namesLine(["fx.mentor.jay", "juno", "sol"]), "fx.mentor.jay, juno and sol");
  assert.equal(namesLine(["a", "b", "c", "d", "e"]), "a, b and 3 more");
  assert.equal(namesLine(["a"]), "a");
  const ms = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}` }));
  const ev = evidenceOf(ms, "m12");
  assert.equal(ev.length, 11);
  assert.equal(ev[0].id, "m2");
  assert.equal(ev.at(-1).reported, true);
  assert.equal(evidenceOf(ms, "m1").length, 2);
  assert.ok(fn("dm_report").includes("order by y.created_at desc limit 11"), "the copy is the reported message and up to 10 before it");
  assert.deepEqual(addressParts("Fill in the form here: marble-payouts.co/claim now").map((p) => p.address || null).filter(Boolean), ["marble-payouts.co/claim"]);
});

/* ---------- The migration's engineering rules ---------- */

test("every new table has row security on and no grants for the browser roles", () => {
  assert.ok(TABLES.length >= 13);
  for (const t of TABLES) {
    assert.match(SQL, new RegExp(`alter table public\\.${t} enable row level security;`), `${t}: row security`);
    assert.ok(new RegExp(`revoke all on table[^;]*public\\.${t}\\b[^;]*from anon, authenticated;`).test(SQL), `${t}: grants revoked`);
  }
  assert.ok(!/grant (select|insert|update|delete)[^;]* on table public\.(dm_|study_share|staff)/.test(SQL), "no direct table grants");
});

test("every SECURITY DEFINER function pins search_path, and every function is closed to anon", () => {
  assert.ok(FUNCTIONS.length > 40);
  for (const name of new Set(FUNCTIONS)) {
    const def = fn(name);
    const head = def.slice(0, def.indexOf("$$"));
    if (/security definer/.test(head)) assert.match(head, /set search_path = ''/, `${name}: search_path`);
    if (name === "feed") continue; // dropped and recreated: its revoke is checked below
    assert.ok(new RegExp(`revoke all on function[^;]*public\\.${name}\\(`).test(SQL), `${name}: revoked`);
  }
  assert.match(SQL, /revoke all on function public\.feed\(text, text, timestamptz, integer, boolean, uuid\) from public, anon;/);
  const granted = new Set([...SQL.matchAll(/grant execute on function ([^;]+) to authenticated;/g)].flatMap((m) => [...m[1].matchAll(/public\.([a-z_]+)\(/g)].map((x) => x[1])));
  for (const inner of ["dm_seal", "dm_open", "dm_post", "dm_thread_for", "dm_block_user", "share_card", "can_view_share", "dm_flags", "dm_alert_batch", "dm_purge", "is_staff", "dm_who"]) {
    assert.ok(!granted.has(inner), `${inner} is internal`);
  }
  for (const door of ["dm_inbox", "dm_thread", "dm_start", "dm_send", "dm_report", "share_page", "share_view", "share_save", "dm_can_listen", "dm_i_blocked"]) assert.ok(granted.has(door), `${door} is a door`);
});

test("message bodies are encrypted at rest with a Vault key, and nobody but the database can open them", () => {
  assert.match(SQL, /vault\.create_secret\(encode\(extensions\.gen_random_bytes\(32\), 'hex'\), 'dm_body_key'/);
  assert.ok(fn("dm_seal").includes("extensions.pgp_sym_encrypt(p_text"));
  assert.ok(fn("dm_seal").includes("'cipher-algo=aes256'"));
  assert.ok(fn("dm_open").includes("extensions.pgp_sym_decrypt(p_sealed"));
  assert.ok(!/security definer/.test(fn("dm_seal")) && !/security definer/.test(fn("dm_open")));
  assert.match(SQL, /revoke all on function public\.dm_open\(bytea\) from public, anon, authenticated, service_role;/);
  // No plain-text body column, and every insert seals
  const table = SQL.slice(SQL.indexOf("create table public.dm_messages"), SQL.indexOf("comment on table public.dm_messages"));
  assert.ok(table.includes("sealed bytea") && !/\bbody text\b/.test(table));
  assert.ok(fn("dm_post").includes("values (p_thread, p_me, public.dm_seal(v_body), p_card, public.dm_flags(v_body, p_me))"));
  assert.ok(fn("dm_report").includes("public.dm_seal(v_copy::text)"), "report copies are sealed too");
});

test("the owner reads reported messages only: no admin path into a conversation", () => {
  for (const name of ["dm_inbox", "dm_thread", "dm_unread", "dm_profile", "dm_export", "share_view", "dm_can_listen"]) {
    assert.ok(!/is_admin/.test(fn(name)), `${name} has no admin bypass`);
  }
  const reading = FUNCTIONS.filter((n) => n !== "dm_open" && fn(n).includes("public.dm_open("));
  assert.deepEqual([...new Set(reading)].sort(), ["dm_export", "dm_inbox", "dm_report", "dm_report_resolve", "dm_reports_open", "dm_thread"].sort());
  // and each one that opens a body checks who's asking first
  assert.ok(fn("dm_thread").includes("m.state not in ('active', 'request')"));
  assert.ok(fn("dm_inbox").includes("where m.user_id = me"));
  assert.ok(fn("dm_export").includes("where m.user_id = me"));
  assert.ok(fn("dm_reports_open").includes("if not public.is_admin() or not public.is_staff(auth.uid()) then"));
  assert.ok(fn("dm_report_resolve").includes("if not public.is_admin() or not public.is_staff(me) then"));
  for (const name of ["dm_reports_open", "dm_report_resolve"]) assert.ok(fn(name).includes("if not public.dm_aal2() then"), `${name} needs two-step sign-in`);
  assert.ok(fn("dm_alert_batch").includes("from public.admins a join public.staff s on s.user_id = a.user_id join auth.users u"));
  assert.ok(fn("dm_report").includes("or m.created_at <= greatest(coalesce(mm.cleared_at, '-infinity'::timestamptz), now() - interval '12 months') then"));
});

test("a request can't be turned into an open conversation, and unsend-and-resend can't ping someone over and over", () => {
  const post = fn("dm_post");
  assert.ok(post.includes("if v_status = 'request' and v_starter is distinct from p_me then"));
  assert.equal(canSend({ state: "left", status: "request", body: "Sorry, only just saw this" }).accepts, true);
  assert.equal(canSend({ state: "left", status: "request", startedByMe: true, sentAlready: 1, body: "Hello again?" }).why, "wait");
  assert.equal(canSend({ state: "active", status: "open", body: "hi" }).accepts, false);
  assert.ok(post.includes("update public.dm_members set state = case when v_status = 'request' then 'request' else 'active' end"));
  assert.ok(!/update public\.dm_members set state = 'active' where thread_id = p_thread and user_id = v_other/.test(post));
  assert.ok(fn("dm_unsend").includes("delete from public.dm_threads t where t.id = v_t and t.status = 'request' and t.started_by = me"));
  assert.ok(!/update public\.dm_/.test(fn("dm_thread_for")));
  // Deleting a conversation only ever touches your own
  assert.ok(fn("dm_leave").includes("if found and not exists"));
});

test("handles are found however they're typed, and the export shows only what you can see", () => {
  assert.ok(fn("dm_user_by_handle").includes("pr.handle operator(extensions.=) btrim(ltrim(btrim(coalesce(p_handle, '')), '@'))::extensions.citext"));
  const exp = fn("dm_export");
  assert.ok(exp.includes("and x.created_at > greatest(coalesce(m.cleared_at, '-infinity'::timestamptz), now() - interval '12 months')"));
  assert.ok(exp.includes("'card', case when m.state = 'request' and x.user_id <> me then null else public.dm_card_out(x.card, me) end"), "a request's card is held in the export too");
  // and the feed only builds a card for a post that carries one
  assert.ok(fn("feed").includes("case when p.share_id is not null then"));
});

test("staff: from the staff table, the owner's handle, two-step sign-in to send, and no request step", () => {
  assert.match(SQL, /insert into public\.staff \(user_id\)\s+select p\.id from public\.profiles p join public\.admins a on a\.user_id = p\.id\s+on conflict do nothing/);
  assert.ok(fn("dm_aal2").includes("->> 'aal', '') = 'aal2'"));
  assert.ok(fn("dm_post").includes("if public.is_staff(p_me) and not public.dm_aal2() then"));
  assert.ok(fn("dm_thread_for").includes("case when v_staff then 'open' else 'request' end"));
  assert.ok(fn("dm_flags").includes("if not public.is_staff(p_sender) and b ~"));
});

test("the server sets the sender, the time and the cards; writes are rate-limited", () => {
  const send = fn("dm_send");
  assert.ok(send.includes("public.trade_card(me, jsonb_build_object('id', p_trade))"), "trade cards come from your own trade");
  assert.ok(send.includes("s.owner = me and s.revoked_at is null"), "page cards only for your own live share");
  assert.ok(!/created_at/.test(fn("dm_post").split("insert into public.dm_messages")[1].split("returning")[0]), "the time is the database's");
  const limits = { dm_post: ["'dm', 20, interval '1 minute'", "'dm_day', 1000, interval '1 day'"], dm_thread_for: ["'dm_request'"], dm_report: ["'dm_report', 20, interval '1 hour'"],
    dm_block: ["'dm_block', 30"], share_page: ["'share', 30, interval '1 day'"], share_save: ["'share_save', 60"], share_view: ["'share_read', 240"], dm_thread: ["'dm_read', 240"], dm_inbox: ["'dm_inbox', 120"] };
  for (const [name, needles] of Object.entries(limits)) for (const n of needles) assert.ok(fn(name).includes(`public.rate_ok(`) && fn(name).includes(n), `${name}: ${n}`);
});

test("live through private channels: ids only, and only the two people can listen", () => {
  const b = fn("dm_broadcast");
  assert.ok(b.includes("realtime.send(jsonb_build_object('id', new.id, 'op', 'insert'), 'message', 'dm:' || new.thread_id::text, true)"));
  assert.ok(!/sealed|dm_open|body/.test(b), "no content travels");
  assert.match(SQL, /create policy "dm: members listen" on realtime\.messages for select to authenticated\s+using \(realtime\.messages\.extension = 'broadcast' and \(select public\.dm_can_listen\(realtime\.topic\(\)\)\)\);/);
  assert.ok(!/on realtime\.messages for insert/.test(SQL), "nobody can broadcast into a conversation");
  assert.ok(fn("dm_can_listen").includes("m.state in ('active', 'request')"));
});

test("kept 12 months, purged nightly by pg_cron; email alerts every 15 minutes with a Vault secret", () => {
  const purge = fn("dm_purge");
  assert.ok(purge.includes("delete from public.dm_messages where created_at < now() - interval '12 months'"));
  assert.ok(purge.includes("t.status = 'request' and t.created_at < now() - interval '30 days'"));
  assert.match(SQL, /select cron\.schedule\('dm-purge', '37 3 \* \* \*', 'select public\.dm_purge\(\)'\);/);
  assert.match(SQL, /select cron\.schedule\(\s+'dm-alerts',\s+'\*\/15 \* \* \* \*'/);
  assert.match(SQL, /'x-marble-cron', \(select decrypted_secret from vault\.decrypted_secrets where name = 'dm_alerts_cron' limit 1\)/);
  assert.match(SQL, /grant execute on function public\.dm_alerts_cron_ok\(text\) to service_role;/);
  // Batched and rate-limited, and never a word of a message
  const batch = fn("dm_alert_batch");
  assert.ok(batch.includes("x.created_at < now() - interval '10 minutes'"));
  assert.ok(batch.includes("l.sent_at > now() - interval '6 hours'"));
  assert.ok(batch.includes("not m.muted and pp.dm_email"));
  assert.ok(!/dm_open|sealed/.test(batch));
  assert.match(batch, /returns table \(email text, kind text, n integer\)/);
});

test("account deletion cascades, and a deleted trader's conversations go for both people", () => {
  const members = SQL.slice(SQL.indexOf("create table public.dm_members"), SQL.indexOf("create index dm_members_user"));
  assert.ok(members.includes("user_id uuid not null references public.profiles (id) on delete cascade"));
  assert.ok(SQL.includes("blocker uuid not null references public.profiles (id) on delete cascade"));
  assert.ok(SQL.includes("thread_id uuid not null references public.dm_threads (id) on delete cascade,\n  user_id uuid not null references public.profiles (id) on delete cascade,\n  sealed"));
  assert.ok(fn("dm_member_gone").includes("delete from public.dm_threads t where t.id = old.thread_id"));
  assert.match(SQL, /create trigger dm_member_gone after delete on public\.dm_members/);
  assert.ok(SQL.includes("reporter uuid references public.profiles (id) on delete set null"), "a report copy outlives the account, without it");
  assert.ok(SQL.includes("owner uuid not null references public.profiles (id) on delete cascade"), "shares go with the account");
});

test("the migration is one transaction, and its undo is written down", () => {
  assert.match(SQL, /\nbegin;\n/);
  assert.ok(SQL.trimEnd().endsWith("commit;"));
  const rb = readFileSync(new URL("../supabase/migrations-pending/ROLLBACK.md", import.meta.url), "utf8");
  assert.ok(rb.includes("## 17. 20261030100000_dms_and_sharing.sql"));
  assert.ok(rb.includes("select cron.unschedule(jobname) from cron.job where jobname in ('dm-purge', 'dm-alerts');"));
  for (const t of TABLES) assert.ok(rb.includes(`public.${t}`), `undo drops ${t}`);
});

/* ---------- The alert function ---------- */

test("dm-alerts is small, self-contained, checks the cron secret, and never reads a message", () => {
  const url = new URL("../supabase/functions/dm-alerts/index.ts", import.meta.url);
  const src = readFileSync(url, "utf8").replace(/^\s*\/\/.*$/gm, ""); // the code, not its comments
  assert.ok(statSync(url).size < 6144, "under 6 KB");
  assert.ok(!/from "\.\.\/_shared/.test(src) && !/^import /m.test(src), "no imports");
  assert.ok(src.includes('rpc("dm_alerts_cron_ok", { p_secret: secret })'));
  assert.ok(src.includes('rpc("dm_alert_batch")'));
  assert.ok(src.includes('subject: "You have a new message on Marble"'));
  assert.ok(!/dm_messages|dm_thread|dm_open|sealed/.test(src));
  assert.ok(src.indexOf("Not allowed") < src.indexOf("dm_alert_batch"), "the secret is checked before anything is claimed");
});

test("the privacy policy says what's stored, for how long, who sees it and why", () => {
  const docs = readFileSync(new URL("../src/site/legal/docs.js", import.meta.url), "utf8");
  for (const s of ["Private messages are deleted after 12 months", "encrypted in our database with a key kept in a separate secure store", "Staff never browse private messages",
    "up to 10 before it", "It never decides anything about your account", "Our email provider (Resend)", "To deliver your private messages", "legitimate interests",
    "Sharing a whole notebook covers the pages it has when you share it"]) assert.ok(docs.includes(s), s);
  assert.match(readFileSync(new URL("../src/site/legal/owner.js", import.meta.url), "utf8"), /UPDATED = "5 November 2026"/);
});
