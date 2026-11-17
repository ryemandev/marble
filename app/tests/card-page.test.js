// The public card page: what it says, what it refuses to say and the headers a Worker has to send for itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cameFrom, cardPage, money, since } from "../web/worker.js";

const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public" };
const LIVE = { state: "live", kind: "trade", format: "wide", made_at: "2026-11-06T12:00:00Z", money: 400, sign: "$", simulated: false, file: 1, typed: 0, other: 0, gone: 0, same: true, days: 42 };
const answer = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
const open = async (body, id = "AbCdEfGh12") => {
  const r = await cardPage(id, env, "nonce", answer(body));
  return { r, html: await r.text() };
};

test("money reads like the card", () => {
  assert.equal(money(400), "+$400");
  assert.equal(money(-1250.5), "−$1,251");
  assert.equal(money(12.5, "£"), "+£12.50");
  assert.equal(money(1000, "¥"), "+¥1,000");
});

test("where it came from uses the journal's words and says nothing about anything else", () => {
  assert.equal(cameFrom({ file: 1 }), "From a file");
  assert.equal(cameFrom({ typed: 1 }), "Typed in");
  assert.equal(cameFrom({ file: 3 }), "All 3 from a file");
  assert.equal(cameFrom({ typed: 2 }), "All 2 typed in");
  assert.equal(cameFrom({ file: 2, typed: 1 }), "2 from a file, 1 typed in");
  assert.equal(cameFrom({ file: 2, other: 1 }), null);
  assert.equal(cameFrom({}), null);
});

test("since the card was made", () => {
  assert.equal(since({ gone: 0, same: true }), "Unchanged");
  assert.equal(since({ gone: 0, same: false }), "Edited");
  assert.equal(since({ gone: 1, file: 0, typed: 0, other: 0 }), "Deleted from the journal");
  assert.equal(since({ gone: 1, file: 2, typed: 0, other: 0 }), "Some deleted from the journal");
});

test("a live card gives a link preview its picture and stays out of search", async () => {
  const { r, html } = await open(LIVE);
  assert.equal(r.status, 200);
  assert.match(html, /property="og:image" content="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/cards\/AbCdEfGh12\.jpg"/);
  assert.match(html, /summary_large_image/);
  assert.match(html, /name="robots" content="noindex"/);
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
  assert.match(html, /From a file/);
  assert.match(html, /Unchanged/);
  assert.match(html, /\+\$400/);
  assert.match(html, /Stop paying to build better habits\./);
  assert.match(html, /doesn't check it against a broker/);
});

test("the page never claims more than it knows", async () => {
  const { html } = await open(LIVE);
  assert.doesNotMatch(html, /verified|from your broker|sync/i);
  assert.doesNotMatch(html, /streak|can't be faked/i);
});

test("a card that hides its money keeps it hidden", async () => {
  const { html } = await open({ ...LIVE, money: null });
  assert.doesNotMatch(html, /class="big"/);
  assert.doesNotMatch(html, /\$400/);
});

test("simulated money says so", async () => {
  assert.match((await open({ ...LIVE, simulated: true })).html, /Simulated money/);
  assert.doesNotMatch((await open(LIVE)).html, /Simulated money/);
});

test("a day never closed gets no line", async () => {
  assert.doesNotMatch((await open({ ...LIVE, days: 0 })).html, /Days closed/);
});

test("a link taken down shows no picture and says when", async () => {
  const { r, html } = await open({ state: "down", removed_at: "2026-11-07T09:00:00Z" });
  assert.equal(r.status, 410);
  assert.match(html, /This card was taken down/);
  assert.match(html, /7 Nov 2026/);
  assert.doesNotMatch(html, /og:image|storage\/v1/);
});

test("no card and a bad address are a plain 404, and a bad address never reaches the database", async () => {
  assert.equal((await open(null)).r.status, 404);
  let asked = false;
  const r = await cardPage("a'; drop--", env, "n", async () => { asked = true; return new Response("null"); });
  assert.equal(r.status, 404);
  assert.equal(asked, false);
});

test("trouble isn't cached", async () => {
  const r = await cardPage("AbCdEfGh12", env, "n", answer({}, 500));
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const dropped = await cardPage("AbCdEfGh12", env, "n", async () => { throw new Error("gone"); });
  assert.equal(dropped.status, 503);
});

test("the Worker sends its own security headers, with its style held to a nonce", async () => {
  const { r, html } = await open(LIVE);
  const csp = r.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /style-src 'nonce-nonce'/);
  assert.match(csp, /img-src 'self' https:\/\/x\.supabase\.co/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe|script-src/);
  assert.doesNotMatch(html, /<script/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(html, /<style nonce="nonce">/);
});

test("anything the page prints from the database is escaped", async () => {
  const { html } = await open({ ...LIVE, sign: "<b>", format: "\"><script>" });
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<b>/);
});

test("only /c/ reaches the Worker, and nothing still sends /c/ home", () => {
  const conf = readFileSync(new URL("../web/wrangler.jsonc", import.meta.url), "utf8");
  assert.match(conf, /"run_worker_first": \["\/c\/\*"\]/);
  assert.doesNotMatch(readFileSync(new URL("../scripts/build-web.mjs", import.meta.url), "utf8"), /"\/c\/\* /);
  assert.doesNotMatch(readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8"), /Disallow: \/c\//);
});
