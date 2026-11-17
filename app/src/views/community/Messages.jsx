import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { LEGAL, POST_MONEY } from "../../mode";
import { toast, useStore } from "../../store";
import { Linked } from "../../live/Community";
import { useCm, useLoad } from "./context";
import { cardOf } from "./mine";
import { errText, source } from "./source";
import { TradePicker } from "./Feed";
import { Note, TradeCard, clock, dayLabel } from "./parts";
import { Handle, Ico, Leaf, Person, SafetyLine, Seal, Sheet } from "./dmParts";
import { MAX_BODY, SAFETY, addressParts, conversationsOf, evidenceOf, flagNote, namesLine, requestsOf } from "./dms";
import { CREWS } from "./houses";

const timeOf = (m) => m.time || (m.at ? clock(m.at) : "");
const dayOf = (m) => m.day || (m.at ? dayLabel(m.at) : "Today");
const mins = (t) => { const x = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return x ? +x[1] * 60 + +x[2] : null; };
const grouped = (m, prev) => !!prev && prev.mine === m.mine && dayOf(prev) === dayOf(m)
  && (m.at && prev.at ? Date.parse(m.at) - Date.parse(prev.at) < 5 * 60e3
    : mins(m.time) != null && mins(prev.time) != null ? Math.abs(mins(m.time) - mins(prev.time)) < 5 : prev.time === m.time);
function whenLabel(t) {
  if (t.atLabel) return t.atLabel;
  const iso = t.last?.at || t.at;
  if (!iso) return "";
  const d = new Date(iso), days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return clock(iso);
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const month = (iso) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
function joined(w) {
  if (w?.meta) return w.meta;
  if (!w?.since) return "";
  const days = Math.floor((Date.now() - Date.parse(w.since)) / 864e5);
  return days < 1 ? "Joined today" : days < 30 ? `Joined ${days} day${days === 1 ? "" : "s"} ago` : `Joined ${month(w.since)}`;
}
const crewName = (w) => (w?.crew ? CREWS[w.crew]?.name || w.crew : "No crew");
const subOf = (w) => (w?.staff ? "Verified by Marble" : `${crewName(w)}${w?.since ? ` · since ${month(w.since)}` : ""}`);
const isTouch = () => matchMedia("(pointer: coarse)").matches;

function Body({ text, dead }) {
  if (!text) return null;
  if (dead) {
    return <p className="cm-msg-body">{addressParts(text).map((p, i) => (p.address ? <span key={i} className="dm-deadlink" title="Links don't open in a request">{p.address}</span> : <Fragment key={i}>{p.text}</Fragment>))}</p>;
  }
  return <p className="cm-msg-body dm-body"><Linked text={text} /></p>;
}

function ThreadRow({ t, big, onPick }) {
  const w = t.with;
  return (
    <button type="button" className={`dm-thread ${t.unread && !t.muted ? "unread" : ""} ${big ? "big" : ""}`} onClick={() => onPick(`dm:${t.id}`)}
      aria-label={`${w.handle}${w.staff ? ", Marble staff" : ""}${t.unread ? `, ${t.unread} unread` : ""}`}>
      <Person who={w} size={big ? 40 : 26} />
      <span className="dm-thread-text">
        <span className="dm-thread-name"><b>{w.handle}</b>{w.staff ? <Seal size={13} /> : null}{t.muted && <Ico name="mute" size={12} />}</span>
        {big && t.last && <span className="dm-thread-last">{t.waiting ? "Waiting for them to accept · " : ""}{t.last.mine ? "You: " : ""}{t.last.body || (t.last.card === "page" ? "A Study page" : "A trade")}</span>}
      </span>
      <span className="dm-thread-meta">
        {t.unread > 0 && !t.muted ? <span className="cm-count num">{t.unread}</span> : <span className="num">{whenLabel(t)}</span>}
        {big && t.unread > 0 && !t.muted && <span className="num">{whenLabel(t)}</span>}
      </span>
    </button>
  );
}

/* ---------- The list ---------- */

function List({ head, onPick }) {
  const { dm } = useCm();
  const threads = dm.data?.threads || [];
  const reqs = requestsOf(threads);
  const convos = conversationsOf(threads);
  const [settings, setSettings] = useState(false);
  return (
    <>
      {head}
      <div className="cm-chat-scroll dm-list">
        {dm.loading && !dm.data && <Note>Loading your messages…</Note>}
        {dm.error && !dm.data && <Note retry={dm.reload}>Couldn't load your messages.</Note>}
        {reqs.length > 0 && (
          <button type="button" className="dm-req-row big" onClick={() => onPick("dm-requests")}>
            <span className="dm-req-ico"><Ico name="inbox" size={18} /></span>
            <span className="dm-req-text"><b>Message requests</b><span>{namesLine(reqs.map((r) => r.with.handle))}</span></span>
            <span className="dm-req-n num">{reqs.length}</span>
          </button>
        )}
        {dm.data && !convos.length && !reqs.length && <Note>No conversations yet. Tap a trader's name in the feed or a room to message them.</Note>}
        {convos.map((t) => <ThreadRow key={t.id} t={t} big onPick={onPick} />)}
        <div className="dm-list-foot">
          <button type="button" className="dm-new-btn" onClick={() => onPick("dm-new")}><Ico name="pen" size={15} /> New message</button>
          <button type="button" className="dm-new-btn ghost" onClick={() => setSettings(true)}><Ico name="gear" size={15} /> Message settings</button>
        </div>
      </div>
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </>
  );
}

/* ---------- The head of a conversation ---------- */

function PersonHead({ w, narrow, onBack, sub, tools }) {
  const { personCard } = useCm();
  return (
    <div className="cm-chat-head dm-head">
      {narrow && <button type="button" className="icon-btn dm-back" aria-label="Back to messages" onClick={onBack}><Icon name="chevL" size={18} /></button>}
      <button type="button" className="dm-head-who" onClick={(e) => personCard(w.handle, e.currentTarget)} aria-label={`${w.handle}'s card`}>
        <Person who={w} size={34} />
        <span className="dm-head-text"><Handle who={w} /><span className="dm-head-sub">{sub ?? subOf(w)}</span></span>
      </button>
      {tools && <span className="dm-head-tools">{tools}</span>}
    </div>
  );
}

function Start({ w, accepted }) {
  return (
    <div className={`dm-start ${w.staff ? "staff" : ""}`}>
      <Person who={w} size={52} />
      <span className="dm-start-name"><b>{w.handle}</b>{w.staff && <Seal size={18} />}</span>
      <span className="dm-start-sub">{w.staff ? "Marble staff · the account that speaks for Marble" : accepted || subOf(w)}</span>
      {w.staff ? (
        <div className="dm-safety staff">
          <Seal size={16} />
          <span>Real staff always carry this seal, and it can't be copied into a name. Staff will never ask for card details, passwords or a payment in a message.</span>
        </div>
      ) : <SafetyLine />}
    </div>
  );
}

/* ---------- A conversation ---------- */

function Message({ m, prev, w, me, open, asked, onOpen, onReport, onUnsend, onPage }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(false), 4000); return () => clearTimeout(t); }, [confirm]);
  const g = grouped(m, prev);
  const who = m.mine ? me : w;
  return (
    <div className={`cm-msg ${g ? "grouped" : ""} ${m.fresh ? "fresh" : ""} ${open ? "open" : ""}`} onClick={(e) => { if (!e.target.closest("button, a")) onOpen(); }}>
      {g ? <span className="cm-msg-gutter" /> : <Person who={who} size={30} />}
      <div className="cm-msg-main">
        {!g && (
          <div className="cm-msg-head">
            <Handle who={who} />
            <span className="cm-msg-time num">{timeOf(m)}</span>
          </div>
        )}
        <Body text={m.body} dead={asked && !m.mine} />
        {m.card?.type === "trade" && <TradeCard t={m.card} />}
        {m.card?.type === "page" && <div className="dm-card-wrap"><Leaf c={m.card} onOpen={m.card.gone ? null : () => onPage(m.card.share)} /></div>}
      </div>
      <span className="cm-msg-tools">
        {m.mine
          ? <button type="button" onClick={() => (confirm ? onUnsend(m) : setConfirm(true))} aria-label="Unsend this message"><Icon name="trash" size={13} /><span>{confirm ? "Tap again" : "Unsend"}</span></button>
          : <button type="button" onClick={() => onReport(m)} aria-label="Report this message"><Icon name="flag" size={13} /><span>Report</span></button>}
      </span>
    </div>
  );
}

function Composer({ w, disabled, why, canAttach, onSend, onTrade, onPage, placeholder }) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(null); // attach | trade
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const wrap = useRef(null);
  useEffect(() => {
    if (menu !== "attach") return;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setMenu(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);
  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy || disabled) return;
    setBusy(true);
    const ok = await onSend(body);
    setBusy(false);
    if (ok) setText("");
    box.current?.focus();
  };
  return (
    <form className="cm-composer dm-composer" onSubmit={send}>
      <span className="cm-attach-wrap up" ref={wrap}>
        <button type="button" className={`icon-btn dm-plus ${menu ? "on" : ""}`} disabled={!canAttach || disabled} aria-expanded={!!menu}
          aria-label={canAttach ? "Share a trade or a page" : "Trades and pages can be shared once they accept"} title={canAttach ? "Share" : why || "After they accept"}
          onClick={() => setMenu(menu ? null : "attach")}>
          <Icon name="plus" size={17} />
        </button>
        {menu === "attach" && (
          <div className="dm-menu up" role="menu" aria-label="Share in this conversation">
            <button type="button" role="menuitem" onClick={() => setMenu("trade")}><Icon name="chart" size={16} /><span><b>A trade from your journal</b><span>{POST_MONEY ? "With its dollars and where it came from." : "With its market and where it came from."}</span></span></button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onPage(); }}><Ico name="book" size={16} /><span><b>A page from Study</b><span>Read-only, for {w.handle} only. Stop sharing any time.</span></span></button>
          </div>
        )}
        {menu === "trade" && <TradePicker onPick={(t) => { setMenu(null); onTrade(t, text.trim()).then((ok) => ok && setText("")); }} onClose={() => setMenu(null)} />}
      </span>
      <textarea ref={box} value={text} rows={1} maxLength={MAX_BODY} disabled={disabled} aria-label={`Message ${w.handle}`} placeholder={disabled ? why : placeholder || `Message ${w.handle}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) send(e); }} />
      <button type="submit" className="cm-send" aria-label="Send" disabled={!text.trim() || busy || disabled}><Icon name="send" size={16} /></button>
    </form>
  );
}

function Thread({ id, narrow, onPick }) {
  const { me, dm, viewShare, appGo } = useCm();
  const data = useLoad(() => source.dmThread(id), [id]);
  const [openId, setOpenId] = useState(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const scroller = useRef(null);
  const nearBottom = useRef(true);
  const t = data.data?.thread;
  const messages = data.data?.messages || [];
  const w = t?.with || dm.data?.threads?.find((x) => x.id === id)?.with || { handle: "…" };
  const lastAt = messages.at(-1)?.at;
  const later = useRef(null);
  later.current = async () => {
    try {
      const got = await source.dmThread(id, { after: lastAt || null });
      data.set((d) => {
        if (!d) return got;
        const seen = new Set(d.messages.map((m) => m.id));
        const add = got.messages.filter((m) => !seen.has(m.id)).map((m) => ({ ...m, fresh: true }));
        return add.length ? { ...d, thread: got.thread, messages: [...d.messages, ...add] } : d;
      });
    } catch { }
  };
  useEffect(() => {
    const off = source.dmListen(id, { onMessage: () => later.current(), onDelete: (mid) => data.set((d) => (d ? { ...d, messages: d.messages.filter((m) => m.id !== mid) } : d)) });
    const again = () => { if (!document.hidden) later.current(); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    return () => { off(); document.removeEventListener("visibilitychange", again); window.removeEventListener("online", again); };
  }, [id]);
  // Opening it reads it: the counts follow
  useEffect(() => { if (data.data) dm.reload(); }, [!!data.data]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, id]);
  useEffect(() => { if (!leaving) return; const x = setTimeout(() => setLeaving(false), 4000); return () => clearTimeout(x); }, [leaving]);
  useEffect(() => {
    if (!menu) return;
    const away = (e) => { if (!e.target.closest(".dm-menu, .dm-head-tools")) setMenu(false); };
    const esc = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const inbox = dm.data?.me || {};
  const waiting = !!t?.waiting;
  const staffLocked = inbox.staff && !inbox.aal2;
  const why = staffLocked ? "Verify two-step sign-in in Admin to send as staff" : waiting ? `Waiting for ${w.handle} to accept` : "";
  const add = (m) => { nearBottom.current = true; data.set((d) => (d ? { ...d, messages: d.messages.some((x) => x.id === m.id) ? d.messages : [...d.messages, m] } : d)); };
  const send = async (body, extra = {}) => {
    try { add(await source.dmSend(id, { body, ...extra })); dm.reload(); return true; }
    catch (e) { toast(errText(e, "Couldn't send that. Check your connection and try again."), { warn: true }); return false; }
  };
  const leave = async () => {
    if (!leaving) { setLeaving(true); return; }
    try { await source.dmLeave(id); setMenu(false); dm.reload(); onPick("dm-list"); toast("Conversation deleted for you"); }
    catch (e) { toast(errText(e), { warn: true }); }
  };
  const mute = async () => {
    try { await source.dmMute(id, !t.muted); data.set((d) => ({ ...d, thread: { ...d.thread, muted: !t.muted } })); dm.reload(); setMenu(false); toast(t.muted ? "Unmuted" : "Muted: no count and no email for this conversation"); }
    catch (e) { toast(errText(e), { warn: true }); }
  };
  const lastTheirs = [...messages].reverse().find((m) => !m.mine);
  return (
    <>
      <PersonHead w={w} narrow={narrow} onBack={() => onPick("dm-list")}
        sub={waiting ? "Message request sent" : t?.muted ? `${subOf(w)} · muted` : undefined}
        tools={<button type="button" className="icon-btn" aria-label="More" aria-expanded={menu} title="More" onClick={() => setMenu(!menu)}><Ico name="dots" size={18} /></button>} />
      {menu && t && (
        <div className="dm-menu-anchor">
          <div className="dm-menu down" role="menu" aria-label={`Conversation with ${w.handle}`}>
            <button type="button" role="menuitem" onClick={mute}><Ico name="mute" size={16} /><span><b>{t.muted ? "Unmute" : "Mute"}</b><span>{t.muted ? "Counts and emails come back" : "No count and no email for this one"}</span></span></button>
            {lastTheirs && <button type="button" role="menuitem" onClick={() => { setMenu(false); setSheet({ report: lastTheirs }); }}><Icon name="flag" size={16} /><span><b>Report {w.handle}</b><span>Sends their last messages to a moderator</span></span></button>}
            {!w.staff && <button type="button" role="menuitem" onClick={() => { setMenu(false); setSheet({ block: true }); }}><Ico name="block" size={16} /><span><b>Block {w.handle}</b><span>They aren't told</span></span></button>}
            <span className="dm-menu-rule" />
            <button type="button" role="menuitem" onClick={leave}><Icon name="trash" size={16} /><span><b>{leaving ? "Tap again to delete" : "Delete conversation"}</b><span>For you only</span></span></button>
          </div>
        </div>
      )}
      <div className="cm-pinned dm-private"><Icon name="lock" size={12} /><span>Private between you and {w.handle}.<span className="cm-ph"> Moderators only see a message if one of you reports it.</span></span></div>
      <div className="cm-chat-scroll dm-scroll" ref={scroller} aria-live="polite" aria-relevant="additions"
        onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {data.loading && !data.data && <Note>Loading the conversation…</Note>}
        {data.error && !data.data && <Note retry={data.reload}>{errText(data.error, "Couldn't load the conversation.")}</Note>}
        {t && <Start w={w} accepted={t.accepted} />}
        {messages.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || dayOf(messages[i - 1]) !== dayOf(m)) && <div className="cm-day"><span>{dayOf(m)}</span></div>}
            <Message m={m} prev={messages[i - 1]} w={w} me={me} open={openId === m.id} asked={t?.state === "request"} onOpen={() => setOpenId(openId === m.id ? null : m.id)}
              onPage={(share) => viewShare(share)}
              onReport={(x) => setSheet({ report: x })}
              onUnsend={async (x) => {
                try {
                  await source.dmUnsend(x.id);
                  data.set((d) => ({ ...d, messages: d.messages.filter((y) => y.id !== x.id) }));
                  dm.reload();
                  if (waiting && !messages.some((y) => y.mine && y.id !== x.id)) { toast("Request withdrawn"); onPick("dm-list"); }
                } catch (e) { toast(errText(e), { warn: true }); }
              }} />
          </Fragment>
        ))}
        {waiting && <div className="dm-firstnote"><Icon name="mail" size={15} /><span><b>Sent as a message request.</b> {w.handle} sees it when they accept. You can send more once they do.</span></div>}
      </div>
      {staffLocked && <p className="dm-quota">Staff accounts send with two-step sign-in. <button type="button" className="link" onClick={() => appGo?.("team")}>Verify in Admin</button></p>}
      {t && (
        <Composer w={w} disabled={waiting || staffLocked} why={why} canAttach={!waiting}
          onSend={(body) => send(body)}
          onTrade={(trade, body) => send(body, { tradeId: trade.id, card: cardOf(trade) })}
          onPage={() => setSheet({ page: true })} />
      )}
      {sheet?.report && <ReportSheet w={w} messages={messages} message={sheet.report} onClose={() => setSheet(null)} onDone={(blocked) => { setSheet(null); dm.reload(); if (blocked) onPick("dm-list"); }} />}
      {sheet?.block && <BlockSheet w={w} last={lastTheirs} onClose={() => setSheet(null)} onDone={() => { setSheet(null); dm.reload(); onPick("dm-list"); }} />}
      {sheet?.page && <PagePicker w={w} onClose={() => setSheet(null)} onSent={() => { setSheet(null); later.current(); dm.reload(); }} />}
    </>
  );
}

/* ---------- Message requests ---------- */

function Request({ r, onDone, onReport }) {
  const [busy, setBusy] = useState(false);
  const w = r.with;
  const note = flagNote(r.flags);
  const act = async (fn, after) => {
    setBusy(true);
    try { await fn(); after(); } catch (e) { toast(errText(e), { warn: true }); }
    setBusy(false);
  };
  const accept = () => act(() => source.dmAccept(r.id), () => onDone(`dm:${r.id}`));
  const ignore = () => act(() => source.dmIgnore(r.id), () => { toast(`Ignored. ${w.handle} isn't told.`); onDone(null); });
  return (
    <article className={`dm-req ${note ? "flagged" : ""}`}>
      <div className="dm-req-head">
        <Person who={w} size={36} />
        <span className="dm-req-who"><Handle who={w} /><span className="dm-req-meta">{[w.crew ? crewName(w) : null, joined(w), w.crew ? null : "No crew"].filter(Boolean).join(" · ")}</span></span>
        <span className="num dm-req-at">{whenLabel(r)}</span>
      </div>
      {note && <div className="dm-flag" role="note"><Icon name="alert" size={15} /><span><b>{note.lead}</b> {note.rest}</span></div>}
      <Body text={r.last?.body} dead />
      {r.held && <div className="dm-held"><Icon name="lock" size={13} /><span>A Study page is held back until you accept. Nothing opens or loads before then.</span></div>}
      <div className="dm-req-actions">
        {note ? (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => onReport(r)}><Icon name="flag" size={14} /> Report and block</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={ignore}>Ignore</button>
            <span className="cm-grow" />
            <button type="button" className="link faint dm-accept-anyway" disabled={busy} onClick={accept}>Accept anyway</button>
          </>
        ) : (
          <>
            <button type="button" className="btn" disabled={busy} onClick={accept}>Accept</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={ignore}>Ignore</button>
            <span className="cm-grow" />
            <button type="button" className="link dm-req-report" disabled={busy} onClick={() => onReport(r)}><Icon name="flag" size={13} /> Report</button>
          </>
        )}
      </div>
    </article>
  );
}

function Requests({ narrow, onPick }) {
  const { dm } = useCm();
  const reqs = requestsOf(dm.data?.threads || []);
  const [reporting, setReporting] = useState(null);
  return (
    <>
      <div className="cm-chat-head dm-head">
        {narrow && <button type="button" className="icon-btn dm-back" aria-label="Back to messages" onClick={() => onPick("dm-list")}><Icon name="chevL" size={18} /></button>}
        <span className="dm-head-icon"><Ico name="inbox" size={18} /></span>
        <span className="dm-head-text"><b className="dm-head-title">Message requests</b><span className="dm-head-sub">{reqs.length ? `${reqs.length} ${reqs.length === 1 ? "person" : "people"} you haven't talked to` : "None waiting"}</span></span>
      </div>
      <div className="cm-pinned"><Ico name="eyeOff" size={13} /><span>They can't see that you've read these.<span className="cm-ph"> Only text shows until you accept.</span></span></div>
      <div className="cm-chat-scroll dm-reqs">
        {!reqs.length && <Note>No requests. When someone you haven't talked to messages you, it waits here first.</Note>}
        {reqs.map((r) => <Request key={r.id} r={r} onReport={setReporting} onDone={(to) => { dm.reload(); if (to) onPick(to); }} />)}
        <p className="dm-reqs-foot">Ignored requests are deleted after 30 days, and the sender isn't told. To choose who can send you requests, open Message settings.</p>
      </div>
      {reporting && (
        <ReportSheet w={reporting.with} fromRequest messages={reporting.last ? [{ ...reporting.last, mine: false }] : []} message={reporting.last ? { ...reporting.last, mine: false } : null}
          pick={reporting.flags?.includes("staff_claim") ? "staff" : reporting.flags?.length ? "scam" : "other"}
          onClose={() => setReporting(null)} onDone={() => { setReporting(null); dm.reload(); }} />
      )}
    </>
  );
}

/* ---------- A first message ---------- */

function NewMessage({ handle, narrow, onPick }) {
  const { dm } = useCm();
  const [h, setH] = useState(handle || "");
  const [ask, setAsk] = useState(handle || "");
  const prof = useLoad(() => (ask ? source.dmProfile(ask) : Promise.resolve(null)), [ask]);
  const p = prof.data;
  // Already talking: that conversation opens instead
  useEffect(() => { if (p?.thread && p.state !== "left") onPick(`dm:${p.thread}`); }, [p?.thread]);
  const send = async (body) => {
    try {
      const r = await source.dmStart(p.handle, body);
      dm.reload();
      onPick(`dm:${r.thread}`);
      return true;
    } catch (e) { toast(errText(e, "Couldn't send that. Check your connection and try again."), { warn: true }); return false; }
  };
  if (!ask) {
    return (
      <>
        <div className="cm-chat-head dm-head">
          {narrow && <button type="button" className="icon-btn dm-back" aria-label="Back to messages" onClick={() => onPick("dm-list")}><Icon name="chevL" size={18} /></button>}
          <span className="dm-head-icon"><Ico name="pen" size={17} /></span>
          <span className="dm-head-text"><b className="dm-head-title">New message</b><span className="dm-head-sub">To a trader, by their handle</span></span>
        </div>
        <form className="dm-to" onSubmit={(e) => { e.preventDefault(); const x = h.trim().replace(/^@/, ""); if (x) setAsk(x); }}>
          <label className="dm-sheet-label" htmlFor="dm-to">To</label>
          <div className="dm-to-row">
            <input id="dm-to" className="input" value={h} onChange={(e) => setH(e.target.value)} placeholder="Their handle, like kenji" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={40} data-autofocus />
            <button type="submit" className="btn" disabled={!h.trim()}>Next</button>
          </div>
          <p className="dm-fine">You can also tap a trader's name in the feed. If you haven't talked before, your first message arrives as a request.</p>
        </form>
      </>
    );
  }
  const w = p || { handle: ask };
  const closed = p && !p.open;
  return (
    <>
      <PersonHead w={w} narrow={narrow} onBack={() => onPick("dm-list")} sub={p ? `${crewName(p)} · new conversation` : "…"} />
      <div className="cm-pinned dm-private"><Icon name="lock" size={12} /><span>Private between you and {w.handle}.<span className="cm-ph"> Moderators only see a message if one of you reports it.</span></span></div>
      <div className="cm-chat-scroll dm-scroll">
        {prof.loading && !p && <Note>Finding {ask}…</Note>}
        {prof.error && <Note>{errText(prof.error, "Couldn't find that trader.")} <button type="button" className="link" onClick={() => { setAsk(""); }}>Try another handle</button></Note>}
        {p && <Start w={p} />}
        {p?.mine && <div className="dm-firstnote"><Icon name="user" size={15} /><span>That's you. Choose someone else to message.</span></div>}
        {p && !p.mine && closed && <div className="dm-firstnote"><Ico name="block" size={15} /><span><b>{p.handle} isn't taking new messages.</b> They choose who can send them requests.</span></div>}
        {p && !p.mine && !closed && (
          <div className="dm-firstnote">
            <Icon name="mail" size={15} />
            <span>{p.staff
              ? <><b>Marble staff.</b> Your message goes straight to them.</>
              : <><b>Your first message arrives as a request.</b> {p.handle} sees it when they accept. Until then it's text only: trades and pages wait.</>}</span>
          </div>
        )}
      </div>
      {p && !p.mine && !closed && !p.staff && <p className="dm-quota">You can start 10 new conversations a day, 3 while your account is under 14 days old.</p>}
      {p && !p.mine && (
        <Composer w={w} disabled={closed} why={closed ? "Not taking new messages" : ""} canAttach={false}
          placeholder={`Message ${w.handle}`} onSend={send} onTrade={async () => false} onPage={() => {}} />
      )}
    </>
  );
}

function PagePicker({ w, onClose, onSent }) {
  const notebooks = useStore((s) => s.notebooks) || [];
  const pages = useStore((s) => s.pages) || [];
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const s = q.trim().toLowerCase();
  const nbTitle = Object.fromEntries(notebooks.map((n) => [n.id, n.title]));
  const list = pages.filter((p) => p.id && !String(p.id).startsWith("ex-") && nbTitle[p.notebookId] && (!s || `${p.title} ${nbTitle[p.notebookId]}`.toLowerCase().includes(s)))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 60);
  const numberOf = (p) => pages.filter((x) => x.notebookId === p.notebookId && (x.n < p.n || (x.n === p.n && String(x.createdAt) < String(p.createdAt)))).length + 1;
  const pick = async (p) => {
    setBusy(true);
    try {
      await source.sharePage({ notebookId: p.notebookId, pageId: p.id, audience: "members", members: [w.handle] });
      toast(`Shared with ${w.handle}. Stop sharing any time from the notebook.`);
      onSent();
    } catch (e) { toast(errText(e, "Couldn't share that page. Try again."), { warn: true }); }
    setBusy(false);
  };
  return (
    <Sheet title="Share a page" sub={`Read-only, for ${w.handle} only. Lines, times, key lessons and the lesson; never photos or trades.`} className="dm-sheet" onClose={onClose}>
      {pages.length > 0 && (
        <label className="search">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page" aria-label="Find a page" data-autofocus />
        </label>
      )}
      <div className="dm-pages">
        {list.map((p) => (
          <button type="button" key={p.id} className="dm-page-row" disabled={busy} onClick={() => pick(p)}>
            <Ico name="book" size={16} />
            <span><b>{p.title || "Untitled"}</b><span>{nbTitle[p.notebookId]} · page {numberOf(p)} · {(p.lines || []).length} lines</span></span>
            <Icon name="chevR" size={14} />
          </button>
        ))}
        {!pages.length && <p className="dm-fine">Your notebooks have no pages yet. Write one in Study, then share it here.</p>}
        {pages.length > 0 && !list.length && <p className="dm-fine">No page matches “{q}”.</p>}
      </div>
    </Sheet>
  );
}

/* ---------- Report and block ---------- */

const REASONS = [
  ["scam", "A scam, or asking for money or card details"],
  ["staff", "Pretending to be Marble staff or Jules"],
  ["selling", "Selling, spam or signals"],
  ["abuse", "Abuse or harassment"],
  ["other", "Something else"],
];

function ReportSheet({ w, messages, message, pick = "scam", onClose, onDone }) {
  const { me } = useCm();
  const [reason, setReason] = useState(pick);
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const evidence = message ? evidenceOf(messages, message.id) : [];
  const send = async () => {
    if (!message) return;
    setBusy(true);
    try {
      await source.dmReport(message.id, reason, { block });
      toast(block ? `Reported and blocked. A moderator will read it, and ${w.handle} isn't told.` : "Reported. A moderator will read it.");
      onDone(block);
    } catch (e) { toast(errText(e, "Couldn't send that report. Try again."), { warn: true }); setBusy(false); }
  };
  return (
    <Sheet title={`Report ${w.handle}`} sub="A moderator reads what you send and decides what happens next." className="dm-sheet" onClose={onClose}
      foot={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn" disabled={busy || !message} onClick={send}>{busy ? "Sending…" : "Send report"}</button></>}>
      <fieldset className="dm-reasons">
        <legend className="dm-sheet-label">What's wrong?</legend>
        {REASONS.map(([k, l]) => (
          <label key={k} className={`dm-radio ${reason === k ? "on" : ""}`}>
            <input type="radio" name="dm-reason" checked={reason === k} onChange={() => setReason(k)} /><i aria-hidden="true" /><span>{l}</span>
          </label>
        ))}
      </fieldset>
      <div className="dm-sheet-label">What the moderator sees</div>
      <ul className="dm-evidence">
        {evidence.map((m) => (
          <li key={m.id} className={m.reported ? "reported" : ""}>
            <span className="dm-ev-who"><b>{m.mine ? me?.handle || "you" : w.handle}</b><span className="num">{timeOf(m)}</span></span>
            <span className="dm-ev-body">{m.body || (m.card ? (m.card.type === "page" ? "A Study page" : "A trade card") : "")}</span>
            {m.reported && <span className="dm-ev-tag">Reported</span>}
          </li>
        ))}
      </ul>
      <p className="dm-fine">Only {evidence.length === 1 ? "this message is" : `these ${evidence.length} messages are`} sent, with names and times. Nothing else in this conversation is shared, and {w.handle} isn't told who reported.</p>
      <label className={`dm-check ${block ? "on" : ""}`}><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /><i aria-hidden="true">{block && <Icon name="check" size={12} />}</i><span>Block {w.handle} too</span></label>
    </Sheet>
  );
}

function BlockSheet({ w, last, onClose, onDone }) {
  const [report, setReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      if (report && last) await source.dmReport(last.id, "other", { block: true });
      else await source.dmBlock(w.handle);
      toast(`Blocked ${w.handle}. They aren't told.`);
      onDone();
    } catch (e) { toast(errText(e, "Couldn't block just now. Try again."), { warn: true }); setBusy(false); }
  };
  return (
    <Sheet title={`Block ${w.handle}?`} sub="Blocking is quiet: nobody is told." className="dm-sheet" onClose={onClose}
      foot={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn" disabled={busy} onClick={go}>{busy ? "Blocking…" : `Block ${w.handle}`}</button></>}>
      <ul className="dm-bullets">
        <li><Ico name="block" size={16} /><span><b>{w.handle} can't message you</b> or send you a request again.</span></li>
        <li><Ico name="eyeOff" size={16} /><span><b>Shared pages close, both ways.</b> And their posts and chat messages stop showing for you.</span></li>
        <li><Ico name="inbox" size={16} /><span><b>This conversation leaves your list.</b> Unblock any time in Message settings.</span></li>
      </ul>
      {last && <label className={`dm-check ${report ? "on" : ""}`}><input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} /><i aria-hidden="true">{report && <Icon name="check" size={12} />}</i><span>Also report their last messages</span></label>}
    </Sheet>
  );
}

const FROM = [["everyone", "Everyone", "Anyone signed in to Marble, as a request you accept or ignore"], ["crew", "Only my crew", "Traders in your crew. Everyone else can't send a request."], ["nobody", "Nobody new", "No new requests. Your conversations carry on."]];

function SettingsSheet({ onClose }) {
  const { dm } = useCm();
  const s = useLoad(() => source.dmSettings(), []);
  const blocked = useLoad(() => source.dmBlocked(), []);
  const set = async (from, email) => {
    try { s.set(await source.dmSettings(from, email)); dm.reload(); }
    catch (e) { toast(errText(e), { warn: true }); }
  };
  const unblock = async (h) => {
    try { await source.dmUnblock(h); blocked.set((xs) => xs.filter((x) => x.handle !== h)); toast(`Unblocked ${h}`); dm.reload(); }
    catch (e) { toast(errText(e), { warn: true }); }
  };
  const v = s.data;
  return (
    <Sheet title="Message settings" sub="Who can reach you, and how you hear about it." className="dm-sheet" onClose={onClose}
      foot={<button type="button" className="btn" onClick={onClose}>Done</button>}>
      <fieldset className="dm-reasons">
        <legend className="dm-sheet-label">Who can send you message requests</legend>
        {FROM.map(([k, l, d]) => (
          <label key={k} className={`dm-radio two ${v?.from === k ? "on" : ""}`}>
            <input type="radio" name="dm-from" checked={v?.from === k} disabled={!v} onChange={() => set(k, null)} /><i aria-hidden="true" />
            <span><b>{l}</b><span>{d}</span></span>
          </label>
        ))}
      </fieldset>
      <p className="dm-fine">Marble staff can reach you whichever you choose, and always carry the staff seal.</p>
      <label className="sh-switchrow">
        <span><b>Email me about new messages</b><span>"You have a new message on Marble", at most every few hours. Never what was written.</span></span>
        <input type="checkbox" className="sr-only" checked={!!v?.email} disabled={!v} onChange={(e) => set(null, e.target.checked)} />
        <span className={`sh-switch ${v?.email ? "on" : ""}`} aria-hidden="true"><i /></span>
      </label>
      <div className="dm-sheet-label">Blocked</div>
      {blocked.data && !blocked.data.length && <p className="dm-fine">Nobody. Block someone from their conversation, and they're listed here.</p>}
      {(blocked.data || []).map((b) => (
        <div key={b.handle} className="dm-blocked-row">
          <Person who={b} size={28} /><Handle who={b} chip={false} />
          <span className="cm-grow" />
          <button type="button" className="btn ghost sm" onClick={() => unblock(b.handle)}>Unblock</button>
        </div>
      ))}
      <p className="dm-fine">{SAFETY} Messages are kept for 12 months. <a className="link" href={`${LEGAL}#privacy`}>How messages are kept</a></p>
    </Sheet>
  );
}

/* ---------- The panel ---------- */

export function DmPanel({ sel, narrow, head, onPick }) {
  if (sel === "dm-requests") return <Requests narrow={narrow} onPick={onPick} />;
  if (sel.startsWith("dm-new")) return <NewMessage key={sel} handle={sel.slice(7)} narrow={narrow} onPick={onPick} />;
  if (sel.startsWith("dm:")) return <Thread key={sel} id={sel.slice(3)} narrow={narrow} onPick={onPick} />;
  return <List head={head} onPick={onPick} />;
}
