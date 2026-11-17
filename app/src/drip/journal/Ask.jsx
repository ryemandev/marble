import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { CAL, NOW, art, fmtMoney as moneyOf, plural } from "../../data";
import { LIVE } from "../../mode";
import { useMedia } from "../../lib/useMedia.js";
import { nyInstant, nyOf } from "../../live/time";
import { GROUPS, QUESTIONS, SCOPES, SESSIONS, ask, prepare, splitBy, splitsFor } from "../../lib/oracle";
import { openDialog, setState, showMonth, useStore, useStrategies } from "../../store";
import InkPicture from "../InkPicture";
import { Page, TradeRow } from "./bits";

const FIRST = ["slot", "broken", "hours", "expectancy", "setups", "weekday", "consistency"];
const SAVED = "marble-oracle";
const PAGE = 6, MORE = 20;
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const recall = () => { try { return JSON.parse(sessionStorage.getItem(SAVED)) || {}; } catch { return {}; } };
const remember = (v) => { try { sessionStorage.setItem(SAVED, JSON.stringify(v)); } catch {} };

const minus = (s) => (s == null ? s : String(s).replace(/(^|[\s(])-(?=[$\d])/g, "$1−"));

function Headline({ text, mark }) {
  const line = minus(text), key = minus(mark);
  const at = key ? line.indexOf(key) : -1;
  if (at < 0) return <p className="ak-line">{line}</p>;
  return <p className="ak-line">{line.slice(0, at)}<b>{key}</b>{line.slice(at + key.length)}</p>;
}

function Behind({ groups, byId, onOpen }) {
  const [shown, setShown] = useState({});
  const total = new Set(groups.flatMap((g) => g.ids)).size;
  if (!total) return null;
  return (
    <section className="ak-trades" aria-label="The trades behind it">
      {groups.map((g) => {
        const limit = shown[g.label] || PAGE;
        const list = g.ids.slice(0, limit).map((id) => byId.get(id)).filter(Boolean);
        return (
          <div key={g.label} className="ak-trades">
            <h3>{groups.length > 1 ? `${g.label}, ${g.ids.length}` : `The ${plural(total, "trade")} behind it`}</h3>
            <div className="jn-group">
              <div className="jn-rows">
                {list.map((t) => <div key={t.id} className="jn-rowset"><TradeRow t={t} sub={[t.date, t.time, t.setup].filter(Boolean).join(" · ")} onOpen={onOpen} /></div>)}
              </div>
              {g.ids.length > limit && (
                <button type="button" className="link jn-more" onClick={() => setShown((s) => ({ ...s, [g.label]: limit + MORE }))}>
                  {g.ids.length - limit > MORE ? `Show ${MORE} more of ${g.ids.length - limit}` : `Show ${g.ids.length - limit} more`}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// One tap on: the same trades split another way, and any row opens its trades
function Split({ ids, journal, byId, onOpen }) {
  const list = useMemo(() => { const want = new Set(ids); return journal.filter((t) => want.has(t.id)); }, [ids, journal]);
  const ways = useMemo(() => (list.length < 2 ? [] : splitsFor(list)), [list]);
  const [way, setWay] = useState(null);
  const [row, setRow] = useState(null);
  if (!ways.length) return null;
  const rows = way ? splitBy(list, way) : [];
  const open = rows.find((r) => r.label === row);
  return (
    <section className="ak-split" aria-label="Split these trades">
      <h3>Split these trades</h3>
      <div className="stage-chips" role="group" aria-label="Split by">
        {ways.map((s) => <button key={s.id} type="button" aria-pressed={way === s.id} onClick={() => { setWay(way === s.id ? null : s.id); setRow(null); }}>{s.label}</button>)}
      </div>
      {rows.length > 0 && (
        <div className="jn-group">
          {rows.map((r) => (
            <button key={r.label} type="button" className="ak-split-row" aria-expanded={row === r.label} onClick={() => setRow(row === r.label ? null : r.label)}>
              <span>{r.label}</span><small className="num">{plural(r.n, "trade")}</small><b className="num">{minus(moneyOf(r.net, { sign: true }))}</b>
            </button>
          ))}
        </div>
      )}
      {open && <Behind groups={[{ label: open.label, ids: open.ids }]} byId={byId} onOpen={onOpen} />}
    </section>
  );
}

function Answer({ a, qid, opts, set, weekdays, n, sample, byId, journal, onOpen }) {
  return (
    <div className="ak-answer swap" key={`${qid}-${opts.scope}-${opts.weekday}-${opts.session}`}>
      <h2 className="ak-question">{a.question}</h2>
      <div className="stage-chips" role="group" aria-label="Which trades">
        {SCOPES.map((s) => <button key={s.id} type="button" aria-pressed={opts.scope === s.id} onClick={() => set("scope", s.id)}>{s.label}</button>)}
      </div>
      {qid === "slot" && (
        <div className="ak-pick">
          <label>
            <span className="sr-only">Day of the week</span>
            <select value={opts.weekday} onChange={(e) => set("weekday", +e.target.value)}>
              {weekdays.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
            </select>
          </label>
          <div className="stage-chips" role="group" aria-label="Part of the day">
            {SESSIONS.map((s) => <button key={s.id} type="button" aria-pressed={opts.session === s.id} onClick={() => set("session", s.id)}>{s.label}</button>)}
          </div>
        </div>
      )}
      <div aria-live="polite"><Headline text={a.headline} mark={a.status === "ok" ? a.key : null} /></div>
      {a.status === "short" && <span className="ak-need" role="img" aria-label={`${a.have} of the ${a.need} needed`}><i style={{ width: `${Math.min(100, (a.have / a.need) * 100)}%` }} /></span>}
      {a.facts.length > 0 && <ul className="ak-facts">{a.facts.map((f) => <li key={f}>{minus(f)}</li>)}</ul>}
      {a.look && <p className="ak-look">{minus(a.look)}</p>}
      {a.status === "none" && a.action === "rules" && <div className="jn-actions"><button type="button" className="btn ghost" onClick={() => openDialog("rules")}>Set daily limits</button></div>}
      {a.status === "short" && n === 0 && !sample && (
        <div className="jn-actions row">
          <button type="button" className="btn" onClick={() => openDialog("trade")}><Icon name="plus" size={15} /> Log trade</button>
          <button type="button" className="btn ghost" onClick={() => openDialog("import")}><Icon name="upload" size={15} /> Import trades</button>
        </div>
      )}
      <Split ids={a.ids} journal={journal} byId={byId} onOpen={onOpen} />
      <Behind groups={a.groups} byId={byId} onOpen={onOpen} />
    </div>
  );
}

// Plain questions with plain answers, worked out from the trades on this device. Each one shows the trades
// behind it.
export default function Ask({ trades, tag, sample, go }) {
  const rules = useStore((s) => s.rules);
  const strategies = useStrategies();
  const desk = !useMedia("(max-width: 1100px)");
  const now = useMemo(() => (LIVE ? Date.now() : +nyInstant(NOW.year, NOW.month, NOW.day, +NOW.time.slice(0, 2), +NOW.time.slice(3))), [trades]);
  const journal = useMemo(() => prepare(trades, { cal: { year: CAL.year, month: CAL.month } }), [trades]);
  const byId = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);
  const base = { prepared: journal, rules, strategies, now };

  const [opts, setOpts] = useState(() => { const r = recall(); return { scope: r.scope || "all", weekday: Number.isInteger(r.weekday) ? r.weekday : 5, session: r.session || "afternoon" }; });
  const [picked, setPicked] = useState(() => { const r = recall(); return QUESTIONS.some((q) => q.id === r.q) ? r.q : null; });
  const [reading, setReading] = useState(false);
  const fallback = useMemo(() => FIRST.find((id) => ask(id, base, opts).status === "ok") || "hours", [journal, rules, strategies]);
  const qid = picked || fallback;
  useEffect(() => { remember({ ...(picked ? { q: picked } : {}), ...opts }); }, [picked, opts]);
  const a = useMemo(() => ask(qid, base, opts), [qid, journal, rules, strategies, now, opts]);

  const pick = (id) => { setPicked(id); setReading(true); };
  const set = (k, v) => { setPicked(qid); setOpts((o) => ({ ...o, [k]: v })); };
  const open = (t) => {
    if (LIVE && t.traded_at) { const d = nyOf(t.traded_at); showMonth(d.year, d.month); }
    setReading(false);
    setState({ journalSel: t.id });
    go?.("journal");
  };
  // Weekdays always, and the weekend when there are trades on it
  const weekdays = [1, 2, 3, 4, 5, ...[6, 0].filter((d) => journal.some((t) => t.weekday === d))];
  const answer = <Answer a={a} qid={qid} opts={opts} set={set} weekdays={weekdays} n={journal.length} sample={sample} byId={byId} journal={journal} onOpen={open} />;

  return (
    <div className="ak">
      <div className="ak-left">
        <div className="ak-pic">
          <InkPicture className="ak-ink ink-still" src={art("masters/self-portrait-rembrandt", desk ? undefined : 960)} at="50% 30%" alt="">
            <div className="ak-pic-words">
              <h2 className="loud">Ask</h2>
              <p>Pick a question. The answer comes from {journal.length ? `your ${plural(journal.length, "trade")}` : "your own trades"}.</p>
            </div>
          </InkPicture>
        </div>
        <div className="ak-menu" data-tour="oracle">
          {GROUPS.map((g, i) => (
            <section key={g.id} className="ak-group rise-in" style={{ "--i": i + 1 }}>
              <h3>{g.label}</h3>
              <div className="jn-group">
                {QUESTIONS.filter((q) => q.group === g.id).map((q) => (
                  <button key={q.id} type="button" className="ak-q" data-q={q.id} aria-pressed={desk && q.id === qid} onClick={() => pick(q.id)}>
                    <span>{q.text(opts)}</span><Icon name="chevR" size={15} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="ak-foot">{tag}. Worked out on your device from the trades in your journal. These are facts about trades already taken: they don't predict what comes next, and none of it is financial advice.</p>
      </div>
      {desk ? <aside className="ak-side" aria-label="The answer">{answer}</aside> : reading && <Page label={a.question} onClose={() => setReading(false)}>{answer}</Page>}
    </div>
  );
}
