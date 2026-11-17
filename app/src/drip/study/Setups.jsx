import { useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { art, inPeriod, periodName, plural, statsFor } from "../../data";
import { chapterOf, chaptersOf, cleanThesis, cleanWhen, hourName, manualText, whenTraded } from "../../lib/playbook";
import { marketCode } from "../../lib/markets";
import { LIVE } from "../../mode";
import { nyOf } from "../../live/time";
import { exampleBlocked, openDialog, setState, showMonth, toast, useAllTrades, useSetups, useStrategies, useStore, useTrades } from "../../store";
import FlexStudio from "../../views/Flex";
import InkPicture from "../InkPicture";
import { useRoll } from "../motion";
import { STAGES, simulated, useAccounts, useSample } from "../accounts";
import { byStage, money } from "../week";
import { coverPos, coverTone } from "../../views/study/model";
import { notesFor, pictureOf, widestWord } from "./plates";

const EMPTY = [];
const ORDER = ["live", "funded", "eval", "paper"];
const perTrade = (stats) => money(stats.pnl / stats.trades, { sign: true });
const tradeName = (t) => `${marketCode(t.symbol)} ${t.side}`;
const plate = (path) => ({ src: art(path, 960), srcSet: `${art(path, 480)} 480w, ${art(path, 960)} 960w, ${art(path)} 1600w` });

// A figure that rolls to its value
function Roll({ value, as }) { return as(useRoll(value)); }

export function useChapters() {
  const trades = useTrades();
  const strategies = useStrategies();
  const setups = useSetups();
  return useMemo(() => chaptersOf(strategies, setups, trades), [strategies, setups, trades]);
}

export function SetupsPage({ chapters, onOpen }) {
  const trades = useTrades();
  const written = chapters.filter((c) => c.strategy);
  const share = async () => {
    const text = manualText(written);
    if (navigator.share) {
      try { await navigator.share({ title: "My setups", text }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast("Your setups are copied. Paste them anywhere."); } catch { toast("Couldn't copy your setups.", { warn: true }); }
  };
  return (
    <article className="pg setups">
      <div className="pg-scroll">
        <div className="pg-inner">
          <h1 className="pg-big loud">Setups</h1>
          {chapters.length > 0 && (
            <div className="sy-tools">
              <button type="button" className="sy-add" onClick={() => openDialog("strategy")}><Icon name="plus" size={16} /> New setup</button>
              {written.length > 0 && <button type="button" className="sy-round" aria-label="Share your setups" title="Share your setups" onClick={share}><Icon name="share" size={17} /></button>}
            </div>
          )}
          {chapters.length ? (
            <div className="sy-tiles">
              {chapters.map((c) => <Tile key={c.key} c={c} stats={statsFor(c.setup, trades)} onOpen={() => onOpen(c)} />)}
            </div>
          ) : <EmptySetups />}
        </div>
      </div>
    </article>
  );
}

// A setup on the list, its picture whole behind its record
function Tile({ c, stats, onOpen }) {
  const won = stats.trades ? Math.round(stats.winRate) : 0;
  const path = pictureOf(c.strategy?.img, c.setup);
  const words = (
    <span className="sy-tile-words">
      <span className="sy-tile-name">{c.name}</span>
      <span className="sy-tile-line">
        <span>{stats.trades ? `${won}% won · ${plural(stats.trades, "trade")}` : `No trades ${inPeriod()}`}</span>
        {stats.trades > 0 && <b>{perTrade(stats)}</b>}
      </span>
    </span>
  );
  return (
    <button type="button" className="sy-tile" data-setup={c.setup} onClick={onOpen}
      aria-label={`${c.name}: ${stats.trades ? `${won}% won over ${plural(stats.trades, "trade")}, ${perTrade(stats)} a trade` : "no trades yet"}`}>
      {words}
      <span className="sy-tile-ink" aria-hidden="true">
        <img src={art(path, 960)} alt="" style={{ objectPosition: coverPos(path), "--tone": coverTone(path) }} loading="lazy" decoding="async" draggable="false" />
        {words}
      </span>
    </button>
  );
}

function EmptySetups() {
  return (
    <button type="button" className="sy-empty" onClick={() => openDialog("strategy")}>
      <b className="loud">Your first setup</b>
      <span>Say why it works, when you run it and its rules. Its record fills in from your journal.</span>
    </button>
  );
}

/* ---------- One setup, a chapter of the book ---------- */

function Record({ stats, tag }) {
  const has = stats.trades > 0;
  const won = has ? Math.round(stats.winRate) : 0;
  return (
    <section className="sy-record">
      <span>Your record · {tag}</span>
      <b className="loud">{has ? <Roll value={won} as={(v) => `${Math.round(v)}%`} /> : "No trades"}</b>
      <span>{has ? `won over ${plural(stats.trades, "trade")}, ${perTrade(stats)} a trade` : inPeriod()}</span>
    </section>
  );
}

export function SetupPage({ c, go, onIndex }) {
  const trades = useTrades();
  const all = useAllTrades();
  const accounts = useAccounts();
  const sample = useSample();
  const pages = useStore((s) => s.pages) || EMPTY;
  const notebooks = useStore((s) => s.notebooks) || EMPTY;
  const s = c.strategy;
  const ch = useMemo(() => chapterOf(c.setup, trades), [c.setup, trades]);
  const notes = useMemo(() => notesFor(c.setup, pages, notebooks, all), [c.setup, pages, notebooks, all]);
  const thesis = cleanThesis(s?.thesis);
  const when = cleanWhen(s?.whenRun);
  const stages = useMemo(() => byStage(trades.filter((t) => t.setup === c.setup), accounts), [trades, c.setup, accounts]);
  const stageOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.stage])), [accounts]);
  const tag = [periodName(), sample ? "Sample data" : null].filter(Boolean).join(" · ");
  const edit = () => (s ? openDialog("strategy", { strategy: s }) : openDialog("strategy", { setup: c.setup }));
  const path = pictureOf(s?.img, c.setup);
  const judged = trades.some((t) => t.setup === c.setup && t.followedPlan != null);
  const openTrade = (t, e) => {
    if (LIVE && t.traded_at) { const d = nyOf(t.traded_at); showMonth(d.year, d.month); }
    setState({ journalSel: t.id });
    go?.("journal", e);
  };
  const openNote = (x) => setState({ studyOpen: { id: x.nb.id, page: x.n } });

  const opening = (
    <>
      <InkPicture className="sy-plate" {...plate(path)} sizes="(max-width: 900px) 100vw, 1040px" at={coverPos(path)} style={{ "--tone": coverTone(path) }}>
        <h1 className="sy-plate-name loud" style={{ "--w": widestWord(c.name) }}>{c.name}</h1>
      </InkPicture>
      <Record stats={ch.stats} tag={tag} />
      <dl className="sy-money">
        {judged && <div><dt>By the plan</dt><dd><Roll value={ch.stats.kept} as={(v) => `${v.toFixed(0)}%`} /></dd></div>}
        {ORDER.filter((k) => stages[k]?.length).map((k) => (
          <div key={k}>
            <dt>{STAGES[k]}{simulated(k) ? " · Simulated" : ""}</dt>
            <dd><Roll value={stages[k].reduce((a, t) => a + (+t.pnl || 0), 0)} as={(v) => money(v, { sign: true })} /></dd>
          </div>
        ))}
      </dl>
    </>
  );
  const rest = (
    <>
      {thesis
        ? <p className="sy-thesis">{thesis}</p>
        : <button type="button" className="sy-ask" onClick={edit}>{s ? "Why does it work? Write it in your own words." : "No rules yet. Write them and they become the checklist when you log it."}</button>}
      {when.length > 0 && <ul className="sy-when" aria-label="When I run it">{when.map((w) => <li key={w}>{w}</li>)}</ul>}
      {s && (
        <section className="sy-rules">
          <header><h2>The rules</h2><button type="button" className="sy-link" onClick={edit}>Edit</button></header>
          <ol>{s.rules.map((r, i) => <li key={`${i}-${r}`}><span>{i + 1}</span>{r}</li>)}</ol>
        </section>
      )}
      {!s && <button type="button" className="sy-add wide" onClick={edit}><Icon name="edit" size={15} /> Write its rules</button>}
      {(ch.best || ch.worst) && (
        <div className="sy-pair">
          {ch.best && <TradeCard title="Best trade" t={ch.best} stage={stageOf.get(ch.best.account)} onOpen={openTrade} sharing />}
          {ch.worst && <TradeCard title="Worst trade" t={ch.worst} stage={stageOf.get(ch.worst.account)} onOpen={openTrade} />}
        </div>
      )}
      {ch.weak && <p className="sy-weak">{hourName(ch.weak.hour)} is its weakest hour, over {plural(ch.weak.n, "trade")}.</p>}
      <section className="sy-notes">
        <h2>Notes</h2>
        {notes.length ? notes.map((x) => (
          <button type="button" key={x.page.id} className="sy-note" onClick={() => openNote(x)}>
            <span><b>{x.page.title || "Untitled"}</b><small>{tradeName(x.trade)} · {x.trade.date}</small></span>
            <Icon name="chevR" size={16} />
          </button>
        )) : <p>Link a notebook page to one of these trades and it shows here.</p>}
      </section>
    </>
  );
  return (
    <article className="pg setup" aria-label={c.name}>
      <header className="pg-head"><button type="button" className="pg-back" onClick={onIndex}><Icon name="chevL" size={15} /> Setups</button></header>
      <div className="pg-scroll">
        <div className="pg-inner">{opening}{rest}</div>
      </div>
    </article>
  );
}

// Best and worst get the same card. A loss is a past fact, with the trade named.
function TradeCard({ title, t, stage, onOpen, sharing }) {
  const [flexing, setFlexing] = useState(false);
  const felt = [t.followedPlan === false ? "Plan broken." : t.followedPlan ? "Plan kept." : null, t.emotion ? `Felt: ${t.emotion}.` : null].filter(Boolean).join(" ");
  return (
    <div className="sy-trade">
      <button type="button" className="sy-trade-open" onClick={(e) => onOpen(t, e)} aria-label={`${title}: ${tradeName(t)}, ${whenTraded(t)}. Open it in the journal`}>
        <span className="sy-trade-title">{title}</span>
        <b className="loud"><Roll value={+t.pnl || 0} as={(v) => money(v, { sign: true })} /></b>
        <span className="sy-trade-name">{tradeName(t)}</span>
        <small>{whenTraded(t)}</small>
        <small>{STAGES[stage] || STAGES.live}{simulated(stage) ? " · Simulated" : ""}</small>
        {felt && <small>{felt}</small>}
      </button>
      {sharing && <button type="button" className="sy-link" onClick={() => (t.example ? exampleBlocked() : setFlexing(true))}>Share it</button>}
      {flexing && <FlexStudio trade={t} onClose={() => setFlexing(false)} />}
    </div>
  );
}
