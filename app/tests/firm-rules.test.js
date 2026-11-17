import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { INDEX, RULE_FIRMS, firstPhaseKey, phaseKeys, phaseLabel, phaseOf, planFor, planIn, programsOf, readFirm, sizeLabel } from "../src/lib/firm-rules/catalog.js";
import { firmDay, isMicro, money, track } from "../src/lib/firm-rules/track.js";
import { FIRMS } from "../src/live/firms.js";

const DIR = new URL("../src/lib/firm-rules/firms/", import.meta.url);
const firm = (slug) => readFirm(JSON.parse(readFileSync(new URL(`${slug}.json`, DIR), "utf8")));
const CT = (iso) => new Date(`${iso}-05:00`).toISOString(); // Central time in late October (CDT, UTC−5)
const trade = (open, close, pnl, size = 1, symbol = "ES") => ({ traded_at: CT(open), closedAt: CT(close), pnl, size, symbol });

test("data: every prop firm on the wall has rules, a last-checked date and its rules page", () => {
  const props = FIRMS.filter((f) => f.group === "futures" || f.group === "forex").map((f) => f.slug);
  assert.deepEqual(RULE_FIRMS.map((f) => f.slug).sort(), props.sort());
  for (const f of RULE_FIRMS) {
    assert.match(f.checked, /^\d{4}-\d{2}-\d{2}$/, f.slug);
    assert.match(f.src, /^https:\/\//, f.slug);
    assert.ok(programsOf(f.slug).length, `${f.slug} has current programs`);
  }
  assert.equal(readdirSync(DIR).length, RULE_FIRMS.length);
});

test("data: a figure is checked, or the stricter of the firm's disagreeing pages (with them); the rest say why not", () => {
  let checked = 0, disputed = 0, flagged = 0;
  for (const { slug } of RULE_FIRMS) {
    for (const plan of firm(slug).plans) for (const ph of plan.phases) for (const k of ["target", "dll", "dd", "cons", "size", "days"]) {
      const r = ph[k];
      if (!r) continue;
      if (r.c) { flagged++; assert.ok(["unclear", "not_found"].includes(r.c)); assert.deepEqual(Object.keys(r).filter((x) => !["c", "s"].includes(x)), [], `${plan.id} ${k} carries no value`); continue; }
      if (r.s !== undefined) assert.match(r.s, /^https:\/\//, `${plan.id} ${k} links its page`);
      if (r.x) { disputed++; assert.ok(r.x.length >= 1 && r.x.every((u) => /^https:\/\//.test(u)), `${plan.id} ${k} links the pages that disagree`); }
      else checked++;
    }
  }
  assert.ok(checked > 4000 && disputed > 300 && flagged > 50, `${checked} checked, ${disputed} disputed, ${flagged} flagged`);
  for (const f of RULE_FIRMS) assert.equal(f.checked, "2026-10-30", f.slug);
});

test("catalog: programs, sizes, phases and their words", () => {
  assert.equal(programsOf("topstep")[0].p, "trading-combine");
  assert.deepEqual(programsOf("topstep")[0].sizes, [50000, 100000, 150000]);
  assert.ok(programsOf("apex", { legacy: true }).length > programsOf("apex").length);
  assert.equal(sizeLabel(50000), "50K");
  assert.equal(sizeLabel(1500), "1.5K");
  const plan = planFor(firm("topstep"), "trading-combine", 50000);
  assert.equal(plan.id, "topstep.trading-combine.50k");
  assert.deepEqual(phaseKeys(plan).slice(0, 3), ["evaluation", "funded:standard", "funded:consistency"]);
  assert.equal(phaseLabel(plan, "funded:consistency"), "Funded, consistency path");
  assert.equal(phaseOf(plan, "nonsense"), plan.phases[0]);
  assert.equal(firstPhaseKey(plan), "evaluation");
  assert.equal(INDEX.firms.ftmo.name, "FTMO");
});

test("the firm's day: an evening reset opens the next day, a weekend session is Monday's", () => {
  const ct = { t: "17:00", tz: "America/Chicago" };
  assert.equal(firmDay(CT("2026-10-27T16:59"), ct), "2026-10-27");
  assert.equal(firmDay(CT("2026-10-27T17:00"), ct), "2026-10-28");
  assert.equal(firmDay(CT("2026-10-30T17:30"), ct), "2026-11-02", "Friday evening is Monday's session");
  assert.equal(firmDay(CT("2026-11-01T18:00"), ct), "2026-11-02", "Sunday evening is Monday's session");
  assert.equal(firmDay("2026-10-27T23:30:00Z", { t: "00:00", tz: "Europe/Prague" }), "2026-10-28");
  // A platform server's midnight sits at 5 PM New York
  assert.equal(firmDay("2026-10-27T21:30:00Z", { t: "00:00", tz: "server_utc+2/+3" }), "2026-10-28");
  assert.ok(isMicro("MESZ6") && isMicro("MNQ") && !isMicro("ES") && !isMicro("NQZ6"));
});

test("Topstep 50K Combine: end-of-day trailing floor that locks at the start, 55% consistency, target", () => {
  const plan = planIn(firm("topstep"), "topstep.trading-combine.50k");
  const now = CT("2026-10-29T12:00");
  const run = (trades) => track({ plan, phase: phaseOf(plan, "evaluation"), firmName: "Topstep", group: "futures", start: 50000, trades, now });
  // Nothing yet: the floor is $2,000 under the start
  let r = run([]);
  const dd = (x) => x.lines.find((l) => l.id === "dd");
  assert.equal(dd(r).floor, 48000);
  assert.equal(dd(r).left, 2000);
  assert.equal(r.lines.find((l) => l.id === "dll").info, true, "Topstep's DLL is an add-on, shown not counted");
  r = run([trade("2026-10-26T09:00", "2026-10-26T10:00", 1500), trade("2026-10-27T09:00", "2026-10-27T10:00", 800)]);
  assert.equal(dd(r).floor, 50000);
  assert.equal(dd(r).locked, true);
  assert.equal(dd(r).left, 2300);
  const cons = r.lines.find((l) => l.id === "cons");
  assert.equal(cons.level, "close");
  assert.equal(Math.round(cons.needed), 2727);
  const target = r.lines.find((l) => l.id === "target");
  assert.equal(target.limit, 3000, "the raised need is under the $3,000 target, so the target stands");
  assert.match(target.text, /\$2,300 of \$3,000/);
  r = run([trade("2026-10-26T09:00", "2026-10-26T10:00", 1000), trade("2026-10-29T09:00", "2026-10-29T10:00", 500)]);
  assert.equal(dd(r).floor, 49000);
});

test("drawdown reached on closed trades says so, names the day, and leaves the verdict to the firm", () => {
  const plan = planIn(firm("topstep"), "topstep.trading-combine.50k");
  const r = track({ plan, phase: plan.phases[0], firmName: "Topstep", group: "futures", start: 50000, now: CT("2026-10-29T12:00"),
    trades: [trade("2026-10-27T09:00", "2026-10-27T09:30", -1200), trade("2026-10-27T10:00", "2026-10-27T10:30", -900)] });
  const dd = r.lines.find((l) => l.id === "dd");
  assert.equal(dd.level, "reached");
  assert.match(dd.text, /Max drawdown reached on closed trades on 27 Oct/);
  assert.equal(r.level, "reached");
  assert.equal(r.alert.id, "dd");
});

test("FTMO 100K 2-Step: static floor, 5% daily loss that ends the account (an earlier day counts), 4 days", () => {
  const plan = planIn(firm("ftmo"), "ftmo.2-step.100k");
  const at = (iso) => new Date(iso).toISOString();
  const r = track({ plan, phase: plan.phases[0], firmName: "FTMO", group: "forex", start: 100000, now: "2026-10-29T12:00:00Z", trades: [
    { traded_at: at("2026-10-27T08:00:00Z"), closedAt: at("2026-10-27T09:00:00Z"), pnl: -3000, size: 1, symbol: "EURUSD" },
    { traded_at: at("2026-10-27T10:00:00Z"), closedAt: at("2026-10-27T11:00:00Z"), pnl: -2100, size: 1, symbol: "EURUSD" },
    { traded_at: at("2026-10-28T10:00:00Z"), closedAt: at("2026-10-28T11:00:00Z"), pnl: 900, size: 1, symbol: "EURUSD" },
  ] });
  const dd = r.lines.find((l) => l.id === "dd");
  assert.equal(dd.floor, 90000);
  assert.equal(dd.label, "Max loss");
  const dll = r.lines.find((l) => l.id === "dll");
  assert.equal(dll.level, "reached");
  assert.match(dll.text, /reached on closed trades on 27 Oct: −\$5,100 against FTMO's \$5,000/);
  const days = r.lines.find((l) => l.id === "days");
  assert.equal(days.value, 2);
  assert.match(days.text, /2 of FTMO's 4 minimum/);
});

test("daily loss warns calmly at half and four-fifths, and says what the firm does at the limit", () => {
  const plan = planIn(firm("ftmo"), "ftmo.2-step.100k");
  const day = (pnl) => track({ plan, phase: plan.phases[0], firmName: "FTMO", group: "forex", start: 100000, now: "2026-10-29T15:00:00Z",
    trades: [{ traded_at: "2026-10-29T09:00:00Z", closedAt: "2026-10-29T10:00:00Z", pnl, size: 1, symbol: "EURUSD" }] }).lines.find((l) => l.id === "dll");
  assert.equal(day(-1000).level, "shown");
  assert.equal(day(-2600).level, "noted");
  assert.equal(day(-4200).level, "close");
  assert.match(day(-4200).text, /−\$4,200 of FTMO's \$5,000 limit since midnight Prague time \(84%\)/);
  assert.match(day(-4200).note, /FTMO ends the account at this level/);
  assert.match(day(-4200).note, /also counts open positions/);
});

test("Apex intraday trailing on open profit is an estimate: 'at least', never a confident gap", () => {
  const plan = planIn(firm("apex"), "apex.intraday.50k");
  assert.ok(phaseOf(plan, "evaluation").dd.x?.length);
  const r = track({ plan, phase: phaseOf(plan, "funded"), firmName: "Apex", group: "futures", start: 50000, now: CT("2026-10-29T12:00"),
    trades: [trade("2026-10-28T09:00", "2026-10-28T10:00", 1000)] });
  const dd = r.lines.find((l) => l.id === "dd");
  assert.equal(dd.estimate, true);
  assert.equal(dd.floor, 49000);
  assert.match(dd.text, /^Up to \$2,000 above the floor of at least \$49,000/);
  assert.match(dd.note, /highest open profit/);
});

test("contracts: micros count as a tenth, overlapping trades add up, the limit passed is named", () => {
  const plan = planIn(firm("topstep"), "topstep.trading-combine.50k");
  const run = (trades) => track({ plan, phase: plan.phases[0], firmName: "Topstep", group: "futures", start: 50000, trades, now: CT("2026-10-29T12:00") }).lines.find((l) => l.id === "size");
  assert.equal(run([trade("2026-10-28T09:00", "2026-10-28T09:30", 50, 30, "MES")]).value, 3);
  const over = run([trade("2026-10-28T09:00", "2026-10-28T10:00", 50, 3), trade("2026-10-28T09:30", "2026-10-28T09:45", 20, 3)]);
  assert.equal(over.value, 6);
  assert.equal(over.level, "reached");
  assert.match(over.text, /Contract limit passed on 28 Oct: 6 contracts open at once, against Topstep's 5/);
  assert.equal(run([trade("2026-10-28T09:00", "2026-10-28T09:30", 50, 3), trade("2026-10-28T09:40", "2026-10-28T09:50", 50, 3)]).level, "shown");
});

test("close-out: a trade closed after Topstep's 3:10 PM CT is named; on time says so", () => {
  const plan = planIn(firm("topstep"), "topstep.trading-combine.50k");
  const hold = (trades) => track({ plan, phase: plan.phases[0], firmName: "Topstep", group: "futures", start: 50000, trades, now: CT("2026-10-29T16:00") }).lines.find((l) => l.id === "hold");
  assert.equal(hold([trade("2026-10-28T14:00", "2026-10-28T15:05", 100)]).info, true);
  const late = hold([trade("2026-10-28T14:00", "2026-10-28T15:20", 100)]);
  assert.equal(late.level, "reached");
  assert.match(late.text, /1 trade closed after Topstep's 3:10 PM CT close-out/);
});

test("payout days: Topstep starts the count again after each logged payout; the payout day itself doesn't count", () => {
  const plan = planIn(firm("topstep"), "topstep.trading-combine.50k");
  const won = (day, pnl = 400) => trade(`${day}T09:00`, `${day}T10:00`, pnl);
  // 14 days of $150 or more: 7 up to the first payout (13 Oct, on it too), 5 up to the second (30 Oct, on it too), 2 after
  const trades = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-13",
    "2026-10-14", "2026-10-15", "2026-10-20", "2026-10-27", "2026-10-30", "2026-11-02", "2026-11-03"].map((d) => won(d));
  trades.push(won("2026-10-21", 100), won("2026-10-22", -300));
  const pay = (payouts) => track({ plan, phase: phaseOf(plan, "funded:standard"), firmName: "Topstep", group: "futures", start: 50000, trades, payouts, now: CT("2026-11-03T12:00") })
    .lines.find((l) => l.id === "pay");
  const none = pay([]);
  assert.equal(none.value, 14);
  assert.equal(none.met, true);
  assert.match(none.text, /^14 of 5\. Topstep counts a day when it closes \$150 or more up\./);
  assert.match(none.note, /Topstep starts the count again after each payout/);
  const one = pay(["2026-10-13"]);
  assert.equal(one.value, 7);
  assert.match(one.text, /^7 of 5 since the payout on 13 Oct\./);
  const two = pay(["2026-10-30", "2026-10-13"]);
  assert.equal(two.value, 2, "only 2 and 3 Nov: the payout day and the days before it are spent");
  assert.equal(two.met, false);
  assert.match(two.text, /^2 of 5 since the payout on 30 Oct\./);
  // A firm whose pages don't say the count restarts keeps every day
  const goat = planIn(firm("goat"), "goat.1-step.50k");
  const kept = track({ plan: goat, phase: phaseOf(goat, "funded"), firmName: "GOAT", group: "forex", start: 50000, trades, payouts: ["2026-10-30"], now: CT("2026-11-03T12:00") })
    .lines.find((l) => l.id === "pay");
  assert.equal(kept.value, 14);
  assert.equal(kept.note, null);
});

test("words: no trading instructions, no safety talk, on every current plan", () => {
  const BANNED = /\b(you should|stop trading|size down|reduce|safe|room to|you can (still )?lose|risk up to|green light|take a break|slow down)\b/i;
  const trades = [trade("2026-10-26T09:00", "2026-10-26T10:00", 900, 2), trade("2026-10-27T09:00", "2026-10-27T10:00", -700, 1), trade("2026-10-29T09:00", "2026-10-29T09:20", -300, 1, "MNQ")];
  let lines = 0;
  for (const { slug, name, group } of RULE_FIRMS) {
    for (const plan of firm(slug).plans.filter((p) => !p.legacy)) for (const phase of plan.phases) {
      const r = track({ plan, phase, firmName: name, group, start: plan.size, trades, now: CT("2026-10-29T12:00") });
      for (const l of r.lines) {
        lines++;
        assert.ok(l.text && !/undefined|NaN|null/.test(`${l.text} ${l.note || ""}`), `${plan.id} ${l.id}: ${l.text}`);
        assert.doesNotMatch(`${l.text} ${l.note || ""}`, BANNED, `${plan.id} ${l.id}`);
      }
    }
  }
  assert.ok(lines > 5000, `${lines} lines`);
  assert.equal(money(-640), "−$640");
  assert.equal(money(1234.5), "$1,235");
});

test("words: the same short rule words for the forms, the setup screen and the website's comparison", async () => {
  const { planLine, ruleWords } = await import("../src/lib/firm-rules/words.js");
  const apex = planIn(firm("apex"), "apex.eod.50k");
  assert.equal(planLine(apex, apex.phases[0]), "Drawdown $2,000 trailing, end of day · Daily loss $1,000 · Target $3,000");
  const topstep = planIn(firm("topstep"), "topstep.trading-combine.50k");
  assert.equal(planLine(topstep, topstep.phases[0]), "Drawdown $2,000 trailing, end of day, stops at the start · No daily loss limit · Target $3,000");
  const w = ruleWords(topstep, topstep.phases[0]);
  assert.equal(w.dll, "None (optional $1,000)");
  assert.equal(w.reset, "5:00 PM CT");
  assert.equal(w.cons, "Best day ≤ 55% of profit, for passing");
  assert.equal(w.size, "5 contracts (50 micros)");
  assert.equal(w.hold, "Flat by 3:10 PM CT");
  // A funded stage has no target: "None", not a dash
  assert.equal(ruleWords(topstep, topstep.phases[1]).target, "None");
  const ftmo = planIn(firm("ftmo"), "ftmo.2-step.100k");
  assert.equal(ruleWords(ftmo, ftmo.phases[0]).dll, "$5,000, ends the account");
  // Every current plan's words: no "undefined", no NaN
  for (const { slug } of RULE_FIRMS) for (const plan of firm(slug).plans) for (const ph of plan.phases) {
    const all = Object.values(ruleWords(plan, ph)).filter(Boolean).join(" ") + planLine(plan, ph);
    assert.doesNotMatch(all, /undefined|NaN|null/, plan.id);
  }
});

test("fact check: where the firm's pages disagree, the stricter figure is tracked and says so; held values aren't", () => {
  const apex = planIn(firm("apex"), "apex.eod.50k");
  const ev = phaseOf(apex, "evaluation");
  assert.equal(ev.dd.a, 2000);
  assert.equal(ev.dd.lockAt, undefined);
  const line = track({ plan: apex, phase: ev, firmName: "Apex", group: "futures", start: 50000, trades: [] }).lines.find((l) => l.id === "dd");
  assert.equal(line.disputed, true);
  assert.match(line.note, /^Apex's pages disagree on this\. Marble uses the stricter figure\./);
  assert.ok(line.srcs.length >= 1);
  assert.ok(phaseOf(planIn(firm("the5ers"), "the5ers.high-stakes-classic.50k"), "evaluation_step1").dd.x);
  assert.ok(phaseOf(planIn(firm("lucid"), "lucid.luciddaily-eod-eval.50k"), "evaluation").cons.x);
  assert.ok(phaseOf(planIn(firm("aqua"), "aqua.instant-pro.50k"), "instant_funded").dll.x);
  assert.ok(phaseOf(planIn(firm("phidias"), "phidias.express-to-live.50k"), "evaluation").dd.x);
  assert.equal(phaseOf(planIn(firm("topstep"), "topstep.freedom-trading-combine.250k"), "live").dll.c, "unclear");
  assert.equal(phaseOf(planIn(firm("funded-futures-network"), "funded-futures-network.steady.50k"), "evaluation").dd.c, "unclear");
  assert.equal(phaseOf(planIn(firm("alpha-capital"), "alpha-capital.alpha-one-6.50k"), "funded").dll.c, "unclear");
  // A rule nobody disputes stays plain
  assert.equal(phaseOf(planIn(firm("topstep"), "topstep.trading-combine.50k"), "evaluation").dd.x, undefined);
});

test("versions: FFN's rules for accounts bought from 22 Oct 2026, the current one by default", async () => {
  const { planFor, versionLabel, versionsOf } = await import("../src/lib/firm-rules/catalog.js");
  const ffn = firm("funded-futures-network");
  const vs = versionsOf(ffn, "max-standard", 50000);
  assert.deepEqual(vs.map((p) => p.id), ["funded-futures-network.max-standard.50k", "funded-futures-network.max-standard.50k.v2"]);
  assert.equal(planFor(ffn, "max-standard", 50000).id, "funded-futures-network.max-standard.50k.v2");
  assert.equal(planFor(ffn, "max-standard", 50000, 1).id, "funded-futures-network.max-standard.50k");
  assert.equal(planFor(ffn, "max-standard", 50000, "funded-futures-network.max-standard.50k").id, "funded-futures-network.max-standard.50k");
  assert.equal(versionLabel(vs[0]), "Bought before 22 Oct 2026");
  assert.equal(versionLabel(vs[1]), "Bought from 22 Oct 2026");
  assert.equal(INDEX.firms["funded-futures-network"].main.id, "funded-futures-network.max-standard.50k.v2", "the website's table shows the rules still sold");
  assert.match(vs[1].id, /^[a-z0-9][a-z0-9.-]{2,119}$/);
});

test("alternatives and new stages: Alpha Pro's payout choices and its Alpha Prime live stage", () => {
  const alpha = planIn(firm("alpha-capital"), "alpha-capital.alpha-pro-10.100k");
  assert.deepEqual(phaseKeys(alpha), ["evaluation_step1", "evaluation_step2", "funded:bi-weekly", "funded:on-demand", "live"]);
  assert.equal(phaseLabel(alpha, "funded:bi-weekly"), "Funded, Bi-Weekly");
  assert.equal(phaseLabel(alpha, "funded:on-demand"), "Funded, On-Demand");
  for (const k of phaseKeys(alpha)) assert.match(k, /^[a-z0-9_]{1,24}(:[a-z0-9_-]{1,24})?(#[0-9])?$/, "fits accounts.firm_phase");
});

test("a trailing drawdown whose basis isn't published is tracked as 'about', and says why", async () => {
  const { ruleWords } = await import("../src/lib/firm-rules/words.js");
  const fn = planIn(firm("fundednext"), "fundednext.futures-flex.50k");
  const live = phaseOf(fn, "live");
  assert.equal(live.dd.type, "trailing");
  assert.match(ruleWords(fn, live).dd, /trailing \(end of day or intraday isn't published\)/);
  const dd = track({ plan: fn, phase: live, firmName: "FundedNext", group: "futures", start: 2000, now: CT("2026-10-29T12:00"),
    trades: [trade("2026-10-27T09:00", "2026-10-27T10:00", 500)] }).lines.find((l) => l.id === "dd");
  assert.equal(dd.label, "Trailing drawdown");
  assert.equal(dd.floor, 500);
  assert.match(dd.text, /^About \$2,000 above the floor of about \$500/);
  assert.match(dd.note, /doesn't publish whether it trails/);
});
