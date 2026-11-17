import { SAMPLE, art } from "../../data";
import { getState, setState } from "../../store";
import { nextCover } from "../study/model";
import { WHY, canSend, canStart, copyNotebookTitle, copyOf, heldView, leafLines, pagesNow, scamFlags, shareLines, snapshotOf, unreadTotal } from "./dms";

const C = () => SAMPLE.COMMUNITY || {};
const D = () => C().DMS || { threads: [], requests: [], shares: {}, staff: [] };
const beat = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const fail = (why) => Object.assign(new Error(WHY[why] || why), { code: "P0001" });
let n = 0;
const nextId = (p) => `${p}${Date.now().toString(36)}${n++}`;
const NOW = { day: "Today", time: "13:52" }; // the demo's clock

const myHandle = () => getState().profile?.handle || "you";
function who(h) {
  const t = (C().TRADERS || []).find((x) => x.handle === h);
  return { handle: h, avatar: t?.avatar || null, crew: t?.crew || null, staff: (D().staff || []).includes(h), cover: t?.cover || null };
}

const S = { ready: false };
function init() {
  if (S.ready) return;
  S.ready = true;
  const d = D();
  const thread = (t, state) => ({
    id: t.id, with: { ...who(t.with), meta: t.meta || null }, state, status: state === "request" ? "request" : "open", muted: false, waiting: false,
    atLabel: t.at, accepted: t.accepted || null, unread: t.unread ?? (state === "request" ? 1 : 0),
    messages: t.messages.map((m) => ({ id: m.id, mine: !m.from, body: m.body || "", card: m.card || null, day: m.day, time: m.time,
      flags: m.from ? scamFlags(m.body, who(m.from).staff) : [] })),
  });
  S.threads = [...d.requests.map((t) => thread(t, "request")), ...d.threads.map((t) => thread(t, "active"))];
  S.shares = Object.fromEntries(Object.entries(d.shares || {}).map(([id, s]) => [id, { ...s, id, revoked: false, reads: 0, saves: 0, saved: new Set() }]));
  S.blocked = new Set();
  S.settings = { from: "everyone", email: true };
}
export const demoBlocked = () => { init(); return S.blocked; };
const visible = () => S.threads.filter((t) => ["active", "request"].includes(t.state) && !S.blocked.has(t.with.handle) && t.messages.length);
const find = (id) => S.threads.find((t) => t.id === id);
const toTop = (t) => { S.threads = [t, ...S.threads.filter((x) => x !== t)]; };

/* ---------- Shares ---------- */

function pagesOf(s) {
  if (s.pages) return s.pages.map((p, i) => ({ ...p, i: i + 1, n: s.n || i + 1 }));
  const all = getState().pages || [];
  return pagesNow(s.snapshot, all).map((x) => {
    const p = all.find((y) => y.id === x.pageId);
    return { i: x.i, n: x.n, pageId: x.pageId, title: p.title, date: p.createdAt, lines: p.lines,
      video: p.videoId ? { id: p.videoId, title: p.videoTitle, channel: p.videoChannel, len: p.videoLen } : null };
  });
}
const open = (s) => s && !s.revoked && !S.blocked.has(s.owner);

export function shareCard(id) {
  init();
  const s = S.shares[id];
  if (!s) return { type: "page", share: id, gone: true };
  const pages = pagesOf(s);
  if (!open(s) || !pages.length) return { type: "page", share: id, gone: true, owner: s.owner, notebook: s.notebook.title, whole: s.whole };
  const p = pages[0], lines = shareLines(p.lines);
  return { type: "page", share: id, gone: false, owner: s.owner, notebook: s.notebook.title, whole: s.whole, n: p.n, of: pages.length,
    title: p.title, lesson: p.video?.title || null, lines: leafLines(p.lines), count: lines.length, keys: lines.filter((l) => l.key).length, mine: s.owner === myHandle() };
}
const cardOut = (c) => (c?.type === "page" ? shareCard(c.share) : c);

function msgOut(t, m) {
  const v = heldView(m, t.state === "request");
  return { ...v, card: cardOut(v.card), flags: t.status === "request" && !m.mine ? m.flags : [] };
}
const summary = (t) => {
  const last = t.messages.at(-1);
  return { id: t.id, status: t.status, state: t.state, muted: t.muted, waiting: t.waiting, with: t.with, unread: t.unread, atLabel: t.atLabel,
    last: last ? { id: last.id, body: t.state === "request" ? last.body : last.body.slice(0, 160), mine: last.mine, card: last.card?.type || null, day: last.day, time: last.time } : null,
    flags: t.state === "request" ? [...new Set(t.messages.flatMap((m) => m.flags))] : [],
    held: t.state === "request" && t.messages.some((m) => m.card) };
};

function deliver(handle, { body, card }) {
  const h = String(handle || "").replace(/^@/, "").trim();
  let t = S.threads.find((x) => x.with.handle === h && x.state !== "ignored");
  if (!t) {
    if (!(C().TRADERS || []).some((x) => x.handle === h) && !(D().staff || []).includes(h)) throw fail("No trader has that handle.");
    const ok = canStart({ blocked: S.blocked.has(h) });
    if (!ok.ok) throw fail(ok.why);
    t = { id: nextId("d"), with: who(h), state: "active", status: "request", muted: false, waiting: true, atLabel: NOW.time, unread: 0, messages: [] };
    S.threads.unshift(t);
  }
  const sent = t.messages.filter((m) => m.mine).length;
  const ok = canSend({ state: t.state === "left" ? "left" : t.state, status: t.status, startedByMe: t.waiting, sentAlready: sent, blocked: S.blocked.has(h), body, card: !!card });
  if (!ok.ok) throw fail(ok.why);
  if (ok.accepts) { t.state = "active"; t.status = "open"; }
  if (t.state === "left") t.state = "active";
  const m = { id: nextId("m"), mine: true, body: String(body || "").trim(), card: card || null, flags: [], ...NOW };
  t.messages.push(m);
  t.atLabel = NOW.time;
  t.unread = 0;
  toTop(t);
  return { t, m: msgOut(t, m) };
}

export const demoDms = {
  async dmInbox() {
    init();
    await beat();
    return { me: { staff: false, aal2: false, ...S.settings }, threads: visible().map(summary) };
  },
  async dmUnread() { init(); return unreadTotal(visible().map(summary)); },
  async dmThread(id) {
    init();
    await beat(80);
    const t = find(id);
    if (!t || !["active", "request"].includes(t.state)) throw fail("not_open");
    if (t.state === "active") t.unread = 0;
    return { thread: { id: t.id, status: t.status, state: t.state, muted: t.muted, waiting: t.waiting, with: t.with, accepted: t.accepted },
      messages: t.messages.map((m) => msgOut(t, m)), more: false };
  },
  async dmProfile(handle) {
    init();
    await beat(80);
    const h = String(handle || "").replace(/^@/, "");
    const w = who(h);
    const t = S.threads.find((x) => x.with.handle === h);
    return { ...w, no: (C().TRADERS || []).find((x) => x.handle === h)?.no ?? null, cover: w.cover ? art(w.cover, 480) : null, bio: "", since: null, mine: h === myHandle(),
      thread: t && t.state !== "ignored" ? t.id : null, state: t?.state || null, status: t?.status || null,
      open: !S.blocked.has(h) && h !== myHandle(), blocked: S.blocked.has(h) };
  },
  async dmStart(handle, body) { init(); await beat(); const { t, m } = deliver(handle, { body }); return { thread: t.id, message: m }; },
  async dmSend(id, { body, card, shareId }) {
    init();
    await beat(80);
    const t = find(id);
    if (!t) throw fail("not_open");
    return deliver(t.with.handle, { body, card: card ? { type: "trade", ...card } : shareId ? { type: "page", share: shareId } : null }).m;
  },
  async dmAccept(id) { init(); const t = find(id); if (t) { t.state = "active"; t.status = "open"; t.unread = 0; t.accepted = `You accepted ${t.with.handle}'s request today.`; } },
  async dmIgnore(id) { init(); const t = find(id); if (t?.state === "request") t.state = "ignored"; },
  async dmLeave(id) { init(); S.threads = S.threads.filter((t) => t.id !== id); },
  async dmMute(id, on) { init(); const t = find(id); if (t) t.muted = !!on; },
  async dmUnsend(mid) { init(); for (const t of S.threads) t.messages = t.messages.filter((m) => !(m.id === mid && m.mine)); },
  async dmBlock(h) { init(); S.blocked.add(h); },
  async dmUnblock(h) { init(); S.blocked.delete(h); },
  async dmBlocked() { init(); return [...S.blocked].map(who); },
  async dmReport(mid, reason, { block = true } = {}) {
    init();
    await beat();
    const t = S.threads.find((x) => x.messages.some((m) => m.id === mid && !m.mine));
    if (!t) throw fail("You can only report messages sent to you.");
    if (block) S.blocked.add(t.with.handle);
    return mid;
  },
  async dmSettings(from = null, email = null) {
    init();
    if (from) S.settings.from = from;
    if (email != null) S.settings.email = !!email;
    return { ...S.settings };
  },
  dmListen() { return () => {}; },
  dmWatch() { return () => {}; },

  async sharePage({ notebookId, pageId = null, audience, members = [], caption = null, copies = true }, { addPost } = {}) {
    init();
    await beat(160);
    const me = myHandle();
    const st = getState();
    const nb = (st.notebooks || []).find((x) => x.id === notebookId);
    if (!nb) throw fail("That notebook isn't yours.");
    if (audience === "members" && !members.length) throw fail("members");
    if (members.length > 20) throw fail("too_many");
    let s = Object.values(S.shares).find((x) => x.owner === me && !x.revoked && x.notebookId === notebookId && (x.pageId || null) === (pageId || null));
    let post = null;
    if (s && audience === "community") throw fail(s.audience === "community" ? "in_feed" : "This is shared with chosen members. Stop sharing first, then share it with the community.");
    if (!s) {
      const snapshot = snapshotOf(st.pages || [], notebookId, pageId);
      if (!snapshot.length) throw fail("Write a page first, then share it.");
      s = { id: nextId("sh"), owner: me, audience, whole: !pageId, notebookId, pageId, snapshot, copies: copies !== false, since: "Today",
        notebook: { title: nb.title, cover: nb.cover }, members: [], revoked: false, reads: 0, saves: 0, saved: new Set() };
      S.shares[s.id] = s;
      if (audience === "community") {
        post = nextId("u");
        addPost?.({ id: post, kind: "lesson", body: caption?.trim() || "A page from my Study notebook.", share: s.id });
      }
    }
    const sent = [], skipped = [];
    if (audience === "members") {
      for (const h of members) {
        try { deliver(h, { body: caption, card: { type: "page", share: s.id } }); if (s.audience === "members") s.members.push(h); sent.push(h); }
        catch (e) { skipped.push({ handle: h, why: e.message }); }
      }
      if (!sent.length) throw fail(skipped[0]?.why || "That didn't reach anyone.");
    }
    return { share: s.id, post, sent, skipped };
  },
  async shareStop(id) { init(); const s = S.shares[id]; if (!s || s.owner !== myHandle()) throw fail("That isn't one of your live shares."); s.revoked = true; },
  async shareList(notebookId) {
    init();
    return Object.values(S.shares).filter((s) => s.owner === myHandle() && !s.revoked && s.notebookId === notebookId)
      .map((s) => ({ share: s.id, page: s.pageId, audience: s.audience, copies: s.copies, since: s.since, pages: s.snapshot.map((x) => x.pageId), members: s.members, reads: s.reads, saves: s.saves }));
  },
  async shareView(id, n = null) {
    init();
    await beat(120);
    const s = S.shares[id];
    if (!s) throw fail("This page isn't shared with you.");
    const pages = pagesOf(s);
    if (!open(s) || !pages.length) return { share: id, gone: true, owner: who(s.owner), whole: s.whole, notebook: { title: s.notebook.title }, saved: [...s.saved].map((i) => ({ n: i, notebook: copyNotebookTitle(s.notebook.title, s.owner) })) };
    const i = Math.min(Math.max(n || 1, 1), pages.length);
    const p = pages[i - 1];
    const mine = s.owner === myHandle();
    if (!mine && !s.read) { s.read = true; s.reads++; }
    return { share: id, gone: false, mine, audience: s.audience, copies: s.copies, since: s.since, owner: who(s.owner), notebook: s.notebook, whole: s.whole,
      i, of: pages.length, n: p.n, page: { title: p.title, date: p.date, video: p.video, lines: shareLines(p.lines) }, saved: s.saved.has(i),
      reads: mine ? s.reads : null, saves: mine ? s.saves : null };
  },
  async shareSave(id, n, notebookId = null) {
    init();
    await beat(160);
    const s = S.shares[id];
    if (!open(s)) throw fail("gone");
    if (!s.copies) throw fail("copies_off");
    const pages = pagesOf(s);
    const i = Math.min(Math.max(n || 1, 1), pages.length);
    if (s.saved.has(i)) throw fail("saved");
    const p = pages[i - 1];
    const copy = copyOf({ title: p.title, lines: p.lines, videoId: p.video?.id, videoTitle: p.video?.title, videoChannel: p.video?.channel, videoLen: p.video?.len });
    const at = new Date().toISOString();
    let nb = notebookId || s.copyNotebook;
    let title;
    setState((st) => {
      const books = st.notebooks || [];
      let notebooks = books;
      if (!nb || !books.some((x) => x.id === nb)) {
        nb = nextId("nb");
        title = copyNotebookTitle(s.notebook.title, s.owner);
        notebooks = [...books, { id: nb, title, cover: nextCover(books), lastPage: 1, createdAt: at, updatedAt: at, position: books.reduce((m, x) => Math.max(m, (x.position ?? 0) + 1), 0) }];
      } else title = books.find((x) => x.id === nb)?.title;
      const pn = (st.pages || []).filter((x) => x.notebookId === nb).reduce((m, x) => Math.max(m, x.n || 0), 0) + 1;
      return { notebooks, pages: [...(st.pages || []), { id: nextId("pg"), notebookId: nb, n: pn, ...copy, createdAt: at, updatedAt: at }] };
    });
    if (!notebookId) s.copyNotebook = nb;
    s.saved.add(i);
    s.saves++;
    return { notebook: nb, title };
  },
};
