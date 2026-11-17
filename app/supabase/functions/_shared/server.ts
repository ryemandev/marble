import { DEFAULT_ORIGINS } from "./origins.js";
import { corsFor, corsHandler, withCors } from "./cors.js";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

export const ORIGINS = (Deno.env.get("MARBLE_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean).concat(DEFAULT_ORIGINS);

export const cors = { ...corsFor(DEFAULT_ORIGINS[0], ORIGINS) };
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
export const serve = (handler: (req: Request, info?: any) => Response | Promise<Response>) => Deno.serve(corsHandler(handler, ORIGINS));
export { corsFor, withCors };

export async function signedIn(req: Request): Promise<{ id: string; email: string } | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: u.email } : null;
}

export async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: admin, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name}: ${text}`);
  return text ? JSON.parse(text) : null;
}
export async function rows(table: string, query: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: admin });
  if (!r.ok) throw new Error(`${table}: ${await r.text()}`);
  return r.json();
}
export async function upsert(table: string, row: Record<string, unknown>, onConflict: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST", headers: { ...admin, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`${table}: ${await r.text()}`);
}

export async function patch(table: string, query: string, values: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH", headers: { ...admin, Prefer: "return=representation" }, body: JSON.stringify(values),
  });
  if (!r.ok) throw new Error(`${table}: ${await r.text()}`);
  return r.json();
}
export async function insert(table: string, values: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...admin, Prefer: "return=representation" }, body: JSON.stringify(values),
  });
  if (!r.ok) throw new Error(`${table}: ${await r.text()}`);
  return (await r.json())[0];
}
export async function remove(table: string, query: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { method: "DELETE", headers: admin });
  if (!r.ok) throw new Error(`${table}: ${await r.text()}`);
}

export async function rateOk(userId: string, kind: string, max: number, window: string): Promise<boolean> {
  return (await rpc("rate_ok", { p_user: userId, p_kind: kind, p_max: max, p_window: window })) === true;
}

export async function isAdmin(userId: string) {
  return (await rows("admins", `select=user_id&user_id=eq.${userId}`)).length > 0;
}
