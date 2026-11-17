// node --test tests/   (from app/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError, fetchStatement, flexFields, flexStatus, missingColumns, statementAccounts } from "../supabase/functions/ibkr/flex.js";
import { buildIbkr, SETUP } from "../src/live/import/ibkr.js";

const xml = (inner) => `<FlexStatementResponse timestamp="28 October, 2026 10:37 AM EDT">${inner}</FlexStatementResponse>`;
const OK = xml("<Status>Success</Status><ReferenceCode>7729029235</ReferenceCode><url>https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement</url>");
const FAIL = (code, msg) => xml(`<Status>Fail</Status><ErrorCode>${code}</ErrorCode><ErrorMessage>${msg}</ErrorMessage>`);

const CSV = [
  `"ClientAccountID","Symbol","Date/Time","Buy/Sell","Quantity","TradePrice","IBCommission","Multiplier","TradeID","Open/CloseIndicator"`,
  `"U1111111","MESZ6","20261027;093000","BUY","2","6000.25","-1.24","5","9001","O"`,
  `"U1111111","MESZ6","20261027;094500","SELL","-1","6004.25","-0.62","5","9002","C"`,
  `"U1111111","MESZ6","20261027;100000","SELL","-1","6006.25","-0.62","5","9003","C"`,
  `"U1111111","AAPL","20261027;101500","BUY","100","230.50","-1.00","1","9004","O"`,
  `"U2222222","TSLA","20261027;110000","SELL","-10","250.00","-1.00","1","9005","C"`,
  `"U2222222","TSLA","20261027;120000","SELL","-5","251.00","-1.00","1","9006","O"`,
  `"U2222222","TSLA","20261027;130000","BUY","5","249.00","-1.00","1","9007","C"`,
].join("\r\n");

function fakeIbkr(script) {
  const calls = [];
  const replies = [...script];
  return {
    calls,
    get: async (path, params) => { calls.push({ path, ...params }); return replies.shift(); },
    sleep: async (ms) => { calls.push({ sleep: ms }); },
  };
}

test("ibkr: SendRequest then GetStatement, waiting while the report is made", async () => {
  const ibkr = fakeIbkr([OK, FAIL(1019, "Statement generation in progress. Please try again shortly."), CSV]);
  const csv = await fetchStatement({ ...ibkr, token: "833145478193195254070598", queryId: "1099104", fd: "20261020", td: "20261028" });
  assert.equal(csv, CSV);
  const asks = ibkr.calls.filter((c) => c.path);
  assert.deepEqual(asks.map((c) => c.path), ["SendRequest", "GetStatement", "GetStatement"]);
  assert.equal(asks[0].q, "1099104"); assert.equal(asks[0].fd, "20261020"); assert.equal(asks[0].td, "20261028");
  assert.equal(asks[1].q, "7729029235"); // the reference, not the query
  assert.ok(ibkr.calls.filter((c) => c.sleep).every((c) => c.sleep >= 1000));
  assert.ok(asks.length <= 10);
});

test("ibkr: an expired or wrong token, and a report that never finishes, fail with IBKR's code", async () => {
  await assert.rejects(fetchStatement({ ...fakeIbkr([FAIL(1012, "Token has expired.")]), token: "1", queryId: "2" }), (e) => e.code === 1012);
  await assert.rejects(fetchStatement({ ...fakeIbkr([OK, FAIL(1015, "Token is invalid.")]), token: "1", queryId: "2" }), (e) => e.code === 1015);
  const slow = fakeIbkr([OK, ...Array(5).fill(FAIL(1019, "Statement generation in progress."))]);
  await assert.rejects(fetchStatement({ ...slow, token: "1", queryId: "2" }), (e) => e.code === 1019);
  assert.equal(slow.calls.filter((c) => c.path).length, 6);
  assert.match(describeError(1012), /expired/);
  assert.match(describeError(1014), /Query ID/);
  assert.match(describeError(1018), /slow down/);
  assert.match(describeError(1013), /IP/);
  assert.match(describeError(4242, "Something odd"), /IBKR said: Something odd/);
});

test("ibkr: replies are read for what they are", () => {
  assert.deepEqual(flexStatus(OK), { ok: true, reference: "7729029235", url: "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement" });
  assert.deepEqual(flexStatus(FAIL(1018, "Too many requests")), { ok: false, code: 1018, message: "Too many requests" });
  assert.deepEqual(flexStatus(CSV), { ok: null });
  assert.equal(flexFields('<FlexQueryResponse queryName="x"><FlexStatements/></FlexQueryResponse>').format, "xml");
  assert.equal(flexFields(`"BOF","U1111111","Trades"\n"HEADER","TRNT","ClientAccountID"`).sectioned, true);
  assert.deepEqual(missingColumns(flexFields(CSV).headers), []);
  assert.deepEqual(missingColumns(["ClientAccountID", "Symbol", "Date/Time", "Quantity", "Price"]), ["Buy/Sell"]);
  assert.deepEqual(statementAccounts(CSV), ["U1111111", "U2222222"]);
  assert.deepEqual(statementAccounts(`"Symbol","Date/Time"\n"AAPL","20261027;101500"`), []);
});

test("ibkr: each account's trades from one report, futures by the file's multiplier", () => {
  const one = buildIbkr(CSV, "U1111111");
  assert.equal(one.trades.length, 1);
  const mes = one.trades[0];
  assert.equal(mes.symbol, "MES"); assert.equal(mes.side, "long"); assert.equal(mes.size, 2);
  assert.equal(mes.gross, 50); // (4 + 6) points x $5
  assert.equal(mes.commission, 2.48); assert.equal(mes.net, 47.52);
  assert.equal(mes.key, "f:MESZ6:id:U1111111:9001");
  assert.equal(one.open.length, 1); assert.equal(one.open[0].symbol, "AAPL"); // still holding
  assert.equal(new Date(mes.opened).toISOString(), "2026-10-27T13:30:00.000Z");

  const two = buildIbkr(CSV, "U2222222");
  assert.equal(two.orphans.length, 1);
  assert.equal(two.trades.length, 1);
  assert.equal(two.trades[0].side, "short"); assert.equal(two.trades[0].gross, 10);

  assert.equal(buildIbkr(CSV, "U9999999").trades.length, 0);
  assert.equal(buildIbkr(CSV, "*").trades.length, 1);
});

test("ibkr: the next sync finishes the open position and repeats nothing", () => {
  const first = buildIbkr(CSV, "U1111111");
  const carried = first.open.flatMap((o) => o.fills);
  const later = CSV + `\r\n"U1111111","AAPL","20261028;150000","SELL","-100","232.00","-1.00","1","9010","C"`;
  const next = buildIbkr(later, "U1111111", { carried });
  assert.deepEqual(next.trades.map((t) => t.key), ["f:MESZ6:id:U1111111:9001", "f:AAPL:id:U1111111:9004"]);
  const aapl = next.trades[1];
  assert.equal(aapl.gross, 150); assert.equal(aapl.commission, 2);
  assert.equal(next.open.length, 0);
});

test("ibkr: the setup steps ask for exactly what the preset reads", () => {
  const text = SETUP.join(" ");
  for (const s of ["Activity Flex Query", "Executions", "Account ID", "Date/Time", "Trade Price", "IB Commission", "Multiplier", "Trade ID", "Open/Close", "CSV", "yyyyMMdd", "HHmmss", "semi-colon", "Flex Web Service"]) assert.ok(text.includes(s), s);
});
