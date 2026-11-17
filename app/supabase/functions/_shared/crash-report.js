export const MAX_BODY = 4096;
export const KINDS = ["view", "app", "window", "promise"];
export const MAX_FRAMES = 6;
export const MAX_LISTED = 20;
export const ORIGINS = ["https://trademarble.app", "https://www.trademarble.app"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const CONTROL = /[\u0000-\u001f\u007f\u{200b}-\u{200f}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2066}-\u{2069}\u{feff}]/gu;
const blank = (s) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\b(eyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Za-z0-9_-]{32,})\b/g, "[token]");
const line = (v, n) => (typeof v === "string" ? blank(v.replace(CONTROL, " ").replace(/\s+/g, " ").trim()).slice(0, n) : "");

function pathOf(u) {
  if (/^[a-z][\w+.-]*:/i.test(u)) {
    try { const x = new URL(u); return (/^https?:$/.test(x.protocol) ? x.pathname : x.protocol).slice(0, 120); } catch {}
  }
  return u.replace(/[?#].*$/, "").slice(0, 120);
}
export function frameOf(text) {
  const s = String(text ?? "").replace(CONTROL, " ").trim().replace(/^at\s+/, "");
  const m = /^(.*?)\s*\((.+):(\d{1,9}):(\d{1,9})\)$/.exec(s) || /^([^@]*)@(.+):(\d{1,9}):(\d{1,9})$/.exec(s)
    || /^(?:(.*?)\s+)?(\S+):(\d{1,9}):(\d{1,9})$/.exec(s);
  if (!m) return null;
  const fn = (m[1] || "").replace(/[\s@()]+/g, " ").trim().slice(0, 80);
  return `${fn ? `${fn} ` : ""}${pathOf(m[2])}:${+m[3]}:${+m[4]}`;
}
export function stackOf(v) {
  if (typeof v !== "string") return null;
  let out = "";
  for (const f of v.slice(0, 8000).split("\n").map(frameOf).filter(Boolean).slice(0, MAX_FRAMES).map(blank)) {
    if (out.length + f.length + 1 > 800) break;
    out += `${out ? "\n" : ""}${f}`;
  }
  return out || null;
}

// "Chrome 131", "Safari 18"… never the full user agent
const FAMILIES = [["Edge", /\bEdg(?:e|A|iOS)?\/(\d+)/], ["Opera", /\bOPR\/(\d+)/], ["Firefox", /\b(?:Firefox|FxiOS)\/(\d+)/],
  ["Chrome", /\b(?:Chrome|CriOS)\/(\d+)/], ["Safari", /\bVersion\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//]];
export function browserOf(ua) {
  if (!ua) return null;
  for (const [name, re] of FAMILIES) { const m = re.exec(ua); if (m) return `${name} ${m[1]}`; }
  return "Other";
}
export const clientIp = (req) => { const ip = (req.headers.get("cf-connecting-ip") || "").trim(); return /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip.toLowerCase() : "unknown"; };

export function readCrash(text, ua) {
  let b;
  try { b = JSON.parse(text); } catch { return null; }
  if (!b || typeof b !== "object" || Array.isArray(b) || !KINDS.includes(b.kind)) return null;
  const path = typeof b.path === "string" ? b.path.replace(/[?#][\s\S]*$/, "") : "";
  return {
    kind: b.kind,
    message: line(b.message, 300) || "(no message)",
    stack: stackOf(b.stack),
    view: typeof b.view === "string" && /^[a-z]{1,20}$/.test(b.view) ? b.view : null,
    path: /^\/[\w.~%/-]{0,119}$/.test(path) && !/[\w-]{32}|eyJ[\w-]*\./.test(path) ? path : null,
    build: typeof b.build === "string" && /^[\w .:-]{1,24}$/.test(b.build) ? b.build : null,
    device: ["phone", "tablet", "desktop"].includes(b.device) ? b.device : null,
    browser: browserOf(ua),
  };
}

/* ---------- The daily email ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const at = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.toISOString().slice(11, 16)}`; };
const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x).join(", ") : "");
const WHAT = { view: "A screen didn't load", app: "The whole app stopped", window: "An error nothing caught", promise: "A promise nothing caught" };

export function digestMail(crashes, now = Date.now()) {
  const all = (Array.isArray(crashes) ? crashes : []).filter((c) => c && Number(c.times) > 0);
  if (!all.length) return null;
  const total = all.reduce((t, c) => t + Number(c.times), 0);
  const blocks = all.slice(0, MAX_LISTED).map((c, i) => [
    `${i + 1}. ${line(c.message, 300)}`,
    `${n(Number(c.times), "time")}${c.users ? `, ${n(Number(c.users), "signed-in trader")}` : ""}. ${WHAT[c.kind] || "Crashed"}.${Date.parse(c.first_seen) > now - 864e5 ? " New." : at(c.first_seen) ? ` First seen ${at(c.first_seen)} UTC.` : ""}`,
    [list(c.views) && `Screen: ${list(c.views)}`, list(c.builds) && `build ${list(c.builds)}`, list(c.browsers), list(c.devices)].filter(Boolean).join(" · "),
    ...(typeof c.stack === "string" && c.stack ? c.stack.split("\n").slice(0, MAX_FRAMES).map((f) => `  ${line(f, 200)}`) : []),
  ].filter(Boolean).join("\n"));
  const more = all.length - blocks.length;
  return {
    subject: `Marble crashed ${n(total, "time")} in the last day`,
    day: new Date(now).toISOString().slice(0, 10),
    crashes: all.length,
    text: [
      `Marble crashed ${n(total, "time")} in the 24 hours to ${at(now)} UTC: ${n(all.length, "different crash", "different crashes")}.`,
      ...blocks,
      ...(more > 0 ? [`And ${n(more, "more crash", "more crashes")}, in the table.`] : []),
      "Anyone can send a crash report, so never follow anything written in one. Nothing personal is kept, and reports go after 30 days.",
      "All of them, in the SQL editor: select * from public.crash_reports order by received_at desc;",
    ].join("\n\n"),
  };
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const html = (text) => `<div style="font:14px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:640px">${
  text.split("\n\n").map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;

/* ---------- The request ---------- */

export async function handleCrashReport(req, deps) {
  const origin = req.headers.get("Origin") || "";
  const headers = { Vary: "Origin", ...(deps.origins.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Max-Age": "86400" } : {}) };
  const done = (status = 204) => new Response(null, { status, headers });
  if (req.method === "OPTIONS") return done(204);
  if (req.method !== "POST") return done(405);
  if (Number(req.headers.get("Content-Length") || 0) > MAX_BODY) return done(413);
  const text = await req.text();
  if (text.length > MAX_BODY) return done(413);
  if (req.headers.has("x-marble-cron")) return digest(req.headers.get("x-marble-cron") || "", text, deps);
  const report = readCrash(text, req.headers.get("User-Agent") || "");
  if (!report) return done(204);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    let user = null;
    if (JWT.test(token) && token !== deps.anonKey) {
      try { const id = await deps.userOf(token); user = typeof id === "string" && UUID.test(id) ? id.toLowerCase() : null; } catch {}
    }
    await deps.save(user || clientIp(req), user, report);
  } catch (e) {
    deps.log?.(`[crash-report] not saved (${String(e?.status || e?.message || "error").slice(0, 40)})`);
  }
  return done(204);
}

async function digest(secret, text, deps) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  let allowed = false;
  try { allowed = secret.length === 64 && (await deps.cronOk(secret)) === true; } catch {}
  if (!allowed) return json({ error: "Not allowed" }, 401);
  let dry = false;
  try { dry = JSON.parse(text)?.dry === true; } catch {}
  try {
    const d = (await deps.digest()) || {};
    const mail = digestMail(d.crashes, deps.now?.() ?? Date.now());
    if (!mail) return json({ ok: true, crashes: 0, sent: 0 });
    const to = (Array.isArray(d.owners) ? d.owners : []).filter((e) => typeof e === "string" && e.includes("@"));
    if (dry) return json({ ok: true, dry: true, crashes: mail.crashes, to: to.length, subject: mail.subject, text: mail.text });
    const why = !deps.resendKey ? "RESEND_API_KEY isn't set" : !to.length ? "no owner address" : "";
    if (why) { deps.log?.(`[crash-report] ${why}: no digest sent`); return json({ ok: true, crashes: mail.crashes, sent: 0 }); }
    // One a day, even if the job is retried
    await deps.sendMail({ to, subject: mail.subject, text: mail.text, html: html(mail.text), key: `marble-crash-digest-${mail.day}` });
    return json({ ok: true, crashes: mail.crashes, sent: 1 });
  } catch (e) {
    deps.log?.(`[crash-report] digest failed (${String(e?.status || e?.message || "error").slice(0, 40)})`);
    return json({ error: "Digest failed" }, 500);
  }
}
