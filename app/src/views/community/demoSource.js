import { SAMPLE, art } from "../../data";
import { BROKER_SYNC } from "../../mode";
import { getState } from "../../store";
import { CREW_TAGS, MIN_DAYS, houseCup, periodOf, rank, stripDays, stripOf, summarise } from "./scoring";
import { demoBlocked, shareCard } from "./demoDms";
import { hideBlocked } from "./dms";
import { TOPIC_IDS } from "./houses";

const withCard = (p) => {
  if (!p.share || typeof p.share === "object") return p;
  const c = shareCard(p.share);
  return { ...p, share: c.gone ? null : c };
};

const C = () => SAMPLE.COMMUNITY || { TRADERS: [], POSTS: [], REPLIES: {}, ROOMS: {}, HERE: {}, CREW_MEMBERS: {}, ME: {}, TODAY: "2026-10-27" };
const beat = (ms = 140) => new Promise((r) => setTimeout(r, ms));
const S = { ready: false };
function init() {
  if (S.ready) return;
  const c = C();
  S.ready = true;
  S.posts = c.POSTS.map((p) => ({ likes: 0, replies: 0, liked: false, mine: false, ...p }));
  S.replies = Object.fromEntries(Object.entries(c.REPLIES || {}).map(([k, v]) => [k, [...v]]));
  S.rooms = Object.fromEntries(Object.entries(c.ROOMS || {}).map(([k, v]) => [k, [...v]]));
  S.crew = c.ME?.crew ?? null;
  S.changedAt = c.ME?.changedAt ?? null;
  S.optedIn = !!c.ME?.optedIn;
  S.lateSent = false;
  S.seen = {};
}
const fail = (message) => Object.assign(new Error(message), { code: "P0001" });
let n = 0;
const nextId = (p) => `${p}${Date.now()}${n++}`;

function me() {
  const p = getState().profile;
  return { handle: p.handle || "you", name: p.name, avatar: p.avatar || (p.avatarArt ? art(p.avatarArt, 160) : null), crew: S.crew, mine: true };
}
const nowClock = () => "13:52";

function rowsFor(people, p, before) {
  const keys = stripDays(p);
  const end = p.to < p.today ? p.to : p.today;
  return people.map((x) => {
    const days = x.days.filter((d) => d.day >= p.from && d.day <= end && (!before || d.day < before));
    return { handle: x.handle, avatar: x.avatar, crew: x.crew, no: x.no ?? null, cover: x.cover ? art(x.cover, 480) : null, mine: !!x.mine, ...summarise(days), strip: stripOf(days, keys, p.today) };
  });
}

// Dated from now, so the demo's countdown always has something to count to. All made up.
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString();
function demoEvents() {
  S.cup ||= {
    kind: "cup", id: "demo-cup", slug: "open-cup", title: "The Open Cup", tagline: "Four weeks. One table.", art: "masters/charging-chasseur-gericault", status: "open",
    blurb: "A free competition on real synced accounts. One big day can't win it.",
    startsOn: inDays(3).slice(0, 10), endsOn: inDays(31).slice(0, 10), closesAt: inDays(2.61), resultsAt: inDays(34),
    limits: { daily_loss_pct: 3, max_trades: 6, stop_after: 3 }, scoring: { broken_day_r: 2, min_days: 10 },
    prizes: [{ place: "1st", title: "A framed Great Wave print", detail: "Numbered and signed by the team" }, { place: "2nd", title: "A framed Great Wave print" }, { place: "3rd", title: "A crew cap" }],
    summary: ["Free to enter, synced accounts only.", "Open to anyone 18 or over.", "Nothing in a competition is advice."],
    rules: [["Who can enter", "Anyone 18 or over with a synced account."], ["How it's scored", "Every trading day is checked from your synced trades."], ["Sample", "These rules are sample text for the demo."]],
    rulesVersion: 1, rulesPublishedAt: inDays(-4), checks: [], entry: null,
  };
  S.draw ||= {
    kind: "draw", id: "demo-draw", slug: "desk-draw", title: "The Desk Draw", tagline: "One monitor. Free to enter.", art: "prints/mystical-bird-hokusai", status: "open",
    blurb: "A free prize draw. Every entry has one number, and anyone can check the result.",
    opensAt: inDays(-2), closesAt: inDays(5.2), drawAt: inDays(5.5), claimDays: 14, winners: 1,
    prize: [{ title: "A 34-inch ultrawide monitor", detail: "Sample prize for the demo" }], summary: ["Free to enter, no purchase necessary.", "One entry each."],
    rules: [["Who can enter", "Anyone 18 or over."], ["Sample", "These rules are sample text for the demo."]],
    rulesVersion: 1, rulesPublishedAt: inDays(-2), sealed: "9f3c1e07b2d84a6c5e10f7a3c2b94d18e6a07f5d3c1b28e4a96d07c3f15be742", sealedAt: inDays(-2), entryNo: null,
  };
  return { competitions: BROKER_SYNC ? [S.cup] : [], giveaways: [S.draw] };
}

export const demoSource = {
  demo: true,

  // Sample data: a steady made-up count for each sample trader
  async closedDays(handles) {
    await beat(80);
    return Object.fromEntries(handles.map((h) => [h, 12 + [...String(h)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 229, 7)]));
  },
  async feed({ kind, crew, anonymous } = {}) {
    init();
    await beat();
    return hideBlocked(S.posts.filter((p) => (p.team ? !kind && !crew && anonymous == null : true)
      && (!kind || p.kind === kind)
      && (!crew || (!p.anonymous && p.author?.crew === crew))
      && (anonymous == null || !!p.anonymous === anonymous)), demoBlocked()).map(withCard);
  },
  canPin: async () => false,
  async pin() {},
  async replies(id) { init(); await beat(80); return hideBlocked(S.replies[id] || [], demoBlocked()); },
  addSharedPost({ id, kind, body, share }) {
    init();
    const p = { id, kind, body, anonymous: false, author: me(), mine: true, ago: "now", likes: 0, liked: false, replies: 0, trade: null, share };
    const pinned = S.posts.filter((x) => x.pinned);
    S.posts = [...pinned, p, ...S.posts.filter((x) => !x.pinned)];
  },
  async post({ kind, body, anonymous, parentId, card, flex }) {
    init();
    const p = { id: nextId("u"), kind: parentId ? "reply" : kind, body, anonymous: !!anonymous, author: anonymous ? null : me(), mine: true, ago: "now", likes: 0, liked: false, replies: 0, trade: card || null, flex: flex || null };
    if (parentId) {
      S.replies[parentId] = [...(S.replies[parentId] || []), p];
      S.posts = S.posts.map((x) => (x.id === parentId ? { ...x, replies: x.replies + 1 } : x));
    } else {
      const pinned = S.posts.filter((x) => x.pinned);
      S.posts = [...pinned, p, ...S.posts.filter((x) => !x.pinned)];
    }
    return p;
  },
  async removePost(id) {
    init();
    S.posts = S.posts.filter((p) => p.id !== id);
    // A reply: out of its post's replies, and off its count
    for (const [parent, rs] of Object.entries(S.replies)) {
      if (!rs.some((r) => r.id === id)) continue;
      S.replies[parent] = rs.filter((r) => r.id !== id);
      S.posts = S.posts.map((x) => (x.id === parent ? { ...x, replies: Math.max(0, x.replies - 1) } : x));
    }
  },
  async like(id, on) { init(); S.posts = S.posts.map((p) => (p.id === id ? { ...p, liked: on, likes: p.likes + (on ? 1 : -1) } : p)); },
  async report() { await beat(); },

  async chat(room) { init(); await beat(); S.seen[room] = true; return hideBlocked(S.rooms[room] || [], demoBlocked()).map((m) => ({ ...m, mine: m.author?.handle === me().handle })); },
  async send(room, { body, card, replyTo }) {
    init();
    const m = { id: nextId("m"), author: me(), crew: S.crew, time: nowClock(), body, trade: card || null, replyTo: replyTo || null, mine: true };
    S.rooms[room] = [...(S.rooms[room] || []), m];
    return m;
  },
  async removeMessage(id) { init(); for (const k of Object.keys(S.rooms)) S.rooms[k] = S.rooms[k].filter((m) => m.id !== id); },
  listen(room, { onInsert, onHere }) {
    init();
    onHere?.(C().HERE?.[room] ?? 1);
    if (room !== "general" || S.lateSent || !C().LATE) return () => {};
    const t = setTimeout(() => { S.lateSent = true; const m = { ...C().LATE, fresh: true }; S.rooms.general = [...S.rooms.general, m]; onInsert?.(m); }, 2600);
    return () => clearTimeout(t);
  },
  async unread(room) {
    init();
    if (S.seen[room] || room === "general") return 0;
    return TOPIC_IDS.includes(room) ? C().NEW?.[room] || 0 : (S.rooms[room] || []).length;
  },

  async houseCup(period = "month", { mine } = {}) {
    init();
    const c = C();
    const p = periodOf(period, c.TODAY);
    const people = [...c.TRADERS, ...(mine && S.optedIn ? [{ ...mine, crew: S.crew, mine: true }] : [])].filter((x) => x.crew);
    const cup = houseCup(rowsFor(people, p));
    return {
      period, from: p.from, to: p.to,
      crews: cup.map((x) => ({ ...x, members: (c.CREW_MEMBERS?.[x.crew] || 0) + (S.crew === x.crew ? 1 : 0) })),
      mine: S.crew || S.changedAt ? { crew: S.crew, changed_at: S.changedAt, next_change: S.changedAt ? new Date(Date.parse(S.changedAt) + 30 * 864e5).toISOString() : null } : null,
    };
  },
  async setCrew(tag) {
    init();
    await beat();
    if (tag && !CREW_TAGS.includes(tag)) throw fail("No such crew");
    if ((S.crew ?? null) === (tag ?? null)) return { crew: S.crew };
    // The demo's clock is 27 Oct 2026, 13:52 in New York
    const now = Date.parse("2026-10-27T17:52:00Z");
    if (S.changedAt && now - Date.parse(S.changedAt) < 30 * 864e5) {
      throw Object.assign(fail("You can change crews once a month"), { details: new Date(Date.parse(S.changedAt) + 30 * 864e5).toISOString().slice(0, 10) });
    }
    S.crew = tag;
    S.changedAt = new Date(now).toISOString();
    return { crew: S.crew, changed_at: S.changedAt };
  },

  async board({ period = "month", crew = null, order = "board", mine } = {}) {
    init();
    const c = C();
    const p = periodOf(period, c.TODAY);
    const minDays = MIN_DAYS[p.period];
    const people = [...c.TRADERS, ...(mine && S.optedIn ? [{ ...mine, crew: S.crew, mine: true }] : [])].filter((x) => !crew || x.crew === crew);
    const now = rank(rowsFor(people, p), { order, minDays });
    const before = new Map(rank(rowsFor(people, p, c.TODAY), { order, minDays }).map((x) => [x.handle, x.rank]));
    const rows = now.map((x) => ({ ...x, move: x.rank && before.get(x.handle) ? before.get(x.handle) - x.rank : null }));
    return {
      period: p.period, from: p.from, to: p.to, today: c.TODAY, min_days: minDays, opted_in: S.optedIn,
      total: rows.filter((x) => x.rank).length,
      rows: rows.filter((x) => (x.rank && x.rank <= 50) || x.mine),
    };
  },
  async rulesLock() { return null; },
  async setOptIn(on) { init(); await beat(); S.optedIn = !!on; },

  // Who's in which room, and each room's newest line. Demo only: a live room only knows this once you're in it.
  async hereNow() { init(); return { ...(C().HERE || {}) }; },
  async peek(room) { init(); return hideBlocked(S.rooms[room] || [], demoBlocked()); },

  async events() { init(); await beat(); return demoEvents(); },
  async competition(id) {
    init();
    const b = await demoSource.board({ period: "month" });
    return { ...b, entrants: 214, rows: b.rows.slice(0, 20).map((r) => ({ ...r, kept_r: r.keptR ?? r.r, prize: null })), competition: id };
  },
  async enterCompetition(id, account, version) { await beat(); if (S.cup) S.cup.entry = { account_id: account, status: "entered", rules_version: version }; },
  async withdrawCompetition() { await beat(); if (S.cup) S.cup.entry = null; },
  async enterGiveaway() { await beat(); if (S.draw) S.draw.entryNo = 1907; return 1907; },
  async giveaway() { return null; },
  async showHandle() { return null; },
};
