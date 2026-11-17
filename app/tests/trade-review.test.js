import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MISTAKES } from "../src/data.js";
import { reviewFrom } from "../src/lib/copies.js";
import { tradesCsv } from "../src/lib/tradeCsv.js";

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("a trade's photos and mistakes reach the database and come back", () => {
  const sync = src("live/sync.js");
  assert.match(sync, /needs_review: !!t\.needsReview, screenshots: t\.screenshots \|\| \[\], mistakes: t\.mistakes \|\| \[\]/);
  assert.match(sync, /screenshots: r\.screenshots \|\| \[\], mistakes: r\.mistakes \|\| \[\]/);
});

test("a chart photo's name fits the bucket's rule and stays in the trader's own folder", () => {
  const code = src("drip/journal/TradePhotos.jsx");
  assert.match(code, /`\$\{getState\(\)\.me\?\.id\}\/trade-\$\{t\.id\}-\$\{Date\.now\(\)\}\.jpg`/);
  const name = "6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f/trade-b0000000-0000-4000-8000-000000000001-1793976905409.jpg";
  assert.match(name, /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/);
});

test("a trade holds at most three photos, under the database's limit of eight", () => {
  assert.match(src("drip/journal/TradePhotos.jsx"), /export const MOST = 3;/);
});

test("deleting a trade takes its photos with it", () => {
  assert.match(src("drip/journal/Detail.jsx"), /dropTradePhotos\(t\); deleteTrade\(t\.id\)/);
});

test("the mistake list is short and says what happened, with nothing about money or scoring", () => {
  assert.ok(MISTAKES.length <= 8);
  assert.equal(new Set(MISTAKES).size, MISTAKES.length);
  for (const m of MISTAKES) assert.ok(m.length <= 20, m);
});

test("copies of a trade take the same mistakes", () => {
  const out = reviewFrom({ setup: "ORB", mistakes: ["Chased"] }, { id: "b", entry: "1", exit: "2", side: "long", mistakes: [] });
  assert.deepEqual(out.mistakes, ["Chased"]);
});

test("tagging a trade clears it from review and scores nothing", () => {
  const code = src("drip/journal/TradeTags.jsx");
  assert.match(code, /needsReview: false/);
  assert.doesNotMatch(code, /toast\(|celebrat|points/i);
});

test("a trade's mistakes go out with its export", () => {
  const csv = tradesCsv([{ mistakes: ["Chased", "Too big"], pnl: 1 }]);
  assert.match(csv.slice(0, csv.indexOf("Chased")), /Mistakes/);
  assert.match(csv, /Chased; Too big/);
});

test("a trader with a code app passes it before the journal loads", () => {
  const gate = src("live/Gate.jsx");
  assert.ok(gate.indexOf("getAuthenticatorAssuranceLevel") < gate.indexOf("const user = await load()"));
  assert.match(gate, /currentLevel === "aal1" && level\?\.nextLevel === "aal2"/);
});
