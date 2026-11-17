import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(`supabase/functions/${f}`, "utf8");

test("linking accounts has a limit, as connecting and syncing do", () => {
  assert.match(read("topstepx/index.ts"), /action === "link" && !\(await rateOk\(user\.id, `link:\$\{PLATFORM\}`, 30, "1 hour"\)\)/);
  assert.match(read("ibkr/index.ts"), /action === "link" && !\(await rateOk\(user\.id, "link:ibkr", 30, "1 hour"\)\)/);
});

test("an IBKR token never rides out in an error", () => {
  assert.match(read("ibkr/index.ts"), /IBKR didn't answer\. Try again shortly\./);
  assert.match(read("ibkr/flex.js"), /\[\?&\]t=/);
});

test("delete-account never says nothing was removed, and a failed step stops it", () => {
  const s = read("delete-account/index.ts");
  assert.doesNotMatch(s, /nothing was removed/);
  assert.match(s, /connections delete/);
});

test("the Floor's day count is a count and nothing more, for signed-in traders, and sorts nothing", () => {
  const sql = readFileSync("supabase/migrations-pending/20261106120000_floor_days.sql", "utf8");
  assert.match(sql, /returns table \(handle text, days integer\)/);
  assert.match(sql, /auth\.uid\(\)\) is not null/);
  assert.match(sql, /from public, anon/);
  assert.match(sql, /p_handles\[1:60\]/);
  const hub = readFileSync("src/drip/hub/useHub.js", "utf8");
  assert.match(hub, /!p\.anonymous/, "an anonymous post never gets a count");
  assert.doesNotMatch(hub, /sort\([^)]*closed/);
});
