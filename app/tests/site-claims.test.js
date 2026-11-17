// The website's facts. Trust is the pitch, so a line the app can't back shouldn't come back by accident.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS as FIRMS, PLATFORMS } from "../src/site/works/firms.js";
import { FEATURES, plainText, slug } from "../src/site/everything/features.js";

const everything = FEATURES.map(plainText).join("\n") + "\n" + FEATURES.map((f) => f.name).join("\n");
const firm = (name) => FIRMS.flatMap((g) => g.firms).find((f) => f.name === name);

test("no firm lists a platform it has closed, and a platform with no export isn't sold as a file", () => {
  assert.ok(!firm("FTMO").on.includes("dxtrade"), "FTMO closed DXtrade to new accounts");
  assert.notEqual(PLATFORMS.tradelocker.file, "columns", "TradeLocker has no export of its own");
  assert.doesNotMatch(everything, /TradeLocker history|and TradeLocker/, "not listed among the files that come in");
  assert.match(everything, /TradeLocker has no export of its own/);
});

test("the features page claims nothing the app doesn't do", () => {
  for (const line of [
    /dollars at risk/i, // the log form shows P&L and Grade
    /best trade\. Tap/, // a week row has no best trade
    /average win and loss in dollars, and profit factor for the month/, // the Journal's head shows net, trades and wins
    /what your revenge trades have cost/, // Stats has P&L by feeling, with Revenge a row in it
    /a P&L calendar/, // the calendar is on the Desk and the Journal, not Stats
    /post it to the Feed/, // cards from real accounts have no Post button
    /shows a dash/, // an empty figure says None
    /kept on screen/, // a failed trade now outlives the tab, and the rest doesn't
  ]) assert.doesNotMatch(everything, line);
});

test("nothing says an account is linked or synced: trades come from a file or by hand", () => {
  assert.doesNotMatch(everything, /\blinked? (every |any |your )?accounts?\b|accounts? you link|API key|Verified/i);
  const sync = FEATURES.filter((f) => /\bsync/i.test(plainText(f) + f.name));
  assert.deepEqual(sync.map((f) => f.name), []);
});

test("every feature still has its own anchor", () => {
  const slugs = FEATURES.map((f) => slug(f.name));
  assert.equal(new Set(slugs).size, slugs.length);
});
