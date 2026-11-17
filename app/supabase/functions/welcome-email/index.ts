import { unsubscribeLinks } from "../_shared/email-link.js";
import { FROM, REPLY_TO, renderWelcome } from "./email.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const KIND = "welcome";
const MAX_PER_RUN = 150;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: db, body: JSON.stringify(args) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`${name} ${r.status}`); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// One row per trader and kind: whoever claims it sends it, so a retry or an overlapping run can't send it twice
async function claim(userId: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/email_events?on_conflict=user_id,kind`, {
    method: "POST", headers: { ...db, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ user_id: userId, kind: KIND }),
  });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`claim ${r.status}`); }
  return (await r.json()).length === 1;
}
async function settle(userId: string, providerId: string | null) {
  const q = `email_events?user_id=eq.${userId}&kind=eq.${KIND}`;
  const r = providerId
    ? await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { method: "PATCH", headers: { ...db, Prefer: "return=minimal" }, body: JSON.stringify({ provider_id: providerId.slice(0, 100) }) })
    : await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { method: "DELETE", headers: db }); // the send failed: free it for the next run
  await r.body?.cancel();
}

type Candidate = { user_id: string; email: string; name: string };

async function send(key: string, c: Candidate, mail: { subject: string; html: string; text: string }, oneClick: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `marble-${KIND}-${c.user_id}` },
    body: JSON.stringify({
      from: FROM, to: [c.email], reply_to: REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text,
      tags: [{ name: "kind", value: KIND }],
      headers: { "List-Unsubscribe": `<${oneClick}>, <mailto:${REPLY_TO}?subject=Unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`resend ${r.status} ${body?.name || ""}`.trim());
  return (body?.id as string) || null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const secret = req.headers.get("x-marble-cron") || "";
  let allowed = false;
  // The vault secret is 32 random bytes as hex; anything else is turned away before the database is asked
  try { allowed = /^[0-9a-f]{64}$/.test(secret) && (await rpc("welcome_email_cron_ok", { p_secret: secret })) === true; } catch {}
  if (!allowed) return json({ error: "Not allowed" }, 401);

  let dry = false;
  try { dry = (await req.json())?.dry === true; } catch {}
  const resend = Deno.env.get("RESEND_API_KEY");
  if (!resend && !dry) { console.log("[welcome-email] RESEND_API_KEY isn't set: nothing sent"); return json({ ok: true, sent: 0 }); }
  const linkKey = Deno.env.get("EMAIL_LINK_SECRET") || "";
  if (!linkKey) { console.error("[welcome-email] EMAIL_LINK_SECRET isn't set: nothing sent"); return json({ error: "Not configured" }, 503); }

  const candidates: Candidate[] = (await rpc("welcome_email_candidates")) || [];
  const report = { ok: true, dry, due: candidates.length, sent: 0, failed: 0, later: 0 };
  if (dry) return json({ ...report, resend: !!resend });

  for (const [i, c] of candidates.entries()) {
    if (i >= MAX_PER_RUN) { report.later = candidates.length - i; break; }
    try {
      if (!(await claim(c.user_id))) continue;
    } catch (e) { report.failed++; console.error("[welcome-email] claim", (e as Error).message); continue; }
    try {
      const links = await unsubscribeLinks(c.user_id, linkKey);
      const mail = renderWelcome({ name: c.name, email: c.email, unsubscribe: links.page });
      const id = await send(resend!, c, mail, links.oneClick);
      await settle(c.user_id, id || "sent");
      report.sent++;
    } catch (e) {
      report.failed++;
      console.error("[welcome-email] send", (e as Error).message);
      await settle(c.user_id, null).catch(() => {});
    }
    await sleep(550); // Resend allows 2 requests a second
  }
  console.log("[welcome-email]", JSON.stringify(report));
  return json(report);
});
