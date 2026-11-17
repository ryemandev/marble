import { useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { toast } from "../../store";
import { errText, source } from "../community/source";
import { useLoad } from "../community/context";
import { Handle, Ico, Leaf, Person, Sheet } from "../community/dmParts";
import { MAX_MEMBERS, conversationsOf, leafLines, shareLines } from "../community/dms";

const OPTIONS = [
  ["me", "lock", "Only me", "Private. Every session starts here."],
  ["community", "globe", "The community", "A post in the feed with this as a card. Anyone signed in to Marble can read it."],
  ["members", "users", "Chosen members", "It arrives in their messages as a card. Only they can open it."],
];
const day = (d) => (!d ? "" : /^\d{4}-/.test(d) ? new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : d);

function People({ picked, setPicked }) {
  const inbox = useLoad(() => source.dmInbox(), []);
  const [h, setH] = useState("");
  const talk = conversationsOf(inbox.data?.threads || []).map((t) => t.with).filter((w) => !w.staff).slice(0, 8);
  const add = (x) => {
    const v = String(x || "").trim().replace(/^@/, "");
    if (!v || picked.includes(v)) return;
    if (picked.length >= MAX_MEMBERS) { toast("Up to 20 people at a time.", { warn: true }); return; }
    setPicked([...picked, v]);
  };
  const toggle = (x) => (picked.includes(x) ? setPicked(picked.filter((y) => y !== x)) : add(x));
  const known = new Set(talk.map((w) => w.handle));
  const fresh = picked.filter((x) => !known.has(x));
  return (
    <div className="sh-people">
      <div className="sh-picker">
        {picked.map((x) => <span key={x} className="sh-chip"><Person who={talk.find((w) => w.handle === x) || { handle: x }} size={20} /><span>{x}</span><button type="button" aria-label={`Remove ${x}`} onClick={() => toggle(x)}><Icon name="close" size={11} /></button></span>)}
        <input value={h} onChange={(e) => setH(e.target.value)} placeholder="Add someone by handle" aria-label="Add someone by handle" autoCapitalize="none" spellCheck={false} maxLength={40}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(h); setH(""); } }}
          onBlur={() => { if (h.trim()) { add(h); setH(""); } }} />
      </div>
      {talk.length > 0 && (
        <div className="sh-group">
          <span className="sh-group-label">People you message</span>
          {talk.map((w) => (
            <label key={w.handle} className={`sh-person ${picked.includes(w.handle) ? "on" : ""}`}>
              <input type="checkbox" checked={picked.includes(w.handle)} onChange={() => toggle(w.handle)} />
              <Person who={w} size={28} />
              <span className="sh-person-text"><Handle who={w} /></span>
              <i className="sh-tick" aria-hidden="true">{picked.includes(w.handle) && <Icon name="check" size={12} />}</i>
            </label>
          ))}
        </div>
      )}
      {fresh.length > 0 && <p className="sh-person-note">If you haven't talked to {fresh.join(", ")} yet, it goes as a message request, and the page opens once they accept.</p>}
    </div>
  );
}

function What({ whole, count }) {
  return (
    <ul className="sh-what">
      <li><Icon name="check" size={13} /><span>{whole ? `All ${count} session${count === 1 ? "" : "s"} it has now: the words and times` : "The session's words and times"}</span></li>
      <li><Icon name="check" size={13} /><span>The video it's under</span></li>
      <li className="no"><Icon name="close" size={13} /><span>Never your photos, your trades or P&amp;L, or any other session{whole ? ", including sessions you write later" : ""}</span></li>
    </ul>
  );
}

export function ShareSheet({ nb, page, written, onClose, onChanged }) {
  const list = useLoad(() => source.shareList(nb.id), [nb.id]);
  const [scope, setScope] = useState(page ? "page" : "notebook");
  const [to, setTo] = useState("me");
  const [caption, setCaption] = useState("");
  const [copies, setCopies] = useState(true);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const live = (list.data || []).find((s) => (scope === "page" ? s.page === page?.id : !s.page));
  const n = page ? written.findIndex((p) => p.id === page.id) + 1 : 1;
  const preview = useMemo(() => {
    const p = scope === "page" ? page : written[0];
    if (!p) return null;
    const lines = shareLines(p.lines);
    return { owner: "you", notebook: nb.title, whole: scope === "notebook", n: scope === "page" ? n : 1, of: written.length, title: p.title, lesson: p.videoTitle,
      lines: leafLines(p.lines), count: lines.length, keys: lines.filter((l) => l.key).length };
  }, [scope, page, written, nb.title, n]);
  const title = scope === "notebook" ? `${nb.title} · the whole notebook` : `${page?.title || "Untitled"} · ${nb.title}, session ${n}`;

  const share = async (aud = to) => {
    setBusy(true);
    try {
      const r = await source.sharePage({ notebookId: nb.id, pageId: scope === "page" ? page.id : null, audience: aud, members: aud === "members" ? picked : [], caption: caption.trim() || null, copies });
      const skipped = r?.skipped || [];
      toast(aud === "community" ? "Posted to the feed. Stop sharing any time." : skipped.length
        ? `Sent to ${r.sent.join(", ")}. Not sent to ${skipped.map((s) => s.handle).join(", ")}: ${skipped[0].why}`
        : `Sent to ${r.sent.length === 1 ? r.sent[0] : `${r.sent.length} people`}.`, skipped.length ? { warn: true, ms: 9000 } : undefined);
      onChanged?.();
      onClose();
    } catch (e) { toast(errText(e, "Couldn't share that just now. Try again."), { warn: true }); setBusy(false); }
  };
  const stop = async () => {
    if (!stopping) { setStopping(true); setTimeout(() => setStopping(false), 4000); return; }
    setBusy(true);
    try { await source.shareStop(live.share); toast("Stopped sharing. It's closed everywhere."); onChanged?.(); await list.reload(); setTo("me"); }
    catch (e) { toast(errText(e), { warn: true }); }
    setBusy(false);
    setStopping(false);
  };
  const cta = to === "community" ? "Post to the feed" : !picked.length ? "Choose who to send it to" : picked.length === 1 ? `Send to ${picked[0]}` : `Send to ${picked.length} people`;
  const ready = to === "community" || (to === "members" && picked.length > 0);
  return (
    <Sheet title={live ? "Sharing" : "Share"} sub={title} className="sh-sheet" onClose={onClose}
      foot={live ? (
        <><span className="sh-foot-note">Stopping closes it everywhere at once.</span><button type="button" className="btn" onClick={onClose}>Done</button></>
      ) : to === "me" ? <button type="button" className="btn" onClick={onClose}>Done</button> : (
        <>
          <span className="sh-foot-note">You can stop sharing at any time.</span>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn silver" disabled={!ready || busy} onClick={() => share()}>{busy ? "Sharing…" : cta}</button>
        </>
      )}>
      <div className="sh-scope" role="group" aria-label="What to share">
        <button type="button" aria-pressed={scope === "page"} disabled={!page} title={page ? undefined : "Write in this session first"} onClick={() => setScope("page")}>This session</button>
        <button type="button" aria-pressed={scope === "notebook"} onClick={() => setScope("notebook")}>The whole notebook · {written.length} session{written.length === 1 ? "" : "s"}</button>
      </div>
      {list.loading && !list.data && <p className="sh-fine">Checking what's shared…</p>}
      {live ? (
        <>
          <div className="sh-live">
            <span className="sh-live-ico"><Ico name={live.audience === "community" ? "globe" : "users"} size={18} /></span>
            <span className="sh-live-text">
              <b>{live.audience === "community" ? "Shared with the community" : `Shared with ${live.members?.length ? live.members.join(", ") : "chosen members"}`}</b>
              <span className="num">Since {day(live.since)} · {live.reads} read{live.reads === 1 ? "" : "s"} · {live.saves} saved cop{live.saves === 1 ? "y" : "ies"}</span>
            </span>
            <button type="button" className="btn ghost sh-stop" disabled={busy} onClick={stop}><Ico name="undo" size={14} /> {stopping ? "Tap again to stop" : "Stop sharing"}</button>
          </div>
          <p className="sh-fine">{scope === "notebook" ? "Only the sessions it had when you shared it are shared." : "Edits to the session show straight away."} Copies people saved stay theirs.</p>
          {live.audience === "members" && (
            <>
              <div className="sh-label">Send it to more people</div>
              <People picked={picked} setPicked={setPicked} />
              {picked.length > 0 && <button type="button" className="btn silver" disabled={busy} onClick={() => share("members")}>{busy ? "Sending…" : picked.length === 1 ? `Send to ${picked[0]}` : `Send to ${picked.length} people`}</button>}
            </>
          )}
        </>
      ) : (
        <>
          <div className="sh-label">Who can read it</div>
          <div className="sh-opts" role="radiogroup" aria-label="Who can read it">
            {OPTIONS.map(([k, ico, t, d]) => (
              <label key={k} className={`sh-opt ${to === k ? "on" : ""}`}>
                <input type="radio" name="sh-to" checked={to === k} onChange={() => setTo(k)} />
                <span className="sh-opt-ico"><Ico name={ico} size={18} /></span>
                <span className="sh-opt-text"><b>{t}</b><span>{d}</span></span>
                <i className="sh-radio" aria-hidden="true" />
              </label>
            ))}
          </div>
          {to === "members" && <People picked={picked} setPicked={setPicked} />}
          {to !== "me" && (
            <div className="sh-post">
              <textarea className="input" rows={2} maxLength={1000} value={caption} onChange={(e) => setCaption(e.target.value)}
                placeholder={to === "community" ? "Say what it's about (it's the post's words)" : "Add a note (optional)"} aria-label="Say what it's about" />
              {preview && <div className="sh-preview"><span className="sh-label">{to === "community" ? "How it shows in the feed" : "How it shows in their messages"}</span><Leaf c={preview} size="sm" /></div>}
            </div>
          )}
          {to !== "me" && (
            <>
              <div className="sh-label">What they see</div>
              <What whole={scope === "notebook"} count={written.length} />
              <label className="sh-switchrow">
                <span><b>Let people save a copy</b><span>A copy keeps the lines, times and key lessons. Never your photos.</span></span>
                <input type="checkbox" className="sr-only" checked={copies} onChange={(e) => setCopies(e.target.checked)} />
                <span className={`sh-switch ${copies ? "on" : ""}`} aria-hidden="true"><i /></span>
              </label>
            </>
          )}
          {to === "me" && <p className="sh-private-note"><Icon name="lock" size={13} /> {scope === "notebook" ? "This notebook is private: only you can see it." : "This session is private: only you can see it."}</p>}
        </>
      )}
    </Sheet>
  );
}
