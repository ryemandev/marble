import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUnsubscribe, unsubscribeLinks, unsubscribeToken } from "../supabase/functions/_shared/email-link.js";

test("the unsubscribe link is signed: right for its trader, wrong for anyone else or with any change", async () => {
  const key = "a-test-key-not-a-real-secret";
  const u = "6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
  const t = await unsubscribeToken(u, key);
  assert.equal(t.length, 32);
  assert.equal(await checkUnsubscribe(u, t, key), true);
  assert.equal(await checkUnsubscribe(u.toUpperCase(), t, key), true);
  assert.equal(await checkUnsubscribe("7f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f", t, key), false);
  assert.equal(await checkUnsubscribe(u, t.slice(0, 31) + (t[31] === "A" ? "B" : "A"), key), false);
  assert.equal(await checkUnsubscribe(u, t, "another-key"), false);
  assert.equal(await checkUnsubscribe("not-a-uuid", t, key), false);
  const links = await unsubscribeLinks(u, key);
  assert.match(links.page, /^https:\/\/trademarble\.app\/unsubscribe\?u=6f1c2b8e-[^&]+&t=[\w-]{32}$/);
  assert.match(links.oneClick, /\/functions\/v1\/email-unsubscribe\?u=/);
});
