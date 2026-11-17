import { art } from "../../data";
import { Icon } from "../../components/ui";
import { VIco } from "../../views/community/voice/OnAir";
import { roomName } from "../../views/community/houses";
import { source } from "../../views/community/source";
import { useCm } from "../../views/community/context";
import InkPicture from "../InkPicture";
import { VOICE_LIVE } from "../../mode";
import { DueDate, Faces } from "./parts";

function AirTile() {
  const { hub, go } = useCm();
  const s = hub.air.live || hub.air.later;
  const live = !!hub.air.live;
  const open = () => (VOICE_LIVE && s ? go("chat", { room: s.room }) : go("chat", { room: "voice" }));
  return (
    <button type="button" className={`hub-tile ${live ? "on" : ""}`} onClick={open}>
      <span className="hub-tile-kicker"><VIco name="mic" size={14} />{live ? "On air now" : s ? "On air soon" : "Voice sessions"}</span>
      <b className="hub-tile-title">{s ? s.title : "Coming soon"}</b>
      <span className="hub-tile-foot">
        {s ? <><Faces people={s.people.filter((p) => p.role)} size={20} max={3} /><span>{live ? `In ${roomName(s.room)}` : `With ${s.people[0]?.handle}`}</span></> : <span>Hear the open, ask the room</span>}
      </span>
    </button>
  );
}

function NextTile() {
  const { hub, go } = useCm();
  const n = hub.next[0];
  if (!n) {
    return (
      <div className="hub-tile quiet">
        <span className="hub-tile-kicker"><Icon name="calendar" size={14} />Next up</span>
        <b className="hub-tile-title">Nothing on the calendar</b>
        <span className="hub-tile-foot"><span>Competitions and draws land here</span></span>
      </div>
    );
  }
  return (
    <button type="button" className="hub-tile" onClick={() => go("events", { event: n.e.id })}>
      <span className="hub-tile-kicker"><Icon name="trophy" size={14} />{n.e.title}</span>
      <DueDate at={n.at} />
      <span className="hub-tile-foot"><span>{n.label}</span></span>
    </button>
  );
}

export default function LiveBand() {
  const { hub, go } = useCm();
  const { count, faces } = hub.here;
  const sample = !!source.demo;
  const alone = count <= 1;
  // A tile with nothing to say only makes the room look empty
  const air = !!(hub.air.live || hub.air.later), next = !!hub.next[0], on = air || next;
  return (
    <section className="hub-band" aria-label="Live on the Floor">
      <InkPicture className="hub-band-pic" src={art("money/franklin-eyes", 960)} at="50% 62%" edge={false} />
      <div className="hub-band-top">
          <div className="hub-now">
            <span className="hub-kicker"><i className="cm-live-dot" aria-hidden="true" />Live on the Floor{sample && <em>Sample data</em>}</span>
            {alone ? (
              <button type="button" className="hub-alone" onClick={() => go("chat")}><b>Just you for now.</b> <span>Say hello in General.</span></button>
            ) : (
              <div className="hub-here">
                <b className="hub-here-n num">{count}</b>
                <span className="hub-here-w">traders<br />here now</span>
                <Faces people={faces} size={34} max={5} />
              </div>
            )}
          </div>
        {on && <div className="hub-tiles">{air && <AirTile />}{next && <NextTile />}</div>}
      </div>
    </section>
  );
}
