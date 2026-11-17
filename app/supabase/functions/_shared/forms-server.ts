import { DEFAULT_ORIGINS } from "./origins.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

class DbError extends Error { constructor(public step: string, public status: number) { super(`${step} ${status}`); } }

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: admin, body: JSON.stringify(args) });
  if (!r.ok) { await r.body?.cancel(); throw new DbError(name, r.status); }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

export function formDeps() {
  return {
    origins: (Deno.env.get("MARBLE_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean).concat(DEFAULT_ORIGINS),
    secret: Deno.env.get("FORMS_HASH_SALT") || "",
    captchaSecret: Deno.env.get("TURNSTILE_SECRET_KEY") || "",
    rateOk: async (kind: string, key: string, perHour: number, perDay: number) =>
      (await rpc("form_rate_ok", { p_kind: kind, p_key: key, p_per_hour: perHour, p_per_day: perDay })) === true,
    save: async (table: string, row: Record<string, unknown>, onConflict?: string) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, {
        method: "POST",
        headers: { ...admin, Prefer: onConflict ? "resolution=ignore-duplicates,return=minimal" : "return=minimal" },
        body: JSON.stringify(row),
      });
      if (!r.ok) { await r.body?.cancel(); throw new DbError(table, r.status); }
      await r.body?.cancel();
    },
    purge: () => rpc("forms_purge"),
    log: (line: string) => console.error(line),
  };
}
