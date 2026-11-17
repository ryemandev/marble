const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const tag = (xml, name) => (new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i").exec(xml) || [])[1]?.trim() ?? null;

export function flexStatus(text) {
  const s = String(text || "");
  if (!/<FlexStatementResponse/i.test(s)) return { ok: null };
  const status = tag(s, "Status");
  const code = +tag(s, "ErrorCode") || null;
  if (/^success$/i.test(status || "")) return { ok: true, reference: tag(s, "ReferenceCode"), url: tag(s, "url") };
  return { ok: false, code, message: tag(s, "ErrorMessage") || "IBKR couldn't make the report." };
}

const WHERE = "Client Portal → Performance & Reports → Flex Queries";
// IBKR's error codes in plain English, with what to do
export function describeError(code, message = "") {
  switch (code) {
    case 1012: return `Your Flex Web Service token has expired. Make a new one in ${WHERE} → Flex Web Service Configuration, then connect again.`;
    case 1015: return `IBKR doesn't recognise that token. Copy it again from ${WHERE} → Flex Web Service Configuration.`;
    case 1014: return "IBKR can't find that Query ID. Use the number shown next to your Activity Flex Query.";
    case 1010: return "That's a legacy Flex Query. Make an Activity Flex Query instead (the steps are on this screen).";
    case 1011: return `The Flex Web Service is switched off for your account. Turn it on in ${WHERE} → Flex Web Service Configuration.`;
    case 1013: return "Your Flex token only works from certain IP addresses. Remove the IP restriction in Flex Web Service Configuration so Marble's server can use it.";
    case 1016: return "IBKR says the account in this query isn't valid. Check the query's accounts in Client Portal.";
    case 1018: return "IBKR asked us to slow down. Try again in a minute.";
    case 1025: return "IBKR has paused this token after too many failed attempts. Wait a while, or make a new token.";
    case 1001: case 1004: case 1009: case 1019: case 1021: return "IBKR is still preparing your report. Try syncing again in a minute.";
    default: return `IBKR said: ${String(message || "the report isn't available").replace(/([?&]t=)[^&\s]+/g, "$1hidden").slice(0, 200)}`;
  }
}

// A CSV line to its cells (Flex quotes every value)
export function cells(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const lines = (text) => String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());

export function flexFields(text) {
  const all = lines(text);
  if (!all.length) return { format: "csv", headers: [], sectioned: false };
  if (all[0].trim().startsWith("<")) return { format: "xml", headers: [], sectioned: false };
  const first = cells(all[0]);
  const sectioned = /^(BOF|BOA|BOS|HEADER|DATA)$/i.test(first[0]);
  return { format: "csv", headers: sectioned ? [] : first, sectioned };
}

const NEED = [
  [["ClientAccountID"], "Account ID"],
  [["Symbol"], "Symbol"],
  [["DateTime"], "Date/Time"],
  [["Buy/Sell"], "Buy/Sell"],
  [["Quantity"], "Quantity"],
  [["TradePrice", "Price"], "Trade Price"],
];
export function missingColumns(headers = []) {
  const have = new Set(headers.map(norm));
  return NEED.filter(([alts]) => !alts.some((a) => have.has(norm(a)))).map(([, label]) => label);
}

export function statementAccounts(text) {
  const all = lines(text);
  if (!all.length || all[0].trim().startsWith("<")) return [];
  const head = cells(all[0]).map(norm);
  const i = head.indexOf("clientaccountid");
  if (i < 0) return [];
  const seen = [];
  for (const l of all.slice(1)) { const v = cells(l)[i]; if (v && !seen.includes(v) && norm(v) !== "clientaccountid") seen.push(v); }
  return seen;
}

// Codes that mean "not ready yet": wait and ask again
export const RETRY = [1001, 1004, 1009, 1019, 1021];
export const WAITS = [2000, 3000, 5000, 8000, 10000];

export async function fetchStatement({ get, sleep, token, queryId, fd, td, waits = WAITS }) {
  const sent = flexStatus(await get("SendRequest", { t: token, q: queryId, ...(fd && td ? { fd, td } : {}) }));
  if (sent.ok !== true) throw { code: sent.code ?? null, message: sent.message || "IBKR didn't accept the request." };
  for (const wait of waits) {
    await sleep(wait);
    const body = await get("GetStatement", { t: token, q: sent.reference });
    const st = flexStatus(body);
    if (st.ok !== false) return body; // the report itself
    if (!RETRY.includes(st.code)) throw { code: st.code, message: st.message };
  }
  throw { code: 1019, message: "Statement generation in progress." };
}
