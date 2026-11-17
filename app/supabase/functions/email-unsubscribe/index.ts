import { SITE, checkUnsubscribe } from "../_shared/email-link.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET") {
    const u = url.searchParams.get("u") || "", t = url.searchParams.get("t") || "";
    return new Response(null, { status: 303, headers: { Location: `${SITE}/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}` } });
  }
  if (req.method !== "POST") return json({ ok: false }, 405);

  let u = url.searchParams.get("u") || "", t = url.searchParams.get("t") || "";
  if (!u || !t) {
    try { const b = await req.json(); u = String(b?.u || ""); t = String(b?.t || ""); } catch {}
  }
  const key = Deno.env.get("EMAIL_LINK_SECRET") || "";
  if (!key) { console.error("[email-unsubscribe] EMAIL_LINK_SECRET isn't set: nothing checked"); return json({ ok: false, error: "Unsubscribing isn't available right now. Reply to the email instead." }, 503); }
  if (!(await checkUnsubscribe(u, t, key))) return json({ ok: false, error: "That link isn't valid any more." }, 400);

  // Once is enough: a second click is just as fine
  const r = await fetch(`${SUPABASE_URL}/rest/v1/email_events?on_conflict=user_id,kind`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: u.toLowerCase(), kind: "unsubscribed" }),
  });
  await r.body?.cancel();
  if (!r.ok && r.status !== 409) { console.error("[email-unsubscribe] save", r.status); return json({ ok: false, error: "Couldn't save that. Please try again." }, 500); }
  return json({ ok: true });
});
