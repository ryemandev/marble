import { supabase } from "./supabase";
import { pic } from "./Community";

const call = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
};
const whoIn = (w) => (w ? { handle: w.handle, avatar: pic(w.avatar), crew: w.crew || null, staff: !!w.staff, role: w.role || null } : null);
const sessionIn = (s) => s && {
  ...s,
  people: (s.people || []).map(whoIn),
  questions: (s.questions || []).map((q) => ({ ...q, from: whoIn(q.from), votes: +q.votes || 0 })),
  hands: s.hands ? s.hands.map(whoIn) : null,
  hand_count: +s.hand_count || 0,
};

async function fn(body) {
  const { data, error } = await supabase.functions.invoke("voice", { body });
  if (!error) return data;
  let said = null;
  try { said = (await error.context?.json?.())?.error; } catch { }
  throw Object.assign(new Error(said || "Voice is having a moment. Try again."), { code: "P0001", status: error.context?.status || 0 });
}

export const voiceLive = {
  voiceNow: async () => {
    const r = await call("voice_sessions_now");
    return { me: r?.me || {}, sessions: (r?.sessions || []).map(sessionIn) };
  },
  voiceState: async (id) => sessionIn(await call("voice_state", { p_session: id })),
  voiceAsk: (id, body) => call("voice_ask", { p_session: id, p_body: body }),
  voiceVote: (question, on) => call("voice_vote", { p_question: question, p_on: !!on }),
  voiceHand: (id, up) => call("voice_hand", { p_session: id, p_up: !!up }),
  voiceReport: (id, handle, reason, note = null, speaking = []) => call("voice_report", { p_session: id, p_handle: handle, p_reason: reason, p_note: note, p_speaking: speaking }),
  voiceGoLive: (id) => call("voice_go_live", { p_session: id }),
  voiceRun: (id, at) => call("voice_run", { p_session: id, p_at: at }),
  voiceQuestion: (question, state) => call("voice_question_set", { p_question: question, p_state: state }),
  voiceSchedule: ({ room, title, starts, minutes, hosts, blurb = null, run = [] }) =>
    call("voice_schedule", { p_room: room, p_title: title, p_starts: new Date(starts).toISOString(), p_minutes: minutes, p_hosts: hosts, p_blurb: blurb, p_run: run }),
  voiceCancel: (id) => call("voice_cancel", { p_session: id }),

  voiceJoin: (id) => fn({ op: "join", session: id }),
  voiceMod: (id, action, { handle = null, track = null, days = null } = {}) => fn({ op: "mod", session: id, action, handle, track, days }),

  // Something changed in this session: read it again
  voiceWatch(id, onChange) {
    const ch = supabase.channel(`voice:${id}`, { config: { private: true } });
    ch.on("broadcast", { event: "changed" }, () => onChange()).subscribe();
    return () => { supabase.removeChannel(ch); };
  },
};
