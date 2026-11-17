import { supabase } from "../supabase";
import { userId } from "../sync";
import { CRYPTO_LIVE, withoutCrypto } from "../../crypto/worlds";

const ok = (r) => { if (r.error) throw r.error; return r.data; };
const chunks = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function existingKeys(accountId, keys, source = "import") {
  const found = new Map();
  if (!accountId || !keys.length) return found;
  for (const part of chunks([...new Set(keys)], 150)) {
    const rows = ok(await supabase.from("trades").select("external_id, created_at").eq("account_id", accountId).eq("source", source).in("external_id", part));
    for (const r of rows) found.set(r.external_id, r.created_at);
  }
  return found;
}

export async function carriedFills(accountId, platform) {
  if (!accountId) return [];
  const rows = ok(await supabase.from("imports").select("open_fills").eq("account_id", accountId).eq("platform", platform).eq("status", "done").order("created_at", { ascending: false }).limit(1));
  return rows[0]?.open_fills || [];
}

export async function listImports() {
  return ok(await supabase.from("imports").select("id, account_id, platform, file_name, added, duplicates, open_positions, status, created_at, undone_at").order("created_at", { ascending: false }).limit(50));
}

export async function createAccount({ name, kind, firm = null, label = null, world = "markets" }) {
  const status = { Live: "live", Evaluation: "eval", Funded: "funded", Paper: "paper" }[kind] || "live";
  return ok(await supabase.from("accounts").insert({ name, kind, status, balance: 0, firm, label, ...(CRYPTO_LIVE ? { world } : {}) }).select("*").single());
}

export async function commitImport({ accountId, platform, fileName, rows, duplicates, open, openFills }) {
  const imp = ok(await supabase.from("imports").insert({
    account_id: accountId, platform, file_name: (fileName || "").slice(0, 200), added: rows.length, duplicates, open_positions: open, open_fills: openFills,
  }).select("*").single());
  const withImport = rows.map((r) => withoutCrypto({ ...r, import_id: imp.id, user_id: userId() }));
  const written = [];
  try {
    for (const part of chunks(withImport, 300)) {
      const res = await supabase.from("trades").insert(part).select("*");
      if (!res.error) { written.push(...res.data); continue; }
      if (res.error.code !== "23505") throw res.error;
      for (const one of part) {
        const r = await supabase.from("trades").insert(one).select("*");
        if (r.error && r.error.code !== "23505") throw r.error;
        if (!r.error) written.push(...r.data);
      }
    }
  } catch (e) {
    await supabase.from("trades").delete().eq("import_id", imp.id);
    await supabase.from("imports").delete().eq("id", imp.id);
    throw e;
  }
  if (written.length !== rows.length) await supabase.from("imports").update({ added: written.length, duplicates: duplicates + rows.length - written.length }).eq("id", imp.id);
  return { importRow: { ...imp, added: written.length }, trades: written };
}

// Work the trader has put into a trade is theirs, whatever happens to the import that brought it in
export const wasReviewed = ({ needsReview, setup, emotion, grade, note, followedPlan, kept, screenshots, mistakes }) =>
  !needsReview || !!(setup || emotion || grade || note || followedPlan != null || kept?.length || screenshots?.length || mistakes?.length);

async function tradesOfImport(id) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = ok(await supabase.from("trades").select("*").eq("import_id", id).order("id").range(from, from + 999));
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// Removes what the import added and keeps what's been reviewed. Kept trades hold on to their ids at the broker, so importing
// the same file again finds them already here.
export async function undoImport(id) {
  const rows = await tradesOfImport(id);
  const loose = rows.filter((r) => !wasReviewed({ ...r, needsReview: r.needs_review, followedPlan: r.followed_plan })).map((r) => r.id);
  const removed = [];
  // Still marked for review: a review saved since the check above keeps its trade
  for (const part of chunks(loose, 150)) removed.push(...ok(await supabase.from("trades").delete().in("id", part).eq("needs_review", true).select("id")).map((r) => r.id));
  ok(await supabase.from("imports").update({ status: "undone", undone_at: new Date().toISOString() }).eq("id", id));
  return { removed, kept: rows.length - removed.length };
}

export async function saveSettings({ mappings, risk }) {
  const patch = {};
  if (mappings) patch.import_mappings = mappings;
  if (risk !== undefined) patch.default_risk = risk > 0 ? risk : null;
  if (!Object.keys(patch).length) return;
  ok(await supabase.from("profile_private").update(patch).eq("id", userId()));
}
