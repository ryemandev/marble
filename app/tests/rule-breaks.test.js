import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bigDays } from "../src/drip/hub/money.js";
import { POSTS } from "../src/views/community/sample.js";
import { CREWS } from "../src/views/community/houses.js";

// The design audit's "rule breaks off" list (5 Nov 2026), the six-step tour and the sign-in screen. Each test pins
// what a trader reads, so a later change can't bring a streak, an R or a countdown back by accident.
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("Stats has no streaks panel, and its days are up and down", () => {
  const stats = read("../src/views/Analytics.jsx");
  assert.doesNotMatch(stats, /Streaks|in a row|s\.streak/);
  assert.doesNotMatch(stats, /Green days|Red days|green day|red day|Green and red/);
  assert.match(stats, /k="Up days"/);
  assert.match(stats, /k="Down days"/);
  assert.match(read("../src/drip/stats/model.js"), /row\("broke", "Off plan",/);
  assert.match(read("../src/drip/desk/DeskMore.jsx"), /\["Costliest weekday",/);
});

test("the Floor's rail lists every posted day, newest first, with dollars or without", () => {
  const posts = [
    { id: "a", author: { handle: "ann" }, trade: { sym: "NQ", pnl: 300, stage: "funded" } },
    { id: "b", author: { handle: "bo" }, body: "just words" },
    { id: "c", author: { handle: "cy" }, flex: { card: { kind: "day", title: "Day 12", money: null } } },
    { id: "d", anonymous: true, trade: { sym: "ES", pnl: null } },
    { id: "e", team: true, trade: { sym: "CL", pnl: 50 } },
    { id: "f", author: { handle: "di" }, trade: { sym: "GC", pnl: -9000, stage: "live" } },
  ];
  const days = bigDays(posts);
  assert.deepEqual(days.map((d) => d.post.id), ["a", "c", "d", "f"], "the feed's own order, and a day with no dollars is in it");
  assert.equal(days[0].m.text, "+$300");
  assert.equal(days[1].m, null);
  assert.equal(days[2].m, null);
  const panel = read("../src/drip/hub/LivePanel.jsx");
  assert.match(panel, /<Head title="Days posted" \/>/);
  assert.doesNotMatch(panel, /\{m && <Fig m=\{m\} \/>\}/, "names alone on the rail for now");
});

test("the Floor says when something closes as a date, never a clock counting down", () => {
  const parts = read("../src/drip/hub/parts.jsx");
  assert.doesNotMatch(parts, /setInterval|role="timer"|Countdown/);
  assert.match(parts, /export function DueDate/);
  for (const f of ["../src/drip/hub/LiveBand.jsx", "../src/drip/hub/LivePanel.jsx"]) assert.doesNotMatch(read(f), /Countdown/, f);
});

test("the Floor's sample has no biggest day and no cash picture on it, and no crew motto about size", () => {
  const sample = read("../src/views/community/sample.js");
  assert.doesNotMatch(sample, /Biggest day|4820|max size/);
  const kenji = POSTS.find((p) => p.id === "s9");
  assert.match(kenji.picture.path, /^masters\//);
  assert.ok(Math.abs(kenji.trade.pnl) < 1500, "a normal day");
  for (const c of Object.values(CREWS)) assert.doesNotMatch(c.motto, /size|profit|earn/i, c.name);
});

test("a card never prints R, and its record line never counts days up", () => {
  const flex = read("../src/views/Flex.jsx");
  assert.doesNotMatch(flex, /fmtR/);
  assert.equal((flex.match(/card\.fallback \?\? "Closed"/g) || []).length, 2, "the big card and the small one");
  assert.match(flex, /export const SHOW = \{ money: true, record: false,/);
  for (const f of ["../src/drip/DailyClose.jsx", "../src/drip/floor/Cards.jsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /\} up`|days? up/, f);
    assert.doesNotMatch(src, /show=\{\{[^}]*record: true/, f);
  }
});

test("the profile calls the texture Metal, and the demo's preview says Sample data", () => {
  const profile = read("../src/views/Profile.jsx");
  assert.doesNotMatch(profile, /Liquid metal/);
  assert.match(profile, /\["textures\/liquid-metal", "Metal"\]/);
  assert.match(profile, /LIVE \? "Preview" : "Preview · Sample data"/);
});

test("the website and the legal pages: no streaks, no R, Your cards, and the boards said to be hidden", () => {
  assert.doesNotMatch(read("../src/site/features/Screens.jsx"), /Streaks|Trade alone|biggest days/);
  assert.doesNotMatch(read("../src/site/everything/features.js"), /name: "Streaks"|longest losing run/);
  const crews = read("../src/site/community/Crews.jsx");
  assert.match(crews, /text="Traders who journal," silver="in one place\."/);
  assert.match(crews, /ctx\.fillText\("Sample data"/, "the label is painted on the tank itself");
  assert.match(read("../src/site/founder/story.js"), /export const STORY = \[/);
  assert.doesNotMatch(read("../src/site/founder/story.js"), /stay calm when it counts|those systems/);
  assert.match(read("../src/site/home/Founder.jsx"), /const SHORT_STORY = \[/);
  assert.doesNotMatch(read("../src/site/home/Founder.jsx"), /built to fix that/);
  const legal = read("../src/site/legal/docs.js");
  assert.doesNotMatch(legal, /[Ff]lex card|disciplined R|your R\b|your streak/);
  assert.match(legal, /\{ h: "Your cards", p: \[/);
  assert.match(legal, /The leaderboards are hidden for now/);
});

test("the tour is six steps, Skip keeps the example, and the strip says Sample data", () => {
  const tour = read("../src/live/ExampleDesk.jsx");
  const titles = [...tour.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["Your money", "Log a trade", "Every day and every trade", "Where your money comes from", "Bring your history", "Your turn"]);
  assert.match(tour, /const skip = \(\) => \{ if \(replay\) return finish\(\); markDone\(\); close\(\); \};/);
  assert.match(tour, /Sample data&nbsp;·&nbsp;<b>\{replay \? "Back to my desk" : "Start with my own"\}<\/b>/);
  const css = read("../src/live/example.css");
  assert.match(css, /\.tour-card \{[^}]*background: #fff;[^}]*box-shadow: none;/s);
  assert.doesNotMatch(css, /blur|backdrop-filter/);
});

test("the sign-in screen has one title, two pills and a way to the sample desk that makes no account", () => {
  const gate = read("../src/live/Gate.jsx");
  assert.match(gate, /<h1 className="gate-title quiet">Sign in or create an account<\/h1>/);
  assert.doesNotMatch(gate, /Your journal is waiting|Create your account\./);
  assert.match(gate, /const SAMPLE_DESK = `\$\{import\.meta\.env\.BASE_URL\}demo\.html`;/);
  assert.match(gate, /<a className="gate-sample" href=\{SAMPLE_DESK\}>See a sample desk first<\/a><span>· Sample data<\/span>/);
  assert.match(gate, /I have a code from an email/);
  const icons = read("../src/live/SignInIcons.jsx");
  assert.match(icons, /className="gate-pills"/);
  assert.doesNotMatch(icons, /gate-icon\b/);
});
