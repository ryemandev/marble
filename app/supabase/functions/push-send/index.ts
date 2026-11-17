import { sendPush } from "../_shared/webpush.js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: "POST", headers: db, body: JSON.stringify(args) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`${name} ${r.status}`); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const secret = req.headers.get("x-marble-cron") || "";
  let allowed = false;
  try { allowed = secret.length === 64 && (await rpc("push_cron_ok", { p_secret: secret })) === true; } catch { }
  if (!allowed) return json({ error: "Not allowed" }, 401);

  const due: { endpoint: string; p256dh: string; auth: string; payload: { tag?: string }; urgent: boolean }[] = (await rpc("push_batch")) || [];
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY"), privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) {
    console.log(`[push-send] VAPID keys aren't set: ${due.length} not sent`);
    return json({ ok: true, due: due.length, sent: 0 });
  }
  const keys = { publicKey, privateKey, subject: "mailto:support@example.com" };
  const gone: string[] = [];
  let sent = 0, failed = 0;
  for (let i = 0; i < due.length; i += 10) {
    await Promise.all(due.slice(i, i + 10).map(async (d) => {
      try {
        const ttl = d.payload.tag?.startsWith("limit") ? 3600 : 6 * 3600; // a limit alert is stale within the hour
        const status = await sendPush(d, d.payload, keys, { ttl, urgency: d.urgent ? "high" : "normal", topic: d.payload.tag });
        if (status === 404 || status === 410) gone.push(d.endpoint);
        else if (status >= 200 && status < 300) sent++;
        else { failed++; console.error("[push-send]", new URL(d.endpoint).host, status); }
      } catch (e) { failed++; console.error("[push-send]", (e as Error).message); }
    }));
  }
  if (gone.length) await rpc("push_gone", { p_endpoints: gone });
  return json({ ok: true, due: due.length, sent, gone: gone.length, failed });
});
