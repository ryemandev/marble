import { test } from "node:test";
import assert from "node:assert/strict";
import { startLink, wantsStart } from "../src/lib/intent.js";

test("the website's start link opens the app on Create your account", () => {
  assert.equal(startLink("https://trademarble.app/desk/"), "https://trademarble.app/desk/?start=1");
  assert.equal(startLink("./index.html?x=1"), "./index.html?x=1&start=1");
  assert.equal(wantsStart("?start=1"), true);
  assert.equal(wantsStart("?a=b&start=1"), true);
  assert.equal(wantsStart("?start=0"), false);
  assert.equal(wantsStart("?claim=1"), false);
  assert.equal(wantsStart(""), false);
});
