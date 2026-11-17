import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/ui";
import { SubTabs } from "../components/forms";
import { CAL, art, dayName, isLoss, isWin, monthName, noTradesYet, plural, summarize, todayKey, word } from "../data";
import { openDialog, setState, showMonth, toast, useAllTrades, useCopies, useCounted, useSetups, useStore, useTrades } from "../store";
import { fold } from "../lib/copies";
import { CopyView, accountText, useCopyAccount } from "../components/CopyView";
import { LIVE } from "../mode";
import MonthNav from "../live/MonthNav";
import { useMedia } from "../lib/useMedia.js";
import { MON, pad } from "../lib/basics.js";
import { builtFrom, trustLine } from "../lib/trail";
import { tradesCsv } from "../lib/tradeCsv";
import FlexStudio, { saveBlob } from "./Flex";
import InkPicture from "../drip/InkPicture";
import { STAGES, stageOf, useAccounts, useSample } from "../drip/accounts";
import { withFees } from "../drip/journal/stage";
import { useAccountPick, kindWord, useKinds } from "../drip/view";
import { AccountPick } from "../drip/MoneyBar";
import DayBox from "../drip/journal/DayBox";
import { dayKeyOf, useDayPhotos } from "../drip/journal/dayPhotos";
import { useReveal } from "../drip/motion";
import { Money } from "../drip/Money";
import { Page, Tick, cash } from "../drip/journal/bits";
import Wells, { MonthWells } from "../drip/journal/Wells";
import Built from "../drip/journal/Built";
import { DayView, RowList, TradeView, usePlate } from "../drip/journal/Detail";
import "../drip/journal/journal.css";

const NO_FILTERS = { result: "all", setup: "all", grade: "all", plan: "all" };
const NO_SETUP = "\u0000none"; // the filter value for trades with no setup named
const DAYS_SHOWN = 7;

// A trade's day: its date where it has one (so all time keeps the months apart), else its day of the month on show
const dayId = (t) => t.dayKey ?? t.day;
const dateOf = (t) => (t.dayKey ? new Date(+t.dayKey.slice(0, 4), +t.dayKey.slice(5, 7) - 1, +t.dayKey.slice(8, 10)) : new Date(CAL.year, CAL.month, t.day));
// The Monday of a trade's week ("2026-10-26"), and its label
const weekOf = (t) => { const d = dateOf(t); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const weekLabel = (mon) => `Week of ${+mon.slice(8, 10)} ${MON[+mon.slice(5, 7) - 1]}`;
const newestFirst = (a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0);
const earliest = (a, b) => String(a.time || "").localeCompare(String(b.time || ""));
const sum = (ts) => ts.reduce((a, t) => a + t.pnl, 0);
const daysOf = (rows) => {
  const by = new Map();
  for (const x of rows) by.set(dayId(x), [...(by.get(dayId(x)) || []), x]);
  return [...by.entries()].sort(newestFirst).map(([id, ts]) => ({ id, label: dayName(ts[0].day, ts[0].dayKey || null), rows: [...ts].sort(earliest), net: sum(ts) }));
};

function DayCard({ d, on, onDay, list }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="jn-group reveal">
      <button type="button" className={`jn-dayhead ${on ? "on" : ""}`} onClick={() => onDay(d.id)}>
        <b>{d.label}</b><span className="num">{cash(d.net, { decimals: 0 })}</span>
      </button>
      {list}
    </section>
  );
}

export default function Journal() {
  const month = useTrades();
  const everything = useAllTrades();
  const chosen = useAccountPick();
  const sample = useSample();
  const trades = useMemo(() => month.filter(chosen.has).map(withFees), [month, chosen.has]);
  const whole = useMemo(() => everything.filter(chosen.has).map(withFees), [everything, chosen.has]);
  const tag = [chosen.label, kindWord(useKinds(whole)), sample ? "Sample data" : null].filter(Boolean).join(" · ");
  const photos = useDayPhotos();
  const shown = useCounted(trades);
  const copies = useCopies();
  const copyView = useStore((s) => s.copyView);
  const copyAccount = useCopyAccount();
  const added = useStore((s) => s.accounts);
  const live = useAccounts();
  const accounts = useMemo(() => [...live, ...added.filter((a) => !live.some((x) => x.id === a.id))], [live, added]);
  const setups = useSetups();
  const desk = !useMedia("(max-width: 1100px)");

  const [tab, setTab] = useState("days");
  const [dayOpen, setDayOpen] = useState(null);
  const [tradeOpen, setTradeOpen] = useState(null); // { id, member }
  const [flexing, setFlexing] = useState(false);
  const [built, setBuilt] = useState(null); // { title, trades }
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [limit, setLimit] = useState(DAYS_SHOWN);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [range, setRange] = useState(null); // { label, days: Set } from the Weeks list
  const [review, setReview] = useState(false);
  const period = useStore((s) => s.month);
  useEffect(() => { setRange(null); setLimit(DAYS_SHOWN); setDayOpen(null); }, [period, chosen.ids]);

  // Other screens ask to open a trade, or the trades waiting for review
  const wantSel = useStore((s) => s.journalSel);
  useEffect(() => {
    if (!wantSel) return;
    const hit = everything.find((x) => x.id === wantSel);
    if (hit && !chosen.has(hit)) chosen.all();
    setTradeOpen({ id: wantSel, member: null });
    setTab("days");
    setState({ journalSel: null });
  }, [wantSel]);
  const wantReview = useStore((s) => s.journalReview);
  useEffect(() => {
    if (!wantReview) return;
    if (chosen.ids) chosen.all();
    setReview(true);
    setTab("days");
    setState({ journalReview: null });
  }, [wantReview]);
  // The Desk's calendar asks to open a day
  const wantDay = useStore((s) => s.journalDay);
  useEffect(() => {
    if (wantDay == null) return;
    setDayOpen(wantDay);
    setState({ journalDay: null });
  }, [wantDay]);
  const toReview = useMemo(() => whole.filter((x) => x.needsReview), [whole]);
  useEffect(() => { if (review && toReview.length === 0) setReview(false); }, [review, toReview.length]);

  const needle = q.trim().toLowerCase();
  const active = Object.entries(filters).filter(([, v]) => v !== "all").length;
  const oneAccount = copyView.mode === "each" && copyView.account;
  const rows = useMemo(() => {
    const src = review ? toReview : trades;
    return fold(oneAccount ? src.filter((x) => x.account === oneAccount) : src, copies);
  }, [review, toReview, trades, oneAccount, copies]);
  const matches = useMemo(() => rows.filter((x) =>
    (!needle || `${x.symbol} ${x.setup} ${x.emotion}`.toLowerCase().includes(needle)) &&
    (!range || range.days.has(dayId(x))) &&
    (filters.result === "all" || (filters.result === "wins" ? isWin(x) : filters.result === "losses" ? isLoss(x) : !isWin(x) && !isLoss(x))) &&
    (filters.setup === "all" || (filters.setup === NO_SETUP ? !x.setup : x.setup === filters.setup)) &&
    (filters.grade === "all" || x.grade === filters.grade) &&
    (filters.plan === "all" || (filters.plan === "kept" ? x.followedPlan === true : x.followedPlan === false))), [rows, needle, range, filters]);
  const days = useMemo(() => daysOf(matches), [matches]);
  const weeks = useMemo(() => {
    const by = new Map();
    for (const x of shown) { const w = weekOf(x); by.set(w, [...(by.get(w) || []), x]); }
    return [...by.entries()].sort(newestFirst).map(([w, ts]) => ({ w, ts, s: summarize(ts), days: [...new Set(ts.map(dayId))] }));
  }, [shown]);

  // Any trade can be opened, this month's or not
  const rowOf = useMemo(() => {
    const all = fold(whole, copies);
    return (id) => all.find((x) => x.id === id) || all.find((x) => x.id === copies.of.get(id)?.id) || null;
  }, [whole, copies]);
  const row = tradeOpen ? rowOf(tradeOpen.id) : null;
  const trade = (row?.copies && tradeOpen?.member && row.copies.members.find((m) => m.id === tradeOpen.member)) || row;
  const plate = usePlate(trade);
  const allDays = useMemo(() => daysOf(fold(trades, copies)), [trades, copies]);
  const found = allDays.find((d) => d.id === dayOpen || dayKeyOf(d.id) === dayOpen) || null;
  // A day with no trades can still be opened, to hold a photo
  const day = found || (dayOpen != null ? { id: dayOpen, label: dayName(+String(dayOpen).slice(8), String(dayOpen)), rows: [], net: 0 } : null);
  const reading = found || (desk ? days[0] || allDays[0] : null);

  const net = sum(shown);
  const b = useMemo(() => builtFrom(shown), [shown]);
  const stats = summarize(shown);
  const none = shown.length === 0;
  const firstTime = everything.length === 0;
  const filterable = !none || toReview.length > 0 || review;
  const clearAll = () => { setQ(""); setSearching(false); setFilters(NO_FILTERS); setRange(null); setReview(false); };
  const openDay = (id) => { setDayOpen(id); setTradeOpen(null); };
  const openTrade = (t) => setTradeOpen({ id: t.id, member: null });
  const openMember = (id, member) => setTradeOpen({ id, member });
  const setFilter = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setLimit(DAYS_SHOWN); };
  const figureOf = (title, list) => setBuilt({ title, trades: list });
  const periodWord = CAL.all ? "All time" : `${monthName()} ${CAL.year}`;
  const download = () => {
    const nameOf = (t) => { const a = accounts.find((x) => x.id === t.account); return a ? accountText(a) : ""; };
    const stageWord = (t) => { const a = accounts.find((x) => x.id === t.account); return STAGES[stageOf(a || { kind: t.accountKind })]; };
    const csv = tradesCsv([...everything].reverse().map(withFees), { account: nameOf, stage: stageWord });
    saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), sample ? "marble-sample-trades.csv" : `marble-trades-${todayKey()}.csv`);
    toast("Every trade and note is downloading");
  };

  const dayPane = reading && (
    <DayView day={reading} tag={tag} accounts={accounts} sel={tradeOpen?.id} member={tradeOpen?.member}
      onOpen={openTrade} onMember={openMember} onFigure={() => figureOf(reading.label, reading.rows)} />
  );
  const tradePane = trade && (
    <TradeView key={`${row.id}-${trade.id}`} t={trade} row={row} accounts={accounts}
      onMember={(m) => setTradeOpen({ id: row.id, member: m })} onBackToGroup={() => setTradeOpen(null)}
      onFlex={() => setFlexing(true)} onFigure={() => figureOf(`${trade.symbol} ${trade.side}`, row.copies && trade === row ? row.copies.members : [trade])} />
  );

  return (
    <div className="view jn">
      <div className="jn-split">
        <div className="jn-main">
          <header className="jn-top">
            <div className="jn-top-row">
              <h1>{CAL.all ? "All time" : monthName()}{copyAccount ? <span> · {copyAccount}</span> : null}</h1>
              <div className="jn-tools">
                <button type="button" className="jn-round" data-tour="import" aria-label="Import trades" title="Import trades" onClick={() => openDialog("import")}><Icon name="upload" size={19} /></button>
                <button type="button" className="jn-round solid" aria-label="Log a trade" title="Log a trade (L)" onClick={() => openDialog("trade")}><Icon name="plus" size={20} /></button>
              </div>
            </div>
            {LIVE && <MonthNav />}
            {!none && <>
              <button type="button" className="jn-figure" onClick={() => figureOf(periodWord, shown)} aria-label={`${cash(net)}. See how it was built`}>
                <b style={{ "--len": cash(net, { decimals: 0 }).length }}><Money value={net} /></b>
              </button>
              <p className="jn-sub">{plural(shown.length, "trade")}, {stats.wins} won · {tag}</p>
              <button type="button" className="jn-trust" onClick={() => figureOf(periodWord, shown)}>
                {b.sync.n > 0 && <Tick size={14} />}<span>{trustLine(b)}</span><Icon name="chevR" size={14} />
              </button>
            </>}
          </header>
          <div className="jn-picks"><AccountPick pick={chosen} /></div>
          <CopyView className="jn-copy" />

          {none && !review ? (
            <section className="jn-empty">
              <InkPicture className="ink-still" src={art("masters/jerome-writing-caravaggio", 960)} at="62% 40%" alt="" />
              <div>
                <h2 className="loud">{firstTime ? "Your record starts here." : `${noTradesYet()}.`}</h2>
                <p>{firstTime ? "Drop in the file your platform exports or log a trade by hand, and every figure here comes from it." : "Log a trade or bring some in."}</p>
                <div className="jn-actions row">
                  <button type="button" className="btn" onClick={() => openDialog("import")}><Icon name="upload" size={15} /> Import trades</button>
                  <button type="button" className="btn ghost" onClick={() => openDialog("trade")}><Icon name="plus" size={15} /> Log trade</button>
                </div>
              </div>
            </section>
          ) : (
            <div data-tour="calendar">
              {CAL.all ? <MonthWells trades={shown} onPick={showMonth} /> : <Wells key={`${CAL.year}-${CAL.month}`} trades={shown} photos={photos.byDay} selected={dayOpen} onPick={openDay} />}
            </div>
          )}

          {filterable && (
            <div className="jn-listbar">
              <SubTabs label="Journal view" value={tab} onChange={setTab} items={[["days", "Days"], ["weeks", "Weeks"]]} />
              <div className="jn-tools">
                <button type="button" className={`jn-round ${searching || needle ? "pressed" : ""}`} aria-label="Search trades" aria-expanded={searching} onClick={() => { setSearching(!searching); if (searching) setQ(""); }}><Icon name="search" size={18} /></button>
                <button type="button" className={`jn-round ${showFilters || active ? "pressed" : ""}`} aria-label={`Filters${active ? `, ${active} on` : ""}`} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Icon name="filter" size={17} /></button>
              </div>
            </div>
          )}
          {searching && tab === "days" && (
            <label className="jn-search swap"><Icon name="search" size={16} /><input autoFocus placeholder="Symbol, setup or feeling" aria-label="Search trades by symbol, setup or feeling" value={q} onChange={(e) => { setQ(e.target.value); setLimit(DAYS_SHOWN); }} /></label>
          )}
          {showFilters && filterable && tab === "days" && (
            <div className="jn-filters swap">
              <label><span>Result</span><select value={filters.result} onChange={setFilter("result")}><option value="all">All</option><option value="wins">Wins</option><option value="losses">Losses</option><option value="even">Breakeven</option></select></label>
              <label><span>Setup</span><select value={filters.setup} onChange={setFilter("setup")}><option value="all">All</option>{setups.map((s) => <option key={s}>{s}</option>)}<option value={NO_SETUP}>No setup</option></select></label>
              <label><span>Grade</span><select value={filters.grade} onChange={setFilter("grade")}><option value="all">All</option>{["A+", "A", "B", "C"].map((g) => <option key={g}>{g}</option>)}</select></label>
              <label><span>Plan</span><select value={filters.plan} onChange={setFilter("plan")}><option value="all">All</option><option value="kept">On plan</option><option value="broke">Off plan</option></select></label>
              {active > 0 && <button type="button" className="link" onClick={() => setFilters(NO_FILTERS)}>Reset</button>}
            </div>
          )}
          {(toReview.length > 0 || range) && tab === "days" && (
            <div className="stage-chips jn-marks">
              {toReview.length > 0 && <button type="button" aria-pressed={review} onClick={() => { setReview(!review); setLimit(DAYS_SHOWN); }}>Needs review, {toReview.length}</button>}
              {range && <button type="button" aria-pressed="true" aria-label={`Show all days, not just ${range.label}`} onClick={() => setRange(null)}>{range.label} <Icon name="close" size={12} /></button>}
            </div>
          )}

          {tab === "days" && filterable && (
            <div className="jn-days swap" key="days" data-tour="trade">
              {days.length === 0 && <p className="jn-none">No trades match. <button type="button" className="link" onClick={clearAll}>Clear search and filters</button></p>}
              {days.slice(0, limit).map((d) => (
                <DayCard key={d.id} d={d} on={reading?.id === d.id && desk} onDay={openDay}
                  list={<RowList rows={d.rows} sel={tradeOpen?.id} member={tradeOpen?.member} onOpen={openTrade} onMember={openMember} accounts={accounts} />} />
              ))}
              {days.length > limit && <button type="button" className="btn ghost jn-more" onClick={() => setLimit((n) => n + DAYS_SHOWN)}>Show {Math.min(DAYS_SHOWN, days.length - limit)} more {word(Math.min(DAYS_SHOWN, days.length - limit), "day")}</button>}
            </div>
          )}

          {tab === "weeks" && filterable && (
            <div className="jn-weeks jn-group swap" key="weeks">
              {weeks.map(({ w, ts, s, days: ds }) => (
                <button type="button" key={w} className="jn-week" onClick={() => { setRange({ label: weekLabel(w), days: new Set(ds) }); setTab("days"); setLimit(50); }}>
                  <span><b>{weekLabel(w)}</b><small>{plural(ds.length, "day")}, {plural(ts.length, "trade")}{s.wins + s.losses ? `, ${s.winRate.toFixed(0)}% won` : ""}</small></span>
                  <span className="num">{cash(s.net, { decimals: 0 })}</span>
                </button>
              ))}
            </div>
          )}

          {!firstTime && <button type="button" className="jn-export" onClick={download}>Export every trade and note</button>}
        </div>

        {desk && (reading || trade) && (
          <aside className="jn-side" aria-label={trade ? "The trade" : "The day"}>
            {trade && <button type="button" className={`jn-back ${plate ? "on-picture" : ""}`} onClick={() => setTradeOpen(null)} aria-label="Back to the day"><Icon name="chevL" size={22} /></button>}
            {trade ? tradePane : dayPane}
          </aside>
        )}
      </div>

      {day && !trade && <DayBox day={day} tag={tag} accounts={accounts} sel={tradeOpen?.id} member={tradeOpen?.member} onOpen={openTrade} onMember={openMember}
        onClose={() => setDayOpen(null)} onFigure={() => figureOf(day.label, day.rows)} />}
      {!desk && trade && <Page label={`${trade.symbol} ${trade.side}`} onClose={() => setTradeOpen(null)} onPicture={!!plate}>{tradePane}</Page>}
      {built && <Built title={built.title} tag={tag} trades={built.trades} onClose={() => setBuilt(null)} />}
      {flexing && trade && <FlexStudio trade={row?.copies && trade === row ? row.copies.members[0] : trade} onClose={() => setFlexing(false)} />}
    </div>
  );
}
