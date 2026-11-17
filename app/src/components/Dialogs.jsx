import { Suspense, lazy, useState } from "react";
import { Choice, Field, Sheet } from "./forms";
import { Modal } from "./overlay";
import { Icon } from "./ui";
import { EMOTIONS_BAD, EMOTIONS_GOOD, IDEA_AREAS, NOW, SAMPLE, fmtMoney } from "../data";
import { closeDialog, dateOf, dropAccountMoney, getState, goTo, loadState, newId, openDialog, saveTrade, saveTrades, setState, toast, tradedAt, useFolders, useOwnStore, useSetups, useStore, useStrategies } from "../store";
import { reviewFrom } from "../lib/copies";
import { RULES_MAX, THESIS_MAX, WHEN_LEN, WHEN_MAX, charCount, cleanThesis, cleanWhen } from "../lib/playbook";
import { MONTHS, WEEKDAYS } from "../lib/basics.js";
import { LIMITS, hasDetail, parseNum, reviewOf, signedDollars, splitDollars, workOut } from "../lib/trade";
import { nyOf } from "../live/time";
import { videoTime } from "../lib/video";
import { LIVE } from "../mode";
import { FirmField, accountNameFor } from "../live/FirmPicker";
import { firmOf, readAccountName } from "../live/firms";
import FirmPlanFields from "../live/FirmPlanFields";
import { hasRules, sizeLabel } from "../lib/firm-rules/catalog";
import { LimitsPreview } from "./LimitsSaved";
import { utcOf, worldOf } from "../world";
import { FirmRulesSheet } from "../live/FirmTracker";
import MoneyForm from "../views/money/MoneyForm";
import { BackdropForm } from "./Backdrop";
import { money, totals } from "../views/money/model";
import "./logtrade.css";

const ImportForm = lazy(() => import("../live/Import"));
const BugForm = lazy(() => import("../live/BugReport"));
// Adding a crypto account: where it lives, then its details
const AddCrypto = lazy(() => import("../crypto/AddCrypto"));

const num = (v) => (v === "" || v == null || Number.isNaN(+v) ? null : +v);

export default function Dialogs() {
  const d = useStore((s) => s.dialog);
  if (!d) return null;
  if (d.kind === "import") return <Suspense fallback={null}><ImportForm {...d} onClose={closeDialog} /></Suspense>;
  if (d.kind === "bug") return <Suspense fallback={null}><BugForm {...d} onClose={closeDialog} /></Suspense>;
  if (d.kind === "cryptoAccount" || (d.kind === "account" && !d.account && getState().world === "crypto")) return <Suspense fallback={null}><AddCrypto {...d} onClose={closeDialog} /></Suspense>;
  const Form = { trade: TradeForm, strategy: StrategyForm, note: NoteForm, account: AccountForm, idea: IdeaForm, poll: PollForm, rules: RulesForm, money: MoneyForm, firmRules: FirmRulesSheet, backdrop: BackdropForm }[d.kind];
  return Form ? <Form {...d} onClose={closeDialog} /> : null;
}

function NameInput({ id, value, onChange, names, placeholder, ...rest }) {
  return (
    <>
      <input className="input" list={id} value={value} onChange={onChange} placeholder={placeholder} autoComplete="off" {...rest} />
      <datalist id={id}>{names.map((n) => <option key={n} value={n} />)}</datalist>
    </>
  );
}

/* ---------- Log or edit a trade ---------- */

const PV_KEY = "marble-point-values";
const rememberedPV = () => { try { return JSON.parse(localStorage.getItem(PV_KEY)) || {}; } catch { return {}; } };
const rememberPV = (symbol, v) => { try { localStorage.setItem(PV_KEY, JSON.stringify({ ...rememberedPV(), [symbol]: v })); } catch {} };

const two = (n) => String(n).padStart(2, "0");
const utcNow = () => { if (!LIVE) return "17:52"; const u = utcOf(); return `${two(u.hour)}:${two(u.minute)}`; };
// The time on the clock in New York as the form opens, not as the app loaded
const etNow = () => { if (!LIVE) return NOW.time; const n = nyOf(); return `${two(n.hour)}:${two(n.minute)}`; };

function keptFromGrade(trade, strategies) {
  const n = strategies.find((s) => s.setup === trade.setup)?.rules?.length || 0;
  if (!n || !trade.grade) return null;
  const k = /^A/.test(trade.grade) ? n : trade.grade === "B" && n > 1 ? n - 1 : Math.floor((n - 1) / 2);
  return Array.from({ length: n }, (_, i) => i < k);
}

// The picked account, or when that's gone the one the Desk shows as picked: the first still open
function homeAccount(world) {
  const { accounts, deskAccount } = getState();
  const open = accounts.filter((a) => !a.archived && worldOf(a) === world);
  return open.some((a) => a.id === deskAccount) ? deskAccount : open[0]?.id ?? null;
}

const minus = (s) => s.replace("-", "−");
const plainDollars = (v) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
// "Today", or the day the trade is for
function dayWord(date, world) {
  if (date === dateOf(null, world)) return "Today";
  const [y, m, d] = String(date).split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

// What the dollars are worked out from, and what the R is. An edit that changes none of them keeps the stored figure.
const MONEY_FROM = ["symbol", "side", "entry", "exit", "size", "pointValue", "fee", "funding", "amount", "sign"];
const R_FROM = ["side", "entry", "stop", "exit"];
// Everything under Add detail. A problem with any of these opens the fold, so it's never hidden.
const DETAIL = ["date", "time", "entry", "exit", "size", "stop", "r", "pointValue", "leverage", "fee", "funding", "note"];

const Part = ({ label, error, hint, children }) => (
  <label className={`lt-field ${error ? "has-error" : ""}`}>
    <span className="lt-label">{label}</span>
    {children}
    {error ? <span className="lt-error" role="alert">{error}</span> : hint && <span className="lt-hint">{hint}</span>}
  </label>
);

// Dollars first: the symbol, the side and what it made or lost. Everything else sits under Add detail.
function TradeForm({ trade, copies = null, onClose }) {
  const strategies = useStrategies();
  const setups = useSetups();
  const [world] = useState(() => (trade ? worldOf(trade) : getState().world === "crypto" ? "crypto" : "markets"));
  const crypto = world === "crypto";
  const [f, setF] = useState(() => ({
    symbol: trade?.symbol ?? (LIVE ? "" : crypto ? "BTCUSDT" : "NQ"), side: trade?.side ?? "long", setup: trade?.setup ?? "", time: trade?.time ?? (crypto ? utcNow() : etNow()),
    date: dateOf(trade, world),
    leverage: trade?.leverage != null ? String(trade.leverage) : "", fee: trade?.commission != null && crypto ? String(trade.commission) : "", funding: trade?.funding != null ? String(trade.funding) : "",
    entry: trade?.entry ?? "", stop: trade?.stop ?? "", exit: trade?.exit ?? "", size: trade?.size ?? "1", pointValue: "",
    r: trade?.r != null ? String(trade.r) : "", // not on the form: a trade saved with an R keeps it
    amount: trade && Number.isFinite(+trade.pnl) ? String(Math.abs(+trade.pnl)) : "", sign: trade && +trade.pnl < 0 ? -1 : 1,
    emotion: trade?.emotion ?? "", note: trade?.note ?? "",
    kept: trade?.kept ?? (!LIVE && trade ? keptFromGrade(trade, strategies) : null),
    plan: trade?.followedPlan == null ? "" : trade.followedPlan ? "yes" : "no", // for a setup without written rules. Nothing is ticked until the trader ticks it.
  }));
  // An edit saves what the trader didn't touch exactly as it was stored. The review (by the plan, the ticks and the
  // grade) stays unless they answer it again; the dollars stay unless they change something the dollars come from;
  // the R stays unless they change its prices.
  const [was] = useState(f);
  const [reviewed, setReviewed] = useState(false);
  const [unfolded, setUnfolded] = useState(() => !!copies?.length || hasDetail(trade));
  const [focusOn] = useState(() => (trade ? null : f.symbol ? "dollars" : "symbol")); // an edit doesn't raise the keyboard on its own
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const review = (change) => { setReviewed(true); setF(change); };
  const rules = strategies.find((s) => s.setup === f.setup)?.rules ?? [];
  const answered = Array.isArray(f.kept) && f.kept.length === rules.length && rules.length > 0;
  const kept = answered ? f.kept : rules.map(() => false);
  const imported = trade?.source === "import" || trade?.source === "sync";
  const synced = LIVE && trade?.source === "sync";
  const fixed = synced ? { readOnly: true, title: "From the broker: synced numbers can't be edited" } : {};
  const cryptoErr = {};
  const lev = parseNum(f.leverage), feeTyped = parseNum(f.fee), fundTyped = parseNum(f.funding);
  if (crypto) {
    if (Number.isNaN(lev)) cryptoErr.leverage = "Not a number"; else if (lev != null && (lev <= 0 || lev > 1000)) cryptoErr.leverage = "Between 0 and 1,000";
    if (Number.isNaN(feeTyped)) cryptoErr.fee = "Not a number";
    if (Number.isNaN(fundTyped)) cryptoErr.funding = "Not a number";
  }
  const fees = imported ? +trade.commission || 0 : crypto && Number.isFinite(feeTyped) ? feeTyped : 0;
  const funding = imported ? +trade.funding || 0 : crypto && Number.isFinite(fundTyped) ? fundTyped : 0;

  // Typed dollars, with the sign from the buttons, are saved as they are. With an entry and an exit under Add detail
  // Marble works the dollars out instead, and the box shows that figure and locks.
  const w = workOut({ ...f, pnl: signedDollars(f.amount, f.sign) }, { remembered: rememberedPV(), fees: fees - funding, pointValue: imported ? trade?.fills?.pointValue ?? (crypto ? 1 : null) : crypto ? 1 : null, fromFile: imported && !!trade?.fills?.fromFile, rOptional: true });
  const untouched = (keys) => !!trade && keys.every((k) => String(f[k] ?? "").trim() === String(was[k] ?? "").trim());
  const pnl = untouched(MONEY_FROM) && Number.isFinite(+trade.pnl) ? +trade.pnl : w.pnl;
  const r = untouched(R_FROM) ? trade.r ?? null : w.r;
  const errors = { ...w.errors, ...cryptoErr };
  const when = LIVE && !errors.date && !errors.time ? tradedAt(f.date, f.time, world) : null;
  if (when && Date.parse(when) > Date.now() + 10 * 60e3) errors.date = "That's in the future";
  const { followedPlan, grade, kept: keptSaved } = reviewOf({ trade, touched: reviewed, rules, kept: f.kept, plan: f.plan });
  const valid = w.valid && !errors.date && !Object.keys(cryptoErr).length;
  const locked = w.worked && pnl != null;
  const down = locked ? pnl < 0 : f.sign < 0;
  const figure = locked ? plainDollars(pnl) : f.amount;
  const open = unfolded || DETAIL.some((k) => errors[k]) || (w.needsPointValue && pnl == null);
  const needed = [!f.symbol.trim() && "the symbol", ...w.missing].filter(Boolean);
  const blocking = Object.keys(errors).filter((k) => !(k === "symbol" && !f.symbol.trim()));

  const save = () => {
    const clean = (n, raw) => (n == null || Number.isNaN(n) ? raw : String(n));
    if (w.needsPointValue && w.pointValue) rememberPV(f.symbol.trim().toUpperCase(), w.pointValue);
    const t = {
      ...(trade || {}),
      id: trade?.id ?? newId("L"), day: trade?.day ?? NOW.day, date: trade?.date ?? `Oct ${NOW.day}`, weekday: trade?.weekday ?? 2,
      ...(LIVE ? { traded_at: when } : {}),
      time: f.time, hour: +f.time.split(":")[0], symbol: f.symbol.trim().toUpperCase(), side: f.side, setup: f.setup.trim(),
      entry: clean(w.entry, f.entry), stop: clean(w.stop, f.stop), exit: clean(w.exit, f.exit), size: clean(w.size, f.size), r, pnl,
      grade, emotion: f.emotion, needsReview: false, followedPlan, kept: keptSaved, note: f.note.trim(), account: trade?.account ?? (LIVE ? homeAccount(world) : getState().deskAccount ?? (crypto ? "c-bybit" : "apex")),
      world,
      ...(crypto ? { leverage: lev ?? null, ...(imported ? {} : { commission: feeTyped ?? null, funding: fundTyped ?? null }) } : {}),
    };
    if (synced) for (const k of ["traded_at", "time", "hour", "symbol", "side", "entry", "exit", "size", "pnl", "account", "leverage", "commission", "funding"]) t[k] = trade[k];
    if (copies?.length) {
      saveTrades([t, ...copies.map((c) => reviewFrom(t, c))]);
      toast(`Saved ${t.symbol} ${t.side} on ${copies.length + 1} accounts`);
      return onClose();
    }
    saveTrade(t);
    toast(`${trade ? "Saved" : "Logged"} ${t.symbol} ${t.side}, ${minus(fmtMoney(t.pnl, { sign: true }))}`);
    onClose();
  };

  const title = copies?.length ? `Review ${trade.symbol} ${trade.side} on ${copies.length + 1} accounts` : trade ? `Edit ${trade.symbol} ${trade.side}` : "Log a trade";
  const sub = copies?.length ? "One review for every copy: the setup, the checklist, how it felt, the note and a stop go on each account. Each keeps its own prices, size and dollars."
    : [LIVE ? dayWord(f.date, world) : trade ? trade.date : "Today", !LIVE && "Sample data"].filter(Boolean).join(" · ");
  const canSubmit = synced ? !errors.r && !errors.stop && !errors.note : !!valid;
  const typeDollars = (e) => setF((x) => ({ ...x, ...splitDollars(e.target.value, x.sign) }));
  const digits = Math.max(3, String(figure).length);

  return (
    <Modal label={title} onClose={onClose} className="overlay sheet-overlay lt-overlay">
      <form className={`lt ${open ? "open" : ""}`} onSubmit={(e) => { e.preventDefault(); if (canSubmit) save(); }}>
        <header className="lt-top">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="lt-x" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
        </header>
        <div className="lt-body">
          {synced && <p className="lt-fine">Synced from the broker: the time, market, prices, size and dollars are the broker&apos;s own, so only your review can change.</p>}
          <div className="lt-two lt-first">
            <Part label="Symbol" error={f.symbol && errors.symbol}><input className="lt-in lt-symbol" value={f.symbol} onChange={set("symbol")} {...fixed} autoCapitalize="characters" autoComplete="off" maxLength={LIMITS.symbol} placeholder={LIVE ? "NQ" : undefined} data-autofocus={focusOn === "symbol" ? "" : undefined} /></Part>
            <div className="lt-field">
              <span className="lt-label" id="lt-side">Side</span>
              <div className="lt-seg" role="group" aria-labelledby="lt-side">
                {[["long", "Long"], ["short", "Short"]].map(([k, l]) => <button key={k} type="button" aria-pressed={f.side === k} onClick={synced ? undefined : () => set("side")(k)}>{l}</button>)}
              </div>
            </div>
          </div>
          <div className={`lt-field ${errors.pnl ? "has-error" : ""}`}>
            <label className="lt-label" htmlFor="lt-dollars">{crypto ? "Dollars, after fees and funding" : "Dollars"}</label>
            <div className={`lt-big ${down ? "down" : ""} ${locked || synced ? "locked" : ""}`} style={{ "--len": digits }}>
              <span className="lt-fig">
                <span className="lt-pre" aria-hidden="true">{down ? "−" : "+"}$</span>
                <input id="lt-dollars" value={figure} onChange={typeDollars} readOnly={locked || synced} inputMode="decimal" autoComplete="off" placeholder="0"
                  aria-describedby={locked ? "lt-worked" : undefined} title={synced ? fixed.title : undefined} data-autofocus={focusOn === "dollars" ? "" : undefined} />
              </span>
              <div className="lt-sign" role="group" aria-label="Made or lost">
                <button type="button" aria-pressed={!down} aria-label="Made money" disabled={locked || synced} onClick={() => set("sign")(1)}>+</button>
                <button type="button" aria-pressed={down} aria-label="Lost money" disabled={locked || synced} onClick={() => set("sign")(-1)}>−</button>
              </div>
            </div>
            {errors.pnl ? <span className="lt-error" role="alert">{errors.pnl}{locked ? ": check the entry, exit and size." : ""}</span>
              : locked && <span className="lt-hint" id="lt-worked">Worked out from your entry, exit and size. Clear a price to type the dollars yourself.</span>}
          </div>

          <button type="button" className="lt-fold" aria-expanded={open} aria-controls="lt-detail" onClick={() => setUnfolded(!open)}>
            <span><b>{trade ? "Detail" : "Add detail"}</b>{!open && <small>By the plan? Prices, time, setup, how it felt</small>}</span>
            <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true"><path d="M1 1l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          {open && (
            <div className="lt-detail" id="lt-detail">
              {rules.length === 0 && (
                <div className="lt-field">
                  <span className="lt-label" id="lt-plan">By the plan?</span>
                  <div className="lt-plan" role="group" aria-labelledby="lt-plan">
                    {[["yes", "Yes"], ["no", "No"]].map(([k, l]) => <button key={k} type="button" aria-pressed={f.plan === k} onClick={() => review((x) => ({ ...x, plan: x.plan === k ? "" : k }))}>{l}</button>)}
                  </div>
                </div>
              )}
              <div className="lt-two">
                {LIVE
                  ? <Part label={crypto ? "Day (UTC)" : "Day"} error={errors.date}><input className="lt-in" type="date" value={f.date} onChange={set("date")} {...fixed} max={dateOf(null, world)} /></Part>
                  : <Part label="Day"><input className="lt-in" value={trade ? trade.date : `${NOW.day} ${MONTHS[NOW.month]}`} readOnly title="The sample desk stays on its own day" /></Part>}
                <Part label={crypto ? "Time (UTC)" : "Time (ET)"} error={f.time && errors.time}><input className="lt-in" value={f.time} onChange={set("time")} {...fixed} inputMode="numeric" placeholder="HH:MM" /></Part>
              </div>
              <div className="lt-two">
                <Part label="Entry" error={errors.entry}><input className="lt-in" value={f.entry} onChange={set("entry")} {...fixed} inputMode="decimal" /></Part>
                <Part label="Exit" error={errors.exit}><input className="lt-in" value={f.exit} onChange={set("exit")} {...fixed} inputMode="decimal" /></Part>
              </div>
              <div className="lt-two">
                <Part label="Stop" error={errors.stop || errors.r}><input className="lt-in" value={f.stop} onChange={set("stop")} inputMode="decimal" /></Part>
                <Part label={crypto ? "Quantity" : "Contracts"} error={errors.size}><input className="lt-in" value={f.size} onChange={set("size")} {...fixed} inputMode="decimal" /></Part>
              </div>
              {w.needsPointValue && (
                <Part label={`$ per point, ${f.symbol.trim().toUpperCase() || "this symbol"}`} error={errors.pointValue} hint="Marble doesn't know this market yet, so it can't work the dollars out from prices. It remembers what you enter.">
                  <input className="lt-in" value={f.pointValue} onChange={set("pointValue")} inputMode="decimal" />
                </Part>
              )}
              {crypto && <>
                <div className="lt-two">
                  <Part label="Leverage" error={errors.leverage} hint={!f.leverage ? "Optional" : undefined}><input className="lt-in" value={f.leverage} onChange={set("leverage")} {...fixed} inputMode="decimal" placeholder="5" /></Part>
                  <Part label="Fees" error={errors.fee} hint={imported ? "From the file" : "A rebate is negative"}><input className="lt-in" value={imported ? String(trade.commission ?? "") : f.fee} onChange={set("fee")} readOnly={imported} inputMode="decimal" placeholder="0" /></Part>
                </div>
                <Part label="Funding" error={errors.funding} hint={imported ? "From the file" : "Received is +, paid is -"}><input className="lt-in" value={imported ? String(trade.funding ?? "") : f.funding} onChange={set("funding")} readOnly={imported} inputMode="decimal" placeholder="0" /></Part>
              </>}
              <Part label="Setup">
                {LIVE
                  ? <NameInput id="trade-setups" className="lt-in" value={f.setup} names={setups} placeholder="Optional" maxLength={60} onChange={(e) => review((x) => ({ ...x, setup: e.target.value, kept: null }))} />
                  : (
                    <select className="lt-in" value={f.setup} onChange={(e) => review((x) => ({ ...x, setup: e.target.value, kept: null }))}>
                      <option value="">Optional</option>
                      {setups.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  )}
              </Part>
              {rules.length > 0 && (
                <div className="lt-rules" role="group" aria-label={`Checklist for ${f.setup}`}>
                  <div className="lt-rules-top"><span className="lt-label">Checklist for {f.setup}</span>
                    {answered
                      ? <span className="lt-hint">{kept.filter(Boolean).length} of {rules.length} ticked</span>
                      : <button type="button" className="link xs" onClick={() => review((x) => ({ ...x, kept: rules.map(() => true) }))}>Tick them all</button>}
                  </div>
                  {rules.map((rule, i) => (
                    <label key={`${i}-${rule}`} className={`check ${kept[i] ? "done" : ""}`}>
                      <input type="checkbox" checked={kept[i]} onChange={() => review((x) => ({ ...x, kept: kept.map((k, j) => (j === i ? !k : k)) }))} />
                      <span className="box" aria-hidden="true"><Icon name="check" size={11} /></span><span>{rule}</span>
                    </label>
                  ))}
                  {!answered && <p className="lt-hint">Tick the ones you kept.</p>}
                </div>
              )}
              <div className="lt-field">
                <span className="lt-label" id="lt-felt">How it felt</span>
                <div className="lt-chips" role="group" aria-labelledby="lt-felt">
                  {[...EMOTIONS_GOOD, ...EMOTIONS_BAD].map((e) => <button key={e} type="button" aria-pressed={f.emotion === e} onClick={() => set("emotion")(f.emotion === e ? "" : e)}>{e}</button>)}
                </div>
              </div>
              <Part label="Note" error={errors.note} hint={f.note.length > LIMITS.note - 400 ? `${LIMITS.note - f.note.length} characters left` : undefined}><textarea className="lt-in lt-note" value={f.note} onChange={set("note")} maxLength={LIMITS.note} placeholder="Why you took it, and what you'd repeat or change." /></Part>
            </div>
          )}
        </div>
        <footer className="lt-foot">
          {!canSubmit && !synced && needed.length > 0 && !blocking.length && (f.amount || f.entry || f.exit || trade) && (
            <p className="lt-needed">Still needed: {needed.join(", and ")}.</p>
          )}
          <button type="submit" className="lt-go" disabled={!canSubmit}>{trade ? "Save changes" : "Log trade"}</button>
        </footer>
      </form>
    </Modal>
  );
}

/* ---------- A setup, new or edited ---------- */

const PLATES = [["masters/wanderer-friedrich", "The wanderer"], ["anime/night-figure", "Night figure"], ["anime/samurai-duel", "The duel"], ["masters/charging-chasseur-gericault", "The chasseur"], ["masters/colossus-goya", "The colossus"], ["masters/calling-of-matthew-caravaggio", "The calling"], ["masters/self-portrait-rembrandt", "Rembrandt"], ["japan/torii-tunnel", "Torii"]];
const RULE_LEN = 120;

// Lines of a box, tidied; the same line written twice is one line
function linesOf(text) {
  const lines = text.split("\n").map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean);
  return lines.filter((r, i) => lines.findIndex((x) => x.toLowerCase() === r.toLowerCase()) === i);
}

function StrategyForm({ onClose, strategy, setup: blank }) {
  const setups = useSetups();
  const strategies = useStrategies();
  const [setup, setSetup] = useState(strategy?.setup ?? blank ?? (LIVE ? "" : SAMPLE.SETUPS?.[4] ?? ""));
  const [img, setImg] = useState(PLATES.some(([p]) => p === strategy?.img) ? strategy.img : PLATES[4][0]);
  const [thesis, setThesis] = useState(strategy?.thesis ?? "");
  const [when, setWhen] = useState((strategy?.whenRun || []).join("\n"));
  const [rules, setRules] = useState((strategy?.rules || []).join("\n"));
  const [sure, setSure] = useState(false);
  const list = linesOf(rules);
  const whenLines = linesOf(when);
  const name = setup.trim();
  const taken = !!name && strategies.some((x) => x.id !== strategy?.id && x.setup.toLowerCase() === name.toLowerCase());
  const ruleProblem = list.length > RULES_MAX ? `Six at most: take out ${list.length - RULES_MAX}` : list.some((x) => charCount(x) > RULE_LEN) ? `Keep each rule to ${RULE_LEN} characters` : null;
  const whenProblem = whenLines.length > WHEN_MAX ? `Four at most: take out ${whenLines.length - WHEN_MAX}` : whenLines.some((x) => charCount(x) > WHEN_LEN) ? `Keep each line to ${WHEN_LEN} characters` : null;
  const save = () => {
    const next = { setup: name, name: strategy?.setup === name ? strategy.name : name, god: PLATES.find(([p]) => p === img)[1], img, rules: list, thesis: cleanThesis(thesis), whenRun: cleanWhen(whenLines) };
    setState((s) => ({ strategies: strategy ? s.strategies.map((x) => (x.id === strategy.id ? { ...x, ...next } : x)) : [...s.strategies, { id: newId("s"), ...next }] }));
    toast(strategy ? `${next.name} saved` : `${next.name} added to your setups`);
    onClose();
  };
  const remove = () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    setState((s) => ({ strategies: s.strategies.filter((x) => x.id !== strategy.id) }));
    toast(`${strategy.name} taken out of your setups. Its trades stay in the journal.`);
    onClose();
  };
  return (
    <Sheet title={strategy ? strategy.name : "New setup"} sub={strategy ? "Its numbers come from your journal." : "Name the setup, say why it works and write its rules. Its numbers fill in from your journal."}
      onClose={onClose} onSubmit={save} submitLabel={strategy ? "Save setup" : "Add setup"} canSubmit={list.length > 0 && !!name && !taken && !ruleProblem && !whenProblem}
      extra={strategy && <button type="button" className="btn ghost danger" onClick={remove}>{sure ? "Tap again to take it out" : "Take it out"}</button>}>
      <Field label="Setup" span={4} error={taken ? "You already have this setup" : null}>
        {LIVE
          ? <NameInput id="strategy-setups" value={setup} names={setups} placeholder="The setup's name" onChange={(e) => setSetup(e.target.value)} maxLength={60} data-autofocus />
          : <select value={setup} onChange={(e) => setSetup(e.target.value)} data-autofocus>{setups.map((s) => <option key={s}>{s}</option>)}</select>}
      </Field>
      <Field label="Why it works" span={4} hint="In your own words. It opens the setup."><textarea value={thesis} onChange={(e) => setThesis(e.target.value)} rows={3} maxLength={THESIS_MAX} placeholder={LIVE ? "What the market does, and what you take from it" : "Price runs the obvious high, traps the late buyers, then snaps back inside."} /></Field>
      <Field label="When I run it" span={4} hint="Times, markets, news: up to four short lines." error={whenProblem}><textarea value={when} onChange={(e) => setWhen(e.target.value)} rows={3} placeholder={"10:00–13:00 NY\nNQ · ES"} /></Field>
      <Field label="Rules, one per line" span={4} hint="Up to six. They become the checklist when you log a trade." error={ruleProblem}><textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={5} placeholder={LIVE ? "One rule a line" : "Range marked before the open\nBreak and close outside it\nStop inside the range"} /></Field>
      <Field label="Plate" span={4}>
        <div className="art-picker ink" role="group" aria-label="Plate">
          {PLATES.map(([p, n]) => <button key={p} type="button" aria-pressed={img === p} aria-label={n} title={n} style={{ backgroundImage: `url(${import.meta.env.BASE_URL}art/${p}-160.webp)` }} onClick={() => setImg(p)} />)}
        </div>
      </Field>
    </Sheet>
  );
}

/* ---------- New study note ---------- */

function NoteForm({ onClose, note }) {
  const [title, setTitle] = useState(note?.title ?? "");
  const folders = useFolders();
  const [folder, setFolder] = useState(note?.folder ?? (LIVE ? "" : folders[0] ?? ""));
  const [at, setAt] = useState(note?.video ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [sure, setSure] = useState(false);
  const time = videoTime(at);
  const save = () => {
    const next = { title: title.trim(), folder: folder.trim(), video: time.value, body: body.trim() };
    setState((s) => ({ notes: note ? s.notes.map((n) => (n.id === note.id ? { ...n, ...next } : n)) : [{ id: newId("n"), when: "Today", ...next }, ...s.notes] }));
    toast(note ? "Note saved" : "Note added");
    onClose();
  };
  const remove = () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    setState((s) => ({ notes: s.notes.filter((n) => n.id !== note.id) }));
    toast("Note deleted");
    onClose();
  };
  return (
    <Sheet title={note ? note.title || "Note" : "New note"} sub={note ? `${note.folder}${note.when ? ` · ${note.when}` : ""}` : undefined} onClose={onClose} onSubmit={save}
      submitLabel={note ? "Save note" : "Add note"} canSubmit={!!title.trim() && !!folder.trim() && time.ok}
      extra={note && <button type="button" className="btn ghost danger" onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}>
      <Field label="Title" span={4}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} data-autofocus /></Field>
      <Field label="Folder" span={2}>
        {LIVE
          ? <NameInput id="note-folders" value={folder} names={folders} placeholder="Folder name" onChange={(e) => setFolder(e.target.value)} maxLength={40} />
          : <select value={folder} onChange={(e) => setFolder(e.target.value)}>{folders.map((x) => <option key={x}>{x}</option>)}</select>}
      </Field>
      <Field label="Video time" span={2} hint={LIVE ? "Optional: minutes:seconds, or seconds" : "Optional, like 12:44"} error={!time.ok ? "A time like 12:44" : null}><input className="input num" value={at} onChange={(e) => setAt(e.target.value)} placeholder={LIVE ? "mm:ss" : "12:44"} /></Field>
      <Field label="Note" span={4}><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={note ? 10 : 5} maxLength={20000} /></Field>
    </Sheet>
  );
}

/* ---------- Add an account to the desk ---------- */

const KINDS = [["Live", "Live"], ["Eval", "Evaluation"], ["Funded", "Funded"], ["Paper", "Paper"]];

const STATUS_OF = { Live: "live", Eval: "eval", Funded: "funded", Paper: "paper" };
const kindKey = (a) => KINDS.find(([k, l]) => l === a?.kind || k === a?.kind)?.[0] ?? "Live";

function AccountForm({ onClose, account }) {
  const world = account ? worldOf(account) : "markets";
  const [quote, setQuote] = useState(account?.quoteCcy || "USDT");
  const [who, setWho] = useState(() => {
    if (!account) return { firm: null, name: "", label: "" };
    if (account.firm) return { firm: account.firm, name: account.name, label: account.label || "" };
    const read = readAccountName(account.name);
    if (!read) return { firm: null, name: account.name, label: account.label || "" };
    return { firm: read.firm, name: firmOf(read.firm).name, label: account.label || read.label };
  });
  const name = accountNameFor(who);
  const [kind, setKind] = useState(kindKey(account));
  const [balance, setBalance] = useState(account ? String(account.balance) : "");
  const [rules, setRules] = useState({ plan: account?.firmPlan || null, phase: account?.firmPhase || null, size: null });
  const pickRules = (r) => {
    const was = rules.size;
    setRules(r);
    if (!r.plan) return;
    if (!who.label.trim() || (was && who.label === sizeLabel(was))) setWho((w) => ({ ...w, label: sizeLabel(r.size) }));
    if (balance === "" || (was && +balance === was)) setBalance(String(r.size));
    if (r.kind) setKind(KINDS.find(([, l]) => l === r.kind)?.[0] || kind);
  };
  const [removing, setRemoving] = useState(null); // null | "ask"
  const tradeCount = useStore((s) => (account ? s.logged.filter((t) => t.account === account.id).length : 0));
  const allMoney = useOwnStore((s) => s.money);
  const moneyRows = account && Array.isArray(allMoney) ? allMoney.filter((m) => m.account === account.id) : [];
  const bal = parseNum(balance);
  const balError = balance !== "" && (Number.isNaN(bal) || bal < 0) ? "A number, 0 or more" : bal >= 1e11 ? "That balance is too big" : null;
  const save = () => {
    const firm = firmOf(who.firm) ? who.firm : null;
    const plan = firm && hasRules(firm) && rules.plan?.startsWith(`${firm}.`) ? rules.plan : null;
    const fields = { name, firm, label: who.label.trim() || null, kind: KINDS.find(([k]) => k === kind)[1], status: STATUS_OF[kind], balance: Math.round(bal * 100) / 100, world, ...(world === "crypto" ? { quoteCcy: quote } : {}),
      ...(plan || account?.firmPlan ? { firmPlan: plan, firmPhase: plan ? rules.phase : null } : {}) };
    if (account) {
      setState((s) => ({ accounts: s.accounts.map((a) => (a.id === account.id ? { ...a, ...fields } : a)) }));
      toast(`${fields.name} saved`);
    } else {
      const id = newId("a");
      setState((s) => ({ accounts: [...s.accounts, { id, ...fields, change: 0, color: "#c8cacf" }], deskAccount: id }));
      toast(`${fields.name} added. New trades log to it.`);
    }
    onClose();
  };
  const archive = () => {
    setState((s) => ({ accounts: s.accounts.map((a) => (a.id === account.id ? { ...a, archived: true } : a)), deskAccount: s.deskAccount === account.id ? null : s.deskAccount }));
    toast(`${account.name} archived. Its trades are kept.`);
    onClose();
  };
  const remove = (withTrades) => {
    dropAccountMoney(account.id);
    // The server won't let the browser change a synced trade, so these aren't sent: it clears their account itself
    if (!withTrades) loadState({ logged: getState().logged.map((t) => (t.account === account.id && t.source === "sync" ? { ...t, account: null } : t)) });
    setState((s) => ({
      logged: withTrades ? s.logged.filter((t) => t.account !== account.id) : s.logged.map((t) => (t.account === account.id ? { ...t, account: null } : t)),
      accounts: s.accounts.filter((a) => a.id !== account.id),
      deskAccount: s.deskAccount === account.id ? null : s.deskAccount,
    }));
    toast(withTrades ? `${account.name} and its trades deleted` : `${account.name} deleted. Its trades are kept.`);
    onClose();
  };
  const extra = account && LIVE && (removing
    ? <>
      {moneyRows.length > 0 && <span className="xs muted">Its {moneyRows.length === 1 ? "line" : `${moneyRows.length} lines`} on the receipt {moneyRows.length === 1 ? "goes" : "go"} too.</span>}
      <span className="xs muted">{tradeCount ? `${tradeCount} trade${tradeCount === 1 ? "" : "s"}:` : "Delete it?"}</span>
      {tradeCount > 0 && <button type="button" className="btn ghost" onClick={() => remove(false)}>Delete, keep trades</button>}
      <button type="button" className="btn ghost danger" onClick={() => remove(true)}>{tradeCount ? "Delete with trades" : "Delete"}</button>
    </>
    : <>
      <button type="button" className="btn ghost" onClick={archive}>Archive</button>
      <button type="button" className="btn ghost danger" onClick={() => setRemoving("ask")}>Delete</button>
    </>);
  return (
    <Sheet title={account ? `Edit ${account.name}` : "Add an account"} onClose={onClose} onSubmit={save} submitLabel={account ? "Save account" : "Add account"}
      canSubmit={!!name.trim() && name.trim().length <= 60 && balance !== "" && !balError} extra={extra}>
      <Field label={world === "crypto" ? "Exchange, wallet or firm" : "Firm or broker"} span={3} hint="Pick one for its logo, or type your own name"><FirmField value={who} onChange={(v) => setWho({ ...who, ...v })} autoFocus world={world} /></Field>
      <Field label="Label (optional)" span={1} hint="Size or nickname"><input className="input" value={who.label} onChange={(e) => setWho({ ...who, label: e.target.value })} maxLength={40} placeholder="50K" /></Field>
      {LIVE && hasRules(who.firm) && <FirmPlanFields firm={who.firm} value={rules} onChange={pickRules} />}
      <Field label="Type" span={4}><Choice label="Type" value={kind} onChange={setKind} options={KINDS} /></Field>
      {world === "crypto" && <Field label="Kept in" span={2}><Choice label="Currency" value={quote} onChange={setQuote} options={[["USDT", "USDT"], ["USDC", "USDC"], ["USD", "USD"]]} /></Field>}
      <Field label={world === "crypto" ? `Starting balance (${quote})` : LIVE ? "Starting balance ($)" : "Balance ($)"} span={2} error={balError}><input className="input num" value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder={LIVE ? "Starting balance" : "50000"} /></Field>
      {account && Array.isArray(allMoney) && <AccountMoney account={account} rows={moneyRows} />}
    </Sheet>
  );
}

function AccountMoney({ account, rows }) {
  const t = totals(rows);
  const add = (mode) => openDialog("money", { mode, account: account.id });
  const receipt = () => {
    setState((s) => ({ moneyView: { ...s.moneyView, show: `acct:${account.id}`, period: "all" } }));
    closeDialog();
    goTo("money");
  };
  return (
    <div className="field span-4 acct-money">
      <span className="field-label">Fees &amp; payouts</span>
      <p className="acct-money-sum">
        {t.length
          ? t.map((x) => <span key={x.currency} className="num">{money(x.fees, x.currency)} in fees · {money(x.paid, x.currency)} paid out</span>)
          : <span className="muted">Nothing on the receipt for this account yet.</span>}
      </p>
      <div className="acct-money-acts">
        <button type="button" className="btn ghost" onClick={() => add("fee")}><Icon name="plus" size={14} /> Add a fee</button>
        <button type="button" className="btn ghost" onClick={() => add("payout")}><Icon name="plus" size={14} /> Got paid</button>
        {rows.length > 0 && <button type="button" className="link" onClick={receipt}>See its receipt</button>}
      </div>
    </div>
  );
}

/* ---------- Suggest an idea, run a poll ---------- */

function IdeaForm({ onClose }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState(IDEA_AREAS[0]);
  const save = () => {
    const id = newId("u");
    setState((s) => ({
      ideas: [{ id, title: title.trim(), body: body.trim(), area, status: "Under review", votes: 0, by: s.profile.handle, when: "Just now", at: Date.now() }, ...(s.ideas || [])],
      ideaVotes: { ...(s.ideaVotes || {}), [id]: true },
    }));
    toast("Idea posted. Your vote is counted.");
    onClose();
  };
  return (
    <Sheet title="Suggest an idea" sub="Something Marble should do better or start doing. Other traders can vote it up." onClose={onClose} onSubmit={save} submitLabel="Post idea" canSubmit={title.trim().length >= 6}>
      <Field label="Your idea" span={4} hint={`${80 - title.length} characters left`}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={LIVE ? "What should Marble do?" : "Import trades from my broker"} data-autofocus /></Field>
      <Field label="Area" span={4}><Choice label="Area" value={area} onChange={setArea} options={IDEA_AREAS.map((a) => [a, a])} /></Field>
      <Field label="Why it matters (optional)" span={4}><textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={400} rows={4} placeholder="What you'd do with it, and what you do today instead." /></Field>
    </Sheet>
  );
}

function PollForm({ onClose }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [days, setDays] = useState("3");
  const filled = options.map((o) => o.trim()).filter(Boolean);
  // Two choices that say the same thing aren't a choice
  const dupes = filled.length !== new Set(filled.map((o) => o.toLowerCase())).size;
  const save = () => {
    setState((s) => ({ polls: [{ id: newId("p"), question: question.trim(), options: filled.map((o) => [o, 0]), ends: `Ends in ${days} day${days === "1" ? "" : "s"}`, by: s.profile.handle }, ...(s.polls || [])] }));
    toast("Poll is live");
    onClose();
  };
  return (
    <Sheet title="Run a poll" sub="Ask the community what Marble should add next." onClose={onClose} onSubmit={save} submitLabel="Start poll" canSubmit={question.trim().length >= 6 && filled.length >= 2 && !dupes}>
      <Field label="Question" span={4}><input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={100} placeholder="Which should come first?" data-autofocus /></Field>
      {options.map((o, i) => (
        <Field key={i} label={`Choice ${i + 1}`} span={2}><input className="input" value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} maxLength={40} /></Field>
      ))}
      {dupes && <p className="form-problems xs">Two choices are the same. Make each one different.</p>}
      <div className="field span-4" style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        {options.length < 4 && <button type="button" className="link" onClick={() => setOptions([...options, ""])}>+ Add a choice</button>}
        {options.length > 2 && <button type="button" className="link" onClick={() => setOptions(options.slice(0, -1))}>Remove the last choice</button>}
      </div>
      <Field label="Runs for" span={4}><Choice label="Runs for" value={days} onChange={setDays} options={[["1", "1 day"], ["3", "3 days"], ["7", "7 days"]]} /></Field>
    </Sheet>
  );
}

/* ---------- The trader's daily limits ---------- */

function RulesForm({ onClose }) {
  const rules = useStore((s) => s.rules);
  const crypto = useStore((s) => s.world) === "crypto";
  const [f, setF] = useState(() => ({ lossLimit: rules.lossLimit ?? "", maxTrades: rules.maxTrades ?? "", stopAfter: rules.stopAfter ?? "", maxLeverage: rules.maxLeverage ?? "", minLiqDistance: rules.minLiqDistance ?? "" }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value.replace(/[^\d.,]/g, "") }));
  const setCount = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "") }));
  const num = (v) => { const n = parseNum(v); return n == null || Number.isNaN(n) ? null : n; };
  const whole = (v) => (num(v) > 0 ? Math.round(num(v)) : null);
  const next = { lossLimit: num(f.lossLimit) > 0 ? num(f.lossLimit) : null, maxTrades: whole(f.maxTrades), stopAfter: whole(f.stopAfter),
    ...(crypto ? { maxLeverage: num(f.maxLeverage) > 0 ? num(f.maxLeverage) : null, minLiqDistance: num(f.minLiqDistance) > 0 ? num(f.minLiqDistance) : null } : {}) };
  const ok = (next.maxTrades ?? 1) <= 100 && (next.stopAfter ?? 1) <= 20 && (next.maxLeverage ?? 1) <= 1000 && (next.minLiqDistance ?? 1) < 100;
  const save = () => {
    setState({ rules: { ...rules, ...next } });
    toast(Object.values(next).some((v) => v != null) ? (crypto ? "Crypto limits saved" : "Daily limits saved") : "Daily limits cleared");
    onClose();
  };
  return (
    <Sheet title={crypto ? "Crypto limits" : "Daily limits"} sub={crypto ? "Where you stop for the (UTC) day, and how much leverage you allow yourself. Markets keeps its own. Blank means none." : "Where you stop for the day. The desk keeps count. Leave any of them blank to go without."} onClose={onClose} onSubmit={save} canSubmit={ok}>
      <Field label="Daily loss limit ($)" span={4} hint="Stop once you're this much down on the day"><input className="input num" value={f.lossLimit} onChange={set("lossLimit")} inputMode="decimal" data-autofocus /></Field>
      <Field label="Most trades a day" span={2} error={next.maxTrades > 100 ? "At most 100" : null}><input className="input num" value={f.maxTrades} onChange={setCount("maxTrades")} inputMode="numeric" /></Field>
      <Field label="Losses in a row" span={2} hint="Stop after this many" error={next.stopAfter > 20 ? "At most 20" : null}><input className="input num" value={f.stopAfter} onChange={setCount("stopAfter")} inputMode="numeric" /></Field>
      {crypto && <>
        <Field label="Leverage cap (×)" span={2} hint="One trade over it ends the day" error={next.maxLeverage > 1000 ? "At most 1,000" : null}><input className="input num" value={f.maxLeverage} onChange={set("maxLeverage")} inputMode="decimal" placeholder="5" /></Field>
        <Field label="Liquidation at least (%)" span={2} hint="How far away it stays" error={next.minLiqDistance >= 100 ? "Under 100%" : null}><input className="input num" value={f.minLiqDistance} onChange={set("minLiqDistance")} inputMode="decimal" placeholder="10" /></Field>
      </>}
      <LimitsPreview rules={next} />
    </Sheet>
  );
}

