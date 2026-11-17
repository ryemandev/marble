import { VIco } from "../../views/community/voice/OnAir";
import { VOICE_LIVE } from "../../mode";
import { useCm } from "../../views/community/context";
import { Av } from "../../views/community/parts";
import { closedWord, openPost } from "./parts";

// The phone's way in: who's on air, which rooms are busy, who just posted. Swipe it, tap one, you're there.
export default function NowRow() {
  const { hub, go } = useCm();
  const s = hub.air.live;
  const rooms = hub.roomsNow.slice(0, 4);
  const people = [];
  for (const x of hub.days.length ? hub.days : hub.fresh.map((post) => ({ post }))) {
    const h = x.post.author?.handle;
    if (h && !x.post.anonymous && !people.some((p) => p.post.author.handle === h)) people.push(x);
  }
  if (!s && !rooms.length && !people.length) return null;
  const roomAt = (r) => (
    <button type="button" key={r.id} className="hub-row-item" onClick={() => go("chat", { room: r.id })}>
      <span className="hub-row-face room">{r.last?.author ? <Av who={r.last.author} size={58} /> : null}<i aria-hidden="true">#</i></span>
      <b>{r.name}</b><span>{r.here ? `${r.here} here` : "Open"}</span>
    </button>
  );
  const personAt = (x) => {
    const days = closedWord(hub.closed[x.post.author.handle]);
    return (
    <button type="button" key={x.post.id} className="hub-row-item" onClick={() => openPost(go, x.post.id)}>
      <span className="hub-row-face person"><Av who={x.post.author} size={58} /></span>
      <b>{x.post.author.handle}</b>{days && <span>{days}</span>}
    </button>
    );
  };
  // People and rooms in turn, so the row reads like a busy place and not a menu
  const mixed = [];
  const many = Math.max(rooms.length, people.length);
  for (let i = 0; i < many && mixed.length < 14; i++) {
    if (people[i]) mixed.push(personAt(people[i]));
    if (rooms[i]) mixed.push(roomAt(rooms[i]));
  }
  return (
    <div className="hub-row" role="group" aria-label="On the Floor now">
      {s && (
        <button type="button" className="hub-row-item air" onClick={() => go("chat", { room: VOICE_LIVE ? s.room : "voice" })}>
          <span className="hub-row-face"><VIco name="mic" size={24} /></span>
          <b>On air</b><span>Listen in</span>
        </button>
      )}
      {mixed}
    </div>
  );
}
