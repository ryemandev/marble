import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getState, loadState, setState, useOwnStore, useStore } from "../store";
import { BOARDS, LIVE, VOICE_LIVE } from "../mode";
import { art } from "../data";
import { Icon } from "../components/ui";
import Cards from "../drip/floor/Cards";
import Ideas from "./Ideas";
import "./community.css";
import "./community/community.css";
import { CommunityContext, useLoad } from "./community/context";
import { source } from "./community/source";
import { useMine } from "./community/mine";
import { ROOM_GENERAL, TOPIC_IDS } from "./community/houses";
import Feed from "./community/Feed";
import Chat from "./community/Chat";
import Crews from "./community/Crews";
import Events from "./community/Events";
import PersonCard from "./community/PersonCard";
import Viewer from "./community/Viewer";
import { unreadTotal } from "./community/dms";
import "../drip/floor/floor-screen.css";
import LiveBand from "../drip/hub/LiveBand";
import LivePanel from "../drip/hub/LivePanel";
import NowRow from "../drip/hub/NowRow";
import Spaces from "../drip/hub/Spaces";
import { useHub } from "../drip/hub/useHub";
import "../drip/hub/hub.css";

// The Floor: a live band on top, every space down the left (a row of pills on a phone), the feed or the
// space in the middle, and what's happening now on the right. Events only shows while there is one.
const TABS = ["feed", "chat", "crews", "cards"];
const PAGES = { events: "Events", ideas: "Ideas" };
const tabOf = (t) => {
  if (TABS.includes(t) || PAGES[t]) return t;
  return t === "leaderboards" || t === "top" ? "crews" : "feed";
};

export default function Community({ go: appGo }) {
  const [tab, setTab] = useState(() => tabOf(getState().communityTab));
  const wantTab = useStore((st) => st.communityTab);
  useEffect(() => { if (wantTab) { setTab(tabOf(wantTab)); setState({ communityTab: null }); } }, [wantTab]);
  const [chatRoom, setChatRoom] = useState(() => getState().communityRoom || ROOM_GENERAL);
  const wantRoom = useStore((st) => st.communityRoom);
  useEffect(() => { if (wantRoom) { setTab("chat"); setChatRoom(wantRoom); setState({ communityRoom: null }); } }, [wantRoom]);
  const voice = useLoad(() => (VOICE_LIVE ? source.voiceNow() : { me: {}, sessions: [] }), []);
  useEffect(() => {
    if (!LIVE || !VOICE_LIVE) return;
    const t = setInterval(() => { if (!document.hidden) voice.reload(); }, 60000);
    return () => clearInterval(t);
  }, []);
  const onAirNow = (voice.data?.sessions || []).some((s) => s.phase === "live");
  const [card, setCard] = useState(null); // { handle, anchor }
  const [viewer, setViewer] = useState(null); // { share, n }

  const dm = useLoad(() => source.dmInbox(), []);
  const dmReload = dm.reload;
  useEffect(() => {
    let t = 0;
    const off = source.dmWatch(() => { clearTimeout(t); t = setTimeout(dmReload, 400); });
    return () => { clearTimeout(t); off(); };
  }, []);
  const dmUnread = unreadTotal(dm.data?.threads);
  // The same count sits on the Community tab in the top bar
  useEffect(() => { if (dm.data) loadState({ dmUnread }); }, [dmUnread, !!dm.data]);
  const [eventId, setEventId] = useState(null);

  const profile = useOwnStore((s) => s.profile);
  const me = useMemo(() => ({ handle: profile.handle || "you", name: profile.name, avatar: profile.avatar || (profile.avatarArt ? art(profile.avatarArt, 160) : null) }), [profile]);
  const mine = useMine("month");
  const mineRef = useRef(null);
  mineRef.current = { handle: me.handle, avatar: me.avatar, cover: mine.cover, days: mine.all };
  const mineFor = useCallback(() => mineRef.current, []);

  const cup = useLoad(() => source.houseCup("month", { mine: mineFor() }), []);
  const board = useLoad(() => (BOARDS ? source.board({ period: "month", order: "board", mine: mineFor() }) : { rows: [] }), []);
  const events = useLoad(() => source.events(), []);
  const crew = cup.data?.mine?.crew ?? null;
  const hub = useHub({ crew, voice, events });
  // Events is only a page while there is one
  useEffect(() => {
    if (tab === "events" && events.data && !(events.data.competitions?.length || events.data.giveaways?.length)) setTab("crews");
  }, [tab, events.data]);

  const [unread, setUnread] = useState({});
  const checkUnread = useCallback(() => {
    const rooms = [ROOM_GENERAL, ...(crew ? [crew] : []), ...TOPIC_IDS];
    Promise.all(rooms.map((r) => source.unread(r).catch(() => 0))).then((ns) => setUnread(Object.fromEntries(rooms.map((r, i) => [r, ns[i]]))));
  }, [crew]);
  useEffect(() => {
    checkUnread();
    if (!LIVE) return;
    const t = setInterval(() => { if (!document.hidden) checkUnread(); }, 60000);
    return () => clearInterval(t);
  }, [checkUnread]);

  const go = useCallback((to, opts = {}) => {
    if (opts.room) setChatRoom(opts.room);
    if (to === "events") setEventId(opts.event || null);
    setViewer(null);
    setTab(tabOf(to));
    document.querySelector(".main-scroll")?.scrollTo({ top: 0 });
  }, []);
  // Opening a room reads it
  useEffect(() => { if (tab === "chat") setUnread((u) => ({ ...u, [chatRoom]: 0 })); }, [tab, chatRoom]);

  const ctx = {
    go, me, crew, cup, board, events, unread, mineFor, dm, appGo, voice, hub,
    chatRoom, setChatRoom: (r) => { setChatRoom(r); setUnread((u) => ({ ...u, [r]: 0 })); },
    openDm: (sel) => { setCard(null); setChatRoom(sel); go("chat"); },
    personCard: (handle, anchor) => { if (handle && handle !== me.handle) setCard({ handle, anchor }); },
    viewShare: (share, n = 1) => { setCard(null); setViewer({ share, n }); document.querySelector(".main-scroll")?.scrollTo({ top: 0 }); },
    eventId, openEvent: setEventId,
    refreshCrew: async () => { await cup.reload(); board.reload(); },
    refreshBoard: () => { board.reload(); cup.reload(); },
  };

  const chatCount = Object.values(unread).reduce((a, n) => a + (n || 0), 0) + dmUnread;
  const hasEvents = !!(events.data?.competitions?.length || events.data?.giveaways?.length);

  const cardLayer = card && <PersonCard key={card.handle} handle={card.handle} anchor={card.anchor} onClose={() => setCard(null)} onMessage={ctx.openDm} />;
  if (viewer) {
    return (
      <CommunityContext.Provider value={ctx}>
        <Viewer key={viewer.share} share={viewer.share} start={viewer.n} onBack={() => setViewer(null)} />
        {cardLayer}
      </CommunityContext.Provider>
    );
  }

  return (
    <CommunityContext.Provider value={ctx}>
      {cardLayer}
      <div className={`view cm-view fl-view fl-hub ${tab === "chat" ? "cm-chat-view" : ""}`}>
        {tab === "feed" && <LiveBand />}
        <div className="hub-grid">
          <Spaces tab={tab} chatCount={chatCount} dmUnread={dmUnread} hasEvents={hasEvents} onAir={onAirNow || !!hub.air.live} />
          <div className="hub-centre">
            {tab === "feed" && <NowRow />}
            {PAGES[tab] && !eventId && <button type="button" className="fl-back" onClick={() => go("feed")}><Icon name="chevL" size={18} /> Floor</button>}
            <div className="cm-body swap" key={tab}>
              {tab === "feed" && <Feed />}
              {tab === "chat" && <Chat />}
              {tab === "crews" && <Crews />}
              {tab === "cards" && <Cards />}
              {tab === "events" && <Events />}
              {tab === "ideas" && <div className="fl-page"><Ideas /></div>}
            </div>
          </div>
          {(tab === "feed" || tab === "chat") && <LivePanel rooms={tab === "feed"} />}
        </div>
      </div>
    </CommunityContext.Provider>
  );
}
