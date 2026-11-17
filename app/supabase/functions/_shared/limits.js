const DAY = 864e5;

const NY = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }) : null;
export const nyDay = (at) => {
  const d = new Date(at);
  if (Number.isNaN(+d)) return null;
  const p = Object.fromEntries(NY.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const cents = (n) => Math.round(n * 100) / 100;

export function rulesOf(r = {}) {
  return {
    lossLimit: pos(r.lossLimit ?? r.daily_loss_limit),
    maxTrades: pos(r.maxTrades ?? r.max_trades),
    stopAfter: pos(r.stopAfter ?? r.stop_after_losses),
  };
}
export const hasRules = (r) => { const x = rulesOf(r); return !!(x.lossLimit || x.maxTrades || x.stopAfter); };

export function limitsSaved(trades = [], rules = {}, opts = {}) {
  const r = rulesOf(rules);
  const days = opts.days ?? 90;
  const now = opts.now == null ? Date.now() : +new Date(opts.now);
  const from = nyDay(now - (days - 1) * DAY);
  const base = { windowDays: days, rules: r, trades: 0, daysTraded: 0, daysHit: 0, daysOver: 0, tradesAfter: 0, afterPnl: 0, kept: 0, byDay: [] };

  if (!r.lossLimit && !r.maxTrades && !r.stopAfter) return { ...base, status: "no-rules" };

  const byDay = new Map();
  let n = 0;
  for (const [i, t] of trades.entries()) {
    if (!t) continue;
    const at = +new Date(t.traded_at);
    if (!Number.isFinite(at) || at > now + DAY) continue;
    const day = t.dayKey || nyDay(at);
    if (!day || day < from) continue;
    const pnl = Number(t.pnl);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({ at, i, pnl: Number.isFinite(pnl) ? pnl : 0 });
    n++;
  }
  if (!n) return { ...base, status: "no-trades" };

  const out = [];
  let daysHit = 0, tradesAfter = 0, afterPnl = 0;
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.at - b.at || a.i - b.i);
    let net = 0, streak = 0, hitAt = -1, hit = [];
    for (let k = 0; k < list.length; k++) {
      const p = list[k].pnl;
      net += p;
      if (p < 0) streak++;
      else if (p > 0) streak = 0;
      const reached = [];
      if (r.lossLimit && -net >= r.lossLimit - 1e-9) reached.push("loss");
      if (r.maxTrades && k + 1 >= r.maxTrades) reached.push("trades");
      if (r.stopAfter && streak >= r.stopAfter) reached.push("streak");
      if (reached.length) { hitAt = k; hit = reached; break; }
    }
    if (hitAt < 0) continue;
    daysHit++;
    const after = list.slice(hitAt + 1);
    if (!after.length) continue;
    const pnl = cents(after.reduce((a, x) => a + x.pnl, 0));
    tradesAfter += after.length;
    afterPnl += pnl;
    out.push({ day, hit, trades: after.length, pnl, hitAt: new Date(list[hitAt].at).toISOString() });
  }
  out.sort((a, b) => (a.day < b.day ? 1 : -1));
  afterPnl = cents(afterPnl);

  const res = { ...base, trades: n, daysTraded: byDay.size, daysHit, daysOver: out.length, tradesAfter, afterPnl, kept: cents(-afterPnl), byDay: out };
  if (!daysHit) return { ...res, kept: 0, status: "never-hit" };
  if (!out.length) return { ...res, kept: 0, status: "stopped" };
  if (afterPnl < 0) return { ...res, status: "saved" };
  if (afterPnl > 0) return { ...res, status: "cost" };
  return { ...res, kept: 0, status: "even" };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const HIT_NAMES = { loss: "loss limit", trades: "most trades a day", streak: "losses in a row" };

export function limitsSavedLine(res, money) {
  const days = (n) => plural(n, "day");
  switch (res.status) {
    case "no-rules": return "Set your daily limits to see what stopping at them would have kept.";
    case "no-trades": return `Import your trade history to see what your limits would have kept over the last ${res.windowDays} days.`;
    case "never-hit": return `None of your limits were reached in the last ${res.windowDays} days.`;
    case "stopped": return `You reached a limit on ${days(res.daysHit)} and stopped ${res.daysHit === 1 ? "there" : "each time"}.`;
    case "saved": return `If you'd stopped at your limits, you'd have kept ${money(res.kept)} over ${days(res.daysOver)}.`;
    case "cost": return `Trades after your limit made ${money(res.afterPnl)} this time, over ${days(res.daysOver)}.`;
    case "even": return `Trades after your limit broke even, over ${days(res.daysOver)}.`;
    default: return "";
  }
}
