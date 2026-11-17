import { useState } from "react";
import { toast } from "../../store";
import { CREWS } from "./houses";
import { useCm, useLoad } from "./context";
import { useMine } from "./mine";
import { errText, source } from "./source";
import { useRoll } from "../../drip/motion";
import { Note, Seg, Who } from "./parts";

const pctOf = (r) => (r?.traded ? Math.round((r.kept / r.traded) * 100) : 0);

// Places go by the share of days closed clean, and nothing else. The same share is the same place.
// A share can't be raised by trading more, which is why streaks aren't here.
export function placed(rows) {
  const sorted = rows.filter((r) => r.rank).sort((a, b) => pctOf(b) - pctOf(a) || a.handle.localeCompare(b.handle));
  let place = 0;
  return sorted.map((r, i) => {
    if (!i || pctOf(r) !== pctOf(sorted[i - 1])) place = i + 1;
    return { ...r, place };
  });
}

const TOP = 10;
const around = (rows, all) => {
  if (all || rows.length <= TOP + 4) return rows;
  const at = rows.findIndex((r) => r.mine);
  return rows.filter((r, i) => i < TOP || (at >= TOP && Math.abs(i - at) <= 1));
};

function Closed({ r }) {
  const shown = useRoll(r.kept);
  return <b className="fl-kept-pct">{Math.round(shown)}<span>/{r.traded}</span></b>;
}

function OptIn({ mine, shown, handle, busy, onSet }) {
  if (shown) {
    return (
      <p className="fl-kept-note">
        You're on this list as <b>@{handle}</b>. <button type="button" className="fl-text-btn" disabled={busy} onClick={() => onSet(false)}>Hide me</button>
      </p>
    );
  }
  return (
    <div className="fl-optin">
      <p><b>You're not on this list.</b> Your journal stays private until you choose. Showing shares your handle, crew and closed days, never your trades, dollars or win rate.{!mine.hasRules && " A clean close is measured against your own daily limits, so set one on your desk first."}</p>
      <button type="button" className="btn" disabled={busy} onClick={() => onSet(true)}>Show me</button>
    </div>
  );
}

// Who closed clean this month, among traders who chose to show
export default function Boards({ tag }) {
  const { mineFor, refreshBoard } = useCm();
  const [scope, setScope] = useState("crew");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = useMine("month");
  const crew = scope === "crew" ? tag : null;
  const board = useLoad(() => source.board({ period: "month", crew, order: "board", mine: mineFor("month") }), [crew]);
  const b = board.data;
  const rows = placed(b?.rows || []);
  const shown = around(rows, all);
  const me = (b?.rows || []).find((r) => r.mine);
  const set = async (on) => {
    setBusy(true);
    try { await source.setOptIn(on); await board.reload(); refreshBoard(); toast(on ? "You're on the list" : "You're off the list"); }
    catch (err) { toast(errText(err, "Couldn't change that. Try again."), { warn: true }); }
    setBusy(false);
  };
  return (
    <section className="fl-kept">
      <div className="fl-kept-head">
        <h3>Closed days this month</h3>
        <Seg label="Who" value={scope} onChange={(v) => { setScope(v); setAll(false); }} items={[["crew", CREWS[tag].name], ["all", "Everyone"]]} />
      </div>
      {board.loading && !b && <Note>Loading the list…</Note>}
      {board.error && !b && <Note retry={board.reload}>Couldn't load the list.</Note>}
      {b && !rows.length && <Note>No one{crew ? ` in the ${CREWS[crew].name}` : ""} is on the list yet. Traders show here once they've opted in and traded {b.min_days} days.</Note>}
      {rows.length > 0 && (
        <ol className={`fl-kept-list ${board.loading ? "busy" : ""}`}>
          {shown.map((r, i) => (
            <li key={r.handle} className={`rise-in ${r.mine ? "mine" : ""}`} style={{ "--i": Math.min(i, 8) }}>
              <span className="fl-kept-place num">{r.place}</span>
              <Who who={r} size={32} noTag sub={`${r.traded} days traded`} />
              <Closed r={r} />
            </li>
          ))}
        </ol>
      )}
      {shown.length < rows.length && <button type="button" className="fl-text-btn" onClick={() => setAll(true)}>Show all {rows.length}</button>}
      {b && <OptIn mine={mine} shown={b.opted_in} handle={me?.handle || mine.handle} busy={busy} onSet={set} />}
      <p className="fl-kept-note">Clean closes out of days traded. A clean close stays inside that trader's own daily limits. Imported trades only. Dollars never place anyone.</p>
    </section>
  );
}
