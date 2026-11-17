import { useMemo } from "react";
import { CAL, monthName, plural } from "../../data";
import { DOW, pad } from "../../lib/basics.js";
import { marketCode } from "../../lib/markets";
import { setState, useStore } from "../../store";
import { TradeRow, cash } from "../journal/bits";
import { Curve, Spread } from "../journal/charts";
import Wells from "../journal/Wells";
import { useDayPhotos } from "../journal/dayPhotos";
import { useReveal } from "../motion";
import { bestOf, statsOf } from "../stats/model";
import { tradeDay } from "../view";
import { SYMBOL, isPayout } from "../../views/money/model";
import "../journal/journal.css"; // the month and the trade rows, before Journal has ever been opened

const dollars = (v) => cash(v, { decimals: 0 });
const when = (key) => { if (!key) return ""; const d = new Date(`${key}T12:00:00Z`); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()}`; };

function Box({ wide, className = "", title, sub, more, onMore, children }) {
  const ref = useReveal();
  return (
    <section ref={ref} className={`dk-box reveal ${wide ? "wide" : ""} ${className}`}>
      <header>
        <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        {more && <button type="button" className="dk-more" onClick={onMore}>{more}</button>}
      </header>
      {children}
    </section>
  );
}

// Biggest win, worst day and the rest, each one a place to go
function Facts({ s, go }) {
  const earned = (x) => (x?.net > 0 ? x : null);
  const hour = earned(bestOf(s.byHour)), cost = s.weekdays.reduce((a, x) => (x.net < (a?.net ?? 0) ? x : a), null), setup = s.bySetup.find((x) => x.net > 0 && x.label !== "No setup");
  const facts = [
    ["Biggest win", s.biggestWin ? dollars(s.biggestWin.pnl) : "None", s.biggestWin ? `${marketCode(s.biggestWin.symbol)}, ${when(s.biggestWin.key)}` : ""],
    ["Biggest loss", s.biggestLoss ? dollars(s.biggestLoss.pnl) : "None", s.biggestLoss ? `${marketCode(s.biggestLoss.symbol)}, ${when(s.biggestLoss.key)}` : ""],
    ["Best day", s.bestDay?.net > 0 ? dollars(s.bestDay.net) : "None", s.bestDay?.net > 0 ? when(s.bestDay.key) : ""],
    ["Worst day", s.worstDay?.net < 0 ? dollars(s.worstDay.net) : "None", s.worstDay?.net < 0 ? when(s.worstDay.key) : ""],
    ["Won", s.wins + s.losses ? `${Math.round(s.rate)}%` : "None", `${s.wins} of ${plural(s.wins + s.losses, "trade")}`],
    ["Average trade", s.count ? dollars(s.perTrade) : "None", s.count ? `${dollars(s.avgWin)} won, ${dollars(-s.avgLoss)} lost` : ""],
    ["Costliest weekday", cost ? cost.label : "None", cost ? dollars(cost.net) : ""],
    [setup ? "Best setup" : "Best hour", setup ? setup.label : hour ? `${hour.key}:00` : "None", setup ? dollars(setup.net) : hour ? dollars(hour.net) : ""],
  ];
  return (
    <div className="dk-facts">
      {facts.map(([k, v, sub]) => (
        <button type="button" key={k} onClick={(e) => go("analytics", e)}>
          <span>{k}</span><b className="num">{v}</b><small>{sub}</small>
        </button>
      ))}
    </div>
  );
}

// What the firms have cost against what they've paid, from the money page
const NONE = [];
function FirmMoney({ go }) {
  const list = useStore((s) => s.money) || NONE; // null when the money didn't load
  const sum = useMemo(() => {
    const cur = list[0]?.currency || "USD";
    const mine = list.filter((e) => (e.currency || "USD") === cur);
    const paid = mine.filter(isPayout).reduce((a, e) => a + e.minor, 0), spent = mine.filter((e) => !isPayout(e)).reduce((a, e) => a + e.minor, 0);
    return { cur, paid, spent, mixed: mine.length !== list.length };
  }, [list]);
  if (!list.length) return null;
  if (sum.mixed) return <Box title="Paid out against fees" sub="All time" more="See it all" onMore={(e) => go("money", e)}><p className="dk-none">In more than one currency, so there's no single total here.</p></Box>;
  const sign = SYMBOL[sum.cur] || "";
  const show = (minor) => `${minor < 0 ? "−" : ""}${sign}${Math.round(Math.abs(minor) / 100).toLocaleString("en-GB")}`;
  const most = Math.max(sum.paid, sum.spent, 1);
  return (
    <Box title="Paid out against fees" sub="All time" more="See it all" onMore={(e) => go("money", e)}>
      <div className="dk-firm">
        <div><span>Payouts</span><b className="num">{show(sum.paid)}</b><i style={{ width: `${(sum.paid / most) * 100}%` }} /></div>
        <div className="down"><span>Fees</span><b className="num">{show(sum.spent)}</b><i style={{ width: `${(sum.spent / most) * 100}%` }} /></div>
      </div>
      <p className="dk-firm-net">{sum.paid - sum.spent >= 0 ? "Ahead by" : "Behind by"} <b className="num">{show(Math.abs(sum.paid - sum.spent))}</b></p>
    </Box>
  );
}

export default function DeskMore({ view, go }) {
  const { trades, pool, span, accounts, tag } = view;
  const s = useMemo(() => statsOf(trades), [trades]);
  const prefix = `${CAL.year}-${pad(CAL.month + 1)}`;
  const month = useMemo(() => pool.filter((t) => tradeDay(t).startsWith(prefix)), [pool, prefix]);
  const photos = useDayPhotos();
  const recent = useMemo(() => [...(s.ts.length ? s.ts : statsOf(pool).ts)].reverse().slice(0, 8), [s, pool]);
  const byAccount = useMemo(() => accounts.accounts.map((a) => {
    const list = view.raw.filter((t) => t.account === a.id && (!span.from || tradeDay(t) >= span.from) && (!span.to || tradeDay(t) <= span.to));
    const net = list.reduce((x, t) => x + t.pnl, 0);
    return { key: a.id, label: a.name, name: a.name, value: net, sub: plural(list.length, "trade"), n: list.length };
  }).filter((r) => r.n).sort((a, b) => b.value - a.value), [accounts.accounts, view.raw, span]);
  const openDay = (id) => { setState({ journalDay: id }); go("journal"); };
  const openTrade = (t) => { setState({ journalSel: t.id }); go("journal"); };
  return (
    <div className="dk-more-grid">
      <Box className="dk-run" title={`Running total, ${span.label.toLowerCase()}`} sub={`${plural(s.count, "trade")}, ${s.days.length ? `${plural(s.days.length, "day")} traded` : "none yet"} · ${tag}`} more="All stats" onMore={(e) => go("analytics", e)}>
        {s.count ? <Curve data={s.curve} labels={s.curveLabels} xTicks={s.ticks.filter((_, i, all) => i === 0 || i === all.length - 1 || i % Math.ceil(all.length / 4) === 0)} height={220} label="Running total" />
          : <p className="dk-none">No trades in this stretch.</p>}
      </Box>
      <Box className="dk-month" title={monthName()} sub="Tap a day to open it, or add a photo of your trade" more="Journal" onMore={(e) => go("journal", e)}>
        <Wells trades={month} photos={photos.byDay} onPick={openDay} />
      </Box>
      {s.count > 0 && (
        <Box wide className="dk-factbox" title="The money, broken down" sub={span.label}>
          <Facts s={s} go={go} />
        </Box>
      )}
      <Box className="dk-recent" title="Latest trades" sub={s.ts.length ? span.label : "Your most recent"} more="All trades" onMore={(e) => go("journal", e)}>
        {recent.length ? <div className="jn-rows">{recent.map((t) => <TradeRow key={t.id} t={t} onOpen={openTrade} />)}</div> : <p className="dk-none">No trades in this stretch.</p>}
      </Box>
      <div className="dk-side">
        {byAccount.length > 1 && (
          <Box title="By account" sub={span.label}>
            <Spread label="Money by account" rows={byAccount} />
          </Box>
        )}
        <FirmMoney go={go} />
      </div>
    </div>
  );
}
