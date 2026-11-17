import { ORIGINS, handleCrashReport } from "../_shared/crash-report.js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const db = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: "POST", headers: db, body: JSON.stringify(args) });
  if (!r.ok) { await r.body?.cancel(); throw Object.assign(new Error(name), { status: r.status }); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

Deno.serve((req) => handleCrashReport(req, {
  origins: (Deno.env.get("MARBLE_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean).concat(ORIGINS),
  anonKey: ANON,
  userOf: async (token: string) => {
    const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
    if (r.status !== 200) { await r.body?.cancel(); return null; }
    return (await r.json())?.id ?? null;
  },
  save: (sender: string, user: string | null, report: unknown) => rpc("crash_report_save", { p_sender: sender, p_user: user, p_report: report }),
  cronOk: async (secret: string) => (await rpc("crash_cron_ok", { p_secret: secret })) === true,
  digest: () => rpc("crash_digest"),
  resendKey: RESEND,
  sendMail: async (m: { to: string[]; subject: string; text: string; html: string; key: string }) => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json", "Idempotency-Key": m.key },
      body: JSON.stringify({ from: "Marble <support@example.com>", to: m.to, subject: m.subject, text: m.text, html: m.html, tags: [{ name: "kind", value: "crash_digest" }] }),
    });
    await r.body?.cancel();
    if (!r.ok) throw Object.assign(new Error("resend"), { status: r.status });
  },
  log: (line: string) => console.error(line),
}));
