// The admin area's account actions: suspend, unsuspend and delete another trader's account (owner, 7 Nov 2026: "i need
// to be able to delete accounts and all of that too from the admin"). Only an admin who passed two-step can call it,
// never on their own account or another admin's. Deleting needs the trader's handle typed back. Every action goes in
// the admin log before it runs.
import { DEFAULT_ORIGINS } from "../_shared/origins.js";
import { corsFor, corsHandler } from "../_shared/cors.js";
import { wipeAccount } from "../_shared/wipe-account.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FOREVER = "876000h"; // a hundred years: suspended until an admin lifts it

const ORIGINS = (Deno.env.get("MARBLE_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean).concat(DEFAULT_ORIGINS);
const cors = corsFor(DEFAULT_ORIGINS[0], ORIGINS);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function claims(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
  } catch { return {}; }
}

async function note(adminId: string, action: string, target: string, detail: Record<string, unknown>) {
  const r = await fetch(`${URL_}/rest/v1/admin_log`, { method: "POST", headers: { ...service, Prefer: "return=minimal" },
    body: JSON.stringify({ admin_id: adminId, action, target_type: "user", target_id: target, detail }) });
  if (!r.ok) throw new Error(`admin log ${r.status}`);
}

Deno.serve(corsHandler(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // Who's asking: a real session, an admin, with two-step
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);
  const me = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
  if (!me.ok) return json({ error: "Not signed in" }, 401);
  const user = await me.json();
  if (!user?.id) return json({ error: "Not signed in" }, 401);
  const isAdmin = await fetch(`${URL_}/rest/v1/admins?user_id=eq.${user.id}&select=user_id`, { headers: service });
  if (!isAdmin.ok || !((await isAdmin.json()) as unknown[]).length) return json({ error: "Admins only" }, 403);
  if (claims(token).aal !== "aal2") return json({ error: "The admin area needs two-step sign-in. Enter the code from your authenticator app first.", code: "aal2" }, 403);

  let body: { action?: string; user?: string; confirm?: string };
  try { body = await req.json(); } catch { return json({ error: "Send the action as JSON" }, 400); }
  const { action, user: target, confirm } = body || {};
  if (!["suspend", "unsuspend", "delete"].includes(action || "")) return json({ error: "Suspend, unsuspend or delete" }, 400);
  if (!target || !UUID.test(target)) return json({ error: "Which account?" }, 400);
  if (target === user.id) return json({ error: "You can't do that to your own account here. Use Profile at your desk." }, 400);

  const adm = await fetch(`${URL_}/rest/v1/admins?user_id=eq.${target}&select=user_id`, { headers: service });
  if (!adm.ok) return json({ error: "Couldn't check that account. Try again." }, 502);
  if (((await adm.json()) as unknown[]).length) return json({ error: "That's an admin account. Remove them as admin first." }, 400);
  const prof = await fetch(`${URL_}/rest/v1/profiles?id=eq.${target}&select=handle,created_at`, { headers: service });
  const found = prof.ok ? ((await prof.json()) as { handle: string; created_at: string }[])[0] : null;
  if (!found) return json({ error: "That account is already gone." }, 404);

  try {
    if (action === "delete") {
      if (String(confirm || "").trim().replace(/^@/, "").toLowerCase() !== String(found.handle).toLowerCase()) {
        return json({ error: `Type their handle, ${found.handle}, to delete the account.` }, 400);
      }
      await note(user.id, "user.delete", target, { handle: found.handle, joined: found.created_at });
      await wipeAccount(target);
      return json({ deleted: true });
    }
    await note(user.id, `user.${action}`, target, { handle: found.handle });
    const r = await fetch(`${URL_}/auth/v1/admin/users/${target}`, { method: "PUT", headers: service,
      body: JSON.stringify({ ban_duration: action === "suspend" ? FOREVER : "none" }) });
    if (!r.ok) throw new Error(`auth ${action} ${r.status}`);
    return json({ ok: true });
  } catch (e) {
    console.error("[admin-account]", action, (e as Error).message);
    return json({ error: action === "delete"
      ? "The account couldn't be fully deleted. Some of their files may already be gone. Try again."
      : "That didn't go through. Try again." }, 502);
  }
}, ORIGINS));
