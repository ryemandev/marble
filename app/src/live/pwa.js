import { supabase } from "./supabase";

const KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim();
const UA = typeof navigator === "undefined" ? "" : navigator.userAgent;

// ---------- Where we are ----------
export const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const iphone = () => /iPhone|iPod/.test(UA);
const inApp = () => /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|BytedanceWebview|Twitter|Snapchat|LinkedInApp|GSA\//i.test(UA);
const phone = () => matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600;

export function installKind() {
  if (standalone() || inApp()) return null;
  if (iphone()) {
    if (/CriOS|EdgiOS/.test(UA)) return "ios-other";
    if (/FxiOS|OPiOS|DuckDuckGo/.test(UA)) return null;
    return +(UA.match(/Version\/(\d+)/)?.[1] || 0) >= 26 ? "safari26" : "safari";
  }
  return deferred ? "android" : null;
}

let deferred = null;
const watchers = new Set();
const tell = () => watchers.forEach((f) => f());
export const onInstallChange = (f) => { watchers.add(f); return () => watchers.delete(f); };
export async function installNow() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  tell();
  await e.prompt();
  return (await e.userChoice)?.outcome === "accepted";
}

const ASKED = "marble-install-asked";
export const installAsked = () => { try { return !!localStorage.getItem(ASKED); } catch { return true; } };
export const markInstallAsked = () => { try { localStorage.setItem(ASKED, new Date().toISOString()); } catch {} };
export const installPromptDue = () => phone() && !installAsked() && !!installKind();

export function startPwa() {
  if (typeof window === "undefined") return;
  stopAlertsBeforeSignOut();
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; tell(); });
  addEventListener("appinstalled", () => { deferred = null; markInstallAsked(); tell(); });
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD || !location.pathname.startsWith("/desk")) return;
  const go = () => navigator.serviceWorker.register("/sw.js", { scope: "/desk/", updateViaCache: "none" }).catch(() => {});
  if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.marble === "open" && /^#[\w-]+$/.test(e.data.hash || "")) location.hash = e.data.hash;
  });
  supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") pushGone(); });
}

// A slow network must never hold up leaving: past this, the sign-out goes ahead and pushGone finishes the job
const LEAVING_MS = 3000;
const briefly = (work) => Promise.race([work.catch(() => {}), new Promise((done) => setTimeout(done, LEAVING_MS))]);

// The server only lets a signed-in trader remove their device, so this runs ahead of the sign-out, whichever button
// asked for it. Every button goes through supabase.auth.signOut, so that's the one place to hook.
function stopAlertsBeforeSignOut() {
  const signOut = supabase.auth.signOut.bind(supabase.auth);
  supabase.auth.signOut = async (options) => {
    await briefly(pushOff());
    return signOut(options);
  };
}

// The browser's half, which needs no session, for a session that ended some other way. The page waits for this
// before it reloads, or the reload can cancel it.
export const pushGone = () => briefly(pushSubscription().then((s) => s?.unsubscribe()));

export function pushSupport() {
  if (!KEY) return "off";
  if (iphone() && !standalone()) return inApp() ? "unsupported" : "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return iphone() ? "old-ios" : "unsupported";
  return Notification.permission === "denied" ? "blocked" : "ready";
}

const bytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
const sameKey = (a) => { const b = bytes(KEY); return !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]); };
const registration = () => (navigator.serviceWorker?.getRegistration("/desk/") ?? Promise.resolve(null));

export async function pushSubscription() {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function device() {
  if (iphone()) return "iPhone";
  if (/Android/.test(UA)) return "Android";
  const browser = /Edg\//.test(UA) ? "Edge" : /Firefox\//.test(UA) ? "Firefox" : /Chrome\//.test(UA) ? "Chrome" : /Safari\//.test(UA) ? "Safari" : "Browser";
  const os = /Mac OS X/.test(UA) ? "Mac" : /Windows/.test(UA) ? "Windows" : /Linux/.test(UA) ? "Linux" : "computer";
  return `${browser} on ${os}`;
}

async function keep(sub) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc("push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_device: device() });
  if (error) throw error;
}

export async function pushOn() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked for Marble in this browser's settings." : "Alerts stay off: the browser wasn't given permission.");
  const reg = await registration();
  if (!reg) throw new Error("Alerts need Marble opened from trademarble.app/desk. Reload and try again.");
  if (!reg.active) await navigator.serviceWorker.ready; // installed moments ago, on this very visit
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey)) { await sub.unsubscribe(); sub = null; }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(KEY) });
  await keep(sub);
}

export async function pushOff() {
  const sub = await pushSubscription();
  if (!sub) return;
  await supabase.rpc("push_unsubscribe", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export async function pushSync() {
  if (pushSupport() !== "ready" || Notification.permission !== "granted") return;
  try {
    const sub = await pushSubscription();
    if (!sub) return;
    if (sameKey(sub.options?.applicationServerKey)) await keep(sub);
    else { await sub.unsubscribe(); await pushOn(); }
  } catch { }
}

export async function pushSettings(change = {}) {
  const { data, error } = await supabase.rpc("push_settings", {
    p_limits: change.limits ?? null, p_dms: change.dms ?? null, p_mentions: change.mentions ?? null,
  });
  if (error) throw error;
  return data;
}
