import { clockWords, money } from "./track.js";

const CHECK = { unclear: "Check with the firm", not_found: "Not published" };
const amount = (r, plan) => (r?.a != null ? r.a : r?.pct != null ? (r.pct * plan.size) / 100 : null);
const or = (r, fn, empty = "–") => (r == null ? empty : r === false ? "None" : r.c ? CHECK[r.c] : fn(r));

export function ruleWords(plan, phase) {
  const cur = plan.cur || "USD";
  const m = (n) => money(n, cur);
  const firmStart = phase.start ?? plan.size;
  return {
    dll: or(phase.dll, (r) => {
      if (r.opt && r.a == null && r.pct == null) return typeof r.opt === "number" ? `None (optional ${m(r.opt)})` : "None (optional)";
      const a = amount(r, plan);
      if (a == null) return r.w || "See the firm's page";
      const base = `${m(a)}${r.pct != null && r.of !== "initial_balance" ? ` (${r.pct}% of the day's start)` : r.pct != null && r.a == null ? ` (${r.pct}%)` : ""}`;
      return `${base}${r.tiers?.length > 1 ? ", rising with profit" : ""}${r.breach === "fail_account" ? ", ends the account" : r.breach ? ", pauses the day" : ""}`;
    }),
    reset: phase.dll && !phase.dll.c && phase.dll.reset?.t ? clockWords(phase.dll.reset.t, phase.dll.reset.tz) : null,
    dd: or(phase.dd, (r) => {
      const a = amount(r, plan);
      const kind = r.type === "static" ? "static"
        : r.type === "trailing_eod" ? "trailing, end of day"
        : r.type === "trailing_intraday" ? (r.on === "peak_unrealized_equity" ? "trailing intraday, on open profit" : "trailing on the closed balance")
        : r.type === "trailing" ? "trailing (end of day or intraday isn't published)"
        : null;
      const lock = r.lockAt == null ? "" : r.lockAt < firmStart / 2 && firmStart > 1000 ? `, stops at start + ${m(r.lockAt)}` : r.lockAt === firmStart ? ", stops at the start" : `, stops at ${m(r.lockAt)}`;
      return a != null ? `${m(a)}${kind ? ` ${kind}` : ""}${lock}` : r.floor != null ? `Floor ${m(r.floor)}` : "See the firm's page";
    }),
    ddKind: phase.dd && !phase.dd.c ? phase.dd.type || null : null,
    target: or(phase.target, (r) => { const a = amount(r, plan); return a != null ? `${m(a)}${r.pct != null ? ` (${r.pct}%)` : ""}` : "–"; }, "None"),
    cons: or(phase.cons, (r) => {
      const why = (r.for || []).includes("payout") && !(r.for || []).some((x) => /^evaluation/.test(x)) ? "for a payout" : "for passing";
      return r.m === "target" ? `Best day ≤ ${r.cap}% of the target` : `Best day ≤ ${r.cap}% of profit, ${why}`;
    }),
    days: or(phase.days, (r) => `${r.d} minimum`, "None"),
    payDays: phase.pay && !phase.pay.c && phase.pay.d ? `${phase.pay.d}${phase.pay.win != null ? ` days of ${m(phase.pay.win)}+` : " days"}` : null,
    size: or(phase.size, (r) => (r.max != null ? `${r.max} ${r.max === 1 ? "contract" : "contracts"}${r.micro ? ` or ${r.micro} micros` : r.ratio ? ` (${r.ratio * r.max} micros)` : ""}${r.scale ? ", scaling" : ""}`
      : r.lots ? `${r.lots} lots` : r.lev ? `Leverage ${r.lev}` : "–")),
    news: or(phase.news, (r) => (r.ok ? "Allowed" : "Restricted")),
    hold: or(phase.hold, (r) => {
      if (r.night === 0) return r.by?.t ? `Flat by ${clockWords(r.by.t, r.by.tz)}` : "Day trading only";
      return r.wknd === 0 ? "Overnight yes, weekends no" : r.night === 1 ? "Overnight and weekends" : "–";
    }),
    time: phase.time && !phase.time.c ? [phase.time.d ? `${phase.time.d} days to pass` : null, phase.time.idle ? `closes after ${phase.time.idle} days idle` : null].filter(Boolean).join(", ") || null : null,
  };
}

export function planLine(plan, phase) {
  const w = ruleWords(plan, phase);
  const m = (n) => money(n, plan.cur || "USD");
  const dll = phase.dll && !phase.dll.c ? phase.dll : null;
  const dllAmount = dll && !(dll.opt && dll.a == null && dll.pct == null) ? (dll.tiers?.length ? dll.tiers[0][1] : amount(dll, plan)) : null;
  const target = phase.target && !phase.target.c ? amount(phase.target, plan) : null;
  return [
    phase.dd && !phase.dd.c && w.dd !== "–" ? `Drawdown ${w.dd}` : null,
    dllAmount ? `Daily loss ${m(dllAmount)}` : dll || phase.dll === false ? "No daily loss limit" : null,
    target ? `Target ${m(target)}` : null,
  ].filter(Boolean).join(" · ");
}
