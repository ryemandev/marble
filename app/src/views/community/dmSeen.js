const threads = new Map();

const keep = (me, t) => {
  if (!t?.id) return null;
  let x = threads.get(t.id);
  if (!x || x.me !== me) { x = { id: t.id, with: t.with || null, at: t.at || null, me, messages: new Map() }; threads.set(t.id, x); }
  if (t.with) x.with = t.with;
  if (t.at) x.at = t.at;
  return x;
};
const add = (x, m) => { if (x && m?.id && typeof m.body === "string" && m.body) x.messages.set(m.id, { id: m.id, body: m.body, at: m.at, mine: !!m.mine }); };

export function seenInbox(me, r) {
  for (const t of r?.threads || []) add(keep(me, t), t.last);
  return r;
}
// One conversation's answer: { thread, messages }
export function seenThread(me, r) {
  const x = keep(me, r?.thread);
  for (const m of r?.messages || []) add(x, m);
  return r;
}
export const seenSent = (me, threadId, m) => { add(threads.get(threadId)?.me === me ? threads.get(threadId) : null, m); return m; };
export function forgetMessage(id) { for (const t of threads.values()) t.messages.delete(id); }
export const forgetThread = (id) => { threads.delete(id); };
export function forgetHandle(handle) { for (const [id, t] of threads) if (t.with?.handle === handle) threads.delete(id); }

export const seenThreads = (me) => [...threads.values()].filter((t) => t.me === me).map((t) => ({ id: t.id, with: t.with, at: t.at, messages: [...t.messages.values()] }));
