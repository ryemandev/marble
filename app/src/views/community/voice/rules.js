import { CREW_ORDER, ROOM_GENERAL, TOPIC_IDS } from "../houses";

export const ROOMS = [ROOM_GENERAL, ...TOPIC_IDS, ...CREW_ORDER];
export const LIMITS = { title: [3, 60], blurb: 200, run: 10, runLine: 60, question: [3, 280], openQuestions: 3, minutes: [15, 240], hosts: [1, 3], daysAhead: 60 };
export const GO_LIVE_EARLY = 15 * 60e3;
export const ASK_EARLY = 60 * 60e3; // written questions open an hour before
export const GRACE = 15 * 60e3;
export const SHOW_AHEAD = 24 * 3600e3;

export const WHY = {
  closed: "This session isn't open right now.",
  notYet: "This session isn't on air yet.",
  notLive: "This session isn't on air right now.",
  banned: "You can't take part in voice sessions right now.",
  card: "Card numbers can't be sent.",
  length: "A question is 3 to 280 characters.",
  waiting: "You have three questions waiting. Give the host a moment.",
  own: "You can't vote for your own question.",
  onAir: "You're already on air.",
  hostOnly: "Only this session's hosts can do that.",
  hostOnHost: "Hosts can't act on another host.",
  ban24: "Hosts can ban for 24 hours. Ask Marble staff for longer.",
  early: "You can go on air from 15 minutes before the start.",
  joined: "You can report people in a session you joined.",
  overlap: "Two sessions already run at that time.",
  title: "A title is 3 to 60 characters.",
  minutes: "A session runs 15 minutes to 4 hours.",
  hosts: "A session has one to three hosts.",
  start: "Pick a start in the next 60 days.",
  room: "Pick General, a topic room or a crew's room.",
  runLength: "A run sheet is up to 10 lines.",
  runLine: "Each run sheet line is up to 60 characters, with an optional HH:MM time.",
};

const t = (x) => (typeof x === "number" ? x : Date.parse(x));

export function phaseOf(s, now = Date.now()) {
  if (!s) return "ended";
  if (s.status === "ended" || s.status === "cancelled" || s.phase === "ended" || s.phase === "cancelled") return s.status === "cancelled" || s.phase === "cancelled" ? "cancelled" : "ended";
  if (now > t(s.ends_at) + GRACE) return "ended";
  return s.status === "live" || s.phase === "live" ? "live" : "scheduled";
}
export const canTuneIn = (s, role, now = Date.now()) => {
  const p = phaseOf(s, now);
  return p === "live" || (role === "host" && p === "scheduled" && now >= t(s.starts_at) - GO_LIVE_EARLY);
};
export const canGoLive = (s, now = Date.now()) => phaseOf(s, now) === "scheduled" && now >= t(s.starts_at) - GO_LIVE_EARLY;
export const canAsk = (s, now = Date.now()) => ["scheduled", "live"].includes(phaseOf(s, now)) && now >= t(s.starts_at) - ASK_EARLY;

export function sessionFor(sessions, room, now = Date.now()) {
  const mine = (sessions || []).filter((s) => s.room === room && ["scheduled", "live"].includes(phaseOf(s, now)));
  return mine.find((s) => phaseOf(s, now) === "live") || mine.filter((s) => t(s.starts_at) - now < SHOW_AHEAD).sort((a, b) => t(a.starts_at) - t(b.starts_at))[0] || null;
}

const RANK = { next: 0, open: 1, answered: 2, hidden: 3 };
export const questionsInOrder = (qs) => [...(qs || [])].sort((a, b) => (RANK[a.state] ?? 1) - (RANK[b.state] ?? 1) || (b.votes || 0) - (a.votes || 0) || t(a.at) - t(b.at));

export function checkQuestion(body, openOfMine = 0) {
  const b = String(body || "").trim();
  if (b.length < LIMITS.question[0] || b.length > LIMITS.question[1]) return WHY.length;
  if (openOfMine >= LIMITS.openQuestions) return WHY.waiting;
  return null;
}

export function countdown(ms) {
  if (!(ms > 0)) return "00:00";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  if (h >= 24) { const d = Math.round(h / 24); return `in ${d} day${d === 1 ? "" : "s"}`; }
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}
// How far through the session's scheduled time it is, 0 to 1
export const progressOf = (s, now = Date.now()) => Math.min(1, Math.max(0, (now - t(s.starts_at)) / Math.max(1, t(s.ends_at) - t(s.starts_at))));
export const elapsed = (s, now = Date.now()) => { const m = Math.max(0, Math.floor((now - t(s.live_at || s.starts_at)) / 1000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
export const lengthOf = (s) => Math.round((t(s.ends_at) - t(s.starts_at)) / 60e3);

const IN_APP = [[/Instagram/i, "Instagram"], [/FBAN|FBAV|FB_IAB|FB4A/i, "Facebook"], [/TikTok|musical_ly|BytedanceWebview/i, "TikTok"],
  [/Snapchat/i, "Snapchat"], [/LinkedInApp/i, "LinkedIn"], [/\bLine\//i, "LINE"], [/Twitter for|TwitterAndroid/i, "X"]];
export const inAppBrowser = (ua = "") => IN_APP.find(([re]) => re.test(ua))?.[1] || null;
export const browserToOpen = (ua = "") => (/iPhone|iPad|iPod/i.test(ua) ? "Safari" : "Chrome");

export function checkSchedule({ room, title, minutes, hosts, run = [], starts }, now = Date.now()) {
  if (!ROOMS.includes(room)) return WHY.room;
  const ti = String(title || "").trim();
  if (ti.length < LIMITS.title[0] || ti.length > LIMITS.title[1]) return WHY.title;
  if (!(minutes >= LIMITS.minutes[0] && minutes <= LIMITS.minutes[1])) return WHY.minutes;
  const st = t(starts);
  if (!(st >= now - 5 * 60e3 && st <= now + LIMITS.daysAhead * 86400e3)) return WHY.start;
  if (!hosts?.length || hosts.length > LIMITS.hosts[1]) return WHY.hosts;
  if (run.length > LIMITS.run) return WHY.runLength;
  if (run.some((l) => !String(l.what || "").trim() || String(l.what).trim().length > LIMITS.runLine || (l.at != null && l.at !== "" && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(l.at)))) return WHY.runLine;
  return null;
}
export const runFromText = (text) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)
  .map((l) => { const m = l.match(/^(\d{1,2}):(\d{2})\s+(.*)$/); return m ? { at: `${m[1].padStart(2, "0")}:${m[2]}`, what: m[3].trim() } : { at: null, what: l }; });

export function icsOf(s, url) {
  const z = (x) => new Date(t(x)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (x) => String(x || "").replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Marble//Voice sessions//EN", "BEGIN:VEVENT", `UID:${s.id}@trademarble.app`, `DTSTAMP:${z(Date.now())}`,
    `DTSTART:${z(s.starts_at)}`, `DTEND:${z(s.ends_at)}`, `SUMMARY:${esc(`${s.title} · Marble`)}`, `DESCRIPTION:${esc(`${s.blurb ? `${s.blurb}\n` : ""}Live in Marble. Not recorded.`)}`,
    ...(url ? [`URL:${url}`] : []), "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

export const REPORT_REASONS = [["abuse", "Abuse or harassment"], ["hate", "Hate"], ["sexual", "Sexual content"], ["scam", "A scam, or selling"],
  ["advice", "Signals or financial advice"], ["spam", "Spam"], ["other", "Something else"]];
export const ROLE_WORD = { host: "Host", guest: "Guest", listener: "Listening" };

export const VOICE_IDEA = {
  title: "Live voice sessions in Community",
  body: "Scheduled live sessions with a host: listen in, ask questions in writing, raise your hand to speak. Never recorded.",
  area: "Community",
};
export const isVoiceIdea = (x) => String(x?.title || "").trim().replace(/\s+/g, " ").toLowerCase() === VOICE_IDEA.title.toLowerCase();
