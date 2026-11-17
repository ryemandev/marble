import { useMemo, useState } from "react";
import { Avatar, Icon } from "../components/ui";
import { NOW, plural, todayOf } from "../data";
import { openDialog, setState, useAllTrades, useCounted, useFolded, useStore } from "../store";
import { useMedia } from "../lib/useMedia.js";
import CryptoDash from "../crypto/CryptoDash";
import AllView from "../crypto/AllView";
import FitCard from "../drip/floor/FitCard";
import "../drip/floor/floor-screen.css";
import { shortMoney } from "../lib/money";
import { useAccounts } from "../drip/accounts";
import { Tracker, useDesk, useRoom } from "../drip/Trackers";
import { firmOf } from "../live/firms";
import { keyOf, money, nextFinish, recordSince, today, todayId, useCloses, weekOf, finishFor } from "../drip/week";
import { useFlexStyle } from "./flexpics";
import { inSpan, monthName, spanOf, totalOf, tradeDay, useKinds, useMoney } from "../drip/view";
import { RangeDates, AccountPick } from "../drip/MoneyBar";
import DeskMore from "../drip/desk/DeskMore";
import DeskPlate, { DeskRuler } from "../drip/desk/DeskPlate";
import { deskLine, lastDay } from "../drip/desk/line";
import Built from "../drip/journal/Built";
import { FirstLinks } from "../drip/desk/FirstLinks";
import "../drip/desk/desk.css";
import { useFloor } from "../drip/floor";
import { FirstHold, dayCardOf } from "../drip/DailyClose";

export default function Dashboard({ go }) {
  const world = useStore((s) => s.world);
  if (world === "crypto") return <CryptoDash go={go} />;
  if (world === "all") return <AllView go={go} />;
  return <Desk go={go} />;
}

/* ---------- The desk ---------- */

function Desk({ go }) {
  const all = useFolded(useAllTrades());
  const accounts = useAccounts();
  const closing = useStore((s) => s.closing);
  useStore((s) => s.tick); // "today" moves on at midnight
  const closes = useCloses();
  const { active, choose } = useDesk();
  const firstTime = all.length === 0;

  const view = useMoney("desk");
  const { pool, trades, span, period, tag, aside } = view;
  const net = useMemo(() => totalOf(trades), [trades]);
  const day = keyOf(today()); // the clock the totals read, so they all move on together
  const week = useMemo(() => weekOf(pool, period.kind === "week" ? period.back || 0 : 0), [pool, period, day]);
  // The marks under the week's total say which days were closed, never which were won
  const days = useMemo(() => week.days.map((d) => ({ ...d, closed: !!closes[d.key] })), [week, closes]);
  const cells = useMemo(() => [["day", "Today"], ["week", "Week"], ["month", monthName(today())], ["all", "All time"]].map(([kind, word]) => {
    const s = spanOf({ kind });
    return { kind, word, value: totalOf(pool.filter((t) => inSpan(t, s))) };
  }), [pool, day]);

  // Today's pill follows the same rule as the total: real dollars when there are any, else simulated ones, said so
  const every = useAllTrades();
  const dayKinds = useKinds(every);
  const everyToday = todayOf(useCounted(every)), realToday = todayOf(useCounted(dayKinds.real));
  const simToday = realToday.trades === 0 && everyToday.trades > 0 && (dayKinds.mixed || dayKinds.simulated);
  const todays = { ...everyToday, pnl: realToday.trades ? realToday.pnl : everyToday.pnl };
  const closed = closes[todayId()];
  const count = Object.keys(closes).length;
  const coming = nextFinish(count);
  const flexStyle = useFlexStyle();
  const finish = finishFor(count, flexStyle.finish);
  const lastCard = useMemo(() => dayCardOf({ all, accounts, closes, count }), [all, accounts, closes, count]);
  const beginClose = (at) => setState({ closing: at });
  const wide = useMedia("(min-width: 1101px)");
  const [built, setBuilt] = useState(false);

  // The one account the drawdown line reads: the one picked, else the one last traded, so it sits beside that money,
  // else the one trades log to, else the first with a firm
  const latest = useMemo(() => pool.reduce((a, t) => (!a || tradeDay(t) > tradeDay(a) ? t : a), null), [pool]);
  const picked = view.accounts.ids?.size === 1 ? accounts.find((a) => view.accounts.ids.has(a.id)) : null;
  const ruled = (view.accounts.ids ? [picked] : [accounts.find((a) => a.id === latest?.account), accounts.find((a) => a.id === active), ...accounts]).find((a) => a && firmOf(a.firm)) || null;
  const room = useRoom(ruled);
  const last = useMemo(() => lastDay(pool, day, tradeDay), [pool, day]);
  const tradedToday = useMemo(() => pool.some((t) => tradeDay(t) === day), [pool, day]);
  const line = deskLine({
    today: { trades: tradedToday, net: cells[0].value },
    last,
    left: room ? room.left : null,
    todayChosen: period.kind === "day" && !period.back,
  });
  const label = period.kind === "month" && !period.back ? monthName(today()) : span.label;
  const labelWords = [view.simulated ? "Simulated" : null, view.sample ? "Sample data" : null].filter(Boolean);
  const unset = period.kind === "range" && !(period.from && period.to);

  if (firstTime) {
    // The hold stays under the black until Done, so it still hears the finger lift
    const hold = (!closed || closing === "first") && <div className="fs-hold" data-tour="start"><FirstHold /></div>;
    return (
      <div className="view desk">
        <div className="desk-bar"><p>{NOW.label.replace(" · ", " ")}</p></div>
        <div className="desk-top">
          <div className="desk-left" data-tour="tank">
            <DeskPlate label="Today" words={labelWords} dayWord={`Day ${count + (closed ? 0 : 1)}`} days={weekOf([]).days.map((d) => ({ ...d, closed: !!closes[d.key] }))}
              line={closed ? `On record since ${recordSince(closes)}.` : "Your record starts when you close."} />
            {!wide && hold}
          </div>
          <div className="desk-right">
            {wide && hold}
            {count > 0 && <DeskCard bare card={lastCard} finish={finish} count={count} coming={coming} go={go} onOpen={() => beginClose("card")} />}
            <FirstLinks accounts={accounts} />
          </div>
        </div>
      </div>
    );
  }

  const closeBlock = (
    <>
            <div className="close-row" data-tour="start">
              {closed ? (
                <button type="button" className="close-pill done" onClick={() => beginClose("card")}>
                  <span><b>Today is closed</b><small>See your card</small></span>
                  <Icon name="check" size={20} />
                </button>
              ) : todays.trades ? (
                <button type="button" className="close-pill" onClick={() => beginClose("review")}>
                  <span><b>Close today</b><small>{plural(todays.trades, "trade")}, {money(todays.pnl, { sign: true })}{simToday ? " simulated" : ""}</small></span>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M10.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ) : (
                <>
                  <button type="button" className="close-pill open" onClick={() => beginClose("review")}>
                    <span><b>Close the day</b></span>
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M10.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button type="button" className="close-log" data-tour="log" onClick={() => openDialog("trade")}>Log a trade</button>
                </>
              )}
              {(todays.trades > 0 || closed) && <button type="button" className="log-round" data-tour="log" aria-label="Log a trade" title="Log a trade (L)" onClick={() => openDialog("trade")}><Icon name="plus" size={20} /></button>}
            </div>
    </>
  );
  const ruler = room && <DeskRuler account={ruled} room={room} />;
  return (
    <div className="view desk">
      <div className="desk-bar">
        <p>{NOW.label.replace(" · ", " ")}</p>
        <AccountPick />
        <button type="button" className="desk-range" aria-pressed={period.kind === "range"} onClick={() => view.pick(period.kind === "range" ? "week" : "range")}>Range</button>
      </div>

      <div className="desk-top">
        <div className="desk-left" data-tour="tank">
          <DeskPlate label={label} words={labelWords} days={period.kind === "week" ? days : null} net={net} unset={unset} line={line} onFigure={() => setBuilt(true)} />
          <div className="dk-periods" role="group" aria-label="Which money to show">
            {cells.map((c) => (
              <button key={c.kind} type="button" className={c.value < 0 ? "down" : ""} aria-pressed={period.kind === c.kind && !period.back} onClick={() => view.pick(c.kind)}>
                <span>{c.word}</span><b className="num">{Math.abs(c.value) < 100000 ? money(c.value, { sign: true }) : shortMoney(c.value)}</b>
              </button>
            ))}
          </div>
          {period.kind === "range" && <RangeDates period={period} set={view.set} />}
          {!!aside && <p className="dk-sim">Evaluation and paper: <b className="num">{money(aside, { sign: true })}</b> simulated</p>}
          {!wide && closeBlock}
          {!wide && ruler}
        </div>
        <div className="desk-right">
          {wide && closeBlock}
          {wide && ruler}

          <DeskTracks accounts={accounts} active={active} choose={choose} />

          <DeskCard card={lastCard} finish={finish} count={count} coming={coming} go={go} onOpen={() => beginClose(lastCard ? "card" : "review")} />
        </div>
      </div>

      <DeskMore view={view} go={go} />

      <FloorNow go={go} />
      {built && <Built title={label} tag={tag} trades={trades} onClose={() => setBuilt(false)} />}
    </div>
  );
}

// A phone has no side rail, so its strip of accounts ends with the way to add one. With no accounts yet, that's all it holds.
function DeskTracks({ accounts, active, choose }) {
  return (
    <div className={`desk-tracks ${accounts.length ? "" : "none"}`} aria-label="Your accounts">
      {accounts.map((a) => <Tracker key={a.id} account={a} on={active === a.id} onClick={() => choose(a)} />)}
      <button type="button" className="tr-add" onClick={() => openDialog("account")}>
        <Icon name="plus" size={18} />
        <span>{accounts.length ? "Add an account" : "Add your first account"}</span>
      </button>
    </div>
  );
}

// Before a first close the same card stands empty, so a trader can see what they're making
const FIRST_CARD = { kind: "day", id: "first", title: "Day 1", when: "Your first close", money: null, fallback: "Closed", stage: null, verified: false };

// The trader's latest card, the real thing at full finish rather than a tile about it
function DeskCard({ card, finish, count, coming, go, onOpen, bare }) {
  return (
    <section className="desk-flex" aria-label="Your latest card">
      <div className="desk-flex-face" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }} aria-label={card ? `Open your card for ${card.when}` : "Close a day to make your first card"}>
        <FitCard card={card || FIRST_CARD} finish={finish} show={{ money: true, record: false, handle: false }} />
      </div>
      {!bare && <div className="desk-flex-foot">
        <p>{card ? (coming ? `${coming.name} finish at ${plural(coming.need, "closed day")}. You're on ${count}.` : "Every finish is yours.") : "Close a day and this card is yours."}</p>
        {count > 0 && <button type="button" className="desk-flex-all" onClick={(e) => { setState({ communityTab: "cards" }); go("community", e); }}>All your cards</button>}
      </div>}
    </section>
  );
}

function FloorNow({ go }) {
  const { here, latest } = useFloor();
  const who = latest && (latest.anonymous ? "Anonymous" : latest.author?.handle ? `@${latest.author.handle}` : "Marble");
  return (
    <button type="button" className="floor-now" onClick={(e) => { setState({ communityTab: "feed" }); go("community", e); }}>
      <span className="floor-head">
        <b>On the Floor</b>
        {here.count > 0 ? (
          <span className="floor-faces">
            {here.faces.map((f) => <Avatar key={f.handle} name={f.name} src={f.src} size={26} />)}
            <span>{here.count} here now</span>
          </span>
        ) : <span className="floor-quiet">Quiet right now</span>}
      </span>
      {latest ? <span className="floor-post"><b>{who}</b> {latest.body}</span> : <span className="floor-post">Nothing new. Be the first to post today.</span>}
    </button>
  );
}
