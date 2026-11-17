export const SITE = "https://trademarble.app";
export const FUNCTIONS = "https://your-project-ref.supabase.co/functions/v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function unsubscribeToken(userId, key) {
  if (!UUID.test(String(userId)) || !key) throw new Error("unsubscribeToken needs a user id and a key");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`marble:unsubscribe:v1:${String(userId).toLowerCase()}`));
  return b64url(sig).slice(0, 32);
}

export async function checkUnsubscribe(userId, token, key) {
  if (!UUID.test(String(userId || "")) || typeof token !== "string" || token.length !== 32 || !key) return false;
  const want = await unsubscribeToken(userId, key);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function unsubscribeLinks(userId, key) {
  const q = `u=${encodeURIComponent(String(userId).toLowerCase())}&t=${await unsubscribeToken(userId, key)}`;
  return { page: `${SITE}/unsubscribe?${q}`, oneClick: `${FUNCTIONS}/email-unsubscribe?${q}` };
}
