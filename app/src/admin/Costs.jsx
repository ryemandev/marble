import { useState } from "react";
import { Icon } from "../components/ui";
import { Choice, Field } from "../components/forms";
import { rpc, useRpc } from "./api";
import { costErrors, costLive, day, gbp, monthlyPence } from "./model";
import { Drawer, State, useAct } from "./parts";

// What Marble pays for each month: hosting, email, the domain, tools. Opened from Today.
export default function Costs({ onClose, onChanged }) {
  const q = useRpc("admin_costs", {}, []);
  const [edit, setEdit] = useState(null); // a cost, or {} for a new one
  const rows = q.data || [];
  const month = rows.filter((c) => costLive(c)).reduce((s, c) => s + monthlyPence(c), 0);
  const saved = () => { setEdit(null); q.reload(); onChanged?.(); };
  if (edit) return <Cost c={edit} onClose={() => setEdit(null)} onSaved={saved} />;
  return (
    <Drawer onClose={onClose} label="Running costs" title="Running costs" sub={`${gbp(month, 2)} a month · ${gbp(month * 12)} a year`}
      foot={<button type="button" className="btn" onClick={() => setEdit({})}><Icon name="plus" size={14} /> Add a cost</button>}>
      <State q={q} empty={q.data && !rows.length ? "Nothing yet. Add hosting, email, the domain and tools: anything Marble pays for." : null}>
        <div className="adm-list cost-list">{rows.map((c) => {
          const live = costLive(c);
          return (
            <button key={c.id} type="button" className={`lrow ${live ? "" : "faint"}`} onClick={() => setEdit(c)}>
              <span className="lrow-main"><b>{c.name}</b><span className="faint">{c.every === "year" ? `${gbp(c.pence, 2)} a year` : "Monthly"} · since {day(c.since)}{c.until ? ` · until ${day(c.until)}` : ""}{c.note ? ` · ${c.note}` : ""}</span></span>
              <span className="lrow-end"><span className="num">{gbp(monthlyPence(c), 2)}</span><span className="xs faint">{live ? "a month" : "not now"}</span></span>
            </button>
          );
        })}</div>
      </State>
      {rows.length > 0 && <p className="faint xs">A yearly cost counts as a twelfth each month.</p>}
    </Drawer>
  );
}

function Cost({ c, onClose, onSaved }) {
  const isNew = !c.id;
  const [f, setF] = useState({ name: c.name || "", pounds: c.pence != null ? String(c.pence / 100) : "", every: c.every || "month",
    since: c.since || new Date().toISOString().slice(0, 10), until: c.until || "", note: c.note || "" });
  const [tried, setTried] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, run] = useAct();
  const e = costErrors(f);
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const show = (k) => (tried ? e[k] : null);
  const save = () => {
    setTried(true);
    if (Object.keys(e).length) return;
    run("save", () => rpc("admin_cost_save", { p_id: c.id || null, p: { name: f.name.trim(), pence: Math.round(Number(f.pounds) * 100), every: f.every, since: f.since, until: f.until || null, note: f.note.trim() } }), "Saved")
      .then((r) => r !== undefined && onSaved());
  };
  const del = () => run("del", () => rpc("admin_cost_delete", { p_id: c.id }), "Deleted").then((r) => r !== undefined && onSaved());
  return (
    <Drawer onClose={onClose} label="Cost" title={isNew ? "Add a cost" : c.name}
      extra={!isNew && (sure
        ? <><button type="button" className="btn ghost" onClick={() => setSure(false)}>Keep it</button><button type="button" className="btn danger-solid" disabled={busy === "del"} onClick={del}>Delete it</button></>
        : <button type="button" className="btn ghost" onClick={() => setSure(true)}>Delete</button>)}
      foot={<><button type="button" className="btn ghost" onClick={onClose}>Back</button><button type="button" className="btn" disabled={busy === "save"} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</button></>}>
      <div className="adm-form">
        <Field label="What" error={show("name")}><input className="input" value={f.name} maxLength={60} placeholder="e.g. Supabase Pro" onChange={set("name")} /></Field>
        <div className="form-grid g2">
          <Field label="Amount, £" error={show("pounds")} hint="As charged, with VAT"><input className="input num" inputMode="decimal" value={f.pounds} onChange={set("pounds")} /></Field>
          <Field label="Every"><Choice label="Every" value={f.every} onChange={(v) => setF({ ...f, every: v })} options={[["month", "Month"], ["year", "Year"]]} /></Field>
          <Field label="Since"><input className="input" type="date" value={f.since} onChange={set("since")} /></Field>
          <Field label="Until" hint="Empty: still paying" error={show("until")}><input className="input" type="date" value={f.until} onChange={set("until")} /></Field>
        </div>
        <Field label="Note" error={show("note")}><input className="input" value={f.note} maxLength={200} onChange={set("note")} /></Field>
      </div>
    </Drawer>
  );
}
