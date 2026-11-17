export const MAX_BODY = 6144;
export const LIMITS = {
  ipPerHour: 3, ipPerDay: 6, emailPerDay: 3,
  form: { partner: { perHour: 10, perDay: 30 }, career: { perHour: 15, perDay: 50 } },
  // Sends that passed the bot check
  verified: { perHour: 60, perDay: 300 },
};
export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const OK = { ok: true };

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;
export const oneLine = (s) => String(s ?? "").replace(CONTROL, "").replace(/\s+/g, " ").trim();
const block = (s) => String(s ?? "").replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function cleanLink(raw) {
  const v = oneLine(raw);
  if (!v) return { ok: true, value: "" };
  if (/\s/.test(v)) return { ok: false, value: v };
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^[^:/]+:\d/.test(v) ? v : `https://${v}`);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return { ok: false, value: v };
    if (!/^([a-z0-9-]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(u.hostname)) return { ok: false, value: v };
    return { ok: true, value: u.href };
  } catch {
    return { ok: false, value: v };
  }
}

const nameOf = (b, errors) => {
  const name = oneLine(b.name);
  if (!name || name.length > 80) errors.push("name");
  return name;
};
const emailOf = (b, errors) => {
  const email = oneLine(b.email).toLowerCase();
  if (email.length < 6 || email.length > 254 || !EMAIL_RE.test(email)) errors.push("email");
  return email;
};

export const CAREER_AREAS = ["cofounder", "marketing", "content", "community", "support", "engineering", "design", "panel", "crew", "other"];
export const PARTNER_KINDS = ["creator", "firm", "platform"];

export const FORMS = {
  partner: {
    table: "partner_applications",
    honeypot: "website",
    validate(b) {
      const errors = [];
      const kind = PARTNER_KINDS.includes(b.kind) ? b.kind : (errors.push("kind"), "");
      const name = nameOf(b, errors);
      const email = emailOf(b, errors);
      const link = cleanLink(b.link);
      if (!link.ok || !link.value || link.value.length > 300) errors.push("link");
      const message = block(b.message);
      if (message.length > 1000) errors.push("message");
      return { errors, row: { kind, name, email, link: link.value, message: message || null } };
    },
  },
  career: {
    table: "career_interest",
    honeypot: "company",
    onConflict: "email,area",
    validate(b) {
      const errors = [];
      const name = nameOf(b, errors);
      const email = emailOf(b, errors);
      const area = CAREER_AREAS.includes(b.area) ? b.area : (errors.push("area"), "");
      const link = cleanLink(b.link);
      if (!link.ok || link.value.length > 300) errors.push("link");
      const message = block(b.message);
      if (message.length > 600) errors.push("message");
      return { errors, row: { name, email, area, link: link.value || null, message: message || null } };
    },
  },
};

export function clientIp(req) {
  const ip = (req.headers.get("cf-connecting-ip") || "").trim();
  return /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip.toLowerCase() : "unknown";
}

export async function checkTurnstile({ secret, token, ip, hostnames = [], fetch: get = fetch }) {
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") form.set("remoteip", ip);
  try {
    const r = await get(SITEVERIFY, { method: "POST", body: form });
    if (!r.ok) return false;
    const out = await r.json();
    return out?.success === true && (!hostnames.length || hostnames.includes(out.hostname));
  } catch {
    return false;
  }
}

export async function hmac(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handleForm(req, name, deps) {
  const form = FORMS[name];
  const origin = req.headers.get("Origin") || "";
  const allowed = deps.origins.includes(origin);
  const headers = {
    Vary: "Origin",
    ...(allowed ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
    } : {}),
  };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
  const log = (step, detail = "") => deps.log?.(`${name}: ${step}${detail ? ` (${detail})` : ""}`);

  if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers });
  if (req.method !== "POST") return reply({ error: "Use POST" }, 405);
  if (!allowed) return reply({ error: "This form only takes sends from trademarble.app" }, 403);
  if (!deps.secret) { log("not configured", "FORMS_HASH_SALT"); return reply({ error: "This form isn't available right now" }, 503); }

  if (Number(req.headers.get("Content-Length") || 0) > MAX_BODY) return reply({ error: "Too long" }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({ error: "Too long" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return reply({ error: "Send JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Send JSON" }, 400);

  if (oneLine(body[form.honeypot])) return reply(OK);

  const { errors, row } = form.validate(body);
  if (errors.length) return reply({ error: "Check the form", fields: errors }, 400);

  const busy = () => reply({ error: "Too many tries. Wait a little, then send again." }, 429);
  try {
    const ip = clientIp(req);
    const [ipKey, emailKey] = await Promise.all([
      hmac(deps.secret, `${name}:ip:${ip}`),
      hmac(deps.secret, `${name}:email:${row.email}`),
    ]);
    if (!(await deps.rateOk(`${name}:ip`, ipKey, LIMITS.ipPerHour, LIMITS.ipPerDay))) return busy();
    let verified = false;
    if (deps.captchaSecret) {
      const hostnames = deps.origins.map((o) => { try { return new URL(o).hostname; } catch { return ""; } }).filter(Boolean);
      verified = await checkTurnstile({ secret: deps.captchaSecret, token: body.captcha, ip, hostnames, fetch: deps.fetch });
      if (!verified) { log("bot check failed"); return reply({ error: "The check that you're a person didn't pass. Try again.", code: "captcha" }, 400); }
    }
    const ceiling = verified ? LIMITS.verified : LIMITS.form[name];
    const bucket = verified ? `${name}:verified` : `${name}:all`;
    if (!(await deps.rateOk(bucket, await hmac(deps.secret, bucket), ceiling.perHour, ceiling.perDay))) {
      log("busy", verified ? "verified" : "unverified");
      return busy();
    }
    if (!(await deps.rateOk(`${name}:email`, emailKey, LIMITS.emailPerDay, LIMITS.emailPerDay))) return reply(OK);
    await deps.save(form.table, row, form.onConflict);
  } catch (e) {
    log("not saved", String(e?.status || e?.message || "error").slice(0, 60));
    return reply({ error: "Not saved" }, 500);
  }
  try { await deps.purge?.(); } catch { log("purge failed"); }
  return reply(OK);
}
