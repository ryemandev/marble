import { supabase } from "./supabase";
import { crashAlerts } from "./crash-alerts";

const KEEP = 6;
const errors = [];
export const clean = (text) => String(text)
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
  .replace(/\b(eyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Za-z0-9_-]{32,})\b/g, "[token]")
  .slice(0, 300);
const remember = (kind, text) => {
  errors.push({ kind, text: clean(text), at: new Date().toISOString() });
  if (errors.length > KEEP) errors.shift();
};

let installed = false;
export function captureErrors() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  addEventListener("error", (e) => remember("error", e.message || e.error?.message || "Script error"));
  addEventListener("unhandledrejection", (e) => remember("promise", e.reason?.message || e.reason || "Unhandled rejection"));
  const original = console.error;
  console.error = (...args) => {
    try { remember("console", args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ")); } catch {}
    original.apply(console, args);
  };
  crashAlerts({ clean, token: async () => (await supabase.auth.getSession()).data.session?.access_token });
}

export function bugContext(view) {
  return {
    screen: view || null,
    path: location.pathname,
    build: typeof __MARBLE_BUILD__ === "undefined" ? "dev" : __MARBLE_BUILD__,
    browser: navigator.userAgent.slice(0, 300),
    viewport: `${innerWidth}x${innerHeight}`,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    pixelRatio: window.devicePixelRatio || 1,
    theme: document.documentElement.dataset.theme || null,
    online: navigator.onLine,
    at: new Date().toISOString(),
    errors: errors.slice(),
  };
}

export const SHOT_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const SHOT_MAX = 5 * 1024 * 1024;

export async function sendBugReport({ message, steps, context, screenshot }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to send a report");
  let path = null;
  if (screenshot) {
    if (!SHOT_TYPES.includes(screenshot.type)) throw new Error("Screenshots can be PNG, JPEG or WebP");
    if (screenshot.size > SHOT_MAX) throw new Error("Screenshots can be up to 5 MB");
    path = `${user.id}/${crypto.randomUUID()}.${screenshot.type.split("/")[1].replace("jpeg", "jpg")}`;
    const up = await supabase.storage.from("bug-reports").upload(path, screenshot, { contentType: screenshot.type, upsert: false });
    if (up.error) throw up.error;
  }
  const { error } = await supabase.from("bug_reports").insert({ message: message.trim(), steps: (steps || "").trim(), context, screenshot_path: path });
  if (error) throw error;
}

/* ---------- Admins ---------- */

export async function listBugReports() {
  const { data, error } = await supabase.from("bug_reports").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  const ids = [...new Set(data.map((r) => r.user_id))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, handle").in("id", ids) : { data: [] };
  const handles = Object.fromEntries((people || []).map((p) => [p.id, p.handle]));
  return data.map((r) => ({ ...r, handle: handles[r.user_id] || null }));
}

export async function setBugStatus(id, status) {
  const { error } = await supabase.from("bug_reports").update({ status }).eq("id", id);
  if (error) throw error;
}

// A short-lived link to a report's screenshot
export async function screenshotUrl(path) {
  const { data, error } = await supabase.storage.from("bug-reports").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
