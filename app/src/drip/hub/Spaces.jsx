import { useEffect, useRef } from "react";
import { Icon } from "../../components/ui";
import { LEGAL, VOICE_LIVE } from "../../mode";
import { GENERAL_ABOUT, ROOM_GENERAL, TOPICS, roomName } from "../../views/community/houses";
import { useCm } from "../../views/community/context";
import { Crest } from "../../views/community/parts";
import { VIco } from "../../views/community/voice/OnAir";

const Num = ({ n }) => (n > 0 ? <span className="cm-count num" aria-label={`${n} unread`}>{n}</span> : null);

function Room({ id, name, icon, sub, on, unread, here, onPick }) {
  return (
    <button type="button" className={`cm-room hub-room ${on ? "on" : ""}`} aria-pressed={on} title={sub} onClick={() => onPick(id)}>
      <span className="hub-room-mark" aria-hidden="true">{icon || "#"}</span>
      <span className="cm-room-text"><b>{name}</b></span>
      {here > 0 && !unread && <span className="hub-room-here num">{here}</span>}
      {!on && <Num n={unread} />}
    </button>
  );
}

// Every space on the Floor. On a wide screen it's the left column, on a phone the first row of pills.
export default function Spaces({ tab, chatCount, dmUnread, hasEvents, onAir }) {
  const { go, crew, unread, chatRoom, hub, setChatRoom } = useCm();
  const here = hub.hereIn;
  const spaces = [
    ["feed", "Feed", "list"],
    ["chat", "Chat", "chat", tab === "chat" ? 0 : chatCount],
    ["crews", "Your crew", "trophy"],
    ["cards", "Your cards", "wallet"],
    ...(hasEvents ? [["events", "Events", "calendar"]] : []),
    ["ideas", "Ideas", "bulb"],
  ];
  const inChat = tab === "chat";
  const pick = (id) => { setChatRoom(id); go("chat", { room: id }); };
  // On a phone the pill you're on stays in view
  const row = useRef(null);
  useEffect(() => {
    const el = row.current, on = el?.querySelector(".on");
    if (!on || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2 });
  }, [tab]);
  return (
    <nav className="hub-nav fl-top" aria-label="Floor">
      <div className="subtabs" ref={row} role="tablist" aria-label="Floor spaces">
        {spaces.map(([k, label, icon, n]) => (
          <button key={k} type="button" role="tab" data-k={k} aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => go(k)}>
            <Icon name={icon} size={17} /><span>{label}</span><Num n={n} />
            {k === "chat" && !n && onAir && <i className="cm-live-dot" aria-label="a voice session is on air" />}
          </button>
        ))}
      </div>
      <div className="hub-rooms cm-rooms">
        <button type="button" className={`cm-room hub-room ${inChat && String(chatRoom).startsWith("dm") ? "on" : ""}`} onClick={() => pick("dm-list")}>
          <span className="hub-room-mark" aria-hidden="true"><Icon name="mail" size={15} /></span>
          <span className="cm-room-text"><b>Messages</b></span>
          <Num n={dmUnread} />
        </button>
        <span className="hub-nav-label">Rooms</span>
        <Room id={ROOM_GENERAL} name="General" sub={GENERAL_ABOUT} on={inChat && chatRoom === ROOM_GENERAL} unread={unread[ROOM_GENERAL]} here={here[ROOM_GENERAL]} onPick={pick} />
        {crew
          ? <Room id={crew} name={roomName(crew)} sub="Your crew's own room" icon={<Crest crew={crew} size={17} />} on={inChat && chatRoom === crew} unread={unread[crew]} here={here[crew]} onPick={pick} />
          : <button type="button" className="cm-room hub-room" onClick={() => go("crews")}><span className="hub-room-mark" aria-hidden="true"><Icon name="plus" size={15} /></span><span className="cm-room-text"><b>Join a crew</b></span></button>}
        {TOPICS.map((t) => <Room key={t.id} id={t.id} name={t.name} sub={t.about} on={inChat && chatRoom === t.id} unread={unread[t.id]} here={here[t.id]} onPick={pick} />)}
        {!VOICE_LIVE && <Room id="voice" name="Voice sessions" icon={<VIco name="mic" size={14} />} sub="Coming soon" on={inChat && chatRoom === "voice"} onPick={pick} />}
        <a className="cm-rooms-rules" href={`${LEGAL}#community`}>Community rules</a>
      </div>
    </nav>
  );
}
