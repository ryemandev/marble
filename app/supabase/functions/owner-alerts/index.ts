import { handleOwnerAlerts } from "../_shared/owner-alerts.js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const db = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: "POST", headers: db, body: JSON.stringify(args) });
  if (!r.ok) { await r.body?.cancel(); throw Object.assign(new Error(name), { status: r.status }); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Only pg_cron calls this (with the vault secret), so no CORS
Deno.serve((req) => handleOwnerAlerts(req, {
  cronOk: async (secret: string) => (await rpc("owner_alerts_cron_ok", { p_secret: secret })) === true,
  due: () => rpc("owner_alerts_due"),
  mark: (done: number[], failed: number[]) => rpc("owner_alerts_done", { p_done: done, p_failed: failed }),
  resendKey: RESEND,
  sendMail: async (m: { to: string[]; subject: string; text: string; html: string; key: string }) => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json", "Idempotency-Key": m.key },
      body: JSON.stringify({ from: "Marble <support@example.com>", to: m.to, subject: m.subject, text: m.text, html: m.html, tags: [{ name: "kind", value: "owner_alert" }] }),
    });
    await r.body?.cancel();
    if (!r.ok) throw Object.assign(new Error("resend"), { status: r.status });
  },
  log: (line: string) => console.error(line),
}));
