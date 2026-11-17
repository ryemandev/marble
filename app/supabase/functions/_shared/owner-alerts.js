// The owner's email for each new account (owner, 2 Nov 2026: "a notification to my email every time someone signed up").
// pg_cron calls the owner-alerts function every 2 minutes while anything waits in owner_alerts. Pure: the database and
// Resend come in as deps, so the tests run it with fakes.

export const ADMIN_LINK = "https://trademarble.app/admin#users/";
export const BATCH = 5;          // more waiting than this: one email listing them all

const HEARD = { x: "X/Twitter", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", reddit: "Reddit", discord: "Discord",
  google: "Google search", friend: "a friend", other: "somewhere else" };
const SIGNED_UP = { email: "an email link", google: "Google", discord: "Discord", apple: "Apple" };
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{2069}\u{feff}]/gu;  // control, zero-width and direction marks
const clean = (v, n = 60) => (typeof v === "string" ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, n) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE = /^[a-z0-9._]{2,24}$/;

const when = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
const handleOf = (a) => (typeof a.handle === "string" && HANDLE.test(a.handle) ? a.handle : "");
const numberOf = (a) => (Number.isInteger(a.no) && a.no > 0 ? `#${a.no}` : "");
const tag = (a) => [numberOf(a), handleOf(a) && `@${handleOf(a)}`].filter(Boolean).join(" ");

// Send it, or drop it because the account is gone or it isn't a sign-up
export const verdict = (a) => (a && handleOf(a) && a.kind === "signup" ? "send" : "drop");

// One block of the email: who, what happened, and the link to them in the admin area
export function block(a) {
  const name = clean(a.name);
  const head = [numberOf(a), name, handleOf(a) && `@${handleOf(a)}`].filter(Boolean).join(" · ");
  const joined = when(a.joined);
  const lines = [`New account${joined ? `, ${joined}` : ""}, signed up with ${SIGNED_UP[a.provider] || "an email link"}.`,
    HEARD[a.heard_from] ? `Found Marble through ${HEARD[a.heard_from]}.` : "Didn't say how they found Marble."];
  return [head, ...lines, UUID.test(a.user_id || "") ? `${ADMIN_LINK}${a.user_id}` : ""].filter(Boolean).join("\n");
}

export const subjectOf = (a) => `New account ${tag(a)}`;

const totalsLine = (t) => (t && Number.isFinite(t.accounts) ? `Marble now has ${t.accounts} ${t.accounts === 1 ? "account" : "accounts"}.` : "");

// One email each, or one for the lot when more than BATCH are waiting
export function mailsFor(alerts, totals) {
  const foot = totalsLine(totals);
  if (!alerts.length) return [];
  if (alerts.length <= BATCH) {
    return alerts.map((a) => ({ ids: [a.id], subject: subjectOf(a), text: [block(a), foot].filter(Boolean).join("\n\n"), key: `marble-owner-alert-${a.id}` }));
  }
  const ids = alerts.map((a) => a.id);
  return [{ ids, subject: `Marble: ${alerts.length} new accounts`, text: [...alerts.map((a) => block(a)), foot].filter(Boolean).join("\n\n"),
    key: `marble-owner-alerts-${ids[0]}-${ids[ids.length - 1]}-${ids.length}` }];
}

// Marble's email look: the logo, then each alert as a grey panel with the way into the admin area. Only a line that is
// exactly an admin link becomes a link, so a name that looks like an address stays plain text.
const SANS = "Geist,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isAdminLink = (l) => l.startsWith(ADMIN_LINK) && UUID.test(l.slice(ADMIN_LINK.length));
const panelLine = (l, i) => (isAdminLink(l)
  ? `<p style="margin:12px 0 0"><a href="${esc(l)}" style="font-weight:600;color:#000000">Open in admin</a></p>`
  : `<p style="margin:${i ? 4 : 0}px 0 0;${i ? "color:#5a5a58" : "font-weight:600;color:#000000"}">${esc(l)}</p>`);
const panel = (lines) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr><td bgcolor="#f3f3f2" style="padding:20px 24px;border-radius:24px;font:400 15px/1.5 ${SANS}">${lines.map(panelLine).join("")}</td></tr></table>`;
export const html = (text) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>Marble</title><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&amp;display=swap" rel="stylesheet"></head>
<body style="margin:0;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px"><tr><td style="padding:28px 24px 36px">
<img src="https://trademarble.app/email/logo.png" width="168" height="53" alt="Marble" style="display:block;border:0;margin:0 0 26px">
${text.split("\n\n").map((p) => { const lines = p.split("\n"); return lines.length > 1 ? panel(lines) : `<p style="margin:16px 0 0;font:400 14px/1.5 ${SANS};color:#6e6e6c">${esc(p)}</p>`; }).join("\n")}
</td></tr></table></td></tr></table></body></html>`;

export async function handleOwnerAlerts(req, deps) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const secret = req.headers.get("x-marble-cron") || "";
  let allowed = false;
  // The vault secret is 32 random bytes as hex; anything else is turned away before the database is asked
  try { allowed = /^[0-9a-f]{64}$/.test(secret) && (await deps.cronOk(secret)) === true; } catch {}
  if (!allowed) return json({ error: "Not allowed" }, 401);
  let dry = false;
  try { dry = JSON.parse(await req.text())?.dry === true; } catch {}

  let d;
  try { d = (await deps.due()) || {}; }
  catch (e) { deps.log?.(`[owner-alerts] couldn't read the queue (${String(e?.status || e?.message || "error").slice(0, 40)})`); return json({ error: "Couldn't read the queue" }, 500); }
  const alerts = Array.isArray(d.alerts) ? d.alerts.filter((a) => a && Number.isInteger(a.id)) : [];
  const done = [], failed = [], ready = [];
  for (const a of alerts) (verdict(a) === "send" ? ready : done).push(verdict(a) === "send" ? a : a.id);
  const mails = mailsFor(ready, d.totals);
  const to = (Array.isArray(d.owners) ? d.owners : []).filter((e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (dry) return json({ ok: true, dry: true, to: to.length, waiting: alerts.length, mails: mails.map((m) => ({ subject: m.subject, text: m.text })) });

  const dropped = done.length;
  const why = !deps.resendKey ? "RESEND_API_KEY isn't set" : !to.length ? "no owner address" : "";
  if (why) deps.log?.(`[owner-alerts] ${why}: nothing sent`);
  let sent = 0;
  for (const m of mails) {
    if (why) { failed.push(...m.ids); continue; }
    try {
      await deps.sendMail({ to, subject: m.subject, text: m.text, html: html(m.text), key: m.key });
      done.push(...m.ids);
      sent++;
    } catch (e) {
      failed.push(...m.ids);
      deps.log?.(`[owner-alerts] send failed (${String(e?.status || e?.message || "error").slice(0, 40)})`);
    }
  }
  if (done.length || failed.length) {
    try { await deps.mark(done, failed); }
    catch (e) { deps.log?.(`[owner-alerts] couldn't mark them (${String(e?.status || e?.message || "error").slice(0, 40)})`); }
  }
  return json({ ok: true, waiting: alerts.length, sent, dropped, failed: failed.length });
}
