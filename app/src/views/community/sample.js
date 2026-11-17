import { CREW_TAGS, addDays, weekdaysBetween } from "./scoring";
import { seeded } from "../../lib/basics.js";

const B = import.meta.env?.BASE_URL ?? "/";

const PEOPLE = [
  ["priya", "NITE", 0.96, 0.9, 0.85, "anime/night-figure"], ["marcus.r", "OLY", 0.95, 0.88, 0.8, "masters/self-portrait-rembrandt"],
  ["kenji", "PIT", 0.92, 0.87, 0.7, "cars/ferrari-curves"], ["juno", "NITE", 0.8, 0.86, 0.65, "anime/moon-reflection"],
  ["mira.k", "OLY", 0.95, 0.85, 0.9, "masters/magdalen-la-tour"], ["dante", "NITE", 0.95, 0.84, 0.7, "anime/samurai-duel"],
  ["ava", "PIT", 0.94, 0.83, 0.65, "cars/aston-front"], ["leo", "OLY", 0.9, 0.9, 0.55, "masters/narcissus-caravaggio"],
  ["noor", "NITE", 0.88, 0.9, 0.5, "anime/kabuto"], ["rex", "PIT", 0.93, 0.88, 0.45, "cars/porsche-rear"],
  ["wren", "PIT", 0.95, 0.85, 0.55, "cars/ferrari-wheel"], ["cato", "OLY", 0.95, 0.84, 0.55, "masters/crow-kyosai"],
  ["theo", "OLY", 0.95, 0.83, 0.5, "masters/sower-millet"], ["ines", "OLY", 0.95, 0.82, 0.5, "prints/mystical-bird-hokusai"],
  ["sol", null, 0.95, 0.8, 0.45, "textures/chrome-ripple"], ["hal.t", "OLY", 0.85, 0.86, 0.35, "masters/charging-chasseur-gericault"],
  ["felix", "OLY", 0.9, 0.84, 0.4, "masters/jerome-writing-caravaggio"], ["oto", "NITE", 0.85, 0.86, 0.3, "japan/ryu"],
  ["bram", "PIT", 0.9, 0.76, 0.4, "cars/porsche-911-black"], ["tom.w", null, 0.92, 0.68, 0.35, "prints/red-fuji-hokusai"],
  ["yuki", "NITE", 0.8, 0.84, 0.3, "japan/brush-hand"], ["sasha", "PIT", 0.85, 0.74, 0.35, "cars/aston-badge"],
  ["nico", null, 0.9, 0.6, 0.25, "prints/great-wave-hokusai"], ["ezra", "OLY", 0.75, 0.8, 0.3, "masters/joseph-carpenter-la-tour"],
  ["lena", "NITE", 0.8, 0.82, 0.2, "japan/torii-tunnel"], ["omar", "PIT", 0.85, 0.7, 0.25, "cars/porsche-headlight"],
  ["kai", "NITE", 0.7, 0.8, 0.15, "anime/ronin"], ["ruby", "OLY", 0.8, 0.78, 0.2, "prints/evening-snow-kanbara-hiroshige"],
  ["jonah", "PIT", 0.75, 0.64, 0.1, "cars/ferrari-rear"], ["vera", "NITE", 0.7, 0.78, 0.1, "prints/night-rain-karasaki-hiroshige"],
  // Most traders have a rough day or two
  ["mo", "PIT", 0.85, 0.42, 0.1, "cars/porsche-rear"], ["pax", "OLY", 0.8, 0.38, 0.05, "masters/wanderer-friedrich"],
  ["drew", null, 0.9, 0.34, 0.1, "prints/storm-below-fuji-hokusai"], ["liv", "NITE", 0.75, 0.32, 0.05, "prints/ejiri-hokusai"],
  ["ike", "PIT", 0.85, 0.3, 0.0, "cars/aston-front"], ["gus", "OLY", 0.8, 0.28, 0.05, "masters/colossus-goya"],
  ["zoe", "PIT", 0.7, 0.25, 0.0, "cars/ferrari-wheel"], ["ren", null, 0.75, 0.22, 0.0, "prints/kirifuri-waterfall-hokusai"],
];
// Each trader's face is their own picture, small
const avatarOf = (h) => {
  const p = PEOPLE.find((x) => x[0] === h);
  return p ? `${B}art/${p[5]}-160.webp` : null;
};
export const crewOf = (h) => PEOPLE.find((p) => p[0] === h)?.[1] ?? null;
// Member numbers; every fifth trader keeps theirs hidden, as anyone can
const noOf = (h) => { const i = PEOPLE.findIndex((p) => p[0] === h); return i < 0 || i % 5 === 3 ? null : 14 + i * 9; };

const TODAY = "2026-10-27";
const DAYS = weekdaysBetween("2026-08-03", TODAY);
const REASONS = ["loss", "plan", "plan", "trades", "streak"];
const r2 = (n) => Math.round(n * 100) / 100;

export const TRADERS = PEOPLE.map(([handle, crew, active, keep, meanR, cover], i) => {
  const rnd = seeded(7 + i * 131);
  const days = [];
  for (const day of DAYS) {
    if (rnd() > active) continue;
    const trades = 1 + Math.floor(rnd() * 4);
    const kept = rnd() < keep;
    const r = r2(meanR + (rnd() - 0.42) * 2.2 - (kept ? 0 : 1.3));
    const broke = kept ? [] : [REASONS[Math.floor(rnd() * REASONS.length)]];
    days.push({ day, trades, r: Math.min(r, trades * 3), broke, kept });
  }
  return { handle, crew, avatar: avatarOf(handle), no: noOf(handle), cover, days };
});

/* ---------- Crews ---------- */
export const CREW_MEMBERS = { OLY: 312, NITE: 128, PIT: 74 };

/* ---------- The feed ---------- */
// Everything below is made up for the demo. pnl and stage are the sample's own: a live post's trade has neither.
const card = (sym, side, setup, r, kept, of, src, via, pnl = null, stage = null) => ({ sym, side, setup, r, kept, of, plan: kept === of, src, via, pnl, stage });
const person = (h) => ({ handle: h, avatar: avatarOf(h), crew: crewOf(h), no: noOf(h) });
const day = (title, money, stage, verified = false) => ({ kind: "day", title, when: "27 Oct", money, fallback: title, stage, verified });

export const POSTS = [
  { id: "s0", team: true, pinned: true, kind: "post", ago: "Pinned",
    body: "Welcome to the Floor. Post what happened today, the money and the mess. No signals, no calls, nothing for sale." },
  { id: "s1", author: person("priya"), kind: "win", ago: "12m", likes: 48, replies: 3,
    body: "Waited for the five-minute close above the range instead of jumping the first push. One trade, left it alone. Boring and correct.",
    picture: { path: "anime/samurai-duel", at: "50% 40%" },
    trade: card("NQ", "long", "ORB retest", 2.4, 4, 4, "import", "topstepx", 1240, "funded") },
  { id: "s8", author: person("ava"), kind: "lesson", ago: "26m", likes: 37, replies: 2,
    body: "Gave back the whole morning in the last twenty minutes. Saw the size on the screen and still clicked. That one hurt.",
    trade: card("ES", "long", "Late chase", -1.8, 2, 4, "import", "topstepx", -1385, "funded") },
  { id: "s9", author: person("kenji"), kind: "win", ago: "38m", likes: 29, replies: 2,
    body: "Two entries off the same level, then I shut the platform for the day.",
    picture: { path: "masters/jerome-writing-caravaggio", at: "50% 40%" },
    trade: card("NQ", "long", "Liquidity sweep", 1.2, 4, 4, "import", "topstepx", 590, "funded") },
  { id: "s2", anonymous: true, kind: "lesson", ago: "51m", likes: 112, replies: 1,
    body: "Three red days in a row, and every one started with a trade before I'd looked at the levels. Down more than I want to type here." },
  { id: "s-share", author: person("kenji"), kind: "lesson", ago: "1h", likes: 31, replies: 0, share: "sh-kenji",
    body: "Wrote this up from Brad Goh's FVG episode. The failed-gap line changed how I read trend days." },
  { id: "s-c1", author: person("priya"), kind: "win", ago: "1h", likes: 64, replies: 0,
    body: "Day 64 closed.",
    flex: { card: day("Day 64", 2310, "funded"), finish: "carbon", picture: "masters/pale-horse-dore" } },
  { id: "s10", author: person("theo"), kind: "win", ago: "1h", likes: 21, replies: 1,
    body: "First payout day of the year. Small, but it's real money and it left the account.",
    picture: { path: "masters/sower-millet", at: "50% 45%" },
    trade: card("AAPL", "long", "Earnings gap", 1.3, 4, 4, "import", "ibkr-flex", 515, "live") },
  { id: "s3", author: person("ava"), kind: "question", ago: "2h", likes: 9, replies: 1,
    body: "On Topstep, does anyone size down after two losses instead of stopping? Does it save you money, or does it just feel better?" },
  { id: "s4", author: person("marcus.r"), kind: "lesson", ago: "2h", likes: 31, replies: 0,
    body: "Full stop-out on ES, exactly where I said it would be. Posting it because this is the part nobody posts.",
    trade: card("ES", "short", "VWAP reject", -1, 4, 4, "import", "tradovate-performance", -640, "live") },
  { id: "s5", author: person("dante"), kind: "win", ago: "3h", likes: 27, replies: 0,
    body: "First week since September without a revenge trade on NQ. Every one of them came after 11am.",
    flex: { card: day("Day 31", 1675, "funded"), finish: "black", picture: "cars/ferrari-black" } },
  { id: "s11", author: person("mira.k"), kind: "win", ago: "3h", likes: 44, replies: 0,
    body: "London open, two trades, flat by the time New York sat down.",
    picture: { path: "prints/great-wave-hokusai", at: "50% 55%" },
    trade: card("EURUSD", "short", "London sweep", 1.9, 4, 4, "import", "ibkr-flex", 1962, "live") },
  { id: "s6", anonymous: true, kind: "question", ago: "4h", likes: 14, replies: 0,
    body: "How do you stop checking P&L mid-trade? I hide the column and still find a way to see it." },
  { id: "s12", author: person("rex"), kind: "lesson", ago: "4h", likes: 19, replies: 0,
    body: "Evaluation account, so simulated, but I still felt that one in my stomach.",
    trade: card("CL", "short", "Inventory fade", -1.2, 3, 4, "import", "topstepx", -870, "eval") },
  { id: "s7", author: person("kenji"), kind: "lesson", ago: "5h", likes: 22, replies: 0,
    body: "Took the A+ setup at half size because yesterday was red. Wrong lesson from the right day. Left money on the table.",
    trade: card("MNQ", "long", "Liquidity sweep", 1.6, 3, 4, "import", "topstepx", 412, "funded") },
  { id: "s13", author: person("noor"), kind: "win", ago: "5h", likes: 33, replies: 1,
    body: "Green day number six this month. Still counting them on one hand and a bit.",
    picture: { path: "anime/moon-reflection", at: "50% 40%" },
    trade: card("MES", "long", "Pullback", 1.4, 4, 4, "import", "topstepx", 735, "funded") },
  { id: "s14", author: person("felix"), kind: "question", ago: "6h", likes: 16, replies: 2,
    body: "What do you do with a payout: leave it, take it all, or split it? Asking for the version of me who always leaves it in." },
  { id: "s15", author: person("juno"), kind: "lesson", ago: "6h", likes: 26, replies: 0,
    body: "Walked away after the second loss for once. It still cost me, but it cost me less.",
    trade: card("NQ", "short", "Failed breakout", -0.9, 4, 4, "import", "topstepx", -445, "funded") },
  { id: "s16", author: person("hal.t"), kind: "win", ago: "7h", likes: 18, replies: 0,
    body: "Gold did the thing I waited all week for.",
    picture: { path: "masters/charging-chasseur-gericault", at: "50% 30%" },
    trade: card("GC", "long", "Range break", 1.7, 4, 4, "manual", null, 980, "live") },
  { id: "s17", author: person("sol"), kind: "win", ago: "8h", likes: 12, replies: 0,
    body: "Quiet one on the funded account. I'll take a quiet one.",
    trade: card("NQ", "long", "Open drive", 0.7, 4, 4, "import", "topstepx", 365, "funded") },
];
export const REPLIES = {
  s1: [{ id: "s1a", author: person("kenji"), ago: "9m", body: "The not-jumping part is the whole thing." },
    { id: "s1b", author: person("leo"), ago: "7m", body: "Same setup, same wait. Mine stopped out for $310, but it was the right trade." },
    { id: "s1c", author: person("wren"), ago: "3m", body: "Boring pays the same as exciting. Sometimes." }],
  s8: [{ id: "s8a", author: person("noor"), ago: "20m", body: "Been there this week. Close the platform before the last hour." },
    { id: "s8b", author: person("marcus.r"), ago: "11m", body: "Thanks for posting the bad one." }],
  s9: [{ id: "s9a", author: person("priya"), ago: "30m", body: "Shutting it after is the hard part." },
    { id: "s9b", author: person("rex"), ago: "22m", body: "Had the same level marked. Missed the second entry." }],
  s2: [{ id: "s2a", anonymous: true, ago: "40m", body: "Same. Levels first, platform second." }],
  s3: [{ id: "s3a", author: person("noor"), ago: "1h", body: "I stop. Sizing down kept me in the chair, and the chair was the problem." }],
  s10: [{ id: "s10a", author: person("ines"), ago: "1h", body: "Money that leaves the account counts double." }],
  s13: [{ id: "s13a", author: person("yuki"), ago: "4h", body: "Six is six." }],
  s14: [{ id: "s14a", author: person("bram"), ago: "5h", body: "I split it. Half out, half stays." },
    { id: "s14b", author: person("cato"), ago: "5h", body: "All out. I've never regretted money I took." }],
};

/* ---------- Chat ---------- */
const msg = (id, h, time, body, extra = {}) => ({ id, author: person(h), crew: crewOf(h), time, body, ...extra });
export const ROOMS = {
  general: [
    msg("g1", "kenji", "13:31", "Anyone else flat into CPI tomorrow? Not touching anything after 2pm."),
    msg("g2", "priya", "13:33", "Same. Banked $1,240 this morning and I'd like to keep it."),
    msg("g3", "dante", "13:36", "Took one ES short at the open, down $610, done for the day. Stopping at 10am feels strange.",
      { trade: card("ES", "short", "Opening drive", -1, 4, 4, "import", "topstepx", -610, "funded") }),
    msg("g4", "marcus.r", "13:40", "That's the job. The stop did its thing.", { replyTo: "g3" }),
    { id: "g5", team: true, time: "13:45", body: "Every trade on the Floor says where it came from: imported from a file, or typed in by hand." },
    msg("g6", "ava", "13:48", "Does anyone journal the trades they didn't take? Starting to think that's where my money is."),
    msg("g7", "theo", "13:50", "I log them as skipped with a screenshot. Half my best days are mostly skipped trades."),
    msg("g8", "leo", "13:51", "The skipped list is underrated."),
    msg("g9", "leo", "13:51", "Mine showed I skip the A+ setups and take the C ones. Fun discovery."),
  ],
  OLY: [
    msg("o1", "mira.k", "13:12", "Up $1,962 on the day and I'm done. We're close behind Night Shift on the crew table."),
    msg("o2", "cato", "13:20", "Every closed day counts the same. Nobody needs a hero trade today."),
    msg("o3", "marcus.r", "13:41", "Done for the day, down $640. See you after CPI."),
  ],
  NITE: [msg("n1", "priya", "12:58", "Quiet session. Two trades, both to plan.")],
  PIT: [msg("p1", "kenji", "13:05", "Pit stop at 11:30, as always.")],
  // The topic rooms
  futures: [
    msg("f1", "kenji", "12:41", "Anyone else trade the first hour only? My numbers after 10:30 are a mess."),
    msg("f2", "rex", "12:47", "Same in my journal. Afternoon trades were most of my losing days last month, so they're gone.", { replyTo: "f1" }),
    msg("f3", "wren", "13:02", "Micros while I build the habit. Back to minis after a month of clean days."),
    msg("f4", "ava", "13:26", "Small one. Staying on micros until the week is done.",
      { trade: card("MES", "long", "Pullback", 1.2, 4, 4, "import", "topstepx", 315, "funded") }),
  ],
  forex: [
    msg("x1", "mira.k", "11:58", "London open is my whole day. By the time New York starts I'm flat and journaling."),
    msg("x2", "noor", "12:20", "Does anyone else skip the hour around CPI on the dollar pairs?"),
    msg("x3", "dante", "12:24", "Always. The spreads alone make it a different market.", { replyTo: "x2" }),
  ],
  stocks: [
    msg("t1", "theo", "12:15", "Earnings week. Nothing held through a report, not for any money."),
    msg("t2", "sol", "12:31", "Same. I mark the dates on Sunday so the week has no surprises."),
  ],
  props: [
    msg("r1", "felix", "12:05", "Second evaluation this year. This time the daily loss limit is in my journal, not in my head."),
    msg("r2", "ines", "12:18", "Read the trailing drawdown terms twice before you start. Most of the fails I hear about are that one line."),
    msg("r3", "bram", "12:40", "Payouts took four days this time. Anyone quicker?"),
  ],
  psych: [
    msg("y1", "juno", "12:52", "Took a loss and wanted it back straight away. Walked away for twenty minutes instead. Small win."),
    msg("y2", "leo", "12:55", "The walk is the trade.", { replyTo: "y1" }),
  ],
  wins: [
    msg("w1", "bram", "12:36", "Red day, done early. I'll take that over a lucky green one.",
      { trade: card("NQ", "short", "Failed breakout", -1, 4, 4, "import", "topstepx", -520, "funded") }),
    msg("w2", "ava", "13:12", "Green today, two trades. Red yesterday because I moved my stop. Posting both."),
  ],
  help: [
    msg("h1", "yuki", "12:09", "How do I attach a trade to a message in here?"),
    msg("h2", "kenji", "12:11", "The chart button left of the message box. Pick the trade and it goes in with its source.", { replyTo: "h1" }),
  ],
};
// A message that arrives while you watch General
export const LATE = msg("g10", "noor", "13:52", "Same here. My skipped list is longer than my trade list this week, and my account is happier for it.");
export const HERE = { general: 38, OLY: 11, NITE: 7, PIT: 5, futures: 14, forex: 6, stocks: 5, props: 9, psych: 4, wins: 7, help: 3 };
export const NEW = { futures: 2, props: 1 };

const dm = (id, from, day, time, body, extra = {}) => ({ id, from, day, time, body, ...extra });
const L2 = (m, text, key = false) => ({ t: m == null ? null : m.split(":").reduce((a, x) => a * 60 + +x, 0), text, key });
export const DMS = {
  threads: [
    { id: "d-kenji", with: "kenji", at: "13:40", accepted: "You accepted kenji's request on Tuesday 21 October.", messages: [
      dm("k1", "kenji", "Tue 21 Oct", "09:12", "Saw your post about the 9:45 fake-out. Same thing kept catching me."),
      dm("k2", null, "Tue 21 Oct", "09:20", "Nothing before 9:50 is on my plan now. Two weeks clean."),
      dm("k3", "kenji", "Yesterday", "16:02", "This is the page I mentioned. Stacked gaps, from the Brad Goh episode.", { card: { type: "page", share: "sh-kenji" } }),
      dm("k4", null, "Yesterday", "16:10", "The failed gap line is the one. Saving a copy."),
      dm("k5", "kenji", "Today", "13:31", "Took it this morning. Waited for the shift.", { card: { type: "trade", ...card("NQ", "long", "15m gap entry", 2.1, 4, 4, "import", "topstepx", 1120, "funded") } }),
      dm("k6", "kenji", "Today", "13:35", "The lesson's here if you want the whole thing: https://www.youtube.com/watch?v=9P-u7MWosFo"),
      dm("k7", null, "Today", "13:40", "Clean. Same entry I missed on Friday."),
    ] },
    { id: "d-jules", with: "jules", at: "10:04", unread: 1, messages: [
      dm("y1", "jules", "Today", "10:02", "Hi, it's Jules from Marble. Your free year from the October draw is on your account now."),
      dm("y2", "jules", "Today", "10:03", "There's nothing to claim and nothing to pay. A prize never needs your card."),
      dm("y3", "jules", "Today", "10:04", "If anyone else messages you about a prize, report them from the message and we'll deal with it."),
    ] },
    { id: "d-ava", with: "ava", at: "Yesterday", accepted: "ava accepted your request on Monday 19 October.", messages: [
      dm("a1", null, "Yesterday", "15:20", "Do you still size down after two losses?"),
      dm("a2", "ava", "Yesterday", "15:31", "Stopped doing it. I stop instead. Sizing down just kept me in the chair."),
      dm("a3", null, "Yesterday", "15:33", "The chair is always the problem."),
      dm("a4", "ava", "Yesterday", "15:34", "Ha, every single time."),
    ] },
    { id: "d-marcus", with: "marcus.r", at: "Mon", messages: [
      dm("m1", "marcus.r", "Mon 26 Oct", "18:05", "Crew room at 9? Going through the week."),
    ] },
    { id: "d-leo", with: "leo", at: "19 Oct", messages: [
      dm("l1", null, "Mon 19 Oct", "17:40", "Sent you the page on skipped trades."),
      dm("l2", "leo", "Mon 19 Oct", "18:12", "Thanks for the page, the key lessons helped."),
    ] },
  ],
  requests: [
    { id: "r-jay", with: "fx.mentor.jay", at: "11:20", meta: "Joined 2 days ago", messages: [
      dm("j1", "fx.mentor.jay", "Today", "11:20", "Congrats! You won the October giveaway. Jules asked me to collect your card details so the payout can go out today. Fill in the form here: marble-payouts.co/claim"),
    ] },
    { id: "r-juno", with: "juno", at: "09:05", meta: "Joined August", messages: [
      dm("u1", "juno", "Today", "09:05", "Hi! Saw your post about the 9:45 fake-out. I wrote a page on it in Study, want it?", { card: { type: "page", share: "sh-juno" } }),
    ] },
    { id: "r-sol", with: "sol", at: "Yesterday", meta: "Joined September", messages: [
      dm("o1", "sol", "Yesterday", "19:48", "Are you trading the NY open tomorrow? Thinking of a crew-room watch for CPI."),
    ] },
  ],
  staff: ["jules"],
  shares: {
    "sh-kenji": { owner: "kenji", audience: "community", whole: true, since: "Mon 27 Oct", copies: true, notebook: { title: "Price action", cover: "masters/narcissus-caravaggio" }, pages: [
      { title: "Fair value gaps, first look", date: "20 Oct", video: { id: "ZVUDpCyvxfQ", title: "Understanding Fair Value Gaps", channel: "TTrades", len: 596 }, lines: [
        L2("0:31", "Three candles. The gap is wick 1 to wick 3."), L2("1:12", "Only counts with displacement."), L2("2:40", "Midpoint first, then the far edge.", true),
        L2("4:05", "15m gaps matter more than 1m."), L2(null, "Mark them before the open."),
      ] },
      { title: "Stacked gaps", date: "27 Oct", video: { id: "9P-u7MWosFo", title: "Market Mechanics Ep 9: Fair Value Gaps", channel: "Brad Goh", len: 1863 }, lines: [
        L2("26:10", "Gaps in a row = strong trend."), L2("27:05", "Defend the last gap in the stack."), L2("27:50", "If the last gap fails, trend's done."),
        L2("28:40", "A failed gap is a signal. Flip bias.", true), L2("29:30", "Inversion: support turns resistance."), L2("30:15", "First touch of the inversion is the entry."),
        L2("31:02", "Stop beyond the failed gap's first candle."), L2(null, "Checked 10 days: 7 of 10 held.", true),
      ] },
      { title: "Took it today", date: "27 Oct", video: { id: "9P-u7MWosFo", title: "Market Mechanics Ep 9: Fair Value Gaps", channel: "Brad Goh", len: 1863 }, lines: [
        L2("28:40", "Waited for the failed gap. It came at 10:12."), L2(null, "Entry on the first touch, stop past the candle."), L2(null, "Out at $1,120. No second trade.", true),
      ] },
    ] },
    "sh-juno": { owner: "juno", audience: "members", whole: false, since: "Today", copies: true, notebook: { title: "Opening range", cover: "prints/kajikazawa-hokusai" }, n: 4, pages: [
      { title: "The 9:45 fake-out", date: "Today", video: null, lines: [
        L2(null, "First push at 9:45 fails 6 days in 10."), L2(null, "Wait for the five-minute close back inside.", true), L2(null, "No trades before 9:50."),
      ] },
    ] },
  },
};

export const ME = { crew: "OLY", optedIn: true, changedAt: "2026-09-14T09:00:00Z" };

export const COMMUNITY = { TRADERS, CREW_MEMBERS, POSTS, REPLIES, ROOMS, LATE, HERE, NEW, ME, TODAY, CREW_TAGS, addDays, DMS };
