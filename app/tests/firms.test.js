import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRMS, accountTitle, firmOf, logoBox, matchFirm, searchFirms } from "../src/live/firms.js";

test("one list from the website's wall: every firm once, each with a logo", () => {
  const slugs = FIRMS.map((f) => f.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of ["apex", "topstep", "ftmo", "amp", "interactive-brokers", "tradovate", "the5ers"]) assert.ok(firmOf(s), s);
  assert.equal(FIRMS.filter((f) => f.group === "futures").length, 12);
  assert.equal(FIRMS.filter((f) => f.group === "forex").length, 10);
  for (const f of FIRMS) assert.ok(f.logo, `${f.slug} has a logo`);
});

test("search: name, start of a word, aliases, best match first", () => {
  assert.equal(searchFirms("apex")[0].slug, "apex");
  assert.equal(searchFirms("Top")[0].slug, "topstep");
  assert.equal(searchFirms("ibkr")[0].slug, "interactive-brokers");
  assert.equal(searchFirms("mffu")[0].slug, "myfundedfutures");
  assert.equal(searchFirms("tpt")[0].slug, "take-profit-trader");
  assert.equal(searchFirms("mt5")[0].slug, "metatrader");
  assert.equal(searchFirms("funded")[0].slug, "funded-futures-network", "a name starting with the word beats one containing it");
  assert.ok(searchFirms("funded").some((f) => f.slug === "myfundedfutures"));
  assert.deepEqual(searchFirms("zzzz"), []);
  assert.equal(searchFirms("").length, FIRMS.length);
});

test("reading a typed name: the firm it starts with, never a guess from the middle", () => {
  assert.equal(matchFirm("Apex 50K")?.slug, "apex");
  assert.equal(matchFirm("apex")?.slug, "apex");
  assert.equal(matchFirm("IBKR")?.slug, "interactive-brokers");
  assert.equal(matchFirm("Take Profit Trader 100k")?.slug, "take-profit-trader");
  assert.equal(matchFirm("My apex account"), null);
  assert.equal(matchFirm("Apexian"), null);
  assert.equal(matchFirm(""), null);
});

test("an account's title: firm and label, or the typed name", () => {
  assert.equal(accountTitle({ firm: "apex", label: "50K", name: "Apex 50K" }), "Apex Trader Funding 50K");
  assert.equal(accountTitle({ firm: "ftmo", label: "", name: "FTMO" }), "FTMO");
  assert.equal(accountTitle({ firm: null, label: null, name: "My swing account" }), "My swing account");
  assert.equal(accountTitle({ firm: "nope", name: "Old name" }), "Old name");
});

test("logos are sized by area: a long wordmark is shorter than a square mark", () => {
  const wide = logoBox("fundednext", 24), square = logoBox("phidias", 24);
  assert.ok(wide.h < square.h);
  assert.ok(wide.w > square.w);
  assert.equal(logoBox("not-a-firm"), null);
});

test("an older account's name read as firm + label", async () => {
  const { readAccountName } = await import("../src/live/firms.js");
  assert.deepEqual(readAccountName("Apex 50K"), { firm: "apex", label: "50K" });
  assert.deepEqual(readAccountName("Topstep 50K Combine"), { firm: "topstep", label: "50K Combine" });
  assert.deepEqual(readAccountName("Take Profit Trader 100k"), { firm: "take-profit-trader", label: "100k" });
  assert.deepEqual(readAccountName("IBKR"), { firm: "interactive-brokers", label: "" });
  assert.equal(readAccountName("Swing account"), null);
});
