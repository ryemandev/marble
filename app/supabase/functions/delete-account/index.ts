import { DEFAULT_ORIGINS } from "../_shared/origins.js";
import { corsFor, corsHandler } from "../_shared/cors.js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const RECENT_MS = 10 * 60e3; // a sign-in within the last ten minutes
const BUCKETS = ["avatars", "screenshots", "community", "bug-reports", "study", "backdrops"];

const ORIGINS = (Deno.env.get("MARBLE_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean).concat(DEFAULT_ORIGINS);
const cors = corsFor(DEFAULT_ORIGINS[0], ORIGINS);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// True at every step: the files go first, so by the time something fails some of them may already be gone
const FAILED = "Your account couldn't be deleted just now. Some of your files may already be gone. Try again, or email support@example.com.";

async function allFiles(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, { method: "POST", headers: admin, body: JSON.stringify({ prefix, limit: 1000, offset }) });
    if (r.status === 400 || r.status === 404) break;
    if (!r.ok) throw new Error(`storage list ${bucket} ${r.status}`);
    const items = await r.json();
    if (!Array.isArray(items) || !items.length) break;
    for (const it of items) {
      const path = `${prefix}/${it.name}`;
      if (it.id == null) out.push(...(await allFiles(bucket, path))); // a folder
      else out.push(path);
    }
    if (items.length < 1000) break;
  }
  return out;
}

function sessionSignIn(token: string): number | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const amr = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))).amr;
    const ts = Array.isArray(amr) ? amr.map((a) => Number(a?.timestamp)).filter(Number.isFinite) : [];
    return ts.length ? Math.max(...ts) * 1000 : null;
  } catch { return null; }
}

Deno.serve(corsHandler(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);
  const me = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
  if (!me.ok) return json({ error: "Not signed in" }, 401);
  const user = await me.json();
  if (!user?.id) return json({ error: "Not signed in" }, 401);

  const signedInAt = sessionSignIn(token) ?? Date.parse(user.last_sign_in_at || "");
  if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > RECENT_MS) {
    return json({ error: "For your safety, sign in again, then delete your account within ten minutes.", code: "reauth" }, 403);
  }

  try {
    // Every file they stored, in every folder
    for (const bucket of BUCKETS) {
      const files = await allFiles(bucket, user.id);
      for (let i = 0; i < files.length; i += 500) {
        const gone = await fetch(`${URL_}/storage/v1/object/${bucket}`, { method: "DELETE", headers: admin, body: JSON.stringify({ prefixes: files.slice(i, i + 500) }) });
        if (!gone.ok) throw new Error(`storage delete ${bucket} ${gone.status}`);
      }
    }

    // Card pictures sit outside the trader's folder so their addresses don't carry a trader's id
    const cards = await fetch(`${URL_}/rest/v1/card_links?user_id=eq.${user.id}&select=id`, { headers: admin });
    if (!cards.ok) throw new Error(`card links ${cards.status}`);
    const pictures = ((await cards.json()) as { id: string }[]).map((c) => `${c.id}.jpg`);
    for (let i = 0; i < pictures.length; i += 500) {
      const gone = await fetch(`${URL_}/storage/v1/object/cards`, { method: "DELETE", headers: admin, body: JSON.stringify({ prefixes: pictures.slice(i, i + 500) }) });
      if (!gone.ok) throw new Error(`storage delete cards ${gone.status}`);
    }

    const links = await fetch(`${URL_}/rest/v1/connections?user_id=eq.${user.id}`, { method: "DELETE", headers: admin });
    if (!links.ok) throw new Error(`connections delete ${links.status}`);

    const del = await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: admin });
    if (!del.ok) throw new Error(`auth delete ${del.status}`);
    return json({ deleted: true });
  } catch (e) {
    console.error("[delete-account]", (e as Error).message);
    return json({ error: FAILED }, 502);
  }
}, ORIGINS));
