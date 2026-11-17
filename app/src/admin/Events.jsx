import { useState } from "react";
import { Icon } from "../components/ui";
import { Field, SubTabs } from "../components/forms";
import { rpc, useRpc } from "./api";
import {
  COMPETITION_MOVES, GIVEAWAY_MOVES, STATUS_WORD, competitionErrors, count, day, fromLocalInput,
  giveawayErrors, linesFromText, linesToText, localInput, plural, prizesFromText, prizesToText, rulesFromText, rulesToText, slugOf, when,
} from "./model";
import { Drawer, Reason, St, State, copy, go, useAct } from "./parts";

const TONE = { draft: "faint", open: "ink", live: "solid", review: "solid", final: "", cancelled: "faint", closed: "ink", drawn: "" };
const Status = ({ s }) => <St tone={TONE[s]}>{STATUS_WORD[s] || s}</St>;
const span = (a, b) => `${day(a)} – ${day(b)}`;

export default function Events({ tab = "competitions", open, mode }) {
  const ev = useRpc("admin_events", {}, []);
  const comps = ev.data?.competitions || [];
  const gives = ev.data?.giveaways || [];
  const section = tab === "giveaways" ? tab : "competitions";
  const close = () => go(`events/${section}`);
  const saved = (kind) => (newId) => { ev.reload(); go(`events/${kind}/${newId}`); };
  return (
    <div className="view">
      <div className="view-head">
        <div><h1>Competitions</h1><p>Competitions and giveaways. Nothing shows to traders until it's published.</p></div>
        <div className="actions">
          <SubTabs label="Events" value={section} onChange={(k) => go(`events/${k}`)} items={[["competitions", "Competitions"], ["giveaways", "Giveaways"]]} />
        </div>
      </div>

      {section === "competitions" && <>
        <div className="adm-bar"><button type="button" className="btn" onClick={() => go("events/competitions/new")}><Icon name="plus" size={14} /> New competition</button></div>
        <State q={ev} empty={ev.data && !comps.length ? "No competitions yet. Make one, then publish it when the rules are ready." : null}>
          <EventTable rows={comps} kind="competitions" cols={(c) => [span(c.starts_on, c.ends_on), `closes ${when(c.entry_closes_at)}`, `${plural(c.entrants, "entrant")}${c.disqualified ? ` · ${c.disqualified} out` : ""}`]} />
        </State>
        {open === "new" && <CompetitionForm onClose={close} onSaved={saved("competitions")} />}
        {open && open !== "new" && comps.find((c) => c.id === open) && (mode === "edit"
          ? <CompetitionForm c={comps.find((c) => c.id === open)} onClose={() => go(`events/competitions/${open}`)} onSaved={saved("competitions")} />
          : <Competition c={comps.find((c) => c.id === open)} onClose={close} onChange={ev.reload} />)}
      </>}

      {section === "giveaways" && <>
        <div className="adm-bar"><button type="button" className="btn" onClick={() => go("events/giveaways/new")}><Icon name="plus" size={14} /> New giveaway</button></div>
        <State q={ev} empty={ev.data && !gives.length ? "No giveaways yet. Make one, seal it, then publish it." : null}>
          <EventTable rows={gives} kind="giveaways" cols={(g) => [span(g.opens_at, g.closes_at), `draw ${when(g.draw_at)}`, `${plural(g.entries, "entry", "entries")}${g.winners ? ` · ${plural(g.winners, "winner")}` : ""}`]} />
        </State>
        {open === "new" && <GiveawayForm onClose={close} onSaved={saved("giveaways")} />}
        {open && open !== "new" && gives.find((g) => g.id === open) && (mode === "edit"
          ? <GiveawayForm g={gives.find((g) => g.id === open)} onClose={() => go(`events/giveaways/${open}`)} onSaved={saved("giveaways")} />
          : <Giveaway g={gives.find((g) => g.id === open)} onClose={close} onChange={ev.reload} />)}
      </>}
    </div>
  );
}

function EventTable({ rows, kind, cols }) {
  return (
    <section className="card flush">
      <table className="table adm-table hide-phone">
        <thead><tr><th>Event</th><th>Status</th><th>Dates</th><th>Entries</th><th>Taking part</th></tr></thead>
        <tbody>{rows.map((e) => {
          const [dates, closes, people] = cols(e);
          return (
            <tr key={e.id} onClick={() => go(`events/${kind}/${e.id}`)}>
              <td><span className="irow-main"><b>{e.title}</b><span className="faint xs">{e.tagline || e.slug}</span></span></td>
              <td><Status s={e.status} /></td>
              <td className="muted num">{dates}</td>
              <td className="muted">{closes}</td>
              <td className="muted num">{people}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="adm-list show-phone">{rows.map((e) => {
        const [dates, , people] = cols(e);
        return (
          <button key={e.id} type="button" className="lrow" onClick={() => go(`events/${kind}/${e.id}`)}>
            <span className="lrow-main"><b>{e.title}</b><span className="faint num">{dates}</span></span>
            <span className="lrow-end"><Status s={e.status} /><span className="xs faint">{people}</span></span>
          </button>
        );
      })}</div>
    </section>
  );
}

/* ---------- Making and editing ---------- */

const COMP_EDITABLE = {
  draft: null, open: null, // everything
  live: ["tagline", "blurb", "art", "prizes", "checks"],
  review: ["tagline", "blurb", "art", "prizes", "checks"],
  final: ["tagline", "blurb", "art", "checks"],
  cancelled: [],
};
const num = (v) => (v === "" || v == null ? null : Number(v));

function CompetitionForm({ c, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    title: c?.title || "", slug: c?.slug || "", tagline: c?.tagline || "", blurb: c?.blurb || "", art: c?.art || "",
    starts_on: c?.starts_on || "", ends_on: c?.ends_on || "", entry_closes_at: localInput(c?.entry_closes_at),
    max_trade_loss_pct: c?.limits?.max_trade_loss_pct ?? 1, daily_loss_pct: c?.limits?.daily_loss_pct ?? 2,
    max_trades: c?.limits?.max_trades ?? 4, stop_after: c?.limits?.stop_after ?? 2, account_size: c?.limits?.account_size ?? "",
    broken_day_r: c?.scoring?.broken_day_r ?? 2, min_days: c?.scoring?.min_days ?? 10,
    prizes: prizesToText(c?.prizes, true), summary: linesToText(c?.summary), rules: rulesToText(c?.rules),
    rules_version: c?.rules_version || "1.0", checks: rulesToText(c?.checks),
  }));
  const [slugTouched, setSlugTouched] = useState(!!c);
  const [tried, setTried] = useState(false);
  const [busy, act] = useAct();
  const status = c?.status || "draft";
  const editable = COMP_EDITABLE[status];
  const can = (k) => !editable || editable.includes(k);
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === "title" && !slugTouched ? { slug: slugOf(v) } : {}) }));
  };
  const errors = competitionErrors({ ...f, entry_closes_at: f.entry_closes_at });
  const payload = () => {
    const limits = { max_trade_loss_pct: num(f.max_trade_loss_pct), daily_loss_pct: num(f.daily_loss_pct), max_trades: num(f.max_trades), stop_after: num(f.stop_after) };
    if (num(f.account_size)) limits.account_size = num(f.account_size);
    const all = {
      title: f.title.trim(), slug: f.slug, tagline: f.tagline.trim() || null, blurb: f.blurb.trim() || null, art: f.art.trim() || null,
      starts_on: f.starts_on, ends_on: f.ends_on, entry_closes_at: fromLocalInput(f.entry_closes_at),
      limits, scoring: { broken_day_r: num(f.broken_day_r), min_days: num(f.min_days) },
      prizes: prizesFromText(f.prizes, true), summary: linesFromText(f.summary), rules: rulesFromText(f.rules),
      rules_version: f.rules_version.trim(), checks: rulesFromText(f.checks),
    };
    return editable ? Object.fromEntries(Object.entries(all).filter(([k]) => editable.includes(k))) : all;
  };
  const save = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).some(can)) return;
    act("save", () => rpc("admin_competition_save", { p_id: c?.id || null, p: payload() }), c ? "Saved" : "Competition made: still a draft").then((id) => id && onSaved(id));
  };
  const err = (k) => (tried && can(k) ? errors[k] : undefined);
  const lock = (k) => (can(k) ? undefined : "Fixed once it's live");
  return (
    <Drawer wide onClose={onClose} title={c ? `Edit ${c.title}` : "New competition"} sub={c ? `${STATUS_WORD[status]}. ${status === "open" ? "New rules need a new rules version, and every entrant accepts it again." : status === "draft" ? "Nothing shows to traders until you publish it." : ""}` : "It starts as a draft: nothing shows to traders until you publish it."}
      foot={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" form="comp-form" className="btn" disabled={!!busy}>{busy ? "Saving…" : c ? "Save changes" : "Make the draft"}</button></>}>
      <form id="comp-form" className="adm-form" onSubmit={save} noValidate>
        <div className="form-grid g2">
          <Field label="Title" error={err("title")} hint={lock("title")}><input className="input" value={f.title} onChange={set("title")} maxLength={80} disabled={!can("title")} /></Field>
          <Field label="Web address" error={err("slug")} hint={lock("slug") || "Its short name: lower-case letters, numbers and dashes"}><input className="input num" value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug")(e); }} maxLength={60} disabled={!can("slug")} /></Field>
          <Field label="Tagline" error={err("tagline")} hint="Optional, up to 80 characters"><input className="input" value={f.tagline} onChange={set("tagline")} maxLength={80} /></Field>
          <Field label="Picture" error={err("art")} hint="Optional: a path in the art library, like masters/sower-millet"><input className="input num" value={f.art} onChange={set("art")} maxLength={80} /></Field>
          <Field label="What it is" span={2} error={err("blurb")} hint="Optional, up to 240 characters"><textarea className="input" rows={2} value={f.blurb} onChange={set("blurb")} maxLength={240} /></Field>
        </div>

        <h4 className="adm-form-h">Dates</h4>
        <div className="form-grid g3">
          <Field label="First day" error={err("starts_on")} hint={lock("starts_on") || "New York trading days"}><input className="input num" type="date" value={f.starts_on} onChange={set("starts_on")} disabled={!can("starts_on")} /></Field>
          <Field label="Last day" error={err("ends_on")} hint={lock("ends_on")}><input className="input num" type="date" value={f.ends_on} onChange={set("ends_on")} disabled={!can("ends_on")} /></Field>
          <Field label="Entries close" error={err("entry_closes_at")} hint={lock("entry_closes_at") || "Your time"}><input className="input num" type="datetime-local" value={f.entry_closes_at} onChange={set("entry_closes_at")} disabled={!can("entry_closes_at")} /></Field>
        </div>

        <h4 className="adm-form-h">The cup's rules <span className="faint">the same for everyone, as a share of their account</span></h4>
        <div className="form-grid g4">
          <Field label="Most lost on a trade" hint={lock("limits") || "% of the account"}><input className="input num" type="number" min="0.1" step="0.1" value={f.max_trade_loss_pct} onChange={set("max_trade_loss_pct")} disabled={!can("limits")} /></Field>
          <Field label="Most lost in a day" hint="% of the account"><input className="input num" type="number" min="0.1" step="0.1" value={f.daily_loss_pct} onChange={set("daily_loss_pct")} disabled={!can("limits")} /></Field>
          <Field label="Most trades a day"><input className="input num" type="number" min="1" step="1" value={f.max_trades} onChange={set("max_trades")} disabled={!can("limits")} /></Field>
          <Field label="Stop after losses in a row"><input className="input num" type="number" min="1" step="1" value={f.stop_after} onChange={set("stop_after")} disabled={!can("limits")} /></Field>
          <Field label="Account size if the broker doesn't say" span={2} hint="Optional, in dollars"><input className="input num" type="number" min="0" step="1000" value={f.account_size} onChange={set("account_size")} disabled={!can("limits")} /></Field>
          <Field label="A broken day costs" hint="R"><input className="input num" type="number" min="0" step="0.5" value={f.broken_day_r} onChange={set("broken_day_r")} disabled={!can("scoring")} /></Field>
          <Field label="Days traded to be ranked"><input className="input num" type="number" min="1" step="1" value={f.min_days} onChange={set("min_days")} disabled={!can("scoring")} /></Field>
        </div>

        <h4 className="adm-form-h">Prizes and rules</h4>
        <div className="form-grid g1">
          <Field label="Prizes" hint="One a line: place | prize | detail. For example: 1st | £250 | Paid by bank transfer within 14 days"><textarea className="input num-ish" rows={3} value={f.prizes} onChange={set("prizes")} disabled={!can("prizes")} /></Field>
          <Field label="The rules in short" hint={lock("summary") || "One a line. Shown before anyone enters."}><textarea className="input" rows={3} value={f.summary} onChange={set("summary")} disabled={!can("summary")} /></Field>
          <Field label="The full rules" hint={lock("rules") || "A heading on its own line, then its text. A blank line between rules. Have them checked before the first prize."}><textarea className="input" rows={8} value={f.rules} onChange={set("rules")} disabled={!can("rules")} /></Field>
          <Field label="Rules version" error={err("rules_version")} hint={status === "open" ? "Change it if you change the rules: entrants accept the new version" : lock("rules_version")}><input className="input num" value={f.rules_version} onChange={set("rules_version")} maxLength={12} disabled={!can("rules_version")} style={{ maxWidth: 140 }} /></Field>
          {["live", "review", "final"].includes(status) && <Field label="How the result was checked" hint="Shown with the final table. Same format as the rules."><textarea className="input" rows={4} value={f.checks} onChange={set("checks")} /></Field>}
        </div>
        {tried && Object.keys(errors).some(can) && <p className="adm-form-err" role="alert">Check the fields marked above.</p>}
      </form>
    </Drawer>
  );
}

const GIVE_EDITABLE = { draft: null, open: ["tagline", "blurb", "art"], closed: ["tagline", "blurb", "art"], drawn: ["tagline", "blurb", "art"], cancelled: [] };

function GiveawayForm({ g, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    title: g?.title || "", slug: g?.slug || "", tagline: g?.tagline || "", blurb: g?.blurb || "", art: g?.art || "",
    opens_at: localInput(g?.opens_at), closes_at: localInput(g?.closes_at), draw_at: localInput(g?.draw_at),
    winners_count: g?.winners_count ?? 1, claim_days: g?.claim_days ?? 14,
    prize: prizesToText(g?.prize, false), summary: linesToText(g?.summary), rules: rulesToText(g?.rules), rules_version: g?.rules_version || "1.0",
  }));
  const [slugTouched, setSlugTouched] = useState(!!g);
  const [tried, setTried] = useState(false);
  const [busy, act] = useAct();
  const status = g?.status || "draft";
  const editable = GIVE_EDITABLE[status];
  const can = (k) => !editable || editable.includes(k);
  const set = (k) => (e) => { const v = e.target.value; setF((x) => ({ ...x, [k]: v, ...(k === "title" && !slugTouched ? { slug: slugOf(v) } : {}) })); };
  const errors = giveawayErrors({ ...f, winners_count: Number(f.winners_count), claim_days: Number(f.claim_days) });
  const save = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).some(can)) return;
    const all = {
      title: f.title.trim(), slug: f.slug, tagline: f.tagline.trim() || null, blurb: f.blurb.trim() || null, art: f.art.trim() || null,
      opens_at: fromLocalInput(f.opens_at), closes_at: fromLocalInput(f.closes_at), draw_at: fromLocalInput(f.draw_at),
      winners_count: Number(f.winners_count), claim_days: Number(f.claim_days), prize: prizesFromText(f.prize, false),
      summary: linesFromText(f.summary), rules: rulesFromText(f.rules), rules_version: f.rules_version.trim(),
    };
    const p = editable ? Object.fromEntries(Object.entries(all).filter(([k]) => editable.includes(k))) : all;
    act("save", () => rpc("admin_giveaway_save", { p_id: g?.id || null, p }), g ? "Saved" : "Giveaway made: still a draft").then((id) => id && onSaved(id));
  };
  const err = (k) => (tried && can(k) ? errors[k] : undefined);
  const lock = (k) => (can(k) ? undefined : "Fixed once it's open");
  return (
    <Drawer wide onClose={onClose} title={g ? `Edit ${g.title}` : "New giveaway"} sub="Free to enter, one entry per person. Seal it before publishing: the sealed code goes public first, so anyone can check the draw."
      foot={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" form="give-form" className="btn" disabled={!!busy}>{busy ? "Saving…" : g ? "Save changes" : "Make the draft"}</button></>}>
      <form id="give-form" className="adm-form" onSubmit={save} noValidate>
        <div className="form-grid g2">
          <Field label="Title" error={err("title")} hint={lock("title")}><input className="input" value={f.title} onChange={set("title")} maxLength={80} disabled={!can("title")} /></Field>
          <Field label="Web address" error={err("slug")} hint={lock("slug") || "Its short name: lower-case letters, numbers and dashes"}><input className="input num" value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug")(e); }} maxLength={60} disabled={!can("slug")} /></Field>
          <Field label="Tagline" error={err("tagline")} hint="Optional"><input className="input" value={f.tagline} onChange={set("tagline")} maxLength={80} /></Field>
          <Field label="Picture" hint="Optional: like anime/samurai-duel"><input className="input num" value={f.art} onChange={set("art")} maxLength={80} /></Field>
          <Field label="What it is" span={2} error={err("blurb")} hint="Optional, up to 240 characters"><textarea className="input" rows={2} value={f.blurb} onChange={set("blurb")} maxLength={240} /></Field>
        </div>
        <h4 className="adm-form-h">Dates <span className="faint">your time</span></h4>
        <div className="form-grid g3">
          <Field label="Entries open" error={err("opens_at")} hint={lock("opens_at")}><input className="input num" type="datetime-local" value={f.opens_at} onChange={set("opens_at")} disabled={!can("opens_at")} /></Field>
          <Field label="Entries close" error={err("closes_at")} hint={lock("closes_at")}><input className="input num" type="datetime-local" value={f.closes_at} onChange={set("closes_at")} disabled={!can("closes_at")} /></Field>
          <Field label="The draw" error={err("draw_at")} hint={lock("draw_at")}><input className="input num" type="datetime-local" value={f.draw_at} onChange={set("draw_at")} disabled={!can("draw_at")} /></Field>
          <Field label="Winners" error={err("winners_count")}><input className="input num" type="number" min="1" max="100" value={f.winners_count} onChange={set("winners_count")} disabled={!can("winners_count")} /></Field>
          <Field label="Days to claim" error={err("claim_days")}><input className="input num" type="number" min="1" max="90" value={f.claim_days} onChange={set("claim_days")} disabled={!can("claim_days")} /></Field>
        </div>
        <h4 className="adm-form-h">Prize and rules</h4>
        <div className="form-grid g1">
          <Field label="Prize" hint={lock("prize") || "One a line: prize | detail. For example: A trading book | Sent by post within 14 days"}><textarea className="input" rows={2} value={f.prize} onChange={set("prize")} disabled={!can("prize")} /></Field>
          <Field label="The rules in short" hint={lock("summary") || "One a line. Say it's free and needs no purchase."}><textarea className="input" rows={3} value={f.summary} onChange={set("summary")} disabled={!can("summary")} /></Field>
          <Field label="The full rules" hint={lock("rules") || "A heading on its own line, then its text. A blank line between rules."}><textarea className="input" rows={8} value={f.rules} onChange={set("rules")} disabled={!can("rules")} /></Field>
          <Field label="Rules version" error={err("rules_version")} hint={lock("rules_version")}><input className="input num" value={f.rules_version} onChange={set("rules_version")} maxLength={12} disabled={!can("rules_version")} style={{ maxWidth: 140 }} /></Field>
        </div>
        {tried && Object.keys(errors).some(can) && <p className="adm-form-err" role="alert">Check the fields marked above.</p>}
      </form>
    </Drawer>
  );
}

/* ---------- One competition ---------- */

function DeleteDraft({ busy, onKeep, onDelete }) {
  return (
    <div className="dr-block">
      <h3>Delete this draft?</h3>
      <p className="muted sm">Nobody has seen it. The log keeps its title.</p>
      <div className="dr-actions">
        <button type="button" className="btn ghost" onClick={onKeep}>Keep it</button>
        <button type="button" className="btn danger-solid" disabled={!!busy} onClick={onDelete}><Icon name="trash" size={14} /> Delete</button>
      </div>
    </div>
  );
}

function Competition({ c, onClose, onChange }) {
  const q = useRpc("admin_competition_entries", { p_id: c.id }, [c.id, c.status]);
  const [busy, act] = useAct();
  const [cancelling, setCancelling] = useState(null);
  const [dq, setDq] = useState(null); // { user_id, handle, reason }
  const move = (to) => {
    if (to === "final") return act("final", () => rpc("admin_competition_finalise", { p_id: c.id }), (n) => `Final: ${plural(n, "row")} frozen`).then((v) => v !== undefined && onChange());
    return act(to, () => rpc("admin_competition_status", { p_id: c.id, p_status: to }), `Now ${STATUS_WORD[to].toLowerCase()}`).then((v) => v !== undefined && onChange());
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const moves = (COMPETITION_MOVES[c.status] || []).filter(([to]) => (to === "live" ? today >= c.starts_on : to === "review" ? today > c.ends_on : true));
  const entries = q.data?.entries || [];
  const rows = q.data?.rows || [];
  return (
    <Drawer wide onClose={onClose} title={c.title} sub={`${span(c.starts_on, c.ends_on)} · entries close ${when(c.entry_closes_at)} · rules ${c.rules_version}`}
      extra={c.status === "draft" ? <button type="button" className="btn ghost danger" onClick={() => setCancelling("")}><Icon name="trash" size={14} /> Delete draft</button>
        : !["final", "cancelled"].includes(c.status) && <button type="button" className="btn ghost danger" onClick={() => setCancelling("")}>Cancel it</button>}
      foot={<>
        {c.status !== "cancelled" && <button type="button" className="btn ghost" onClick={() => go(`events/competitions/${c.id}/edit`)}><Icon name="edit" size={14} /> Edit</button>}
        {moves.map(([to, label]) => <button key={to} type="button" className={to === "draft" ? "btn ghost" : "btn"} disabled={!!busy} onClick={() => move(to)}>{busy === to ? "Saving…" : label}</button>)}
      </>}>
      <div className="dr-chips"><Status s={c.status} /><St tone="faint">{plural(c.entrants, "entrant")}</St>{c.disqualified > 0 && <St tone="faint">{c.disqualified} disqualified</St>}</div>
      <p className="muted sm">{{
        draft: "A draft: nobody sees it. Publish it when the rules are written and checked.",
        open: `Published: traders can read the rules and enter. It can go live on its first day, ${day(c.starts_on)}.`,
        live: `Running. The table counts synced trades only. The check can start after ${day(c.ends_on)}.`,
        review: "Finished: check the table (48 hours is the plan), disqualify anyone who broke the rules, then finalise.",
        final: "Final: the table is frozen. Mark each prize as you send it.",
        cancelled: "Cancelled.",
      }[c.status]}</p>

      {cancelling !== null && c.status === "draft" && <DeleteDraft busy={busy} onKeep={() => setCancelling(null)}
        onDelete={() => act("delete", () => rpc("admin_competition_delete", { p_id: c.id }), "Draft deleted").then((v) => { if (v !== undefined) { onChange(); onClose(); } })} />}
      {cancelling !== null && c.status !== "draft" && (
        <div className="dr-block">
          <h3>Cancel {c.title}?</h3>
          <Reason label="Why (kept in the log)" value={cancelling} onChange={setCancelling} />
          <div className="dr-actions">
            <button type="button" className="btn ghost" onClick={() => setCancelling(null)}>Keep it</button>
            <button type="button" className="btn" disabled={cancelling.trim().length < 3 || !!busy} onClick={() => act("cancel", () => rpc("admin_competition_status", { p_id: c.id, p_status: "cancelled", p_reason: cancelling }), "Cancelled").then((v) => v !== undefined && onChange())}>Cancel the competition</button>
          </div>
        </div>
      )}

      {dq && (
        <div className="dr-block">
          <h3>Disqualify @{dq.handle}</h3>
          <Reason label="The reason (they're told)" max={500} value={dq.reason} onChange={(reason) => setDq({ ...dq, reason })} placeholder="Two accounts entered by one person" />
          <div className="dr-actions">
            <button type="button" className="btn ghost" onClick={() => setDq(null)}>Don't</button>
            <button type="button" className="btn" disabled={dq.reason.trim().length < 3 || !!busy} onClick={() => act("dq", () => rpc("admin_competition_entry", { p_id: c.id, p_user: dq.user_id, p_action: "disqualify", p_reason: dq.reason }), `@${dq.handle} disqualified`).then((v) => { if (v !== undefined) { setDq(null); q.reload(); onChange(); } })}>Disqualify</button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <section>
          <h3 className="adm-sub">{c.status === "final" ? "Final table" : "The table now"}</h3>
          <div className="adm-scroll-x">
            <table className="table adm-table compact">
              <thead><tr><th className="right-al">#</th><th>Trader</th><th className="right-al">Days</th><th className="right-al">Kept</th><th className="right-al">Score</th>{c.status === "final" && <th>Prize</th>}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.user_id} className="static">
                  <td className="right-al num">{r.rank ?? "–"}</td><td className="num">@{r.handle}</td><td className="right-al num">{r.traded}</td><td className="right-al num">{r.kept}</td><td className="right-al num">{Number(r.score).toFixed(2)}R</td>
                  {c.status === "final" && <td><Prize c={c} r={r} onSaved={q.reload} /></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="adm-sub">Entrants <span className="faint">{plural(entries.length, "entry", "entries")}</span></h3>
        <State q={q} empty={q.data && !entries.length ? "Nobody has entered yet." : null}>
          <div className="list-rows">{entries.map((e) => (
            <div key={e.user_id} className="list-row">
              <span className="irow-main">
                <b className="num">@{e.handle} {e.status !== "entered" && <St tone={e.status === "disqualified" ? "solid" : "faint"}>{e.status === "disqualified" ? "Disqualified" : "Withdrew"}</St>}</b>
                <span className="faint xs num">${count(e.account_size)} · {e.broker === "ibkr" ? "IBKR" : "Topstep"} · rules {e.rules_version} · {day(e.accepted_at)}{e.email ? ` · ${e.email}` : ""}</span>
                {e.dq_reason && <span className="xs">“{e.dq_reason}”</span>}
              </span>
              {!["final", "cancelled"].includes(c.status) && (e.status === "disqualified"
                ? <button type="button" className="link" disabled={!!busy} onClick={() => act("re", () => rpc("admin_competition_entry", { p_id: c.id, p_user: e.user_id, p_action: "reinstate" }), `@${e.handle} is back in`).then((v) => { if (v !== undefined) { q.reload(); onChange(); } })}>Reinstate</button>
                : e.status === "entered" && <button type="button" className="link" onClick={() => setDq({ user_id: e.user_id, handle: e.handle, reason: "" })}>Disqualify</button>)}
            </div>
          ))}</div>
        </State>
      </section>
    </Drawer>
  );
}

function Prize({ c, r, onSaved }) {
  const [prize, setPrize] = useState(r.prize || "");
  const [status, setStatus] = useState(r.prize_status || "");
  const [busy, act] = useAct();
  const dirty = prize !== (r.prize || "") || status !== (r.prize_status || "");
  return (
    <span className="prize-cell">
      <input className="input" value={prize} onChange={(e) => setPrize(e.target.value)} maxLength={120} placeholder="None" aria-label={`Prize for @${r.handle}`} />
      <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Sent?">
        <option value="">–</option><option value="pending">To send</option><option value="sent">Sent</option><option value="declined">Declined</option>
      </select>
      {dirty && <button type="button" className="link" disabled={!!busy} onClick={() => act("p", () => rpc("admin_competition_prize", { p_id: c.id, p_user: r.user_id, p_prize: prize, p_status: status || null }), "Prize saved").then((v) => v !== undefined && onSaved())}>Save</button>}
    </span>
  );
}

/* ---------- One giveaway ---------- */

function Giveaway({ g, onClose, onChange }) {
  const q = useRpc("admin_giveaway_entries", { p_id: g.id }, [g.id, g.status, g.draws]);
  const [busy, act] = useAct();
  const [cancelling, setCancelling] = useState(null);
  const [bad, setBad] = useState(null); // { entry_no, reason }
  const [redraw, setRedraw] = useState(1);
  const [dq, setDq] = useState(null); // a winner being disqualified
  const closed = Date.now() >= new Date(g.closes_at).getTime();
  const done = (v) => { if (v !== undefined) { q.reload(); onChange(); } };
  const moves = (GIVEAWAY_MOVES[g.status] || []).filter(([to]) => (to === "seal" ? !g.seed_hash : to === "open" ? !!g.seed_hash : to === "closed" ? closed : true));
  const move = (to) => {
    if (to === "seal") return act("seal", () => rpc("admin_giveaway_seal", { p_id: g.id }), "Sealed: the code is fixed").then(done);
    if (to === "draw") return act("draw", () => rpc("admin_giveaway_draw", { p_id: g.id, p_count: null }), (p) => `Drawn: entry ${(p || []).join(", ")}`).then(done);
    if (to === "redraw") return act("redraw", () => rpc("admin_giveaway_draw", { p_id: g.id, p_count: Number(redraw) }), (p) => `Drawn again: entry ${(p || []).join(", ")}`).then(done);
    return act(to, () => rpc("admin_giveaway_status", { p_id: g.id, p_status: to }), `Now ${STATUS_WORD[to].toLowerCase()}`).then(done);
  };
  const entries = q.data?.entries || [];
  const winners = q.data?.winners || [];
  const draws = q.data?.draws || [];
  return (
    <Drawer wide onClose={onClose} title={g.title} sub={`Entries ${span(g.opens_at, g.closes_at)} · draw ${when(g.draw_at)} · ${plural(g.winners_count, "winner")} · ${g.claim_days} days to claim`}
      extra={g.status === "draft" ? <button type="button" className="btn ghost danger" onClick={() => setCancelling("")}><Icon name="trash" size={14} /> Delete draft</button>
        : ["open", "closed"].includes(g.status) && <button type="button" className="btn ghost danger" onClick={() => setCancelling("")}>Cancel it</button>}
      foot={<>
        {g.status !== "cancelled" && <button type="button" className="btn ghost" onClick={() => go(`events/giveaways/${g.id}/edit`)}><Icon name="edit" size={14} /> Edit</button>}
        {g.status === "drawn" && <label className="redraw"><span className="faint xs">Draw</span><input className="input num" type="number" min="1" max="100" value={redraw} onChange={(e) => setRedraw(e.target.value)} aria-label="How many to draw again" /></label>}
        {moves.map(([to, label]) => <button key={to} type="button" className={to === "draft" ? "btn ghost" : "btn"} disabled={!!busy} onClick={() => move(to)}>{busy === to ? "Working…" : label}</button>)}
      </>}>
      <div className="dr-chips"><Status s={g.status} /><St tone={g.seed_hash ? "ink" : "faint"}>{g.seed_hash ? "Sealed" : "Not sealed"}</St><St tone="faint">{plural(g.entries, "entry", "entries")}{g.entries !== g.valid ? ` · ${g.entries - g.valid} invalid` : ""}</St></div>
      {g.seed_hash && <p className="xs faint seal-line">Sealed code <button type="button" className="link num" onClick={() => copy(g.seed_hash, "Sealed code copied")}>{g.seed_hash.slice(0, 16)}…</button>, published before entries open. The secret behind it is made by the server and shown only with the draw.</p>}
      {g.status === "open" && !closed && <p className="muted sm">Entries close {when(g.closes_at)}. You can close it then, and run the draw.</p>}

      {cancelling !== null && g.status === "draft" && <DeleteDraft busy={busy} onKeep={() => setCancelling(null)}
        onDelete={() => act("delete", () => rpc("admin_giveaway_delete", { p_id: g.id }), "Draft deleted").then((v) => { if (v !== undefined) { onChange(); onClose(); } })} />}
      {cancelling !== null && g.status !== "draft" && (
        <div className="dr-block">
          <h3>Cancel {g.title}?</h3>
          <Reason label="Why (kept in the log)" value={cancelling} onChange={setCancelling} />
          <div className="dr-actions">
            <button type="button" className="btn ghost" onClick={() => setCancelling(null)}>Keep it</button>
            <button type="button" className="btn" disabled={cancelling.trim().length < 3 || !!busy} onClick={() => act("cancel", () => rpc("admin_giveaway_status", { p_id: g.id, p_status: "cancelled", p_reason: cancelling }), "Cancelled").then(done)}>Cancel the giveaway</button>
          </div>
        </div>
      )}

      {winners.length > 0 && (
        <section>
          <h3 className="adm-sub">Winners</h3>
          {dq && (
            <div className="dr-block">
              <h3>Disqualify entry {dq.entry_no}</h3>
              <Reason label="The reason (shown with the result)" max={200} value={dq.reason} onChange={(reason) => setDq({ ...dq, reason })} placeholder="Second account of an existing entrant" />
              <div className="dr-actions">
                <button type="button" className="btn ghost" onClick={() => setDq(null)}>Don't</button>
                <button type="button" className="btn" disabled={dq.reason.trim().length < 3 || !!busy} onClick={() => act("wdq", () => rpc("admin_giveaway_winner", { p_id: g.id, p_entry_no: dq.entry_no, p_status: "disqualified", p_reason: dq.reason }), "Disqualified. Draw again for the prize.").then((v) => { if (v !== undefined) { setDq(null); done(v); } })}>Disqualify</button>
              </div>
            </div>
          )}
          <div className="list-rows">{winners.map((w) => (
            <div key={w.entry_no} className="list-row winner-row">
              <span className="irow-main">
                <b className="num">Entry {w.entry_no}{w.handle ? ` · @${w.handle}` : " · a web entry"} <span className="faint xs">round {w.round}</span></b>
                <span className="faint xs">{w.claim_status === "claimed" ? `Claimed ${day(w.claimed_at)}` : `Claim by ${when(w.claim_by)}`}{w.email ? <> · <button type="button" className="link xs" onClick={() => copy(w.email, "Email copied")}>{w.email}</button></> : null}{w.show_handle ? " · handle shown" : ""}</span>
                {w.reason && <span className="xs">“{w.reason}”</span>}
              </span>
              <select className="input winner-sel" value={w.claim_status} disabled={!!busy} aria-label={`Entry ${w.entry_no}`}
                onChange={(e) => (e.target.value === "disqualified" ? setDq({ entry_no: w.entry_no, reason: "" })
                  : act("w", () => rpc("admin_giveaway_winner", { p_id: g.id, p_entry_no: w.entry_no, p_status: e.target.value }), "Saved").then(done))}>
                <option value="open">Waiting to claim</option><option value="claimed">Claimed</option><option value="expired">Not claimed in time</option><option value="disqualified">Disqualified</option>
              </select>
            </div>
          ))}</div>
        </section>
      )}

      {bad && (
        <div className="dr-block">
          <h3>Entry {bad.entry_no} isn't valid</h3>
          <Reason label="Why (published with the draw)" max={200} value={bad.reason} onChange={(reason) => setBad({ ...bad, reason })} placeholder="Second account of entry 12" />
          <div className="dr-actions">
            <button type="button" className="btn ghost" onClick={() => setBad(null)}>Don't</button>
            <button type="button" className="btn" disabled={bad.reason.trim().length < 3 || !!busy} onClick={() => act("bad", () => rpc("admin_giveaway_entry", { p_id: g.id, p_entry_no: bad.entry_no, p_valid: false, p_reason: bad.reason }), "Marked invalid").then((v) => { if (v !== undefined) { setBad(null); done(v); } })}>Mark invalid</button>
          </div>
        </div>
      )}

      <section>
        <h3 className="adm-sub">Entries <span className="faint">{closed ? "fixed now entries have closed" : "you can mark one invalid until entries close"}</span></h3>
        <State q={q} empty={q.data && !entries.length ? "No entries yet." : null}>
          <div className="list-rows entries">{entries.slice(0, 300).map((e) => (
            <div key={e.entry_no} className="list-row">
              <span className="irow-main">
                <b className="num">{e.entry_no} · {e.handle ? `@${e.handle}` : "web entry"} {!e.valid && <St tone="solid">Invalid</St>}</b>
                <span className="faint xs">{e.route === "web" ? "Free web form" : "In the app"} · {when(e.accepted_at)}{e.invalid_reason ? ` · “${e.invalid_reason}”` : ""}</span>
              </span>
              {!closed && (e.valid
                ? <button type="button" className="link" onClick={() => setBad({ entry_no: e.entry_no, reason: "" })}>Mark invalid</button>
                : <button type="button" className="link" disabled={!!busy} onClick={() => act("ok", () => rpc("admin_giveaway_entry", { p_id: g.id, p_entry_no: e.entry_no, p_valid: true }), "Valid again").then(done)}>Valid again</button>)}
            </div>
          ))}</div>
          {entries.length > 300 && <p className="faint xs">Showing the first 300 of {count(entries.length)}.</p>}
        </State>
      </section>

      {draws.length > 0 && (
        <section>
          <h3 className="adm-sub">The public record</h3>
          <div className="list-rows">{draws.map((d) => (
            <div key={d.round} className="list-row">
              <span className="irow-main"><b>Round {d.round} · picked {d.picks.join(", ")}</b><span className="faint xs num">{when(d.drawn_at)} · from {count(d.count)} valid entries · list {d.list_hash.slice(0, 12)}…</span></span>
            </div>
          ))}</div>
        </section>
      )}
    </Drawer>
  );
}

