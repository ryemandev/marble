import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as S from "../supabase/functions/_shared/news.js";
import * as N from "../src/news.js";

const iso = (ms) => new Date(ms).toISOString();

test("iCalendar: New York times become UTC either side of the clock change, and only listed releases are kept", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "DTSTART;TZID=US-Eastern:20261030T083000", "SUMMARY:Employment Cost Index", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;TZID=US-Eastern:20261106T083000", "SUMMARY:Employment Situation", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE-TIME:20261125T133000Z", "SUMMARY:Personal Income and Outlays\\, October 2026", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;TZID=US-Eastern:20261110T100000", "SUMMARY:Metropolitan Area Employment", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const rows = S.parseIcs(ics, "BLS");
  assert.deepEqual(rows.map((r) => [r.short, r.at, r.impact]), [
    ["Employment cost index", "2026-10-30T12:30:00.000Z", "med"], // still summer time in New York
    ["Jobs report", "2026-11-06T13:30:00.000Z", "high"], // after 1 November: winter time
    ["PCE inflation", "2026-11-25T13:30:00.000Z", "high"],
  ]);
  assert.equal(rows[2].period, "October 2026");
  assert.equal(rows[1].id, "BLS:2026-11-06:jobs-report");
});

test("ONS: cancelled releases and the duplicate time-series entries are left out; postponed ones say so", () => {
  const json = { releases: [
    { description: { title: "Consumer price inflation, UK: October 2026", release_date: "2026-11-18T07:00:00.000Z" } },
    { description: { title: "Consumer price inflation, UK: October 2026 time series", release_date: "2026-11-18T07:00:00.000Z" } },
    { description: { title: "GDP monthly estimate, UK: September 2026", release_date: "2026-11-12T07:00:00.000Z", postponed: true } },
    { description: { title: "Labour market overview, UK: November 2026", release_date: "2026-11-17T07:00:00.000Z", cancelled: true } },
    { description: { title: "Family spending in the UK", release_date: "2026-11-19T09:30:00.000Z" } },
  ] };
  const rows = S.parseOns(json);
  assert.deepEqual(rows.map((r) => [r.short, r.status]), [["UK CPI", "scheduled"], ["UK GDP", "postponed"]]);
});

test("Central banks: FOMC at 14:00 New York, Bank Rate at 12:00 London, the ECB at 14:15 Frankfurt", () => {
  const fed = `<h4><a>2026 FOMC Meetings</a></h4><div class="fomc-meeting__month"><strong>Dec</strong></div><div class="fomc-meeting__date">8-9*</div>
    <h4><a>2027 FOMC Meetings</a></h4><div class="fomc-meeting__month"><strong>Jan</strong></div><div class="fomc-meeting__date">26-27</div>`;
  assert.deepEqual(S.parseFomc(fed).map((r) => r.at), ["2026-12-09T19:00:00.000Z", "2027-01-27T19:00:00.000Z"]);
  const boe = "<p>2026 confirmed dates</p><p>Thursday 5 November</p><p>Thursday&nbsp;17 December</p><p>2027 provisional dates</p><p>Thursday 4 February</p>";
  assert.deepEqual(S.parseBoe(boe).map((r) => r.at), ["2026-11-05T12:00:00.000Z", "2026-12-17T12:00:00.000Z", "2027-02-04T12:00:00.000Z"]);
  const ecb = "<dt>16/12/2026</dt><dd>Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 1)</dd><dt>17/12/2026</dt><dd>Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2), followed by press conference</dd><dt>26/11/2026</dt><dd>Governing Council of the ECB: non-monetary policy meeting</dd>";
  assert.deepEqual(S.parseEcb(ecb).map((r) => [r.short, r.at]), [["ECB rate decision", "2026-12-17T13:15:00.000Z"]]);
});

test("One save has each release once, and every row has the same columns", () => {
  const a = S.eventRow("ONS", "GDP monthly estimate, UK: September 2026", Date.parse("2026-11-12T07:00:00Z"));
  const b = S.eventRow("ONS", "GDP first quarterly estimate, UK: July to September 2026", Date.parse("2026-11-12T07:00:00Z"));
  const c = S.eventRow("Fed", "FOMC statement", Date.parse("2026-12-09T19:00:00Z"));
  const out = S.dedupe([a, b, c]);
  assert.equal(out.length, 2);
  assert.deepEqual(Object.keys(out[0]), Object.keys(out[1]));
  assert.equal(S.rate("Metropolitan Area Employment and Unemployment"), null);
});

test("The wire keeps https links only, nothing from the future, and decodes what it shows", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const xml = `<rss><channel>
    <item><title><![CDATA[Bank Rate maintained at 3.75% &amp; minutes]]></title><link>https://www.bankofengland.co.uk/x</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item>
    <item><title>Plain http</title><link>http://example.com/a</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item>
    <item><title>Script</title><link>javascript:alert(1)</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item>
    <item><title>Tomorrow</title><link>https://example.com/b</link><pubDate>Sat, 31 Oct 2026 12:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const items = S.parseRss(xml, "Bank of England", now);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Bank Rate maintained at 3.75% & minutes");
  assert.equal(items[0].kind, "official");
  assert.deepEqual(Object.keys(items[0]).sort(), ["id", "kind", "published_at", "source", "title", "url"]);
  const ms = S.parseMediastack({ data: [{ title: "Stocks <b>rise</b>", url: "https://news.example/s", source: "Wire", published_at: "2026-10-30T11:00:00+00:00", description: "never stored" }] }, now);
  assert.deepEqual(ms.map((i) => [i.title, i.kind, i.source]), [["Stocks rise", "market", "Wire"]]);
  assert.equal(S.idOf("https://a.example/1"), S.idOf("https://a.example/1"));
  assert.notEqual(S.idOf("https://a.example/1"), S.idOf("https://a.example/2"));
});

test("Figures: change on the month in %, payrolls in thousands, rates as published; out only once a newer period appears", () => {
  const cpi = [{ year: "2026", period: "M09", value: "322.0" }, { year: "2026", period: "M08", value: "320.0" }, { year: "2026", period: "M07", value: "319.0" }, { year: "2026", period: "M13", value: "1" }];
  assert.deepEqual(S.blsFigures(cpi, "pct", "%"), { period: "2026-09", latest: "+0.6%", before: "+0.3%" });
  const nfp = [{ year: "2026", period: "M09", value: "159400" }, { year: "2026", period: "M08", value: "159429" }, { year: "2026", period: "M07", value: "159300" }];
  assert.deepEqual(S.blsFigures(nfp, "chg", "K"), { period: "2026-09", latest: "−29K", before: "+129K" });
  assert.equal(S.blsFigures([{ year: "2026", period: "M09", value: "4.2" }], "lvl", "%").latest, "4.2%");

  const ev = { at: "2026-11-10T13:30:00Z", prev: null, actual: null, data_period: null };
  const before = Date.parse("2026-11-09T12:00:00Z"), after = Date.parse("2026-11-10T13:34:00Z");
  const sept = [{ period: "2026-09", latest: "+0.6%", before: "+0.3%" }], oct = [{ period: "2026-10", latest: "+0.2%", before: "+0.6%" }];
  assert.deepEqual(S.settle(ev, sept, before), { prev: "+0.6%", data_period: "2026-09" });
  const primed = { ...ev, prev: "+0.6%", data_period: "2026-09" };
  assert.equal(S.settle(primed, sept, before), null, "nothing new before the release");
  assert.equal(S.settle(primed, sept, after), null, "out, but the agency hasn't published it yet");
  assert.deepEqual(S.settle(primed, oct, after), { actual: "+0.2%", prev: "+0.6%", data_period: "2026-10", actual_at: new Date(after).toISOString() });
  assert.equal(S.settle({ ...primed, actual: "+0.2%" }, oct, after), null, "written once");
  assert.equal(S.settle(ev, sept, after), null, "never guesses an actual without knowing the previous period");
});

test("BEA and ONS figures: the line is found by its description, so a renumbered table writes nothing", () => {
  const bea = { BEAAPI: { Results: { Data: [
    { LineDescription: "Gross domestic product", TimePeriod: "2026Q3", DataValue: "2.8" },
    { LineDescription: "Gross domestic product", TimePeriod: "2026Q2", DataValue: "3.1" },
    { LineDescription: "Personal consumption expenditures", TimePeriod: "2026Q3", DataValue: "9.9" },
  ] } } };
  assert.deepEqual(S.beaFigures(bea, S.BEA_SERIES.GDP[2]), { period: "2026-Q3", latest: "+2.8%", before: "+3.1%" });
  assert.equal(S.beaFigures(bea, S.BEA_SERIES["PCE inflation"][2]).latest, null);
  const ons = { months: [{ date: "2026 AUG", value: "3.1" }, { date: "2026 SEP", value: "3.5" }] };
  assert.deepEqual(S.onsFigures(ons), { period: "2026-09", latest: "3.5%", before: "3.1%" });
});

/* ---------- The app ---------- */

const at = (s) => Date.parse(s);
const cal = [
  { id: "a", short: "Jobs report", impact: "high", at: at("2026-11-06T13:30:00Z"), status: "scheduled" },
  { id: "b", short: "JOLTS", impact: "med", at: at("2026-11-06T15:00:00Z"), status: "scheduled" },
  { id: "c", short: "CPI", impact: "high", at: at("2026-11-10T13:30:00Z"), status: "postponed" },
  { id: "d", short: "UK GDP", impact: "high", at: at("2026-11-12T07:00:00Z"), status: "scheduled" },
];

test("The rule: 5 minutes either side of high impact by default, clamped to an hour, and off when switched off", () => {
  assert.deepEqual(N.ruleOf(null), { enabled: true, before: 5, after: 5, medium: false });
  assert.deepEqual(N.ruleOf({ before: -3, after: 90, medium: 1 }), { enabled: true, before: 0, after: 60, medium: true });
  assert.equal(N.windowsOf(cal, N.ruleOf(null)).length, 2, "the postponed CPI opens no window");
  assert.equal(N.windowsOf(cal, N.ruleOf({ medium: true })).length, 3);
  assert.equal(N.windowsOf(cal, N.ruleOf({ enabled: false })).length, 0);
});

test("A window opens at its first minute and closes at its last; a trade inside is tagged with the release", () => {
  const rule = N.ruleOf(null);
  assert.equal(N.openWindow(cal, rule, at("2026-11-06T13:24:59Z")), null);
  assert.equal(N.openWindow(cal, rule, at("2026-11-06T13:25:00Z"))?.event.id, "a");
  assert.equal(N.openWindow(cal, rule, at("2026-11-06T13:34:59Z"))?.event.id, "a");
  assert.equal(N.openWindow(cal, rule, at("2026-11-06T13:35:00Z")), null);
  assert.equal(N.tagFor(cal, rule, at("2026-11-06T13:31:00Z")), "Jobs report");
  assert.equal(N.tagFor(cal, rule, at("2026-11-06T15:01:00Z")), null, "medium impact only if the trader asks");
  assert.equal(N.tagFor(cal, N.ruleOf({ medium: true }), at("2026-11-06T15:01:00Z")), "JOLTS");
  assert.equal(N.nextWindow(cal, rule, at("2026-11-06T14:00:00Z")).event.id, "d");
});

test("What's next skips postponed releases; today is the New York day", () => {
  assert.equal(N.nextBig(cal, at("2026-11-06T14:00:00Z")).id, "d");
  assert.equal(N.nextBig(cal, at("2026-11-06T14:00:00Z"), N.ruleOf({ medium: true })).id, "b");
  assert.deepEqual(N.todayOf(cal, at("2026-11-06T04:30:00Z")).map((e) => e.id), []);
  assert.deepEqual(N.todayOf(cal, at("2026-11-06T12:00:00Z")).map((e) => e.id), ["a", "b"]);
  assert.equal(N.clockNY(cal[0].at), "08:30");
  assert.equal(N.dayLabel(cal[3].at), "Thu 12 Nov");
});

test("Countdowns read the way the studio clock and the lamp show them", () => {
  assert.equal(N.hms(72 * 60), "1:12:00");
  assert.equal(N.hms(-5), "0:00:00");
  assert.equal(N.msLeft(7 * 60 + 20), "7:20");
  assert.equal(N.inWords(72 * 60), "1h 12m");
  assert.equal(N.inWords(8 * 60 + 5), "8m 05s");
  assert.equal(N.inWords(40), "40s");
  assert.equal(N.inWords(52 * 3600), "2d 4h");
});

test("The live TV is YouTube's privacy-enhanced embed, by channel, and the fallback opens YouTube itself", () => {
  for (const c of N.CHANNELS) {
    const u = new URL(N.embedUrl(c, "https://trademarble.app"));
    assert.equal(u.origin, "https://www.youtube-nocookie.com");
    assert.equal(u.pathname, "/embed/live_stream");
    assert.equal(u.searchParams.get("channel"), c.channel);
    assert.match(c.channel, /^UC[\w-]{22}$/);
    assert.equal(new URL(N.watchUrl(c)).origin, "https://www.youtube.com");
  }
  assert.equal(N.channelOf("nope").id, "bloomberg");
});

test("The demo's day sits on the demo's Tuesday in New York time", () => {
  const NOW = { year: 2026, month: 9, day: 27, time: "13:52" };
  const SAMPLE = { NEWS: [{ time: "14:00", title: "FOMC minutes", impact: "high" }], NEWS_WEEK: [{ day: 10, time: "08:30", title: "Jobs report", impact: "high" }] };
  const ev = N.demoEvents(SAMPLE, NOW);
  assert.equal(iso(ev[0].at), "2026-10-27T18:00:00.000Z");
  assert.equal(iso(ev[1].at), "2026-11-06T13:30:00.000Z");
  const now = N.demoNow(NOW);
  assert.ok(now >= at("2026-10-27T17:52:00Z") && now < at("2026-10-27T17:53:00Z"));
});

/* ---------- Server pieces ---------- */

test("Each news function is small, imports only the shared news module, and checks the cron secret first", () => {
  for (const fn of ["news-calendar", "news-wire", "news-actuals"]) {
    const src = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), "utf8");
    assert.ok(src.length < 6200, `${fn} is ${src.length} bytes`);
    const imports = [...src.matchAll(/^import .* from "(.+)";$/gm)].map((m) => m[1]);
    assert.deepEqual(imports, ["../_shared/news.js"], fn);
    assert.match(src, /news_sync_cron_ok/);
    assert.match(src, /if \(req\.method !== "POST" \|\| !\(await allowed\(req\)\)\) return json\(\{ error: "Not allowed" \}, 401\);/);
  }
});

test("The migration keeps the tables behind news_feed() and the trader's rule to their own row", () => {
  const dir = new URL("../supabase/migrations-pending/", import.meta.url);
  const file = readdirSync(dir).find((f) => f.startsWith("20261031100000"));
  const sql = readFileSync(new URL(file, dir), "utf8");
  for (const t of ["econ_events", "news_items", "news_rules"]) assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
  assert.doesNotMatch(sql, /policy [^;]+ on public\.(econ_events|news_items)/, "no direct reads of the shared tables");
  assert.match(sql, /revoke all on function public\.news_feed\(integer\) from public, anon;/);
  assert.match(sql, /'items', case when public\.has_access\(\)/, "the wire needs a plan");
  assert.match(sql, /revoke all on function public\.news_sync_cron_ok\(text\) from public, anon, authenticated;/);
  const sched = readFileSync(new URL(readdirSync(dir).find((f) => f.startsWith("20261031100100")), dir), "utf8");
  for (const job of ["news-calendar", "news-wire", "news-actuals"]) assert.match(sched, new RegExp(`cron\\.schedule\\('${job}'`));
  assert.doesNotMatch(sched, /eyJ|service_role/i, "no keys in the schedule");
});

test("the wire drops a feed's own test post, and keeps real headlines that start with Test", () => {
  for (const t of ["Test01112026", "Test", "test 123", " TEST-1 "]) assert.equal(N.feedTest(t), true, t);
  for (const t of ["Testing times for the euro area", "Test results: inflation expectations survey", "Boris Vujčić: Integrated, open and resilient", "", null]) assert.equal(N.feedTest(t), false, String(t));
});
