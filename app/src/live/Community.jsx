import { art } from "../data";
import * as api from "./sync";
import { linkParts } from "./links";
import { closedDays, withNumbers } from "./numbers";

export function Linked({ text }) {
  return linkParts(text).map((p, i) => (p.href
    ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="lc-link" title={p.href}><b>{p.host}</b>{p.rest}</a>
    : p.text));
}

const OWN_AVATAR = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,80}\.(png|jpe?g|webp)(\?v=\d{1,20})?$/;
export const pic = (a, w = 160) => (!a ? null : /^https?:/.test(a) ? (OWN_AVATAR.test(a) ? a : null) : art(a, w));

const postIn = (p) => ({
  id: p.id, kind: p.kind, body: p.body, trade: p.trade || null, flex: p.card || null, share: p.share || null, crew: p.anonymous ? null : p.crew, at: p.created_at,
  anonymous: !!p.anonymous, mine: !!p.mine, replies: +p.replies || 0, likes: +p.likes || 0, liked: !!p.liked,
  author: p.anonymous ? null : { handle: p.author_handle, name: p.author_name, avatar: pic(p.author_avatar), crew: p.crew },
});

const authors = new Map();
const msgIn = (m) => {
  const a = m.author ? { handle: m.author.handle, avatar: pic(m.author.avatar_url || m.author.avatar_art), no: m.author.member_no ?? null } : authors.get(m.user_id);
  if (m.author) authors.set(m.user_id, a);
  return { id: m.id, room: m.room, body: m.body, trade: m.trade || null, replyTo: m.reply_to || null, crew: m.crew, at: m.created_at,
    mine: m.user_id === api.userId(), author: a ? { ...a, crew: m.crew } : null };
};

const boardIn = (b) => (b ? { ...b, rows: (b.rows || []).map((r) => ({ ...r, avatar: pic(r.avatar), cover: r.cover ? pic(r.cover, 480) : null, r: +r.r, score: +r.score, kept_r: +r.kept_r })) } : b);

const numbered = async (b) => { if (b?.rows) await withNumbers(b.rows, (r) => (r.handle ? r : null)); return b; };

const cupIn = (c) => ({
  kind: "cup", id: c.id, slug: c.slug, title: c.title, tagline: c.tagline, blurb: c.blurb, art: c.art, status: c.status,
  startsOn: c.starts_on, endsOn: c.ends_on, closesAt: c.entry_closes_at, resultsAt: c.results_at,
  limits: c.limits || {}, scoring: c.scoring || {}, prizes: c.prizes || [], summary: c.summary || [], rules: c.rules || [],
  rulesVersion: c.rules_version, rulesPublishedAt: c.rules_published_at, checks: c.checks || [],
});
const drawIn = (g) => ({
  kind: "draw", id: g.id, slug: g.slug, title: g.title, tagline: g.tagline, blurb: g.blurb, art: g.art, status: g.status,
  opensAt: g.opens_at, closesAt: g.closes_at, drawAt: g.draw_at, claimDays: g.claim_days, winners: g.winners_count,
  prize: g.prize || [], summary: g.summary || [], rules: g.rules || [], rulesVersion: g.rules_version, rulesPublishedAt: g.rules_published_at,
  sealed: g.seed_hash, sealedAt: g.sealed_at,
});

export const liveSource = {
  demo: false,

  closedDays,
  feed: async (filter = {}) => {
    const everyone = !["kind", "crew", "anonymous", "parent", "before"].some((k) => filter[k] != null);
    const [rows, pins] = await Promise.all([api.fetchFeed(filter), everyone ? api.fetchPinned() : []]);
    const top = pins.map((p) => ({ ...postIn(p), pinned: true }));
    const ids = new Set(top.map((p) => p.id));
    return withNumbers([...top, ...rows.map(postIn).filter((p) => !ids.has(p.id))], (p) => p.author);
  },
  canPin: () => api.canPin(),
  pin: (id, on) => api.pinPost(id, on),
  replies: async (id) => withNumbers((await api.fetchFeed({ parent: id, limit: 100 })).map(postIn), (p) => p.author),
  // A card goes up with a picture from Marble's shelves only: a trader's own picture never leaves their device
  post: ({ kind, body, anonymous, tradeId, parentId, flex }) => api.addPost({ kind: parentId ? "reply" : kind, body, anonymous: !!anonymous, parent_id: parentId || null,
    card: flex && !anonymous && !parentId ? { card: flex.card, finish: flex.finish, picture: flex.picture && !String(flex.picture).startsWith("own:") ? flex.picture : null } : null,
    trade: tradeId ? { id: tradeId } : null }),
  removePost: (id) => api.deletePost(id),
  like: (id, on) => api.likePost(id, on),
  report: ({ postId, messageId }, reason) => (messageId ? api.reportMessage(messageId, reason) : api.reportPost(postId, reason)),

  chat: async (room) => (await api.fetchChat(room)).map(msgIn),
  send: async (room, { body, tradeId, replyTo }) => msgIn(await api.sendChat(room, { body, trade: tradeId ? { id: tradeId } : null, replyTo })),
  removeMessage: (id) => api.deleteChat(id),
  listen: (room, { onInsert, onDelete, onHere }) => api.listenChat(room, {
    onDelete, onHere,
    onInsert: async (row) => {
      if (!row?.id || row.hidden) return;
      if (authors.has(row.user_id)) return onInsert?.(msgIn(row));
      const full = await api.fetchChatMessage(row.id).catch(() => null);
      if (full) onInsert?.(msgIn(full));
    },
  }),
  unread: async (room) => {
    let since = null;
    try { since = localStorage.getItem(`marble-chat-seen-${room}`); } catch {}
    return since ? api.countChatSince(room, since) : 0;
  },

  houseCup: (period = "month") => api.rpc("house_cup", { p_period: period }),
  setCrew: (tag) => api.rpc("set_crew", { p_crew: tag }),
  board: async ({ period = "month", crew = null, order = "board" } = {}) => numbered(boardIn(await api.rpc("leaderboard", { p_period: period, p_crew: crew, p_order: order }))),
  rulesLock: (fromMonth) => api.fetchRulesLock(fromMonth),
  setOptIn: (on) => api.setBoardsOptIn(on),

  events: async () => {
    const e = await api.fetchEvents();
    const cupEntry = Object.fromEntries(e.cupEntries.map((x) => [x.competition_id, x]));
    const drawEntry = Object.fromEntries(e.drawEntries.map((x) => [x.giveaway_id, x.entry_no]));
    return {
      competitions: e.competitions.map(cupIn).map((c) => ({ ...c, entry: cupEntry[c.id] || null })),
      giveaways: e.giveaways.map(drawIn).map((g) => ({ ...g, entryNo: drawEntry[g.id] ?? null })),
    };
  },
  competition: async (id) => numbered(boardIn(await api.rpc("competition_board", { p_competition: id }))),
  enterCompetition: (id, accountId, version) => api.rpc("enter_competition", { p_competition: id, p_account: accountId, p_rules_version: version }),
  withdrawCompetition: (id) => api.rpc("withdraw_competition", { p_competition: id }),
  enterGiveaway: (id, version) => api.rpc("enter_giveaway", { p_giveaway: id, p_rules_version: version }),
  giveaway: (id) => api.rpc("giveaway_result", { p_giveaway: id }),
  showHandle: (id, on) => api.rpc("giveaway_show_handle", { p_giveaway: id, p_show: on }),
};

// When you open a room, it's read up to now
export function markRoomSeen(room) {
  try { localStorage.setItem(`marble-chat-seen-${room}`, new Date().toISOString()); } catch {}
}
