import { insert, json, patch, rateOk, remove, rows, rpc, serve, signedIn } from "../_shared/server.ts";
import { PLATFORM as HISTORY, buildSync, carriedFrom } from "../_shared/import/topstepx.js";
import { carriedFor, checkLinks, saveSynced } from "../_shared/sync-save.ts";

const API = "https://api.topstepx.com/api";
const PLATFORM = "topstepx";
const DAY = 864e5;
const FIRST_SYNC_DAYS = 90;
const OVERLAP_MS = 10 * 60e3;
const CHUNK_DAYS = 7;

class Plain extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const WRONG_KEY = "Topstep didn't accept that username and API key. Check both in TopstepX under Settings → API, and that API access is active on your Topstep account.";

async function call(path: string, body: unknown, token?: string, tries = 3): Promise<any> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (r.status === 429) {
    if (tries > 1) { await new Promise((res) => setTimeout(res, 2500)); return call(path, body, token, tries - 1); }
    throw new Plain("Topstep is busy right now. Try syncing again in a minute.", 429);
  }
  if (r.status === 401) throw new Plain(WRONG_KEY, 401);
  if (!r.ok) throw new Plain(`Topstep didn't answer (${r.status}). Try again shortly.`, 502);
  return r.json();
}

async function login(username: string, apiKey: string): Promise<string> {
  const out = await call("/Auth/loginKey", { userName: username, apiKey });
  if (!out?.success || !out?.token) throw new Plain(WRONG_KEY, 401);
  return out.token;
}

type Acc = { id: number; name: string; balance: number | null; canTrade: boolean; linked: string | null; last_synced_at: string | null };

async function topstepAccounts(token: string, keep: Acc[] = []): Promise<Acc[]> {
  const out = await call("/Account/search", { onlyActiveAccounts: false }, token);
  if (!out?.success) throw new Plain("Topstep wouldn't list your accounts. Try again shortly.", 502);
  const before = new Map(keep.map((a) => [a.id, a]));
  return (out.accounts || []).map((a: any) => ({
    id: a.id, name: String(a.name ?? a.id).slice(0, 80), balance: Number.isFinite(+a.balance) ? +a.balance : null, canTrade: !!a.canTrade,
    linked: before.get(a.id)?.linked ?? null, last_synced_at: before.get(a.id)?.last_synced_at ?? null,
  }));
}

async function connectionOf(user: string) {
  const r = await rows("connections", `select=id,username,accounts,status&user_id=eq.${user}&platform=eq.${PLATFORM}`);
  return r[0] || null;
}

const fillOut = (t: any) => ({
  id: t.id, contractId: t.contractId, creationTimestamp: t.creationTimestamp, price: t.price, profitAndLoss: t.profitAndLoss,
  fees: t.fees, side: t.side, size: t.size, voided: !!t.voided, orderId: t.orderId,
});

async function fillsOf(token: string, accountId: number, start: number, now: number) {
  const out: any[] = [];
  for (let t = start; t < now; t += CHUNK_DAYS * DAY) {
    const end = Math.min(t + CHUNK_DAYS * DAY, now);
    const r = await call("/Trade/search", { accountId, startTimestamp: new Date(t).toISOString(), endTimestamp: new Date(end).toISOString() }, token);
    if (!r?.success) throw new Plain("Topstep wouldn't send your trades. Try again shortly.", 502);
    out.push(...(r.trades || []).map(fillOut));
  }
  return out;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await signedIn(req);
  if (!user) return json({ error: "Not signed in" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { }
  const action = String(body.action || "");

  try {
    if (action === "connect" && !(await rateOk(user.id, `connect:${PLATFORM}`, 5, "1 hour"))) {
      throw new Plain("That's a lot of tries. Wait an hour, then connect Topstep again.", 429);
    }
    if (action === "link" && !(await rateOk(user.id, `link:${PLATFORM}`, 30, "1 hour"))) {
      throw new Plain("That's a lot of changes. Wait an hour, then try again.", 429);
    }
    if (action === "sync" && !(await rateOk(user.id, `sync:${PLATFORM}`, 1, "2 minutes"))) {
      throw new Plain("Topstep synced moments ago. Try again in a couple of minutes.", 429);
    }

    if (action === "connect") {
      const username = String(body.username || "").trim();
      const apiKey = String(body.apiKey || "").trim();
      if (!username || username.length > 120) throw new Plain("Enter your TopstepX username (not your email).");
      if (apiKey.length < 8 || apiKey.length > 400) throw new Plain("That doesn't look like a TopstepX API key. Copy it again from Settings → API.");
      const token = await login(username, apiKey);
      const existing = await connectionOf(user.id);
      const accounts = await topstepAccounts(token, existing?.accounts || []);
      await rpc("connection_save", { p_user: user.id, p_platform: PLATFORM, p_username: username, p_key: apiKey, p_accounts: accounts });
      return json({ ok: true, username, accounts });
    }

    const conn = await connectionOf(user.id);
    if (action === "disconnect") {
      if (conn) await remove("connections", `id=eq.${conn.id}&user_id=eq.${user.id}`); // the trigger deletes the key
      return json({ ok: true });
    }
    if (!conn) throw new Plain("Topstep isn't connected.", 404);
    const accounts: Acc[] = conn.accounts || [];

    if (action === "link") {
      const links: any[] = Array.isArray(body.links) ? body.links.slice(0, 50) : [];
      const next = accounts.map((a) => ({ ...a, linked: null as string | null }));
      for (const l of links) {
        const a = next.find((x) => x.id === l.id);
        if (!a) continue;
        if (l.create) {
          const kind = ["Funded", "Evaluation", "Live", "Paper"].includes(l.create.kind) ? l.create.kind : "Evaluation";
          const status = { Funded: "funded", Evaluation: "eval", Live: "live", Paper: "paper" }[kind as "Funded"];
          const made = await insert("accounts", { user_id: user.id, name: String(l.create.name || a.name).trim().slice(0, 40) || a.name, kind, status, balance: a.balance ?? 0 });
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
      if (!accounts.some((a) => a.linked)) throw new Plain("Choose which Marble account each Topstep account feeds first.");
      const key = await rpc("connection_key", { p_user: user.id, p_platform: PLATFORM });
      if (!key) throw new Plain("Connect Topstep again: the saved key is missing.", 404);
      let token: string;
      try { token = await login(conn.username, key); } catch (e) {
        await patch("connections", `id=eq.${conn.id}`, { status: "error", last_error: (e as Error).message.slice(0, 300) });
        throw e;
      }
      let current: Acc[] = accounts;
      try {
        const fresh = await topstepAccounts(token, accounts);
        const seen = new Set(fresh.map((a) => a.id));
        current = [...fresh, ...accounts.filter((a) => !seen.has(a.id))];
      } catch { }
      let added = 0, upgraded = 0;
      const imports: string[] = [];
      for (const a of current.filter((x) => x.linked)) {
        const now = Date.now();
        const carried = await carriedFor(user.id, a.linked as string, HISTORY);
        let start = a.last_synced_at ? Date.parse(a.last_synced_at) - OVERLAP_MS : now - FIRST_SYNC_DAYS * DAY;
        const from = Date.parse(carriedFrom(carried) || "");
        if (Number.isFinite(from) && from < start) start = Math.max(from - 1000, now - 365 * DAY);
        const fills = await fillsOf(token, a.id, start, now);
        const saved = await saveSynced({ user: user.id, accountId: a.linked as string, platform: HISTORY, label: `Topstep · ${a.name}`, result: buildSync(fills, { carried }), carried });
        added += saved.added; upgraded += saved.upgraded;
        if (saved.importId) imports.push(saved.importId);
        current = current.map((x) => (x.id === a.id ? { ...x, last_synced_at: new Date(now).toISOString() } : x));
        await patch("connections", `id=eq.${conn.id}`, { accounts: current, updated_at: new Date().toISOString() });
      }
      await patch("connections", `id=eq.${conn.id}`, { last_synced_at: new Date().toISOString(), status: "ok", last_error: null });
      return json({ ok: true, added, upgraded, imports, accounts: current });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    if (e instanceof Plain) return json({ error: e.message }, e.status);
    if ((e as { plain?: boolean }).plain) return json({ error: (e as Error).message }, (e as { status?: number }).status || 400);
    console.error("[topstepx]", action, (e as Error).message?.slice(0, 200));
    return json({ error: "Something went wrong talking to Topstep. Try again." }, 500);
  }
});
