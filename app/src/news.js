import { nyInstant, nyOf, pad } from "./live/time";
import { DOW, MON } from "./lib/basics.js";

export const CHANNELS = [
  { id: "bloomberg", name: "Bloomberg TV", full: "Bloomberg Television", channel: "UCIALMKvObZNtJ6AmdCLP7Lg" },
  { id: "yahoo", name: "Yahoo Finance", full: "Yahoo Finance", channel: "UCEAZeUIeJs0IjQiqTCdVSIg" },
  { id: "schwab", name: "Schwab Network", full: "Schwab Network", channel: "UCqoSrYgusd8ZddtMoWhjHYA" },
  { id: "sky", name: "Sky News", full: "Sky News", channel: "UCoMdktPbSTixAyNGwb-UYkQ" },
];
export const channelOf = (id) => CHANNELS.find((c) => c.id === id) || CHANNELS[0];
export const embedUrl = (c, origin) =>
  `https://www.youtube-nocookie.com/embed/live_stream?${new URLSearchParams({ channel: c.channel, autoplay: "1", playsinline: "1", rel: "0", enablejsapi: "1", ...(origin ? { origin } : {}) })}`;
export const watchUrl = (c) => `https://www.youtube.com/channel/${c.channel}/live`;

const DEFAULT_RULE = { enabled: true, before: 5, after: 5, medium: false };
const mins = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(60, Math.round(+v))) : d);
export const ruleOf = (r) => ({
  enabled: r?.enabled ?? DEFAULT_RULE.enabled,
  before: mins(r?.before, DEFAULT_RULE.before),
  after: mins(r?.after, DEFAULT_RULE.after),
  medium: !!(r?.medium ?? DEFAULT_RULE.medium),
});

// A feed's own test post (the Bank of England's wire carried "Test01112026" on 1 Nov 2026): "Test" and digits, nothing else
export const feedTest = (title) => /^\s*test[\s_.:-]*\d*\s*$/i.test(title || "");
export const counts = (e, rule) => e.status !== "cancelled" && e.status !== "postponed" && (e.impact === "high" || (rule.medium && e.impact === "med"));
export function windowsOf(events, rule) {
  if (!rule.enabled) return [];
  return events.filter((e) => counts(e, rule)).map((e) => ({ event: e, from: e.at - rule.before * 60e3, to: e.at + rule.after * 60e3 }));
}
export function openWindow(events, rule, now) {
  const open = windowsOf(events, rule).filter((w) => now >= w.from && now < w.to);
  return open.sort((a, b) => Math.abs(a.event.at - now) - Math.abs(b.event.at - now))[0] || null;
}
// The next window to come today or later
export const nextWindow = (events, rule, now) => windowsOf(events, rule).filter((w) => w.from > now).sort((a, b) => a.from - b.from)[0] || null;
export const tagFor = (events, rule, at) => openWindow(events, rule, at)?.event.short || null;

/* ---------- The calendar ---------- */

export function nextBig(events, now, rule = DEFAULT_RULE) {
  return events.filter((e) => e.at > now && e.status !== "cancelled" && e.status !== "postponed" && (e.impact === "high" || (rule.medium && e.impact === "med")))
    .sort((a, b) => a.at - b.at)[0] || null;
}
const dayKey = (ms) => { const n = nyOf(ms); return `${n.year}-${pad(n.month + 1)}-${pad(n.day)}`; };
export const sameDay = (a, b) => dayKey(a) === dayKey(b);
export const todayOf = (events, now) => events.filter((e) => sameDay(e.at, now)).sort((a, b) => a.at - b.at);
export function daysOf(events, now, n = 7) {
  const out = new Map();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.at < now - 864e5 * 1 && !sameDay(e.at, now)) continue;
    if (e.at > now + n * 864e5) continue;
    const k = dayKey(e.at);
    if (!out.has(k)) out.set(k, { key: k, at: e.at, events: [] });
    out.get(k).events.push(e);
  }
  return [...out.values()];
}

/* ---------- How times read ---------- */

export const clockNY = (ms) => { const n = nyOf(ms); return `${pad(n.hour)}:${pad(n.minute)}`; };
export const dayLabel = (ms) => { const n = nyOf(ms); return `${DOW[n.weekday]} ${n.day} ${MON[n.month]}`; };
const split = (sec) => { const s = Math.max(0, Math.floor(sec)); return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }; };
// 1:12:00 (the studio clock)
export const hms = (sec) => { const t = split(sec); return `${t.h}:${pad(t.m)}:${pad(t.s)}`; };
// 7:20 (minutes and seconds, for a window)
export const msLeft = (sec) => { const t = split(sec); return `${t.h * 60 + t.m}:${pad(t.s)}`; };
// 1h 12m, 8m 05s, 40s; a day or more: 2d 4h
export const inWords = (sec) => {
  const t = split(sec);
  if (t.h >= 24) return `${Math.floor(t.h / 24)}d ${t.h % 24}h`;
  return t.h ? `${t.h}h ${pad(t.m)}m` : t.m ? `${t.m}m ${pad(t.s)}s` : `${t.s}s`;
};

let demoStart = null;
export function demoNow(NOW) {
  const [h, m] = String(NOW.time).split(":").map(Number);
  const base = nyInstant(NOW.year, NOW.month, NOW.day, h, m).getTime();
  if (demoStart == null) demoStart = Date.now();
  return base + (Date.now() - demoStart);
}
export function demoEvents(SAMPLE, NOW) {
  const at = (dayOffset, time) => { const [h, m] = time.split(":").map(Number); return nyInstant(NOW.year, NOW.month, NOW.day + dayOffset, h, m).getTime(); };
  const row = (e, d) => ({ id: `demo-${d}-${e.time}-${e.title}`, short: e.title, title: e.full || e.title, impact: e.impact, at: at(d, e.time), prev: e.prev ?? null, fcst: e.fcst ?? null,
    actual: e.actual ?? null, source: e.src || "", country: e.country || "US", status: "scheduled", period: e.period || null });
  return [...(SAMPLE.NEWS || []).map((e) => row(e, 0)), ...(SAMPLE.NEWS_WEEK || []).map((e) => row(e, e.day))];
}
export function demoItems(SAMPLE, NOW) {
  return (SAMPLE.NEWS_WIRE || []).map((w, i) => {
    const [h, m] = w.time.split(":").map(Number);
    return { id: `demo-wire-${i}`, kind: w.kind || "market", source: w.src, title: w.h, url: "", at: nyInstant(NOW.year, NOW.month, NOW.day, h, m).getTime() };
  });
}
