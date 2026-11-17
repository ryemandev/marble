import { SUPABASE_URL, json, rateOk, serve, signedIn } from "../_shared/server.ts";
import { AVATAR_MAX, avatarPath, sniffImage } from "../_shared/image-type.js";

const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function dropOld(userId: string, keep: string) {
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/avatars`, { method: "POST", headers: admin, body: JSON.stringify({ prefix: userId, limit: 100 }) });
    if (!r.ok) throw new Error(`list ${r.status}`);
    const old = ((await r.json()) as { id: string | null; name: string }[]).filter((it) => it.id != null).map((it) => `${userId}/${it.name}`)
      .filter((p) => p !== keep).sort().slice(0, -1); // avatar-<ms>: the newest sorts last
    if (!old.length) return;
    const d = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars`, { method: "DELETE", headers: admin, body: JSON.stringify({ prefixes: old }) });
    if (!d.ok) throw new Error(`delete ${d.status}`);
  } catch (e) { console.error("[avatar-upload] old pictures", (e as Error).message); }
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await signedIn(req);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (+(req.headers.get("content-length") || 0) > AVATAR_MAX) return json({ error: "Pictures can be up to 2 MB" }, 413);
  if (!(await rateOk(user.id, "avatar", 10, "1 hour"))) return json({ error: "That's a lot of new pictures. Try again in an hour." }, 429);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > AVATAR_MAX) return json({ error: "Pictures can be up to 2 MB" }, 413);
  const type = sniffImage(bytes);
  if (!type) return json({ error: "Pictures can be PNG, JPEG or WebP" }, 415);
  const path = avatarPath(user.id, type);
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": type, "x-upsert": "true", "Cache-Control": "3600" },
    body: bytes,
  });
  if (!r.ok) {
    console.error("[avatar-upload] storage", r.status);
    return json({ error: "Couldn't save the picture. Try again." }, 502);
  }
  await dropOld(user.id, path);
  return json({ url: `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}` });
});
