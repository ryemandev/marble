export const PROTECTED_EXACT = [
  // the owner (replace with your own handle; keep this list identical in 20261029180200_handle_lookalikes.sql)
  "jules",
  // Marble and its staff
  "marble", "trademarble", "marblehq", "oracle", "support", "admin", "administrator", "help", "helpdesk", "team", "official",
  "staff", "mod", "mods", "moderator", "moderators", "billing", "security", "payments", "legal", "press", "partners",
  "careers", "desk", "app", "api", "www", "info", "contact", "hello", "founder", "founders", "owner", "system", "root",
  "null", "undefined",
];
export const PROTECTED_CONTAINS = ["marble", "marbel", "official", "admin", "support", "moderat", "staff", "oracle"];
export const ROLE_HEADS = ["mod", "mods", "help", "team", "staff", "jules"];
export const ROLE_TAILS = ["team", "desk", "crew", "squad", "staff", "hq", "official", "support", "help", "admin", "mod"];
export const OWNER_PREFIX = "jul";

const FROM = "01i!|34@5$789";
const TO = "olllleaasstbg";
const tr = (s, from, to) => [...s].map((c) => { const i = from.indexOf(c); return i < 0 ? c : to[i]; }).join("");

export function foldHandle(h, digits = true) {
  let s = String(h ?? "").toLowerCase();
  s = digits ? tr(s, FROM, TO) : tr(s, "i", "l");
  s = s.replace(/[^a-z]/g, "");
  s = s.replace(/rn/g, "m").replace(/vv/g, "w");
  return s.replace(/(.)\1+/g, "$1");
}

const EXACT = new Set(PROTECTED_EXACT.map((w) => foldHandle(w)));
const CONTAINS = PROTECTED_CONTAINS.map((w) => foldHandle(w));
const ROLE = new RegExp(`^(the)?(${ROLE_HEADS.map((w) => foldHandle(w)).join("|")})(${ROLE_TAILS.map((w) => foldHandle(w)).join("|")})?$`);
const PREFIX = foldHandle(OWNER_PREFIX);

export function handleReserved(h) {
  const forms = [foldHandle(h, true), foldHandle(h, false)];
  return forms.some((f) => EXACT.has(f) || CONTAINS.some((w) => f.includes(w)) || f.startsWith(PREFIX) || ROLE.test(f));
}
