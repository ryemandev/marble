import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findMessages, findPages, findPosts, findTrades, fold, hasAll, ready, snippet, wordsOf } from "../src/lib/search.js";
import { findCopies, fold as foldCopies } from "../src/lib/copies.js";
import { forgetHandle, forgetMessage, forgetThread, seenInbox, seenSent, seenThread, seenThreads } from "../src/views/community/dmSeen.js";

const text = (parts) => parts.map((p) => p.text).join("");
const hits = (parts) => parts.filter((p) => p.hit).map((p) => p.text);

test("words: case, accents and order don't matter; one letter isn't a search", () => {
  assert.deepEqual(wordsOf("  ORB  Retest "), ["orb", "retest"]);
  assert.equal(fold("Café Éclair"), "cafe eclair");
  assert.ok(hasAll("Waited for the ORB retest", wordsOf("retest orb")));
  assert.ok(!hasAll("Waited for the ORB", wordsOf("orb retest")));
  assert.equal(ready("o"), false);
  assert.equal(ready("or"), true);
  assert.equal(ready("   "), false);
  assert.equal(wordsOf("a b c d e f g h").length, 6);
  assert.equal(wordsOf("orb orb ORB").length, 1);
});

test("snippets: the matched characters exactly, cut around the first match at word edges", () => {
  const p = snippet("Took the ORB retest after the first five-minute candle closed above", wordsOf("orb"));
  assert.deepEqual(hits(p), ["ORB"]);
  assert.equal(text(p), "Took the ORB retest after the first five-minute candle closed above");
  const long = `${"Patience is the edge. ".repeat(10)}The ORB only after the close. ${"Never chase. ".repeat(10)}`;
  const cut = snippet(long, wordsOf("orb"), 60);
  assert.equal(cut[0].text, "…");
  assert.equal(cut.at(-1).text, "…");
  assert.deepEqual(hits(cut), ["ORB"]);
  assert.ok(text(cut).length <= 64);
  assert.ok(long.includes(` ${cut[1].text}`), "starts on a whole word");
  // Accents: the original characters are marked
  assert.deepEqual(hits(snippet("Le café était bon", wordsOf("cafe etait"))), ["café", "était"]);
  // Overlapping and repeated matches merge
  assert.deepEqual(hits(snippet("vwap vwap reclaim", wordsOf("vwap vw"))), ["vwap", "vwap"]);
  assert.deepEqual(snippet("", ["x"]), []);
  // New lines become spaces
  assert.equal(text(snippet("line one\n\nline two", wordsOf("two"))), "line one line two");
});

const iso = (d) => new Date(Date.UTC(2026, 9, d, 14)).toISOString();
const T = (id, extra) => ({ id, symbol: "NQZ6", side: "long", setup: "", note: "", traded_at: iso(10), account: "a", ...extra });

test("trades: symbol, setup and note; an exact symbol first, then newest; copies are one result", () => {
  const trades = [
    T("1", { setup: "ORB retest", traded_at: iso(12) }),
    T("2", { symbol: "ORBX", traded_at: iso(1) }),
    T("3", { note: "Skipped the orb, waited for VWAP", traded_at: iso(20) }),
    T("4", { setup: "VWAP reclaim" }),
  ];
  const r = findTrades(trades, wordsOf("orb"));
  assert.deepEqual(r.map((x) => x.id), ["3", "1", "2"]);
  assert.deepEqual(hits(r[0].parts), ["orb"]); // the note is shown when the match is in it
  assert.deepEqual(hits(r[1].parts), ["ORB"]);
  assert.deepEqual(findTrades(trades, wordsOf("nqz6")).map((x) => x.id), ["3", "1", "4"]);
  assert.equal(findTrades(trades, wordsOf("orbx"))[0].exact, 1);
  // Twelve accounts, one decision
  const copies = Array.from({ length: 12 }, (_, i) => T(`c${i}`, { account: `acc${i}`, setup: "ORB", entry: 21000, exit: 21010, pnl: 100, closedAt: iso(10) }));
  const r2 = findTrades(foldCopies(copies, findCopies(copies)), wordsOf("orb"));
  assert.equal(r2.length, 1);
  assert.equal(r2[0].copies, 12);
});

test("study pages: titles and lines through Study's own search", () => {
  const notebooks = [{ id: "nb1", title: "Opening range", position: 0 }];
  const pages = [{ id: "p1", notebookId: "nb1", n: 1, title: "ORB rules", lines: [{ t: null, text: "Only after the first 5-min candle closes", key: true }, { t: 30, text: "ORB fails on news days", key: false }] }];
  const r = findPages(notebooks, pages, "orb");
  assert.equal(r.length, 2);
  assert.equal(r[0].isTitle, true);
  assert.equal(r[0].notebook, "Opening range");
  assert.equal(r[1].pageId, "p1");
  assert.equal(r[1].page, 1);
  assert.deepEqual(hits(r[1].parts), ["ORB"]);
  assert.deepEqual(findPages(notebooks, pages, "o"), []);
});

test("posts: only what the server returned, every word, a reply opens its post, no name on an anonymous one", () => {
  const rows = [
    { id: "a", parent_id: null, body: "ORB worked again today", created_at: iso(3), author_handle: "kenji", anonymous: false },
    { id: "b", parent_id: "a", body: "Same, the ORB at 9:35", created_at: iso(4), author_handle: "maya", anonymous: false },
    { id: "c", parent_id: null, body: "Blew my ORB account", created_at: iso(5), author_handle: "leak", anonymous: true },
  ];
  const r = findPosts(rows, wordsOf("orb"));
  assert.equal(r.length, 3);
  assert.equal(r[1].postId, "a");
  assert.equal(r[1].reply, true);
  assert.equal(r[2].who, null);
  assert.equal(findPosts(rows, wordsOf("orb worked")).length, 1);
});

test("messages: only the ones on this device, for the trader signed in, newest match per conversation", () => {
  seenInbox("me", { threads: [{ id: "t1", with: { handle: "kenji" }, at: iso(5), last: { id: "m3", body: "see you at the open", at: iso(5), mine: false } },
    { id: "t2", with: { handle: "maya" }, at: iso(2), last: { id: "m9", body: "thanks!", at: iso(2), mine: true } }] });
  seenThread("me", { thread: { id: "t1", with: { handle: "kenji" } }, messages: [{ id: "m1", body: "Your ORB rules page is great", at: iso(3) }, { id: "m2", body: "ORB again tomorrow?", at: iso(4), mine: true }] });
  const r = findMessages(seenThreads("me"), wordsOf("orb"));
  assert.equal(r.length, 1);
  assert.equal(r[0].threadId, "t1");
  assert.deepEqual(hits(r[0].parts), ["ORB"]);
  assert.equal(text(r[0].parts), "ORB again tomorrow?");
  // By the other trader's handle
  assert.equal(findMessages(seenThreads("me"), wordsOf("maya"))[0].threadId, "t2");
  // Another sign-in in the same tab sees none of them
  assert.deepEqual(seenThreads("someone-else"), []);
  // Sent, unsent, left and blocked
  seenSent("me", "t2", { id: "m10", body: "orb tomorrow", at: iso(6), mine: true });
  assert.equal(findMessages(seenThreads("me"), wordsOf("orb")).length, 2);
  forgetMessage("m10");
  assert.equal(findMessages(seenThreads("me"), wordsOf("orb")).length, 1);
  forgetHandle("kenji");
  assert.equal(findMessages(seenThreads("me"), wordsOf("orb")).length, 0);
  forgetThread("t2");
  assert.deepEqual(seenThreads("me"), []);
});

const SQL = readFileSync(new URL("../supabase/migrations-pending/20261031170200_search_posts.sql", import.meta.url), "utf8");
const FEED = readFileSync(new URL("../supabase/migrations-pending/20261030100000_dms_and_sharing.sql", import.meta.url), "utf8");
const code = (s) => s.replace(/^\s*--.*$/gm, "");

test("search_posts: signed in only, rate-limited, pinned, and the feed's own visibility rules word for word", () => {
  assert.match(SQL, /security definer set search_path = ''/);
  assert.match(SQL, /if me is null then raise exception/);
  assert.match(SQL, /public\.rate_ok\(me, 'post_search', 60, interval '1 minute'\)/);
  assert.match(SQL, /revoke all on function public\.search_posts\(text, integer\) from public, anon;/);
  assert.match(SQL, /grant execute on function public\.search_posts\(text, integer\) to authenticated;/);
  assert.ok(!/to anon|service_role/.test(code(SQL).replace(/from public, anon/, "")));
  // What feed() hides, search hides
  assert.match(SQL, /where not p\.hidden/);
  assert.match(FEED, /not exists \(select 1 from public\.posts h where h\.id = p_parent and h\.hidden\)/);
  assert.match(SQL, /not exists \(select 1 from public\.posts h where h\.id = p\.parent_id and h\.hidden\)/);
  assert.match(FEED, /p\.anonymous or not exists \(select 1 from public\.dm_blocks b where b\.blocker = \(select auth\.uid\(\)\) and b\.blocked = p\.user_id\)/);
  assert.match(SQL, /p\.anonymous or not exists \(select 1 from public\.dm_blocks b where b\.blocker = me and b\.blocked = p\.user_id\)/);
  // An anonymous post never names its author, as in feed()
  assert.match(FEED, /case when p\.anonymous then null else pr\.handle end/);
  assert.match(SQL, /case when p\.anonymous then null else pr\.handle end/);
  assert.ok(SQL.includes("escape '\\'"));
  assert.match(SQL, /limit least\(greatest\(coalesce\(p_limit, 20\), 1\), 30\)/);
  // No server-side message search, on purpose
  assert.ok(!/dm_open|dm_messages/.test(code(SQL)));
});

test("the search box keeps the house rules: no blur, screen heights through var(--vh), the shortcut never fires while typing", () => {
  const css = readFileSync(new URL("../src/components/search.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/blur\(|backdrop-filter/.test(css));
  assert.ok(!/\d(vh|svh|dvh)\b/.test(css.replace(/var\(--vh[^)]*\)/g, "")));
  const jsx = readFileSync(new URL("../src/components/Search.jsx", import.meta.url), "utf8");
  assert.match(jsx, /e\.key === "\/".*\n.*\n.*input, textarea, select, \[contenteditable\]/);
  assert.match(jsx, /aria-modal|<Modal label="Search"/);
  assert.match(jsx, /role="combobox"/);
  assert.match(jsx, /aria-activedescendant/);
});
