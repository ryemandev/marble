import { isLoss, isWin, keptShare, summarize } from "../../data.js";
import { HIT_NAMES, limitsSaved, rulesOf } from "../../../supabase/functions/_shared/limits.js";
import { byDay } from "./prepare.js";
import {
  WEEKDAYS, WEEKDAYS_SHORT, amountOf, dayLabel, duration, hhmm, hourSpan, list, madeOrCost, money, monthLabel,
  ordinal, pct, plural, signed, trades,
} from "./words.js";

export const GROUPS = [
  { id: "time", label: "Time", short: "Time" },
  { id: "setups", label: "Setups and symbols", short: "Setups" },
  { id: "rules", label: "Plan and limits", short: "Plan" },
  { id: "behaviour", label: "Behaviour", short: "Behaviour" },
  { id: "prop", label: "Prop-firm style", short: "Prop firm" },
];

/* ---------- Small pieces of arithmetic ---------- */

const sum = (ts) => ts.reduce((a, t) => a + t.pnl, 0);
const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// The trades as the screen lists them: newest first
const ids = (ts) => [...ts].sort((a, b) => b.at - a.at || b.seq - a.seq).map((t) => t.id);
const won = (s) => (s.wins + s.losses ? pct(s.winRate) : null);
function groupBy(ts, key) {
  const m = new Map();
  for (const t of ts) {
    const k = key(t);
    if (k == null || k === "") continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return m;
}
const buckets = (ts, key, min = 3) => [...groupBy(ts, key)].map(([k, list]) => ({ k, list, n: list.length, net: sum(list), s: summarize(list) })).filter((b) => b.n >= min);
const best = (bs, f = (b) => b.net) => bs.reduce((a, b) => (f(b) > f(a) ? b : a));
const worst = (bs, f = (b) => b.net) => bs.reduce((a, b) => (f(b) < f(a) ? b : a));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const perTrade = (ts) => (ts.length ? sum(ts) / ts.length : 0);
// A per-trade or per-day average, to the whole dollar
const avg = (v) => signed(Math.round(v));

/* ---------- Answers ---------- */

function short(have, need, noun, why) {
  return { status: "short", have, need, noun, headline: `Not enough ${noun} yet: ${have} of the ${need} this needs.`, key: `${have} of the ${need}`, facts: why ? [why] : [], look: null, groups: [] };
}
function ok({ headline, key = null, facts = [], look = null, groups = [] }) {
  return { status: "ok", headline, key, facts: facts.filter(Boolean).slice(0, 4), look: look || null, groups: groups.filter((g) => g && g.ids.length) };
}

/* ---------- Time ---------- */

export const SESSIONS = [
  { id: "morning", label: "Mornings", plural: "mornings", range: "before 12:00", test: (m) => m < 720 },
  { id: "afternoon", label: "Afternoons", plural: "afternoons", range: "from 12:00", test: (m) => m >= 720 },
  { id: "day", label: "All day", plural: "", range: "", test: () => true },
];
export const slotName = (weekday = 5, session = "afternoon") => {
  const s = SESSIONS.find((x) => x.id === session) || SESSIONS[1];
  return s.plural ? `${WEEKDAYS[weekday]} ${s.plural}` : `${WEEKDAYS[weekday]}s`;
};

function slot(ctx, o) {
  const w = Number.isInteger(o.weekday) ? o.weekday : 5;
  const sess = SESSIONS.find((x) => x.id === o.session) || SESSIONS[1];
  const name = slotName(w, sess.id);
  const ts = ctx.trades.filter((t) => t.weekday === w && sess.test(t.minutes));
  if (ts.length < 5) return short(ts.length, 5, `trades on ${name}`, `It counts the trades you entered on ${name}${sess.range ? `, ${sess.range} New York time` : ""}.`);
  const s = summarize(ts);
  const rest = ctx.trades.filter((t) => !ts.includes(t));
  const r = summarize(rest);
  const days = byDay(ts);
  const hrs = buckets(ts, (t) => t.hour, 1);
  const lead = hrs.length > 1 ? (s.net < 0 ? worst(hrs) : best(hrs)) : null;
  return ok({
    headline: `Your ${name} ${madeOrCost(s.net)} across ${trades(ts.length)}${ctx.period}.`,
    key: amountOf(s.net),
    facts: [
      won(s) && won(r) && `${won(s)} of them won, against ${won(r)} of the rest of your trades.`,
      lead && Math.sign(lead.net) === Math.sign(s.net) && `Most of it came from ${hhmm(lead.k * 60)} to ${hhmm((lead.k + 1) * 60)} New York time: ${signed(lead.net)} across ${trades(lead.n)}.`,
      `They fell on ${plural(days.length, WEEKDAYS[w])}.`,
    ],
    look: rest.length ? `Per trade, that's ${avg(perTrade(ts))} against ${avg(perTrade(rest))} for the rest of your trades.` : null,
    groups: [{ label: cap(name), ids: ids(ts) }],
  });
}

function hours(ctx) {
  const ts = ctx.trades;
  if (ts.length < 20) return short(ts.length, 20, "trades", "It compares the hours you enter trades in, New York time.");
  const bs = buckets(ts, (t) => t.hour, 3);
  if (bs.length < 2) return short(bs.length, 2, "hours with 3 or more trades", "Each hour needs 3 or more trades to be compared.");
  const hi = best(bs), lo = worst(bs);
  const lowWord = lo.net < 0 ? "worst" : "weakest";
  const left = ts.length - bs.reduce((a, b) => a + b.n, 0);
  const line = (b) => (won(b.s) ? `${won(b.s)} won` : "");
  return ok({
    headline: `Your best hour has been ${hourSpan(hi.k)}, at ${signed(hi.net)} across ${trades(hi.n)}, and your ${lowWord} ${hourSpan(lo.k)}, at ${signed(lo.net)} across ${lo.n}${ctx.period}.`,
    key: signed(hi.net),
    facts: [
      line(hi) && `In your best hour: ${line(hi)}.`,
      line(lo) && `In your ${lowWord} hour: ${line(lo)}.`,
      `By hour of entry, New York time: ${[...bs].sort((a, b) => a.k - b.k).map((b) => `${hhmm(b.k * 60)} ${signed(b.net)}`).join(" · ")}.`,
      left > 0 && `${trades(left)} in hours with fewer than 3 trades ${left === 1 ? "is" : "are"} left out.`,
    ],
    look: `${hi.n + lo.n} of your ${ts.length} trades fall in these two hours.`,
    groups: [{ label: `Best hour · ${hourSpan(hi.k)}`, ids: ids(hi.list) }, { label: `${cap(lowWord)} hour · ${hourSpan(lo.k)}`, ids: ids(lo.list) }],
  });
}

function weekday(ctx) {
  const ts = ctx.trades;
  if (ts.length < 20) return short(ts.length, 20, "trades", "It compares the days of the week you trade on.");
  const bs = buckets(ts, (t) => t.weekday, 3);
  if (bs.length < 2) return short(bs.length, 2, "weekdays with 3 or more trades", "Each weekday needs 3 or more trades to be compared.");
  const hi = best(bs), lo = worst(bs);
  const lowWord = lo.net < 0 ? "worst" : "weakest";
  const days = new Set(hi.list.map((t) => t.dayKey)).size;
  return ok({
    headline: `${WEEKDAYS[hi.k]} has been your best day of the week: ${signed(hi.net)} across ${trades(hi.n)}${won(hi.s) ? `, with ${won(hi.s)} won` : ""}${ctx.period}.`,
    key: signed(hi.net),
    facts: [
      `${WEEKDAYS[lo.k]} has been your ${lowWord}: ${signed(lo.net)} across ${trades(lo.n)}${won(lo.s) ? `, with ${won(lo.s)} won` : ""}.`,
      `Over ${plural(days, WEEKDAYS[hi.k])} traded, that's ${avg(hi.net / days)} a ${WEEKDAYS[hi.k]}.`,
      `By day: ${[...bs].sort((a, b) => ((a.k + 6) % 7) - ((b.k + 6) % 7)).map((b) => `${WEEKDAYS_SHORT[b.k]} ${signed(b.net)}`).join(" · ")}.`,
    ],
    groups: [{ label: `${WEEKDAYS[hi.k]}s`, ids: ids(hi.list) }, { label: `${WEEKDAYS[lo.k]}s`, ids: ids(lo.list) }],
  });
}

function open(ctx) {
  const inOpen = (t) => t.minutes >= 570 && t.minutes < 600;
  const ts = ctx.trades.filter(inOpen), rest = ctx.trades.filter((t) => !inOpen(t));
  if (ts.length < 5) return short(ts.length, 5, "trades in the first 30 minutes", "It counts trades entered from 09:30 to 09:59 New York time.");
  const s = summarize(ts), r = summarize(rest);
  const first5 = ts.filter((t) => t.minutes < 575);
  return ok({
    headline: `Trades in the first 30 minutes after the open ${madeOrCost(s.net)} across ${trades(ts.length)}${won(s) ? `, with ${won(s)} won` : ""}${ctx.period}.`,
    key: amountOf(s.net),
    facts: [
      rest.length && `The rest of your trades ${madeOrCost(r.net)} across ${trades(rest.length)}${won(r) ? `, with ${won(r)} won` : ""}.`,
      rest.length && `Per trade: ${avg(perTrade(ts))} in the first 30 minutes, ${avg(perTrade(rest))} the rest of the day.`,
      `${pct((ts.length / ctx.trades.length) * 100)} of your trades are entered in that window.`,
    ],
    look: first5.length ? `${first5.length} of them ${first5.length === 1 ? "was" : "were"} entered in the first 5 minutes, 09:30 to 09:34, and ${first5.length === 1 ? "it" : "those"} ${madeOrCost(sum(first5))}.` : null,
    groups: [{ label: "09:30–09:59 New York time", ids: ids(ts) }],
  });
}

/* ---------- Setups and symbols ---------- */

function setups(ctx) {
  const named = ctx.trades.filter((t) => t.setup);
  if (named.length < 10) return short(named.length, 10, "trades with a setup named", "It compares the setups named on your trades.");
  const bs = buckets(named, (t) => t.setup, 3);
  if (bs.length < 2) return short(bs.length, 2, "setups with 3 or more trades", "Each setup needs 3 or more trades to be compared.");
  const m = (b) => b.net / b.n;
  const hi = best(bs, m), lo = worst(bs, m);
  const line = (b) => `${b.k}: ${signed(b.net)} in all${won(b.s) ? `, ${won(b.s)} won` : ""}${b.s.judged ? `, ${pct(b.s.rulesKept)} by the plan` : ""}.`;
  const unnamed = ctx.trades.length - named.length;
  const broke = lo.list.filter((t) => t.followedPlan === false).length;
  return ok({
    headline: `${hi.k} has paid the most, at ${signed(m(hi))} a trade across ${trades(hi.n)}, and ${lo.k} the least, at ${signed(m(lo))} across ${lo.n}${ctx.period}.`,
    key: signed(m(hi)),
    facts: [
      line(hi),
      line(lo),
      `${bs.length} setups have 3 or more trades${unnamed ? `; ${trades(unnamed)} with no setup named ${unnamed === 1 ? "is" : "are"} left out` : ""}.`,
    ],
    look: broke ? `${broke} of the ${lo.n} ${lo.k} trades went off plan.` : null,
    groups: [{ label: hi.k, ids: ids(hi.list) }, { label: lo.k, ids: ids(lo.list) }],
  });
}

function symbols(ctx) {
  const ts = ctx.trades.filter((t) => t.symbol);
  if (ts.length < 10) return short(ts.length, 10, "trades", "It compares the symbols you trade.");
  const bs = buckets(ts, (t) => t.symbol, 3);
  if (!bs.length) return short(0, 1, "symbols with 3 or more trades", "A symbol needs 3 or more trades to be compared.");
  const hi = best(bs), lo = worst(bs);
  const distinct = new Set(ts.map((t) => t.symbol)).size;
  const total = sum(ts);
  if (bs.length === 1) {
    return ok({
      headline: `${hi.k} is the only symbol you've traded 3 or more times: ${signed(hi.net)} across ${trades(hi.n)}${ctx.period}.`,
      key: signed(hi.net),
      facts: [won(hi.s) && `${won(hi.s)} of them won.`, distinct > 1 && `You've traded ${plural(distinct, "symbol")} in all.`],
      groups: [{ label: hi.k, ids: ids(hi.list) }],
    });
  }
  return ok({
    headline: `${hi.k} has been your best symbol: ${signed(hi.net)} across ${trades(hi.n)}${won(hi.s) ? `, with ${won(hi.s)} won` : ""}${ctx.period}.`,
    key: signed(hi.net),
    facts: [
      `${lo.k} has been your ${lo.net < 0 ? "worst" : "weakest"}: ${signed(lo.net)} across ${trades(lo.n)}.`,
      `You've traded ${plural(distinct, "symbol")}; ${bs.length} of them 3 or more times.`,
    ],
    look: hi.net > 0 && total > 0 ? (hi.net >= total ? `${hi.k} made more than your total: everything else came to ${signed(total - hi.net)}.` : `${hi.k} is ${pct((hi.net / total) * 100)} of your total P&L.`) : null,
    groups: [{ label: hi.k, ids: ids(hi.list) }, { label: lo.k, ids: ids(lo.list) }],
  });
}

function sides(ctx) {
  const L = ctx.trades.filter((t) => t.side === "long"), S = ctx.trades.filter((t) => t.side === "short");
  if (L.length + S.length < 10) return short(L.length + S.length, 10, "trades", "It compares your long and short trades.");
  if (L.length < 3) return short(L.length, 3, "long trades", "Each side needs 3 or more trades to be compared.");
  if (S.length < 3) return short(S.length, 3, "short trades", "Each side needs 3 or more trades to be compared.");
  const l = summarize(L), s = summarize(S);
  return ok({
    headline: `Your longs ${madeOrCost(l.net)} across ${trades(L.length)}, and your shorts ${madeOrCost(s.net)} across ${trades(S.length)}${ctx.period}.`,
    key: amountOf(l.net),
    facts: [
      won(l) && won(s) && `Longs won ${won(l)} of the time, shorts ${won(s)}.`,
      `Per trade: ${avg(perTrade(L))} long, ${avg(perTrade(S))} short.`,
      `${pct((L.length / (L.length + S.length)) * 100)} of your trades are longs.`,
    ],
    groups: [{ label: "Longs", ids: ids(L) }, { label: "Shorts", ids: ids(S) }],
  });
}

function grades(ctx) {
  const G = ["A+", "A", "B", "C"];
  const graded = ctx.trades.filter((t) => G.includes(t.grade));
  if (graded.length < 10) return short(graded.length, 10, "graded trades", "A trade's grade comes from the checklist you tick when you log it.");
  const top = graded.filter((t) => t.grade === "A+" || t.grade === "A"), low = graded.filter((t) => t.grade === "B" || t.grade === "C");
  const a = summarize(top), b = summarize(low);
  const left = ctx.trades.length - graded.length;
  const byGrade = G.map((g) => [g, graded.filter((t) => t.grade === g)]).filter(([, ts]) => ts.length).map(([g, ts]) => `${g} ${signed(sum(ts))} (${ts.length})`).join(" · ");
  if (!top.length || !low.length) {
    const only = top.length ? "A or A+" : "B or C";
    return ok({
      headline: `All ${graded.length} of your graded trades are ${only}, and they ${madeOrCost(sum(graded))}${ctx.period}.`,
      key: amountOf(sum(graded)),
      facts: [`By grade: ${byGrade}.`, left > 0 && `${trades(left)} ${left === 1 ? "isn't" : "aren't"} graded yet and ${left === 1 ? "is" : "are"} left out.`],
      groups: [{ label: only, ids: ids(graded) }],
    });
  }
  return ok({
    headline: `Your A and A+ trades ${madeOrCost(a.net)} across ${trades(top.length)}, and your B and C trades ${madeOrCost(b.net)} across ${trades(low.length)}${ctx.period}.`,
    key: amountOf(a.net),
    facts: [
      `By grade: ${byGrade}.`,
      left > 0 && `${trades(left)} ${left === 1 ? "isn't" : "aren't"} graded yet and ${left === 1 ? "is" : "are"} left out.`,
    ],
    look: `${pct((top.length / graded.length) * 100)} of your graded trades are A or A+.`,
    groups: [{ label: "A+ and A", ids: ids(top) }, { label: "B and C", ids: ids(low) }],
  });
}

/* ---------- Rules and limits ---------- */

function mostMissed(ts, strategies = []) {
  const count = new Map();
  for (const t of ts) {
    const rules = strategies.find((s) => s.setup === t.setup)?.rules;
    if (!Array.isArray(rules) || !rules.length || t.kept.length !== rules.length) continue;
    t.kept.forEach((k, i) => { if (!k) { const key = `${t.setup}\u0000${rules[i]}`; count.set(key, (count.get(key) || 0) + 1); } });
  }
  let top = null;
  for (const [k, n] of count) if (!top || n > top.n) top = { setup: k.split("\u0000")[0], rule: k.split("\u0000")[1], n };
  return top && top.n >= 2 ? top : null;
}

function brokenRules(ctx) {
  const judged = ctx.trades.filter((t) => t.followedPlan != null);
  if (judged.length < 10) return short(judged.length, 10, "reviewed trades", "A trade counts once you've said whether it was by the plan.");
  const broke = judged.filter((t) => t.followedPlan === false), kept = judged.filter((t) => t.followedPlan === true);
  const left = ctx.trades.length - judged.length;
  const leftLine = left > 0 && `${trades(left)} ${left === 1 ? "isn't" : "aren't"} reviewed yet and ${left === 1 ? "is" : "are"} left out.`;
  if (!broke.length) {
    return ok({ headline: `You went by the plan on all ${judged.length} reviewed trades${ctx.period}, so there's nothing off plan to count.`, key: `all ${judged.length}`, facts: [`Those trades ${madeOrCost(sum(kept))}.`, leftLine], groups: [] });
  }
  const b = summarize(broke), k = summarize(kept);
  const missed = mostMissed(broke, ctx.strategies);
  const how = [won(b) && `won ${won(b)} of the time`].filter(Boolean);
  return ok({
    headline: `Trades off plan ${madeOrCost(b.net)} across ${trades(broke.length)}${ctx.period}.`,
    key: amountOf(b.net),
    facts: [
      kept.length && `Trades by the plan ${madeOrCost(k.net)} across ${trades(kept.length)}.`,
      how.length && `Off-plan trades ${list(how)}.`,
      missed && `Missed most often: “${missed.rule}” (${missed.setup}), on ${trades(missed.n)}.`,
      leftLine,
    ],
    look: kept.length ? `Per trade, that's ${avg(perTrade(broke))} against ${avg(perTrade(kept))} by the plan.` : null,
    groups: [{ label: "Off plan", ids: ids(broke) }],
  });
}

const HIT_LABEL = { loss: "loss limit", trades: "trades-a-day limit", streak: "losses-in-a-row limit" };
function afterLimit(ctx) {
  const r = rulesOf(ctx.rules || {});
  if (!r.lossLimit && !r.maxTrades && !r.stopAfter) {
    return { status: "none", headline: "No daily limits are set, so there's nothing to check against.", key: null, action: "rules",
      facts: ["Once a loss limit, a most-trades-a-day or a losses-in-a-row limit is set, this checks every day of your journal against it."], look: null, groups: [] };
  }
  const res = limitsSaved(ctx.trades, r, { days: ctx.scope.days || 36500, now: ctx.now });
  if (res.trades < 10) return short(res.trades, 10, "trades", "It checks each day you traded against your daily limits.");
  const rulesLine = `Your daily limits: ${list([r.lossLimit && `a ${money(r.lossLimit)} loss limit`, r.maxTrades && `${plural(r.maxTrades, "trade")} a day`, r.stopAfter && `${plural(r.stopAfter, "loss", "losses")} in a row`].filter(Boolean))}.`;
  if (res.status === "never-hit") return ok({ headline: `None of your daily limits were reached across ${plural(res.daysTraded, "day")} traded${ctx.period}.`, key: "None", facts: [rulesLine] });
  if (res.status === "stopped") return ok({ headline: `You reached a daily limit on ${plural(res.daysHit, "day")}${ctx.period}, and stopped there${res.daysHit === 1 ? "" : " each time"}.`, key: plural(res.daysHit, "day"), facts: [rulesLine] });
  const days = new Map(byDay(ctx.trades).map((d) => [d.dayKey, d.list]));
  const kinds = new Map();
  for (const d of res.byDay) for (const h of d.hit) kinds.set(h, (kinds.get(h) || 0) + 1);
  const biggest = res.byDay.reduce((a, d) => (Math.abs(d.pnl) > Math.abs(a.pnl) ? d : a), res.byDay[0]);
  return ok({
    headline: `Trades taken after reaching a daily limit ${madeOrCost(res.afterPnl)} across ${trades(res.tradesAfter)} on ${plural(res.daysOver, "day")}${ctx.period}.`,
    key: amountOf(res.afterPnl),
    facts: [
      `You reached a limit on ${res.daysHit} of ${plural(res.daysTraded, "day")} traded, and kept trading on ${res.daysOver} of them.`,
      `Limits reached: ${list([...kinds].map(([k, n]) => `${HIT_NAMES[k]} on ${plural(n, "day")}`))}.`,
      rulesLine,
    ],
    look: res.byDay.length > 1 ? `The largest was ${dayLabel(biggest.day, ctx.year)}: ${signed(biggest.pnl)} across ${trades(biggest.trades)} after the limit.` : null,
    groups: res.byDay.map((d) => ({ label: `${dayLabel(d.day, ctx.year)} · after the ${list(d.hit.map((h) => HIT_LABEL[h]))}`, ids: ids((days.get(d.day) || []).slice(-d.trades)) })),
  });
}

// The Monday of a New York day, as YYYY-MM-DD
const mondayOf = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(d - ((at.getUTCDay() + 6) % 7));
  return at.toISOString().slice(0, 10);
};
function keptTrend(ctx) {
  const judged = ctx.trades.filter((t) => t.followedPlan != null);
  if (judged.length < 10) return short(judged.length, 10, "reviewed trades", "A trade counts once you've said whether it was by the plan.");
  const periods = (key, min) => [...groupBy(judged, key)].map(([k, list]) => ({ k, list })).filter((p) => p.list.length >= min).sort((a, b) => (a.k < b.k ? -1 : 1));
  let mode = "month", ps = periods((t) => t.month, 5);
  if (ps.length < 2) {
    const weeks = periods((t) => mondayOf(t.dayKey), 4);
    if (weeks.length < 3) return short(ps.length, 2, "months with 5 or more reviewed trades", "It compares the share of your reviewed trades that were by the plan, month by month.");
    mode = "week"; ps = weeks;
  }
  ps = ps.slice(-6);
  const name = (p, shortName) => (mode === "month" ? monthLabel(p.k, ctx.year, shortName) : `${shortName ? "" : "the week of "}${dayLabel(p.k, ctx.year).replace(/^\S+ /, "")}`);
  const cur = ps.at(-1), prev = ps.at(-2);
  const p = keptShare(cur.list), q = keptShare(prev.list);
  const dir = Math.round(p) > Math.round(q) ? `up from ${pct(q)}` : Math.round(p) < Math.round(q) ? `down from ${pct(q)}` : `level with ${pct(q)}`;
  const top = ps.reduce((a, x) => (keptShare(x.list) > keptShare(a.list) ? x : a));
  const left = ctx.trades.length - judged.length;
  const ck = cur.list.filter((t) => t.followedPlan), cb = cur.list.filter((t) => !t.followedPlan);
  return ok({
    headline: `You went by the plan on ${pct(p)} of reviewed trades in ${name(cur)}, ${dir} in ${name(prev)}.`,
    key: pct(p),
    facts: [
      `${mode === "month" ? "Month by month" : "Week by week"}: ${ps.map((x) => `${name(x, true)} ${pct(keptShare(x.list))}`).join(" · ")}.`,
      ps.length > 2 && `The highest was ${name(top)}, at ${pct(keptShare(top.list))} of ${trades(top.list.length)}.`,
      mode === "week" && `Your journal has fewer than two months with 5 or more reviewed trades, so this goes week by week (weeks with 4 or more).`,
      left > 0 && `${trades(left)} ${left === 1 ? "isn't" : "aren't"} reviewed yet and ${left === 1 ? "is" : "are"} left out.`,
    ],
    look: ck.length && cb.length ? `In ${name(cur)}, trades by the plan ${madeOrCost(sum(ck))} and trades off plan ${madeOrCost(sum(cb))}.` : null,
    groups: [{ label: cap(name(cur)), ids: ids(cur.list) }, { label: cap(name(prev)), ids: ids(prev.list) }],
  });
}

/* ---------- Behaviour ---------- */

function firstLoss(ctx) {
  const after = [], next = [];
  let lossDays = 0, stopped = 0, used = 0;
  for (const d of byDay(ctx.trades)) {
    const i = d.list.findIndex(isLoss);
    if (i < 0) continue;
    lossDays++;
    const rest = d.list.slice(i + 1);
    if (!rest.length) { stopped++; continue; }
    used++;
    after.push(...rest);
    next.push(rest[0]);
  }
  if (used < 5) return short(used, 5, "days with trades after a first loss", "It looks at each day's trades after its first losing trade.");
  const a = summarize(after);
  const others = ctx.trades.filter((t) => !after.includes(t)), o = summarize(others);
  return ok({
    headline: `After the first loss of the day, the trades that followed ${madeOrCost(a.net)} across ${trades(after.length)} on ${plural(used, "day")}${ctx.period}.`,
    key: amountOf(a.net),
    facts: [
      won(a) && won(o) && `Those trades won ${won(a)} of the time, against ${won(o)} for the rest of your trades.`,
      `The very next trade after a first loss ${madeOrCost(sum(next))} in all, across ${trades(next.length)}.`,
      `On ${stopped} of the ${plural(lossDays, "day")} with a loss, that first loss was the day's last trade.`,
    ],
    look: others.length ? `Per trade, that's ${avg(perTrade(after))} after a first loss, against ${avg(perTrade(others))} for the rest.` : null,
    groups: [{ label: "After the day's first loss", ids: ids(after) }],
  });
}

function revengeSize(ctx) {
  const nRisk = ctx.trades.filter((t) => t.risk != null).length, nSize = ctx.trades.filter((t) => t.size != null).length;
  const useRisk = nRisk >= nSize;
  const m = (t) => (useRisk ? t.risk : t.size);
  const after = [], others = [], prevOf = new Map();
  for (const d of byDay(ctx.trades)) {
    d.list.forEach((t, k) => {
      if (m(t) == null) return;
      const prev = d.list[k - 1];
      if (prev && isLoss(prev)) { after.push(t); prevOf.set(t, prev); } else others.push(t);
    });
  }
  const what = useRisk ? "an R" : "a size";
  if (after.length < 10) return short(after.length, 10, `trades after a loss with ${what}`, "It compares the size of each trade taken straight after a losing trade with your other trades.");
  if (others.length < 10) return short(others.length, 10, `other trades with ${what}`, "It compares the size of each trade taken straight after a losing trade with your other trades.");
  const fmt = (v) => (useRisk ? money(Math.round(v)) : String(+v.toFixed(1)));
  const avgA = mean(after.map(m)), avgN = mean(others.map(m));
  const diff = (avgA / avgN - 1) * 100;
  const bigger = after.filter((t) => m(prevOf.get(t)) != null && m(t) > m(prevOf.get(t)) * 1.05);
  const rest = after.filter((t) => !bigger.includes(t));
  const s = summarize(after);
  const same = Math.abs(diff) < 5;
  const headline = useRisk
    ? same ? `After a loss, you risked about the same as usual: ${fmt(avgA)} a trade on average, against ${fmt(avgN)} on your other trades${ctx.period}.`
      : `After a loss, you risked ${fmt(avgA)} a trade on average: ${pct(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the ${fmt(avgN)} on your other trades${ctx.period}.`
    : same ? `After a loss, your size stayed about the same: ${fmt(avgA)} on average, against ${fmt(avgN)} on your other trades${ctx.period}.`
      : `After a loss, your average size was ${fmt(avgA)}: ${pct(Math.abs(diff))} ${diff > 0 ? "bigger" : "smaller"} than the ${fmt(avgN)} on your other trades${ctx.period}.`;
  return ok({
    headline,
    key: fmt(avgA),
    facts: [
      useRisk ? "Risk is what a trade stood to lose at its stop: its P&L divided by its R." : "Size is the number of contracts, lots or shares on each trade.",
      `${bigger.length} of the ${after.length} trades after a loss ${bigger.length === 1 ? "was" : "were"} bigger than the losing trade before ${bigger.length === 1 ? "it" : "them"}.`,
      `Trades after a loss ${madeOrCost(s.net)} in all${won(s) ? `, with ${won(s)} won` : ""}.`,
      bigger.length && `The bigger ones ${madeOrCost(sum(bigger))} across ${trades(bigger.length)}.`,
    ],
    groups: bigger.length
      ? [{ label: "Bigger than the loss before", ids: ids(bigger) }, { label: "Other trades after a loss", ids: ids(rest) }]
      : [{ label: "Trades after a loss", ids: ids(after) }],
  });
}

function perDay(ctx) {
  const days = byDay(ctx.trades);
  if (days.length < 10) return short(days.length, 10, "trading days", "It looks at each trade's place in its day: 1st, 2nd, 3rd and on.");
  const placed = days.flatMap((d) => d.list.map((t, k) => ({ t, pos: k + 1 })));
  const P = Math.max(...days.map((d) => d.list.length));
  const at = (lo, hi = Infinity) => placed.filter((x) => x.pos >= lo && x.pos <= hi).map((x) => x.t);
  let peak = 1, run = 0, top = -Infinity;
  for (let p = 1; p <= P; p++) { run += sum(at(p, p)); if (run > top + 1e-9) { top = run; peak = p; } }
  const k = peak < P && sum(at(peak + 1)) < 0 ? peak + 1 : null;
  const line = [1, 2, 3, 4, 5].filter((p) => at(p, p === 5 ? Infinity : p).length).map((p) => `${p === 5 ? "5th on" : ordinal(p)} ${signed(sum(at(p, p === 5 ? Infinity : p)))}`).join(" · ");
  const perDayCount = ctx.trades.length / days.length;
  const facts = [`You took ${perDayCount.toFixed(1)} trades a day on average, across ${plural(days.length, "day")}.`, `By place in the day: ${line}.`];
  if (k) {
    const before = at(1, k - 1), after = at(k);
    const small = days.filter((d) => d.list.length <= k - 1), big = days.filter((d) => d.list.length >= k);
    facts.push(small.length && big.length && `Days with ${k - 1} or fewer trades ${madeOrCost(sum(small.flatMap((d) => d.list)))}; days with more ${madeOrCost(sum(big.flatMap((d) => d.list)))}.`);
    return ok({
      headline: `Your first ${k - 1 === 1 ? "trade" : `${k - 1} trades`} of the day ${madeOrCost(sum(before))} across ${trades(before.length)}; from the ${ordinal(k)} trade on, they ${madeOrCost(sum(after))} across ${trades(after.length)}${ctx.period}.`,
      key: amountOf(sum(after)),
      facts,
      look: `${big.length} of your ${plural(days.length, "day")} reached a ${ordinal(k)} trade.`,
      groups: [{ label: `${cap(ordinal(k))} trade of the day and later`, ids: ids(after) }],
    });
  }
  facts.push(`Your busiest day had ${trades(P)}.`);
  const late = at(Math.min(3, P));
  return ok({
    headline: `Your results hold up through the day: across ${plural(days.length, "day")}${ctx.period}, your later trades added to your total rather than taking from it.`,
    key: plural(days.length, "day"),
    facts,
    groups: [{ label: `${cap(ordinal(Math.min(3, P)))} trade of the day and later`, ids: ids(late) }],
  });
}

function holdTime(ctx) {
  const timed = ctx.trades.filter((t) => t.held != null);
  const why = "Imported trades carry their exit time. It compares how long winners and losers stayed open.";
  if (timed.length < 10) return short(timed.length, 10, "trades with an exit time", why);
  const Wn = timed.filter(isWin), Ls = timed.filter(isLoss);
  if (Wn.length < 3) return short(Wn.length, 3, "winning trades with an exit time", why);
  if (Ls.length < 3) return short(Ls.length, 3, "losing trades with an exit time", why);
  const avgW = mean(Wn.map((t) => t.held)), avgL = mean(Ls.map((t) => t.held));
  const ratio = avgL / avgW;
  const same = Math.abs(ratio - 1) < 0.1;
  const long = Ls.filter((t) => t.held > avgW);
  const longest = Ls.reduce((a, t) => (t.held > a.held ? t : a));
  return ok({
    headline: same
      ? `You held winners and losers for about the same time: ${duration(avgW)} on average for winners, ${duration(avgL)} for losers${ctx.period}.`
      : `You held losing trades for ${duration(avgL)} on average, and winners for ${duration(avgW)}${ctx.period}.`,
    key: same ? duration(avgW) : duration(avgL),
    facts: [
      !same && `Losers stayed open ${pct(Math.abs(ratio - 1) * 100)} ${ratio > 1 ? "longer" : "shorter"} than winners.`,
      `Half your losers were closed within ${duration(median(Ls.map((t) => t.held)))}, and half your winners within ${duration(median(Wn.map((t) => t.held)))}.`,
      long.length && `${long.length} of your ${plural(Ls.length, "loser")} ${long.length === 1 ? "was" : "were"} held longer than your average winner, and ${long.length === 1 ? "it" : "they"} ${madeOrCost(sum(long))}.`,
      timed.length < ctx.trades.length && `${trades(ctx.trades.length - timed.length)} without an exit time ${ctx.trades.length - timed.length === 1 ? "is" : "are"} left out.`,
    ],
    look: `The longest-held loser was open for ${duration(longest.held)} and ${madeOrCost(longest.pnl)}.`,
    groups: [long.length ? { label: "Losers held longer than your average winner", ids: ids(long) } : { label: "Losing trades", ids: ids(Ls) }],
  });
}

function emotions(ctx) {
  const tagged = ctx.trades.filter((t) => t.emotion);
  if (tagged.length < 10) return short(tagged.length, 10, "trades with a feeling tagged", "It groups your trades by the feeling you tagged on them.");
  const bs = buckets(tagged, (t) => t.emotion, 3);
  if (!bs.length) return short(0, 1, "feelings with 3 or more trades", "A feeling needs 3 or more trades to be compared.");
  const lo = worst(bs), hi = best(bs);
  const how = [won(lo.s) && `won ${won(lo.s)} of the time`].filter(Boolean);
  const left = ctx.trades.length - tagged.length;
  const broke = lo.list.filter((t) => t.followedPlan === false).length;
  return ok({
    headline: lo.net < 0
      ? `Trades you tagged ${lo.k} have cost the most: ${money(-lo.net)} across ${trades(lo.n)}${ctx.period}.`
      : `No feeling has cost you money${ctx.period}: the lowest is ${lo.k}, at ${signed(lo.net)} across ${trades(lo.n)}.`,
    key: lo.net < 0 ? money(-lo.net) : signed(lo.net),
    facts: [
      how.length && `${lo.k} trades ${list(how)}.`,
      bs.length > 1 && hi !== lo && `${hi.k} has made the most: ${signed(hi.net)} across ${trades(hi.n)}.`,
      `By feeling: ${[...bs].sort((a, b) => b.net - a.net).slice(0, 6).map((b) => `${b.k} ${signed(b.net)}`).join(" · ")}.`,
      left > 0 && `${trades(left)} with no feeling tagged ${left === 1 ? "is" : "are"} left out.`,
    ],
    look: broke ? `${broke} of the ${lo.n} ${lo.k} trades also went off plan.` : null,
    groups: [{ label: `Tagged ${lo.k}`, ids: ids(lo.list) }],
  });
}

/* ---------- Prop-firm style ---------- */

function consistency(ctx) {
  const days = byDay(ctx.trades).map((d) => ({ ...d, net: sum(d.list) })).sort((a, b) => b.net - a.net);
  if (days.length < 5) return short(days.length, 5, "trading days", "It compares your best day with your total, the way prop firms' consistency rules do.");
  const total = sum(ctx.trades);
  const top = days[0], second = days[1];
  const tally = `That's across ${plural(days.length, "day")} traded.`;
  if (total <= 0) {
    return ok({
      headline: `Your total across ${plural(days.length, "day")}${ctx.period} is ${signed(total)}, so there's no profit for your best day to be a share of.`,
      key: signed(total),
      facts: [`Your best day was ${dayLabel(top.dayKey, ctx.year)}, at ${signed(top.net)}.`, tally],
      groups: [{ label: `Best day · ${dayLabel(top.dayKey, ctx.year)}`, ids: ids(top.list) }],
    });
  }
  const share = (top.net / total) * 100;
  const top3 = days.slice(0, 3).reduce((a, d) => a + d.net, 0);
  return ok({
    headline: `Your best day, ${dayLabel(top.dayKey, ctx.year)}, made ${money(top.net)}: ${pct(share)} of your total profit of ${money(total)}${ctx.period}.`,
    key: pct(share),
    facts: [
      tally,
      second && second.net > 0 && `Your second-best day, ${dayLabel(second.dayKey, ctx.year)}, made ${money(second.net)}: ${pct((second.net / total) * 100)} of the total.`,
      `Without your best day, the other ${plural(days.length - 1, "day")} ${madeOrCost(total - top.net)}.`,
    ],
    look: days.length >= 6 ? `Your best 3 days add up to ${pct((top3 / total) * 100)} of your total.` : null,
    groups: [{ label: `Best day · ${dayLabel(top.dayKey, ctx.year)}`, ids: ids(top.list) }],
  });
}

function expectancy(ctx) {
  const ts = ctx.trades;
  if (ts.length < 20) return short(ts.length, 20, "trades", "It works out your average win, average loss and what an average trade has made.");
  const s = summarize(ts);
  if (!s.wins || !s.losses) {
    return ok({
      headline: `${s.wins ? "No losing trade" : "No winning trade"} yet${ctx.period}, so there's no average ${s.wins ? "loss" : "win"} to compare.`,
      facts: [`Your ${trades(ts.length)} ${madeOrCost(s.net)}.`],
      groups: [{ label: `All ${trades(ts.length)}`, ids: ids(ts) }],
    });
  }
  const exp = s.net / s.count;
  const breakEven = (s.avgLoss / (s.avgWin + s.avgLoss)) * 100;
  return ok({
    headline: `Your average win is ${money(s.avgWin)} and your average loss ${money(s.avgLoss)}, so an average trade has ${madeOrCost(exp)}${ctx.period}.`,
    key: amountOf(exp),
    facts: [
      `${won(s)} of decided trades won: ${plural(s.wins, "win")} and ${plural(s.losses, "loss")}${s.breakeven ? `, plus ${s.breakeven} breakeven` : ""}.`,
      `An average win is ${(s.avgWin / s.avgLoss).toFixed(2)} times an average loss.`,
      Number.isFinite(s.profitFactor) && `For every $1 lost, ${money(Math.round(s.profitFactor * 100) / 100)} was won.`,
    ],
    look: `At these average sizes, the win rate that breaks even is ${pct(breakEven)}; yours is ${won(s)}.`,
    groups: [{ label: `All ${trades(ts.length)}`, ids: ids(ts) }],
  });
}

/* ---------- The menu ---------- */

export const QUESTIONS = [
  { id: "slot", group: "time", text: (o = {}) => `What do my ${slotName(o.weekday, o.session)} cost?`, min: "5 trades on that weekday and session", answer: slot },
  { id: "hours", group: "time", text: () => "What are my best and worst hours?", min: "20 trades; hours with 3 or more", answer: hours },
  { id: "weekday", group: "time", text: () => "Which day of the week has been my best?", min: "20 trades; weekdays with 3 or more", answer: weekday },
  { id: "open", group: "time", text: () => "How do the first 30 minutes after the open go?", min: "5 trades entered 09:30–09:59 New York time", answer: open },
  { id: "setups", group: "setups", text: () => "Which setup has paid the most and the least?", min: "10 trades with a setup; 2 setups with 3 or more", answer: setups },
  { id: "symbols", group: "setups", text: () => "Which symbol has been my best?", min: "10 trades; symbols with 3 or more", answer: symbols },
  { id: "sides", group: "setups", text: () => "How do my longs compare with my shorts?", min: "10 trades; 3 longs and 3 shorts", answer: sides },
  { id: "grades", group: "setups", text: () => "How do my A trades compare with my B and C trades?", min: "10 graded trades", answer: grades },
  { id: "broken", group: "rules", text: () => "What has going off plan cost me?", min: "10 reviewed trades", answer: brokenRules },
  { id: "limits", group: "rules", text: () => "What did trades after a daily limit add up to?", min: "daily limits set; 10 trades", answer: afterLimit },
  { id: "kept", group: "rules", text: () => "How has my on-plan % moved month to month?", min: "10 reviewed trades; 2 months with 5 or more (or 3 weeks with 4 or more)", answer: keptTrend },
  { id: "firstloss", group: "behaviour", text: () => "What happens after my first loss of the day?", min: "5 days with trades after a first loss", answer: firstLoss },
  { id: "size", group: "behaviour", text: () => "Do I size up after a loss?", min: "10 trades after a loss and 10 others, with an R or a size", answer: revengeSize },
  { id: "perday", group: "behaviour", text: () => "Where do my results drop off in the day?", min: "10 trading days", answer: perDay },
  { id: "hold", group: "behaviour", text: () => "Do I hold losers longer than winners?", min: "10 trades with an exit time; 3 winners and 3 losers", answer: holdTime },
  { id: "feelings", group: "behaviour", text: () => "Which feeling has cost me the most?", min: "10 trades with a feeling tagged", answer: emotions },
  { id: "consistency", group: "prop", text: () => "How much of my profit came from my best day?", min: "5 trading days", answer: consistency },
  { id: "expectancy", group: "prop", text: () => "What are my average win, average loss and expectancy?", min: "20 trades", answer: expectancy },
];
