import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mergeLines } from "./rows";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui";
import { Modal } from "../../components/overlay";
import { art, plural } from "../../data";
import { LIVE } from "../../mode";
import { exampleBlocked, setState, showMonth, toast, useAllTrades, useStore } from "../../store";
import { nyOf } from "../../live/time";
import { money } from "../../drip/week";
import { COVERS, MAX_TITLE, coverPos, coverTone, fitsNote, flatPages, freshPage, homeOf, isExample, linesOf, linkStart, nextCover, notebookSummary, pageDate, pagesOf, search, snippet, textOf, videoId as parseVideoId } from "./model";
import { addPhotos, changePage, createNotebook, deletePage, learnMeta, linkTrade, newId, rememberTime, setLesson, setPhotoCaption, setRibbon, studyNow, takeOutPhoto, updateNotebook } from "./actions";
import { MAX_PHOTOS } from "./attachments";
import { PhotoViewer, useDropPhotos } from "./Photos";
import { uploading, usePhotoUrl } from "./media";
import { StudyCtx, useStudy } from "./ctx";
import { Video } from "./Video";
import { lessonClock } from "./youtube";
import { ShareSheet } from "./Share";
import { source } from "../community/source";
import { useLoad } from "../community/context";
import { SetupPage, SetupsPage, useChapters } from "../../drip/study/Setups";

const EMPTY = [];
let leftAt = null; // the session left open, for coming back to Study
let leftTab = "pad";
const newestOf = (flat) => (flat.length ? flat.reduce((a, b) => (String(b.updatedAt || "") >= String(a.updatedAt || "") ? b : a)) : null);

// Study is a giant notepad: a video at the top, your chart images, and a page to write on. Everything you've
// worked on is one tab away, under All notebooks.
export function StudyPad({ phone, go }) {
  const notebooks = useStore((s) => s.notebooks) || EMPTY;
  const pages = useStore((s) => s.pages) || EMPTY;
  const error = useStore((s) => s.studyError);
  const sync = useStore((s) => s.studySync);
  const wanted = useStore((s) => s.studyOpen);
  const wantTab = useStore((s) => s.studyTab);
  const allTrades = useAllTrades();
  const trades = useMemo(() => new Map(allTrades.map((t) => [t.id, t])), [allTrades]);
  const flat = useMemo(() => flatPages(notebooks, pages), [notebooks, pages]);

  const [tab, setTabState] = useState(() => (wantTab === "setups" ? "all" : leftTab));
  const [curId, setCurId] = useState(() => (leftAt && flat.some((p) => p.id === leftAt) ? leftAt : newestOf(flat)?.id || null));
  const [padKey, setPadKey] = useState(0);
  const [filed, setFiled] = useState(null); // the notebook picked on the shelf
  const [into, setInto] = useState(null); // the notebook the next new session goes in
  const [viewing, setViewing] = useState(null); // { id: the page's id, at: which photo }
  const [picking, setPicking] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [seek, setSeek] = useState(null);
  const seenSeek = useRef(0);
  const moved = useRef(!!leftAt);
  const pending = useRef(null); // the id a session will have the moment its first word is saved
  const flush = useRef(null); // saves what's on the page right now
  const write = useRef(false); // the next page opens with the cursor in it
  const root = useRef(null);

  // Your first session keeps its picture while you're on it, so the first save doesn't move the page under your hands
  const opening = useRef(false);
  if (!flat.length && !error) opening.current = true;
  const stored = curId ? flat.find((p) => p.id === curId) || null : null;
  const home = stored?.notebookId || (into && notebooks.some((n) => n.id === into) ? into : homeOf(notebooks, flat));
  const blank = useMemo(() => ({ ...freshPage(home, home ? pagesOf(pages, home) : []), videoId: null, videoTitle: null, videoChannel: null, videoLen: null, videoAt: null }), [home, pages]);
  const page = stored || blank;
  const nb = useMemo(() => notebooks.find((x) => x.id === (page.notebookId || home)) || null, [notebooks, page.notebookId, home]);
  const example = isExample(nb) || isExample(page);
  const now = studyNow();

  const setTab = (t) => { flush.current?.(); leftTab = t; setTabState(t); };

  useEffect(() => { if (stored) { pending.current = null; leftAt = stored.id; } }, [stored?.id]);
  // Pages can arrive after the screen does. Until you've touched anything, it opens on your latest session.
  useEffect(() => {
    if (moved.current) return;
    const last = newestOf(flat);
    if (last && last.id !== curId) { setCurId(last.id); setPadKey((k) => k + 1); }
  }, [flat.length]);

  // Words still on the page go to their own session before the pad moves on
  const open = (id) => {
    flush.current?.();
    moved.current = true;
    pending.current = null;
    leftAt = id;
    setCurId(id);
    setPadKey((k) => k + 1);
    setTab("pad");
  };
  const newSession = (notebookId) => {
    if (example) return exampleBlocked();
    flush.current?.();
    moved.current = true;
    pending.current = null;
    leftAt = null;
    write.current = true;
    setInto(typeof notebookId === "string" ? notebookId : filed || home);
    setCurId(null);
    setPadKey((k) => k + 1);
    setTab("pad");
  };

  // The way in from elsewhere: a search result, the Floor, a note on a setup, an old address
  useEffect(() => {
    const want = typeof wanted === "string" ? { id: wanted } : wanted;
    if (!want?.id || !notebooks.some((x) => x.id === want.id)) return;
    const list = pagesOf(pages, want.id);
    const p = list[(want.page || list.length) - 1];
    if (p) open(p.id); else newSession(want.id);
    setState({ studyOpen: null });
  }, [wanted, notebooks]);
  useEffect(() => {
    if (wantTab !== "setups") return;
    setTab("all");
    requestAnimationFrame(() => root.current?.querySelector(".sp-setups")?.scrollIntoView({ block: "start" }));
    setState({ studyTab: null });
  }, [wantTab]);

  // Which session you were on is still kept on its notebook, for the search box's "carry on"
  useEffect(() => {
    if (!stored || !nb || isExample(nb)) return undefined;
    const t = setTimeout(() => setRibbon(nb, pagesOf(pages, nb.id).findIndex((x) => x.id === stored.id) + 1), 1200);
    return () => clearTimeout(t);
  }, [stored?.id]);

  // The tab bar leaves the screen while there's writing going on
  useEffect(() => {
    if (!phone) return undefined;
    const el = root.current, html = document.documentElement;
    const isField = (x) => !!x?.matches?.(".sp-field");
    // Only the bar moves. The page's top stays where it is, so the line that was tapped doesn't jump from under the finger.
    const on = (e) => { if (isField(e.target)) html.classList.add("st-writing"); };
    const off = (e) => { if (!isField(e.relatedTarget)) html.classList.remove("st-writing"); };
    el.addEventListener("focusin", on);
    el.addEventListener("focusout", off);
    return () => { el.removeEventListener("focusin", on); el.removeEventListener("focusout", off); html.classList.remove("st-writing"); };
  }, [phone]);

  const shares = useLoad(() => (!nb || example ? Promise.resolve([]) : source.shareList(nb.id)), [nb?.id]);
  const sharedIds = useMemo(() => new Set((shares.data || []).flatMap((s) => (s.page ? [s.page] : s.pages || []))), [shares.data]);

  const stampNow = (p) => { const c = lessonClock.get(); return c.videoId && c.videoId === p.videoId ? c.t : p.videoAt ?? null; };
  const ctx = {
    nb, trades, now, example, phone,
    kept: !!sync?.waiting,
    touch() { moved.current = true; },
    // A new session has no row until there's something in it. This gives it its id and a notebook to live in.
    ensure(p) {
      if (!p.fresh) return p;
      moved.current = true;
      pending.current ||= newId();
      setCurId(pending.current);
      leftAt = pending.current;
      return { ...p, id: pending.current, notebookId: p.notebookId || createNotebook({ title: "Notebook", cover: nextCover(notebooks) }) };
    },
    canWrite: (p) => (example || isExample(p) ? (exampleBlocked(), false) : true),
    addPhotos: (p, files) => addPhotos(ctx.ensure(p), files, stampNow(p)),
    openPhotos: (p, photo) => p.id && setViewing({ id: p.id, at: photo }),
    photoCaption: (p, path, caption) => setPhotoCaption(p, path, caption),
    takeOutPhoto: (p, path) => takeOutPhoto(p, path),
    seek(p, t) { setTab("pad"); setSeek((s) => ({ t, n: (s?.n || 0) + 1, videoId: p.videoId })); },
    share: (p) => (example ? exampleBlocked() : setSharing(p)),
    isShared: (id) => !!id && sharedIds.has(id),
    pickTrade: (p) => (example ? exampleBlocked() : setPicking(p)),
    unlinkTrade: (p) => linkTrade(p, null),
    openTrade(t) {
      if (LIVE && t.traded_at) { const d = nyOf(t.traded_at); showMonth(d.year, d.month); }
      setState({ journalSel: t.id });
      go?.("journal");
    },
    lesson(p, id, start) { if (ctx.canWrite(p)) setLesson(ctx.ensure(p), id, start); },
    leave: (p, t) => rememberTime(p, t),
    meta: (id, m) => learnMeta(pages, id, m),
  };

  const onPaste = (e) => {
    if (tab !== "pad") return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type) || /\.hei[cf]$/i.test(f.name || ""));
    // Words with a picture behind them, out of a spreadsheet say, paste as words
    if (!files.length || e.clipboardData.getData("text/plain")) return;
    e.preventDefault();
    if (ctx.canWrite(page)) ctx.addPhotos(page, files);
  };
  const viewed = viewing ? flat.find((p) => p.id === viewing.id) : null;
  useEffect(() => { if (viewing && !viewed) setViewing(null); }, [viewing, viewed]);
  const shareNb = sharing ? notebooks.find((x) => x.id === sharing.notebookId) : null;
  const retry = () => import("./sync").then((m) => m.studyReload());

  return (
    <StudyCtx.Provider value={ctx}>
      <div className="sp" ref={root} onPaste={onPaste}>
        <div className="sp-bar">
          <div className="sp-tabs" role="group" aria-label="Study">
            <button type="button" aria-pressed={tab === "pad"} onClick={() => setTab("pad")}>Notepad</button>
            <button type="button" aria-pressed={tab === "all"} onClick={() => setTab("all")}>All notebooks</button>
          </div>
          <button type="button" className="sp-new" aria-label="New session" onClick={() => newSession()}><Icon name="plus" size={15} /> <span>New session</span></button>
        </div>
        {error && <div className="sp-notice"><span>Your notes didn't load.</span><button type="button" onClick={retry}>Try again</button></div>}
        {tab === "pad"
          ? <Pad key={padKey} page={page} seek={seek} seenRef={seenSeek} flushRef={flush} write={write} first={opening.current && flat.length <= 1} />
          : <Library notebooks={notebooks} pages={pages} flat={flat} now={now} filed={filed} setFiled={setFiled} onOpen={open} onNew={newSession} go={go} example={example} />}
      </div>
      {/* Anything that has to cover the whole screen goes out to the top */}
      {createPortal(
        <>
          {viewed && <PhotoViewer key={viewed.id} page={viewed} start={viewing.at} onClose={() => setViewing(null)} />}
          {sharing && shareNb && <ShareSheet nb={shareNb} page={sharing.id ? sharing : null} written={pagesOf(pages, shareNb.id)} onClose={() => setSharing(null)} onChanged={shares.reload} />}
          {picking && <TradePicker trades={allTrades} onClose={() => setPicking(null)} onPick={(t) => { linkTrade(ctx.ensure(picking), t.id); setPicking(null); }} />}
        </>,
        document.body,
      )}
    </StudyCtx.Provider>
  );
}

/* ---------- The notepad ---------- */

// A box that grows with what's typed, for browsers that can't size one from its words
const sizesItself = () => typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
function useGrow(value) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sizesItself()) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

// The caret stays beside the same words when lines arrive from elsewhere
function caretAfter(was, now, at) {
  if (now.slice(0, at) === was.slice(0, at)) return at;
  const tail = was.length - at;
  return now.slice(now.length - tail) === was.slice(at) ? now.length - tail : Math.min(at, now.length);
}

const SAVE_AFTER = 700; // a pause this long saves
const SAVE_BY = 3000; // and typing that never pauses still saves this often

function Pad({ page, seek, seenRef, flushRef, write, first }) {
  const ctx = useStudy();
  const [text, setText] = useState(() => textOf(page.lines));
  const [title, setTitle] = useState(page.title || "");
  const [state, setSaved] = useState("saved");
  const [changing, setChanging] = useState(false);
  const fields = useRef(null);
  const timer = useRef(0);
  const dirty = useRef(false);
  const since = useRef(0);
  const base = useRef(page.lines); // the lines these words were last level with
  const latest = useRef(null); latest.current = { page, text, title, ctx };
  const titleRef = useGrow(title);
  const textRef = useGrow(text);
  const [drop, veil] = useDropPhotos(page);

  const commit = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    since.current = 0;
    const { page: p, text: tx, title: ti, ctx: c } = latest.current;
    const clockNow = lessonClock.get();
    const at = clockNow.videoId && clockNow.videoId === p.videoId ? clockNow.t : null;
    changePage(c.ensure(p), (x) => {
      // Only what was changed here goes in: a line another device added since then isn't a line deleted
      const was = base.current, mine = linesOf(tx, was, at);
      const lines = x.lines === was ? mine : mergeLines(x.lines, mine, was);
      base.current = lines;
      return { title: String(ti).replace(/\s+/g, " ").trim().slice(0, MAX_TITLE), lines };
    }, { alone: true });
    setSaved("saved");
  };
  const changed = () => {
    ctx.touch();
    dirty.current = true;
    setSaved("saving");
    since.current ||= Date.now();
    clearTimeout(timer.current);
    timer.current = setTimeout(commit, Math.min(SAVE_AFTER, Math.max(0, since.current + SAVE_BY - Date.now())));
  };
  useEffect(() => {
    flushRef.current = commit;
    const away = () => { if (document.hidden) commit(); };
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", commit);
    return () => { document.removeEventListener("visibilitychange", away); window.removeEventListener("pagehide", commit); commit(); flushRef.current = null; };
  }, []);
  useEffect(() => { if (write.current) { write.current = false; textRef.current?.focus({ preventScroll: true }); } }, []);

  // Another device changed this session. Mid-sentence, the next save brings its lines in instead
  useEffect(() => {
    if (dirty.current) return;
    base.current = page.lines;
    const el = textRef.current, typing = !!el && document.activeElement === el, now = textOf(page.lines);
    if (document.activeElement !== titleRef.current) setTitle(page.title || "");
    if (now === latest.current.text || (!now && !latest.current.text.trim())) return;
    const was = latest.current.text, start = typing ? caretAfter(was, now, el.selectionStart) : 0, end = typing ? caretAfter(was, now, el.selectionEnd) : 0;
    setText(now);
    if (typing) requestAnimationFrame(() => el.setSelectionRange(start, end));
  }, [page.lines, page.title]);

  const words = (e) => {
    if (!ctx.canWrite(page)) return;
    if (!fitsNote(e.target.value)) { toast("This session is full. Start a new one for the rest.", { warn: true, ms: 6000 }); return; }
    setText(e.target.value);
    changed();
  };
  const name = (e) => { if (ctx.canWrite(page)) { setTitle(e.target.value.replace(/\n/g, " ")); changed(); } };
  const trade = page.tradeId ? ctx.trades.get(page.tradeId) : null;
  const list = page.attachments || [];
  const when = page.fresh ? "Today" : pageDate(page.createdAt, ctx.now);
  const status = ctx.kept ? "Kept on this device" : state === "saving" ? "Saving" : page.fresh && !text ? "" : "Saved";
  return (
    <article className="sp-pad" {...drop}>
      <div className="sp-video">
        {page.videoId && !changing
          ? <Video key={page.videoId} page={page} seek={seek} seenRef={seenRef} compact={ctx.phone} onLeave={(p, t) => ctx.leave(p, t)} onMeta={(id, m) => ctx.meta(id, m)} />
          : <VideoSlot page={page} first={first && !changing} onDone={() => setChanging(false)} />}
      </div>

      <div className="sp-sheet" ref={fields}>
        <div className="sp-meta">
          <p className="sp-where">
            {when && <span>{when}</span>}
            {ctx.nb?.title && <span className="sp-on">{ctx.nb.title}</span>}
            <span className="sp-status" role="status">{status}</span>
          </p>
          <div className="sp-tools">
            <AddChart page={page} />
            <More page={page} trade={trade} changing={changing} onChange={() => setChanging(true)} />
          </div>
        </div>
        <textarea ref={titleRef} rows={1} className="sp-title sp-field" value={title} maxLength={MAX_TITLE} spellCheck={false} placeholder="Title" aria-label="Title"
          readOnly={ctx.example} enterKeyHint="next" onChange={name} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.closest(".sp-sheet")?.querySelector(".sp-text")?.focus(); } }} />
        {list.length > 0 && <div className="sp-charts">{list.map((a, i) => <Chart key={a.path} a={a} i={i} count={list.length} onOpen={() => ctx.openPhotos(page, i)} />)}</div>}
        {trade && <LinkedTrade trade={trade} page={page} />}
        <textarea ref={textRef} className="sp-text sp-field" value={text} placeholder="Start writing. It saves as you go." aria-label="Your notes"
          readOnly={ctx.example} onChange={words} onBlur={commit} />
      </div>
      {veil}
    </article>
  );
}

// Paste a link and it's on the page. Nothing else to press.
function VideoSlot({ page, first, onDone }) {
  const ctx = useStudy();
  const [link, setLink] = useState("");
  const parse = (v) => (/youtu/i.test(v) ? parseVideoId(v) : null);
  const use = (v, id) => { ctx.lesson(page, id, linkStart(v)); setLink(""); onDone(); };
  const take = (v) => { setLink(v); const id = parse(v); if (id) use(v, id); };
  const wrong = link.trim() && !parse(link);
  const cover = "masters/jerome-writing-caravaggio";
  return (
    <form className={`sp-slot ${first ? "first" : ""}`} onSubmit={(e) => { e.preventDefault(); const id = parse(link); if (id) use(link, id); }}>
      {first && <img src={art(cover, 960)} alt="" style={{ objectPosition: coverPos(cover) }} decoding="async" draggable="false" />}
      {first && <h2>Start with a video, or just write.</h2>}
      <div className="sp-slot-field">
        <i aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg></i>
        <input className="sp-field" value={link} onChange={(e) => take(e.target.value)} inputMode="url" enterKeyHint="go" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Paste a YouTube link" aria-label="YouTube link" readOnly={ctx.example} />
        {wrong && <span role="status">Not a YouTube link</span>}
        {page.videoId && <button type="button" onClick={() => { ctx.lesson(page, null); onDone(); }}>No video</button>}
        {page.videoId && <button type="button" onClick={onDone}>Keep this one</button>}
      </div>
    </form>
  );
}

function AddChart({ page }) {
  const ctx = useStudy();
  const input = useRef(null);
  if ((page.attachments || []).length >= MAX_PHOTOS) return null;
  return (
    <>
      <button type="button" className="sp-add" onClick={() => ctx.canWrite(page) && input.current?.click()}><Icon name="image" size={15} /> Add a chart image</button>
      <input ref={input} className="sp-file" type="file" accept="image/*" multiple tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ""; ctx.addPhotos(page, files); }} />
    </>
  );
}

// Everything that isn't writing stays out of the way until it's wanted
function More({ page, trade, changing, onChange }) {
  const ctx = useStudy();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const shared = ctx.isShared(page.id);
  const items = [
    !trade && ["link", "Link a trade", () => ctx.pickTrade(page)],
    page.videoId && !changing && ["play", "Change video", onChange],
    page.id && !page.fresh && ["share", shared ? "Shared" : "Share", () => ctx.share(page)],
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="sp-more" ref={box}>
      <button type="button" aria-label="More" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>
      </button>
      {open && (
        <div className="sp-menu">
          {items.map(([icon, label, run]) => <button type="button" key={label} onClick={() => { setOpen(false); run(); }}><Icon name={icon} size={15} /> {label}</button>)}
        </div>
      )}
    </div>
  );
}

// A saved chart, whole. Tap for the full screen.
function Chart({ a, i, count, onOpen }) {
  const { url } = usePhotoUrl(a.path, true);
  return (
    <button type="button" className="sp-chart" style={{ aspectRatio: `${a.w || 16} / ${a.h || 10}` }} onClick={onOpen} aria-label={`Chart ${i + 1} of ${count}${a.caption ? `: ${a.caption}` : ""}`}>
      {url && <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />}
      {uploading(a.path) && <i title="Uploads when you're back online"><Icon name="upload" size={11} /></i>}
    </button>
  );
}

function LinkedTrade({ trade, page }) {
  const ctx = useStudy();
  return (
    <div className="sp-trade">
      <button type="button" onClick={() => ctx.openTrade(trade)} aria-label={`Open the ${trade.symbol} ${trade.side} trade on ${trade.date} in the journal`}>
        <span><b>{trade.symbol} {trade.side}</b><small>{trade.date} · {trade.time}</small></span>
        <b className="num">{money(+trade.pnl || 0, { sign: true })}</b>
      </button>
      <button type="button" className="sp-trade-x" onClick={() => ctx.unlinkTrade(page)} aria-label="Unlink this trade"><Icon name="close" size={13} /></button>
    </div>
  );
}

/* ---------- All notebooks ---------- */

const coverFor = (nb, i) => nb.cover || COVERS[i % COVERS.length][0];

function Library({ notebooks, pages, flat, now, filed, setFiled, onOpen, onNew, go, example }) {
  const [q, setQ] = useState("");
  const [setup, setSetup] = useState(null);
  const chapters = useChapters();
  const found = useMemo(() => search(notebooks, pages, q, 20), [notebooks, pages, q]);
  const asked = q.trim().length >= 2;
  const names = useMemo(() => new Map(notebooks.map((nb) => [nb.id, nb.title])), [notebooks]);
  const chosen = filed && notebooks.find((x) => x.id === filed);
  const sessions = useMemo(() => [...flat].filter((p) => !chosen || p.notebookId === chosen.id).reverse(), [flat, chosen]);
  const addNotebook = () => {
    if (example) return exampleBlocked();
    setFiled(createNotebook({ title: "New notebook", cover: nextCover(notebooks) }));
  };
  if (setup) {
    const c = chapters.find((x) => x.key === setup);
    if (c) return <section className="sp-lib"><SetupPage c={c} go={go} onIndex={() => setSetup(null)} /></section>;
  }
  return (
    <section className="sp-lib">
      <label className="sp-search">
        <Icon name="search" size={16} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your notes" aria-label="Search your notes" />
      </label>
      {asked ? (
        <div className="sp-rows">
          {found.map((r, i) => (
            <button type="button" key={`${r.pageId}-${i}`} className="sp-find" onClick={() => onOpen(r.pageId)}>
              <b>{r.text}</b><small>{r.nb.title}</small>
            </button>
          ))}
          {!found.length && <p className="sp-none">Nothing matches “{q.trim()}”.</p>}
        </div>
      ) : (
        <>
          <div className="sp-shelf" role="group" aria-label="Your notebooks">
            {notebooks.map((nb, i) => {
              const s = notebookSummary(nb, pages), cover = coverFor(nb, i);
              return (
                <button type="button" key={nb.id} className="sp-book" aria-pressed={chosen?.id === nb.id} onClick={() => setFiled(chosen?.id === nb.id ? null : nb.id)}>
                  <img src={art(cover, 480)} alt="" style={{ objectPosition: coverPos(cover), "--tone": coverTone(cover) }} loading="lazy" decoding="async" draggable="false" />
                  <span><b>{nb.title}</b><small>{plural(s.pages, "session")}</small></span>
                </button>
              );
            })}
            <button type="button" className="sp-book add" onClick={addNotebook}><Icon name="plus" size={20} /><span><b>New notebook</b></span></button>
          </div>

          <div className="sp-head">
            {chosen ? <NotebookName key={chosen.id} nb={chosen} /> : <h2>Study sessions</h2>}
            {chosen && <button type="button" className="sp-new" onClick={() => onNew(chosen.id)}><Icon name="plus" size={15} /> <span>New session here</span></button>}
          </div>
          <div className="sp-rows">
            {sessions.map((p) => <Session key={p.id} page={p} name={chosen ? null : names.get(p.notebookId)} now={now} onOpen={() => onOpen(p.id)} />)}
            {!sessions.length && (chosen
              ? <p className="sp-none">Nothing in this notebook yet.</p>
              : <button type="button" className="sp-start" onClick={() => onNew()}><span><b>Write your first session</b><small>Everything you write lands here.</small></span><Icon name="chevR" size={16} /></button>)}
          </div>

          <div className="sp-setups"><SetupsPage chapters={chapters} onOpen={(c) => setSetup(c.key)} /></div>
        </>
      )}
    </section>
  );
}

function NotebookName({ nb }) {
  const [v, setV] = useState(nb.title);
  const save = () => { if (v.trim() && v.trim() !== nb.title) updateNotebook(nb, { title: v }); else setV(nb.title); };
  return <input className="sp-nb-name" value={v} maxLength={60} aria-label="Notebook name" readOnly={isExample(nb)} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

function Session({ page, name, now, onOpen }) {
  const ctx = useStudy();
  const charts = (page.attachments || []).length;
  const sub = [pageDate(page.createdAt, now), name, charts ? plural(charts, "chart") : null].filter(Boolean).join(" · ");
  return (
    <div className="sp-row">
      <button type="button" className="sp-row-open" onClick={onOpen}>
        <span className="sp-row-words"><b>{page.title || snippet(page) || "Untitled"}</b><small>{sub}</small></span>
        <Thumb page={page} />
      </button>
      {!ctx.example && <button type="button" className="icon-btn sm sp-row-x" aria-label={`Delete ${page.title || "this session"}`} onClick={() => deletePage(page)}><Icon name="trash" size={15} /></button>}
    </div>
  );
}

function Thumb({ page }) {
  const first = page.attachments?.[0];
  const { url } = usePhotoUrl(!page.videoId && first ? first.path : null, true);
  if (page.videoId) return <span className="sp-thumb"><img src={`https://i.ytimg.com/vi/${page.videoId}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" draggable="false" /></span>;
  if (url) return <span className="sp-thumb chart"><img src={url} alt="" loading="lazy" decoding="async" draggable="false" /></span>;
  return null;
}

function TradePicker({ trades, onPick, onClose }) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const list = trades.filter((t) => !s || `${t.symbol} ${t.side} ${t.setup || ""} ${t.date}`.toLowerCase().includes(s)).slice(0, 80);
  return (
    <Modal label="Link a trade" onClose={onClose} className="overlay sheet-overlay">
      <div className="sheet st-picker">
        <header className="sheet-head">
          <div><h2>Link a trade</h2><p>The trade these notes are about, one tap from the journal.</p></div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="st-picker-body">
          {trades.length > 0 && (
            <label className="search st-picker-search">
              <Icon name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol, setup or date" aria-label="Find a trade" data-autofocus />
            </label>
          )}
          <div className="st-picker-list">
            {list.map((t) => (
              <button type="button" key={t.id} className="st-pick-row" onClick={() => onPick(t)}>
                <span className="st-pick-sym"><b>{t.symbol}</b><span className={`side-tag ${t.side}`}>{t.side === "long" ? "L" : "S"}</span></span>
                <span className="st-pick-setup muted">{t.setup || "No setup"}</span>
                <span className="num faint">{t.date} · {t.time}</span>
                <span className="num st-pick-r">{money(+t.pnl || 0, { sign: true })}</span>
              </button>
            ))}
            {!trades.length && <p className="empty-note">No trades yet. Log one, and you can link these notes to it.</p>}
            {trades.length > 0 && !list.length && <p className="empty-note">No trade matches “{q}”.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
