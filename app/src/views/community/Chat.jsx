import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { LEGAL, VOICE_LIVE } from "../../mode";
import { toast } from "../../store";
import { Linked } from "../../live/Community";
import { CREW_ORDER, GENERAL_ABOUT, ROOM_GENERAL, TOPICS, roomName } from "./houses";
import { useCm, useLoad } from "./context";
import { cardOf } from "./mine";
import { errText, roomSeen, source } from "./source";
import { TradePicker } from "./Feed";
import { Av, Crest, No, Note, ReportPicker, Tag, TradeCard, clock, dayLabel, useMedia } from "./parts";
import { Ico, Sheet } from "./dmParts";
import { DmPanel } from "./Messages";
import { unreadTotal } from "./dms";
import { OnAirMark, ScheduleSheet, Show, VIco, VoiceStrip } from "./voice/OnAir";
import VoiceSoon from "./voice/VoiceSoon";
import { phaseOf, sessionFor } from "./voice/rules";
import { useVoice } from "./voice/engine";

const timeOf = (m) => m.time || (m.at ? clock(m.at) : "");
const dayOf = (m) => (m.at ? dayLabel(m.at) : "Today");
const grouped = (m, prev) => {
  if (!prev || m.team || prev.team || prev.author?.handle !== m.author?.handle || dayOf(prev) !== dayOf(m)) return false;
  if (m.at && prev.at) return Date.parse(m.at) - Date.parse(prev.at) < 5 * 60e3;
  return prev.time === m.time;
};

function Message({ m, prev, byId, open, onOpen, onReply, onRemove }) {
  const { personCard } = useCm();
  const [reporting, setReporting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(false), 4000); return () => clearTimeout(t); }, [confirm]);
  const g = grouped(m, prev);
  const quoted = m.replyTo ? byId.get(m.replyTo) : null;
  const report = async (reason) => {
    setReporting(false);
    try { await source.report({ messageId: m.id }, reason); toast("Reported. A moderator will look at it."); }
    catch (err) { toast(errText(err, "Couldn't send that report. Try again."), { warn: true }); }
  };
  const remove = async () => {
    if (!confirm) { setConfirm(true); return; }
    try { await source.removeMessage(m.id); onRemove(m.id); } catch (err) { toast(errText(err, "Couldn't delete that."), { warn: true }); }
  };
  return (
    <div className={`cm-msg ${g ? "grouped" : ""} ${m.fresh ? "fresh" : ""} ${m.team ? "team" : ""} ${open || reporting ? "open" : ""}`}
      onClick={(e) => { if (!m.team && !e.target.closest("button, a, input")) onOpen(); }}>
      {g ? <span className="cm-msg-gutter" /> : m.team ? <Av team size={30} /> : <Av who={m.author} size={30} />}
      <div className="cm-msg-main">
        {!g && (
          <div className="cm-msg-head">
            {m.team || m.mine || !m.author?.handle
              ? <b>{m.team ? "Marble" : m.author?.handle || "trader"}</b>
              : <button type="button" className="dm-post-name" onClick={(e) => personCard(m.author.handle, e.currentTarget)}><b>{m.author.handle}</b></button>}
            {!m.team && <No n={m.author?.no} />}
            {m.team ? <span className="chip">Team</span> : <Tag crew={m.crew} />}
            <span className="cm-msg-time num">{timeOf(m)}</span>
          </div>
        )}
        {m.replyTo && <div className="cm-msg-quote"><Icon name="chevR" size={11} /> replying to <b>{quoted?.author?.handle || "a message"}</b></div>}
        <p className="cm-msg-body"><Linked text={m.body} /></p>
        <TradeCard t={m.trade} />
        {reporting && <div className="cm-msg-report"><ReportPicker onPick={report} onCancel={() => setReporting(false)} /></div>}
      </div>
      {!m.team && !reporting && (
        <span className="cm-msg-tools">
          <button type="button" onClick={() => onReply(m)} aria-label={`Reply to ${m.author?.handle || "this message"}`}><Icon name="chat" size={13} /><span>Reply</span></button>
          {m.mine
            ? <button type="button" onClick={remove} aria-label="Delete this message"><Icon name="trash" size={13} /><span>{confirm ? "Tap again" : "Delete"}</span></button>
            : <button type="button" onClick={() => setReporting(true)} aria-label="Report this message"><Icon name="flag" size={13} /><span>Report</span></button>}
        </span>
      )}
    </div>
  );
}

// Every room you can open, in the order the lists show them
function roomsOf(crew) {
  const general = { id: ROOM_GENERAL, name: "General", sub: "Everyone", about: GENERAL_ABOUT };
  const mine = crew ? { id: crew, name: roomName(crew), sub: "Your crew", about: `Your crew's own room. Only ${roomName(crew)} can read it.`, crew } : null;
  const topics = TOPICS.map((t) => ({ ...t, topic: true }));
  return { general, mine, topics, all: [general, ...(mine ? [mine] : []), ...topics] };
}
const RoomIcon = ({ x, size = 20 }) => (x.voice ? <span className="oa-mic"><VIco name="mic" size={size >= 20 ? 18 : 16} /></span>
  : x.crew ? <Crest crew={x.crew} size={size} /> : <span className={`cm-hash ${size >= 20 ? "big" : ""}`}>#</span>);
const VOICE_SOON = { id: "voice", name: "Voice sessions", sub: "Coming soon", about: "Coming soon: live sessions with a host.", voice: true };

function RoomRow({ x, on, count, sub, live, onPick }) {
  return (
    <button type="button" className={`cm-room ${x.topic ? "topic" : ""} ${sub || live ? "two" : ""} ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onPick(x.id)}>
      <RoomIcon x={x} size={x.topic ? 16 : 20} />
      <span className="cm-room-text"><b>{x.name}</b>{live ? <span className="oa-rail-live"><OnAirMark small />{live.title}</span> : sub && <span>{sub}</span>}</span>
      {count > 0 && !on && <span className="cm-count num">{count}</span>}
    </button>
  );
}

function RoomGroups({ rooms, room, here, about, onPick }) {
  const { go, unread, voice } = useCm();
  const live = (id) => (VOICE_LIVE ? (voice?.data?.sessions || []).find((s) => s.room === id && phaseOf(s) === "live") : null);
  const row = (x, sub) => <RoomRow key={x.id} x={x} on={room === x.id} count={unread[x.id]} sub={sub} live={live(x.id)} onPick={onPick} />;
  const hereOn = (x) => (room === x.id && here > 0 ? ` · ${here} here` : "");
  return (
    <>
      <span className="caps faint cm-rooms-label">Rooms</span>
      {row(rooms.general, about ? rooms.general.about : `Everyone${hereOn(rooms.general)}`)}
      {rooms.mine ? row(rooms.mine, about ? rooms.mine.about : `Your crew${hereOn(rooms.mine)}`) : (
        <button type="button" className="cm-room cm-room-join two" onClick={() => go("crews")}>
          <span className="cm-room-crests" aria-hidden="true">{CREW_ORDER.map((t) => <Crest key={t} crew={t} size={14} />)}</span>
          <span className="cm-room-text"><b>Your crew's room</b><span>Join a crew to open it</span></span>
        </button>
      )}
      <div className="dm-sec cm-sec"><span className="caps faint">Topics</span></div>
      {rooms.topics.map((x) => row(x, about ? x.about : null))}
      {!VOICE_LIVE && (
        <>
          <div className="dm-sec cm-sec"><span className="caps faint">Voice</span></div>
          {row(VOICE_SOON, about ? VOICE_SOON.about : VOICE_SOON.sub)}
        </>
      )}
    </>
  );
}

function ChatPanel({ r, head, here, extraHead, strip }) {
  const { me } = useCm();
  const room = r.id;
  const list = useLoad(() => source.chat(room), [room]);
  const [text, setText] = useState("");
  const [trade, setTrade] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const scroller = useRef(null);
  const nearBottom = useRef(true);
  const input = useRef(null);
  const messages = list.data || [];
  const byId = new Map(messages.map((m) => [m.id, m]));

  // Live: new messages arrive, deleted ones go
  useEffect(() => {
    roomSeen(room);
    setReplyTo(null);
    here.set(0);
    return source.listen(room, {
      onInsert: (m) => { list.set((xs) => (!xs || xs.some((x) => x.id === m.id) ? xs : [...xs, { ...m, fresh: true }])); roomSeen(room); },
      onDelete: (id) => list.set((xs) => xs?.filter((x) => x.id !== id)),
      onHere: here.set,
    });
  }, [room]);
  useEffect(() => {
    const again = () => {
      if (document.hidden) return;
      source.chat(room).then((got) => list.set((xs) => {
        if (!xs) return got;
        const seen = new Set(xs.map((x) => x.id));
        const added = got.filter((m) => !seen.has(m.id)).map((m) => ({ ...m, fresh: true }));
        return added.length ? [...xs, ...added].sort((a, b) => (a.at && b.at ? Date.parse(a.at) - Date.parse(b.at) : 0)) : xs;
      })).catch(() => {});
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    return () => { document.removeEventListener("visibilitychange", again); window.removeEventListener("online", again); };
  }, [room]);
  // Stay at the newest message while you're reading the newest
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, room]);
  useEffect(() => { nearBottom.current = true; }, [room]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const m = await source.send(room, { body: text.trim(), tradeId: trade?.id, card: trade ? cardOf(trade) : null, replyTo: replyTo?.id || null });
      nearBottom.current = true;
      list.set((xs) => (xs?.some((x) => x.id === m.id) ? xs : [...(xs || []), m]));
      setText(""); setTrade(null); setReplyTo(null);
    } catch (err) { toast(errText(err, "Couldn't send that. Check your connection and try again."), { warn: true }); }
    setBusy(false);
    input.current?.focus();
  };
  return (
    <section className="card cm-chat">
      <div className="cm-chat-head">
        {head}
        <div className="cm-chat-title">
          <RoomIcon x={r} />
          <span className="cm-chat-name"><b>{r.name}</b><span className="cm-chat-about">{r.about}</span></span>
        </div>
        {here.value > 0 && <span className="cm-here"><i className="cm-live-dot" aria-hidden="true" />{here.value} here</span>}
        {extraHead}
      </div>
      {strip}
      <div className="cm-chat-scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} aria-live="polite" aria-relevant="additions">
        {list.loading && !list.data && <Note>Loading the room…</Note>}
        {list.error && !list.data && <Note retry={list.reload}>Couldn't load the room.</Note>}
        {list.data && !messages.length && <Note>No messages in the last 90 days. Say hello.</Note>}
        {messages.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || dayOf(messages[i - 1]) !== dayOf(m)) && <div className="cm-day"><span>{dayOf(m)}</span></div>}
            <Message m={m} prev={messages[i - 1]} byId={byId} open={openId === m.id} onOpen={() => setOpenId(openId === m.id ? null : m.id)}
              onReply={(x) => { setReplyTo(x); setOpenId(null); input.current?.focus(); }} onRemove={(id) => list.set((xs) => xs.filter((x) => x.id !== id))} />
          </Fragment>
        ))}
      </div>
      {(replyTo || trade) && (
        <div className="cm-compose-extra">
          {replyTo && <span className="cm-replying"><Icon name="chevR" size={11} /> Replying to <b>{replyTo.author?.handle}</b><button type="button" className="icon-btn sm" aria-label="Cancel the reply" onClick={() => setReplyTo(null)}><Icon name="close" size={12} /></button></span>}
          {trade && <span className="cm-attached sm"><TradeCard t={cardOf(trade)} /><button type="button" className="icon-btn sm" aria-label="Remove the trade" onClick={() => setTrade(null)}><Icon name="close" size={12} /></button></span>}
        </div>
      )}
      <form className="cm-composer" onSubmit={send}>
        <span className="cm-attach-wrap up">
          <button type="button" className="icon-btn" aria-label="Attach a trade from your journal" aria-expanded={picking} onClick={() => setPicking(!picking)}><Icon name="chart" size={16} /></button>
          {picking && <TradePicker onPick={(t) => { setTrade(t); setPicking(false); input.current?.focus(); }} onClose={() => setPicking(false)} />}
        </span>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label={`Message ${r.name}`} placeholder={`Say hello in ${r.name}`} />
        <button type="submit" className="cm-send" aria-label="Send" disabled={!text.trim() || busy}><Icon name="send" size={16} /></button>
      </form>
      <span className="sr-only">{me?.handle ? `You're chatting as ${me.handle}.` : ""}</span>
    </section>
  );
}

export default function Chat() {
  const { crew, unread, chatRoom, setChatRoom, dm, voice } = useCm();
  const rooms = roomsOf(crew);
  const inDm = String(chatRoom).startsWith("dm");
  // Voice sessions, coming soon (./voice/VoiceSoon.jsx)
  const inVoice = !VOICE_LIVE && chatRoom === VOICE_SOON.id;
  const r = inDm || inVoice ? null : rooms.all.find((x) => x.id === chatRoom) || rooms.general;
  const dmCount = unreadTotal(dm.data?.threads);
  const [here, setHere] = useState(0);
  const [sheet, setSheet] = useState(false);
  const pick = (id) => { setSheet(false); setChatRoom(id); };
  const elsewhere = rooms.all.reduce((n, x) => n + (x.id !== r?.id ? unread[x.id] || 0 : 0), 0);

  const sessions = VOICE_LIVE ? voice?.data?.sessions || [] : [];
  const v = useVoice();
  const phone = useMedia("(max-width: 640px)");
  const [pane, setPane] = useState({}); // room -> "show" | "chat"
  const [scheduling, setScheduling] = useState(false);
  const show = r ? sessionFor(sessions, r.id) : null;
  const paneOf = show ? pane[r.id] || (phaseOf(show) === "live" ? "show" : "chat") : "chat";
  const toShow = (id) => setPane((p) => ({ ...p, [id]: "show" }));
  const toChat = (id) => setPane((p) => ({ ...p, [id]: "chat" }));
  const tuned = VOICE_LIVE && v.status === "on" ? v.session : null;
  const owner = VOICE_LIVE && !!(voice?.data?.me?.admin && voice?.data?.me?.staff);
  const extraHead = r && (
    <>
      {show && (
        <span className="cm-seg oa-switch" role="group" aria-label="This room">
          <button type="button" aria-pressed={paneOf === "show"} onClick={() => toShow(r.id)}><OnAirMark soon={phaseOf(show) !== "live"} small /></button>
          <button type="button" aria-pressed={paneOf === "chat"} onClick={() => toChat(r.id)}>Chat</button>
        </span>
      )}
      {owner && <button type="button" className="icon-btn oa-sched" aria-label="Schedule a voice session" title="Schedule a voice session" onClick={() => setScheduling(true)}><Icon name="calendar" size={16} /></button>}
    </>
  );
  const strip = tuned && (tuned.room !== r?.id || paneOf === "chat")
    ? <VoiceStrip s={tuned} onOpen={() => { toShow(tuned.room); pick(tuned.room); }} />
    : show && paneOf === "chat" ? <VoiceStrip s={show} invite onOpen={() => toShow(r.id)} /> : null;

  const switcher = (x) => (
    <span className="cm-switch-row">
      <button type="button" className="cm-room-switch" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
        {x ? <RoomIcon x={x} size={18} /> : <Icon name="mail" size={17} />}
        <span className="cm-switch-text">
          <b>{x ? x.name : "Messages"}<Ico name="chevD" size={15} />{elsewhere > 0 && <span className="cm-count num" aria-label={`${elsewhere} new in other rooms`}>{elsewhere}</span>}</b>
          {x && <span>{x.about}</span>}
        </span>
      </button>
      {x && (
        <button type="button" className="cm-head-mail" aria-label={`Messages${dmCount ? `, ${dmCount} unread` : ""}`} onClick={() => pick("dm-list")}>
          <Icon name="mail" size={16} /><span>Messages</span>{dmCount > 0 && <span className="cm-count num">{dmCount}</span>}
        </button>
      )}
    </span>
  );

  useEffect(() => {
    document.documentElement.classList.add("cm-chat-on");
    return () => document.documentElement.classList.remove("cm-chat-on");
  }, []);
  // The sentence above wraps differently at each width, so the room is sized from where it really starts
  const box = useRef(null);
  useLayoutEffect(() => {
    const fit = () => box.current?.style.setProperty("--chat-top", `${Math.round(box.current.getBoundingClientRect().top + window.scrollY)}px`);
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="cm-chat-full" ref={box}>
      <aside className="card cm-rooms dm-rail">
        <div className="cm-rooms-scroll">
          <button type="button" className={`cm-room two ${inDm ? "on" : ""}`} onClick={() => pick("dm-list")}>
            <Icon name="mail" size={18} />
            <span className="cm-room-text"><b>Messages</b><span>Your conversations</span></span>
            {dmCount > 0 && <span className="cm-count num">{dmCount}</span>}
          </button>
          <RoomGroups rooms={rooms} room={inVoice ? VOICE_SOON.id : r?.id} here={here} onPick={pick} />
        </div>
        <a className="cm-rooms-rules" href={`${LEGAL}#community`}>Community rules</a>
      </aside>
      {inDm
        ? <section key={chatRoom} className={`card cm-chat dm-panel ${chatRoom === "dm-list" ? "list" : ""}`}><DmPanel sel={chatRoom} narrow onPick={pick}
            head={<div className="cm-chat-head dm-pills-head">{switcher(null)}<b className="dm-list-title">Messages</b></div>} /></section>
        : inVoice
          ? <section key="voice-soon" className="card cm-chat oa-panel">
              <VoiceSoon phone={phone}
                head={(
                  <div className="cm-chat-head">
                    {switcher(VOICE_SOON)}
                    <div className="cm-chat-title"><RoomIcon x={VOICE_SOON} /><span className="cm-chat-name"><b>{VOICE_SOON.name}</b><span className="cm-chat-about">{VOICE_SOON.about}</span></span></div>
                  </div>
                )} />
            </section>
        : show && paneOf === "show"
          ? <section key={`show-${show.id}`} className="card cm-chat oa-panel">
              <Show session={show} phone={phone} onFold={() => toChat(r.id)}
                head={(
                  <div className="cm-chat-head">
                    {switcher(r)}
                    <div className="cm-chat-title"><RoomIcon x={r} /><span className="cm-chat-name"><b>{r.name}</b><span className="cm-chat-about">{r.about}</span></span></div>
                    {extraHead}
                  </div>
                )} />
            </section>
          : <ChatPanel key={r.id} r={r} head={switcher(r)} here={{ value: here, set: setHere }} extraHead={extraHead} strip={strip} />}
      {scheduling && <ScheduleSheet room={r?.id || ROOM_GENERAL} onClose={() => setScheduling(false)} onDone={() => voice?.reload?.()} />}
      {sheet && (
        <Sheet title="Rooms" className="dm-sheet cm-rooms-sheet" onClose={() => setSheet(false)}>
          <div className="cm-rooms-list">
            <RoomGroups rooms={rooms} room={inVoice ? VOICE_SOON.id : r?.id} here={here} about onPick={pick} />
            <div className="dm-sec cm-sec"><span className="caps faint">Messages</span></div>
            <button type="button" className={`cm-room two ${inDm ? "on" : ""}`} onClick={() => pick("dm-list")}>
              <Icon name="mail" size={18} />
              <span className="cm-room-text"><b>Messages</b><span>Your conversations and message requests</span></span>
              {dmCount > 0 && <span className="cm-count num">{dmCount}</span>}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
