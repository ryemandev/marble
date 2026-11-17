import { useMemo, useRef, useState } from "react";
import { CopyView, useCopyAccount } from "../components/CopyView";
import { SubTabs } from "../components/forms";
import { Icon } from "../components/ui";
import { CAL, noTradesYet, plural } from "../data";
import { prepare } from "../lib/oracle";
import { LIVE } from "../mode";
import { AccountName } from "../live/FirmPicker";
import { nyOf } from "../live/time";
import { openDialog, setState, showMonth, useAllTrades, useStore } from "../store";
import { useReveal } from "../drip/motion";
import { Money } from "../drip/Money";
import { cash } from "../drip/journal/bits";
import { Columns, Curve, Spread } from "../drip/journal/charts";
import Built from "../drip/journal/Built";
import Finding, { CostPanel, NoFinding, PeriodHero, useFinding } from "../drip/journal/Finding";
import Ask from "../drip/journal/Ask";
import CryptoPanels from "../drip/journal/CryptoPanels";
import { AccountPick, PeriodPick, RangeDates } from "../drip/MoneyBar";
import { before, inSpan, periodDates, periodWord, useMoney } from "../drip/view";
import { bestOf, heldText, statsOf, worstOf } from "../drip/stats/model";
import { Against, Heat, Scatter, Sides, Table } from "../drip/stats/charts";
import "../drip/journal/journal.css";
import "../drip/stats/stats.css";

const dollars = (v) => cash(v, { decimals: 0 });
const SECTIONS = [["overview", "Overview"], ["days", "Days"], ["time", "Time"], ["held", "Duration"], ["markets", "Markets"], ["habits", "Habits"], ["ask", "Ask"]];
const label = (r) => ({ ...r, sub: `${plural(r.n, "trade")}, ${r.rate}% won, ${dollars(r.avg)} a trade` });
// Today, Yesterday, This week and Last week read as they are. The rest take a word.
const noneIn = ({ kind, back, label }) => (kind === "day" && back > 1 ? `No trades on ${label}` : kind === "day" || (kind === "week" && back < 2) ? `No trades ${label.toLowerCase()}` : `No trades in ${label}`);
const trimTicks = (ticks) => ticks.filter((_, i, all) => i === 0 || i === all.length - 1 || i % Math.ceil(all.length / 5) === 0);

function Panel({ wide, title, sub, children, ...rest }) {
  const ref = useReveal();
  return (
    <section ref={ref} className={`jn-panel reveal ${wide ? "wide" : ""}`} {...rest}>
      {title && <header><h3>{title}</h3>{sub && <p>{sub}</p>}</header>}
      {children}
    </section>
  );
}
const Tile = ({ k, v, sub }) => <div className="st-tile"><span>{k}</span><b className="num">{v}</b>{sub && <small>{sub}</small>}</div>;
const Ledger = ({ rows }) => (
  <div className="st-ledger">
    {rows.map(([k, v, note, down]) => <div key={k}><span>{k}{note && <small>{note}</small>}</span><b className={`num ${down ? "down" : ""}`}>{v}</b></div>)}
  </div>
);
const Rows = ({ rows }) => <div className="st-rows">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b className="num">{v}</b></div>)}</div>;

function Numbers({ view, tab, strip, onFigure, onOpen }) {
  const { trades, pool, raw, span, tag, accounts } = view;
  const crypto = useStore((s) => s.world) === "crypto";
  const cal = { year: CAL.year, month: CAL.month };
  const journal = useMemo(() => prepare(trades, { cal }), [trades]);
  const allJournal = useMemo(() => prepare(pool, { cal }), [pool]);
  const here = useFinding(journal);
  const overall = useFinding(allJournal);
  // A short stretch borrows the whole record, and says so
  const found = here.status === "short" && overall.status === "ok" ? overall : here;
  const foundTag = found === here ? tag : `All time · ${tag}`;
  const byId = useMemo(() => new Map((found === here ? trades : pool).map((t) => [t.id, t])), [found, here, trades, pool]);

  const s = useMemo(() => statsOf(trades), [trades]);
  const prior = before(span);
  const was = useMemo(() => (prior ? statsOf(pool.filter((t) => inSpan(t, prior))) : null), [pool, prior?.from, prior?.to]);
  const history = useMemo(() => statsOf(pool), [pool]);
  const byAccount = useMemo(() => accounts.accounts.map((a) => {
    const list = raw.filter((t) => t.account === a.id && inSpan(t, span));
    const won = list.filter((t) => t.pnl > 0).length, net = list.reduce((x, t) => x + t.pnl, 0);
    return { key: a.id, name: a.name, label: <AccountName account={a} size={16} />, value: net, n: list.length, sub: `${plural(list.length, "trade")}, ${list.length ? Math.round((won / list.length) * 100) : 0}% won`, trades: list };
  }).filter((r) => r.n).sort((x, y) => y.value - x.value), [accounts.accounts, raw, span]);
  const pick = (title) => (r) => { if (r.trades?.length) onFigure(typeof title === "function" ? title(r) : title, r.trades); };
  const bestDayOfWeek = bestOf(s.weekdays), worstDayOfWeek = worstOf(s.weekdays), bestHour = bestOf(s.byHour), worstHour = worstOf(s.byHour);
  const daily = s.days.length > 45 ? s.days.slice(-45) : s.days;
  const word = periodWord(span);
  // A day or a week leads with its own total. So does a stretch with no cost to name.
  const own = span.kind === "day" || span.kind === "week" || found.status !== "ok";
  const newest = useMemo(() => [...trades].sort((a, b) => (b.traded_at || "").localeCompare(a.traded_at || "") || (b.id > a.id ? 1 : -1)), [trades]);
  const built = () => onFigure(word, trades);

  return (
    <div className="sv-body swap" key="numbers">
      {own
        ? <PeriodHero head={word} net={s.net} title={periodDates(span)} foot={`${plural(s.count, "trade")}, ${s.wins} won`} tag={tag} rows={newest} onOpen={onOpen} onFigure={built} />
        : <Finding found={found} tag={foundTag} tradeOf={(id) => byId.get(id)} onOpen={onOpen} />}
      {strip}

      {tab === "overview" && <div className="st-sec swap" id="st-overview" key="overview">
        {own ? (
          <div className="st-pair">
            <div><span>Money made</span><b><Money value={s.grossWin} /></b></div>
            <div><span>Money lost</span><b><Money value={-s.grossLoss} /></b></div>
          </div>
        ) : (
          <div className="st-line">
            <button type="button" onClick={built} aria-label={`${word}, ${cash(s.net)}. See how it was built`}><span>{word}</span><b><Money value={s.net} /></b></button>
            <dl>
              <div><dt>Money made</dt><dd className="num">{dollars(s.grossWin)}</dd></div>
              <div><dt>Money lost</dt><dd className="num down">{dollars(-s.grossLoss)}</dd></div>
            </dl>
          </div>
        )}
        <Panel wide>
          <p className="jn-sub">{plural(s.count, "trade")}, {s.wins} won · {word} · {tag}</p>
          <Curve data={s.curve} labels={s.curveLabels} xTicks={trimTicks(s.ticks)} height={240} label={`Running total, ${word}`} />
        </Panel>
        <Ledger rows={[
          ["Fees", dollars(-s.fees), s.fees ? "Where reported" : "None reported"],
          ["Won", `${Math.round(s.rate)}%`, `${plural(s.wins, "win")}, ${plural(s.losses, "loss", "losses")}`],
          ["Made for every $1 lost", s.factor == null ? "None lost" : `$${s.factor.toFixed(2)}`],
          ["Average trade", dollars(s.perTrade), null, s.perTrade < 0],
          ["Average win", s.wins ? dollars(s.avgWin) : "None"],
          ["Average loss", s.losses ? dollars(-s.avgLoss) : "None", null, !!s.losses],
          ["Win size to loss size", s.sizeRatio == null ? "None" : `${s.sizeRatio.toFixed(2)} to 1`],
          ["Biggest win", s.biggestWin ? dollars(s.biggestWin.pnl) : "None", s.biggestWin?.symbol],
          ["Biggest loss", s.biggestLoss ? dollars(s.biggestLoss.pnl) : "None", s.biggestLoss?.symbol, !!s.biggestLoss],
          ["Deepest fall", s.deepest ? dollars(s.deepest) : "None", s.deepest ? "From a high" : null, !!s.deepest],
        ]} />
        {was && was.count > 0 && (
          <Panel wide title="Against the stretch before" sub={prior.label}>
            <Against now={s} was={was} label={prior.label} />
          </Panel>
        )}
        {own && (found.status === "ok" ? <CostPanel found={found} tag={foundTag} tradeOf={(id) => byId.get(id)} onOpen={onOpen} /> : <NoFinding found={found} />)}
      </div>}

      {tab === "days" && <div className="st-sec swap" id="st-days" key="days">
        <div className="sv-grid">
          <Panel wide title="Every day traded" sub={s.days.length > 45 ? "The last 45" : span.label}>
            <Columns items={daily} height={200} label="Money by day" onPick={pick((d) => d.label)} />
          </Panel>
          <Panel title="Up and down days">
            <div className="st-tiles two">
              <Tile k="Up days" v={s.green} sub={`${Math.round(s.greenRate)}% of ${plural(s.days.length, "day")}`} />
              <Tile k="Down days" v={s.red} sub={s.flatDays ? `${s.flatDays} flat` : " "} />
            </div>
            <Rows rows={[["Average day", dollars(s.perDay)], ["Average up day", dollars(s.avgGreen)], ["Average down day", dollars(s.avgRed)], ["Best day", s.bestDay?.net > 0 ? `${dollars(s.bestDay.net)}, ${s.bestDay.label}` : "None"], ["Worst day", s.worstDay?.net < 0 ? `${dollars(s.worstDay.net)}, ${s.worstDay.label}` : "None"], ["Trades a day", s.tradesPerDay.toFixed(1)]]} />
          </Panel>
          <Panel title="Falls from a high" sub={s.deepest ? `Deepest ${dollars(s.deepest)}${s.deepestAt ? `, ${s.deepestAt.slice(8)}/${s.deepestAt.slice(5, 7)}` : ""}. Now ${dollars(s.fromPeak)}` : "None"}>
            <Curve data={s.under} labels={s.curveLabels} xTicks={trimTicks(s.ticks)} height={200} label="How far below its high the running total stood" />
          </Panel>
          {history.byWeek.length > 1 && (
            <Panel wide title="Week by week" sub="All time">
              <Columns items={history.byWeek.slice(-16)} height={190} label="Money by week" onPick={pick((d) => d.title)} />
            </Panel>
          )}
          {history.byMonth.length > 1 && (
            <Panel wide title="Month by month" sub="All time">
              <Columns items={history.byMonth} height={200} label="Money by month" onPick={pick((d) => d.title)} />
              <Table rows={[...history.byMonth].reverse()} first="Month" label="Month by month" onPick={pick((d) => d.title)} />
            </Panel>
          )}
        </div>
      </div>}

      {tab === "time" && <div className="st-sec swap" id="st-time" key="time">
        <div className="sv-grid">
          <Panel wide title="Day of the week" sub={bestDayOfWeek && worstDayOfWeek ? `Best ${bestDayOfWeek.label}, ${dollars(bestDayOfWeek.net)}. Worst ${worstDayOfWeek.label}, ${dollars(worstDayOfWeek.net)}` : ""}>
            <Columns items={s.weekdays} height={190} label="Money by weekday" onPick={pick((d) => d.label)} />
            <Table rows={s.weekdays} first="Day" label="Each weekday" onPick={pick((d) => d.label)} />
          </Panel>
          <Panel wide title="Hour of the day" sub={bestHour && worstHour ? `${crypto ? "UTC" : "New York time"}. Best ${bestHour.key}:00, ${dollars(bestHour.net)}. Worst ${worstHour.key}:00, ${dollars(worstHour.net)}` : crypto ? "UTC" : "New York time"}>
            <Columns items={s.byHour} height={190} label="Money by hour" onPick={pick((d) => d.title)} />
          </Panel>
          <Panel wide title="Every hour of every day" sub="Where the money sits in your week">
            <Heat heat={s.heat} onPick={(c) => onFigure(`${c.dayLabel} ${c.hour}:00`, c.trades)} />
          </Panel>
        </div>
      </div>}

      {tab === "held" && <div className="st-sec swap" id="st-held" key="held">
        <div className="sv-grid">
          <Panel title="How long you stay in" sub={`${s.points.length} of ${plural(s.count, "trade")} have a time`}>
            <div className="st-tiles two">
              <Tile k="Average hold" v={heldText(s.held.all)} sub={`Middle trade ${heldText(s.held.mid)}`} />
              <Tile k="On winners" v={heldText(s.held.win)} />
              <Tile k="On losers" v={heldText(s.held.loss)} />
              <Tile k="Longest" v={heldText(s.held.most)} sub={`Shortest ${heldText(s.held.least)}`} />
            </div>
          </Panel>
          <Panel title="Money by how long" sub="Each stretch of time held">
            <Columns items={s.byHeld.map(label)} height={210} label="Money by time held" onPick={pick((d) => `Held ${d.label}`)} />
          </Panel>
          <Panel wide title="Every trade, held time against money" sub="Tap a dot to open the trade">
            <Scatter points={s.points} label="Time held against money for each trade" onPick={(p) => onOpen(p.t)} />
          </Panel>
        </div>
      </div>}

      {tab === "markets" && <div className="st-sec swap" id="st-markets" key="markets">
        <div className="sv-grid">
          <Panel title="Long and short"><Sides left={s.long} right={s.short} onPick={pick((r) => r.label)} /></Panel>
          <Panel title="Biggest and smallest" sub="How the trades spread out">
            <Columns items={s.shape} height={190} mirror={false} label="Number of trades at each dollar result" format={(v) => plural(v, "trade")} axis={(v) => String(v)} toneOf={(d) => (d.lo < 0 ? "down" : "up")} onPick={pick((d) => d.title)} />
          </Panel>
          <Panel title="Setup" sub="What each one has made"><Spread label="Money by setup" rows={s.bySetup.map(label)} onPick={pick((r) => r.label)} /></Panel>
          <Panel title="Symbol" sub="What each market has made"><Spread label="Money by symbol" rows={s.bySymbol.map(label)} onPick={pick((r) => r.label)} /></Panel>
          {byAccount.length > 1 && <Panel wide={s.bySize.length <= 1} title="Account" sub="Each on its own, copies counted for each"><Spread label="Money by account" rows={byAccount} onPick={pick((r) => r.name)} /></Panel>}
          {s.bySize.length > 1 && <Panel wide={byAccount.length <= 1} title="Size" sub="Money by contracts"><Columns items={s.bySize.map(label)} height={190} label="Money by size" onPick={pick((d) => `${d.label} contracts`)} /></Panel>}
          {crypto && <CryptoPanels trades={trades} count={s.count} />}
        </div>
      </div>}

      {tab === "habits" && <div className="st-sec swap" id="st-habits" key="habits">
        <div className="sv-grid">
          <Panel title="Trade of the day" sub="What the first trade makes against the fifth">
            <Columns items={s.byOrder.map(label)} height={190} label="Money by order in the day" onPick={pick((d) => d.title)} />
          </Panel>
          <Panel title="Busy days" sub="Average money a day, by trades taken">
            <Columns items={s.byBusy} height={190} label="Average money a day by number of trades" onPick={pick((d) => d.title)} />
          </Panel>
          <Panel wide={!s.plan.length} title="After a win, after a loss" sub="The average next trade">
            <div className="st-tiles two">
              <Tile k="After a win" v={s.afterWin == null ? "None" : dollars(s.afterWin)} sub={plural(s.afterWinN, "trade")} />
              <Tile k="After a loss" v={s.afterLoss == null ? "None" : dollars(s.afterLoss)} sub={plural(s.afterLossN, "trade")} />
            </div>
          </Panel>
          {s.plan.length > 0 && <Panel title="On plan and off plan"><Sides left={s.plan[0]} right={s.plan[1]} onPick={pick((r) => r.label)} /></Panel>}
          {s.byMistake.length > 0 && <Panel wide title="What mistakes cost" sub="Money on the trades you tagged. A trade with two mistakes counts under both."><Table rows={s.byMistake} first="Mistake" label="Money by mistake" onPick={pick((r) => r.label)} /></Panel>}
          {s.byFeeling.length > 0 && <Panel wide title="How it felt" sub="Money by feeling"><Spread label="Money by feeling" rows={s.byFeeling.map(label)} onPick={pick((r) => r.label)} /></Panel>}
          {s.byGrade.length > 0 && <Panel wide title="Grade" sub="Money by the grade you gave"><Table rows={s.byGrade} first="Grade" label="Money by grade" onPick={pick((r) => `Graded ${r.label}`)} /></Panel>}
        </div>
      </div>}
    </div>
  );
}

export default function Analytics({ go }) {
  const everything = useAllTrades();
  const view = useMoney("stats");
  const { trades, pool, span, tag, sample } = view;
  const copyAccount = useCopyAccount();
  const stored = useStore((s) => s.statsTab);
  const tab = SECTIONS.some(([k]) => k === stored) ? stored : "overview";
  const mark = useRef(null);
  const [built, setBuilt] = useState(null);
  const open = (t) => {
    if (LIVE && t.traded_at) { const d = nyOf(t.traded_at); showMonth(d.year, d.month); }
    setState({ journalSel: t.id });
    go?.("journal");
  };
  const firstTime = everything.length === 0;
  // Changing tab keeps the strip where it is, even once it has stuck to the top of the page
  const change = (k) => {
    const at = mark.current ? Math.max(0, Math.round(mark.current.getBoundingClientRect().top + window.scrollY - 8)) : 0;
    const past = window.scrollY > at;
    setState({ statsTab: k });
    requestAnimationFrame(() => { if (k === "ask" || tab === "ask") window.scrollTo(0, 0); else if (past) window.scrollTo(0, at); });
  };
  const strip = (
    <>
      <span className="st-mark" ref={mark} />
      <div className="st-strip"><SubTabs label="Stats section" value={tab} onChange={change} items={SECTIONS} /></div>
    </>
  );
  const unset = span.kind === "range" && !(span.from && span.to);
  return (
    <div className="view jn sv">
      <h1 className="sr-only">Stats</h1>
      {tab === "ask" ? <p className="jn-title-small">All time{copyAccount ? <span> · {copyAccount}</span> : null}</p> : (
        <div className="st-bar">
          <PeriodPick view={view} word={periodWord(span)} />
          <AccountPick />
          {copyAccount && <p className="jn-title-small"><span>{copyAccount}</span></p>}
        </div>
      )}
      {tab !== "ask" && span.kind === "range" && <RangeDates period={view.period} set={view.set} />}
      <CopyView className="jn-copy" />
      {tab === "ask" ? <>{strip}<Ask trades={pool} tag={tag} sample={sample} go={go} /></> : unset ? <>{strip}
        <section className="sv-quiet">
          <b>Set the dates</b>
          <p>Your numbers show once both dates are in.</p>
        </section></> : trades.length === 0 ? <>{strip}
        <section className="sv-quiet">
          <b>{firstTime ? "Your numbers start with your first trade." : span.kind === "month" && !span.back ? `${noTradesYet()}.` : `${noneIn(span)}.`}</b>
          <p>Log a trade or bring some in, and what they made shows here.</p>
          <div className="jn-actions row">
            <button type="button" className="btn" onClick={() => openDialog("import")}><Icon name="upload" size={15} /> Import trades</button>
            <button type="button" className="btn ghost" onClick={() => openDialog("trade")}><Icon name="plus" size={15} /> Log trade</button>
          </div>
        </section></> : <Numbers view={view} tab={tab} strip={strip} onFigure={(title, list) => setBuilt({ title, trades: list })} onOpen={open} />}
      {built && <Built title={built.title} tag={tag} trades={built.trades} onClose={() => setBuilt(null)} />}
    </div>
  );
}
