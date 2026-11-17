import { useState } from "react";
import { Chip, Icon } from "../../components/ui";
import { CAL, SAMPLE, art, plural } from "../../data";
import { LIVE } from "../../mode";
import { deleteTrade, exampleBlocked, openDialog, saveTrade, saveTrades, setState, toast, useStrategies } from "../../store";
import { marketCode } from "../../lib/markets";
import { pad } from "../../lib/basics.js";
import { pointValueFor } from "../../lib/trade";
import { FEE_NOTES, FEE_WORDS, builtFrom, feeOf, grossOf, sourceWord, trustLine, workingOf } from "../../lib/trail";
import { accountText } from "../../components/CopyView";
import { AccountName } from "../../live/FirmPicker";
import { liqDistanceOf } from "../../crypto/stats";
import { cardFacts } from "../../views/Flex";
import { Money } from "../Money";
import InkPicture from "../InkPicture";
import { STAGES, simulated, stageOf, useSample } from "../accounts";
import { todayId, useCloses } from "../week";
import { Line, FeeWord } from "./Built";
import TradePhotos, { dropTradePhotos } from "./TradePhotos";
import TradeTags from "./TradeTags";
import { TradeShape } from "./charts";
import { CopyCount, Tick, TradeRow, cash, exact } from "./bits";

const nums = (v) => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);
const heldOf = (facts) => facts.held;
const dayKeyOf = (id) => (typeof id === "string" ? id : `${CAL.year}-${pad(CAL.month + 1)}-${pad(id)}`);

export function RowList({ rows, sel, member, onOpen, onMember, accounts }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nameOf = (id) => { const a = accounts.find((x) => x.id === id); return a ? accountText(a) : "Removed account"; };
  return (
    <div className="jn-rows">
      {rows.map((x) => (
        <div key={x.id} className="jn-rowset">
          <TradeRow t={x} on={sel === x.id && !member} onOpen={onOpen}
            tag={x.copies && <CopyCount n={x.copies.n} open={open.has(x.id)} onToggle={() => toggle(x.id)} />} />
          {x.copies && open.has(x.id) && x.copies.members.map((m) => (
            <TradeRow key={m.id} t={m} indent sub={nameOf(m.account)} on={sel === x.id && member === m.id} onOpen={() => onMember(x.id, m.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- A day ---------- */

export function DayView({ day, tag, onOpen, onMember, onFigure, sel, member, accounts }) {
  const closes = useCloses();
  const key = dayKeyOf(day.id);
  const b = builtFrom(day.rows);
  const isToday = key === todayId();
  const count = (list) => { const m = new Map(); for (const v of list) if (v) m.set(v, (m.get(v) || 0) + 1); return [...m]; };
  const setups = count(day.rows.map((t) => t.setup)), feelings = count(day.rows.map((t) => t.emotion));
  const noted = day.rows.find((t) => t.note);
  const note = noted?.note || (!LIVE && day.rows.length ? SAMPLE.TRADE_NOTES?.[day.rows[0].followedPlan ? "kept" : "broke"] : null);
  const won = day.rows.filter((t) => t.pnl > 0).length;
  return (
    <article className="jn-read swap" key={day.id}>
      <header className="jn-head">
        <p className="jn-when">{day.label}</p>
        <button type="button" className="jn-figure" onClick={onFigure} aria-label={`${cash(day.net)}. See how it was built`}><b style={{ "--len": cash(day.net, { decimals: 0 }).length }}><Money value={day.net} /></b></button>
        <p className="jn-sub">{tag}</p>
        <button type="button" className="jn-trust" onClick={onFigure}>
          {b.sync.n > 0 && <Tick size={14} />}<span>{trustLine(b)}{b.fees > 0 ? `. ${exact(-b.fees)} fees` : ""}</span><Icon name="chevR" size={14} />
        </button>
      </header>

      <p className="jn-sum">{plural(day.rows.length, "trade")}, {won} won{closes[key] ? ". Day closed" : ""}</p>
      <div className="jn-group"><RowList rows={day.rows} sel={sel} member={member} onOpen={onOpen} onMember={onMember} accounts={accounts} /></div>

      {(setups.length > 0 || feelings.length > 0) && (
        <div className="jn-chips">
          {setups.map(([s, n]) => <Chip key={s}>{s}{n > 1 ? ` ×${n}` : ""}</Chip>)}
          {feelings.map(([s, n]) => <Chip key={s} tone="outline">{s}{n > 1 ? ` ×${n}` : ""}</Chip>)}
        </div>
      )}
      {note && <p className="jn-note">{note}</p>}

      {isToday && !closes[key] && (
        <button type="button" className="close-pill" onClick={() => setState({ closing: "review" })}>
          <span><b>Close today</b><small>{plural(day.rows.length, "trade")}, {cash(day.net, { decimals: 0 })}</small></span>
          <Icon name="chevR" size={20} />
        </button>
      )}
    </article>
  );
}

/* ---------- A trade ---------- */

export function usePlate(t) {
  const strategies = useStrategies();
  return t?.setup ? strategies.find((s) => s.setup === t.setup)?.img || null : null;
}

export function TradeView({ t, row, accounts, onMember, onBackToGroup, onFlex, onFigure }) {
  const sample = useSample();
  const plate = usePlate(t);
  const [sure, setSure] = useState(false);
  const [everyCopy, setEveryCopy] = useState(false);
  const [tagging, setTagging] = useState(!!t.needsReview);
  const group = row?.copies && t === row ? row.copies : null;
  const facts = cardFacts(t);
  const account = accounts.find((a) => a.id === t.account);
  const stage = account ? stageOf(account) : t.accountKind ? stageOf({ kind: t.accountKind }) : null;
  const fee = feeOf(t);
  const up = t.pnl >= 0;
  const noteText = t.note || (LIVE ? null : SAMPLE.TRADE_NOTES?.[t.followedPlan ? "kept" : "broke"]);
  const working = workingOf(t, { entry: nums(t.entry), exit: nums(t.exit), size: nums(t.size), pointValue: t.fills?.pointValue ?? pointValueFor(t.symbol) });
  const hint = group
    ? `Placed on ${group.n} accounts at once. Review it once and the review goes on every copy; each account keeps its own prices and P&L.`
    : t.needsReview ? "Imported. Edit it to add the setup and a note." : "No note. Edit the trade to add one.";
  const remove = () => {
    if (t.example) return exampleBlocked();
    if (sure) { dropTradePhotos(t); deleteTrade(t.id); toast(`Deleted ${t.symbol} ${t.side}`); onBackToGroup?.(); return undefined; }
    setSure(true);
    setTimeout(() => setSure(false), 4000);
    return undefined;
  };
  const crypto = t.world === "crypto";
  return (
    <article className={`jn-read swap ${plate ? "plated" : ""}`} key={t.id} data-tour="trade">
      {plate && <InkPicture className="jn-plate ink-still" src={art(plate, 960)} at="50% 14%" alt={`${t.setup}, from your playbook`} />}
      <header className="jn-head">
        {t !== row && row?.copies && (
          <p className="jn-one-of">{accountText(account || { name: "Removed account" })}, one of {row.copies.n} copies. <button type="button" className="link" onClick={() => onMember(null)}>All {row.copies.n}</button></p>
        )}
        <p className="jn-when">{[facts.day || t.date, t.time].filter(Boolean).join(" · ")}</p>
        <h2 className="jn-title">{marketCode(t.symbol)} {t.side}{group && <span className="num"> ×{group.n}</span>}</h2>
        <button type="button" className="jn-figure" onClick={onFigure} aria-label={`${cash(t.pnl)}. See how it was built`}><b style={{ "--len": cash(t.pnl).length }}><Money value={t.pnl} decimals={t.pnl % 1 ? 2 : 0} /></b></button>
        <p className="jn-proof"><FeeWord t={t} /></p>
        <p className="jn-sub">
          {account && !group && <AccountName account={account} size={16} className="jn-acct" />}
          {[stage ? STAGES[stage] : null, stage && simulated(stage) ? "Simulated" : null, sourceWord(group ? group.members : [t]), group ? `On ${plural(group.n, "account")}` : null, sample ? "Sample data" : null].filter(Boolean).join(" · ")}
        </p>
      </header>

      <TradeShape prices={facts.prices} fills={t.fills?.list} up={up} labels={{ entry: facts.entry, exit: facts.exit, stop: facts.stop }} />

      <section className="jn-built">
        <h3>How it was built</h3>
        <div className="jn-lines">
          {facts.entry && <Line name="Entry" note={facts.entryAt} value={facts.entry} />}
          {facts.exit && <Line name="Exit" note={facts.exitAt} value={facts.exit} />}
          {t.size != null && t.size !== "" && <Line name="Size" value={t.size} />}
          {heldOf(facts) && <Line name="Held" value={heldOf(facts)} />}
          {working && <Line name="Points" note={`${working.size} × $${working.pointValue} a point`} value={`${working.points > 0 ? "+" : ""}${+working.points.toFixed(2)}`} />}
          <Line name="Before fees" value={exact(grossOf(t))} />
          <Line name="Fees" note={FEE_WORDS[fee.status]} value={exact(-fee.paid)} />
          {nums(t.funding) ? <Line name="Funding" value={exact(+t.funding)} /> : null}
          <Line name="Net" value={exact(t.pnl)} strong />
        </div>
        {fee.status !== "in" && <p className="jn-fine">{FEE_NOTES[fee.status]}</p>}
        {crypto && (nums(t.leverage) > 0 || liqDistanceOf(t) != null) && (
          <div className="jn-lines">
            {nums(t.leverage) > 0 && <Line name="Leverage" value={`${+(+t.leverage).toFixed(1)}×`} />}
            {liqDistanceOf(t) != null && <Line name="Liquidation" note="Away at entry" value={`${liqDistanceOf(t)}%`} />}
          </div>
        )}
      </section>

      <div className="jn-chips">
        {t.needsReview && <Chip tone="outline">Needs review</Chip>}
        {t.setup && <Chip>{t.setup}</Chip>}
        {t.emotion && <Chip>{t.emotion}</Chip>}
        {t.followedPlan != null && <Chip tone={t.followedPlan ? "solid" : "outline"}>{t.followedPlan ? "On plan" : "Off plan"}</Chip>}
        {(t.mistakes || []).map((m) => <Chip key={m} tone="outline">{m}</Chip>)}
        {group && t.mixed?.length > 0 && <Chip tone="outline">Graded per account</Chip>}
        <button type="button" className="jn-tag-go" aria-expanded={tagging} onClick={() => setTagging((v) => !v)}><Icon name={tagging ? "close" : "plus"} size={14} />{tagging ? "Done" : "Tag"}</button>
      </div>
      {tagging && <TradeTags t={t} members={group?.members} />}

      <p className={`jn-note ${noteText ? "" : "empty"}`}>{noteText || hint}</p>

      <TradePhotos t={group ? group.members[0] : t} />

      {group && (
        <section className="jn-group">
          {(everyCopy ? group.members : group.members.slice(0, 5)).map((m) => {
            const a = accounts.find((x) => x.id === m.account);
            return <TradeRow key={m.id} t={m} indent sub={a ? accountText(a) : "Removed account"} onOpen={() => onMember(m.id)} />;
          })}
          {group.n > 5 && <button type="button" className="link jn-more" onClick={() => setEveryCopy((v) => !v)}>{everyCopy ? "Show fewer" : `Show all ${group.n}`}</button>}
        </section>
      )}

      <div className="jn-actions">
        <button type="button" className="btn" onClick={() => (t.example ? exampleBlocked() : onFlex())}><Icon name="share" size={15} /> Flex this trade</button>
        {group ? <>
          <button type="button" className="btn ghost" onClick={() => openDialog("trade", { trade: group.members[0], copies: group.members.slice(1) })}><Icon name="edit" size={15} /> {t.needsReview ? "Review" : "Edit"} all {group.n}</button>
          {t.needsReview && <button type="button" className="btn ghost" onClick={() => { saveTrades(group.members.map((m) => ({ ...m, needsReview: false }))); toast(`${t.symbol} ${t.side} marked reviewed on ${group.n} accounts`); }}><Icon name="check" size={15} /> Mark all reviewed</button>}
        </> : <>
          <button type="button" className="btn ghost" onClick={() => openDialog("trade", { trade: t })}><Icon name="edit" size={15} /> {t.needsReview ? "Review" : "Edit"}</button>
          {t.needsReview && <button type="button" className="btn ghost" onClick={() => { saveTrade({ ...t, needsReview: false }); toast(`${t.symbol} ${t.side} marked reviewed`); }}><Icon name="check" size={15} /> Mark reviewed</button>}
        </>}
        {LIVE && !group && <button type="button" className="btn ghost" onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
      </div>
    </article>
  );
}
