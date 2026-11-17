const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const APP = "https://trademarble.app/desk/#community";
const FROM = "Marble <support@example.com>";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: "POST", headers: db, body: JSON.stringify(args) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`${name} ${r.status}`); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

type Due = { email: string; kind: "message" | "report"; n: number };

function mail(d: Due) {
  if (d.kind === "report") {
    const what = d.n === 1 ? "A message was reported" : `${d.n} reported messages are waiting`;
    const url = "https://trademarble.app/admin#reports";
    const notes = ["This email never includes what was written."];
    return {
      subject: "A message was reported on Marble",
      text: `${what} on Marble. Open Admin to read the report: ${url}\n\n${notes[0]}`,
      head: `${what}.`, lead: "Open Admin to read the report.", button: "Open Admin", url, notes,
    };
  }
  const where = d.n > 1 ? `in ${d.n} conversations` : "";
  const notes = [
    "We never put what people write in an email. Marble will never ask for your card details or password.",
    "To stop these emails, open the Floor, then Chat, then Messages, and switch off email alerts in Message settings.",
  ];
  return {
    subject: "You have a new message on Marble",
    text: `You have a new message on Marble${where ? ` ${where}` : ""}. Open Marble to read it: ${APP}\n\n${notes.join("\n\n")}`,
    head: "You have a new message.", lead: where ? `It's waiting ${where}.` : "It's waiting for you on Marble.", button: "Open Marble", url: APP, notes,
  };
}

// Marble's email look, small enough to keep this function self-contained
const SANS = "Geist,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const html = (m: ReturnType<typeof mail>) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${m.subject}</title><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&amp;family=Unbounded:wght@800&amp;display=swap" rel="stylesheet"></head>
<body style="margin:0;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px"><tr><td style="padding:28px 24px 36px;font:400 16px/1.6 ${SANS};color:#5a5a58">
<img src="https://trademarble.app/email/logo.png" width="168" height="53" alt="Marble" style="display:block;border:0;margin:0 0 30px">
<h1 style="margin:0 0 14px;font:800 30px/1.14 Unbounded,'Arial Black',Arial,sans-serif;letter-spacing:-.03em;color:#000000">${m.head}</h1>
<p style="margin:0 0 26px">${m.lead}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#000000" style="border-radius:999px"><a href="${m.url}" style="display:inline-block;padding:16px 34px;font:600 16px/20px ${SANS};color:#ffffff;text-decoration:none">${m.button}</a></td></tr></table>
${m.notes.map((n, i) => `<p style="margin:${i ? 10 : 36}px 0 0;font-size:13px;color:#6e6e6c">${n}</p>`).join("")}
<p style="margin:10px 0 0;font-size:13px;color:#6e6e6c">Marble, Scotland</p>
</td></tr></table></td></tr></table></body></html>`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const secret = req.headers.get("x-marble-cron") || "";
  let allowed = false;
  try { allowed = secret.length === 64 && (await rpc("dm_alerts_cron_ok", { p_secret: secret })) === true; } catch { }
  if (!allowed) return json({ error: "Not allowed" }, 401);
  const resend = Deno.env.get("RESEND_API_KEY");
  if (!resend) { console.log("[dm-alerts] RESEND_API_KEY isn't set: nothing sent"); return json({ ok: true, sent: 0 }); }

  const due: Due[] = (await rpc("dm_alert_batch")) || [];
  let sent = 0, failed = 0;
  const hour = new Date().toISOString().slice(0, 13);
  for (const d of due) {
    const m = mail(d);
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        // One per address, kind and hour, even if a run is retried
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json", "Idempotency-Key": `marble-dm-${d.kind}-${hour}-${d.email}`.slice(0, 256) },
        body: JSON.stringify({ from: FROM, to: [d.email], subject: m.subject, text: m.text, html: html(m), tags: [{ name: "kind", value: `dm_${d.kind}` }] }),
      });
      await r.body?.cancel();
      if (r.ok) sent++; else { failed++; console.error("[dm-alerts] resend", r.status); }
    } catch (e) { failed++; console.error("[dm-alerts]", (e as Error).message); }
    await sleep(550); // Resend allows 2 requests a second
  }
  return json({ ok: true, due: due.length, sent, failed });
});
