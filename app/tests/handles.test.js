import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OWNER_PREFIX, PROTECTED_CONTAINS, PROTECTED_EXACT, ROLE_HEADS, ROLE_TAILS, foldHandle, handleReserved } from "../supabase/functions/_shared/handles.js";

export const BLOCKED = ["jules", "julesx", "jul", "jules.g", "rnarble", "marb1e", "m4rble", "trademarbel", "supp0rt", "mod.team", "marble_hq",
  "help_desk", "teamhq", "admin2024", "mod1", "0fficial", "st4ff", "oracle_bot", "j_u_l_e_s", "juuules", "jules_trades", "the.mods", "suppport", "adm1n",
  "rnod", "jules.team", "jul_g", "ju1es", "marblesupport", "0racle", "help", "team", "staff", "mod", "official", "moderator", "vvww.marble"];
export const ALLOWED = ["sam_smith", "modern", "teamwork", "helper", "john", "jane.doe", "trader123", "sam_trades", "elena", "bill", "nqscalper",
  "ryland", "mo", "moe", "futures_fred", "es_scalps", "london.open", "nightowl", "pit_boss"];

test("folding: look-alike digits, symbols, punctuation, rn and vv, repeats", () => {
  assert.equal(foldHandle("Supp0rt"), "suport");
  assert.equal(foldHandle("rnarble"), "marble");
  assert.equal(foldHandle("marb1e"), "marble");
  assert.equal(foldHandle("m4rb.l_e"), "marble");
  assert.equal(foldHandle("vvhale"), "whale");
  assert.equal(foldHandle("jules.g"), "julesg");
  assert.equal(foldHandle("0fficia1"), foldHandle("official"));
  assert.equal(foldHandle("$t@ff"), foldHandle("staff"));
  assert.equal(foldHandle("mod1", false), "mod");
  assert.equal(foldHandle("admin2024", false), foldHandle("admin"));
  assert.equal(foldHandle(null), "");
});

test("the owner's and Marble's names and their look-alikes are reserved", () => {
  for (const h of BLOCKED) assert.equal(handleReserved(h), true, h);
});

test("ordinary handles stay free", () => {
  for (const h of ALLOWED) assert.equal(handleReserved(h), false, h);
});

test("the database's handle_reserved() uses exactly these lists", () => {
  const sql = readFileSync(new URL("../supabase/migrations-pending/20261029180200_handle_lookalikes.sql", import.meta.url), "utf8");
  const arrays = [...sql.matchAll(/array\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  const lists = arrays.filter((a) => a.length > 1);
  const has = (list) => lists.some((a) => a.length === list.length && a.every((w, i) => w === list[i]));
  assert.ok(has(PROTECTED_EXACT), "exact list");
  assert.ok(has(PROTECTED_CONTAINS), "contains list");
  assert.ok(has(ROLE_HEADS), "role heads");
  assert.ok(has(ROLE_TAILS), "role tails");
  assert.ok(sql.includes(`handle_fold('${OWNER_PREFIX}', true)`), "owner prefix");
  assert.ok(sql.includes("translate(lower(coalesce(h, '')), '01i!|34@5$789', 'olllleaasstbg')"), "same digit map");
});
