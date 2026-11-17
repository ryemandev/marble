import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleWords } from "../src/lib/firm-rules/words.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2] || process.env.FIRM_RULES_SRC || join(root, ".scratch/research/firm-rules/firm-rules.json");
const out = join(root, "src/lib/firm-rules");
const d = JSON.parse(readFileSync(src, "utf8"));

const FAILED = /^(wrong|incorrect|changed|refuted|failed|unverified|stale)$/i;
const overturned = (r) => {
  const fc = r?.fact_check ?? r?.factcheck ?? r?.check ?? null;
  const verdict = typeof fc === "string" ? fc : fc?.status ?? fc?.verdict ?? fc?.result;
  return !!(verdict && FAILED.test(String(verdict)));
};

const UNRESOLVED = [
  ["DLL basis", ["dll"]], ["DLL open P&L", ["dll"]], ["DLL reset", ["dll"]], ["DLL", ["dll"]], ["Futures reset", ["dll"]],
  ["LucidScale DLL", ["dll"]], ["Qualified DLL", ["dll"], "funded"], ["Live DLL", ["dll"], "live"],
  ["Funded DLL breach", ["dll"], "funded"], ["Funded DLL above the trail", ["dll"], "funded"],
  ["PRO+ Development DLL", ["dll"], /development/i], ["PRO+ Development drawdown", ["dd"], /development/i],
  ["PRO+ contract limit", ["size"], /pro\+/i],
  ["Tradovate evaluation lock", ["dd"], "evaluation"], ["Evaluation lock", ["dd"], "evaluation"],
  ["EOD threshold enforcement", ["dd"]], ["Intraday enforcement", ["dd"]], ["EOD drawdown", ["dd"]], ["EOD snapshot", ["dd"]],
  ["MLL basis", ["dd"]], ["Open P&L", ["dd"]], ["Preset conflict", ["dll", "dd", "target"]],
  ["Live drawdown", ["dd"], "live"], ["LIVE minimum balance", ["dd"], "live"], ["LFA loss floor", ["dd"], "live"],
  ["Funded MLL lock", ["dd"], "funded"], ["Elite (funded) floor", ["dd"], "funded"], ["Funded Live floor", ["dd"], "funded live"],
  ["Live phase", ["dd", "size"], "live"], ["Consistency basis", ["cons"]], ["Holding", ["hold"]],
  ["Evaluation days", ["days"], "evaluation"], ["Terms", ["days"], "evaluation"],
  ["Payout days", ["pay"]], ["First payout", ["pay"]], ["First reward", ["pay"]], ["On-demand add-on", ["pay"]],
  ["Minimum payout", []], ["Minimum reward", []], ["Minimum withdrawal", []], ["Payout buffer", []], ["Payout cap", []],
  ["Split options", []], ["Sale status", []], ["Funded reset", []], ["Scaling", []], ["70% rule", []], ["Microscalping", []],
];
const NOT_APPLIED = [
  [/^topstep\.freedom-trading-combine\./, "live", "dll"],
  [/^myfundedfutures\.builder\.(100k|150k)$/, "live", "dd"],
  [/^tradeday\.fast-pass\.50k$/, "live", "dd"],
  [/^elite-trader-funding\.static\.(10k|25k)$/, "funded", "dd"],
  [/^funded-futures-network\.steady(-skip-the-eval)?\./, "evaluation", "dd"],
  [/^for-traders\.futures-/, null, "hold"],
  [/^for-traders\.crypto-fast-pro\./, "evaluation", "cons"],
  [/^alpha-capital\.alpha-one-6\./, "funded", "dll"],
];
const RULE_KEYS = { dll: "daily_loss_limit", dd: "max_drawdown", target: "profit_target", cons: "consistency", days: "min_trading_days", size: "position_limits", hold: "overnight", pay: "payout" };
const URLS = /https:\/\/[^\s;,)"'<>]+[^\s;,)"'<>.]/g;
function openConflicts(e) {
  const found = [];
  for (const f of e.flags || []) {
    const m = String(f).match(/^Unresolved \(fact-check [^)]*\):\s*([^:]+):([\s\S]*)$/);
    if (!m) continue;
    const topic = m[1].trim();
    const hit = UNRESOLVED.find(([t]) => topic === t || topic.startsWith(`${t} `) || topic.startsWith(`${t},`));
    if (!hit) throw new Error(`${e.id}: unresolved topic "${topic}" isn't in UNRESOLVED (scripts/firm-rules.mjs); say which rules it's about`);
    found.push({ rules: hit[1], phase: hit[2], text: m[2], notApplied: /not (yet )?applied|not changed yet/i.test(m[2]) });
  }
  return found;
}
const inScope = (scope, phase) => !scope || (typeof scope === "string" ? scope.split(" ").some((k) => phase.kind.startsWith(k)) : scope.test(phase.name || ""));

let urls = [];
let urlIdx = new Map();
const urlNo = (u) => { if (!urlIdx.has(u)) { urlIdx.set(u, urls.length); urls.push(u); } return urlIdx.get(u); };
const firstUrl = (s) => String(s || "").split(/\s*;\s*/).find((u) => /^https:\/\//.test(u)) || null;
const srcOf = (r) => { const u = firstUrl(r?.source); return u ? urlNo(u) : undefined; };
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)));
const clock = (t) => (/^\d\d:\d\d$/.test(t || "") ? t : undefined);
const zone = (tz) => (!tz ? undefined : /^server/i.test(tz) ? "server_utc+2/+3" : tz);
const short = (s, n = 320) => (typeof s === "string" && s.trim() ? (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s.trim()) : undefined);

let tracked = 0, disputed = 0, held = 0;
function rule(r, cx, values) {
  if (!r || r.confidence === "not_applicable") return null;
  const check = (c = "unclear") => clean({ c, s: srcOf(r) });
  if (r.confidence === "not_found") return check("not_found");
  if (!["verified", "unclear"].includes(r.confidence) || overturned(r) || cx.notApplied) { if (cx.notApplied) held++; return check(); }
  const doubt = r.confidence === "unclear" || cx.open.length > 0;
  if (r.exists === false && !r.optional) return doubt ? check() : false;
  const v = values(r);
  if (!v) return doubt ? check() : v;
  tracked++;
  if (!doubt) return clean({ ...v, s: srcOf(r) });
  disputed++;
  const said = [r.note, r.definition, ...cx.open.map((c) => c.text)].filter(Boolean).join(" ");
  const pages = [...new Set([...String(r.source || "").matchAll(URLS), ...said.matchAll(URLS)].map((m) => m[0]))].slice(0, 4);
  return clean({ ...v, s: srcOf(r), x: pages.length ? pages.map(urlNo) : [srcOf(r) ?? 0], xa: /disagree|contradict|conflict|\bvs\.?\s|differ|one page|other page|two pages|another page|\bbut\b|\bwhile\b|whereas|however|inconsisten|mismatch/i.test(said) ? undefined : 1 });
}

const target = (r, cx) => rule(r, cx, (x) => (num(x.amount) ? { a: x.amount } : num(x.pct) ? { pct: x.pct } : null));
const minDays = (r, cx) => rule(r, cx, (x) => (num(x.days) ? { d: x.days, w: short(x.definition, 200) } : null));
const timeLimit = (r, cx) => rule(r, cx, (x) => (num(x.days) || num(x.inactivity_days) ? clean({ d: num(x.days), idle: num(x.inactivity_days) }) : null));
const dll = (r, cx) => rule(r, cx, (x) => clean({
  a: num(x.amount), pct: num(x.pct), of: x.pct_of || undefined, basis: x.basis || undefined,
  opt: x.exists === false && x.optional ? (num(x.optional_amount) ?? true) : undefined,
  reset: clock(x.reset?.time) ? clean({ t: x.reset.time, tz: zone(x.reset.tz), w: short(x.reset.words, 160) }) : undefined,
  breach: x.breach || undefined,
  tiers: Array.isArray(x.by_tier) ? x.by_tier.filter((t) => num(t.from_profit) != null && num(t.amount)).map((t) => [t.from_profit, t.amount]) : undefined,
  w: x.scaling_dll?.formula ? short(`${x.scaling_dll.formula}${x.scaling_dll.activates_when ? `, once the ${x.scaling_dll.activates_when}` : ""}`, 160) : undefined,
}));
const drawdown = (r, cx) => rule(r, cx, (x) => {
  if (x.type === "none") return false;
  const lock = x.lock || {};
  const type = x.type || (/trail/i.test(`${x.note || ""} ${lock.words || ""}`) ? "trailing" : undefined);
  return clean({
    a: num(x.amount), pct: num(x.pct), type, on: x.trails_on || undefined, chk: x.checked_on || undefined,
    lockAt: num(lock.floor_locks_at), lockPeak: num(lock.trigger_peak), lockW: short(lock.words, 220),
    floor: num(x.absolute_floor) ?? num(x.floor), breach: x.breach || undefined,
  });
});
const consistency = (r, cx) => rule(r, cx, (x) => (num(x.cap_pct) ? clean({
  cap: x.cap_pct, m: x.metric === "best_day_pct_of_profit_target" ? "target" : x.metric === "other" ? "other" : "profit",
  for: Array.isArray(x.applies_to) ? x.applies_to : undefined, win: short(x.window, 90), w: short(x.definition, 260),
}) : null));
const contracts = (r, cx) => rule(r, cx, (x) => {
  const scaling = Array.isArray(x.scaling) ? x.scaling.filter((s) => num(s.from_profit) != null && num(s.max_contracts)).map((s) => [s.from_profit, s.max_contracts]) : undefined;
  const v = clean({ max: num(x.max_contracts), micro: num(x.max_micros), ratio: num(x.micros_per_mini), scale: scaling?.length > 1 ? scaling : undefined, lots: num(x.max_lots), lev: typeof x.leverage === "string" ? short(x.leverage, 80) : undefined });
  return Object.keys(v).length ? v : null;
});
const news = (r, cx) => rule(r, cx, (x) => (x.restricted === false ? { ok: 1 } : x.restricted ? { w: short(x.rule, 360) } : null));
const overnight = (r, cx) => rule(r, cx, (x) => (x.allowed == null && x.weekend_allowed == null ? null : clean({
  night: x.allowed === true ? 1 : x.allowed === false ? 0 : undefined, wknd: x.weekend_allowed === true ? 1 : x.weekend_allowed === false ? 0 : undefined,
  by: clock(x.flat_by?.time) ? clean({ t: x.flat_by.time, tz: zone(x.flat_by.tz) }) : undefined,
})));
// Firms whose payout days restart after each payout, in the catalogue's words. true: every payout rule of the firm
// (Topstep's plans mostly point at its standard policy, which says so); a pattern: only the rules whose words say so.
// Elsewhere the tracker counts every day since the account started.
const PAY_RESTARTS = {
  topstep: true, // "winning-day count restarts"
  apex: true, // "counted since the last payout"
  tradeify: true, // "day count resets after each payout"
  myfundedfutures: true, // "Each cycle: 5 new winning days"
  phidias: true, // "counted between requests, approved or refused"
  "funded-futures-network": true, // "fresh count each cycle"
  ftmo: true, // "Qualifying Days ... within the payout cycle"
  fundednext: true, // "Per cycle after 5 Benchmark Days"
  e8: true, // "5 profitable days ... between payouts"
  tradeday: /next cycle Day 1/,
  lucid: /reset after each approved payout/,
  bulenox: /after the previous payout/,
  aqua: /after each 5 winning days/,
  fxify: /Every 5 winning days/,
  "for-traders": /per cycle|previous approved reward/,
};
const restarts = (firm, x) => {
  const r = PAY_RESTARTS[firm];
  return r === true || (r instanceof RegExp && r.test([x.note, x.frequency, x.after_payout, x.winning_day_definition].filter((s) => typeof s === "string").join(" ")));
};
const payout = (r, cx, firm) => rule(r, cx, (x) => {
  const d = num(x.min_days);
  const v = clean({ d, win: num(x.winning_day_min), max: num(x.max_payouts), cyc: d && restarts(firm, x) ? 1 : undefined });
  return Object.keys(v).length ? v : null;
});

const pathOf = (p) => {
  if (p.path) return { path: p.path };
  if (!p.choice_group) return {};
  const tail = String(p.name || "").split(/\s+[-–]\s+/).pop();
  const slug = tail.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  return slug && tail !== p.name ? { path: slug, pn: tail } : {};
};
const phaseOut = (e, p, conflicts) => {
  const cx = (key) => {
    const open = conflicts.filter((c) => c.rules.includes(key) && inScope(c.phase, p));
    const notApplied = open.some((c) => c.notApplied) || NOT_APPLIED.some(([id, kind, k]) => k === key && id.test(e.id) && (!kind || p.kind.startsWith(kind)));
    return { open, notApplied };
  };
  const none = { open: [], notApplied: false };
  return clean({
    k: p.kind, n: p.name, ...pathOf(p), grp: p.choice_group || undefined, start: num(p.starting_balance),
    target: target(p.profit_target, cx("target")), days: minDays(p.min_trading_days, cx("days")), time: timeLimit(p.time_limit, none),
    dll: dll(p.daily_loss_limit, cx("dll")), dd: drawdown(p.max_drawdown, cx("dd")), cons: consistency(p.consistency, cx("cons")),
    size: contracts(p.position_limits, cx("size")), news: news(p.news, none), hold: overnight(p.overnight, cx("hold")), pay: payout(p.payout, cx("pay"), e.firm),
  });
};

const programName = (s) => String(s || "").replace(/[®™]/g, "").split(/\s*->\s*/)[0]
  .replace(/\s*\((?:Topstep Labs[^)]*|original|[^)]*(?:→|->)[^)]*)\)/gi, "").replace(/\s+/g, " ").trim();
const planOut = (e) => {
  const conflicts = openConflicts(e);
  return clean({
    id: e.id, f: e.firm, p: e.program, n: programName(e.program_name), size: e.size, cur: e.currency !== "USD" ? e.currency : undefined,
    legacy: e.legacy ? 1 : undefined, cov: e.coverage, ver: e.rules_version > 1 ? e.rules_version : undefined,
    from: e.effective_from || undefined, to: e.effective_to || undefined, by: e.applies_by || undefined,
    phases: e.phases.map((p) => phaseOut(e, p, conflicts)),
  });
};

const FACT_CHECKS = (d.changelog || []).filter((c) => c.date && Array.isArray(c.lines));
const factChecked = (slug) => FACT_CHECKS.filter((c) => c.lines.some((l) => new RegExp(`(firm:${slug}\\b|[|(]\\s*(all \\d+ )?${slug}[.\\s])`).test(l))).map((c) => c.date).sort().at(-1);

rmSync(join(out, "firms"), { recursive: true, force: true });
mkdirSync(join(out, "firms"), { recursive: true });
const firms = {};
let bytes = 0;
for (const f of d.firms) {
  const mine = d.entries.filter((e) => e.firm === f.slug);
  const ids = new Set(mine.flatMap((e) => e.sources || []));
  const dates = [...ids].map((id) => d.sources[id]?.accessed).filter(Boolean);
  const checked = [...dates, factChecked(f.slug)].filter(Boolean).sort().at(-1) || d.as_of;
  urls = []; urlIdx = new Map();
  const plans = mine.map(planOut);
  const programs = [];
  for (const pl of plans) {
    let g = programs.find((x) => x.p === pl.p);
    if (!g) programs.push(g = clean({ p: pl.p, n: pl.n, legacy: pl.legacy, sizes: [] }));
    if (!g.sizes) g.sizes = [];
    if (pl.size != null && !g.sizes.includes(pl.size)) g.sizes.push(pl.size);
  }
  for (const g of programs) g.sizes.sort((a, b) => a - b);
  programs.sort((a, b) => (a.legacy || 0) - (b.legacy || 0) || b.sizes.length - a.sizes.length);
  const cites = new Map();
  for (const e of mine.filter((x) => x.program === programs[0].p)) for (const p of e.phases) for (const r of Object.values(p)) {
    const u = r && typeof r === "object" ? firstUrl(r.source) : null;
    if (u) cites.set(u, (cites.get(u) || 0) + 1);
  }
  const main = programs[0];
  const size = main.sizes.includes(50000) ? 50000 : main.sizes.reduce((b, n) => (Math.abs(n - 50000) < Math.abs(b - 50000) ? n : b), main.sizes[0]);
  const mainPlan = plans.find((x) => x.p === main.p && x.size === size && !x.to) || plans.find((x) => x.p === main.p && x.size === size);
  const w = mainPlan ? ruleWords(mainPlan, mainPlan.phases[0]) : null;
  const disputedMain = mainPlan ? ["dd", "dll", "target", "cons"].filter((k) => mainPlan.phases[0][k]?.x) : [];
  firms[f.slug] = clean({
    name: f.name, group: f.group, checked, pages: ids.size,
    src: [...cites.entries()].sort((a, b) => b[1] - a[1])[0]?.[0], programs: programs.filter((g) => g.sizes.length),
    main: mainPlan ? clean({ id: mainPlan.id, n: mainPlan.n, size, dd: w.dd, dll: w.dll, target: w.target, cons: w.cons, x: disputedMain }) : undefined,
  });
  const file = JSON.stringify({ firm: f.slug, checked, urls, plans });
  writeFileSync(join(out, "firms", `${f.slug}.json`), `${file}\n`);
  bytes += file.length;
}

writeFileSync(join(out, "index.json"), `${JSON.stringify({ version: d.dataset_version, asOf: d.as_of, firms })}\n`);
console.log(`firm-rules: ${d.entries.length} rule sets from ${Object.keys(firms).length} firms (dataset ${d.dataset_version}). ${tracked} rules tracked, ${disputed} of them on the stricter figure where the firm's pages disagree; ${held} held as check-with-the-firm until a stricter value is applied. ${(bytes / 1024).toFixed(0)} KB across the firm files → ${out}`);
