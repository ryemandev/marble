import { insert, json, patch, rateOk, remove, rows, rpc, serve, signedIn } from "../_shared/server.ts";
import { DEFAULT_TZ, PLATFORM as HISTORY, buildIbkr } from "../_shared/import/ibkr.js";
import { carriedFrom } from "../_shared/import/topstepx.js";
import { carriedFor, checkLinks, saveSynced } from "../_shared/sync-save.ts";
import { RETRY, describeError, fetchStatement, flexFields, missingColumns, statementAccounts } from "./flex.js";

const BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const PLATFORM = "ibkr";
const DAY = 864e5;
const FIRST_SYNC_DAYS = 90;

class Plain extends Error { constructor(msg: string, public status = 400) { super(msg); } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");

async function get(path: string, params: Record<string, string>) {
  let r: Response;
  try {
    r = await fetch(`${BASE}/${path}?${new URLSearchParams({ ...params, v: "3" })}`, { headers: { "User-Agent": "Marble/1.0 (trademarble.app)" } });
  } catch {
    throw new Plain("IBKR didn't answer. Try again shortly.", 502); // the error's own words quote the address, and so the token
  }
  if (!r.ok) throw new Plain(`IBKR didn't answer (${r.status}). Try again shortly.`, 502);
  return r.text();
}

async function statement(token: string, queryId: string, range: { from: number; to: number }) {
  try {
    return await fetchStatement({ get, sleep, token, queryId, fd: ymd(range.from), td: ymd(range.to) });
  } catch (e) {
    if (e instanceof Plain) throw e;
    const code = (e as { code?: number }).code ?? null;
    throw new Plain(describeError(code, (e as { message?: string }).message), code === 1018 ? 429 : RETRY.includes(code as number) ? 504 : 400);
  }
}

function checkReport(text: string) {
  const fields = flexFields(text);
  if (fields.format === "xml") throw new Plain("Your Flex Query sends XML. Edit it in Client Portal: under Delivery Configuration set Format to CSV, then connect again.");
  if (fields.sectioned) throw new Plain("Your Flex Query adds section codes to each line. Edit it: under Delivery Configuration set \"Include section code and line descriptor\" to No.");
  const missing = missingColumns(fields.headers);
  if (missing.length) throw new Plain(`Your Flex Query is missing ${missing.join(", ")}. Edit its Trades section and tick ${missing.length === 1 ? "that field" : "those fields"}, then connect again.`);
  return fields;
}

type Acc = { id: string; name: string; balance: null; canTrade: boolean; linked: string | null; last_synced_at: string | null };

async function connectionOf(user: string) {
  const r = await rows("connections", `select=id,username,accounts,settings,status&user_id=eq.${user}&platform=eq.${PLATFORM}`);
  return r[0] || null;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await signedIn(req);
  if (!user) return json({ error: "Not signed in" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { }
  const action = String(body.action || "");

  try {
    if (action === "connect" && !(await rateOk(user.id, "connect:ibkr", 5, "1 hour"))) {
      throw new Plain("That's a lot of tries. Wait an hour, then connect Interactive Brokers again.", 429);
    }
    if (action === "link" && !(await rateOk(user.id, "link:ibkr", 30, "1 hour"))) {
      throw new Plain("That's a lot of changes. Wait an hour, then try again.", 429);
    }
    if (action === "sync" && !(await rateOk(user.id, "sync:ibkr", 1, "2 minutes"))) {
      throw new Plain("Interactive Brokers synced moments ago. Try again in a couple of minutes.", 429);
    }

    if (action === "connect") {
      const token = String(body.token || "").replace(/\s+/g, "");
      const queryId = String(body.queryId || "").replace(/\s+/g, "");
      if (!/^\d{6,40}$/.test(token)) throw new Plain("That doesn't look like a Flex Web Service token. It's a long number from Flex Web Service Configuration in Client Portal.");
      if (!/^\d{3,12}$/.test(queryId)) throw new Plain("That doesn't look like a Query ID. It's the number shown next to your Activity Flex Query.");
      const now = Date.now();
      const report = await statement(token, queryId, { from: now - 7 * DAY, to: now });
      checkReport(report);
      const existing = await connectionOf(user.id);
      const before = new Map((existing?.accounts || []).map((a: Acc) => [a.id, a]));
      const ids = statementAccounts(report);
      const list = ids.length ? ids : ["*"];
      const accounts: Acc[] = list.map((id) => ({
        id, name: id === "*" ? "Your IBKR account" : id, balance: null, canTrade: false,
        linked: (before.get(id) as Acc | undefined)?.linked ?? null, last_synced_at: (before.get(id) as Acc | undefined)?.last_synced_at ?? null,
      }));
      await rpc("connection_save", { p_user: user.id, p_platform: PLATFORM, p_username: `Flex Query ${queryId}`, p_key: token, p_accounts: accounts });
      await patch("connections", `user_id=eq.${user.id}&platform=eq.${PLATFORM}`, { settings: { queryId } });
      return json({ ok: true, accounts });
    }

    const conn = await connectionOf(user.id);
    if (action === "disconnect") {
      if (conn) await remove("connections", `id=eq.${conn.id}&user_id=eq.${user.id}`); // the trigger deletes the token
      return json({ ok: true });
    }
    if (!conn) throw new Plain("Interactive Brokers isn't connected.", 404);
    const accounts: Acc[] = conn.accounts || [];

    if (action === "link") {
      const links: any[] = Array.isArray(body.links) ? body.links.slice(0, 50) : [];
      const next = accounts.map((a) => ({ ...a, linked: null as string | null }));
      for (const l of links) {
        const a = next.find((x) => x.id === l.id);
        if (!a) continue;
        if (l.create) {
          const kind = ["Funded", "Evaluation", "Live", "Paper"].includes(l.create.kind) ? l.create.kind : "Live";
          const status = { Funded: "funded", Evaluation: "eval", Live: "live", Paper: "paper" }[kind as "Live"];
          const made = await insert("accounts", { user_id: user.id, name: String(l.create.name || a.name).trim().slice(0, 40) || "IBKR", kind, status, balance: 0 });
          a.linked = made.id;
        } else if (l.accountId) {
          const own = await rows("accounts", `select=id&id=eq.${encodeURIComponent(l.accountId)}&user_id=eq.${user.id}`);
          if (!own.length) throw new Plain("That Marble account isn't yours.", 403);
          a.linked = own[0].id;
        }
      }
      const frozen = await checkLinks(user.id, PLATFORM, next);
      if (frozen) throw new Plain(frozen, 409);
      await patch("connections", `id=eq.${conn.id}`, { accounts: next, updated_at: new Date().toISOString() });
      return json({ ok: true, accounts: next });
    }

    if (action === "sync") {
      const linked = accounts.filter((a) => a.linked);
      if (!linked.length) throw new Plain("Choose which Marble account each IBKR account feeds first.");
      const token = await rpc("connection_key", { p_user: user.id, p_platform: PLATFORM });
      if (!token) throw new Plain("Connect Interactive Brokers again: the saved token is missing.", 404);
      const now = Date.now();
      const lasts = linked.map((a) => (a.last_synced_at ? Date.parse(a.last_synced_at) - DAY : now - FIRST_SYNC_DAYS * DAY));
      let start = Math.min(...lasts);
      const carriedBy: Record<string, any[]> = {};
      for (const a of linked) carriedBy[a.id] = await carriedFor(user.id, a.linked as string, HISTORY);
      const from = Date.parse(carriedFrom(Object.values(carriedBy).flat()) || "");
      if (Number.isFinite(from) && from < start) start = from;
      start = Math.max(start, now - 364 * DAY); // IBKR's limit is a year
      let csv: string;
      try {
        csv = await statement(token, conn.settings?.queryId, { from: start, to: now });
        checkReport(csv);
      } catch (e) {
        if (e instanceof Plain && e.status !== 429 && e.status !== 504) await patch("connections", `id=eq.${conn.id}`, { status: "error", last_error: e.message.slice(0, 300) });
        throw e;
      }
      let added = 0, upgraded = 0;
      const imports: string[] = [];
      for (const a of linked) {
        const carried = carriedBy[a.id];
        const result = buildIbkr(csv, a.id, { carried, tz: conn.settings?.tz || DEFAULT_TZ });
        const saved = await saveSynced({ user: user.id, accountId: a.linked as string, platform: HISTORY, label: `IBKR · ${a.name}`, result, carried });
        added += saved.added; upgraded += saved.upgraded;
        if (saved.importId) imports.push(saved.importId);
      }
      const ids = new Set(linked.map((a) => a.id));
      const next = accounts.map((x) => (ids.has(x.id) ? { ...x, last_synced_at: new Date(now).toISOString() } : x));
      await patch("connections", `id=eq.${conn.id}`, { accounts: next, last_synced_at: new Date().toISOString(), status: "ok", last_error: null });
      return json({ ok: true, added, upgraded, imports, accounts: next });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    if (e instanceof Plain) return json({ error: e.message }, e.status);
    if ((e as { plain?: boolean }).plain) return json({ error: (e as Error).message }, (e as { status?: number }).status || 400);
    console.error("[ibkr]", action, (e as Error).message?.slice(0, 200));
    return json({ error: "Something went wrong talking to IBKR. Try again." }, 500);
  }
});
