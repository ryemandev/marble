import { SAMPLE } from "../../../data";
import { getState } from "../../../store";
import { WHY, checkQuestion, phaseOf } from "./rules";

const C = () => SAMPLE.COMMUNITY || { TRADERS: [] };
const beat = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const fail = (message, code = "P0001") => Object.assign(new Error(message), { code });
const CREW_OF = { kenji: "PIT", priya: "NITE", ava: "PIT", juno: "NITE", "marcus.r": "OLY", leo: "OLY" };
const who = (h, role = null) => {
  const t = (C().TRADERS || []).find((x) => x.handle === h);
  return { handle: h, avatar: t?.avatar || null, crew: t?.crew || CREW_OF[h] || null, staff: h === "jules", role };
};
const nyClock = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });

const S = { ready: false };
function init() {
  if (S.ready) return;
  S.ready = true;
  const now = Date.now();
  const start = now - 16 * 60e3;
  const at = (min) => nyClock(start + min * 60e3);
  const crew = C().ME?.crew || "OLY";
  S.sessions = [
    {
      id: "demo-live", room: "futures", title: "The NQ open, live", blurb: "Levels first, then the 9:45 close, then your questions.",
      run: [{ at: at(0), what: "Overnight levels" }, { at: at(5), what: "The open, first five minutes" }, { at: at(15), what: "The 9:45 close" },
        { at: at(30), what: "Your questions" }, { at: at(45), what: "One lesson each" }],
      run_at: 2, starts_at: new Date(start).toISOString(), ends_at: new Date(start + 50 * 60e3).toISOString(), live_at: new Date(start).toISOString(),
      status: "live", people: [who("jules", "host"), who("kenji", "guest"), who("priya", "guest")],
    },
    {
      id: "demo-later", room: crew, title: "Crew debrief", blurb: "The week's best and worst day from each of us, in dollars.",
      run: [{ at: null, what: "Best trade of the week" }, { at: null, what: "Worst trade, and what it cost" }, { at: null, what: "One thing for next week" }],
      run_at: 0, starts_at: new Date(now + 5 * 3600e3).toISOString(), ends_at: new Date(now + 6 * 3600e3).toISOString(), live_at: null,
      status: "scheduled", people: [who("marcus.r", "host")],
    },
  ];
  S.questions = {
    "demo-live": [
      { id: "q1", from: who("sol"), body: "How do you size the first entry after the 9:45 close?", state: "next", votes: 14, voted: false, at: new Date(now - 9 * 60e3).toISOString() },
      { id: "q2", from: who("ava"), body: "Do you still trade the open on a CPI day, or wait for the first hour?", state: "open", votes: 9, voted: true, at: new Date(now - 7 * 60e3).toISOString() },
      { id: "q3", from: who("tom.w"), body: "What makes you call it a fake-out rather than a real break?", state: "open", votes: 6, voted: false, at: new Date(now - 5 * 60e3).toISOString() },
      { id: "q4", from: who("juno"), body: "Kenji, is your stop beyond the wick or beyond the body?", state: "open", votes: 3, voted: false, at: new Date(now - 2 * 60e3).toISOString() },
    ],
    "demo-later": [],
  };
  S.hand = {};
}
const me = () => {
  const p = getState().profile || {};
  return { handle: p.handle || "you", avatar: p.avatar || null, crew: C().ME?.crew || null, staff: false };
};
const card = (s) => ({ ...s, phase: phaseOf(s), my_role: null });
const find = (id) => { init(); const s = S.sessions.find((x) => x.id === id); if (!s) throw fail(WHY.closed); return s; };

export function previewSession() {
  init();
  const s = S.sessions[0];
  return { ...card(s), questions: S.questions[s.id] };
}

export const demoVoice = {
  voiceNow: async () => {
    init();
    await beat();
    return { me: { staff: false, admin: false, aal2: false, banned: false }, sessions: S.sessions.filter((s) => ["scheduled", "live"].includes(phaseOf(s))).map(card) };
  },
  voiceState: async (id) => {
    const s = find(id);
    await beat(80);
    return { ...card(s), host: false, questions: S.questions[id].filter((q) => q.state !== "hidden" || q.mine), my_hand: !!S.hand[id], hand_count: 2 + (S.hand[id] ? 1 : 0), hands: null };
  },
  voiceAsk: async (id, body) => {
    const s = find(id);
    const open = S.questions[id].filter((q) => q.mine && ["open", "next"].includes(q.state)).length;
    const why = phaseOf(s) === "live" || phaseOf(s) === "scheduled" ? checkQuestion(body, open) : WHY.closed;
    if (why) throw fail(why);
    await beat();
    const q = { id: `q${Date.now()}`, from: me(), body: String(body).trim(), state: "open", votes: 0, voted: false, mine: true, at: new Date().toISOString() };
    S.questions[id] = [...S.questions[id], q];
    return q.id;
  },
  voiceVote: async (qid, on) => {
    init();
    for (const id of Object.keys(S.questions)) {
      S.questions[id] = S.questions[id].map((q) => {
        if (q.id !== qid) return q;
        if (q.mine) throw fail(WHY.own);
        return q.voted === !!on ? q : { ...q, voted: !!on, votes: q.votes + (on ? 1 : -1) };
      });
    }
  },
  voiceHand: async (id, up) => { const s = find(id); if (up && phaseOf(s) !== "live") throw fail(WHY.notLive); S.hand[id] = !!up; await beat(); },
  voiceReport: async () => { await beat(); },
  voiceGoLive: async () => { throw fail(WHY.hostOnly, "42501"); },
  voiceRun: async () => { throw fail(WHY.hostOnly, "42501"); },
  voiceQuestion: async () => { throw fail(WHY.hostOnly, "42501"); },
  voiceSchedule: async () => { throw fail("Admins only", "42501"); },
  voiceCancel: async () => { throw fail("Admins only", "42501"); },
  voiceJoin: async (id) => { const s = find(id); if (phaseOf(s) !== "live") throw fail(WHY.notYet); await beat(300); return { demo: true, role: "listener" }; },
  voiceMod: async () => { throw fail(WHY.hostOnly, "42501"); },
  voiceWatch: () => () => {},
};
