import { useEffect, useState } from "react";
import { Card, Icon } from "../components/ui";
import { toast, useStore } from "../store";
import { listBugReports, screenshotUrl, setBugStatus } from "./bugs";
import StaffDesk from "./Staff";

const ADMIN_AREA = import.meta.env.PROD ? "/admin/" : "./admin.html";

export default function Team() {
  const admin = useStore((s) => s.me?.admin);
  if (!admin) return (
    <div className="view"><div className="view-head"><div><h1>Admin</h1><p>This page is for Marble's team.</p></div></div></div>
  );
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1>Admin</h1>
          <p>Reported messages and bug reports from traders.</p>
        </div>
        <a className="btn ghost" href={ADMIN_AREA}><Icon name="desk" size={14} /> Open the admin area</a>
      </div>

      <StaffDesk />
      <div className="grid g12"><BugReports /></div>
    </div>
  );
}

/* ---------- Bug reports, newest first ---------- */

const STATUS_NEXT = { new: "seen", seen: "fixed", fixed: "new" };
const STATUS_LABEL = { new: "Mark seen", seen: "Mark fixed", fixed: "Reopen" };
const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function BugReports() {
  const [rows, setRows] = useState(null);
  const [show, setShow] = useState("open");
  const [shots, setShots] = useState({});
  const load = () => listBugReports().then(setRows, (e) => setRows({ error: e.message }));
  useEffect(() => { load(); }, []);
  const list = Array.isArray(rows) ? rows.filter((r) => (show === "open" ? r.status !== "fixed" : true)) : [];
  const open = Array.isArray(rows) ? rows.filter((r) => r.status === "new").length : 0;
  const step = async (r) => {
    try { await setBugStatus(r.id, STATUS_NEXT[r.status]); setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: STATUS_NEXT[r.status] } : x))); }
    catch { toast("Couldn't update that report"); }
  };
  const seeShot = async (r) => {
    try { const url = await screenshotUrl(r.screenshot_path); setShots((s) => ({ ...s, [r.id]: url })); }
    catch { toast("Couldn't open the screenshot"); }
  };
  return (
    <Card className="c12">
      <h3>Bug reports <span className="caps">{open ? `${open} new` : ""}</span>
        <span className="row" style={{ gap: 12, marginLeft: "auto" }}>
          <button className="link" aria-pressed={show === "open"} onClick={() => setShow(show === "open" ? "all" : "open")}>{show === "open" ? "Show fixed too" : "Hide fixed"}</button>
          <button className="link" onClick={load}>Refresh</button>
        </span>
      </h3>
      {rows === null && <p className="muted">Loading…</p>}
      {rows?.error && <p className="muted">Couldn't load reports: {rows.error}</p>}
      {Array.isArray(rows) && !list.length && <p className="muted">{rows.length ? "Every report is fixed." : "No bug reports yet."}</p>}
      <div className="list-rows">
        {list.map((r) => (
          <div className="list-row bug-row" key={r.id}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="bug-msg">{r.message}</div>
              <div className="xs faint bug-meta">
                {r.handle ? `@${r.handle}` : "A trader"} · {when(r.created_at)} · {r.context?.screen || "–"} · {r.context?.viewport || ""} · <b>{r.status}</b>
              </div>
              <details>
                <summary className="xs muted">Details</summary>
                {r.steps && <pre>{r.steps}</pre>}
                <pre>{JSON.stringify(r.context, null, 2)}</pre>
                {r.screenshot_path && (shots[r.id]
                  ? <img className="bug-shot-big" src={shots[r.id]} alt="The screenshot sent with this report" />
                  : <button className="link xs" onClick={() => seeShot(r)}>Show the screenshot</button>)}
              </details>
            </div>
            <button className="btn ghost" style={{ flexShrink: 0 }} onClick={() => step(r)}>{STATUS_LABEL[r.status]}</button>
          </div>
        ))}
      </div>
    </Card>
  );
}
