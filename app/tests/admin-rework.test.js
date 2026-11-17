import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { BATCH, block, handleOwnerAlerts, mailsFor, subjectOf, verdict } from "../supabase/functions/_shared/owner-alerts.js";

// numbers.js asks Supabase; here it asks this fake instead
const asked = [];
globalThis.__numbers = { rows: [], error: null };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./supabase" && context.parentURL?.endsWith("/src/live/numbers.js")) {
      const fake = `export const supabase = { from: () => ({ select: () => ({ in: async (_c, want) => { globalThis.__asked.push(want); const n = globalThis.__numbers; return { data: n.error ? null : n.rows, error: n.error }; } }) }) };`;
      return { url: `data:text/javascript,${encodeURIComponent(fake)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
globalThis.__asked = asked;
const { numbersFor, rememberNumber, withNumbers } = await import("../src/live/numbers.js");

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SQL = read("../supabase/migrations-pending/20261103100000_admin_rework.sql");
const fn = (name) => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name}() is defined`);
  return SQL.slice(start, SQL.indexOf("$$;", SQL.indexOf("$$", start) + 2) + 3);
};
const FUNCTIONS = [...SQL.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
const NOW = Date.parse("2026-11-02T12:00:00Z");
const USER = "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f";

/* ---------- The database ---------- */

test("every admin function checks for an admin with two-step first", () => {
  const admin = FUNCTIONS.filter((n) => n.startsWith("admin_") && !["admin_paying", "admin_purge"].includes(n));
  assert.ok(admin.length >= 18, `${admin.length} admin functions`);
  for (const name of admin) {
    const body = fn(name).slice(fn(name).indexOf("$$") + 2);
    const first = body.match(/\b(select|perform|insert|update|delete|return)\b[^;]*/)?.[0] || "";
    assert.ok(/public\.admin_gate\(\)/.test(first), `${name}() starts with admin_gate()`);
  }
});

test("every new function is shut to the public, and opened only to who needs it", () => {
  const replaced = ["profiles_guard", "handle_free_for", "create_profile_for"]; // keep the grants they already have
  for (const name of FUNCTIONS.filter((n) => !replaced.includes(n))) {
    assert.ok(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public`).test(SQL), `${name}() is revoked from public`);
  }
  for (const name of FUNCTIONS) {
    const def = fn(name);
    if (/security definer/.test(def)) assert.ok(/set search_path = ''/.test(def), `${name}() pins search_path`);
  }
  for (const name of ["owner_alerts_cron_ok", "owner_alerts_due", "owner_alerts_done"]) {
    assert.ok(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`).test(SQL), `${name}() is shut to traders`);
    assert.ok(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role;`).test(SQL), `${name}() is for the server only`);
  }
  for (const name of ["owner_alert", "owner_alert_profile", "profiles_number", "admin_purge"]) {
    assert.ok(!new RegExp(`grant execute on function public\\.${name}\\(`).test(SQL), `${name}() is granted to nobody`);
  }
});

test("every RAISE has a value for each %, so the function can be made", () => {
  // Postgres refuses to make a function whose RAISE has more % than values (a literal one is %%). The trial run on
  // live caught 'A rate from 0% to 60%' on 2 Nov 2026.
  const dir = new URL("../supabase/migrations-pending/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(new URL(file, dir), "utf8");
    for (const m of sql.matchAll(/raise (?:exception|warning|notice) '((?:[^']|'')*)'([^;]*);/gi)) {
      const wanted = (m[1].replace(/%%/g, "").match(/%/g) || []).length;
      let depth = 0, quoted = false, given = 0;
      for (const ch of m[2].split(/\busing\b/i)[0]) {
        if (ch === "'") quoted = !quoted;
        else if (!quoted && ch === "(") depth++;
        else if (!quoted && ch === ")") depth--;
        else if (!quoted && depth === 0 && ch === ",") given++;
      }
      assert.equal(given, wanted, `${file}: raise '${m[1]}' has ${wanted} % and ${given} values`);
    }
  }
});

test("every account link in the rework's tables has an index, so deleting an account never reads a whole table", () => {
  // The database advisor flagged three on 2 Nov 2026 (unindexed foreign keys); 20261103110000 adds them
  const all = SQL + read("../supabase/migrations-pending/20261103110000_admin_fk_indexes.sql");
  let links = 0;
  for (const [, table, body] of SQL.matchAll(/create table public\.([a-z_]+) \(\n([\s\S]*?)\n\);/g)) {
    for (const c of body.matchAll(/^\s+([a-z_]+) uuid[^,\n]*references auth\.users\(id\)[^,\n]*/gm)) {
      links++;
      const col = c[1];
      const covered = /primary key/.test(c[0]) || new RegExp(`(primary key|unique) \\(${col}[,)]`).test(body)
        || new RegExp(`create (unique )?index [a-z_]+ on public\\.${table} \\(${col}[,)]`).test(all);
      assert.ok(covered, `${table}.${col} has an index`);
    }
  }
  assert.ok(links >= 8, `${links} account links`);
});

test("nobody can grow a table without limit, signed in or not", () => {
  // Every new table: row level security on, closed to traders (this database opens new tables, sequences and
  // functions to them by default)
  for (const m of SQL.matchAll(/create table public\.([a-z_]+)/g)) {
    assert.match(SQL, new RegExp(`alter table public\\.${m[1]} enable row level security;\\nrevoke all on table public\\.${m[1]} from anon, authenticated;`), `${m[1]} is closed`);
  }
  for (const seq of ["owner_alerts_id_seq", "member_no_seq"]) {
    assert.match(SQL, new RegExp(`revoke all on sequence public\\.${seq} from (public, )?anon, authenticated;`), `${seq} is closed`);
  }
  // seen() writes one row a day, for the caller only
  assert.match(fn("seen"), /select \(select auth\.uid\(\)\), \(now\(\) at time zone 'utc'\)::date where \(select auth\.uid\(\)\) is not null\n\s+on conflict do nothing/);
});

test("member numbers: the trader reads their own, others see it only while it's shown", () => {
  assert.match(SQL, /alter table public\.members enable row level security;/);
  assert.match(SQL, /revoke all on table public\.members from anon, authenticated;\ngrant select on table public\.members to authenticated;/);
  assert.match(SQL, /create policy "own number: read" on public\.members for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\);/);
  assert.match(SQL, /revoke all on sequence public\.member_no_seq from public, anon, authenticated;/);
  // A trader can change whether it shows, never the number
  assert.match(SQL, /grant update \(show_number\) on public\.profiles to authenticated;/);
  assert.ok(!/grant update \([^)]*member_no/.test(SQL), "member_no isn't theirs to write");
  for (const name of ["profiles_number", "profiles_guard"]) {
    assert.ok(fn(name).includes("member_no := case when new.show_number then (select m.no from public.members m where m.user_id ="), `${name}() copies the number only while shown`);
  }
  // Numbers follow the order accounts were made, and a new account never stops for one
  assert.match(SQL, /row_number\(\) over \(order by p\.created_at, p\.id\)/);
  assert.match(fn("profiles_number"), /exception when others then\n\s+raise warning/);
  // Admins find a trader by number
  assert.match(fn("admin_users"), /v_q ~ '\^#\?\[0-9\]\{1,9\}\$'/);
  assert.match(fn("admin_trader"), /'no', \(select m\.no from public\.members m where m\.user_id = p_user\)/);
});

test("the owner's emails: queued by triggers, never stopping a sign-up", () => {
  assert.match(SQL, /alter table public\.owner_alerts enable row level security;\nrevoke all on table public\.owner_alerts from anon, authenticated;/);
  assert.match(fn("owner_alert"), /on conflict \(kind, ref\) do nothing;\nexception when others then\n\s+raise warning/);
  assert.match(SQL, /create trigger owner_alert after insert on public\.profiles/);
  // pg_cron calls with the vault secret, only while something waits
  assert.match(SQL, /select cron\.schedule\(\n\s+'owner-alerts',\n\s+'\*\/2 \* \* \* \*'/);
  assert.match(SQL, /where exists \(select 1 from public\.owner_alerts a where a\.sent_at is null and a\.tries < 5/);
  assert.match(SQL, /x-marble-cron/);
  assert.match(fn("owner_alerts_cron_ok"), /vault\.decrypted_secrets/);
});

/* ---------- The owner's emails ---------- */

const signup = (over = {}) => ({ id: 7, kind: "signup", ref: USER, at: "2026-11-02T11:50:00Z", user_id: USER, no: 12, handle: "nadia.k", name: "Nadia Kerr",
  joined: "2026-11-02T11:49:00Z", provider: "google", heard_from: "instagram", ...over });

test("an email goes, or is dropped", () => {
  assert.equal(verdict(signup(), NOW), "send");
  assert.equal(verdict(signup({ handle: null }), NOW), "drop");
  assert.equal(verdict({ ...signup(), kind: "nonsense" }, NOW), "drop");
});

test("each email says who, their number and how they found Marble", () => {
  const s = block(signup(), NOW);
  assert.match(s, /^#12 · Nadia Kerr · @nadia\.k\n/);
  assert.match(s, /signed up with Google\./);
  assert.match(s, /Found Marble through Instagram\./);
  assert.ok(s.endsWith(`https://trademarble.app/admin#users/${USER}`));
  assert.equal(subjectOf(signup()), "New account #12 @nadia.k");

  // A hidden or missing number just isn't shown; odd names can't break a line or spoof one
  assert.equal(subjectOf(signup({ no: null })), "New account @nadia.k");
  assert.match(block(signup({ name: "Nadia\nSubject: free money‮" }), NOW), /^#12 · Nadia Subject: free money · @nadia\.k\n/);
  assert.ok(!block(signup({ user_id: "not-a-uuid" }), NOW).includes("admin#users"));
});

test("a handful come one by one; a rush comes as one email", () => {
  const totals = { accounts: 41 };
  const one = mailsFor([signup()], totals, NOW);
  assert.equal(one.length, 1);
  assert.equal(one[0].key, "marble-owner-alert-7");
  assert.match(one[0].text, /Marble now has 41 accounts/);
  const lot = mailsFor(Array.from({ length: BATCH + 2 }, (_, i) => signup({ id: 100 + i })), totals, NOW);
  assert.equal(lot.length, 1);
  assert.equal(lot[0].ids.length, BATCH + 2);
  assert.match(lot[0].subject, new RegExp(`^Marble: ${BATCH + 2} new accounts`));
  assert.deepEqual(mailsFor([], totals, NOW), []);
});

const cronReq = (secret = "a".repeat(64), body = "{}", method = "POST") => new Request("https://x.supabase.co/functions/v1/owner-alerts", { method, headers: { "x-marble-cron": secret }, ...(method === "POST" ? { body } : {}) });
function deps(over = {}) {
  const sent = [], marks = [];
  return {
    sent, marks,
    d: {
      cronOk: async (s) => s === "a".repeat(64),
      due: async () => ({ owners: ["support@example.com", "not an email"], totals: { accounts: 41 }, alerts: [signup(), signup({ id: 9, handle: null })] }),
      mark: async (done, failed) => marks.push({ done, failed }),
      resendKey: "re_test", now: () => NOW,
      sendMail: async (m) => sent.push(m),
      log: () => {},
      ...over,
    },
  };
}

test("the email job runs only for pg_cron's secret", async () => {
  const { d, sent } = deps();
  assert.equal((await handleOwnerAlerts(cronReq(undefined, undefined, "GET"), d)).status, 405);
  assert.equal((await handleOwnerAlerts(cronReq("b".repeat(64)), d)).status, 401);
  assert.equal((await handleOwnerAlerts(cronReq("a".repeat(63)), d)).status, 401);
  let asks = 0;
  assert.equal((await handleOwnerAlerts(cronReq("Z".repeat(64)), { ...d, cronOk: async () => { asks++; return true; } })).status, 401);
  assert.equal(asks, 0, "a secret that isn't hex never reaches the database");
  assert.equal((await handleOwnerAlerts(cronReq(), { ...d, cronOk: async () => { throw new Error("down"); } })).status, 401);
  assert.equal(sent.length, 0);
});

test("the email job sends, drops the dead ones, and marks them all", async () => {
  const { d, sent, marks } = deps();
  const r = await (await handleOwnerAlerts(cronReq(), d)).json();
  assert.deepEqual(r, { ok: true, waiting: 2, sent: 1, dropped: 1, failed: 0 });
  assert.deepEqual(sent[0].to, ["support@example.com"]);
  assert.equal(sent[0].subject, "New account #12 @nadia.k");
  assert.equal(sent[0].key, "marble-owner-alert-7");
  assert.match(sent[0].html, /^<!doctype html>|<p|<div|<pre/i);
  assert.deepEqual(marks, [{ done: [9, 7], failed: [] }]);

  // Dry run: shows the emails, sends and marks nothing
  const dry = deps();
  const out = await (await handleOwnerAlerts(cronReq(undefined, '{"dry":true}'), dry.d)).json();
  assert.equal(out.dry, true);
  assert.equal(out.mails[0].subject, "New account #12 @nadia.k");
  assert.equal(dry.sent.length + dry.marks.length, 0);

  // Resend down, or no key: counted as a try, kept for the next run
  const down = deps({ sendMail: async () => { throw Object.assign(new Error("resend"), { status: 503 }); } });
  assert.equal((await (await handleOwnerAlerts(cronReq(), down.d)).json()).failed, 1);
  assert.deepEqual(down.marks, [{ done: [9], failed: [7] }]);
  const nokey = deps({ resendKey: "" });
  await handleOwnerAlerts(cronReq(), nokey.d);
  assert.equal(nokey.sent.length, 0);
  assert.deepEqual(nokey.marks, [{ done: [9], failed: [7] }]);

  const broken = deps({ due: async () => { throw new Error("db"); } });
  assert.equal((await handleOwnerAlerts(cronReq(), broken.d)).status, 500);
});

test("the Privacy Policy says what the rework keeps", () => {
  const docs = read("../src/site/legal/docs.js");
  assert.match(docs, /Your member number: .*unless you hide it in Profile/);
  assert.match(docs, /The days you use the app: one line for each day you open it, with nothing about what you did\. Kept 400 days\./);
  assert.match(docs, /an email to the owner for each new account/);
});

/* ---------- Numbers beside names ---------- */

test("numbers beside names: looked up once, hidden ones stay empty, a failed lookup changes nothing", async () => {
  globalThis.__numbers = { rows: [{ handle: "nadia.k", member_no: 12 }, { handle: "mo_trades", member_no: null }], error: null };
  const posts = [{ author: { handle: "Nadia.K" } }, { author: { handle: "mo_trades" } }, { author: null }];
  await withNumbers(posts, (p) => p.author);
  assert.equal(posts[0].author.no, 12);
  assert.equal(posts[1].author.no, null);
  const before = asked.length;
  await numbersFor(["nadia.k", "mo_trades"]);
  assert.equal(asked.length, before, "kept for the visit");
  rememberNumber("nadia.k", null);
  assert.equal((await numbersFor(["nadia.k"]))("nadia.k"), null);
  globalThis.__numbers = { rows: null, error: { message: "down" } };
  const later = [{ author: { handle: "kenji.nq" } }];
  await withNumbers(later, (p) => p.author);
  assert.equal(later[0].author.no, null);
  assert.equal((await numbersFor(Array.from({ length: 300 }, (_, i) => `t${i}`)))("t0"), null);
  assert.ok(asked.at(-1).length <= 200, "at most 200 at a time");
});
