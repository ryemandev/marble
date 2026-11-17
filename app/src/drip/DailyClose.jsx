import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Modal, reducedMotion } from "../components/overlay";
import { NOW, isToday } from "../data";
import { marketCode } from "../lib/markets";
import { openDialog, setState, useAllTrades, useFolded, useStore } from "../store";
import FlexStudio, { FORMATS, FlexCard } from "../views/Flex";
import { STAGES, isSample, useAccounts } from "./accounts";
import { Money, figureSize } from "./Money";
import { byStage, closeToday, finishesFor, keyOf, money, realStage, recordSince, splitMoney, stampOf, todayId, unfolded, useCloses } from "./week";
import Pour from "./Pour";

const ORDER = ["live", "funded", "eval", "paper"];
const leadStage = (stages) => ORDER.find((s) => stages[s]?.length);
const sum = (list) => list.reduce((a, t) => a + (+t.pnl || 0), 0);

// A first day with nothing on it stands looking out over what comes next
const FIRST_PICTURE = "masters/wanderer-friedrich";

// The card a closed day makes. Money only ever comes from one stage, and the mark only from a broker.
function cardFor({ trades, accounts, n, when, day }) {
  const stages = byStage(trades, accounts);
  const lead = leadStage(stages);
  const list = lead ? stages[lead] : [];
  return {
    kind: "day",
    id: day,
    ...(n === 1 && !trades.length ? { subject: { id: `day:${day}`, month: `day:${day}`, wears: FIRST_PICTURE } } : {}),
    title: `Day ${n}`,
    when,
    money: list.length ? sum(list) : null,
    steps: [...list].sort((a, b) => String(a.traded_at || a.time || "").localeCompare(String(b.traded_at || b.time || ""))).map((t) => +t.pnl || 0),
    fallback: `Day ${n}`,
    stage: list.some((t) => t.account) ? lead : null, // a day on no account can't say what kind of money it is
    verified: list.length > 0 && list.every((t) => t.source === "sync"),
  };
}

// The Desk's small card: the most recent closed day
export function dayCardOf({ all, accounts, closes, count }) {
  const key = Object.keys(closes).sort().at(-1);
  if (!key) return null;
  const trades = all.filter((t) => keyOf(stampOf(t)) === key);
  const d = new Date(`${key}T12:00:00Z`);
  return cardFor({ trades, accounts, n: count, day: key, when: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) });
}

// How long each part takes, in ms. lift: how long a finger left over from the hold stays ignored after it lets go.
const TIMES = { fill: 640, drain: 260, ink: 1000, beat: 120, buttons: 200, lift: 250 };

// The Hold. Ink fills the tube for as long as the finger stays. Lifted early, it drains; once it has filled, the lift
// does nothing. hand is shared with the screen: it says which finger is down, and how long to stay deaf after it left.
function HoldToClose({ hand, onDone, onLift }) {
  const [held, setHeld] = useState(false);
  const timer = useRef(null);
  const finished = useRef(false);
  const calls = useRef(null);
  calls.current = { onDone, onLift };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    calls.current.onDone();
  };
  const start = (e) => {
    if (e.pointerType === "mouse" && e.button) return;
    e.preventDefault();
    if (finished.current || hand.current.who !== null) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the window listeners below still hear the lift */ }
    hand.current.who = e.pointerId;
    setHeld(true);
    timer.current = setTimeout(finish, TIMES.fill);
  };

  useEffect(() => {
    const lift = () => {
      if (hand.current.who === null) return;
      hand.current.who = null;
      if (finished.current) {
        hand.current.quiet = performance.now() + TIMES.lift;
        calls.current.onLift();
        return;
      }
      clearTimeout(timer.current);
      setHeld(false);
    };
    const up = (e) => { if (e.pointerId === hand.current.who) lift(); };
    const noTouches = (e) => { if (!e.touches.length) lift(); };
    const away = () => { if (document.hidden) lift(); };
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", up, true);
    addEventListener("touchend", noTouches, true);
    addEventListener("touchcancel", noTouches, true);
    addEventListener("blur", lift);
    document.addEventListener("visibilitychange", away);
    return () => {
      clearTimeout(timer.current);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      removeEventListener("touchend", noTouches, true);
      removeEventListener("touchcancel", noTouches, true);
      removeEventListener("blur", lift);
      document.removeEventListener("visibilitychange", away);
    };
  }, [hand]);

  return (
    <button
      type="button"
      className={`hold ${held ? "held" : ""}`}
      onPointerDown={start}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); hand.current.keys = true; setHeld(true); finish(); } }}
    >
      <span className="hold-label">Hold to close the day</span>
      <span className="hold-fill" aria-hidden="true"><span className="hold-label on">Hold to close the day</span></span>
    </button>
  );
}

// The first desk's hold, with no review before it. The black comes up while the finger may still be down, so the Close
// listens to this same hand.
const firstHand = { current: { who: null, quiet: 0, lifted: null } };
export function FirstHold() {
  const done = () => {
    closeToday({ pnl: null, trades: 0 });
    setState({ closing: "first" });
  };
  return <HoldToClose hand={firstHand} onDone={done} onLift={() => firstHand.current.lifted?.()} />;
}

function FittedCard({ card, finish, founder }) {
  const box = useRef(null);
  const f = FORMATS.wide;
  const [scale, setScale] = useState(() => Math.min(1, (innerWidth - 32) / f.w));
  useLayoutEffect(() => {
    const el = box.current;
    const fit = () => setScale(Math.min(1, el.clientWidth / f.w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [f.w]);
  return (
    <div className="close-fit" ref={box} style={{ aspectRatio: `${f.w} / ${f.h}` }}>
      <div style={{ width: f.w * scale, height: f.h * scale }}>
        <div className="flex-scale" style={{ transform: `scale(${scale})` }}>
          <FlexCard card={card} format="wide" finish={finish} founder={founder} show={{ money: true, record: false, handle: true }} />
        </div>
      </div>
    </div>
  );
}

// A long day's rows scroll. The list fades at its foot while there's more below it.
function Rows({ children }) {
  const box = useRef(null);
  const [more, setMore] = useState(false);
  const look = () => { const el = box.current; setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 1); };
  useLayoutEffect(() => {
    look();
    const ro = new ResizeObserver(look);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  return <ul ref={box} className={`close-rows ${more ? "more" : ""}`} onScroll={look}>{children}</ul>;
}

function Closing({ first }) {
  const all = useFolded(useAllTrades());
  const accounts = useAccounts();
  const closes = useCloses();
  const seat = useStore((s) => s.me?.seat);
  useStore((s) => s.tick);
  const [step, setStep] = useState(first === "review" ? "review" : "pouring"); // review, pouring, card
  const [cut, setCut] = useState(first !== "review"); // the card is made while the review is up, so the ink never waits on it
  const [shown, setShown] = useState(false); // the day's end has come up
  const [armed, setArmed] = useState(false); // Done and Share answer
  const [studio, setStudio] = useState(false);
  const [line, setLine] = useState(""); // an optional line, shown back at the next close
  const opening = first === "first"; // the first desk's hold: the day is closed already, and there was no review
  const hand = useRef(opening ? firstHand.current : { who: null, quiet: 0 });
  const up = useRef(false);
  const done = useRef(null);
  const end = useRef(null);
  const shut = () => setState({ closing: null });

  const already = !!closes[todayId()];
  const past = first === "card" && !already; // the Desk's card, with today still open: that's the last closed day
  const fresh = useRef(first !== "card"); // true when this day was closed just now
  const trades = useMemo(() => all.filter(isToday), [all]);
  const perAccount = useMemo(() => [...new Set(unfolded(trades).map((t) => t.account))].map((id) => {
    const a = accounts.find((x) => x.id === id);
    return { id, name: a?.name || "No account", net: sum(unfolded(trades).filter((t) => t.account === id)) };
  }), [trades, accounts]);
  const dayMoney = useMemo(() => splitMoney(trades, accounts), [trades, accounts]);
  const count = Object.keys(closes).length + (already || past ? 0 : 1);
  const earned = finishesFor(count).at(-1);
  const unlocked = fresh.current && finishesFor(count - 1).at(-1).id !== earned.id;
  const when = NOW.short || NOW.label;
  const lastCloses = past ? closes : null; // closing today mustn't make a new card under the ink
  const card = useMemo(() => (past ? dayCardOf({ all, accounts, closes: lastCloses, count }) : cardFor({ trades, accounts, n: count, when, day: todayId() })), [past, all, lastCloses, trades, accounts, count, when]);
  const sample = isSample();
  const kind = realStage(trades, accounts);
  const word = !trades.length ? null : kind ? STAGES[kind] : dayMoney.simulated ? "Today, simulated" : "Today";

  const lastDay = Object.keys(closes).filter((d) => d !== todayId()).sort().at(-1);
  const lastLine = lastDay ? closes[lastDay].line : null;

  const finishClose = () => {
    const said = line.trim();
    closeToday({ pnl: card.money, trades: trades.length, ...(said ? { line: said } : {}) });
  };

  // Done and Share wake only once they're up and no finger is left over from the hold
  const arm = useRef(null);
  arm.current = () => {
    if (!up.current || hand.current.who !== null) return;
    const wait = hand.current.quiet - performance.now();
    if (wait > 0) { setTimeout(() => arm.current(), wait + 1); return; }
    setArmed(true);
  };

  useEffect(() => {
    if (!opening) return undefined;
    const heard = hand.current;
    heard.lifted = () => arm.current();
    return () => { heard.lifted = null; };
  }, [opening]);

  useEffect(() => {
    if (cut) return undefined;
    let wait = 0;
    const raf = requestAnimationFrame(() => { wait = setTimeout(() => setCut(true), 0); });
    return () => { cancelAnimationFrame(raf); clearTimeout(wait); };
  }, [cut]);

  // Black from edge to edge while the reveal is up, the phone's bars and all
  useEffect(() => {
    if (step !== "card") return undefined;
    const bar = document.querySelector('meta[name="theme-color"]');
    const was = bar?.content;
    document.documentElement.classList.add("close-black");
    if (bar) bar.content = "#000000";
    const still = reducedMotion();
    const a = setTimeout(() => setShown(true), still ? 0 : TIMES.beat);
    const b = setTimeout(() => { up.current = true; arm.current(); }, still ? 0 : TIMES.beat + TIMES.buttons);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      document.documentElement.classList.remove("close-black");
      if (bar) bar.content = was;
    };
  }, [step]);

  // Keys go on to Done. A finger or a screen reader starts at the top of what came up, with no ring on the button.
  useEffect(() => { if (armed) (hand.current.keys ? done : end).current?.focus({ preventScroll: true }); }, [armed]);

  // A click left over from the hold never reaches anything
  const quiet = (e) => {
    if (step === "pouring" || hand.current.who !== null || performance.now() < hand.current.quiet) { e.preventDefault(); e.stopPropagation(); }
  };

  return (
    <>
      <Modal label={step === "review" ? "Close today" : `Day ${count} closed`} onClose={shut} className="close-sheet">
        <div className="close-layers" onClickCapture={quiet}>
          {first === "review" && (
            <div className="close-review" hidden={step === "card"}>
              <div className="close-page">
                <button type="button" className="close-x" onClick={shut} aria-label="Not yet" data-autofocus><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M4.5 4.5l11 11M15.5 4.5l-11 11" /></svg></button>
                <div className="close-mid">
                  <p className="close-date">{NOW.label.replace(" · ", " ")}</p>
                  {trades.length > 0
                    ? <div className="close-fig" style={figureSize(dayMoney.money)}><Money value={dayMoney.money} /></div>
                    : <div className="close-fig words" style={{ "--size": "52px", "--ems": 6.2 }}>No trades</div>}
                  <p className="close-word">{[word, sample && "Sample data"].filter(Boolean).join(" · ")}</p>
                  {dayMoney.aside != null && <p className="close-word aside">Evaluation and paper, simulated <span>{money(dayMoney.aside, { sign: true })}</span></p>}
                  {trades.length > 0 ? (
                    <Rows>
                      {perAccount.length > 1 && perAccount.map((p) => (
                        <li key={p.id} className={`quiet ${p.net < 0 ? "down" : ""}`}><span>{p.name}</span><b>{money(p.net, { sign: true })}</b></li>
                      ))}
                      {trades.map((t) => (
                        <li key={t.id} className={+t.pnl < 0 ? "down" : ""}><span>{marketCode(t.symbol)} {t.side}</span><b>{money(+t.pnl || 0, { sign: true })}</b></li>
                      ))}
                    </Rows>
                  ) : (
                    <div className="close-rows"><button type="button" className="close-logit" onClick={() => { shut(); openDialog("trade"); }}>Log a trade</button></div>
                  )}
                </div>
                <label className="close-line">
                  {lastLine && <span>Last close: {lastLine}</span>}
                  <input type="text" value={line} onChange={(e) => setLine(e.target.value)} maxLength={140} placeholder="One line for next time" aria-label="One line for next time, if you want one" autoComplete="off" enterKeyHint="done" />
                </label>
                <HoldToClose hand={hand} onDone={() => { finishClose(); setStep("pouring"); }} onLift={() => arm.current()} />
              </div>
            </div>
          )}

          <section className={`close-reveal ${step === "card" ? "on" : ""} ${shown ? "in" : ""} ${armed ? "armed" : ""}`} aria-live="polite">
            <div className="close-end" ref={end} tabIndex={-1}>
              <h2 className="loud close-title">Day {count} closed</h2>
              {(cut || step !== "review") && <FittedCard card={card} finish={earned.id} founder={seat} />}
              <div className="close-words">
                {opening ? <span className="close-since"><b>On record since {recordSince(closes)}</b>Your trades can come in any time.</span> : <span>{past ? card.when : unlocked ? `You've earned the ${earned.name} finish.` : "Nothing left to do today."}</span>}
                {sample && <span className="close-sample">Sample data</span>}
              </div>
              {step === "card" && (
                <div className="close-actions">
                  <button type="button" ref={done} className="close-done" onClick={shut}>Done</button>
                  <button type="button" className="close-share" onClick={() => setStudio(true)}>Share</button>
                </div>
              )}
            </div>
          </section>

          {step === "pouring" && <Pour className="close-pour" onScreen ms={TIMES.ink} onDone={() => setStep("card")} />}
        </div>
      </Modal>
      {studio && <FlexStudio card={card} finish={earned.id} onClose={() => setStudio(false)} />}
    </>
  );
}

export default function DailyClose() {
  const closing = useStore((s) => s.closing);
  useEffect(() => {
    if (!closing) return undefined;
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = keep; };
  }, [closing]);
  if (!closing) return null;
  return <Closing key={closing} first={closing} />;
}
