import { test } from "node:test";
import assert from "node:assert/strict";
import * as appCsv from "../src/live/import/csv.js";
import * as appPresets from "../src/live/import/presets.js";
import * as appPair from "../src/live/import/pair.js";
import * as appSymbols from "../src/live/import/symbols.js";
import * as appWhen from "../src/live/import/when.js";
import * as appEngine from "../src/live/import/engine.js";
import * as appTopstep from "../src/live/import/topstepx.js";
import * as appIbkr from "../src/live/import/ibkr.js";
import * as csv from "../supabase/functions/_shared/import/csv.js";
import * as presets from "../supabase/functions/_shared/import/presets.js";
import * as pair from "../supabase/functions/_shared/import/pair.js";
import * as symbols from "../supabase/functions/_shared/import/symbols.js";
import * as when from "../supabase/functions/_shared/import/when.js";
import * as engine from "../supabase/functions/_shared/import/engine.js";
import * as topstep from "../supabase/functions/_shared/import/topstepx.js";
import * as ibkr from "../supabase/functions/_shared/import/ibkr.js";
import { BROKER_FIELDS, FROZEN, linkProblem, planSync, twinWindow } from "../supabase/functions/_shared/import/sync-plan.js";

test("the app and the edge functions share one copy of the import engine", () => {
  const pairs = [[appCsv, csv], [appPresets, presets], [appPair, pair], [appSymbols, symbols], [appWhen, when], [appEngine, engine], [appTopstep, topstep], [appIbkr, ibkr]];
  for (const [app, shared] of pairs) {
    const names = Object.keys(shared);
    assert.ok(names.length > 0);
    assert.deepEqual(Object.keys(app).sort(), names.sort());
    for (const n of names) assert.equal(app[n], shared[n], `${n} is the same object`);
  }
});

let id = 5000;
const f = (contractId, side, size, price, at, pnl = null) => ({
  id: ++id, accountId: 7, contractId, creationTimestamp: `2026-10-27T${at}.123+00:00`, price, profitAndLoss: pnl, fees: 0.37 * size, side, size, voided: false, orderId: id + 5000,
});
const FILLS = [
  f("CON.F.US.MNQ.Z26", 0, 1, 21000, "13:30:05"),
  f("CON.F.US.MNQ.Z26", 1, 1, 21010, "13:35:00", 20),
  f("CON.F.US.EP.Z26", 1, 2, 6000, "14:00:00"),
  f("CON.F.US.EP.Z26", 0, 2, 5996, "14:12:00", 400),
  f("CON.F.US.ENQ.Z26", 0, 1, 21100, "15:00:00"), // still open
];
const ACCOUNT = "11111111-1111-4111-8111-111111111111";

test("a server sync builds the same rows the app used to, all marked 'sync'", () => {
  const result = topstep.buildSync(FILLS);
  const plan = planSync({ result, accountId: ACCOUNT, risk: 100 });
  assert.equal(plan.rows.length, 2);
  for (const [row, t] of plan.rows.map((r, i) => [r, result.trades[i]])) {
    const old = { ...engine.toRow(t, { accountId: ACCOUNT, importId: null, risk: 100 }), source: "sync" };
    assert.deepEqual({ ...row, id: null }, { ...old, id: null });
  }
  assert.equal(plan.rows[0].pnl, 20 - 0.74);
  assert.equal(plan.rows[1].pnl, 400 - 1.48);
  assert.equal(plan.openFills.length, 1); // the NQ long, carried to the next sync
  assert.equal(plan.worthSaving, true);
});

test("already-synced keys are skipped; nothing new and the same open position: nothing to save", () => {
  const result = topstep.buildSync(FILLS);
  const keys = result.trades.map((t) => t.key);
  const plan = planSync({ result, accountId: ACCOUNT, existing: new Set(keys), carried: result.open.flatMap((o) => o.fills) });
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.duplicates, 2);
  assert.equal(plan.worthSaving, false);
});

test("a trade the trader logged by hand becomes the synced one, keeping their review, and is used once", () => {
  const result = topstep.buildSync(FILLS);
  const mnq = result.trades[0];
  const logged = [
    { id: "manual-1", symbol: "mnq", side: "long", traded_at: new Date(+mnq.opened + 60e3).toISOString(), source: "manual" },
    { id: "manual-2", symbol: "MNQ", side: "long", traded_at: new Date(+mnq.opened - 30e3).toISOString(), source: "manual" },
    { id: "synced-1", symbol: "ES", side: "short", traded_at: result.trades[1].opened.toISOString(), source: "sync" }, // never a twin
  ];
  const plan = planSync({ result, accountId: ACCOUNT, logged });
  assert.equal(plan.upgrades.length, 1);
  assert.equal(plan.upgrades[0].id, "manual-1");
  assert.deepEqual(Object.keys(plan.upgrades[0]).sort(), ["id", ...BROKER_FIELDS].sort());
  assert.equal(plan.upgrades[0].pnl, 20 - 0.74);
  assert.equal(plan.upgrades[0].external_id, mnq.key);
  assert.deepEqual(plan.rows.map((r) => r.symbol), ["ES"]);
});

test("a market Marble can't price is left out, not saved with no P&L", () => {
  const result = { trades: [{ key: "x", gross: null, opened: new Date(), symbol: "ZB" }], open: [] };
  const plan = planSync({ result, accountId: ACCOUNT });
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.unpriced, 1);
  assert.equal(plan.worthSaving, false);
});

test("hand-logged twins are looked for two minutes either side", () => {
  const w = twinWindow([{ opened: new Date("2026-10-27T13:30:00Z") }, { opened: new Date("2026-10-27T15:00:00Z") }]);
  assert.deepEqual(w, { from: "2026-10-27T13:28:00.000Z", to: "2026-10-27T15:02:00.000Z" });
  assert.equal(twinWindow([]), null);
});

test("an account in a competition keeps its broker link", () => {
  const A = "acc-a", B = "acc-b";
  const frozen = [{ account_id: A, broker_platform: "topstepx", broker_account: 7 }];
  assert.equal(linkProblem({ platform: "topstepx", next: [{ id: 7, linked: null }], frozen }), null);
  assert.equal(linkProblem({ platform: "topstepx", next: [{ id: 7, linked: A }, { id: 8, linked: B }], frozen }), null);
  assert.equal(linkProblem({ platform: "topstepx", next: [{ id: 7, linked: B }], frozen }), FROZEN);
  assert.equal(linkProblem({ platform: "topstepx", next: [{ id: 7, linked: A }, { id: 8, linked: A }], frozen }), FROZEN);
  assert.equal(linkProblem({ platform: "ibkr", next: [{ id: "U1", linked: A }], frozen }), FROZEN);
  assert.equal(linkProblem({ platform: "ibkr", next: [{ id: "U1", linked: B }], frozen }), null);
});

test("IBKR: the server reads the Flex report with the file import's own preset", () => {
  const head = "ClientAccountID,Symbol,DateTime,Buy/Sell,Quantity,TradePrice,IBCommission,Multiplier,TradeID,Open/CloseIndicator";
  const rows = [
    "U1,MES,20261027;093000,BUY,1,6000,-0.62,5,1,O",
    "U1,MES,20261027;094500,SELL,-1,6004,-0.62,5,2,C",
    "U2,MES,20261027;100000,BUY,1,6000,-0.62,5,3,O",
  ];
  const result = ibkr.buildIbkr([head, ...rows].join("\n"), "U1");
  const plan = planSync({ result, accountId: ACCOUNT });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].source, "sync");
  assert.equal(plan.rows[0].pnl, 20 - 1.24);
});
