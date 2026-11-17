import { useState } from "react";
import { Avatar, Icon } from "../components/ui";
import { SubTabs } from "../components/forms";
import StaffDesk from "../live/Staff";
import { rpc, useRpc } from "./api";
import { RESOLUTION_WORD, ago, day, plural, reportTarget } from "./model";
import { I, St, State, go, useAct } from "./parts";
import { crewName, roomName } from "../views/community/houses";

const WHERE = { post: "Post", chat: "Chat", idea: "Idea" };
const room = (r) => roomName(r) || r;

export default function Reports({ tab = "waiting", onChange }) {
  const section = ["waiting", "decided", "messages"].includes(tab) ? tab : "waiting";
  return (
    <div className="view">
      <div className="view-head">
        <div><h1>Reports</h1><p>What traders reported in the feed, the chat and ideas, and reported private messages. Anonymous posts show their real author here, and only here.</p></div>
        <div className="actions">
          <SubTabs label="Reports" value={section} onChange={(k) => go(`reports/${k}`)} items={[["waiting", "Waiting"], ["decided", "Decided"], ["messages", "Private messages"]]} />
        </div>
      </div>
      {section === "messages" ? <StaffDesk /> : <Cards open={section === "waiting"} onChange={onChange} />}
    </div>
  );
}

function Cards({ open, onChange }) {
  const q = useRpc("admin_reports", { p_open: open }, [open]);
  const [busy, act] = useAct();
  const [sure, setSure] = useState(null); // the card waiting for "delete" to be confirmed
  const cards = q.data || [];
  const decide = (c, action) => act(`${c.id}:${action}`, () => rpc("admin_report_resolve", { p_kind: c.kind, p_id: c.id, p_action: action }),
    { keep: "Kept: the reports are closed", hide: "Hidden from everyone", unhide: "Shown again", delete: "Deleted" }[action])
    .then((v) => { if (v !== undefined) { setSure(null); q.reload(); onChange(); } });
  return (
    <State q={q} empty={q.data && !cards.length ? (open ? "Nothing reported. Nothing waiting on you." : "No decisions in the last 90 days.") : null}>
      <div className="grid g12">{cards.map((c) => {
        const t = reportTarget(c) || {};
        const a = t.author;
        const hidden = !!t.hidden;
        return (
          <section key={c.id} className="card c6 report">
            <div className="rep-why">
              <Icon name="flag" size={14} />
              <span>{plural(c.count, "report")} · {WHERE[c.kind]}{c.kind === "chat" ? ` in ${room(t.room)}` : ""}{!open && c.resolution ? ` · ${RESOLUTION_WORD[c.resolution]} ${ago(c.resolved_at)}` : ""}</span>
            </div>
            <div className="post-mock">
              <div className="pm-head">
                <Avatar name={t.anonymous ? "?" : a?.handle || "?"} size={34} />
                <span className="who-text">
                  <b>{t.anonymous ? "Anonymous" : a ? `@${a.handle}` : "A deleted account"}</b>
                  <span className="faint xs">{t.anonymous ? "posted anonymously" : crewName(t.crew) || (c.kind === "idea" ? t.area : "")}{t.at ? ` · ${ago(t.at)}` : ""}{t.reply ? " · a reply" : ""}</span>
                </span>
                {hidden && <St tone="faint">Hidden</St>}
              </div>
              {c.kind === "idea" && t.title && <b className="pm-title">{t.title}</b>}
              <p className="pm-body">{t.body || "It's gone."}</p>
              {(t.image || t.trade) && <span className="faint xs">{[t.image && "with a picture", t.trade && "with a trade card"].filter(Boolean).join(", ")}</span>}
            </div>
            {a && <p className="xs muted rep-author">{t.anonymous ? <>Only you can see the author: <b className="num">@{a.handle}</b></> : <>@{a.handle}</>} · joined {day(a.joined)} · <button type="button" className="link xs" onClick={() => go(`traders/${a.id}`)}>Open trader</button></p>}
            <ul className="rep-list">{c.reports.map((r, i) => <li key={i}><span>“{r.reason}”</span><span className="faint xs">{r.by ? `@${r.by}` : "a deleted account"} · {ago(r.at)}</span></li>)}</ul>
            {sure === c.id ? (
              <div className="rep-actions">
                <span className="xs muted rep-sure">Delete it for good? Its reports go with it; the log keeps who wrote it and its first 200 characters.</span>
                <button type="button" className="btn ghost" onClick={() => setSure(null)}>Don't</button>
                <button type="button" className="btn danger-solid" disabled={!!busy} onClick={() => decide(c, "delete")}><Icon name="trash" size={14} /> Delete</button>
              </div>
            ) : (
              <div className="rep-actions">
                {open && <button type="button" className="btn ghost" disabled={!!busy} onClick={() => decide(c, "keep")}><Icon name="check" size={14} /> Keep</button>}
                {c.kind !== "idea" && !hidden && <button type="button" className="btn ghost" disabled={!!busy} onClick={() => decide(c, "hide")}><I n="eyeOff" size={14} /> Hide</button>}
                {c.kind !== "idea" && hidden && <button type="button" className="btn ghost" disabled={!!busy} onClick={() => decide(c, "unhide")}><I n="eye" size={14} /> Show again</button>}
                <button type="button" className="btn ghost danger" disabled={!!busy} onClick={() => setSure(c.id)}><Icon name="trash" size={14} /> Delete</button>
              </div>
            )}
          </section>
        );
      })}</div>
    </State>
  );
}
