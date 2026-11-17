import { useMemo, useState } from "react";
import { Icon, Skeleton } from "../../components/ui";
import { Modal } from "../../components/overlay";
import { art } from "../../data";
import InkPicture from "../../drip/InkPicture";
import { toast, useOwnStore } from "../../store";
import { useCm, useLoad } from "./context";
import { errText, source } from "./source";
import { CUP_SOURCES, fmtR1, ordinal } from "./scoring";
import { verifyDraw } from "./draw";
import { CRYPTO_PUBLIC } from "../../crypto/public";
import { Av, Banner, DayStrip, Kicker, Meter, No, Note, Tag, Who, longDate } from "./parts";
import { eventLine } from "./Feed";

const day = (k) => (k ? new Date(`${String(k).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");
const no = (n) => `No. ${String(n).padStart(4, "0")}`;
const artOf = (e, w) => art(e.art || (e.kind === "cup" ? "masters/charging-chasseur-gericault" : "prints/mystical-bird-hokusai"), w);

/* ---------- The full rules ---------- */

function RulesSheet({ e, onClose, onAccept, canAccept }) {
  return (
    <Modal label={`${e.title}: the rules`} onClose={onClose} className="overlay sheet-overlay">
      <div className="sheet cm-rules-sheet">
        <header className="sheet-head">
          <div>
            <h2>{e.title}: the rules</h2>
            <p>Version {e.rulesVersion}{e.rulesPublishedAt ? ` · published ${day(e.rulesPublishedAt)}` : ""} · {e.kind === "cup" ? "a skill competition" : "a free prize draw"}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" data-autofocus><Icon name="close" /></button>
        </header>
        <ol className="cm-rules-list">
          {e.rules.map(([h, p], i) => <li key={i}><span className="num">{String(i + 1).padStart(2, "0")}</span><div><b>{h}</b><p>{p}</p></div></li>)}
        </ol>
        <footer className="sheet-foot">
          <span className="cm-fine cm-grow">Accepting records this version with your entry.</span>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          {canAccept && <button type="button" className="btn" onClick={onAccept}>Accept and enter</button>}
        </footer>
      </div>
    </Modal>
  );
}

function Terms({ e, onRead }) {
  return (
    <div className="cm-terms">
      <span className="caps faint">The rules in short</span>
      <ul>{e.summary.map((k, i) => <li key={i}>{k}</li>)}</ul>
      <button type="button" className="link" onClick={onRead}>Read the full rules <span className="faint">· version {e.rulesVersion}</span></button>
    </div>
  );
}

/* ---------- Competitions ---------- */

const RULE_TILES = [
  ["max_trade_loss_pct", (v) => `${v}%`, "Most a trade may lose", (v) => `No single trade loses more than ${v}% of the account.`],
  ["daily_loss_pct", (v) => `${v}%`, "Daily loss limit", (v) => `No day finishes more than ${v}% down.`],
  ["max_trades", (v) => `${v}`, "Trades a day", (v) => `At most ${v} trades in a day.`],
  ["stop_after", (v) => `${v}`, "Losses, then stop", (v) => `${v} losing trades in a row ends the day.`],
];

function RuleTiles({ limits }) {
  const tiles = RULE_TILES.filter(([k]) => limits[k] != null);
  return (
    <div className="cm-rules">
      {tiles.map(([k, big, h, p]) => <div key={k} className="cm-rule"><b className="num">{big(limits[k])}</b><span className="cm-rule-h">{h}</span><span className="cm-rule-p">{p(limits[k])}</span></div>)}
    </div>
  );
}
function Prizes({ prizes, compact }) {
  return (
    <ol className={`cm-prizes ${compact ? "compact" : ""}`}>
      {prizes.map((p, i) => <li key={i}><span className="cm-prize-place num">{p.place}</span><span><b>{p.title}</b>{p.detail && <span>{p.detail}</span>}</span></li>)}
    </ol>
  );
}
function Scoring({ scoring }) {
  const cut = scoring.broken_day_r ?? 2, min = scoring.min_days ?? 10;
  return (
    <ol className="cm-steps">
      <li><span className="num">1</span><p><b>Every trading day is checked</b> against the cup's rules, straight from your synced trades.</p></li>
      <li><span className="num">2</span><p><b>Days you keep every rule earn their R.</b> Each trade counts up to +3R, so one outsized trade can't carry the cup.</p></li>
      <li><span className="num">3</span><p><b>A day that breaks a rule costs {cut}R</b> and its gains don't count. You need {min} trading days to be ranked; the highest score wins.</p></li>
    </ol>
  );
}

function CupEnter({ e, board, onDone }) {
  const { me } = useCm();
  const accounts = useOwnStore((s) => s.accounts);
  const trades = useOwnStore((s) => s.logged);
  const counted = useMemo(() => new Set(trades.filter((t) => CUP_SOURCES.includes(t.source)).map((t) => t.account)), [trades]);
  const ok = accounts.filter((a) => (CRYPTO_PUBLIC || a.world !== "crypto") && counted.has(a.id));
  const [account, setAccount] = useState(e.entry?.account_id || ok[0]?.id || "");
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const entered = e.entry?.status === "entered";
  const enter = async () => {
    if (!account) return;
    setBusy(true);
    try { await source.enterCompetition(e.id, account, e.rulesVersion); toast("You're entered"); setSheet(false); onDone(); }
    catch (err) { toast(errText(err, "Couldn't enter. Try again."), { warn: true }); }
    setBusy(false);
  };
  const withdraw = async () => {
    setBusy(true);
    try { await source.withdrawCompetition(e.id); toast("You've withdrawn"); onDone(); } catch (err) { toast(errText(err, "Couldn't withdraw. Try again."), { warn: true }); }
    setBusy(false);
  };
  return (
    <section className="card cm-enter">
      <h3>Enter the competition</h3>
      <ul className="cm-checks">
        <li className={ok.length ? "ok" : "no"}><Icon name={ok.length ? "check" : "close"} size={13} />
          <span><b>{ok.length ? "Your account" : "Connect or import an account first"}</b>
            {ok.length ? (
              <select className="input cm-account" value={account} onChange={(ev) => setAccount(ev.target.value)} aria-label="The account you enter with" disabled={entered}>
                {ok.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ) : <span>Only synced trades count, so connect the account to Topstep or IBKR and sync it.</span>}
          </span>
        </li>
        <li className="ok"><Icon name="check" size={13} /><span><b>You show on the table as @{me?.handle}</b><span>The table uses your handle and scores, nothing else.</span></span></li>
        <li className="no"><Icon name="close" size={13} /><span><b>Trades typed in by hand don't count</b><span>Only synced trades are scored: an imported file can be edited first.</span></span></li>
      </ul>
      <Terms e={e} onRead={() => setSheet(true)} />
      {entered
        ? <div className="cm-entered"><Icon name="check" size={16} /><span><b>You're entered.</b> It starts {day(e.startsOn)}. You can withdraw until then. <button type="button" className="link" disabled={busy} onClick={withdraw}>Withdraw</button></span></div>
        : <button type="button" className="btn cm-full-btn" disabled={!account || busy} onClick={enter}>Accept the rules and enter</button>}
      <p className="cm-fine">Free to enter. Entering shares your scores and handle, never your trades. Nothing in a competition is advice.</p>
      {sheet && <RulesSheet e={e} onClose={() => setSheet(false)} onAccept={enter} canAccept={!entered && !!account} />}
    </section>
  );
}

function Standings({ rows, final }) {
  if (!rows.length) return <Note>No one has enough trading days to be ranked yet.</Note>;
  return (
    <table className="table cm-table">
      <thead><tr><th className="cm-c-rank">#</th><th>Trader</th>{!final && <th className="cm-c-strip">Day by day</th>}<th className="cm-c-num">Kept</th><th className="cm-c-num cm-ph">Broken</th><th className="cm-c-num cm-ph">R kept days</th><th className="cm-c-num">Score</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.handle} className={r.mine ? "mine" : ""}>
            <td className="cm-c-rank num">{r.rank ?? "–"}</td>
            <td><Who who={r} size={28} /></td>
            {!final && <td className="cm-c-strip"><DayStrip strip={r.strip} /></td>}
            <td className="cm-c-num num muted">{r.kept}/{r.traded}</td>
            <td className="cm-c-num cm-ph num muted">{r.traded - r.kept || "–"}</td>
            <td className="cm-c-num cm-ph num muted">{fmtR1(r.kept_r)}</td>
            <td className="cm-c-num num"><b>{fmtR1(r.score)}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TodayChecks({ e, t }) {
  const L = e.limits;
  const rows = [
    L.max_trade_loss_pct != null && ["Most a trade lost", `${t.worst_pct}%`, `of ${L.max_trade_loss_pct}%`, t.worst_pct / L.max_trade_loss_pct],
    L.daily_loss_pct != null && ["Day so far", `${t.day_pct > 0 ? "+" : ""}${t.day_pct}%`, `of −${L.daily_loss_pct}%`, Math.max(0, -t.day_pct) / L.daily_loss_pct],
    L.max_trades != null && ["Trades today", `${t.trades}`, `of ${L.max_trades}`, t.trades / L.max_trades],
    L.stop_after != null && ["Losses in a row", `${t.losses_in_a_row}`, `of ${L.stop_after}`, t.losses_in_a_row / L.stop_after],
  ].filter(Boolean);
  const near = rows.find(([, , , f]) => f >= 0.5 && f < 1);
  const over = rows.find(([, , , f]) => f >= 1);
  return (
    <section className="card cm-today">
      <h3><span>Today, against the rules</span><span className="xs faint num">{day(t.day)}</span></h3>
      {rows.map(([label, val, of, f]) => (
        <div key={label} className={`cm-today-row ${f >= 0.5 ? "near" : ""}`}>
          <div className="row"><span className="muted sm">{label}</span><span className="num sm"><b>{val}</b> <span className="faint">{of}</span></span></div>
          <Meter value={Math.min(1, f) * 100} />
        </div>
      ))}
      {(over || near) && <div className="cm-today-note"><Icon name="alert" size={14} /><span>{over ? `${over[0]} is at the limit. The rules end your day here.` : `${near[0]} is past halfway to the limit.`}</span></div>}
    </section>
  );
}

function Competition({ e, onBack }) {
  const board = useLoad(() => source.competition(e.id), [e.id]);
  const b = board.data;
  const rows = b?.rows || [];
  const me = rows.find((r) => r.mine);
  const status = e.status;
  const kicker = { open: "Competition · free to enter · skill-based", live: "Live · skill-based", review: "Results being checked", final: `Final results${e.resultsAt ? ` · ${day(e.resultsAt)}` : ""}`, cancelled: "Cancelled" }[status];
  const top = rows.filter((r) => r.rank).slice(0, 3);
  return (
    <div className="cm-wrap cm-stack">
      <button type="button" className="fl-back" onClick={onBack}><Icon name="chevL" size={18} /> Events</button>
      <Banner small={status !== "open" && status !== "final"} img={artOf(e)} pos="50% 8%" kicker={<>{status === "live" && <i className="cm-live-dot" />}{kicker}</>} title={e.title} line2={status === "final" ? "The winners." : e.tagline}
        side={
          <dl className="cm-banner-stats">
            <div><dt className="cm-kicker">Runs</dt><dd>{day(e.startsOn)} – {day(e.endsOn)}</dd></div>
            {status === "open" && <div><dt className="cm-kicker">Entries close</dt><dd>{longDate(e.closesAt)}</dd></div>}
            <div><dt className="cm-kicker">Entered</dt><dd className="num">{b?.entrants ?? "–"}</dd></div>
          </dl>
        }>
        {e.blurb && status !== "final" && <p className="cm-banner-line">{e.blurb}</p>}
      </Banner>

      {status === "cancelled" && <section className="card"><Note>This competition was cancelled. Every entrant has been told why.</Note></section>}

      {status === "open" && (
        <div className="cm-split">
          <div className="cm-col">
            <section className="card"><h3>How it's scored</h3><Scoring scoring={e.scoring} /></section>
            <section className="card"><h3>The rules everyone trades to</h3><RuleTiles limits={e.limits} /></section>
            {e.prizes.length > 0 && <section className="card"><h3>Prizes</h3><Prizes prizes={e.prizes} /></section>}
          </div>
          <aside className="cm-col cm-sticky"><CupEnter e={e} board={b} onDone={board.reload} /></aside>
        </div>
      )}

      {(status === "live" || status === "review") && (
        <div className="cm-split live">
          <div className="cm-col">
            {me && (
              <section className="card cm-you-row">
                <div className="cm-you-rank"><Kicker>You</Kicker><b className="num">{me.rank ? ordinal(me.rank) : "–"}</b><span className="muted sm">of {b.entrants}</span></div>
                <dl className="cm-you-stats tight">
                  <div><dt>Score</dt><dd className="num">{fmtR1(me.score)}</dd></div>
                  <div><dt>Days kept</dt><dd className="num">{me.kept}/{me.traded}</dd></div>
                  <div><dt>Broken</dt><dd className="num">{me.traded - me.kept}</dd></div>
                  <div className="cm-you-strip"><dt>Your days so far</dt><dd><DayStrip strip={me.strip} /></dd></div>
                </dl>
              </section>
            )}
            <section className="card cm-board-card">
              <h3><span>Standings</span><span className="xs faint">Score = R on kept days − {e.scoring.broken_day_r ?? 2}R a broken day</span></h3>
              {board.loading && !b ? <Note>Loading the table…</Note> : board.error && !b ? <Note retry={board.reload}>Couldn't load the table.</Note> : <Standings rows={rows} />}
              <p className="cm-card-foot">The table updates after each sync. Trades typed in by hand never count.</p>
            </section>
          </div>
          <aside className="cm-col cm-sticky">
            {b?.today_checks && <TodayChecks e={e} t={b.today_checks} />}
            {e.prizes.length > 0 && <section className="card"><h3>Prizes</h3><Prizes prizes={e.prizes} compact /></section>}
          </aside>
        </div>
      )}

      {status === "final" && (
        <>
          {top.length === 3 && (
            <div className="cm-podium final">
              {[top[1], top[0], top[2]].map((r) => (
                <article key={r.handle} className={`cm-step rank-${r.rank}`}>
                  <InkPicture className="cm-step-art" src={artOf(e, 480)} at="50% 25%" edge={false} />
                  <div className="cm-step-body">
                    <span className="cm-step-rank num">{r.rank}</span>
                    <div className="cm-step-who"><Av who={r} size={30} /><b>{r.handle}</b><No n={r.no} /><Tag crew={r.crew} /></div>
                    <div className="cm-step-fig"><b>{fmtR1(r.score)}</b><span>score</span></div>
                    <div className="cm-step-sub num">{r.kept} of {r.traded} days kept{r.prize ? ` · ${r.prize}` : ""}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="cm-split">
            <div className="cm-col">
              {me && (
                <section className="card cm-you-row">
                  <div className="cm-you-rank"><Kicker>Your result</Kicker><b className="num">{me.rank ? ordinal(me.rank) : "–"}</b><span className="muted sm">of {b.entrants}</span></div>
                  <dl className="cm-you-stats tight">
                    <div><dt>Score</dt><dd className="num">{fmtR1(me.score)}</dd></div>
                    <div><dt>Days kept</dt><dd className="num">{me.kept}/{me.traded}</dd></div>
                  </dl>
                </section>
              )}
              <section className="card cm-board-card"><h3>Final table</h3><Standings rows={rows} final /></section>
            </div>
            <aside className="cm-col">
              {e.checks.length > 0 && (
                <section className="card">
                  <h3>How the result was checked</h3>
                  <ul className="cm-checks">{e.checks.map(([h, p], i) => <li key={i} className="ok"><Icon name="check" size={13} /><span><b>{h}</b><span>{p}</span></span></li>)}</ul>
                </section>
              )}
              {e.prizes.length > 0 && <section className="card"><h3>Prizes</h3><Prizes prizes={e.prizes} compact /></section>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Giveaways ---------- */

function HowDrawn({ e, done }) {
  return (
    <ol className="cm-steps">
      <li><span className="num">1</span><p><b>Before entries open</b> we publish a sealed code: a fingerprint of a secret made on our server that nobody chooses or can change.</p></li>
      <li><span className="num">2</span><p><b>When entries close</b> every valid entry has a number, and the list is fingerprinted too.</p></li>
      <li><span className="num">3</span><p><b>At the draw</b> the secret is revealed. The {e.winners === 1 ? "winning number comes" : "winning numbers come"} from the secret and the list, so {done ? "anyone can check them below" : "anyone can check them afterwards"}.</p></li>
    </ol>
  );
}

function GiveEnter({ e, onDone }) {
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = e.status === "open" && Date.parse(e.closesAt) > Date.now();
  const enter = async () => {
    setBusy(true);
    try { const n = await source.enterGiveaway(e.id, e.rulesVersion); toast(`You're in. Entry ${no(n)}.`); setSheet(false); onDone(); }
    catch (err) { toast(errText(err, "Couldn't enter. Try again."), { warn: true }); }
    setBusy(false);
  };
  return (
    <section className="card cm-enter">
      <h3>Enter the draw</h3>
      <div className="cm-free"><b>Free to enter</b><span>No purchase necessary</span></div>
      <Terms e={e} onRead={() => setSheet(true)} />
      {e.entryNo
        ? <div className="cm-entered"><Icon name="check" size={16} /><span><b>You're in. Entry {no(e.entryNo)}.</b> Drawn {longDate(e.drawAt)}. We'll email you if you win.</span></div>
        : open ? <button type="button" className="btn cm-full-btn" disabled={busy} onClick={enter}>Accept the rules and enter</button>
          : <Note>Entries are closed.</Note>}
      {sheet && <RulesSheet e={e} onClose={() => setSheet(false)} onAccept={enter} canAccept={open && !e.entryNo} />}
    </section>
  );
}

function DrawRecord({ e, result }) {
  const [check, setCheck] = useState(null);
  const draws = result?.draws || [];
  const record = { giveaway: e.title, sealed_code: e.sealed, method: "pick n: sha256(secret:list_hash:n), first 13 hex digits mod count, skipping repeats", draws };
  const copy = async () => { try { await navigator.clipboard.writeText(JSON.stringify(record, null, 2)); toast("Copied the record"); } catch { toast("Couldn't copy. Select the record and copy it instead.", { warn: true }); } };
  const run = async () => { setCheck("busy"); try { setCheck(await verifyDraw({ sealed: e.sealed, draws })); } catch { setCheck({ ok: false, checks: [] }); } };
  const last = draws.at(-1);
  return (
    <section className="card cm-record">
      <h3>The draw's record</h3>
      <dl>
        <div><dt>Sealed code{e.sealedAt ? `, published ${day(e.sealedAt)}` : ""}</dt><dd className="num">{short(e.sealed)}</dd></div>
        {last && <div><dt>Secret, revealed at the draw</dt><dd className="num">{short(last.seed)}</dd></div>}
        {last && <div><dt>Entry list fingerprint</dt><dd className="num">{short(last.list_hash)}</dd></div>}
        {last && <div><dt>Valid entries</dt><dd className="num">{last.entries.length.toLocaleString()}</dd></div>}
        {draws.map((d) => <div key={d.round}><dt>{d.round === 1 ? "Winning numbers" : `Redraw ${d.round - 1}`}</dt><dd className="num">{d.picks.map(no).join(" · ")}</dd></div>)}
      </dl>
      <div className="cm-record-actions">
        <button type="button" className="btn ghost" onClick={run} disabled={check === "busy" || !draws.length}><Icon name="check" size={14} /> Check it here</button>
        <button type="button" className="btn ghost" onClick={copy} disabled={!draws.length}><Icon name="copy" size={14} /> Copy the record</button>
      </div>
      {check && check !== "busy" && (
        <ul className="cm-checks cm-verify">{check.checks.map((c, i) => <li key={i} className={c.ok ? "ok" : "no"}><Icon name={c.ok ? "check" : "close"} size={13} /><span><b>{c.label}</b></span></li>)}</ul>
      )}
      <p className="cm-fine">Checked in your browser with the same sums the draw used. Unclaimed prizes are redrawn the same way and added here.</p>
    </section>
  );
}

function Giveaway({ e, onBack, onDone }) {
  const drawn = e.status === "drawn";
  const result = useLoad(() => (drawn ? source.giveaway(e.id) : Promise.resolve(null)), [e.id, drawn]);
  const r = result.data;
  const mineWon = r?.winners?.find((w) => w.mine);
  return (
    <div className="cm-wrap cm-stack">
      <button type="button" className="fl-back" onClick={onBack}><Icon name="chevL" size={18} /> Events</button>
      <Banner small={drawn} mid img={artOf(e)} pos="50% 8%" kicker={drawn ? "Drawn" : "Giveaway · free prize draw"} title={e.title} line2={drawn ? "The draw." : e.tagline}
        side={
          <dl className="cm-banner-stats">
            <div><dt className="cm-kicker">{drawn ? "Drawn" : "Closes"}</dt><dd>{longDate(drawn ? e.drawAt : e.closesAt)}</dd></div>
            <div><dt className="cm-kicker">Winners</dt><dd className="num">{e.winners}</dd></div>
            <div><dt className="cm-kicker">To enter</dt><dd>Free</dd></div>
          </dl>
        }>
        {!drawn && e.blurb && <p className="cm-banner-line">{e.blurb}</p>}
      </Banner>
      <div className="cm-split">
        <div className="cm-col">
          {drawn ? (
            <section className="card">
              <h3>Winners</h3>
              {result.loading && !r && <Skeleton rows={3} label="Loading the winners" />}
              <ol className="cm-winners">
                {(r?.winners || []).map((w) => (
                  <li key={w.entry_no}>
                    <span className="cm-entry-no num">{no(w.entry_no)}</span>
                    {w.handle ? <span className="cm-winner"><b>{w.handle}</b></span> : <span className="cm-winner muted">{w.mine ? "You" : "Chose not to be named"}</span>}
                    <span className={`chip ${w.claim_status === "claimed" ? "silver" : ""}`}>{w.claim_status === "claimed" ? "Claimed" : w.claim_status === "expired" ? "Redrawn" : `Claim by ${day(w.claim_by)}`}</span>
                  </li>
                ))}
              </ol>
              {r?.mine && <div className="cm-mine-entry"><span className="num">{no(r.mine)}</span><span>{mineWon ? "You won. Check your email to claim your prize." : "Your entry wasn't drawn this time. Thanks for entering."}</span></div>}
              {mineWon && <p className="cm-fine"><button type="button" className="link" onClick={() => source.showHandle(e.id, !mineWon.handle).then(result.reload).catch(() => {})}>{mineWon.handle ? "Hide my handle on this page" : "Show my handle on this page"}</button></p>}
            </section>
          ) : e.prize.length > 0 && (
            <section className="card">
              <h3>The prize {e.winners > 1 && <span className="xs faint">Each of the {e.winners} winners gets all of it</span>}</h3>
              <ul className="cm-prize-list">{e.prize.map((p, i) => <li key={i}><Icon name="check" size={14} /><span><b>{p.title}</b>{p.detail && <span>{p.detail}</span>}</span></li>)}</ul>
            </section>
          )}
          <section className="card">
            <h3>How the draw works</h3>
            <HowDrawn e={e} done={drawn} />
            {!drawn && e.sealed && <div className="cm-seal"><span className="caps faint">Sealed code{e.sealedAt ? `, published ${day(e.sealedAt)}` : ""}</span><code className="num">{short(e.sealed)}</code></div>}
          </section>
        </div>
        <aside className="cm-col cm-sticky">{drawn ? <DrawRecord e={e} result={r} /> : <GiveEnter e={e} onDone={onDone} />}</aside>
      </div>
    </div>
  );
}

/* ---------- The hub ---------- */

export default function Events() {
  const { events, eventId, openEvent } = useCm();
  const list = [...(events.data?.competitions || []), ...(events.data?.giveaways || [])];
  const open = list.find((x) => x.id === eventId);
  if (events.loading && !events.data) return <div className="cm-wrap"><section className="card"><Skeleton rows={3} kind="lines" label="Loading events" /></section></div>;
  if (events.error && !events.data) return <div className="cm-wrap"><section className="card"><Note retry={events.reload}>Couldn't load events.</Note></section></div>;
  if (open?.kind === "cup") return <Competition e={open} onBack={() => openEvent(null)} />;
  if (open?.kind === "draw") return <Giveaway e={open} onBack={() => openEvent(null)} onDone={events.reload} />;
  if (!list.length) return null;
  return (
    <div className="cm-wrap cm-stack">
      <div className="fl-events">
        {list.map((e, i) => (
          <button type="button" key={e.id} className="fl-event rise-in" style={{ "--i": i }} onClick={() => openEvent(e.id)}>
            <InkPicture className="fl-event-pic" src={artOf(e, 960)} at="50% 8%" />
            <span className="fl-event-words">
              <Kicker live={e.status === "live"}>{e.kind === "cup" ? "Competition" : "Free prize draw"}</Kicker>
              <b className="loud">{e.title}</b>
              {e.blurb && <span>{e.blurb}</span>}
              <span className="fl-event-foot">
                <span>{e.kind === "cup" ? `${day(e.startsOn)} – ${day(e.endsOn)}` : `Closes ${longDate(e.closesAt)}`}</span>
                <span>{e.kind === "draw" && e.entryNo ? <><Icon name="check" size={13} /> You're in</> : eventLine(e)}</span>
                <Icon name="chevR" size={18} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
