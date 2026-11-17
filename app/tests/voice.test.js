import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { webcrypto } from "node:crypto";
import {
  ASK_EARLY, GO_LIVE_EARLY, GRACE, LIMITS, ROOMS, SHOW_AHEAD, WHY, browserToOpen, canAsk, canGoLive, canTuneIn, checkQuestion, checkSchedule,
  countdown, icsOf, inAppBrowser, isVoiceIdea, phaseOf, progressOf, questionsInOrder, runFromText, sessionFor, VOICE_IDEA,
} from "../src/views/community/voice/rules.js";
import { TOPIC_IDS } from "../src/views/community/houses.js";

const SQL = readFileSync(new URL("../supabase/migrations-pending/20261031100300_voice_sessions.sql", import.meta.url), "utf8");
const FN_FILE = new URL("../supabase/functions/voice/index.ts", import.meta.url);
const FN = readFileSync(FN_FILE, "utf8");
const sqlText = (s) => s.replace(/'/g, "''");
function fn(name) {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name}() is defined`);
  const body = SQL.indexOf("$$", start);
  return SQL.slice(start, SQL.indexOf("$$;", body + 2) + 3);
}
const FUNCTIONS = [...SQL.matchAll(/create or replace function public\.([a-z_0-9]+)\(/g)].map((m) => m[1]);
const TABLES = [...SQL.matchAll(/create table public\.([a-z_]+) \(/g)].map((m) => m[1]);

/* ---------- The rules ---------- */

const NOW = Date.parse("2026-10-30T13:41:00Z");
const at = (min) => new Date(NOW + min * 60e3).toISOString();
const sess = (o = {}) => ({ id: "s1", room: "general", title: "NY open", status: "scheduled", starts_at: at(30), ends_at: at(80), ...o });

test("where a session is: scheduled, live, over 15 minutes past its end whatever happened, or cancelled", () => {
  assert.equal(phaseOf(sess(), NOW), "scheduled");
  assert.equal(phaseOf(sess({ status: "live", starts_at: at(-10), ends_at: at(40) }), NOW), "live");
  assert.equal(phaseOf(sess({ status: "live", starts_at: at(-80), ends_at: at(-15) }), NOW), "live");
  assert.equal(phaseOf(sess({ status: "live", starts_at: at(-80), ends_at: at(-16) }), NOW), "ended");
  assert.equal(phaseOf(sess({ status: "ended" }), NOW), "ended");
  assert.equal(phaseOf(sess({ status: "cancelled" }), NOW), "cancelled");
  assert.equal(phaseOf(sess({ phase: "live", status: undefined, starts_at: at(-5), ends_at: at(40) }), NOW), "live", "the server's phase is read too");
  assert.equal(GRACE, 15 * 60e3);
});

test("hosts come in from 15 minutes before; everyone else once it's on air; questions open an hour before", () => {
  assert.equal(canTuneIn(sess({ starts_at: at(16) }), "host", NOW), false);
  assert.equal(canTuneIn(sess({ starts_at: at(15) }), "host", NOW), true);
  assert.equal(canTuneIn(sess({ starts_at: at(5) }), "listener", NOW), false);
  assert.equal(canTuneIn(sess({ status: "live", starts_at: at(-5) }), "listener", NOW), true);
  assert.equal(canGoLive(sess({ starts_at: at(15) }), NOW), true);
  assert.equal(canGoLive(sess({ starts_at: at(16) }), NOW), false);
  assert.equal(canAsk(sess({ starts_at: at(60) }), NOW), true);
  assert.equal(canAsk(sess({ starts_at: at(61) }), NOW), false);
  assert.equal(canAsk(sess({ status: "ended" }), NOW), false);
  assert.deepEqual([GO_LIVE_EARLY, ASK_EARLY], [15 * 60e3, 60 * 60e3]);
});

test("a room shows its live session, or the next one starting within a day", () => {
  const live = sess({ id: "live", status: "live", starts_at: at(-5), ends_at: at(40) });
  const soon = sess({ id: "soon", starts_at: at(120) });
  const later = sess({ id: "later", starts_at: at(25 * 60) });
  const crew = sess({ id: "crew", room: "OLY", starts_at: at(60) });
  assert.equal(sessionFor([soon, live, crew], "general", NOW).id, "live");
  assert.equal(sessionFor([later, soon], "general", NOW).id, "soon");
  assert.equal(sessionFor([later], "general", NOW), null, "more than a day ahead stays out of the room");
  assert.equal(sessionFor([crew], "OLY", NOW).id, "crew");
  assert.equal(sessionFor([sess({ status: "cancelled" })], "general", NOW), null);
  assert.equal(SHOW_AHEAD, 24 * 3600e3);
});

test("questions: up next first, then the most wanted (oldest first on a tie), then answered, hidden last", () => {
  const q = (id, state, votes, min) => ({ id, state, votes, at: at(min) });
  const order = questionsInOrder([q("a", "open", 3, 1), q("b", "answered", 20, 0), q("c", "open", 9, 2), q("d", "next", 1, 3), q("e", "hidden", 50, 0), q("f", "open", 9, 1)]);
  assert.deepEqual(order.map((x) => x.id), ["d", "f", "c", "a", "b", "e"]);
  assert.equal(checkQuestion("hi"), WHY.length);
  assert.equal(checkQuestion("x".repeat(281)), WHY.length);
  assert.equal(checkQuestion("A fair question", 3), WHY.waiting);
  assert.equal(checkQuestion("  A fair question  ", 2), null);
});

test("the countdown, and how far through the session is", () => {
  assert.equal(countdown(8 * 60e3 + 41e3), "08:41");
  assert.equal(countdown(3600e3 + 8 * 60e3 + 41e3), "1:08:41");
  assert.equal(countdown(50 * 3600e3), "in 2 days");
  assert.equal(countdown(-5), "00:00");
  const s = sess({ starts_at: at(-25), ends_at: at(25) });
  assert.equal(progressOf(s, NOW), 0.5);
  assert.equal(progressOf(sess(), NOW), 0);
});

test("other apps' browsers are spotted, so talking sends people to Safari or Chrome", () => {
  const ig = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.37.88 (iPhone15,2; iOS 18_1)";
  const fb = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]";
  const tiktok = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6";
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
  const chrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
  assert.equal(inAppBrowser(ig), "Instagram");
  assert.equal(inAppBrowser(fb), "Facebook");
  assert.equal(inAppBrowser(tiktok), "TikTok");
  assert.equal(inAppBrowser(safari), null);
  assert.equal(inAppBrowser(chrome), null);
  assert.equal(browserToOpen(ig), "Safari");
  assert.equal(browserToOpen(fb), "Chrome");
});

test("the owner's schedule form is checked the way the database checks it", () => {
  const ok = { room: "general", title: "NY open", minutes: 50, hosts: ["kenji"], run: [{ at: "09:25", what: "Levels" }], starts: NOW + 3600e3 };
  assert.equal(checkSchedule(ok, NOW), null);
  assert.equal(checkSchedule({ ...ok, room: "futures" }, NOW), null, "a topic room can hold a session");
  assert.equal(checkSchedule({ ...ok, room: "PIT" }, NOW), null);
  assert.equal(checkSchedule({ ...ok, room: "lobby" }, NOW), WHY.room);
  assert.equal(checkSchedule({ ...ok, title: "NY" }, NOW), WHY.title);
  assert.equal(checkSchedule({ ...ok, minutes: 10 }, NOW), WHY.minutes);
  assert.equal(checkSchedule({ ...ok, minutes: 241 }, NOW), WHY.minutes);
  assert.equal(checkSchedule({ ...ok, starts: NOW - 6 * 60e3 }, NOW), WHY.start);
  assert.equal(checkSchedule({ ...ok, starts: NOW + 61 * 86400e3 }, NOW), WHY.start);
  assert.equal(checkSchedule({ ...ok, hosts: [] }, NOW), WHY.hosts);
  assert.equal(checkSchedule({ ...ok, hosts: ["a", "b", "c", "d"] }, NOW), WHY.hosts);
  assert.equal(checkSchedule({ ...ok, run: Array(11).fill({ what: "x" }) }, NOW), WHY.runLength);
  assert.equal(checkSchedule({ ...ok, run: [{ at: "9:25", what: "x" }] }, NOW), WHY.runLine);
  assert.equal(checkSchedule({ ...ok, run: [{ at: null, what: "x".repeat(61) }] }, NOW), WHY.runLine);
  assert.deepEqual(runFromText("9:25 Overnight levels\n\n The 9:45 close \n09:55 Your questions"),
    [{ at: "09:25", what: "Overnight levels" }, { at: null, what: "The 9:45 close" }, { at: "09:55", what: "Your questions" }]);
  assert.deepEqual(ROOMS, ["general", "futures", "forex", "stocks", "props", "psych", "wins", "help", "OLY", "NITE", "PIT"]);
  const list = `(${ROOMS.map((x) => `'${x}'`).join(", ")})`;
  assert.ok(SQL.includes(`check (room in ${list})`), "the table's room check is the app's list");
  assert.ok(SQL.includes(`p_room not in ${list} then raise exception`), "the schedule check is the app's list");
  const chat = readFileSync(new URL("../supabase/migrations-pending/20261031140000_chat_topic_rooms.sql", import.meta.url), "utf8");
  assert.ok(chat.includes(`room in ('general', ${TOPIC_IDS.map((x) => `'${x}'`).join(", ")})`), "topic rooms match the chat migration");
  assert.ok(fn("voice_can_see").includes("p_room not in ('OLY', 'NITE', 'PIT') or public.is_staff(p_user)"));
  assert.ok(SQL.includes(`p_minutes < ${LIMITS.minutes[0]} or p_minutes > ${LIMITS.minutes[1]}`));
  assert.ok(SQL.includes("char_length(body) between 3 and 280") && SQL.includes("jsonb_array_length(run) <= 10"));
});

test("Add to calendar: one event, in UTC, saying it's not recorded", () => {
  const ics = icsOf(sess({ id: "abc", title: "NY open; levels", blurb: "Levels, then questions." }), "https://trademarble.app/desk/");
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.ok(ics.includes("DTSTART:20261030T141100Z") && ics.includes("DTEND:20261030T150100Z"));
  assert.ok(ics.includes("SUMMARY:NY open\\; levels · Marble"));
  assert.ok(ics.includes("Not recorded."));
  assert.ok(ics.includes("UID:abc@trademarble.app"));
});

test("every refusal the screens and the demo use is word for word what the database says", () => {
  for (const [k, msg] of Object.entries(WHY)) assert.ok(SQL.includes(sqlText(msg)), `WHY.${k} is in the migration: ${msg}`);
});

/* ---------- The migration's engineering rules ---------- */

test("every table has row security on and no grants for the browser roles; there's nowhere to keep audio", () => {
  assert.deepEqual(TABLES.sort(), ["voice_bans", "voice_hands", "voice_log", "voice_people", "voice_questions", "voice_reports", "voice_sessions", "voice_votes"]);
  for (const t of TABLES) {
    assert.ok(SQL.includes(`alter table public.${t} enable row level security;`), `${t}: RLS`);
    assert.ok(SQL.includes(`revoke all on table public.${t} from anon, authenticated;`), `${t}: grants revoked`);
  }
  assert.ok(!/grant (select|insert|update|delete)[^;]* on (table )?public\.voice_/.test(SQL), "no direct table grants");
  assert.ok(!/\b(audio|recording|transcript|bytea)\b[^,\n]*(text|bytea|jsonb)/i.test(SQL.replace(/--.*$/gm, "")), "no column could hold audio or a transcript");
});

test("every SECURITY DEFINER function pins search_path; every function is closed to anon; only two are the server's", () => {
  for (const name of new Set(FUNCTIONS)) {
    const f = fn(name);
    const head = f.slice(0, f.indexOf("$$"));
    if (/security definer/.test(head)) assert.match(head, /set search_path = ''/, `${name}: search_path`);
    assert.ok(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`).test(SQL), `${name}: revoked from public and anon`);
  }
  for (const name of ["voice_join", "voice_mod"]) {
    assert.ok(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`).test(SQL), `${name}: not for the browser`);
    assert.ok(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role;`).test(SQL), `${name}: the voice function's`);
  }
  assert.ok(!/grant execute on function public\.voice_(join|mod)\([^)]*\) to authenticated/.test(SQL));
  for (const name of ["voice_phase", "voice_can_see", "voice_banned", "voice_host_ok", "voice_note", "voice_card", "voice_owner_ok", "voice_broadcast", "voice_purge"]) {
    assert.ok(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`).test(SQL), `${name}: internal`);
  }
});

test("a ban stops tuning in and asking", () => {
  assert.ok(fn("voice_join").includes("voice_banned(p_user)") && fn("voice_ask").includes("voice_banned(me)"));
});

test("the owner schedules, cancels, reads reports and lifts bans: admin, staff and two-step sign-in", () => {
  const ok = fn("voice_owner_ok");
  assert.ok(ok.includes("not public.is_admin() or not public.is_staff(auth.uid())") && ok.includes("public.dm_aal2()"));
  for (const name of ["voice_schedule", "voice_cancel", "voice_reports_open", "voice_report_resolve", "voice_unban"]) assert.ok(fn(name).includes("perform public.voice_owner_ok();"), `${name}: owner only`);
  assert.ok(fn("voice_host_ok").includes("public.is_staff(p_user) and coalesce(p_aal2, false)"));
  const mod = fn("voice_mod");
  assert.ok(mod.includes("not v_staff and (public.is_staff(v_them)"));
  assert.ok(mod.includes("if not v_staff and p_days is distinct from 1 then"));
  assert.ok(mod.includes("v_them = p_user"));
});

test("every write is rate-limited", () => {
  for (const [name, kind] of [["voice_ask", "voice_ask"], ["voice_vote", "voice_vote"], ["voice_hand", "voice_hand"], ["voice_report", "voice_report"],
    ["voice_join", "voice_join"], ["voice_mod", "voice_mod"], ["voice_run", "voice_host"], ["voice_question_set", "voice_host"], ["voice_state", "voice_read"]]) {
    assert.ok(fn(name).includes(`public.rate_ok(`) && fn(name).includes(`'${kind}'`), `${name} is rate-limited (${kind})`);
  }
});

test("live: {op} only, on a private topic per session, which only people who can see it may listen to", () => {
  const b = fn("voice_broadcast");
  assert.ok(b.includes("jsonb_build_object('op', tg_table_name), 'changed', 'voice:' || v_session::text, true"));
  assert.ok(!/body|handle|user_id\)/.test(b.split("realtime.send")[1].split(";")[0]), "no content travels");
  assert.ok(SQL.includes(`create policy "voice: members listen" on realtime.messages for select to authenticated`));
  const l = fn("voice_can_listen");
  assert.ok(l.includes("voice_can_see(s.room, me)") && l.includes("not public.voice_banned(me)") && l.includes("'^voice:[0-9a-f]{8}-"));
  assert.ok(!/insert[^;]*realtime\.messages/i.test(SQL.replace(/--.*$/gm, "")), "nobody can broadcast into these topics");
});

test("kept only as long as it's needed, and the LiveKit room's name never reaches a trader", () => {
  const p = fn("voice_purge");
  assert.ok(p.includes("voice_log where at < now() - interval '90 days'"));
  assert.ok(p.includes("interval '30 days'") && p.includes("interval '12 months'"));
  assert.ok(SQL.includes("select cron.schedule('voice-purge', '47 3 * * *', 'select public.voice_purge()');"));
  assert.ok(!/lk_room/.test(fn("voice_card")) && !/lk_room/.test(fn("voice_sessions_now")) && !/lk_room/.test(fn("voice_state")));
  assert.ok(fn("voice_join").includes("'room', s.lk_room"));
  assert.ok(fn("voice_card").includes("public.dm_who(p.user_id) || jsonb_build_object('role', p.role)") && !/'(user_)?id', p\.user_id/.test(fn("voice_card")), "people are shown by handle (dm_who), never by id");
});

/* ---------- The voice edge function, run for real ---------- */

const ENV = {
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "service-key",
  LIVEKIT_URL: "wss://marble-test.livekit.cloud", LIVEKIT_API_KEY: "APIkey123", LIVEKIT_API_SECRET: "the-livekit-secret",
};
const handlers = [];
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handlers.push(h); } };
const mod = await import(FN_FILE.href);
const serve = handlers[0];
const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const jwtWith = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

let calls = [];
let rpcReply = () => ({ status: 200, body: {} });
let lkStatus = 200;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: u, headers: init.headers || {}, body });
  if (u === `${ENV.SUPABASE_URL}/auth/v1/user`) {
    const ok = /^Bearer h\./.test(init.headers.Authorization) && init.headers.apikey === ENV.SUPABASE_SERVICE_ROLE_KEY;
    return new Response(JSON.stringify(ok ? { id: USER } : { msg: "bad" }), { status: ok ? 200 : 401 });
  }
  if (u.startsWith(`${ENV.SUPABASE_URL}/rest/v1/rpc/`)) { const r = rpcReply(u.split("/rpc/")[1], body); return new Response(JSON.stringify(r.body), { status: r.status }); }
  if (u.startsWith("https://marble-test.livekit.cloud/twirp/livekit.RoomService/")) return new Response("{}", { status: lkStatus });
  throw new Error(`unexpected fetch ${u}`);
};
const call = (body, { token = jwtWith({ sub: USER, aal: "aal1" }), origin = "https://trademarble.app", method = "POST" } = {}) =>
  serve(new Request("https://sb.test/functions/v1/voice", { method, headers: { Authorization: token ? `Bearer ${token}` : "", Origin: origin, "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined }));
const b64json = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
async function verify(token) {
  const [h, p, sig] = token.split(".");
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(ENV.LIVEKIT_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await webcrypto.subtle.verify("HMAC", key, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${h}.${p}`));
  return { ok, head: b64json(h), claims: b64json(p) };
}

test("the function is one small file: no imports, under 6 KB, verify_jwt on", () => {
  assert.ok(statSync(FN_FILE).size < 6144, `${statSync(FN_FILE).size} bytes`);
  assert.ok(!/^\s*import\s/m.test(FN), "self-contained");
  assert.ok(!/console\.log/.test(FN));
  assert.equal(typeof mod.sign, "function");
});

test("CORS answers Marble's own pages only", async () => {
  const pre = await call(null, { method: "OPTIONS" });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("Access-Control-Allow-Origin"), "https://trademarble.app");
  assert.match(pre.headers.get("Access-Control-Allow-Headers"), /authorization/);
  const evil = await call(null, { method: "OPTIONS", origin: "https://evil.example" });
  assert.equal(evil.headers.get("Access-Control-Allow-Origin"), null);
});

test("no sign-in, no token; a session id is checked before the database is asked", async () => {
  calls = [];
  assert.equal((await call({ op: "join", session: SESSION }, { token: null })).status, 401);
  assert.equal((await call({ op: "join", session: SESSION }, { token: "nonsense" })).status, 401);
  const r = await call({ op: "join", session: "x'; drop" });
  assert.equal(r.status, 400);
  assert.ok(!calls.some((c) => c.url.includes("/rpc/")), "no database call for a bad session id");
});

test("tuning in as a listener: a 10-minute token for that room only, signed with the secret, that can't talk or send data", async () => {
  calls = [];
  rpcReply = (name, body) => (name === "voice_join" ? { status: 200, body: { room: "v_abc", role: "listener", who: { handle: "theo", avatar: "gods/titan-silhouette", crew: "OLY", staff: false } } } : { status: 500, body: {} });
  const now = Math.floor(Date.now() / 1000);
  const r = await call({ op: "join", session: SESSION });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.url, ENV.LIVEKIT_URL);
  assert.equal(j.role, "listener");
  const rpc = calls.find((c) => c.url.endsWith("/rpc/voice_join"));
  assert.deepEqual(rpc.body, { p_user: USER, p_session: SESSION, p_aal2: false });
  assert.equal(rpc.headers.Authorization, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
  const { ok, head, claims } = await verify(j.token);
  assert.ok(ok, "signature checks out with the API secret");
  assert.deepEqual(head, { alg: "HS256", typ: "JWT" });
  assert.equal(claims.iss, ENV.LIVEKIT_API_KEY);
  assert.equal(claims.sub, "theo");
  assert.ok(Math.abs(claims.exp - now - 600) <= 2 && claims.nbf <= now);
  assert.deepEqual(claims.video, { room: "v_abc", roomJoin: true, canSubscribe: true, canPublish: false, canPublishSources: [], canPublishData: false, canUpdateOwnMetadata: false });
  assert.deepEqual(JSON.parse(claims.metadata), { handle: "theo", avatar: "gods/titan-silhouette", crew: "OLY", staff: false, role: "listener" });
  const text = JSON.stringify(j);
  for (const secret of [ENV.LIVEKIT_API_SECRET, ENV.SUPABASE_SERVICE_ROLE_KEY]) assert.ok(!text.includes(secret));
});

test("hosts and guests can talk (microphone only); two-step sign-in is read from the checked token", async () => {
  calls = [];
  rpcReply = () => ({ status: 200, body: { room: "v_abc", role: "host", who: { handle: "jules", avatar: null, crew: null, staff: true } } });
  const r = await call({ op: "join", session: SESSION }, { token: jwtWith({ sub: USER, aal: "aal2" }) });
  const { claims } = await verify((await r.json()).token);
  assert.equal(claims.video.canPublish, true);
  assert.deepEqual(claims.video.canPublishSources, ["microphone"]);
  assert.equal(claims.video.canPublishData, false);
  assert.equal(calls.find((c) => c.url.endsWith("/rpc/voice_join")).body.p_aal2, true);
});

test("the database's refusals come back in its own words: 403 for not allowed, 400 for the rest", async () => {
  for (const [code, message, status] of [["42501", WHY.hostOnly, 403], ["P0001", WHY.notYet, 400], ["P0001", WHY.banned, 400]]) {
    rpcReply = () => ({ status: code === "42501" ? 403 : 400, body: { code, message } });
    const r = await call({ op: "join", session: SESSION });
    assert.equal(r.status, status, message);
    assert.equal((await r.json()).error, message);
  }
  rpcReply = () => ({ status: 500, body: { code: "XX000", message: "internal detail" } });
  const broken = await call({ op: "join", session: SESSION });
  assert.equal(broken.status, 502);
  assert.doesNotMatch((await broken.json()).error, /internal detail/, "the database's own text never reaches a trader");
});

test("every host action is checked by the database first, then done in LiveKit with a one-minute admin token", async () => {
  const cases = [
    [{ action: "mute", handle: "kenji", track: "TR_AbC123" }, "MutePublishedTrack", { room: "v_abc", identity: "kenji", trackSid: "TR_AbC123", muted: true }],
    [{ action: "speak", handle: "sol" }, "UpdateParticipant", { room: "v_abc", identity: "sol", permission: { canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: ["MICROPHONE"] } }],
    [{ action: "listen", handle: "sol" }, "UpdateParticipant", { room: "v_abc", identity: "sol", permission: { canSubscribe: true, canPublish: false, canPublishData: false, canPublishSources: [] } }],
    [{ action: "remove", handle: "sol" }, "RemoveParticipant", { room: "v_abc", identity: "sol" }],
    [{ action: "ban", handle: "sol", days: 1 }, "RemoveParticipant", { room: "v_abc", identity: "sol" }],
    [{ action: "end" }, "DeleteRoom", { room: "v_abc" }],
  ];
  for (const [b, method, lkBody] of cases) {
    calls = [];
    rpcReply = (name) => (name === "voice_mod" ? { status: 200, body: { room: "v_abc" } } : { status: 500, body: {} });
    const r = await call({ op: "mod", session: SESSION, ...b });
    assert.equal(r.status, 200, b.action);
    const rpc = calls.find((c) => c.url.endsWith("/rpc/voice_mod"));
    assert.deepEqual(rpc.body, { p_user: USER, p_session: SESSION, p_handle: b.handle ?? null, p_action: b.action, p_days: b.days ?? null, p_aal2: false });
    const lk = calls.find((c) => c.url.includes("/twirp/"));
    assert.equal(lk.url, `https://marble-test.livekit.cloud/twirp/livekit.RoomService/${method}`);
    assert.deepEqual(lk.body, lkBody);
    const { ok, claims } = await verify(lk.headers.Authorization.replace("Bearer ", ""));
    assert.ok(ok);
    assert.deepEqual(claims.video, { room: "v_abc", roomAdmin: true });
    assert.equal(claims.exp - claims.nbf, 70);
    assert.ok(calls.indexOf(rpc) < calls.indexOf(lk), "the database decides before LiveKit is told");
  }
});

test("a refused action never reaches LiveKit; odd input is cleaned; LiveKit failing says so", async () => {
  calls = [];
  rpcReply = () => ({ status: 403, body: { code: "42501", message: WHY.hostOnly } });
  const r = await call({ op: "mod", session: SESSION, action: "remove", handle: "kenji" });
  assert.equal(r.status, 403);
  assert.ok(!calls.some((c) => c.url.includes("/twirp/")));
  rpcReply = () => ({ status: 200, body: { room: "v_abc" } });
  calls = [];
  assert.equal((await call({ op: "mod", session: SESSION, action: "mute", handle: "kenji", track: "../../x" })).status, 400);
  assert.ok(!calls.some((c) => c.url.includes("/twirp/")));
  calls = [];
  await call({ op: "mod", session: SESSION, action: "ban", handle: "sol", days: 30 });
  assert.equal(calls.find((c) => c.url.endsWith("/rpc/voice_mod")).body.p_days, null, "only 1 or 7 days pass through (null: for good, staff only)");
  lkStatus = 404;
  assert.equal((await call({ op: "mod", session: SESSION, action: "remove", handle: "sol" })).status, 200, "already gone is fine");
  lkStatus = 500;
  const quiet = console.error;
  console.error = () => {};
  try { assert.equal((await call({ op: "mod", session: SESSION, action: "remove", handle: "sol" })).status, 502); } finally { console.error = quiet; }
  lkStatus = 200;
  assert.equal((await call({ op: "nope", session: SESSION })).status, 400);
});

test("without the LiveKit secrets it says voice isn't switched on, and asks nothing", async () => {
  const saved = ENV.LIVEKIT_API_SECRET;
  ENV.LIVEKIT_API_SECRET = "";
  await import(`${FN_FILE.href}?off`);
  ENV.LIVEKIT_API_SECRET = saved;
  calls = [];
  const r = await handlers[1](new Request("https://sb.test/functions/v1/voice", { method: "POST", headers: { Authorization: `Bearer ${jwtWith({})}` }, body: "{}" }));
  assert.equal(r.status, 503);
  assert.equal(calls.length, 0);
});

test("the app may use the microphone and reach LiveKit; the website may not use the microphone", () => {
  const b = readFileSync(new URL("../scripts/build-web.mjs", import.meta.url), "utf8");
  assert.ok(b.includes('const LIVEKIT = "https://*.livekit.cloud wss://*.livekit.cloud";'));
  assert.match(b, /`connect-src [^`]*\$\{LIVEKIT\}`/);
  assert.ok(b.includes('const APP_MIC = "  Permissions-Policy: camera=(), microphone=(self), geolocation=()";'));
  assert.ok(b.includes('const NO_MIC = "  Permissions-Policy: camera=(), microphone=(), geolocation=()";'));
  assert.match(b, /"\/desk\/\*",\n  "  X-Frame-Options: DENY",[\s\S]*?APP_MIC,\n  "\/guides\/\*"/);
  assert.match(b, /"\/guides\/\*",\n  "  X-Frame-Options: SAMEORIGIN",\n  NO_MIC,/);
  assert.match(b, /"  X-Frame-Options: SAMEORIGIN", NO_MIC,/);
  const all = b.slice(b.indexOf('"/*",'), b.indexOf('"/desk/*"'));
  assert.ok(!/Permissions-Policy|MIC/.test(all), "no microphone rule on /* to collide with the app's");
  assert.ok(!/script-src[^`]*livekit/.test(b), "no LiveKit scripts: the SDK is bundled");
});

test("the privacy policy, terms and community rules say how voice works, and that it's coming soon", () => {
  const docs = readFileSync(new URL("../src/site/legal/docs.js", import.meta.url), "utf8");
  for (const line of ["{ h: \"Voice sessions\", p: [", "LiveKit, for voice sessions once they launch (they're coming soon).", "We don't record or store it, LiveKit doesn't either, and there's no transcript.",
    "Voice sessions, once they launch: we never keep the audio.", "Don't record a voice session", "Voice sessions are coming soon. Once they launch, they're live, and we never record them",
    "Voice sessions are coming soon. Until they launch, none of this section applies and we collect nothing for them.",
    "Voice sessions, once they launch (they're coming soon):", "voice sessions (coming soon)", "Voice sessions are only for people aged 18 and over."]) assert.ok(docs.includes(line), line);
  assert.equal(docs.split('{ h: "Voice sessions", p: [').length - 1, 2, "a section in the privacy policy and one in the community rules");
});

/* ---------- Coming soon ---------- */

test("voice is coming soon: one flag hides every real entry point", () => {
  const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
  assert.match(src("mode.js"), /^export const VOICE_LIVE = false;$/m, "off until there's demand and LiveKit keys");
  assert.ok(src("App.jsx").includes("{VOICE_LIVE && <VoiceDock "), "the dock");
  const cm = src("views/Community.jsx");
  assert.ok(cm.includes("VOICE_LIVE ? source.voiceNow() : { me: {}, sessions: [] }") && cm.includes("if (!LIVE || !VOICE_LIVE) return;"), "no sessions asked for");
  const chat = src("views/community/Chat.jsx");
  assert.ok(chat.includes("const sessions = VOICE_LIVE ? voice?.data?.sessions || [] : [];"), "no On air switch, strip or room marks without sessions");
  assert.ok(chat.includes("const tuned = VOICE_LIVE && v.status === \"on\"") && chat.includes("const owner = VOICE_LIVE && "), "the strip and the schedule button");
  assert.ok(chat.includes("!VOICE_LIVE && (") && chat.includes("const inVoice = !VOICE_LIVE && chatRoom === VOICE_SOON.id;"), "the coming-soon row and panel only while it's off");
});

test("the preview runs on sample data only: no microphone, no engine, no voice function, no database", () => {
  const soon = readFileSync(new URL("../src/views/community/voice/VoiceSoon.jsx", import.meta.url), "utf8");
  const code = soon.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\bsource\.|voiceJoin|voiceState|tuneIn|\.\/engine|getUserMedia|livekit/i.test(code), "nothing reaches out");
  assert.ok(soon.includes("previewSession") && soon.includes("<Air s={s} phone={phone} preview") && soon.includes("readonly"));
});

test("demand is the vote on one idea in Ideas & polls, matched by its title", () => {
  assert.equal(VOICE_IDEA.title, "Live voice sessions in Community");
  assert.ok(isVoiceIdea({ title: "  live voice  sessions in community " }));
  assert.ok(!isVoiceIdea({ title: "Live voice sessions" }));
  const sample = readFileSync(new URL("../src/sample.js", import.meta.url), "utf8");
  assert.ok(sample.includes(`title: "${VOICE_IDEA.title}", body: "${VOICE_IDEA.body}", area: "${VOICE_IDEA.area}"`), "the demo's idea is the one the owner adds");
});
