export const MAX_BODY = 16 * 1024;
export const MAX_REPORTS = 10;

const CONTROL = /[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;
const clip = (v, n) => (typeof v === "string" ? v.replace(CONTROL, "").trim().slice(0, n) : null) || null;
const int = (v) => (Number.isInteger(+v) && +v >= 0 && +v <= 1e7 && v !== "" && v != null ? +v : null);
const KEYWORDS = new Set(["inline", "eval", "self", "wasm-eval", "data", "blob", "trusted-types-policy", "trusted-types-sink", "about"]);

function originPath(v, n = 200) {
  if (typeof v !== "string" || !v) return null;
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return `${u.origin}${u.pathname}`.slice(0, n);
    return u.protocol;
  } catch {
    return null;
  }
}

function blocked(v) {
  if (typeof v !== "string" || !v) return null;
  const k = v.trim().toLowerCase();
  if (KEYWORDS.has(k)) return k;
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ws:" || u.protocol === "wss:") return u.origin.slice(0, 120);
    return u.protocol.slice(0, 40);
  } catch {
    return /^[a-z][a-z0-9+.-]{0,30}:?$/i.test(k) ? k.slice(0, 40) : null;
  }
}

const directive = (v) => {
  const d = typeof v === "string" ? v.trim().toLowerCase().split(/\s+/)[0] : "";
  return /^[a-z-]{1,40}$/.test(d) ? d : null;
};

const FAMILIES = [
  ["Edge", /\bEdg(?:e|A|iOS)?\/(\d+)/],
  ["Opera", /\bOPR\/(\d+)/],
  ["Firefox", /\b(?:Firefox|FxiOS)\/(\d+)/],
  ["Chrome", /\b(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /\bVersion\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//],
];
export function browserOf(ua) {
  const s = String(ua || "");
  if (!s) return null;
  for (const [name, re] of FAMILIES) { const m = re.exec(s); if (m) return `${name} ${m[1]}`; }
  return "Other";
}

function trim(r, ua, origins) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const pick = (...keys) => { for (const k of keys) if (r[k] != null && r[k] !== "") return r[k]; return null; };
  const page = originPath(pick("document-uri", "documentURL", "documentUri"));
  if (!page || !origins.some((o) => page.startsWith(`${o}/`))) return null;
  const disposition = String(pick("disposition") || "").toLowerCase();
  const status = int(pick("status-code", "statusCode"));
  return {
    document_uri: page,
    violated_directive: directive(pick("violated-directive", "violatedDirective")),
    effective_directive: directive(pick("effective-directive", "effectiveDirective")),
    blocked_uri: blocked(pick("blocked-uri", "blockedURL", "blockedUri")),
    source_file: originPath(pick("source-file", "sourceFile")),
    line_number: int(pick("line-number", "lineNumber")),
    column_number: int(pick("column-number", "columnNumber")),
    disposition: disposition === "enforce" || disposition === "report" ? disposition : null,
    status_code: status != null && status <= 999 ? status : null,
    sample: clip(pick("script-sample", "sample"), 80),
    browser: browserOf(ua),
  };
}

export function readReports(text, ua, origins) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  const list = Array.isArray(data)
    ? data.filter((x) => x && typeof x === "object" && x.type === "csp-violation").map((x) => [x.body, x.user_agent || ua])
    : data && typeof data === "object" && data["csp-report"] ? [[data["csp-report"], ua]] : [];
  const out = [];
  for (const [body, agent] of list.slice(0, MAX_REPORTS * 3)) {
    const row = trim(body, agent, origins);
    if (row) out.push(row);
    if (out.length >= MAX_REPORTS) break;
  }
  return out;
}

export async function handleCspReport(req, deps) {
  const origin = req.headers.get("Origin") || "";
  const headers = {
    Vary: "Origin",
    ...(deps.origins.includes(origin) ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
    } : {}),
  };
  const done = (status = 204) => new Response(null, { status, headers });
  if (req.method === "OPTIONS") return done(204);
  if (req.method !== "POST") return done(405);
  if (Number(req.headers.get("Content-Length") || 0) > MAX_BODY) return done(413);
  const text = await req.text();
  if (text.length > MAX_BODY) return done(413);
  if (!deps.secret) { deps.log?.("[csp-report] FORMS_HASH_SALT isn't set: reports aren't kept"); return done(503); }
  const reports = readReports(text, req.headers.get("User-Agent") || "", deps.origins);
  if (!reports.length) return done(204);
  try {
    const key = await deps.hmac(deps.secret, `csp:ip:${deps.clientIp(req)}`);
    await deps.save(key, reports);
  } catch (e) {
    deps.log?.(`[csp-report] not saved (${String(e?.status || e?.message || "error").slice(0, 40)})`);
  }
  return done(204);
}
