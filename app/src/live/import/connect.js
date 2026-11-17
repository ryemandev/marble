import { supabase } from "../supabase";
import { getState, loadState, toast } from "../../store";
import { accountIn, tradeIn } from "../sync";
import { CRYPTO_LIVE } from "../../crypto/worlds";
import { PLATFORM as TOPSTEP_SYNC } from "./topstepx";
import { PLATFORM as IBKR_SYNC } from "./ibkr";

const AUTO_EVERY_MS = 10 * 60e3;
const SEEN = (p) => `marble-sync-${p}`;

export const PLATFORMS = {
  topstepx: { fn: "topstepx", name: "Topstep", history: TOPSTEP_SYNC, world: "markets" },
  ibkr: { fn: "ibkr", name: "Interactive Brokers", history: IBKR_SYNC, world: "markets" },
  ...(CRYPTO_LIVE ? { hyperliquid: { fn: "hyperliquid", name: "Hyperliquid", history: "hyperliquid-sync", world: "crypto" } } : {}),
};

async function callFn(platform, action, body = {}) {
  const { data, error } = await supabase.functions.invoke(PLATFORMS[platform].fn, { body: { action, ...body } });
  if (error) {
    let msg = `Couldn't reach ${PLATFORMS[platform].name}. Try again.`;
    let code = null;
    const status = error.context?.status ?? null;
    try { const j = await error.context.json(); msg = j.error || msg; code = j.code || null; } catch { }
    throw Object.assign(new Error(msg), { code: code || (status === 429 ? "rate" : null), status });
  }
  return data;
}

export async function loadConnections() {
  const { data, error } = await supabase.from("connections").select("id, platform, username, accounts, settings, status, last_error, last_synced_at");
  if (error) throw error;
  const out = { topstepx: null, ibkr: null, hyperliquid: null };
  for (const c of data || []) out[c.platform] = c;
  loadState({ connections: out });
  return out;
}
const keep = (platform, patch) => {
  const all = getState().connections || {};
  if (all[platform]) loadState({ connections: { ...all, [platform]: { ...all[platform], ...patch } } });
};

export async function connect(platform, fields) {
  const out = await callFn(platform, "connect", fields);
  await loadConnections();
  return out.accounts;
}

export async function link(platform, links) {
  const out = await callFn(platform, "link", { links });
  const all = await loadConnections();
  // New Marble accounts made for platform accounts join the desk
  const known = new Set(getState().accounts.map((a) => a.id));
  const fresh = (out.accounts || []).map((a) => a.linked).filter((id) => id && !known.has(id));
  if (fresh.length) {
    const firm = { topstepx: "topstep", ibkr: "interactive-brokers" }[platform];
    if (firm) await supabase.from("accounts").update({ firm }).in("id", fresh).is("firm", null);
    const { data } = await supabase.from("accounts").select("*").in("id", fresh);
    loadState({ accounts: [...getState().accounts, ...(data || []).map(accountIn)] });
  }
  return all[platform];
}

export async function disconnect(platform) {
  await callFn(platform, "disconnect");
  loadState({ connections: { ...(getState().connections || {}), [platform]: null } });
}

async function arrived(importIds = []) {
  if (!importIds.length) return;
  const { data, error } = await supabase.from("trades").select("*").in("import_id", importIds);
  if (error) throw error;
  const fresh = (data || []).map(tradeIn);
  const ids = new Set(fresh.map((t) => t.id));
  loadState({ logged: [...fresh, ...getState().logged.filter((t) => !ids.has(t.id))].sort((x, y) => y.traded_at.localeCompare(x.traded_at)) });
}

async function syncOn(platform) {
  const out = await callFn(platform, "sync");
  await arrived(out.imports || []);
  if (out.accounts) keep(platform, { accounts: out.accounts });
  return { added: +out.added || 0, upgraded: +out.upgraded || 0 };
}

const running = {};
// Sync one platform. quiet: no toast unless trades arrived.
export function syncPlatform(platform, { quiet = false } = {}) {
  if (running[platform]) return running[platform];
  const name = PLATFORMS[platform].name;
  running[platform] = (async () => {
    try {
      const conn = getState().connections?.[platform] || (await loadConnections())[platform];
      if (!conn || !(conn.accounts || []).some((a) => a.linked)) return { added: 0 };
      const { added, upgraded } = await syncOn(platform);
      try { localStorage.setItem(SEEN(platform), String(Date.now())); } catch { }
      keep(platform, { last_synced_at: new Date().toISOString(), status: "ok", last_error: null });
      const matched = upgraded ? ` ${upgraded} you'd already logged now show${upgraded === 1 ? "s" : ""} ${name}'s own numbers.` : "";
      if (added) toast(`${name}: ${added} new trade${added === 1 ? "" : "s"}. They're waiting in Needs review.${matched}`);
      else if (upgraded) toast(`${name}:${matched}`);
      else if (!quiet) toast(`${name} is up to date`);
      return { added, upgraded };
    } catch (e) {
      if (e.code !== "rate") keep(platform, { status: "error", last_error: e.message });
      if (!quiet) toast(e.message, e.code ? { warn: true } : undefined);
      return { added: 0, error: e.message };
    } finally {
      running[platform] = null;
    }
  })();
  return running[platform];
}

export async function autoSync() {
  try {
    const all = await loadConnections();
    for (const platform of Object.keys(PLATFORMS)) {
      const conn = all[platform];
      if (!conn || !(conn.accounts || []).some((a) => a.linked)) continue;
      let seen = 0;
      try { seen = +localStorage.getItem(SEEN(platform)) || 0; } catch { }
      const last = Math.max(seen, Date.parse(conn.last_synced_at || "") || 0);
      if (Date.now() - last >= AUTO_EVERY_MS) await syncPlatform(platform, { quiet: true });
    }
  } catch (e) {
    console.warn("Sync skipped:", e?.message || e);
  }
}
