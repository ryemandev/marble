import { sortPages } from "../study/model";
import { plain } from "../study/model";

// an unanswered or ignored request goes after this
export const MAX_BODY = 2000; // characters in one message
const NEW_ACCOUNT_DAYS = 14; // new accounts start slowly
const MAX_WAITING = 20; // requests waiting for an answer at once
export const MAX_MEMBERS = 20; // people a page can be sent to at a time
export const SAFETY = "Marble will never ask for your card details or password.";

export const WHY = {
  closed: "This trader isn't taking new messages.",
  email: "Confirm your email first.",
  today: "That's today's new conversations. Try again tomorrow.",
  waiting: "Wait for some of your requests to be answered first.",
  not_open: "This conversation isn't open to you.",
  undelivered: "This message couldn't be sent.",
  paused: "Messaging is paused on your account for now. Email support@example.com if you think that's wrong.",
  aal2: "Staff accounts send with two-step sign-in on. Verify your code in Admin first.",
  empty: "Write a message first.",
  long: "Messages can be up to 2,000 characters.",
  card_number: "For your safety, card numbers can't be sent in messages.",
  wait: "You can send more once they accept.",
  copies_off: "Saving copies is off for this page.",
  saved: "You already saved a copy of this page.",
  gone: "This page isn't shared any more.",
  members: "Choose who to send it to.",
  too_many: "Up to 20 people at a time.",
  in_feed: "This is already in the feed.",
};

/* ---------- Requests ---------- */

export const requestLimit = (accountDays) => (accountDays < NEW_ACCOUNT_DAYS ? 3 : 10);

export function canStart({ staff = false, emailConfirmed = true, blocked = false, theirSetting = "everyone", myCrew = null,
  theirCrew = null, accountDays = 365, startedToday = 0, waiting = 0 }) {
  if (blocked) return { ok: false, why: "closed" };
  if (!emailConfirmed) return { ok: false, why: "email" };
  if (!staff) {
    if (theirSetting === "nobody" || (theirSetting === "crew" && (!theirCrew || myCrew !== theirCrew))) return { ok: false, why: "closed" };
    if (startedToday >= requestLimit(accountDays)) return { ok: false, why: "today" };
    if (waiting >= MAX_WAITING) return { ok: false, why: "waiting" };
  }
  return { ok: true, request: !staff };
}

export function canSend({ state, status = "open", startedByMe = false, sentAlready = 0, blocked = false, banned = false, staff = false,
  aal2 = false, body = "", card = false }) {
  if (!state) return { ok: false, why: "not_open" };
  const accepts = status === "request" && !startedByMe;
  const now = accepts ? "open" : status;
  const text = String(body ?? "").trim();
  if (blocked) return { ok: false, why: "undelivered" };
  if (banned) return { ok: false, why: "paused" };
  if (staff && !aal2) return { ok: false, why: "aal2" };
  if (!text && !card) return { ok: false, why: "empty" };
  if (text.length > MAX_BODY) return { ok: false, why: "long" };
  if (hasCardNumber(text)) return { ok: false, why: "card_number" };
  if (now === "request" && startedByMe && sentAlready > 0) return { ok: false, why: "wait" };
  return { ok: true, accepts };
}

export function heldView(message, iAmAsked) {
  if (!iAmAsked || message.mine || !message.card) return { ...message, held: null };
  return { ...message, card: null, held: message.card.type || "page" };
}

/* ---------- Blocks ---------- */

export const blockedBetween = (blocks, a, b) => blocks.some((x) => (x.blocker === a && x.blocked === b) || (x.blocker === b && x.blocked === a));

export const hideBlocked = (items, blocked) => (blocked?.size ? items.filter((x) => x.anonymous || !x.author || !blocked.has(x.author.handle)) : items);

/* ---------- Sharing Study pages ---------- */

export function canViewShare(share, viewer, { blocked = false, member = false } = {}) {
  if (!share || share.revokedAt || !viewer) return false;
  if (share.owner === viewer) return true;
  if (blocked) return false;
  return share.audience === "community" || member;
}

export function snapshotOf(pages, notebookId, pageId = null) {
  const ordered = sortPages(pages.filter((p) => p.notebookId === notebookId && p.id));
  return ordered.map((p, i) => ({ pageId: p.id, n: i + 1 })).filter((x) => !pageId || x.pageId === pageId);
}
export function pagesNow(snapshot, pages) {
  const live = new Set(pages.map((p) => p.id));
  return snapshot.filter((x) => live.has(x.pageId)).sort((a, b) => a.n - b.n || String(a.pageId).localeCompare(String(b.pageId)))
    .map((x, k) => ({ ...x, i: k + 1 }));
}

export function shareLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter((l) => l && typeof l === "object" && !Array.isArray(l) && typeof l.text === "string" && plain(l.text).trim())
    .map((l) => ({
      t: typeof l.t === "number" && Number.isFinite(l.t) ? Math.round(Math.min(Math.max(l.t, 0), 86400)) : null,
      text: l.text.slice(0, 20000),
      key: l.key === true,
    }));
}

export function leafLines(lines, max = 3) {
  return shareLines(lines).map((l, i) => ({ ...l, i }))
    .sort((a, b) => Number(b.key) - Number(a.key) || a.i - b.i).slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map(({ t, text, key }) => [t, text.slice(0, 140), key]);
}

export const copyOf = (page) => ({
  title: String(page?.title || "").slice(0, 120), lines: shareLines(page?.lines), attachments: [], tradeId: null,
  videoId: page?.videoId || null, videoTitle: page?.videoTitle || null, videoChannel: page?.videoChannel || null, videoLen: page?.videoLen ?? null, videoAt: null,
});
export const copyNotebookTitle = (notebook, owner) => `${notebook || "Notebook"}, from ${owner || "a trader"}`.slice(0, 60);

export const FLAG_RULES = [
  ["card", String.raw`(card (details|number|no)|cvv|cvc|security code|expiry date|sort code|bank details|account number|iban)`],
  ["credentials", String.raw`(password|passcode|one.time code|verification code|login code|2fa|seed phrase|recovery phrase|private key)`],
  ["payment", String.raw`(gift ?cards?|crypto wallet|wallet address|send (me )?(usdt|btc|eth|crypto)|processing fee|release fee|unlock fee|pay (a|the) fee|paypal\.me|cash ?app)`],
  ["staff_claim", String.raw`(\mjules\M|marble (team|staff|support|admin)|from marble|on behalf of marble)`],
  ["link", String.raw`[a-z0-9-]+\.[a-z]{2,}(/|\M)`],
];
const RULES = FLAG_RULES.map(([k, re]) => [k, new RegExp(re.replace(/\\[mM]/g, "\\b"))]);

export function scamFlags(body, senderIsStaff = false) {
  const b = String(body ?? "").toLowerCase();
  if (!b) return [];
  return RULES.filter(([k, re]) => !(k === "staff_claim" && senderIsStaff) && re.test(b)).map(([k]) => k);
}

export const CARD_RUN = "(?:[0-9][ -]?){12,18}[0-9]";
export function hasCardNumber(body) {
  for (const m of String(body ?? "").matchAll(new RegExp(CARD_RUN, "g"))) {
    const d = m[0].replace(/[^0-9]/g, "");
    let s = 0;
    for (let i = 1; i <= d.length; i++) {
      let x = +d[d.length - i];
      if (i % 2 === 0) { x *= 2; if (x > 9) x -= 9; }
      s += x;
    }
    if (s % 10 === 0) return true;
  }
  return false;
}

// The calm warning a flagged request carries, or null
export function flagNote(flags = []) {
  const f = new Set(flags);
  const asks = f.has("card") ? "card details" : f.has("credentials") ? "a password or a code" : f.has("payment") ? "a payment" : null;
  if (asks && f.has("staff_claim")) return { lead: `This asks for ${asks} and says it's from Jules or Marble.`, rest: "It isn't: real staff carry the Marble staff seal, and Marble never asks for card details or passwords in a message." };
  if (asks) return { lead: `This asks for ${asks}.`, rest: "Nobody on Marble needs them, and Marble will never ask for your card details or password." };
  if (f.has("staff_claim")) return { lead: "This says it's from Jules or Marble.", rest: "It isn't: real staff carry the Marble staff seal." };
  return null;
}

export const ADDRESS = /\b(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s]*)?/gi;
export function addressParts(text = "") {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(ADDRESS)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ address: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/* ---------- Inbox ---------- */

export const unreadTotal = (threads = []) => threads.reduce((n, t) => n + (t.state === "request" ? 1 : t.muted ? 0 : t.unread || 0), 0);
export const requestsOf = (threads = []) => threads.filter((t) => t.state === "request");
export const conversationsOf = (threads = []) => threads.filter((t) => t.state !== "request");
// "fx.mentor.jay, juno and sol"
export function namesLine(names) {
  const n = names.filter(Boolean);
  if (n.length <= 1) return n[0] || "";
  if (n.length <= 3) return `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
  return `${n.slice(0, 2).join(", ")} and ${n.length - 2} more`;
}
export function evidenceOf(messages, id) {
  const at = messages.findIndex((m) => m.id === id);
  return at < 0 ? [] : messages.slice(Math.max(0, at - 10), at + 1).map((m) => ({ ...m, reported: m.id === id }));
}
