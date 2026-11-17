const H = 3600e3, D = 24 * H;
const now = Date.now();
const at = (ms) => new Date(now - ms).toISOString();
const ahead = (ms) => new Date(now + ms).toISOString();
const dayOnly = (ms) => new Date(now + ms).toISOString().slice(0, 10);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const people = [
  ["nadia.k", "Nadia Kerr", "nadia.kerr@example.com", 41 * D, 2 * H],
  ["mo_trades", "Mo Rahman", "mo@example.com", 63 * D, 20 * 60e3],
  ["elle.futures", "Elle Okafor", "elle.o@example.com", 88 * D, 3 * D],
  ["dan_es", "Dan Ellis", "dan.ellis@example.com", 2 * D, 5 * H],
  ["kenji.nq", "Kenji Sato", "kenji@example.com", 19 * D, 1 * D],
  ["sam.r", "Sam Reid", "sam.reid@example.com", 120 * D, 6 * D],
  ["priya_fx", "Priya Shah", "priya.s@example.com", 74 * D, 11 * D],
  ["tom.ym", "Tom Whitfield", "tom.w@example.com", 1 * D, 1 * D],
].map(([handle, name, email, joined, seen], i) => ({ id: id(i + 1), handle, name, email, joined: at(joined), last_seen: at(seen),
  no: [612, 503, 377, 1236, 921, 214, 448, 1240][i], show_number: handle !== "tom.ym" }));

// The Floor, ideas, crashes and costs: all invented for the preview
let floorPosts = [
  { id: id(801), kind: "post", body: "Welcome to the Floor, everyone.\n\nI'm Jules. I built Marble and I run it.", created_at: at(3 * H), pinned_at: at(2 * H), hidden: false, anonymous: false, handle: "jules", replies: 4, likes: 12 },
  { id: id(802), kind: "win", body: "Waited for the close above the range. One trade, left it alone.", created_at: at(5 * H), pinned_at: null, hidden: false, anonymous: false, handle: "nadia.k", replies: 1, likes: 6 },
  { id: id(803), kind: "lesson", body: "Gave back the morning in the last twenty minutes.", created_at: at(1 * D), pinned_at: null, hidden: false, anonymous: true, handle: null, replies: 0, likes: 3 },
  { id: id(804), kind: "question", body: "How do you all set your daily stop?", created_at: at(2 * D), pinned_at: null, hidden: true, anonymous: false, handle: "dan_es", replies: 2, likes: 0 },
];
let ideas = [
  { id: id(811), title: "Import from Tradovate", body: "A file export would do.", area: "Journal", status: "Under review", created_at: at(6 * H), handle: "mo_trades", votes: 9 },
  { id: id(812), title: "Weekly totals on Stats", body: "", area: "Stats", status: "Planned", created_at: at(3 * D), handle: "kenji.nq", votes: 4 },
  { id: id(813), title: "Share a card to Instagram stories", body: "The right size for a story.", area: "Cards", status: "Shipped", created_at: at(9 * D), handle: "priya_fx", votes: 2 },
];
const crashes = [
  { fingerprint: "a1b2c3d4e5f60718", n: 3, people: 2, first: at(30 * H), last: at(5 * H), message: "TypeError: Cannot read properties of undefined (reading 'net')", kind: "view", view: "stats", path: "/desk/", stack: "at Stats (stats.js:41)\nat renderWithHooks", builds: ["2026-11-07 09:12"], devices: ["phone"], browsers: ["Safari 18"] },
  { fingerprint: "0f1e2d3c4b5a6978", n: 1, people: 1, first: at(4 * D), last: at(4 * D), message: "ReferenceError: setDrawer is not defined", kind: "window", view: "dashboard", path: "/desk/", stack: null, builds: ["2026-11-04 21:52"], devices: ["desktop"], browsers: ["Chrome 141"] },
];
let costs = [
  { id: id(701), name: "Supabase Pro", pence: 2000, every: "month", since: dayOnly(-40 * D), until: null, note: null },
  { id: id(702), name: "trademarble.app", pence: 1299, every: "year", since: dayOnly(-60 * D), until: null, note: "Domain" },
];

let competitions = [{
  id: id(201), slug: "the-discipline-cup-1", title: "The Discipline Cup", tagline: "Ten days. Your rules. Kept.", blurb: "Synced trades only. Keep the cup's rules every day you trade; broken days cost 2R.",
  art: "masters/sower-millet", status: "open", starts_on: dayOnly(5 * D), ends_on: dayOnly(19 * D), entry_closes_at: ahead(4 * D), results_at: null,
  limits: { max_trade_loss_pct: 1, daily_loss_pct: 2, max_trades: 4, stop_after: 2 }, scoring: { broken_day_r: 2, min_days: 10 },
  prizes: [{ place: "1st", title: "£250", detail: "Paid by bank transfer within 14 days of the result" }, { place: "2nd", title: "£100", detail: "" }, { place: "3rd", title: "£50", detail: "" }],
  summary: ["Synced Topstep or IBKR trades only", "1% most on a trade, 2% most in a day, 4 trades a day", "Score: R on kept days, minus 2R for each broken day"],
  rules: [["Who can enter", "Anyone 18 or over with a Marble account and a synced Topstep or Interactive Brokers account."], ["How it's scored", "Each trade's R is capped at +3R. A day you break a rule scores −2R."]],
  rules_version: "1.0", rules_published_at: at(2 * D), checks: [], created_at: at(9 * D), updated_at: at(2 * D), entrants: 37, disqualified: 1,
}, {
  id: id(202), slug: "november-cup", title: "November Cup", tagline: null, blurb: null, art: null, status: "draft",
  starts_on: dayOnly(30 * D), ends_on: dayOnly(44 * D), entry_closes_at: ahead(29 * D), results_at: null,
  limits: { max_trade_loss_pct: 1, daily_loss_pct: 2, max_trades: 4, stop_after: 2 }, scoring: { broken_day_r: 2, min_days: 10 },
  prizes: [], summary: [], rules: [], rules_version: "1.0", rules_published_at: null, checks: [], created_at: at(1 * D), updated_at: at(1 * D), entrants: 0, disqualified: 0,
}];
let giveaways = [{
  id: id(301), slug: "october-draw", title: "The October draw", tagline: "One book, one winner", blurb: "Free to enter. One entry each.",
  art: "anime/samurai-duel", status: "drawn", opens_at: at(30 * D), closes_at: at(8 * D), draw_at: at(7 * D), claim_days: 14, winners_count: 1,
  prize: [{ title: "A trading book", detail: "Sent by post within 14 days" }], summary: ["Free, no purchase necessary", "One entry per person"],
  rules: [["Who can enter", "Anyone 18 or over. One entry per person."]], rules_version: "1.0", rules_published_at: at(30 * D),
  seed_hash: "9f2c1b7e04d5a8c3b6e1f0a9d2c4b7e8f1a3c5d7e9b0a2c4d6e8f0a1b3c5d7e9", sealed_at: at(31 * D), created_at: at(32 * D), updated_at: at(7 * D),
  entries: 412, valid: 409, winners: 1, draws: 1,
}];

let reports = [
  { kind: "post", id: id(401), count: 3, first: at(5 * H), last: at(40 * 60e3), reports: [{ reason: "Selling signals in the replies", by: "nadia.k", at: at(5 * H) }, { reason: "Spam", by: "mo_trades", at: at(2 * H) }, { reason: "Asks people to DM for a 'VIP group'", by: "elle.futures", at: at(40 * 60e3) }],
    post: { body: "Up 14% this week on NQ. My VIP group is open for 5 more people, DM me for the link 🔥", kind: "win", anonymous: true, hidden: false, at: at(6 * H), crew: null, reply: false, image: false, trade: true, author: { id: id(9), handle: "quick_pips_99", joined: at(3 * D) } } },
  { kind: "chat", id: id(402), count: 1, first: at(26 * H), last: at(26 * H), reports: [{ reason: "Rude to a new trader", by: "kenji.nq", at: at(26 * H) }],
    chat: { body: "if you can't size a trade you shouldn't be here mate", room: "general", hidden: false, at: at(27 * H), author: { id: people[5].id, handle: "sam.r", joined: at(120 * D) } } },
];
let decided = [
  { kind: "post", id: id(403), count: 1, first: at(4 * D), last: at(4 * D), resolved_at: at(3 * D), resolution: "hidden", reports: [{ reason: "Off topic", by: "dan_es", at: at(4 * D) }],
    post: { body: "Anyone selling a used monitor?", kind: "question", anonymous: false, hidden: true, at: at(4 * D), crew: "OLY", reply: false, author: { id: people[7].id, handle: "tom.ym", joined: at(1 * D) } } },
];

let bugs = [
  { id: id(701), user_id: people[1].id, handle: "mo_trades", message: "The calendar skips a day when I import from Topstep late at night", steps: "Import after 11pm UK, open Journal", context: { screen: "journal", viewport: "390x844", build: "2026-10-29 21:40", browser: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", errors: [] }, screenshot_path: null, status: "new", created_at: at(3 * H) },
  { id: id(702), user_id: people[0].id, handle: "nadia.k", message: "Flex card export cuts off the last digit", steps: "", context: { screen: "showcase", viewport: "1440x900", build: "2026-10-29 21:40", browser: "Chrome 141 on Windows", errors: [{ kind: "error", text: "Failed to load font", at: at(26 * H) }] }, screenshot_path: null, status: "seen", created_at: at(26 * H) },
];
let log = [
  { id: 3, at: at(2 * D), action: "competition.create", target_type: "competition", target_id: id(201), detail: {}, by: "jules" },
  { id: 2, at: at(7 * D), action: "giveaway.draw", target_type: "giveaway", target_id: id(301), detail: { picks: [217] }, by: "jules" },
  { id: 1, at: at(31 * D), action: "giveaway.seal", target_type: "giveaway", target_id: id(301), detail: {}, by: "jules" },
];
const note = (action, target_type, target_id, detail = {}) => log.unshift({ id: (log[0]?.id || 0) + 1, at: new Date().toISOString(), action, target_type, target_id, detail, by: "jules" });

// ---------- Users ----------
const today = new Date(now).toISOString().slice(0, 10);
const dayAgo = (n) => new Date(now - n * D).toISOString().slice(0, 10);
const series = (f) => Array.from({ length: 30 }, (_, i) => f(29 - i)).map((x, i) => ({ day: dayAgo(29 - i), ...x }));
const extra = {
  [people[0].id]: { last_active: today, trades: 412, heard_from: "instagram" },
  [people[1].id]: { last_active: dayAgo(1), trades: 268, heard_from: "friend" },
  [people[2].id]: { last_active: dayAgo(3), trades: 951, heard_from: "youtube" },
  [people[3].id]: { last_active: today, trades: 12, heard_from: "friend" },
  [people[4].id]: { last_active: dayAgo(6), trades: 77, heard_from: "x" },
  [people[5].id]: { last_active: dayAgo(18), trades: 133, heard_from: "reddit" },
  [people[6].id]: { last_active: dayAgo(25), trades: 41, heard_from: "friend" },
  [people[7].id]: { last_active: null, trades: 0, heard_from: null },
};
const userRow = (p) => ({ id: p.id, no: p.no, handle: p.handle, name: p.name, email: p.email, avatar: null, joined: p.joined, last_sign_in: p.last_seen, ...extra[p.id] });
const keep = {
  all: () => true,
  active: (p) => extra[p.id].last_active && extra[p.id].last_active > dayAgo(7),
  quiet: (p) => !extra[p.id].last_active || extra[p.id].last_active <= dayAgo(14),
};

const fail = (message) => { const e = new Error(message); e.code = "P0001"; throw e; };
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 180));

export function who() {
  const p = new URLSearchParams(location.search).get("preview");
  if (p === "out") return { state: "out" };
  if (p === "trader") return { state: "trader", email: "tom.w@example.com" };
  if (p === "two-step") return { state: "two-step", email: "owner@example.com" };
  return { state: "in", email: "owner@example.com", id: id(0) };
}

export async function answer(name, a = {}) {
  switch (name) {
    case "admin_overview": return wait({
      at: new Date().toISOString(), traders: 1240,
      signups: { week: 71, prev: 58, weeks: [22, 31, 28, 35, 41, 38, 44, 52, 49, 55, 61, 58, 71] },
      needs: { reports: reports.length, dm_reports: 1, bugs: bugs.filter((b) => b.status === "new").length, syncs: 0, cron_failed: 1, csp_day: 3, crashes: 1, ideas: ideas.filter((x) => x.status === "Under review").length },
    });
    case "admin_trader": {
      const p = people.find((x) => x.id === a.p_user) || fail("No such trader");
      return wait({
        id: p.id, no: p.no, show_number: p.show_number, handle: p.handle, name: p.name, avatar: null, joined: p.joined, email: p.email, email_confirmed: true, last_seen: p.last_seen,
        providers: ["google"], heard_from: "instagram", news: true, crew: "OLY", staff: false, admin: false,
        last_active: extra[p.id].last_active, active_30: extra[p.id].last_active ? 14 : 0,
        journal: { trades: 412, synced: 380, accounts: 2, imports: 3 },
        connections: [{ platform: "topstepx", status: p.handle === "sam.r" ? "error" : "ok", last_synced: at(2 * H), error: p.handle === "sam.r" ? "401 from TopstepX: the API key was revoked" : null }],
        community: { posts: 38, hidden: 0, chat_30d: 112, reported: 0, reports_made: 1, dm_paused_until: null },
        events: { competitions: 1, giveaways: 2 },
      });
    }
    case "admin_events": return wait({ competitions, giveaways });
    case "admin_competition_save": {
      if (a.p_id) { competitions = competitions.map((c) => (c.id === a.p_id ? { ...c, ...a.p } : c)); note("competition.edit", "competition", a.p_id); return wait(a.p_id); }
      const c = { id: id(200 + competitions.length + 1), status: "draft", entrants: 0, disqualified: 0, checks: [], created_at: new Date().toISOString(), ...a.p };
      competitions = [c, ...competitions]; note("competition.create", "competition", c.id); return wait(c.id);
    }
    case "admin_competition_status": competitions = competitions.map((c) => (c.id === a.p_id ? { ...c, status: a.p_status } : c)); note("competition.status", "competition", a.p_id); return wait(null);
    case "admin_competition_delete": competitions = competitions.filter((c) => c.id !== a.p_id); note("competition.delete", "competition", a.p_id); return wait(null);
    case "admin_giveaway_delete": giveaways = giveaways.filter((g) => g.id !== a.p_id); note("giveaway.delete", "giveaway", a.p_id); return wait(null);
    case "admin_competition_finalise": competitions = competitions.map((c) => (c.id === a.p_id ? { ...c, status: "final" } : c)); note("competition.finalise", "competition", a.p_id); return wait(12);
    case "admin_competition_entries": return wait({
      entries: people.slice(0, 5).map((p, i) => ({ user_id: p.id, handle: p.handle, email: p.email, status: i === 3 ? "disqualified" : "entered", dq_reason: i === 3 ? "Two accounts entered from one person" : null, account_size: 50000, broker: "topstepx", rules_version: "1.0", accepted_at: at((10 - i) * D) })),
      rows: [],
    });
    case "admin_competition_entry": note(`competition.${a.p_action}`, "competition", a.p_id); return wait(null);
    case "admin_giveaway_save": {
      if (a.p_id) { giveaways = giveaways.map((g) => (g.id === a.p_id ? { ...g, ...a.p } : g)); note("giveaway.edit", "giveaway", a.p_id); return wait(a.p_id); }
      const g = { id: id(300 + giveaways.length + 1), status: "draft", entries: 0, valid: 0, winners: 0, draws: 0, seed_hash: null, created_at: new Date().toISOString(), ...a.p };
      giveaways = [g, ...giveaways]; note("giveaway.create", "giveaway", g.id); return wait(g.id);
    }
    case "admin_giveaway_seal": giveaways = giveaways.map((g) => (g.id === a.p_id ? { ...g, seed_hash: "4b1e9c0d7a2f5e8b3c6d9a0f1e4b7c2d5a8e1f3b6c9d2e5a7f0b3c6d9e2a5f8b", sealed_at: new Date().toISOString() } : g)); note("giveaway.seal", "giveaway", a.p_id); return wait("4b1e…");
    case "admin_giveaway_status": giveaways = giveaways.map((g) => (g.id === a.p_id ? { ...g, status: a.p_status } : g)); note("giveaway.status", "giveaway", a.p_id); return wait(null);
    case "admin_giveaway_draw": giveaways = giveaways.map((g) => (g.id === a.p_id ? { ...g, status: "drawn", draws: g.draws + 1, winners: g.winners + (a.p_count || g.winners_count) } : g)); note("giveaway.draw", "giveaway", a.p_id); return wait([88]);
    case "admin_giveaway_entries": return wait({
      entries: [{ entry_no: 1, route: "app", user_id: people[0].id, handle: "nadia.k", accepted_at: at(29 * D), valid: true, invalid_reason: null }, { entry_no: 2, route: "web", user_id: null, handle: null, accepted_at: at(28 * D), valid: true, invalid_reason: null }, { entry_no: 3, route: "app", user_id: people[6].id, handle: "priya_fx", accepted_at: at(20 * D), valid: false, invalid_reason: "Second account of entry 1" }],
      winners: [{ entry_no: 217, round: 1, user_id: people[2].id, handle: "elle.futures", email: "elle.o@example.com", claim_status: "claimed", claim_by: ahead(7 * D), claimed_at: at(5 * D), reason: null, show_handle: true }],
      draws: [{ round: 1, drawn_at: at(7 * D), count: 409, list_hash: "c0ffee5e2a9b4d7f1e3c6a8b0d2f4e6a8c0b2d4f6e8a0c2b4d6f8e0a2c4b6d8f", picks: [217] }],
    });
    case "admin_giveaway_entry": note(a.p_valid ? "giveaway.entry_valid" : "giveaway.entry_invalid", "giveaway", a.p_id); return wait(null);
    case "admin_giveaway_winner": note("giveaway.winner", "giveaway", a.p_id); return wait(null);
    case "admin_reports": return wait(a.p_open === false ? decided : reports);
    case "admin_report_resolve": {
      const card = reports.find((r) => r.id === a.p_id);
      reports = reports.filter((r) => r.id !== a.p_id);
      if (card && a.p_action !== "delete") decided = [{ ...card, resolved_at: new Date().toISOString(), resolution: a.p_action === "keep" ? "kept" : "hidden" }, ...decided];
      if (a.p_action === "unhide") decided = decided.map((r) => (r.id === a.p_id ? { ...r, post: r.post && { ...r.post, hidden: false } } : r));
      note(`report.${a.p_action}`, a.p_kind, a.p_id); return wait(null);
    }
    case "admin_health": return wait({
      at: new Date().toISOString(),
      csp: { day: 3, week: 11, top: [{ directive: "script-src-elem", blocked: "https://www.googletagmanager.com", n: 7, last: at(3 * H), page: "https://trademarble.app/pricing", source: null, sample: null, disposition: "report" }, { directive: "img-src", blocked: "data", n: 4, last: at(30 * H), page: "https://trademarble.app/desk/", source: null, sample: null, disposition: "report" }] },
      cron: [
        { name: "chat-purge", schedule: "27 3 * * *", active: true, last_status: "succeeded", last_start: at(20 * H), last_end: at(20 * H - 900), last_message: "DELETE 0", runs_24h: 1, failed_24h: 0 },
        { name: "dm-alerts", schedule: "*/15 * * * *", active: true, last_status: "failed", last_start: at(9 * 60e3), last_end: at(9 * 60e3 - 2000), last_message: "ERROR: could not connect to the edge function (timeout)", runs_24h: 96, failed_24h: 3 },
      ],
      syncs: [{ user_id: people[5].id, handle: "sam.r", platform: "topstepx", status: "error", error: "401 from TopstepX: the API key was revoked", last_synced: at(3 * D), since: at(2 * D) }],
      bugs: { new: bugs.filter((b) => b.status === "new").length, seen: bugs.filter((b) => b.status === "seen").length, week: 9 },
    });
    case "admin_bugs": return wait(a.p_all ? bugs : bugs.filter((b) => b.status !== "fixed"));
    case "admin_bug_status": bugs = bugs.map((b) => (b.id === a.p_id ? { ...b, status: a.p_status } : b)); note("bug.status", "bug_report", a.p_id); return wait(null);
    case "admin_log_list": return wait(log);
    case "dm_reports_open": return wait([]);

    case "admin_users": {
      const q = String(a.p_query || "").replace(/^@/, "").toLowerCase();
      const no = /^#?[0-9]{1,9}$/.test(q) ? +q.replace("#", "") : null;
      const kept = people.filter((p) => !q || p.no === no || [p.handle, p.email, p.name].some((x) => x.toLowerCase().includes(q))).filter(keep[a.p_filter || "all"]).map(userRow);
      const by = { joined: (x, y) => y.joined.localeCompare(x.joined), active: (x, y) => (y.last_active || "").localeCompare(x.last_active || ""), trades: (x, y) => y.trades - x.trades }[a.p_sort || "joined"];
      return wait({ total: 1240, matched: kept.length, rows: kept.sort(by).slice(a.p_offset || 0, (a.p_offset || 0) + 100) });
    }
    case "admin_activity": return wait({
      since: dayAgo(29), dau: 212, wau: 604, mau: 881,
      days: series((n) => ({ active: Math.round(170 + 40 * Math.sin(n / 2) + (29 - n) * 1.4), signups: Math.round(7 + 4 * Math.cos(n / 3) + (29 - n) * 0.15) })),
      cohorts: [0, 1, 2, 3, 4, 5, 6, 7].map((w) => ({ week: dayAgo(7 * w + 3), size: 60 - w * 4, w1: w >= 1 ? Math.round((60 - w * 4) * 0.58) : null, w2: w >= 2 ? Math.round((60 - w * 4) * 0.47) : null, w4: w >= 4 ? Math.round((60 - w * 4) * 0.39) : null })),
      heard: { instagram: 412, youtube: 280, friend: 190, x: 122, reddit: 74, tiktok: 61, google: 40, other: 22, none: 39 },
      use: { traders: 1240, with_trades: 902, trades: 48211, trades_7d: 3120, synced: 311, imported: 540, push: 266, posted_30d: 205, study: 377 },
    });
    case "admin_today": return wait({
      at: new Date().toISOString(),
      funnel: { accounts: people.length, traded: 5, closed: 3, back: 4 },
      recent: [...people].sort((x, y) => Date.parse(y.joined) - Date.parse(x.joined)).map((p, i) => ({ id: p.id, handle: p.handle, avatar: null, joined: p.joined,
        heard: ["instagram", "x", "friend", null, "google", "reddit", "youtube", "tiktok"][i], traded: i % 4 !== 0, closed: i % 3 === 1, back: i % 2 === 1,
        last_active: dayOnly(-i * D), admin: false })),
      costs: { month_pence: costs.filter((c) => !c.until).reduce((n, c) => n + (c.every === "year" ? Math.round(c.pence / 12) : c.pence), 0), items: costs.filter((c) => !c.until).length },
      emails: { welcome_7d: 2, signups_7d: 2 },
      crashes: { day: 1, week: 2 },
    });
    case "admin_floor": return wait({ posts: floorPosts, ideas });
    case "pin_post": floorPosts = floorPosts.map((p) => (p.id === a.p_id ? { ...p, pinned_at: a.p_on ? new Date().toISOString() : null } : p)); note(a.p_on ? "post.pin" : "post.unpin", "post", a.p_id); return wait(null);
    case "admin_idea_status": ideas = ideas.map((x) => (x.id === a.p_id ? { ...x, status: a.p_status } : x)); note("idea.status", "idea", a.p_id); return wait(null);
    case "admin_crashes": return wait(crashes);
    case "admin_costs": return wait(costs);
    case "admin_cost_save": {
      const c = { id: a.p_id || id(700 + costs.length), name: a.p.name, pence: a.p.pence, every: a.p.every, since: a.p.since, until: a.p.until, note: a.p.note || null };
      costs = a.p_id ? costs.map((x) => (x.id === a.p_id ? c : x)) : [...costs, c]; note(a.p_id ? "cost.edit" : "cost.add", "cost", c.id); return wait(c.id);
    }
    case "admin_cost_delete": costs = costs.filter((x) => x.id !== a.p_id); note("cost.delete", "cost", a.p_id); return wait(null);
    default: return fail(`Preview has no answer for ${name}`);
  }
}
