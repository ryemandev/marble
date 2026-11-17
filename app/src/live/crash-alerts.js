import { TABS } from "../data";

export const KINDS = ["view", "app", "window", "promise"];
export const MAX_SENDS = 5;
export const MAX_FRAMES = 6;
export const VIEW_IDS = new Set([...TABS.map((t) => t.id), "profile", "money", "team"]);

const CONTROL = /[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

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
export const framesOf = (stack) => String(stack || "").slice(0, 8000).split("\n").map(frameOf).filter(Boolean).slice(0, MAX_FRAMES);

export function messageOf(e) {
  if (e == null) return "";
  if (typeof e !== "object") return String(e).replace(/^Uncaught\s+/, "");
  const name = typeof e.name === "string" && e.name !== "Error" ? e.name : "";
  const msg = typeof e.message === "string" ? e.message : "";
  return (name && msg ? `${name}: ${msg}` : msg || name || `Unhandled ${Array.isArray(e) ? "array" : "object"}`).replace(/^Uncaught\s+/, "");
}

const NOISE = [
  /^ResizeObserver loop/i,
  /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource|Network request failed|The network connection was lost|The Internet connection appears to be offline)\.?$/i,
  /Failed to send a request to the Edge Function/i,
  /^(AbortError\b|The operation was aborted|The user aborted a request|signal is aborted)/i,
];
export function isNoise({ message = "", stack = "", name = "", filename = "" }, origin) {
  const m = String(message).replace(/^Uncaught\s+/, "").trim();
  if (/^Script error\.?$/i.test(m) && !stack) return true;
  if (name === "AbortError" || NOISE.some((re) => re.test(m))) return true;
  const from = filename || /([a-z][\w+.-]*:\/\/[^\s()]+?):\d+:\d+\)?\s*$/im.exec(String(stack))?.[1];
  return !!from && !from.startsWith(`${origin}/`);
}

export const viewOf = (hash) => { const id = String(hash || "").replace(/^#/, ""); return VIEW_IDS.has(id) ? id : null; };
// The app's own breakpoints (styles.css): 640px and 1100px
export const deviceOf = (w) => (!Number.isFinite(w) || w <= 0 ? null : w <= 640 ? "phone" : w <= 1100 ? "tablet" : "desktop");

export function crashOf(kind, error, at, clean) {
  let stack = "";
  for (const f of framesOf(error?.stack).map((f) => clean(f))) if (stack.length + f.length + 1 <= 800) stack += `${stack ? "\n" : ""}${f}`;
  return {
    kind: KINDS.includes(kind) ? kind : "window",
    message: clean(messageOf(error).replace(CONTROL, " ").replace(/\s+/g, " ").trim()).slice(0, 300) || "(no message)",
    stack: stack || null,
    view: viewOf(at.hash),
    path: clean(String(at.path || "/").replace(/[?#].*$/, "")).slice(0, 120),
    build: String(at.build || "dev").slice(0, 24),
    device: deviceOf(at.width),
  };
}

export function createGate(max = MAX_SENDS) {
  const seen = new Set();
  return (key) => { if (seen.has(key) || seen.size >= max) return false; seen.add(key); return true; };
}
export const fingerprintOf = (c) => `${c.kind}|${c.message}|${(c.stack || "").split("\n")[0]}`;

/* ---------- The real app ---------- */

let live = null;

export function crashAlerts(deps) {
  if (live || typeof window === "undefined") return;
  live = { ...deps, gate: createGate(), dev: !!import.meta.env.DEV };
  addEventListener("error", (e) => { if (e.message || e.error) reportCrash("window", e.error || e.message, e.filename); });
  addEventListener("unhandledrejection", (e) => reportCrash("promise", e.reason));
  addEventListener("marble:crash", (e) => reportCrash("view", e.detail));
}

export function reportCrash(kind, error, filename = "") {
  try {
    if (!live) return;
    const stack = typeof error?.stack === "string" ? error.stack : "";
    if (isNoise({ message: messageOf(error), stack, name: error?.name, filename }, location.origin)) return;
    const build = typeof __MARBLE_BUILD__ === "undefined" ? "dev" : __MARBLE_BUILD__;
    const crash = crashOf(kind, error, { hash: location.hash, path: location.pathname, width: innerWidth, build }, live.clean);
    if (!live.gate(fingerprintOf(crash))) return;
    if (live.dev) { console.info("[crash] not sent from the dev server:", crash); return; }
    send(crash).catch(() => {});
  } catch {} // the reporter never adds a crash of its own
}

async function send(crash) {
  const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!base || !key) return;
  let bearer = key;
  try { bearer = (await live.token()) || key; } catch {}
  await fetch(`${base}/functions/v1/crash-report`, {
    method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(crash),
  });
}
