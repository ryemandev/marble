import { supabase } from "./supabase";
import { userId } from "./sync";
import { pic } from "./Community";
import { numbersFor } from "./numbers";

const call = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
};
const whoIn = (w) => (w ? { handle: w.handle, avatar: pic(w.avatar), crew: w.crew || null, staff: !!w.staff, since: w.since || null } : null);
const threadIn = (t) => ({ ...t, with: whoIn(t.with), flags: t.flags || [], unread: +t.unread || 0 });
const msgIn = (m) => ({ id: m.id, mine: !!m.mine, body: m.body || "", card: m.card || null, held: m.held || null, flags: m.flags || [], at: m.at });

let inbox = null;
const inboxSubs = new Set();
function inboxChannel() {
  const me = userId();
  if (!me || inbox?.me === me) return;
  if (inbox) supabase.removeChannel(inbox.ch);
  const ch = supabase.channel(`inbox:${me}`, { config: { private: true } });
  ch.on("broadcast", { event: "inbox" }, (p) => inboxSubs.forEach((f) => f(p.payload?.thread))).subscribe();
  inbox = { me, ch };
}

export const dmLive = {
  dmInbox: async () => {
    const r = await call("dm_inbox");
    return { me: r?.me || {}, threads: (r?.threads || []).map(threadIn) };
  },
  dmUnread: () => call("dm_unread").then((n) => +n || 0),
  dmThread: async (id, { before = null, after = null } = {}) => {
    const r = await call("dm_thread", { p_thread: id, p_before: before, p_after: after });
    return { thread: { ...r.thread, with: whoIn(r.thread?.with) }, messages: (r.messages || []).map(msgIn), more: !!r.more };
  },
  dmProfile: async (handle) => {
    const [p, no] = await Promise.all([call("dm_profile", { p_handle: handle }), numbersFor([handle])]);
    return { ...p, avatar: pic(p.avatar), cover: p.cover ? pic(p.cover, 480) : null, no: no(p?.handle || handle) };
  },
  dmStart: async (handle, body) => { const r = await call("dm_start", { p_handle: handle, p_body: body }); return { thread: r.thread, message: msgIn(r.message) }; },
  dmSend: async (thread, { body, tradeId = null, shareId = null }) => msgIn(await call("dm_send", { p_thread: thread, p_body: body, p_trade: tradeId, p_share: shareId })),
  dmAccept: (thread) => call("dm_accept", { p_thread: thread }),
  dmIgnore: (thread) => call("dm_ignore", { p_thread: thread }),
  dmLeave: (thread) => call("dm_leave", { p_thread: thread }),
  dmMute: (thread, on) => call("dm_mute", { p_thread: thread, p_on: !!on }),
  dmUnsend: (id) => call("dm_unsend", { p_message: id }),
  dmBlock: (handle) => call("dm_block", { p_handle: handle }),
  dmUnblock: (handle) => call("dm_unblock", { p_handle: handle }),
  dmBlocked: async () => (await call("dm_blocked")).map(whoIn),
  dmReport: (id, reason, { note = null, block = true } = {}) => call("dm_report", { p_message: id, p_reason: reason, p_note: note, p_block: block }),
  dmSettings: (from = null, email = null) => call("dm_settings", { p_from: from, p_email: email }),

  dmListen(thread, { onMessage, onDelete }) {
    const ch = supabase.channel(`dm:${thread}`, { config: { private: true } });
    ch.on("broadcast", { event: "message" }, (p) => (p.payload?.op === "delete" ? onDelete?.(p.payload.id) : onMessage?.(p.payload?.id))).subscribe();
    return () => { supabase.removeChannel(ch); };
  },
  dmWatch(fn) {
    inboxChannel();
    inboxSubs.add(fn);
    return () => inboxSubs.delete(fn);
  },

  sharePage: ({ notebookId, pageId = null, audience, members = [], caption = null, copies = true }) =>
    call("share_page", { p_notebook: notebookId, p_page: pageId, p_audience: audience, p_members: members, p_caption: caption, p_copies: copies }),
  shareStop: (id) => call("share_stop", { p_share: id }),
  shareList: (notebookId) => call("share_list", { p_notebook: notebookId }).then((r) => r || []),
  shareView: async (id, n = null) => { const v = await call("share_view", { p_share: id, p_n: n }); return v?.owner ? { ...v, owner: whoIn(v.owner) } : v; },
  shareSave: (id, n, notebookId = null) => call("share_save", { p_share: id, p_n: n, p_notebook: notebookId }),
};
