import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTS, FEATURES, GROUPS, ORACLE, plainText } from "../src/site/everything/features.js";
import { GROUPS as ORACLE_GROUPS, QUESTIONS } from "../src/lib/oracle/questions.js";
import { PAGES } from "../src/seo/pages.js";

test("the Oracle's questions, word for word and in its order", () => {
  const asked = QUESTIONS.map((q) => q.text({ weekday: 5, session: "afternoon" }));
  assert.deepEqual(ORACLE.flatMap((g) => g.questions), asked);
  assert.equal(COUNTS.questions, QUESTIONS.length);
  assert.deepEqual(ORACLE.map((g) => g.group), ORACLE_GROUPS.map((g) => g.label));
  for (const g of ORACLE_GROUPS) {
    const ours = ORACLE.find((x) => x.group === g.label).questions;
    assert.deepEqual(ours, QUESTIONS.filter((q) => q.group === g.id).map((q) => q.text({ weekday: 5, session: "afternoon" })));
  }
  const oracle = GROUPS.find((g) => g.id === "oracle");
  assert.match(oracle.features[0].name, new RegExp(`^${QUESTIONS.length} questions`));
});

test("every feature has a name, words and an address of its own", () => {
  const ids = new Set();
  for (const g of GROUPS) {
    assert.ok(g.name && g.line && g.features.length, `group ${g.id}`);
    assert.ok(!/\.\s*$/.test(g.name), `${g.id}: a group's name has no full stop`);
    for (const f of g.features) {
      assert.ok(f.name && f.text, `${g.id}: a feature needs a name and words`);
      assert.match(f.id, /^[a-z0-9-]+$/);
      assert.ok(!ids.has(f.id), `${f.id} is used twice`);
      ids.add(f.id);
    }
  }
  assert.ok(!ids.has("everything") && GROUPS.every((g) => !ids.has(g.id)), "a feature's address can't be a group's");
  assert.equal(COUNTS.features, FEATURES.length);
  assert.equal(COUNTS.groups, GROUPS.length);
});

test("Marble is free, and the list says so with no prices", () => {
  const free = GROUPS.find((g) => g.id === "free").features.map(plainText).join(" ");
  assert.match(free, /free/i);
  assert.doesNotMatch(free, /[£$€]\d|a month|a year|lifetime/i);
});

test("it only says what the app does, plainly", () => {
  const all = FEATURES.map((f) => `${f.name} ${plainText(f)}`).join("\n");
  assert.doesNotMatch(all, /\bAI\b|artificial intelligence|guarantee|make money|profitable/i);
  assert.doesNotMatch(all, /\bvoice\b|\bcrypto|rule tracker/i);
  // Chat's topic rooms are built: the list names every one
  assert.match(all, /Futures, Forex, Stocks, Prop firms, Psychology, Wins & losses and Help/);
  // The one thing listed that isn't open yet says so
  assert.match(GROUPS.find((g) => g.id === "community").features.find((f) => /^Events/.test(f.name)).name, /coming soon/i);
});

test("/everything is a page of its own, with words that fit a search result", () => {
  const page = PAGES.find((p) => p.slug === "everything");
  assert.ok(page, "pages.js lists /everything");
  assert.deepEqual(page.sections, ["everything"]);
  assert.ok(page.title.length <= 60, `title is ${page.title.length} characters`);
  assert.ok(page.description.length <= 160, `description is ${page.description.length} characters`);
  assert.ok(page.ownIntro, "the page draws its own H1");
});
