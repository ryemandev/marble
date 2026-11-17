import { insert, json, patch, rateOk, remove, rows, serve, signedIn } from "../_shared/server.ts";
import { PLATFORM as HISTORY, buildHyperliquid, positionsOf } from "../_shared/import/hyperliquid.js";
import { carriedFrom } from "../_shared/import/topstepx.js";
import { carriedFor, saveSynced } from "../_shared/sync-save.ts";

const API = "https://api.hyperliquid.xyz/info";
const PLATFORM = "hyperliquid";
const MAX_WALLETS = 10;
const OVERLAP_MS = 10 * 60e3;
const HOUR = 3600e3;
const MAX_PAGES = 12;

class Plain extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const isAddress = (s: string) => /^0x[0-9a-f]{40}$/.test(s);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function info(body: Record<string, unknown>, tries = 3): Promise<any> {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 429) {
    if (tries > 1) { await sleep(3000); return info(body, tries - 1); }
    throw new Plain("Hyperliquid is busy right now. Try syncing again in a minute.", 429);
  }
  if (!r.ok) throw new Plain(`Hyperliquid didn't answer (${r.status}). Try again shortly.`, 502);
  return r.json();
}

async function paged(type: string, user: string, start: number, end: number): Promise<any[]> {
  const out: any[] = [];
  let from = start;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await info({ type, user, startTime: from, endTime: end, ...(type === "userFillsByTime" ? { aggregateByTime: false } : {}) });
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    const last = Math.max(...page.map((x: any) => +x.time || 0));
    if (page.length < 500 || last <= from) break;
    from = last;
  }
  return out;
}

const fillOut = (f: any) => ({
  coin: f.coin, px: f.px, sz: f.sz, side: f.side, time: f.time, dir: f.dir, fee: f.fee, feeToken: f.feeToken,
  crossed: f.crossed, closedPnl: f.closedPnl, startPosition: f.startPosition, tid: f.tid, oid: f.oid,
  ...(f.liquidation ? { liquidation: { method: f.liquidation.method, markPx: f.liquidation.markPx } } : {}),
});
function uniqueFunding(list: any[]) {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = `${e.time}|${e.delta?.coin}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type Wallet = { id: string; name: string; role: string; linked: string | null; last_synced_at: string | null; balance: number | null; positions: any[] };

async function connectionOf(user: string) {
  const r = await rows("connections", `select=id,username,accounts,status&user_id=eq.${user}&platform=eq.${PLATFORM}`);
  return r[0] || null;
}
// One of the trader's own crypto accounts, or a plain error
async function ownCrypto(user: string, accountId: string) {
  const own = await rows("accounts", `select=id,world&id=eq.${encodeURIComponent(accountId)}&user_id=eq.${user}`);
  if (!own.length) throw new Plain("That Marble account isn't yours.", 403);
  if (own[0].world !== "crypto") throw new Plain("A wallet feeds a crypto account. Choose one in the crypto world.", 400);
  return own[0].id as string;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await signedIn(req);
  if (!user) return json({ error: "Not signed in" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { }
  const action = String(body.action || "");

  try {
    if (action === "connect" && !(await rateOk(user.id, `connect:${PLATFORM}`, 10, "1 hour"))) {
      throw new Plain("That's a lot of wallets in an hour. Wait a while, then add it again.", 429);
    }
    if (action === "sync" && !(await rateOk(user.id, `sync:${PLATFORM}`, 1, "2 minutes"))) {
      throw new Plain("Hyperliquid synced moments ago. Try again in a couple of minutes.", 429);
    }

    const conn = await connectionOf(user.id);
    const wallets: Wallet[] = conn?.accounts || [];
    const save = async (next: Wallet[]) => {
      if (!conn) return insert("connections", { user_id: user.id, platform: PLATFORM, username: next[0].id, accounts: next, status: "ok" });
      return patch("connections", `id=eq.${conn.id}`, { accounts: next, username: next[0]?.id || conn.username, updated_at: new Date().toISOString() });
    };

    if (action === "connect") {
      const address = String(body.address || "").trim().toLowerCase();
      if (!isAddress(address)) throw new Plain("That isn't a wallet address: it starts with 0x and has 40 letters or digits after it.");
      const known = wallets.find((w) => w.id === address);
      if (!known && wallets.length >= MAX_WALLETS) throw new Plain(`Marble keeps up to ${MAX_WALLETS} wallets. Remove one first.`);
      const role = await info({ type: "userRole", user: address }).catch(() => null);
      if (role?.role === "agent") throw new Plain("That's an API wallet, which holds no trades. Use your main or sub-account address.");
      if (role?.role === "missing") throw new Plain("Hyperliquid doesn't know that address. Copy it again from your portfolio page.");
      const linked = body.accountId ? await ownCrypto(user.id, String(body.accountId)) : known?.linked ?? null;
      const wallet: Wallet = { id: address, name: short(address), role: String(role?.role || "user").slice(0, 20), linked, last_synced_at: known?.last_synced_at ?? null, balance: known?.balance ?? null, positions: known?.positions ?? [] };
      const next = [...wallets.filter((w) => w.id !== address), wallet];
      await save(next);
      return json({ ok: true, accounts: next });
    }

    if (action === "disconnect") {
      if (conn) await remove("connections", `id=eq.${conn.id}&user_id=eq.${user.id}`);
      return json({ ok: true });
    }
    if (!conn) throw new Plain("No Hyperliquid wallet is connected.", 404);

    if (action === "remove") {
      const address = String(body.address || "").trim().toLowerCase();
      const next = wallets.filter((w) => w.id !== address);
      if (!next.length) await remove("connections", `id=eq.${conn.id}&user_id=eq.${user.id}`);
      else await save(next);
      return json({ ok: true, accounts: next });
    }

    if (action === "link") {
      const links: any[] = Array.isArray(body.links) ? body.links.slice(0, MAX_WALLETS) : [];
      const next = wallets.map((w) => ({ ...w, linked: null as string | null }));
      for (const l of links) {
        const w = next.find((x) => x.id === String(l.id || "").toLowerCase());
        if (!w) continue;
        if (l.create) {
          const kind = ["Funded", "Evaluation", "Live", "Paper"].includes(l.create.kind) ? l.create.kind : "Live";
          const status = { Funded: "funded", Evaluation: "eval", Live: "live", Paper: "paper" }[kind as "Live"];
          const made = await insert("accounts", {
            user_id: user.id, name: String(l.create.name || `Hyperliquid ${w.name}`).trim().slice(0, 60), kind, status, balance: w.balance ?? 0,
            world: "crypto", firm: "hyperliquid", label: w.name, quote_ccy: "USDC",
          });
          w.linked = made.id;
        } else if (l.accountId) {
          w.linked = await ownCrypto(user.id, String(l.accountId));
        }
      }
      await save(next);
      return json({ ok: true, accounts: next });
    }

    if (action === "sync") {
      if (!wallets.some((w) => w.linked)) throw new Plain("Choose which Marble account each wallet feeds first.");
      let added = 0, upgraded = 0;
      const imports: string[] = [];
      let current = wallets;
      for (const w of wallets.filter((x) => x.linked)) {
        const now = Date.now();
        const carried = await carriedFor(user.id, w.linked as string, HISTORY);
        let start = w.last_synced_at ? Date.parse(w.last_synced_at) - OVERLAP_MS : 0;
        const from = Date.parse(carriedFrom(carried) || "");
        if (Number.isFinite(from) && from < start) start = Math.max(0, from - 1000);
        const fills = (await paged("userFillsByTime", w.id, start, now)).map(fillOut);
        const first = Math.min(...fills.map((f) => +f.time).filter(Number.isFinite), Number.isFinite(from) ? from : Infinity);
        const fundFrom = Number.isFinite(first) ? Math.max(start, first - HOUR) : start;
        const funding = fills.length || carried.length ? uniqueFunding(await paged("userFunding", w.id, fundFrom, now)) : [];
        const state = await info({ type: "clearinghouseState", user: w.id }).catch(() => null);
        const result = buildHyperliquid(fills, funding, { carried });
        const saved = await saveSynced({ user: user.id, accountId: w.linked as string, platform: HISTORY, label: `Hyperliquid · ${w.name}`, result, carried });
        added += saved.added; upgraded += saved.upgraded;
        if (saved.importId) imports.push(saved.importId);
        const positions = state ? positionsOf(state).slice(0, 30).map((p: any) => ({
          symbol: p.symbol, side: p.side, size: p.size, entry: p.entry, leverage: p.leverage, liqPrice: p.liqPrice, dist: p.distancePct,
        })) : w.positions;
        const value = Number(state?.marginSummary?.accountValue);
        current = current.map((x) => (x.id === w.id ? { ...x, last_synced_at: new Date(now).toISOString(), positions, balance: Number.isFinite(value) ? value : x.balance } : x));
        await patch("connections", `id=eq.${conn.id}`, { accounts: current, updated_at: new Date().toISOString() });
      }
      await patch("connections", `id=eq.${conn.id}`, { last_synced_at: new Date().toISOString(), status: "ok", last_error: null });
      return json({ ok: true, added, upgraded, imports, accounts: current });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    if (e instanceof Plain) return json({ error: e.message }, e.status);
    if ((e as { plain?: boolean }).plain) return json({ error: (e as Error).message }, (e as { status?: number }).status || 400);
    console.error("[hyperliquid]", action, (e as Error).message?.slice(0, 200));
    return json({ error: "Something went wrong talking to Hyperliquid. Try again." }, 500);
  }
});
