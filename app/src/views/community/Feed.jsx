import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { LIVE, LEGAL, POST_MONEY } from "../../mode";
import { setState, toast, useStore } from "../../store";
import { Linked } from "../../live/Community";
import { art } from "../../data";
import InkPicture from "../../drip/InkPicture";
import { money } from "../../drip/week";
import { BigDays, NextUp, RoomsNow, TopBoard } from "../../drip/hub/LivePanel";
import FitCard from "../../drip/floor/FitCard";
import { tiesOf } from "../../drip/floor/ties";
import { CREWS } from "./houses";
import { useCm, useLoad } from "./context";
import { cardOf, useAttachable } from "./mine";
import { errText, source } from "./source";
import { Av, Note, ReportPicker, TradeCard, TradeTie, ago, useMedia } from "./parts";
import { Ico, Leaf } from "./dmParts";

function Name({ who, children }) {
  const { personCard } = useCm();
  if (!who?.handle || who.mine) return children;
  return <button type="button" className="dm-post-name" onClick={(e) => personCard(who.handle, e.currentTarget)}>{children}</button>;
}

const TOPICS = [["win", "Win"], ["lesson", "Lesson"], ["question", "Question"]];
const TOPIC = Object.fromEntries(TOPICS);

/* ---------- Attaching one of your trades ---------- */

export function TradePicker({ onPick, onClose }) {
  const trades = useAttachable();
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("pointerdown", away);
    ref.current?.addEventListener("keydown", esc);
    ref.current?.querySelector("button")?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  return (
    <div className="cm-picker" ref={ref} role="dialog" aria-label="Attach one of your trades">
      <div className="cm-picker-head"><b>Attach a trade</b><span>{POST_MONEY ? "Shown with its dollars and where it came from." : "Shown with its market and where it came from."}</span></div>
      {trades.length ? (
        <ul>
          {trades.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onPick(t)}>
                <span className="cm-picker-sym"><b>{t.symbol}</b> <span className="faint">{/^l/i.test(t.side) ? "Long" : "Short"}</span></span>
                <span className="cm-picker-setup">{t.setup || "No setup"}</span>
                <span className="faint xs">{t.date}</span>
                <b className="num">{t.pnl == null || t.pnl === "" ? "" : money(+t.pnl, { sign: true })}</b>
              </button>
            </li>
          ))}
        </ul>
      ) : <Note>Your journal has no trades yet. Log or import one, then attach it here.</Note>}
    </div>
  );
}

/* ---------- Writing a post ---------- */

function Composer({ onPosted }) {
  const { me, hub } = useCm();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("lesson");
  const [anon, setAnon] = useState(false);
  const [trade, setTrade] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => { if (open) box.current?.focus({ preventScroll: true }); }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await source.post({ kind: topic, body: text.trim(), anonymous: anon, tradeId: trade?.id, card: trade ? cardOf(trade, anon) : null });
      setText(""); setTrade(null); setOpen(false);
      toast(anon ? "Posted anonymously" : "Posted");
      onPosted();
      hub.reload();
    } catch (err) { toast(errText(err, "Couldn't post that. Check your connection and try again."), { warn: true }); }
    setBusy(false);
  };
  if (!open) {
    return (
      <div className="hub-write">
        <Av who={me} size={40} />
        <button type="button" className="hub-write-box" onClick={() => setOpen(true)}>What happened today?</button>
        <div className="hub-write-kinds">
          {TOPICS.map(([k, l]) => <button type="button" key={k} onClick={() => { setTopic(k); setOpen(true); }}>{l}</button>)}
        </div>
        <button type="button" className="hub-write-go" aria-label="Write a post" onClick={() => setOpen(true)}><Icon name="plus" size={18} /></button>
      </div>
    );
  }
  return (
    <form className="fl-compose" onSubmit={submit}>
      <div className="fl-compose-top">
        {anon ? <Av anon size={32} /> : <Av who={me} size={32} />}
        <textarea ref={box} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Write a post" placeholder="A win, a lesson or a question" />
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={16} /></button>
      </div>
      {trade && (
        <div className="fl-attached">
          <TradeCard t={cardOf(trade, anon)} />
          <button type="button" className="fl-text-btn" onClick={() => setTrade(null)}>Remove the trade</button>
        </div>
      )}
      <div className="fl-chips" role="group" aria-label="What kind of post">
        {TOPICS.map(([k, l]) => <button type="button" key={k} aria-pressed={topic === k} onClick={() => setTopic(k)}>{l}</button>)}
      </div>
      <div className="fl-compose-row">
        <span className="cm-attach-wrap">
          <button type="button" className="fl-text-btn" aria-expanded={picking} onClick={() => setPicking(!picking)}>{trade ? "Change trade" : "Attach a trade"}</button>
          {picking && <TradePicker onPick={(t) => { setTrade(t); setPicking(false); box.current?.focus({ preventScroll: true }); }} onClose={() => setPicking(false)} />}
        </span>
        <label className={`cm-switch ${anon ? "on" : ""}`}><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /><i aria-hidden="true" /> Anonymous</label>
        <span className="cm-grow" />
        <button type="submit" className="btn" disabled={!text.trim() || busy}>{busy ? "Posting…" : "Post"}</button>
      </div>
      {anon && trade && <p className="fl-compose-note">An attached trade can still hint at who you are.</p>}
      <p className="fl-compose-note">Share what you see, not what to do. No signals, no calls, nothing for sale. <a href={`${LEGAL}#community`} target="_blank" rel="noopener">Community rules</a></p>
    </form>
  );
}

/* ---------- A post, and its replies ---------- */

// Report, or delete your own. Tucked behind three dots so a post stays a post.
function More({ mine, onDelete, onReport, pinned = false, onPin = null }) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!confirm) return undefined; const t = setTimeout(() => setConfirm(false), 4000); return () => clearTimeout(t); }, [confirm]);
  if (reporting) return <ReportPicker onPick={(why) => { setReporting(false); setOpen(false); onReport(why); }} onCancel={() => { setReporting(false); setOpen(false); }} />;
  if (open) {
    const pin = onPin && <button type="button" className="cm-act" onClick={() => { setOpen(false); onPin(); }}>{pinned ? "Unpin" : "Pin to the top"}</button>;
    return <>{pin}{mine
      ? <button type="button" className="cm-act" onClick={() => { if (confirm) onDelete(); else setConfirm(true); }}><Icon name="trash" size={14} /> {confirm ? "Tap again to delete" : "Delete"}</button>
      : <button type="button" className="cm-act" onClick={() => setReporting(true)}><Icon name="flag" size={14} /> Report</button>}</>;
  }
  return <button type="button" className="cm-act" aria-label="More" onClick={() => setOpen(true)}><Ico name="dots" size={18} /></button>;
}

function Reply({ r, onRemove }) {
  const report = async (reason) => {
    try { await source.report({ postId: r.id }, reason); toast("Reported. A moderator will look at it."); }
    catch (err) { toast(errText(err, "Couldn't send that report. Try again."), { warn: true }); }
  };
  const remove = async () => {
    try { await source.removePost(r.id); onRemove(r.id); toast("Deleted"); } catch (err) { toast(errText(err, "Couldn't delete that."), { warn: true }); }
  };
  const anon = r.anonymous || !r.author;
  return (
    <div className="fl-reply">
      {anon ? <Av anon size={26} /> : <Av who={r.author} size={26} />}
      <div className="fl-reply-main">
        <p className="fl-reply-who">{anon ? <b>Anonymous</b> : <Name who={r.mine ? { ...r.author, mine: true } : r.author}><b>{r.author.handle}</b></Name>} <span>{r.ago || ago(r.at)}</span></p>
        <p className="fl-reply-body"><Linked text={r.body} /></p>
      </div>
      <More mine={r.mine} onDelete={remove} onReport={report} />
    </div>
  );
}

function Replies({ post, onCount }) {
  const { me } = useCm();
  const list = useLoad(() => source.replies(post.id), [post.id]);
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(post.anonymous);
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await source.post({ parentId: post.id, body: text.trim(), anonymous: anon });
      setText("");
      const next = await list.reload();
      onCount(next?.length ?? post.replies + 1);
    } catch (err) { toast(errText(err, "Couldn't send that reply. Try again."), { warn: true }); }
    setBusy(false);
  };
  return (
    <div className="fl-replies">
      {list.loading && !list.data && <Note>Loading replies…</Note>}
      {list.error && !list.data && <Note retry={list.reload}>Couldn't load the replies.</Note>}
      {(list.data || []).map((r) => (
        <Reply key={r.id} r={r} onRemove={(id) => { list.set((xs) => xs.filter((x) => x.id !== id)); onCount(Math.max(0, post.replies - 1)); }} />
      ))}
      <form className="fl-reply-form" onSubmit={send}>
        {anon ? <Av anon size={26} /> : <Av who={me} size={26} />}
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Reply" aria-label="Write a reply" />
        <label className={`cm-switch sm ${anon ? "on" : ""}`}><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /><i aria-hidden="true" /><span className="sr-only">Reply anonymously</span></label>
        <button type="submit" className="cm-send" aria-label="Send reply" disabled={!text.trim() || busy}><Icon name="send" size={15} /></button>
      </form>
    </div>
  );
}

function Post({ p, i, onChange, onRemove, pinner = false, onPinned }) {
  const { viewShare } = useCm();
  const [open, setOpen] = useState(false);
  if (p.team) {
    return (
      <article className="fl-post rise-in" style={{ "--i": i }} data-post={p.id}>
        <Av team size={40} />
        <div className="fl-post-main">
          <div className="fl-post-head"><b>Marble</b><span>Pinned</span></div>
          <p className="fl-post-body">{p.body}</p>
        </div>
      </article>
    );
  }
  const like = async () => {
    const on = !p.liked;
    onChange({ ...p, liked: on, likes: Math.max(0, p.likes + (on ? 1 : -1)) });
    try { await source.like(p.id, on); } catch (err) { onChange(p); toast(errText(err, "Couldn't save that like."), { warn: true }); }
  };
  const report = async (reason) => {
    try { await source.report({ postId: p.id }, reason); toast("Reported. A moderator will look at it."); }
    catch (err) { toast(errText(err, "Couldn't send that report. Try again."), { warn: true }); }
  };
  const remove = async () => {
    try { await source.removePost(p.id); onRemove(p.id); toast("Deleted"); } catch (err) { toast(errText(err, "Couldn't delete that."), { warn: true }); }
  };
  const anon = p.anonymous || !p.author;
  const ties = tiesOf(p.body, p.trade);
  const pin = pinner && !anon ? async () => {
    try { await source.pin(p.id, !p.pinned); toast(p.pinned ? "Unpinned" : "Pinned to the top of the Floor"); onPinned?.(); }
    catch (err) { toast(errText(err, "Couldn't change the pin. Try again."), { warn: true }); }
  } : null;
  return (
    <article className={`fl-post rise-in ${p.pinned ? "pinned" : ""}`} style={{ "--i": i }} data-post={p.id}>
      {anon ? <Av anon size={40} /> : <Av who={p.author} size={40} />}
      <div className="fl-post-main">
        <div className="fl-post-head">
          {p.pinned && <span className="fl-pin">Pinned</span>}
          {anon ? <b>Anonymous</b> : <Name who={p.mine ? { ...p.author, mine: true } : p.author}><b>{p.author.handle}</b></Name>}
          {!anon && p.author.crew && <span>{CREWS[p.author.crew]?.name}</span>}
          <span>{p.ago || ago(p.at)}</span>
          {TOPIC[p.kind] && <span className="fl-post-kind">{TOPIC[p.kind]}</span>}
        </div>
        <p className="fl-post-body"><Linked text={p.body} /></p>
        {ties.length > 0 && <p className="fl-ties">{ties.join(" · ")}</p>}
        {p.flex && <FitCard className="fl-post-card" format="wide" card={p.flex.card} finish={p.flex.finish} picture={p.flex.picture} handle={anon ? null : p.author?.handle ?? null} show={{ money: !anon, record: false, handle: !anon }} />}
        {p.flex ? <TradeTie t={p.trade} /> : (
          <div className={`fl-post-media ${p.picture ? "pic" : ""}`}>
            {p.picture && <InkPicture className="fl-post-pic" src={art(p.picture.path, 960)} at={p.picture.at} edge={false} />}
            <TradeCard t={p.trade} />
          </div>
        )}
        {p.share && <div className="dm-card-wrap"><Leaf c={p.share} onOpen={() => viewShare(p.share.share)} /></div>}
        <div className="fl-post-acts">
          <button type="button" className={`cm-act ${p.liked ? "on" : ""}`} aria-pressed={!!p.liked} aria-label={`Like, ${p.likes}`} onClick={like}><Icon name="heart" size={17} /> <span className="num">{p.likes}</span></button>
          <button type="button" className={`cm-act ${open ? "on" : ""}`} aria-expanded={open} aria-label={`Replies, ${p.replies}`} onClick={() => setOpen(!open)}><Icon name="chat" size={17} /> <span className="num">{p.replies}</span></button>
          <span className="cm-grow" />
          <More mine={p.mine} onDelete={remove} onReport={report} pinned={!!p.pinned} onPin={pin} />
        </div>
        {open && <Replies post={p} onCount={(n) => onChange({ ...p, replies: n })} />}
      </div>
    </article>
  );
}

const FILTERS = [["all", "Everyone"], ["win", "Wins"], ["lesson", "Lessons"], ["question", "Questions"], ["crew", "Your crew"]];
const filterArgs = (f, crew) => (f === "all" ? {} : f === "crew" ? (crew ? { crew } : null) : { kind: f });

// A first visit, with no crew and nothing posted: three places to begin
function FirstSteps() {
  const { go } = useCm();
  const closed = useStore((s) => Object.keys(s.closes || {}).length > 0);
  const steps = [
    ["Join a crew", "A team to trade the month with", () => go("crews")],
    ["Say hello in Chat", "Everyone starts in General", () => go("chat")],
    ...(closed ? [] : [["Close today", "Your first card comes from your first close", () => setState({ closing: "review" })]]),
  ];
  return (
    <section className="fl-start">
      <h3>New here? Start with one of these.</h3>
      {steps.map(([title, line, run]) => (
        <button type="button" key={title} onClick={run}>
          <span><b>{title}</b><span>{line}</span></span>
          <Icon name="chevR" size={18} />
        </button>
      ))}
    </section>
  );
}

// Without a right column, what it holds comes up between the posts
const INTERLUDES = { 2: <BigDays max={4} />, 5: <RoomsNow max={3} />, 8: <TopBoard />, 11: <NextUp /> };

function FeedList() {
  const { crew, cup, go } = useCm();
  const [filter, setFilter] = useState("all");
  const args = filterArgs(filter, crew);
  const feed = useLoad(() => (args ? source.feed(args) : []), [filter, crew]);
  const narrow = useMedia("(max-width: 1239px)");
  const [fresh, setFresh] = useState(0);
  const [pinner, setPinner] = useState(false);
  useEffect(() => { let live = true; source.canPin?.().then((v) => live && setPinner(!!v), () => {}); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!LIVE) return undefined;
    const t = setInterval(() => {
      if (document.hidden) return;
      if (!args) return;
      source.feed(args).then((ps) => { const seen = new Set((feed.data || []).map((p) => p.id)); setFresh(ps.filter((p) => !seen.has(p.id)).length); }).catch(() => {});
    }, 45000);
    return () => clearInterval(t);
  }, [filter, feed.data]);
  const reload = () => { setFresh(0); feed.reload(); };
  const posts = feed.data || [];
  const firstVisit = !!cup.data && !crew && !!feed.data && filter === "all" && !posts.some((p) => p.mine);
  const wantPost = useStore((s) => s.communityPost);
  useEffect(() => {
    if (!wantPost || !feed.data) return;
    setState({ communityPost: null });
    const el = document.querySelector(`[data-post="${CSS.escape(wantPost)}"]`);
    if (!el) { toast("That post is further back than the feed shows.", { warn: true }); return; }
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.classList.add("cm-post-found");
    setTimeout(() => el.classList.remove("cm-post-found"), 1800);
  }, [wantPost, feed.data]);
  return (
    <div className="fl-feed">
      <Composer onPosted={reload} />
      {firstVisit && <FirstSteps />}
      <div className="fl-chips" role="group" aria-label="Show">
        {FILTERS.map(([k, l]) => <button type="button" key={k} aria-pressed={filter === k} onClick={() => { setFilter(k); setFresh(0); }}>{l}</button>)}
      </div>
      {fresh > 0 && <button type="button" className="fl-fresh" onClick={reload}>{fresh} new post{fresh === 1 ? "" : "s"}</button>}
      {feed.loading && !feed.data && <Note>Loading the feed…</Note>}
      {feed.error && !feed.data && <Note retry={feed.reload}>Couldn't load the feed.</Note>}
      {feed.data && !posts.length && (filter === "crew" && !crew
        ? <Note>Join a crew and its posts land here. <button type="button" className="link" onClick={() => go("crews")}>See the crews</button></Note>
        : <Note>{filter === "all" ? "The Floor's quiet right now. Post the first thing today: a win, a loss or a question." : "Nothing here yet."}</Note>)}
      <div className={`fl-posts ${feed.loading ? "busy" : ""}`} key={filter}>
        {posts.map((p, i) => (
          <Fragment key={p.id}>
            <Post p={p} i={Math.min(i, 6)} onChange={(np) => feed.set((list) => list.map((x) => (x.id === np.id ? np : x)))}
              onRemove={(id) => feed.set((list) => list.filter((x) => x.id !== id))} pinner={pinner} onPinned={reload} />
            {narrow && filter === "all" && INTERLUDES[i] && <div className="hub-inter">{INTERLUDES[i]}</div>}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export const eventLine = (e) => {
  if (e.kind === "cup") return { open: "Entries open", live: "Live now", review: "Results being checked", final: "Winners announced", cancelled: "Cancelled" }[e.status] || "";
  return { open: e.entryNo ? "You're in" : "Free to enter", closed: "Entries closed", drawn: "Drawn", cancelled: "Cancelled" }[e.status] || "";
};

export default FeedList;
