import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadState } from "../src/store.js";
import { byStage } from "../src/drip/week.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("real cards print dollars, and posts have their own switch", () => {
  const mode = read("../src/mode.js");
  assert.match(mode, /^export const MONEY_CARDS = true;$/m);
  assert.match(mode, /^export const POST_MONEY = true;$/m);
  for (const f of ["../src/views/community/Feed.jsx", "../src/views/community/Messages.jsx", "../src/views/community/parts.jsx", "../src/drip/hub/money.js"]) {
    assert.doesNotMatch(read(f), /MONEY_CARDS/, f);
  }
});

test("an archived evaluation is still simulated money", () => {
  loadState({ accounts: [{ id: "old-eval", status: "eval", kind: "Evaluation", archived: true }] });
  const stages = byStage([{ id: "t1", account: "old-eval", pnl: 500 }], []);
  assert.deepEqual(Object.keys(stages), ["eval"]);
  loadState({ accounts: [] });
});

test("a card on no account doesn't call itself Live, and a simulated caption says so", () => {
  assert.match(read("../src/drip/DailyClose.jsx"), /stage: list\.some\(\(t\) => t\.account\) \? lead : null/);
  const flex = read("../src/views/Flex.jsx");
  assert.match(flex, /const stage = from \? stageOf\(from\) : null;/);
  assert.match(flex, /simulated\(c\.stage\) \? ", simulated money"/);
  assert.doesNotMatch(flex, /never get the Verified/);
});

test("the server sends a post's dollars and stage, never for an anonymous post, and never takes the browser's word", () => {
  const sql = read("../supabase/migrations-pending/20261105210000_post_money_and_cards.sql");
  assert.match(sql, /'pnl', case when t\.pnl is null then null else round\(t\.pnl, 2\) end/);
  assert.match(sql, /'stage', case when a\.id is null then null/);
  assert.match(sql, /jsonb_build_object\('setup', null, 'pnl', null,/, "an anonymous card has no dollars");
  assert.match(sql, /if new\.anonymous or new\.parent_id is not null[^\n]*\n\s+new\.card := null;/, "no card on an anonymous post or a reply");
  assert.match(sql, /- 'verified' - 'subject'/);
  assert.match(sql, /jsonb_set\(new\.card, '\{card,money\}', coalesce\(new\.trade->'pnl'/, "a trade's card carries the trade's own dollars");
  assert.match(sql, /case when p\.anonymous then null else p\.card end/);
  const live = read("../src/live/Community.jsx");
  assert.match(live, /startsWith\("own:"\) \? flex\.picture : null/, "a trader's own picture never leaves the device");
});

test("the security batch keeps admin powers behind the second step and stamps closes on the server", () => {
  const sql = read("../supabase/migrations-pending/20261105200000_security_batch.sql");
  assert.match(sql, /coalesce\(\(select auth\.jwt\(\)\) ->> 'aal', ''\) = 'aal2'/);
  assert.match(sql, /replace\(p\.qual, 'is_admin\(\)', 'public\.admin_aal2\(\)'\)/);
  assert.match(sql, /new\.facts := new\.facts - 'verified';/);
  assert.match(sql, /references auth\.users \(id\) on delete cascade/);
  assert.match(sql, /"files: 200MB each"/);
});

test("the boards and crew placings are off until a typed-in trade can't raise the score", () => {
  assert.match(read("../src/mode.js"), /^export const BOARDS = false;$/m);
  assert.match(read("../src/drip/hub/LivePanel.jsx"), /\{BOARDS && <TopBoard \/>\}/);
  const crews = read("../src/views/community/Crews.jsx");
  assert.match(crews, /\{BOARDS && <Boards tag=\{crew\} \/>\}/);
  assert.match(crews, /if \(!BOARDS\) return null;/);
  const site = read("../src/site/everything/features.js");
  for (const gone of [/Crew against crew/, /Closed days this month/, /Show me or hide me/, /Platform records only/]) assert.doesNotMatch(site, gone);
});
