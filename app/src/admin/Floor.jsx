import { useState } from "react";
import { SubTabs } from "../components/forms";
import { rpc, useRpc } from "./api";
import { IDEA_STATUSES, ago, count, plural } from "./model";
import { St, State, go, useAct } from "./parts";

const KIND = { win: "Win", lesson: "Lesson", question: "Question" };

// The Floor from the owner's side: pin what everyone should see first, and answer ideas
export default function Floor({ tab, onChange }) {
  const section = tab === "ideas" ? "ideas" : "posts";
  const q = useRpc("admin_floor", {}, []);
  const d = q.data;
  const waiting = (d?.ideas || []).filter((i) => i.status === "Under review").length;
  const changed = () => { q.reload(); onChange(); };
  return (
    <div className="view">
      <div className="view-head">
        <div><h1>Floor</h1><p>Pin the posts everyone should see first, and tell traders what's happening with their ideas.</p></div>
        <SubTabs label="Floor" value={section} onChange={(k) => go(`floor/${k}`)}
          items={[["posts", "Posts"], ["ideas", waiting ? `Ideas · ${waiting} new` : "Ideas"]]} />
      </div>
      <State q={q}>{d && (section === "posts" ? <Posts rows={d.posts} onChange={changed} /> : <Ideas rows={d.ideas} onChange={changed} />)}</State>
    </div>
  );
}

function Posts({ rows, onChange }) {
  const [busy, act] = useAct();
  const pinned = rows.filter((p) => p.pinned_at).length;
  const pin = (p) => act(`pin:${p.id}`, () => rpc("pin_post", { p_id: p.id, p_on: !p.pinned_at }), p.pinned_at ? "Unpinned" : "Pinned to the top of the Floor")
    .then((v) => v !== undefined && onChange());
  const hide = (p) => act(`hide:${p.id}`, () => rpc("admin_report_resolve", { p_kind: "post", p_id: p.id, p_action: p.hidden ? "unhide" : "hide" }), p.hidden ? "Shown again" : "Hidden from everyone")
    .then((v) => v !== undefined && onChange());
  return (
    <section className="card flush">
      <div className="tool-row"><h3 className="tool-title">Posts</h3><span className="faint xs">Pinned first, then the last 30 days · {pinned} of 3 pins used</span></div>
      {rows.length ? (
        <div className="adm-list">{rows.map((p) => (
          <div key={p.id} className={`lrow fl-adm-row ${p.hidden ? "faint" : ""}`}>
            <span className="lrow-main">
              <span className="fl-adm-head">
                {p.pinned_at && <St tone="solid">Pinned</St>}
                {p.hidden && <St tone="ink">Hidden</St>}
                <b>{p.anonymous ? "Anonymous" : `@${p.handle}`}</b>
                <span className="faint xs">{ago(p.created_at)}{KIND[p.kind] ? ` · ${KIND[p.kind]}` : ""} · {plural(p.likes, "like")} · {plural(p.replies, "reply", "replies")}</span>
              </span>
              <span className="fl-adm-body">{p.body}</span>
            </span>
            <span className="fl-adm-acts">
              {!p.anonymous && !p.hidden && (
                <button type="button" className="btn sm ghost" disabled={!!busy || (!p.pinned_at && pinned >= 3)} onClick={() => pin(p)}>
                  {busy === `pin:${p.id}` ? "Saving…" : p.pinned_at ? "Unpin" : "Pin"}
                </button>
              )}
              <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => hide(p)}>{busy === `hide:${p.id}` ? "Saving…" : p.hidden ? "Show" : "Hide"}</button>
            </span>
          </div>
        ))}</div>
      ) : <p className="muted adm-state">No posts in the last 30 days. Post your welcome on the Floor, then pin it here or from the post's ••• menu.</p>}
    </section>
  );
}

function Ideas({ rows, onChange }) {
  const [busy, act] = useAct();
  const set = (i, status) => act(`${i.id}:${status}`, () => rpc("admin_idea_status", { p_id: i.id, p_status: status }), `Marked ${status.toLowerCase()}`)
    .then((v) => v !== undefined && onChange());
  return (
    <section className="card flush">
      <div className="tool-row"><h3 className="tool-title">Ideas</h3><span className="faint xs">Most votes first. Traders see the status on the Ideas page.</span></div>
      {rows.length ? (
        <div className="adm-list">{rows.map((i) => (
          <div key={i.id} className="lrow fl-adm-row">
            <span className="lrow-main">
              <span className="fl-adm-head">
                <b>{i.title}</b>
                <span className="faint xs">@{i.handle} · {ago(i.created_at)} · {i.area} · {plural(i.votes, "vote")}</span>
              </span>
              {i.body && <span className="fl-adm-body">{i.body}</span>}
              <span className="segmented fl-adm-status" role="group" aria-label={`Status of ${i.title}`}>
                {IDEA_STATUSES.map((s) => (
                  <button key={s} type="button" className={i.status === s ? "on" : ""} aria-pressed={i.status === s} disabled={!!busy} onClick={() => i.status !== s && set(i, s)}>{s}</button>
                ))}
              </span>
            </span>
          </div>
        ))}</div>
      ) : <p className="muted adm-state">No ideas yet. Traders add them on the Ideas page on the Floor.</p>}
      {rows.length > 0 && <p className="faint xs td-key">{count(rows.length)} ideas in all.</p>}
    </section>
  );
}
