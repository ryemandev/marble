import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  COMPETITION_MOVES, GIVEAWAY_MOVES, actionWord, ago, competitionErrors, giveawayErrors,
  linesFromText, prizesFromText, prizesToText, rulesFromText, rulesToText, slugOf,
} from "../src/admin/model.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GIFTS = read("../supabase/migrations-pending/20261031150000_admin_gifts.sql");
const AREA = read("../supabase/migrations-pending/20261031150100_admin_area.sql");
const REWORK = read("../supabase/migrations-pending/20261103100000_admin_rework.sql");
const TODAY = read("../supabase/migrations-pending/20261107120000_admin_today.sql");
const PINS = read("../supabase/migrations-pending/20261107100000_pinned_posts.sql");
const SQL = `${GIFTS}\n${AREA}\n${REWORK}\n${TODAY}\n${PINS}`;
const COMMUNITY_4 = read("../supabase/migrations-pending/20261029160300_community_4_events.sql");

function fn(name) {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name}() is defined`);
  const body = SQL.indexOf("$$", start);
  return SQL.slice(start, SQL.indexOf("$$;", body + 2) + 3);
}
const FUNCTIONS = [...SQL.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
const GRANTED = [...SQL.matchAll(/grant execute on function public\.([a-z_]+)\([^)]*\) to authenticated/g)].map((m) => m[1]);
const ADMIN_RPCS = GRANTED.filter((n) => n.startsWith("admin_"));
const bodyOf = (name) => { const f = fn(name); return f.slice(f.indexOf("$$") + 2); };
const WRITES = /\b(insert into|update public\.|delete from)\b/;

/* ---------- The door and the log ---------- */

test("every admin_ function the browser can call opens with admin_gate(): an admin, signed in with two-step", () => {
  assert.ok(ADMIN_RPCS.length >= 30, `${ADMIN_RPCS.length} admin functions`);
  for (const name of ADMIN_RPCS) {
    const body = bodyOf(name);
    const begin = body.indexOf("begin");
    const gate = body.indexOf("public.admin_gate()");
    assert.ok(gate >= 0, `${name} calls admin_gate()`);
    const firstStatement = body.slice(begin + 5).trimStart();
    const sqlOnly = begin < 0 && body.trimStart().startsWith("select public.admin_gate()");  // admin_whoami: the gate itself
    assert.ok(sqlOnly || gate < begin || firstStatement.startsWith("perform public.admin_gate();"), `${name} checks the door before anything else`);
    assert.ok(!/\b(from|into|update) public\./.test(body.slice(0, Math.max(begin, 0)).replace(/public\.admin_gate\(\)/, "")), `${name} reads no table before the door`);
    assert.ok(SQL.includes(`revoke all on function public.${name}(`), `${name}: revoked from public and anon`);
  }
  const gate = fn("admin_gate");
  assert.ok(gate.includes("public.is_admin()"));
  assert.ok(gate.includes("->> 'aal', '') <> 'aal2'"), "two-step: the session's aal is aal2");
  assert.ok(GIFTS.includes("revoke all on function public.admin_gate() from public, anon, authenticated;"));
  for (const internal of ["admin_gate", "admin_note"]) {
    assert.ok(!GRANTED.includes(internal), `${internal} is internal`);
  }
});

test("every admin write is logged, and the log can't be changed, deleted, emptied or read from the browser", () => {
  const writers = ADMIN_RPCS.filter((n) => WRITES.test(bodyOf(n)) || /public\.(giveaway_seal|giveaway_draw|competition_finalise)\(/.test(bodyOf(n)));
  assert.ok(writers.length >= 18, `${writers.length} write functions`);
  for (const name of writers) assert.ok(bodyOf(name).includes("perform public.admin_note("), `${name} writes to the admin log`);
  assert.ok(GIFTS.includes("before update or delete on public.admin_log"));
  assert.ok(GIFTS.includes("before truncate on public.admin_log"));
  assert.ok(GIFTS.includes("revoke all on table public.admin_log from anon, authenticated;"));
  assert.ok(GIFTS.includes("revoke all on table public.admin_log from service_role;"));
  assert.ok(!/create policy [^;]* on public\.admin_log/.test(SQL), "no policy opens it");
});

test("nothing new runs as its owner with a loose search_path, and new tables are closed", () => {
  for (const name of FUNCTIONS) {
    const f = fn(name);
    if (f.includes("security definer")) assert.ok(f.includes("set search_path = ''"), `${name}: search_path = ''`);
  }
  assert.ok(SQL.includes("alter table public.admin_log enable row level security;"));
  assert.ok(/revoke all on table public\.admin_log from anon, authenticated/.test(SQL));
});

test("events: writes go through the admin functions only (two-step, logged), never straight to the tables", () => {
  for (const p of ["competitions: admin manages", "competition entries: admin manages", "competition results: admin manages",
    "giveaways: admin manages", "giveaway entries: admin marks invalid", "giveaway winners: admin manages"]) {
    assert.ok(COMMUNITY_4.includes(`create policy "${p}"`), `${p} existed`);
    assert.ok(AREA.includes(`drop policy "${p}"`), `${p} is dropped`);
  }
  for (const f of ["competition_finalise(uuid)", "giveaway_seal(uuid)", "giveaway_draw(uuid, integer)"]) {
    assert.ok(AREA.includes(`revoke execute on function public.${f} from authenticated;`), `${f}: only through admin_`);
  }
  assert.ok(fn("admin_competition_status").includes("p_status = 'cancelled' and v_c.status in ('open', 'live', 'review')"));
  assert.ok(fn("admin_giveaway_status").includes("p_status = 'cancelled' and v_g.status in ('open', 'closed')"));
  assert.ok(fn("admin_competition_delete").includes("v_c.status <> 'draft'"));
  assert.ok(fn("admin_giveaway_delete").includes("v_g.status <> 'draft'"));
  assert.ok(fn("admin_competition_save").includes("new rules need a new rules version"));
  // The page's moves are ones the database allows
  const allowed = { draft: ["open"], open: ["live", "draft"], live: ["review"], review: ["final"] };
  for (const [from, moves] of Object.entries(COMPETITION_MOVES)) for (const [to] of moves) assert.ok(allowed[from]?.includes(to), `competition ${from} -> ${to}`);
  for (const [from, moves] of Object.entries(GIVEAWAY_MOVES)) for (const [to] of moves) {
    if (["seal", "draw", "redraw"].includes(to)) continue;
    assert.ok({ draft: ["open"], open: ["closed", "draft"] }[from]?.includes(to), `giveaway ${from} -> ${to}`);
  }
});

test("reports: a trader's new report always starts open; anonymous authors show only to the admin", () => {
  assert.ok(AREA.includes("new.resolved_at := null; new.resolution := null; new.resolved_by := null;"));
  assert.ok(AREA.includes("before insert on public.reports"));
  assert.ok(fn("admin_reports").includes("'anonymous', x.anonymous"));
  assert.ok(fn("admin_report_resolve").includes("left(v_text, 200)"), "a deleted post leaves its first 200 characters in the log");
});

test("traders: counts only, never journal contents", () => {
  const f = fn("admin_trader");
  for (const never of ["t.pnl", "t.note", "t.symbol", "public.notes", "public.pages", "public.daily_plans", "public.notebooks", "dm_messages"]) {
    assert.ok(!f.includes(never), `admin_trader never reads ${never}`);
  }
  assert.ok(f.includes("count(*) from public.trades"));
  // % and _ in a search are letters, not wildcards
  assert.ok(fn("admin_traders").includes("replace(replace(replace(v_q, '\\', '\\\\'), '%', '\\%'), '_', '\\_')"));
});

/* ---------- The page ---------- */

test("the page calls only admin functions that exist, and holds no server key", () => {
  const dir = new URL("../src/admin/", import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(jsx?|css)$/.test(f) && f !== "preview.js");
  const called = new Set();
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/(?:rpc|useRpc)\("([a-z_]+)"/g)) called.add(m[1]);
    assert.ok(!/service_role|SERVICE_ROLE|sb_secret/.test(src), `${f} holds no server key`);
  }
  for (const name of called) assert.ok(name === "is_admin" || ADMIN_RPCS.includes(name) || (name === "pin_post" && GRANTED.includes(name)), `${name} is an admin function in the migrations`);
  assert.ok(called.size >= 20, `${called.size} functions called`);
  const api = readFileSync(new URL("api.js", dir), "utf8");
  assert.ok(/import\.meta\.env\.DEV && previewing\(\)\) return \(await import\("\.\/preview\.js"\)\)/.test(api), "preview data loads in dev only");
});

test("time and the log read plainly", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  assert.equal(ago("2026-10-30T11:59:30Z", now), "just now");
  assert.equal(ago("2026-10-30T11:56:00Z", now), "4 min ago");
  assert.equal(ago("2026-10-30T09:00:00Z", now), "3 h ago");
  assert.equal(ago("2026-10-29T10:00:00Z", now), "1 day ago");
  assert.equal(ago(null, now), "never");
  assert.equal(actionWord("giveaway.draw"), "Ran a draw");
});

test("rules, prizes and slugs, as written in the event form", () => {
  const text = "Who can enter\nAnyone 18 or over.\n\nHow it's scored\nEach trade's R is capped at +3R.\nA broken day costs 2R.";
  const rules = rulesFromText(text);
  assert.deepEqual(rules, [["Who can enter", "Anyone 18 or over."], ["How it's scored", "Each trade's R is capped at +3R.\nA broken day costs 2R."]]);
  assert.equal(rulesToText(rules), text);
  assert.deepEqual(rulesFromText("\r\n\r\nOne\r\n  \r\nTwo\r\nText"), [["One", ""], ["Two", "Text"]]);
  assert.deepEqual(linesFromText(" a \n\n b"), ["a", "b"]);
  const prizes = prizesFromText("1st | £250 | Paid within 14 days\n2nd | £100", true);
  assert.deepEqual(prizes, [{ place: "1st", title: "£250", detail: "Paid within 14 days" }, { place: "2nd", title: "£100", detail: "" }]);
  assert.equal(prizesToText(prizes, true), "1st | £250 | Paid within 14 days\n2nd | £100");
  assert.deepEqual(prizesFromText("A trading book | Sent by post", false), [{ title: "A trading book", detail: "Sent by post" }]);
  assert.equal(slugOf("The Discipline Cup: November!"), "the-discipline-cup-november");
  assert.match(slugOf("x".repeat(90)), /^x{60}$/);
});

test("the event forms ask for what the database's checks need", () => {
  const good = { title: "The Cup", slug: "the-cup", starts_on: "2026-11-02", ends_on: "2026-11-13", entry_closes_at: "2026-11-01T12:00", rules_version: "1.0" };
  assert.deepEqual(competitionErrors(good), {});
  assert.ok(competitionErrors({ ...good, ends_on: "2026-11-01" }).ends_on);
  assert.ok(competitionErrors({ ...good, slug: "The Cup" }).slug);
  assert.ok(competitionErrors({ ...good, art: "../etc" }).art);
  const g = { title: "Draw", slug: "draw", opens_at: "2026-11-01T09:00", closes_at: "2026-11-08T09:00", draw_at: "2026-11-08T12:00", winners_count: 1, claim_days: 14, rules_version: "1.0" };
  assert.deepEqual(giveawayErrors(g), {});
  assert.ok(giveawayErrors({ ...g, closes_at: "2026-11-01T08:00" }).closes_at);
  assert.ok(giveawayErrors({ ...g, draw_at: "2026-11-07T12:00" }).draw_at);
  assert.ok(giveawayErrors({ ...g, winners_count: 0 }).winners_count);
  assert.ok(giveawayErrors({ ...g, claim_days: 91 }).claim_days);
  // The same limits as community_4's checks
  assert.ok(COMMUNITY_4.includes("slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$')"));
  assert.ok(COMMUNITY_4.includes("winners_count integer not null check (winners_count between 1 and 100)"));
  assert.ok(COMMUNITY_4.includes("claim_days integer not null default 14 check (claim_days between 1 and 90)"));
});
