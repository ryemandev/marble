import { rows, rpc } from "./server.ts";
import { linkProblem, planSync, twinWindow } from "./import/sync-plan.js";

export type Saved = { added: number; upgraded: number; duplicates: number; importId: string | null };

export async function carriedFor(user: string, accountId: string, platform: string): Promise<any[]> {
  const ctx = await rpc("sync_context", { p_user: user, p_account: accountId, p_platform: platform });
  if (!ctx?.owned) throw Object.assign(new Error("That Marble account isn't yours."), { plain: true, status: 403 });
  return Array.isArray(ctx.carried) ? ctx.carried : [];
}

export async function saveSynced(o: { user: string; accountId: string; platform: string; label: string; result: any; carried: any[] }): Promise<Saved> {
  const { user, accountId, platform, label, result, carried } = o;
  const keys = (result.trades || []).map((t: any) => String(t.key).slice(0, 200));
  const win = twinWindow(result.trades || []);
  const ctx = await rpc("sync_context", {
    p_user: user, p_account: accountId, p_platform: platform, p_keys: keys, p_from: win?.from ?? null, p_to: win?.to ?? null,
  });
  const plan = planSync({ result, accountId, existing: new Set(ctx?.existing || []), logged: ctx?.logged || [], risk: +ctx?.risk || null, carried });
  if (!plan.worthSaving) return { added: 0, upgraded: 0, duplicates: plan.duplicates, importId: null };
  const out = await rpc("sync_commit", {
    p_user: user, p_account: accountId, p_platform: platform, p_file_name: label.slice(0, 200),
    p_rows: plan.rows, p_upgrades: plan.upgrades, p_duplicates: plan.duplicates,
    p_open: (result.open || []).length, p_open_fills: plan.openFills,
  });
  return { added: +out?.added || 0, upgraded: +out?.upgraded || 0, duplicates: plan.duplicates, importId: out?.import_id ?? null };
}

export async function frozenEntries(user: string): Promise<any[]> {
  try {
    return await rows("competition_entries",
      `select=account_id,broker_platform,broker_account,competitions!inner(status)&user_id=eq.${user}&status=eq.entered&competitions.status=in.(open,live,review)`);
  } catch {
    return [];
  }
}

// The link change, or the reason it can't happen
export async function checkLinks(user: string, platform: string, next: any[]): Promise<string | null> {
  const frozen = await frozenEntries(user);
  return frozen.length ? linkProblem({ platform, next, frozen }) : null;
}
