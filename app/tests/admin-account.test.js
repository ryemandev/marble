import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../supabase/functions/${f}`, import.meta.url), "utf8");
const buckets = (src) => JSON.parse(src.match(/BUCKETS = (\[[^\]]+\])/)[1]);

test("an admin's delete clears the same buckets as a trader's own delete", () => {
  assert.deepEqual(buckets(read("_shared/wipe-account.ts")), buckets(read("delete-account/index.ts")));
});

test("admin-account checks who's asking before it touches an account", () => {
  const src = read("admin-account/index.ts");
  const order = ["auth/v1/user", "rest/v1/admins?user_id=eq.${user.id}", 'aal !== "aal2"', "target === user.id", "admins?user_id=eq.${target}", "wipeAccount(target)"]
    .map((s) => src.indexOf(s));
  assert.ok(order.every((i) => i > 0), "every check is there");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in that order");
  assert.match(src, /toLowerCase\(\) !== String\(found\.handle\)\.toLowerCase\(\)/, "delete needs the handle typed back");
  assert.ok(src.indexOf('note(user.id, "user.delete"') < src.indexOf("wipeAccount(target)"), "logged before it runs");
});
