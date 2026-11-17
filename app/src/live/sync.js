import { supabase } from "./supabase";
import { rememberNumber } from "./numbers";
import { datedTrade, deviceBackdrop, exampleOn, getRawState, getState, loadState, onNewDay, onNewUtcDay, toast, watch } from "../store";
import { BACKDROP, backdropOf, newerBackdrop } from "../backdrop";
import { nyOf, pad } from "./time";
import { utcTodayKey, worldOf } from "../world";
import { CRYPTO_LIVE } from "../crypto/worlds";
const onlyMarkets = (q) => (CRYPTO_LIVE ? q.eq("world", "markets") : q);
import { studyChanged, studyLoad } from "../views/study/sync";
import { waitable } from "../views/study/outbox";
import { clearTrades, keepTrades, sentTrades, unsentTrades, withUnsent } from "./tradeOutbox";
import { flexOwner } from "../views/flexpics";
import { MON as SHORT } from "../lib/basics.js";
import { cleanThesis, cleanWhen } from "../lib/playbook";
import { closeOut, closesFrom, keepCloses, localCloses, mergeCloses, savedAnyway, unsent } from "../drip/closes";

let uid = null;
export const userId = () => uid;

// A playbook chapter's own words (why it works, when it's run) get columns once
// supabase/migrations-pending/20261103120000_playbook_chapters.sql is applied. Until then they stay
// on this device, by strategy, and are never sent; once the columns are there, the device's copy
// goes up the first time the app loads.
let hasChapterColumns = false;
const CHAPTER_KEY = "marble-chapters";
const deviceChapters = () => { try { return JSON.parse(localStorage.getItem(CHAPTER_KEY)) || {}; } catch { return {}; } };
function keepChapters(who, list) {
  try {
    const all = deviceChapters();
    const mine = Object.fromEntries(list.filter((s) => !s.example && (s.thesis || s.whenRun?.length)).map((s) => [s.id, { thesis: s.thesis, whenRun: s.whenRun }]));
    if (Object.keys(mine).length) all[who] = mine; else delete all[who];
    localStorage.setItem(CHAPTER_KEY, JSON.stringify(all));
  } catch {}
}
let hasBackdropColumn = false, backdropTimer = 0;
const backdropColumn = (priv) => (hasBackdropColumn = !!priv && Object.hasOwn(priv, "backdrop"));
export const ownBackdropReady = () => hasBackdropColumn;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v) => typeof v === "string" && UUID.test(v);
const num = (v) => (v === "" || v == null || Number.isNaN(+v) ? null : +v);
const todayNY = () => { const n = nyOf(); return `${n.year}-${pad(n.month + 1)}-${pad(n.day)}`; };
const shortDate = (iso) => { const d = new Date(iso); return `${SHORT[d.getMonth()]} ${d.getDate()}`; };
const when = (iso) => {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : shortDate(iso);
};
const endsLabel = (iso) => {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "Ended";
  const days = Math.ceil(ms / 864e5);
  return `Ends in ${days} day${days === 1 ? "" : "s"}`;
};
const KIND_STATUS = { Live: "live", Evaluation: "eval", Eval: "eval", Funded: "funded", Paper: "paper" };

/* ---------- Rows to the app's shapes, and back ---------- */

export const tradeIn = (r) => datedTrade({
  id: r.id, traded_at: r.traded_at, symbol: r.symbol, side: r.side, setup: r.setup || "",
  entry: r.entry ?? "", stop: r.stop ?? "", exit: r.exit ?? "", size: r.size ?? "",
  r: r.r == null ? null : +r.r, pnl: +r.pnl, grade: r.grade, emotion: r.emotion || "", followedPlan: r.followed_plan,
  kept: r.kept || [], note: r.note || "", account: r.account_id, screenshots: r.screenshots || [], mistakes: r.mistakes || [],
  source: r.source || "manual", importId: r.import_id || null, needsReview: !!r.needs_review,
  commission: r.commission == null ? null : +r.commission, closedAt: r.closed_at || null, fills: r.fills || null,
  // The crypto world's own numbers (null for a Markets trade)
  world: r.world === "crypto" ? "crypto" : "markets", leverage: r.leverage == null ? null : +r.leverage,
  funding: r.funding == null ? null : +r.funding, feeMaker: r.fee_maker == null ? null : +r.fee_maker,
  feeTaker: r.fee_taker == null ? null : +r.fee_taker, liqPrice: r.liq_price == null ? null : +r.liq_price,
  newsEvent: r.news_event || null,
});
const tradeOut = (t) => ({
  id: t.id, traded_at: t.traded_at, symbol: t.symbol, side: t.side, setup: t.setup || null,
  entry: num(t.entry), stop: num(t.stop), exit: num(t.exit), size: num(t.size),
  r: num(t.r), pnl: num(t.pnl) ?? 0, grade: t.grade || null, emotion: t.emotion || null,
  followed_plan: t.followedPlan == null ? null : !!t.followedPlan, kept: t.kept || [], note: t.note || "", account_id: isId(t.account) ? t.account : null,
  needs_review: !!t.needsReview, screenshots: t.screenshots || [], mistakes: t.mistakes || [],
  ...(CRYPTO_LIVE ? { world: worldOf(t), commission: num(t.commission), leverage: num(t.leverage), funding: num(t.funding),
    fee_maker: num(t.feeMaker), fee_taker: num(t.feeTaker), liq_price: num(t.liqPrice) } : {}),
});
export const accountIn = (r) => ({ id: r.id, name: r.name, firm: r.firm || null, label: r.label || null, kind: r.kind, status: r.status, balance: +r.balance, change: 0, color: r.color, world: r.world === "crypto" ? "crypto" : "markets", quoteCcy: r.quote_ccy || null,
  ...(r.firm_plan !== undefined ? { firmPlan: r.firm_plan || null, firmPhase: r.firm_phase || null } : {}) });
const accountOut = (a) => ({ id: a.id, name: a.name, firm: a.firm || null, label: (a.label || "").trim() || null, kind: a.kind, status: a.status || KIND_STATUS[a.kind] || "live", balance: num(a.balance) ?? 0, color: a.color || "#c8cacf", archived: !!a.archived,
  ...(CRYPTO_LIVE ? { world: worldOf(a), quote_ccy: worldOf(a) === "crypto" ? a.quoteCcy || null : null } : {}),
  ...(a.firmPlan !== undefined ? { firm_plan: a.firmPlan || null, firm_phase: a.firmPlan ? a.firmPhase || null : null } : {}) });
const strategyIn = (r) => ({ id: r.id, setup: r.setup, name: r.name || r.setup, god: r.god, img: r.img, rules: r.rules || [], thesis: cleanThesis(r.thesis), whenRun: cleanWhen(r.run_when) });
const strategyOut = (s) => ({ id: s.id, setup: s.setup, name: s.name || s.setup, god: s.god || null, img: s.img || null, rules: s.rules || [],
  ...(hasChapterColumns ? { thesis: cleanThesis(s.thesis), run_when: cleanWhen(s.whenRun) } : {}) });
// The server's words for each chapter, or this device's where the server has none; and which came
// from the device
function withChapters(list, who) {
  const mine = deviceChapters()[who] || {};
  const moved = [];
  const out = list.map((s) => {
    if (s.thesis || s.whenRun.length || !mine[s.id]) return s;
    moved.push(s.id);
    return { ...s, thesis: cleanThesis(mine[s.id].thesis), whenRun: cleanWhen(mine[s.id].whenRun) };
  });
  return [out, moved];
}
const noteIn = (r) => ({ id: r.id, title: r.title, folder: r.folder, body: r.body, video: r.video_at, when: when(r.created_at) });
const noteOut = (n) => ({ id: n.id, title: n.title, folder: n.folder, body: n.body || "", video_at: n.video || null });
const profileIn = (p) => ({ name: p.name, handle: p.handle, bio: p.bio, avatar: p.avatar_url, avatarArt: p.avatar_art, cover: p.cover || "masters/wanderer-friedrich", markets: p.markets, style: p.style, show: p.show_as,
  ...(p.show_number !== undefined ? { showNumber: p.show_number !== false } : {}) });
const profileOut = (p) => ({ name: (p.name || "").trim(), handle: p.handle, bio: (p.bio || "").trim(), avatar_url: p.avatar || null, avatar_art: p.avatarArt || null, cover: p.cover, markets: p.markets, style: p.style, show_as: p.show || "dollars",
  ...(p.showNumber !== undefined ? { show_number: !!p.showNumber } : {}) });

const rulesIn = (p) => ({ checklist: p.checklist || [], lossLimit: num(p.daily_loss_limit), maxTrades: p.max_trades ?? null, stopAfter: p.stop_after_losses ?? null });
const rulesOut = (r) => ({ checklist: (r.checklist || []).map((x) => x.trim()).filter(Boolean).slice(0, 12), daily_loss_limit: num(r.lossLimit) > 0 ? num(r.lossLimit) : null,
  max_trades: num(r.maxTrades) > 0 ? Math.round(num(r.maxTrades)) : null, stop_after_losses: num(r.stopAfter) > 0 ? Math.round(num(r.stopAfter)) : null });
const cryptoRulesIn = (c) => ({ ...rulesIn(c || {}), maxLeverage: num(c?.max_leverage), minLiqDistance: num(c?.min_liq_distance) });
const cryptoOut = (c) => ({ ...rulesOut(c.rules || {}), max_leverage: num(c.rules?.maxLeverage) > 0 ? num(c.rules.maxLeverage) : null,
  min_liq_distance: num(c.rules?.minLiqDistance) > 0 && num(c.rules.minLiqDistance) < 100 ? num(c.rules.minLiqDistance) : null,
  desk_account: isId(c.deskAccount) ? c.deskAccount : null });

const moneyIn = (r) => ({
  id: r.id, day: r.day, firm: r.firm, account: r.account_id || null, kind: r.kind, minor: +r.amount_minor, currency: r.currency, note: r.note || "", at: r.created_at,
  acct: r.acct ? { id: r.account_id, name: r.acct.name, firm: r.acct.firm, label: r.acct.label, kind: r.acct.kind, status: r.acct.status, archived: !!r.acct.archived } : null,
});
const moneyOut = (m) => ({
  id: m.id, day: m.day, firm: String(m.firm || "").trim().slice(0, 60), account_id: isId(m.account) ? m.account : null, kind: m.kind,
  amount_minor: Math.round(m.minor), currency: m.currency, note: (m.note || "").trim().slice(0, 140) || null,
});

/* ---------- Load ---------- */

async function every(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const planIn = (plan) => (plan ? { bias: plan.bias, levels: plan.levels, news: plan.news, risk: plan.risk } : { bias: "", levels: [], news: "", risk: "" });

export async function load() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  uid = user.id;
  const { data: made } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
  if (!made) await supabase.rpc("ensure_profile");
  const study = studyLoad(uid);
  const money = moneyLoad();
  const closes = closesLoad();
  const q = (p) => p.then((r) => { if (r.error) throw r.error; return r.data; });
  const [profile, priv, accounts, strategies, notes, trades, plan, ideas, ideaVotes, polls, pollVotes, counts, waitlist, admin, cryptoPlan, cryptoSet, memberNo, chapterColumns] = await Promise.all([
    q(supabase.from("profiles").select("*").eq("id", uid).single()),
    q(supabase.from("profile_private").select("*").eq("id", uid).single()),
    q(supabase.from("accounts").select("*").eq("user_id", uid).eq("archived", false).order("created_at")),
    q(supabase.from("strategies").select("*").eq("user_id", uid).order("created_at")),
    every(() => supabase.from("notes").select("*").eq("user_id", uid).order("created_at", { ascending: false }).order("id")),
    every(() => supabase.from("trades").select("*").eq("user_id", uid).order("traded_at", { ascending: false }).order("id")),
    q(onlyMarkets(supabase.from("daily_plans").select("*").eq("user_id", uid)).eq("day", todayNY()).maybeSingle()),
    q(supabase.from("ideas").select("*").order("created_at", { ascending: false }).limit(200)),
    q(supabase.from("idea_votes").select("idea_id, user_id").eq("user_id", uid)),
    q(supabase.from("polls").select("*").order("created_at", { ascending: false }).limit(50)),
    q(supabase.from("poll_votes").select("poll_id, user_id, option").eq("user_id", uid)),
    supabase.rpc("vote_counts").then((r) => r.data || {}).catch(() => ({})),
    q(supabase.from("oracle_waitlist").select("user_id").eq("user_id", uid).maybeSingle()),
    supabase.rpc("is_admin").then((r) => !!r.data).catch(() => false),
    CRYPTO_LIVE ? q(supabase.from("daily_plans").select("*").eq("user_id", uid).eq("world", "crypto").eq("day", utcTodayKey()).maybeSingle()) : null,
    CRYPTO_LIVE ? q(supabase.from("crypto_settings").select("*").eq("user_id", uid).maybeSingle()) : null,
    // Your member number (only you can read it here; others see it while you show it)
    supabase.from("members").select("no").eq("user_id", uid).maybeSingle().then((r) => (Number.isInteger(r.data?.no) ? r.data.no : null)).catch(() => null),
    // Whether the playbook's chapter columns are live yet
    supabase.from("strategies").select("thesis, run_when").limit(0).then((r) => !r.error).catch(() => false),
  ]);
  hasChapterColumns = chapterColumns;
  const [chapters, moved] = withChapters(strategies.map(strategyIn), uid);
  // Who wrote each idea and poll
  const authors = [...new Set([...ideas, ...polls].map((x) => x.user_id))];
  const handles = authors.length ? Object.fromEntries((await q(supabase.from("profiles").select("id, handle").in("id", authors))).map((p) => [p.id, p.handle])) : {};
  const myIdeaVotes = Object.fromEntries(ideaVotes.filter((v) => v.user_id === uid).map((v) => [v.idea_id, true]));
  const myPollVotes = Object.fromEntries(pollVotes.filter((v) => v.user_id === uid).map((v) => [v.poll_id, v.option]));
  const pending = withUnsent(trades, unsentTrades(uid));
  loadState({
    me: { id: uid, email: user.email, private: priv, admin },
    profile: { ...profileIn(profile), no: memberNo },
    deskAccount: priv.desk_account,
    accounts: accounts.map(accountIn),
    strategies: chapters,
    notes: notes.map(noteIn),
    logged: pending.rows.map(tradeIn).sort((a, b) => b.traded_at.localeCompare(a.traded_at)),
    plan: planIn(plan),
    planDay: todayNY(),
    rules: rulesIn(priv),
    backdrop: newerBackdrop(backdropColumn(priv) ? priv.backdrop : null, deviceBackdrop(uid)) || backdropOf(BACKDROP),
    // Today's ticks, one per item of the trader's own checklist
    checklist: plan?.checklist || [],
    crypto: { plan: planIn(cryptoPlan), planDay: utcTodayKey(), checklist: cryptoPlan?.checklist || [], rules: cryptoRulesIn(cryptoSet), deskAccount: cryptoSet?.desk_account || null },
    oracleWaitlist: !!waitlist,
    ideas: ideas.map((x) => ({ id: x.id, title: x.title, body: x.body, area: x.area, status: x.status, by: handles[x.user_id] || "trader", when: shortDate(x.created_at), at: Date.parse(x.created_at),
      votes: Math.max(0, (+counts?.ideas?.[x.id] || 0) - (myIdeaVotes[x.id] ? 1 : 0)) })),
    ideaVotes: myIdeaVotes,
    polls: polls.map((p) => ({ id: p.id, question: p.question, ends: endsLabel(p.ends_at), by: handles[p.user_id] || "trader",
      options: p.options.map((label, i) => [label, Math.max(0, (+counts?.polls?.[p.id]?.[i] || 0) - (myPollVotes[p.id] === i ? 1 : 0))]) })),
    pollVotes: myPollVotes,
    ...(await study),
    money: await money,
    closes: await closes,
  });
  sendUnsentCloses();
  if (pending.overtaken.length) {
    sentTrades(uid, pending.overtaken);
    toast("A trade you changed here was changed somewhere else since, so the newer version stands.", { warn: true, ms: 6000 });
  }
  if (pending.waiting.length) run(sendTrades);
  if (hasChapterColumns && moved.length) {
    const who = uid;
    run(async () => { ok(await supabase.from("strategies").upsert(chapters.filter((s) => moved.includes(s.id)).map(strategyOut))); keepChapters(who, []); });
  }
  return user;
}

const MONEY_COLS = "id, day, firm, account_id, kind, amount_minor, currency, note, created_at, acct:accounts(name, firm, label, kind, status, archived)";
function moneyLoad() {
  return every(() => supabase.from("prop_money").select(MONEY_COLS).eq("user_id", uid).order("day").order("created_at").order("id"))
    .then((rows) => rows.map(moneyIn))
    .catch((e) => { console.warn("Marble couldn't load fees and payouts:", e?.message || e); return null; });
}
// The server's closes with this device's. When the server can't be read (or its table isn't there yet), the device's
// copy stands on its own.
let serverCloses = {};
function closesLoad() {
  const who = uid, local = localCloses(who);
  flexOwner(who);
  return supabase.from("closes").select("day, facts, closed_at").eq("user_id", who).limit(5000)
    .then(({ data, error }) => {
      if (error) throw error;
      serverCloses = closesFrom(data);
      const all = mergeCloses(serverCloses, local);
      keepCloses(all, who);
      return all;
    })
    .catch((e) => { console.warn("Marble couldn't load closed days:", e?.message || e); serverCloses = null; return local; });
}
const sendClose = async (day, close) => {
  const who = uid;
  try {
    const { error } = await supabase.from("closes").insert(closeOut(who, day, close));
    if (!savedAnyway(error)) throw error;
    if (serverCloses) serverCloses[day] = close;
  } catch (e) { console.warn("Marble couldn't save that closed day:", e?.message || e); } // it's on this device, and goes up next time
};
function sendUnsentCloses() {
  if (!serverCloses) return;
  const closes = getRawState().closes;
  for (const day of unsent(closes, serverCloses, todayNY())) sendClose(day, closes[day]);
}

// "Try again" on the Fees & payouts screen
export async function reloadMoney() {
  if (!uid) return null;
  const money = await moneyLoad();
  loadState({ money });
  return money;
}

/* ---------- Write back every change ---------- */

let queue = Promise.resolve();
const waiting = []; // saves that couldn't reach the server, oldest first
const unreachable = (e) => !navigator.onLine || e?.name === "TypeError" || /fetch|network|timeout|load failed/i.test(e?.message || "") || (e?.status >= 500 && !e?.code);
const REASONS = { "23505": "That already exists", "23514": "One of the values is too long or out of range", "22001": "One of the values is too long", "22003": "A number is out of range", "42501": "That isn't yours to change" };
export const saved = () => queue.then(() => {}, () => {});
function retrySaves() {
  waiting.splice(0).forEach((job) => run(job));
}
const resendTrades = () => { if (uid && navigator.onLine !== false && unsentTrades(uid).length) run(sendTrades); };
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { if (waiting.length) retrySaves(); resendTrades(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resendTrades(); });
}
const run = (job) => { queue = queue.then(job).catch(async (e) => {
  console.warn("Marble couldn't save:", e?.message || e);
  if (unreachable(e) || job.keeps?.(e)) {
    if (!waiting.includes(job)) waiting.push(job);
    toast("Couldn't reach Marble, so that isn't saved yet. It's kept here.", { warn: true, action: { label: "Retry", run: retrySaves }, ms: 12000 });
    return;
  }
  const reason = e?.code === "23505" && /handle/.test(e.message || "") ? "That handle isn't available" : REASONS[e?.code] || "Marble couldn't save that";
  const back = await load().then(() => true).catch(() => false);
  toast(back ? `${reason}, so it's back to how it was.` : `${reason}. Check your connection and try again.`, { warn: true, ms: 6000 });
}); };
const ok = (r) => { if (r.error) throw r.error; return r.data; };
const changed = (r, expected = 1) => {
  ok(r);
  if ((r.data?.length ?? 0) < expected) throw Object.assign(new Error("Nothing was changed"), { code: "42501" });
  return r.data;
};

/* ---------- Trades, written down before they're sent (live/tradeOutbox.js) ---------- */

// Only a refusal is final. A dropped connection, an expired sign-in or a busy server keeps the trade for later.
const refused = (e) => !waitable(e, navigator.onLine !== false);
const putTrades = (list) => supabase.from("trades").upsert(list.map((o) => o.row));
// No count check here: a trade whose save never got through leaves nothing to delete, which is what was asked for
const dropTrades = (list) => supabase.from("trades").delete().in("id", list.map((o) => o.id));

// The server refuses a batch for one bad trade, so on a refusal each goes on its own and the rest still get through.
// A trade whose account never reached the server goes without it: better unfiled than gone.
async function sendEach(who, list, send) {
  if (!list.length) return;
  const { error } = await send(list);
  if (!error) { sentTrades(who, list); return; }
  if (!refused(error)) throw error;
  let refusal = null;
  for (const o of list) {
    let one = (await send([o])).error;
    if (one?.code === "23503" && o.row?.account_id) one = (await send([{ ...o, row: { ...o.row, account_id: null } }])).error;
    if (one && !refused(one)) throw one;
    sentTrades(who, [o]);
    refusal ||= one;
  }
  if (refusal) throw refusal;
}

// Reads the list when it runs, so a retry can only ever send the newest word on a trade, and only under the sign-in
// of the trader it belongs to.
async function sendTrades() {
  const who = uid, list = who ? unsentTrades(who) : [];
  if (!list.length) return;
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user?.id !== who) throw new Error("Not signed in as this trader");
  await sendEach(who, list.filter((o) => !o.del), putTrades);
  await sendEach(who, list.filter((o) => o.del), dropTrades);
}
sendTrades.keeps = (e) => !refused(e);

function saveTrades(prev = [], next = []) {
  const { upserts, removed } = diff(prev, next);
  if (!upserts.length && !removed.length) return;
  keepTrades(uid, { rows: upserts.map((t) => ({ ...tradeOut(t), user_id: uid })), ids: removed, known: new Set(prev.map((t) => t.id)) });
  run(sendTrades);
}

onNewDay(async (day) => {
  if (!uid) return;
  loadState({ planDay: day, plan: planIn(null), checklist: [] });
  try {
    const plan = ok(await onlyMarkets(supabase.from("daily_plans").select("*")).eq("day", day).maybeSingle());
    if (plan && getRawState().planDay === day) loadState({ plan: planIn(plan), checklist: plan.checklist || [] });
  } catch {}
});
onNewUtcDay(async (day) => {
  if (!uid || !CRYPTO_LIVE) return;
  loadState({ crypto: { ...getRawState().crypto, planDay: day, plan: planIn(null), checklist: [] } });
  try {
    const plan = ok(await supabase.from("daily_plans").select("*").eq("world", "crypto").eq("day", day).maybeSingle());
    const now = getRawState().crypto;
    if (plan && now.planDay === day) loadState({ crypto: { ...now, plan: planIn(plan), checklist: plan.checklist || [] } });
  } catch {}
});

// What changed in a list of things with ids
function diff(prev = [], next = []) {
  const before = new Map(prev.map((x) => [x.id, x]));
  const after = new Map(next.map((x) => [x.id, x]));
  return {
    upserts: next.filter((x) => before.get(x.id) !== x),
    removed: prev.filter((x) => !after.has(x.id)).map((x) => x.id),
  };
}

async function uploadAvatar(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const { data, error } = await supabase.functions.invoke("avatar-upload", { body: blob, headers: { "Content-Type": blob.type || "image/webp" } });
  if (error || !data?.url) throw Object.assign(new Error("Couldn't save the picture"), { code: "22023" });
  return data.url;
}

function onChange(prev, next) {
  if (!uid) return;
  const table = (name, key, out) => {
    if (prev[key] === next[key]) return;
    const { upserts, removed } = diff(prev[key], next[key]);
    if (upserts.length) run(async () => ok(await supabase.from(name).upsert(upserts.map(out))));
    if (removed.length) run(async () => changed(await supabase.from(name).delete().in("id", removed).select("id"), removed.length));
  };
  if (prev.logged !== next.logged) saveTrades(prev.logged, next.logged);
  table("accounts", "accounts", accountOut);
  table("strategies", "strategies", strategyOut);
  if (!hasChapterColumns && prev.strategies !== next.strategies) keepChapters(uid, next.strategies);
  table("notes", "notes", noteOut);
  studyChanged(prev, next, uid);
  if (prev.money !== next.money && Array.isArray(prev.money) && Array.isArray(next.money)) {
    const { upserts, removed } = diff(prev.money, next.money);
    if (upserts.length) run(async () => ok(await supabase.from("prop_money").upsert(upserts.map(moneyOut))));
    if (removed.length) run(async () => changed(await supabase.from("prop_money").delete().in("id", removed).select("id"), removed.length));
  }

  if ((prev.plan !== next.plan || prev.checklist !== next.checklist) && prev.planDay === next.planDay) {
    const p = next.plan, day = next.planDay || todayNY();
    run(async () => ok(await supabase.from("daily_plans").upsert({ ...(CRYPTO_LIVE ? { world: "markets" } : {}), day, bias: p.bias || "", levels: p.levels || [], news: p.news || "", risk: p.risk || "", checklist: next.checklist })));
  }
  const pc = prev.crypto || {}, nc = next.crypto || {};
  if (CRYPTO_LIVE && (pc.plan !== nc.plan || pc.checklist !== nc.checklist) && pc.planDay === nc.planDay && nc.plan) {
    const p = nc.plan, day = nc.planDay || utcTodayKey();
    run(async () => ok(await supabase.from("daily_plans").upsert({ world: "crypto", day, bias: p.bias || "", levels: p.levels || [], news: p.news || "", risk: p.risk || "", checklist: nc.checklist || [] })));
  }
  if (CRYPTO_LIVE && (pc.rules !== nc.rules || pc.deskAccount !== nc.deskAccount) && nc.rules) {
    run(async () => ok(await supabase.from("crypto_settings").upsert({ user_id: uid, ...cryptoOut(nc) })));
  }
  if (prev.profile !== next.profile && prev.profile.handle !== undefined) {
    const p = next.profile;
    run(async () => {
      let avatar = p.avatar;
      if (avatar?.startsWith("data:")) {
        avatar = await uploadAvatar(avatar);
        loadState({ profile: { ...getState().profile, avatar } });
      }
      changed(await supabase.from("profiles").update(profileOut({ ...p, avatar })).eq("id", uid).select("id"));
      if (p.showNumber !== undefined) rememberNumber(p.handle, p.showNumber ? p.no : null);
    });
  }
  if (prev.rules !== next.rules && next.rules) {
    run(async () => changed(await supabase.from("profile_private").update(rulesOut(next.rules)).eq("id", uid).select("id")));
  }
  if (prev.deskAccount !== next.deskAccount) {
    run(async () => changed(await supabase.from("profile_private").update({ desk_account: isId(next.deskAccount) ? next.deskAccount : null }).eq("id", uid).select("id")));
  }
  if (prev.backdrop !== next.backdrop && next.backdrop && hasBackdropColumn) {
    clearTimeout(backdropTimer);
    backdropTimer = setTimeout(() => run(async () => changed(await supabase.from("profile_private").update({ backdrop: getRawState().backdrop }).eq("id", uid).select("id"))), 600);
  }
  if (prev.closes !== next.closes && !exampleOn()) {
    const old = prev.closes || {}, days = Object.keys(next.closes || {}).filter((day) => !old[day]);
    if (days.length) {
      keepCloses(next.closes, uid);
      for (const day of days) sendClose(day, next.closes[day]);
    }
  }
  if (prev.ideas !== next.ideas) {
    const known = new Set((prev.ideas || []).map((x) => x.id));
    const added = (next.ideas || []).filter((x) => !known.has(x.id));
    if (added.length) run(async () => ok(await supabase.from("ideas").insert(added.map((x) => ({ id: x.id, title: x.title, body: x.body || "", area: x.area })))));
  }
  if (prev.ideaVotes !== next.ideaVotes) {
    const a = prev.ideaVotes || {}, b = next.ideaVotes || {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!!a[id] === !!b[id]) continue;
      run(async () => ok(b[id]
        ? await supabase.from("idea_votes").upsert({ idea_id: id, user_id: uid })
        : changed(await supabase.from("idea_votes").delete().eq("idea_id", id).eq("user_id", uid).select("idea_id"))));
    }
  }
  if (prev.polls !== next.polls) {
    const known = new Set((prev.polls || []).map((x) => x.id));
    const added = (next.polls || []).filter((x) => !known.has(x.id));
    if (added.length) run(async () => ok(await supabase.from("polls").insert(added.map((x) => {
      const days = +(/(\d+)/.exec(x.ends)?.[1] || 3);
      return { id: x.id, question: x.question, options: x.options.map(([label]) => label), ends_at: new Date(Date.now() + days * 864e5).toISOString() };
    }))));
  }
  if (prev.pollVotes !== next.pollVotes) {
    const a = prev.pollVotes || {}, b = next.pollVotes || {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[id] === b[id]) continue;
      run(async () => ok(b[id] == null
        ? changed(await supabase.from("poll_votes").delete().eq("poll_id", id).eq("user_id", uid).select("poll_id"))
        : await supabase.from("poll_votes").upsert({ poll_id: id, user_id: uid, option: b[id] })));
    }
  }
}
watch(onChange);

export async function fetchFeed(opts) {
  const o = typeof opts === "string" ? { kind: opts } : opts || {};
  const args = { p_limit: o.limit ?? 50 };
  for (const [k, v] of [["p_kind", o.kind], ["p_crew", o.crew], ["p_anonymous", o.anonymous], ["p_parent", o.parent], ["p_before", o.before]]) if (v != null) args[k] = v;
  return ok(await supabase.rpc("feed", args));
}
// The Floor's pinned posts. Before the database has them this answers nothing, so the feed still loads.
export async function fetchPinned() {
  const r = await supabase.rpc("feed_pinned");
  return r.error ? [] : r.data || [];
}
export async function pinPost(id, on) {
  return ok(await supabase.rpc("pin_post", { p_id: id, p_on: !!on }));
}
// Whether this account can pin: an admin who passed two-step. Asked once.
let pinner = null;
export function canPin() {
  pinner ||= (async () => {
    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) return false;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => ({ data: null }));
    return aal?.currentLevel === "aal2";
  })().catch(() => false);
  return pinner;
}
export async function addPost({ kind, body, anonymous, parent_id = null, trade = null, card = null }) {
  return ok(await supabase.from("posts").insert({ kind, body, anonymous, parent_id, trade, ...(card ? { card } : {}) }).select("id").single());
}
export async function deletePost(id) {
  return changed(await supabase.from("posts").delete().eq("id", id).select("id"));
}
export async function reportPost(id, reason) {
  return ok(await supabase.from("reports").insert({ post_id: id, reason }));
}
export async function reportMessage(id, reason) {
  return ok(await supabase.from("reports").insert({ message_id: id, reason }));
}
export async function likePost(id, on) {
  return ok(on
    ? await supabase.from("post_reactions").upsert({ post_id: id }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
    : await supabase.from("post_reactions").delete().eq("post_id", id).eq("user_id", uid));
}

const CHAT_COLS = "id, room, body, trade, reply_to, crew, created_at, user_id, author:profiles(handle, avatar_url, avatar_art, member_no)";
export async function fetchChat(room, limit = 80) {
  return ok(await supabase.from("chat_messages").select(CHAT_COLS).eq("room", room).order("created_at", { ascending: false }).limit(limit)).reverse();
}
export async function fetchChatMessage(id) {
  return ok(await supabase.from("chat_messages").select(CHAT_COLS).eq("id", id).maybeSingle());
}
export async function sendChat(room, { body, trade = null, replyTo = null }) {
  return ok(await supabase.from("chat_messages").insert({ room, body, trade, reply_to: replyTo }).select(CHAT_COLS).single());
}
export async function deleteChat(id) {
  return changed(await supabase.from("chat_messages").delete().eq("id", id).select("id"));
}
export async function countChatSince(room, iso) {
  const r = await supabase.from("chat_messages").select("id", { count: "exact", head: true }).eq("room", room).gt("created_at", iso).neq("user_id", uid);
  if (r.error) throw r.error;
  return r.count || 0;
}
export function listenChat(room, { onInsert, onDelete, onHere }) {
  const ch = supabase.channel(`chat:${room}`, { config: { private: true, presence: { key: crypto.randomUUID() } } });
  ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room=eq.${room}` }, (p) => onInsert?.(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (p) => onDelete?.(p.old?.id))
    .on("presence", { event: "sync" }, () => onHere?.(Object.keys(ch.presenceState()).length))
    .subscribe((status) => { if (status === "SUBSCRIBED") ch.track({}).catch(() => {}); });
  return () => { supabase.removeChannel(ch); };
}

export const rpc = async (name, args) => ok(await supabase.rpc(name, args));
export async function fetchRulesLock(fromMonth) {
  return ok(await supabase.from("discipline_rules").select("daily_loss_limit, max_trades, stop_after_losses").eq("user_id", uid).gte("month", fromMonth).order("month").limit(1).maybeSingle());
}
export async function setBoardsOptIn(on) {
  changed(await supabase.from("profile_private").update({ show_on_boards: !!on }).eq("id", uid).select("id"));
  const me = getState().me;
  if (me) loadState({ me: { ...me, private: { ...me.private, show_on_boards: !!on } } });
}
export async function fetchEvents() {
  const [competitions, giveaways, cupEntries, drawEntries] = await Promise.all([
    supabase.from("competitions").select("*").neq("status", "draft").order("starts_on", { ascending: false }).limit(20).then(ok),
    supabase.from("giveaways").select("*").neq("status", "draft").order("opens_at", { ascending: false }).limit(20).then(ok),
    supabase.from("competition_entries").select("competition_id, status, account_id, rules_version").eq("user_id", uid).then(ok),
    supabase.from("giveaway_entries").select("giveaway_id, entry_no").eq("user_id", uid).then(ok),
  ]);
  return { competitions, giveaways, cupEntries, drawEntries };
}

/* ---------- The trader's own data, and leaving ---------- */

// Named columns, never "*": connections also holds the broker key or token. last_error stays out too, because a
// broker's error can quote the address it was called on.
const EXPORT_COLUMNS = {
  connections: "id, platform, username, accounts, settings, status, last_synced_at",
  news_rules: "enabled, before_min, after_min, medium, updated_at",
};

export async function exportAll() {
  const tables = ["profiles", "profile_private", ...(CRYPTO_LIVE ? ["crypto_settings"] : []), "accounts", "connections", "strategies", "trades", "imports", "notes", "notebooks", "pages", "daily_plans", "news_rules", "ideas", "idea_votes", "polls", "poll_votes", "oracle_waitlist", "bug_reports",
    "post_reactions", "chat_messages", "crew_members", "discipline_rules", "competition_entries", "giveaway_entries", "prop_money", "closes", "card_links"];
  const out = { exported_at: new Date().toISOString(), email: getState().me?.email };
  for (const t of tables) {
    const own = ["profiles", "profile_private"].includes(t) ? "id" : "user_id";
    const { data, error } = await supabase.from(t).select(EXPORT_COLUMNS[t] || "*").eq(own, uid);
    out[t] = error ? { error: error.message } : data;
  }
  const { data: posts } = await supabase.from("posts").select("*").eq("user_id", uid);
  out.posts = posts || [];
  const dms = await supabase.rpc("dm_export");
  out.messages_and_sharing = dms.error ? { error: dms.error.message } : dms.data;
  return out;
}

// The whole record in one zip: the data as JSON, the trades as a spreadsheet that imports back in, and every chart photo
// the trader keeps with Marble. A photo that can't be fetched is counted, never silently dropped.
const RECORD_BUCKETS = ["screenshots", "study", "backdrops"];
const PAGE = 1000;
async function storedFiles(bucket, folder) {
  const found = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: PAGE, offset });
    if (error) throw error;
    for (const f of data || []) {
      if (f.id) found.push(`${folder}/${f.name}`);
      else found.push(...await storedFiles(bucket, `${folder}/${f.name}`));
    }
    if ((data || []).length < PAGE) return found;
  }
}
export async function exportRecord(onPhoto = () => {}) {
  const uid = userId();
  const data = await exportAll();
  const text = (s) => new TextEncoder().encode(s);
  const files = [{ name: "marble-data.json", data: text(JSON.stringify(data, null, 2)) }];
  const [{ tradesCsv }, { withFees }, { accountText }, { STAGES, stageOf }] = await Promise.all([import("../lib/tradeCsv.js"), import("../drip/journal/stage"), import("../components/CopyView"), import("../drip/accounts")]);
  const accounts = Array.isArray(data.accounts) ? data.accounts.map(accountIn) : [];
  const rows = Array.isArray(data.trades) ? data.trades.map(tradeIn).map(withFees) : [];
  const accountOf = (t) => accounts.find((x) => x.id === t.account);
  files.push({ name: "trades.csv", data: text(tradesCsv(rows, {
    account: (t) => { const a = accountOf(t); return a ? accountText(a) : ""; },
    stage: (t) => STAGES[stageOf(accountOf(t) || { kind: t.accountKind })],
  })) });
  const photos = [];
  let missed = 0;
  for (const bucket of RECORD_BUCKETS) {
    try { for (const path of await storedFiles(bucket, uid)) photos.push({ bucket, path }); }
    catch { missed += 1; }
  }
  let done = 0;
  for (const p of photos) {
    onPhoto(++done, photos.length);
    const { data: blob, error } = await supabase.storage.from(p.bucket).download(p.path);
    if (error || !blob) { missed += 1; continue; }
    files.push({ name: `photos/${p.bucket}/${p.path.slice(uid.length + 1)}`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  const { zip } = await import("../lib/zip.js");
  return { bytes: zip(files), missed };
}

// Empties a database first and then deletes it: the Study photos stay open for the whole visit, so the delete alone
// can wait on them until the page has gone.
const dropDatabase = (name) => new Promise((done) => {
  const drop = () => {
    const del = indexedDB.deleteDatabase(name);
    del.onsuccess = del.onerror = del.onblocked = done;
  };
  try {
    const open = indexedDB.open(name);
    open.onupgradeneeded = () => open.transaction.abort(); // it was never made on this device
    open.onerror = drop;
    open.onsuccess = () => {
      const db = open.result, stores = [...db.objectStoreNames];
      const closed = () => { db.close(); drop(); };
      if (!stores.length) { closed(); return; }
      const clear = db.transaction(stores, "readwrite");
      for (const s of stores) clear.objectStore(s).clear();
      clear.oncomplete = clear.onabort = closed;
    };
  } catch { done(); }
});

// Everything Marble keeps in this browser goes with the account: every key of its own, so a new one can't be missed,
// and the photos. The account is already gone by now, so nothing here may stop the sign-out that follows.
function sweepStorage() {
  for (const box of ["localStorage", "sessionStorage"]) {
    try {
      const keep = globalThis[box];
      for (const key of Object.keys(keep)) if (/^marble[-.]/.test(key)) keep.removeItem(key);
    } catch {}
  }
}

// Signing out takes unsent trades with it, so this gives them one last try first. How many are still waiting.
export async function sendBeforeLeaving() {
  resendTrades();
  await Promise.race([saved(), new Promise((done) => setTimeout(done, 3000))]);
  return uid ? unsentTrades(uid).length : 0;
}

// Unsent trades belong to the sign-in that made them, so they go when the trader signs out, whichever button asked.
// Only once it has worked: a failed sign-out leaves the trader here, with their trades still to send.
if (supabase?.auth?.signOut) {
  const signOut = supabase.auth.signOut.bind(supabase.auth);
  supabase.auth.signOut = async (options) => {
    const who = uid, out = await signOut(options);
    if (who && !out?.error) clearTrades(who);
    return out;
  };
}

async function clearDevice() {
  sweepStorage();
  if (uid) clearTrades(uid);
  const dropped = Promise.all(["marble-study", "marble-flex"].map(dropDatabase));
  await Promise.race([dropped, new Promise((done) => setTimeout(done, 3000))]);
}

export async function deleteAccount() {
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
  if (error) {
    let msg = "Couldn't delete your account. Try again, or email support@example.com.";
    let code = null;
    try { const j = await error.context.json(); msg = j.error || msg; code = j.code || null; } catch { }
    throw Object.assign(new Error(msg), { code });
  }
  await clearDevice();
  await supabase.auth.signOut();
  sweepStorage(); // a Study save already on its way can write itself back during the sign-out
}
