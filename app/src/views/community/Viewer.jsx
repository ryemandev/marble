import { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { LIVE } from "../../mode";
import { setState, toast, useStore } from "../../store";
import { clock, isExample, rowsOf } from "../study/model";
import { Video } from "../study/Video";
import "../study/study.css";
import { useCm, useLoad } from "./context";
import { errText, source } from "./source";
import { Note, useMedia } from "./parts";
import { Handle, Ico, Person, Star, Tri } from "./dmParts";
import { copyNotebookTitle } from "./dms";

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const longDay = (d) => (!d ? "" : /^\d{4}-/.test(d) ? new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : d);
const shortDay = (d) => (!d ? "" : /^\d{4}-/.test(d) ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : d);

// A shared page, on the same sheet it was written on: blank lines stay blank, and it's as long as it is
function ReadPage({ page, onSeek }) {
  if (!page) return <article className="st-read" />;
  const rows = rowsOf(page.lines);
  const timed = !!page.video && rows.some((l) => l.t != null);
  return (
    <article className={`st-read ${timed ? "timed" : ""}`}>
      <span className="st-read-date num">{shortDay(page.date)}</span>
      <h2 className="st-read-title">{page.title || "Untitled"}</h2>
      {page.video && <span className="st-read-lesson"><Tri size={9} /> {page.video.title || "YouTube lesson"}</span>}
      <div className="st-read-lines">
        {rows.map((l, i) => (!l.text.trim() ? <div key={i} className="st-read-gap" /> : (
          <div key={i} className={`st-read-line ${l.key ? "key" : ""}`}>
            {timed && (l.t != null
              ? <button type="button" className="st-read-time num" onClick={() => onSeek(l.t)} aria-label={`Play the lesson from ${clock(l.t)}`}>{clock(l.t)}</button>
              : <span />)}
            <p><span>{l.text}</span></p>
          </div>
        )))}
      </div>
    </article>
  );
}

function SavePop({ v, onDone, onClose }) {
  const notebooks = (useStore((s) => s.notebooks) || []).filter((x) => !isExample(x));
  const pages = useStore((s) => s.pages) || [];
  const [to, setTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await source.shareSave(v.share, v.i, to);
      if (LIVE) import("../study/sync").then((m) => m.studyReload()).catch(() => {});
      toast(`Saved to "${r.title || "your notebook"}"`);
      onDone(r);
    } catch (e) { toast(errText(e, "Couldn't save a copy just now. Try again."), { warn: true }); setBusy(false); }
  };
  return (
    <div className="sh-savepop" role="dialog" aria-label="Save a copy to">
      <span className="sh-label">Save a copy to</span>
      <button type="button" className={`sh-save-row ${to === null ? "on" : ""}`} onClick={() => setTo(null)}>
        <span className="sh-save-cover new"><Icon name="plus" size={14} /></span>
        <span><b>A new notebook</b><span>"{copyNotebookTitle(v.notebook.title, v.owner.handle)}"</span></span><i className="sh-radio" aria-hidden="true" />
      </button>
      <div className="sh-save-list">
        {notebooks.map((nb) => (
          <button type="button" key={nb.id} className={`sh-save-row ${to === nb.id ? "on" : ""}`} onClick={() => setTo(nb.id)}>
            <span className="sh-save-cover" style={nb.cover ? { backgroundImage: `url(${import.meta.env.BASE_URL}art/${nb.cover}-160.webp)` } : undefined} />
            <span><b>{nb.title}</b><span>Yours · {plural(pages.filter((p) => p.notebookId === nb.id).length, "page")}</span></span><i className="sh-radio" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="sh-fine">The copy is yours to change. It keeps the lines, times and key lessons. {v.owner.handle}'s photos and trades are never copied.</p>
      <div className="sh-savepop-foot"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : `Save page ${v.n}`}</button></div>
    </div>
  );
}

export default function Viewer({ share, start, onBack }) {
  const { openDm, appGo } = useCm();
  const phone = useMedia("(max-width: 760px)");
  const [n, setN] = useState(start || 1);
  const view = useLoad(() => source.shareView(share, n), [share, n]);
  const [saving, setSaving] = useState(false);
  const [seek, setSeek] = useState(null);
  const [stopping, setStopping] = useState(false);
  const v = view.data;
  useEffect(() => {
    document.documentElement.classList.toggle("st-reading", phone);
    return () => document.documentElement.classList.remove("st-reading");
  }, [phone]);
  useEffect(() => { window.scrollTo(0, 0); document.querySelector(".main-scroll")?.scrollTo({ top: 0 }); }, [share]);
  useEffect(() => { if (!stopping) return; const t = setTimeout(() => setStopping(false), 4000); return () => clearTimeout(t); }, [stopping]);

  const video = v?.page?.video ? { id: `share:${share}:${v.i}`, videoId: v.page.video.id, videoTitle: v.page.video.title, videoChannel: v.page.video.channel, videoLen: v.page.video.len, videoAt: null } : null;
  const onSeek = (t) => setSeek((s) => ({ t, n: (s?.n || 0) + 1, videoId: video?.videoId }));
  const message = () => openDm(`dm-new:${v.owner.handle}`);
  const openCopy = (nbId) => { setState({ studyOpen: nbId }); appGo?.("study"); };
  const stop = async () => {
    if (!stopping) { setStopping(true); return; }
    try { await source.shareStop(share); toast("Stopped sharing. It's closed everywhere."); view.reload(); } catch (e) { toast(errText(e), { warn: true }); }
  };
  const what = v ? `${v.whole ? "Shared notebook" : "Shared page"} · read-only` : "Shared page";
  const sharedLine = v && !v.gone ? `${v.whole ? "Shared the whole notebook" : "Shared this page"}${v.audience === "community" ? " with the community" : " with you"}${v.since ? ` · ${longDay(v.since)}` : ""}` : "";
  const keys = (v?.page?.lines || []).filter((l) => l.key);

  const who = v && (
    <div className={`sh-v-who ${phone ? "compact" : ""}`}>
      <Person who={v.owner} size={phone ? 32 : 40} />
      <span className="sh-v-who-text"><Handle who={v.owner} /><span>{v.gone ? `Stopped sharing this ${v.whole ? "notebook" : "page"}` : sharedLine}</span></span>
      {!phone && !v.mine && <button type="button" className="btn ghost sh-v-msg" onClick={message}><Icon name="mail" size={14} /> Message</button>}
    </div>
  );
  const nav = v && !v.gone && v.whole && v.of > 1 && (
    <div className="sh-v-nav">
      <button type="button" className="icon-btn" aria-label={`Page ${v.i - 1}`} disabled={v.i <= 1} onClick={() => setN(v.i - 1)}><Icon name="chevL" size={16} /></button>
      <span className="num">Page {v.i} of {v.of}</span>
      <button type="button" className="icon-btn" aria-label={`Page ${v.i + 1}`} disabled={v.i >= v.of} onClick={() => setN(v.i + 1)}><Icon name="chevR" size={16} /></button>
    </div>
  );
  const gone = v?.gone && (
    <div className="sh-gone-note">
      <Ico name="eyeOff" size={20} />
      <b>{v.owner.handle} stopped sharing this {v.whole ? "notebook" : "page"}</b>
      {v.saved?.length ? (
        <>
          <span>You saved a copy{v.saved.length > 1 ? ` of ${v.saved.length} pages` : ""}. It's in your notebook "{v.saved[0].notebook}".</span>
          {v.saved[0].notebook_id && <button type="button" className="btn ghost" onClick={() => openCopy(v.saved[0].notebook_id)}>Open my copy</button>}
        </>
      ) : <span>Nothing from it is shown any more. Copies people saved stay in their own notebooks.</span>}
    </div>
  );
  const book = (
    <div className="st sh-v-st">
      <ReadPage page={v && !v.gone ? v.page : null} onSeek={onSeek} />
      {gone}
    </div>
  );
  const owner = v?.mine && !v.gone && (
    <div className="sh-live">
      <span className="sh-live-ico"><Ico name={v.audience === "community" ? "globe" : "users"} size={18} /></span>
      <span className="sh-live-text"><b>{v.audience === "community" ? "Shared with the community" : "Shared with chosen members"}</b><span className="num">Since {longDay(v.since)} · {v.reads ?? 0} reads · {v.saves ?? 0} saved copies</span></span>
      <button type="button" className="btn ghost sh-stop" onClick={stop}><Ico name="undo" size={14} /> {stopping ? "Tap again to stop" : "Stop sharing"}</button>
    </div>
  );
  const save = v && !v.gone && !v.mine && v.copies && (
    v.saved ? <p className="sh-v-saved"><Icon name="check" size={14} /> You saved a copy of this page.</p>
      : <button type="button" className="btn silver" onClick={() => setSaving(true)}><Ico name="save" size={15} /> Save a copy to my notebooks</button>
  );
  const onSaved = () => { setSaving(false); view.set((x) => ({ ...x, saved: true })); };

  if (phone) {
    return (
      <div className="sh-viewer phone cm-view">
        <div className="sh-bar">
          <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="chevL" size={18} /></button>
          <span className="sh-bar-title"><b>{v?.notebook?.title || "Shared page"}</b><span className="num">{v && !v.gone ? `${v.owner.handle} · ${v.whole ? `page ${v.i} of ${v.of}` : `page ${v.n}`} · read-only` : "read-only"}</span></span>
        </div>
        {view.loading && !v && <Note>Opening the page…</Note>}
        {view.error && !v && <Note retry={view.reload}>{errText(view.error, "Couldn't open this page.")}</Note>}
        {video && <div className="sh-v-pad"><Video key={video.id} page={video} seek={seek} compact /></div>}
        {v && <div className="sh-v-pad">{who}</div>}
        {v && owner && <div className="sh-v-pad">{owner}</div>}
        {v && book}
        {nav}
        {video && <p className="sh-v-hint">Tap a time on the page to play the lesson from there.</p>}
        {v && !v.gone && !v.mine && (
          <div className="sh-savebar">
            {save || <span className="sh-savebar-note">Saving copies is off for this page.</span>}
            <button type="button" className="icon-btn" aria-label={`Message ${v.owner.handle}`} onClick={message}><Icon name="mail" size={18} /></button>
          </div>
        )}
        {saving && <div className="sh-savepop-sheet" onClick={(e) => { if (e.target === e.currentTarget) setSaving(false); }}><SavePop v={v} onDone={onSaved} onClose={() => setSaving(false)} /></div>}
      </div>
    );
  }

  return (
    <div className="view cm-view sh-viewer">
      <div className="sh-v-head">
        <button type="button" className="cm-back" onClick={onBack}><Icon name="chevL" size={14} /> Floor</button>
        <div className="sh-v-title">
          <span className="cm-kicker">{what}</span>
          <h1>{v?.notebook?.title || "Shared page"}</h1>
        </div>
      </div>
      {view.loading && !v && <Note>Opening the page…</Note>}
      {view.error && !v && <Note retry={view.reload}>{errText(view.error, "Couldn't open this page.")}</Note>}
      {v && (
        <div className="sh-v-grid">
          <div className="sh-v-main">{book}{nav}</div>
          <aside className="sh-v-side">
            {who}
            {owner}
            {!v.gone && (
              <>
                {video && <Video key={video.id} page={video} seek={seek} />}
                {video && <p className="sh-v-hint">Tap a time on the page to play the lesson from there.</p>}
                {save && <div className="sh-v-save">{save}{saving && <SavePop v={v} onDone={onSaved} onClose={() => setSaving(false)} />}</div>}
                {keys.length > 0 && (
                  <div className="sh-v-keys">
                    <span className="sh-label">Key lessons on this page · {keys.length}</span>
                    {keys.map((k, i) => (
                      <button type="button" key={i} className="sh-v-key" disabled={k.t == null || !video} onClick={() => k.t != null && onSeek(k.t)}>
                        <span className="num">{k.t != null ? clock(k.t) : `p.${v.whole ? v.i : v.n}`}</span><span><Star size={10} /> {k.text}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="sh-v-foot">Read-only. {v.copies ? "A saved copy keeps the lines, times and key lessons, never photos or trades." : "Saving copies is off for this page."}</p>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
