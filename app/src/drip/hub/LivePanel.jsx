import { useState } from "react";
import { Icon } from "../../components/ui";
import { VIco } from "../../views/community/voice/OnAir";
import { BOARDS, VOICE_LIVE } from "../../mode";
import { art } from "../../data";
import InkPicture from "../InkPicture";
import { CREWS } from "../../views/community/houses";
import { useCm, useLoad } from "../../views/community/context";
import { source } from "../../views/community/source";
import { ordinal } from "../../views/community/scoring";
import { placed } from "../../views/community/Boards";
import { Av, Crest, Seg } from "../../views/community/parts";
import { DueDate, Faces, closedWord, openPost } from "./parts";
import { shortBody } from "./money";

function Head({ title, children }) {
  return <header className="hub-p-head"><h3>{title}</h3>{children}</header>;
}

export function OnAirPanel() {
  const { hub, go } = useCm();
  const s = hub.air.live;
  if (!s) return null;
  const people = s.people.filter((p) => p.role);
  return (
    <section className="hub-p hub-p-air">
      <button type="button" onClick={() => go("chat", { room: VOICE_LIVE ? s.room : "voice" })}>
        <span className="hub-tile-kicker"><i className="cm-live-dot" aria-hidden="true" />On air now</span>
        <b>{s.title}</b>
        {s.blurb && <span className="hub-p-air-line">{s.blurb}</span>}
        <span className="hub-p-air-foot"><Faces people={people} size={26} max={4} /><span>{people.map((p) => p.handle).join(", ")}</span><VIco name="mic" size={16} /></span>
      </button>
    </section>
  );
}

export function RoomsNow({ max = 4 }) {
  const { hub, go } = useCm();
  const list = hub.roomsNow.slice(0, max);
  if (!list.length) return null;
  return (
    <section className="hub-p">
      <Head title="In the rooms now"><button type="button" className="hub-p-more" onClick={() => go("chat")}>All rooms</button></Head>
      <div className="hub-p-rooms">
        {list.map((r) => (
          <button type="button" key={r.id} className="hub-p-room" onClick={() => go("chat", { room: r.id })}>
            <span className="hub-p-room-top"><b>{r.name}</b>{r.here > 0 && <span className="num">{r.here} here</span>}</span>
            {r.last
              ? <span className="hub-p-room-line"><Av who={r.last.author} size={20} /><span><em>{r.last.author?.handle}</em> {shortBody(r.last.body, 62)}</span></span>
              : <span className="hub-p-room-line quiet">Quiet right now. Say the first thing.</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

export function BigDays({ max = 5 }) {
  const { hub, go } = useCm();
  const list = hub.days.slice(0, max);
  if (!list.length) return null;
  return (
    <section className="hub-p">
      <Head title="Days posted" />
      <ol className="hub-p-days">
        {list.map(({ post }) => {
          const anon = post.anonymous || !post.author;
          // Who posted and what about. The dollars stay on the post itself
          const what = post.trade?.sym || post.flex?.card?.title || null;
          const closed = anon ? null : closedWord(hub.closed[post.author.handle]);
          return (
            <li key={post.id}>
              <button type="button" onClick={() => openPost(go, post.id)}>
                {anon ? <Av anon size={30} /> : <Av who={post.author} size={30} />}
                <span className="hub-p-days-who"><b>{anon ? "Anonymous" : post.author.handle}{closed && <i> · {closed}</i>}</b><span>{what}</span></span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function TopBoard({ max = 5 }) {
  const { mineFor, personCard, go, board: month } = useCm();
  const [period, setPeriod] = useState("month");
  const week = useLoad(() => (period === "week" ? source.board({ period: "week", order: "board", mine: mineFor() }) : null), [period]);
  const b = period === "week" ? week.data : month.data;
  const rows = placed(b?.rows || []).slice(0, max);
  return (
    <section className="hub-p">
      <Head title="Top of the board"><Seg label="Period" value={period} onChange={setPeriod} items={[["month", "Month"], ["week", "Week"]]} /></Head>
      {b && !rows.length && <p className="hub-p-empty">Nobody's on the board yet. <button type="button" className="fl-text-btn" onClick={() => go("crews")}>Put yourself on it</button></p>}
      {rows.length > 0 && (
        <ol className="hub-p-board">
          {rows.map((r) => (
            <li key={r.handle} className={r.mine ? "mine" : ""}>
              <span className="hub-p-place num">{r.place}</span>
              <button type="button" onClick={(e) => personCard(r.handle, e.currentTarget)}><Av who={r} size={30} /><b>{r.handle}</b></button>
              <span className="hub-p-kept num"><b>{r.kept}</b>/{r.traded}</span>
            </li>
          ))}
        </ol>
      )}
      {rows.length > 0 && <p className="hub-p-note">Clean closes out of days traded</p>}
    </section>
  );
}

export function CrewPanel() {
  const { crew, cup, go } = useCm();
  if (!cup.data) return null;
  if (!crew) {
    return (
      <section className="hub-p">
        <Head title="Your crew" />
        <p className="hub-p-empty">Pick a crew and get its private room. <button type="button" className="fl-text-btn" onClick={() => go("crews")}>See the crews</button></p>
      </section>
    );
  }
  const c = CREWS[crew];
  const stats = cup.data.crews?.find((x) => x.crew === crew);
  return (
    <section className="hub-p hub-p-crew">
      <button type="button" onClick={() => go("crews")}>
        <InkPicture className={`hub-p-crew-pic ${c.invert ? "invert" : ""}`} src={`${import.meta.env.BASE_URL}${c.small}`} at={c.pos} edge={false} />
        <span className="hub-p-crew-text">
          <span className="hub-p-crew-name"><Crest crew={crew} size={18} /><b>{c.name}</b></span>
          <span>{[BOARDS && stats?.place && `${ordinal(stats.place)} of 3 crews`, stats?.members != null && `${stats.members} members`].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
    </section>
  );
}

export function NextUp({ max = 2 }) {
  const { hub, go } = useCm();
  const list = hub.next.slice(0, max);
  return (
    <section className="hub-p">
      <Head title="Coming up">{list.length > 0 && <button type="button" className="hub-p-more" onClick={() => go("events")}>All events</button>}</Head>
      {!list.length && <p className="hub-p-empty">Nothing on the calendar yet. Competitions and prize draws land here.</p>}
      {list.map((n) => (
        <button type="button" key={n.e.id} className="hub-p-next" onClick={() => go("events", { event: n.e.id })}>
          <InkPicture className="hub-p-next-pic" src={art(n.e.art || "prints/mystical-bird-hokusai", 480)} at="50% 25%" edge={false} />
          <span className="hub-p-next-text">
            <span className="hub-p-next-tag">{n.tag}</span>
            <b>{n.e.title}</b>
            <span className="hub-p-next-when">{n.label} <DueDate at={n.at} /></span>
          </span>
          <Icon name="chevR" size={16} />
        </button>
      ))}
    </section>
  );
}

export default function LivePanel({ rooms = true }) {
  return (
    <aside className="hub-panel" aria-label="Happening now">
      <OnAirPanel />
      <BigDays />
      {rooms && <RoomsNow />}
      {BOARDS && <TopBoard />}
      <CrewPanel />
      <NextUp />
    </aside>
  );
}
