import { useEffect, useState } from "react";
import { Icon, Skeleton } from "../../components/ui";
import { toast } from "../../store";
import InkPicture from "../../drip/InkPicture";
import { useReveal } from "../../drip/motion";
import Lead from "../../drip/floor/Lead";
import { BASE, Note, useMedia } from "./parts";
import { CREWS, CREW_ORDER } from "./houses";
import { useCm } from "./context";
import { Faces } from "../../drip/hub/parts";
import { BOARDS } from "../../mode";
import { placed } from "./Boards";
import { errText, source } from "./source";
import { ordinal } from "./scoring";
import Boards from "./Boards";

const dateOf = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// A crew's month, held still: days closed clean, averaged across its members, so a bigger crew has no head start
function Kept({ pct, big }) {
  if (!BOARDS) return null;
  return (
    <div className={`fl-crewkept ${big ? "big" : ""}`}>
      {pct == null ? <p>No days yet this month</p> : <p><b>{Math.round(pct)}%</b> of days closed clean this month</p>}
      {pct != null && <span className="fl-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, pct)}%` }} /></span>}
    </div>
  );
}

// Who's in it, from the people who chose to show
function Roster({ tag, members }) {
  const { board } = useCm();
  const rows = placed((board.data?.rows || []).filter((r) => r.crew === tag));
  if (!rows.length) return null;
  const names = rows.slice(0, 2).map((r) => r.handle).join(", ");
  const rest = (members ?? rows.length) - Math.min(rows.length, 2);
  return <div className="fl-roster"><Faces people={rows} size={30} max={6} /><span>{names}{rest > 0 ? ` and ${rest} more` : ""}</span></div>;
}

function CrewRow({ tag, stats, children }) {
  const c = CREWS[tag];
  return (
    <article className="fl-crewrow rise-in" style={{ "--i": CREW_ORDER.indexOf(tag) }}>
      <InkPicture className={`fl-crewrow-pic ${c.invert ? "invert" : ""}`} src={`${BASE}${c.small}`} at={c.pos} edge={false} />
      <div className="fl-crewrow-body">
        <h3>{c.name}</h3>
        <p>{c.motto}</p>
        <Kept pct={stats?.pct ?? null} />
        {children}
      </div>
    </article>
  );
}

// An event earns a line only while there is one
function EventRow() {
  const { events, go } = useCm();
  const list = [...(events.data?.competitions || []), ...(events.data?.giveaways || [])];
  if (!list.length) return null;
  const e = list[0];
  return (
    <button type="button" className="fl-event-row" onClick={() => go("events", { event: list.length === 1 ? e.id : null })}>
      <span><b>{e.title}</b><span>{e.kind === "cup" ? "Competition" : "Free prize draw"}{list.length > 1 ? `, and ${list.length - 1} more` : ""}</span></span>
      <Icon name="chevR" size={18} />
    </button>
  );
}

export default function Crews() {
  const { crew, cup, refreshCrew, go } = useCm();
  const [asking, setAsking] = useState(null); // a crew's tag, or "leave", while confirming
  const [busy, setBusy] = useState(false);
  const phone = useMedia("(max-width: 640px)");
  const rest = useReveal();
  useEffect(() => { setAsking(null); }, [crew]);

  const statsOf = (t) => cup.data?.crews?.find((x) => x.crew === t);
  const next = cup.data?.mine?.next_change;
  const locked = next && Date.parse(next) > Date.now();
  const change = async (to) => {
    setBusy(true);
    try {
      await source.setCrew(to);
      await refreshCrew();
      setAsking(null);
      window.scrollTo({ top: 0 });
      toast(to ? `You're in the ${CREWS[to].name}` : "You've left your crew");
    } catch (err) {
      const when = err?.details || err?.detail;
      toast(err?.code === "P0001" && when ? `You can change crews once a month. Next change from ${dateOf(when)}.` : errText(err, "Couldn't change your crew. Try again."), { warn: true });
    }
    setBusy(false);
  };

  const joinFor = (tag) => {
    const { name } = CREWS[tag];
    if (locked) return null;
    if (asking === tag) {
      return (
        <div className="fl-confirm">
          <span>{crew ? `Switch to the ${name}? You can't change again for a month.` : `Join the ${name}? You can change crews once a month.`}</span>
          <div>
            <button type="button" className="btn" disabled={busy} onClick={() => change(tag)}>{crew ? "Switch" : "Join"}</button>
            <button type="button" className="fl-text-btn" onClick={() => setAsking(null)}>Cancel</button>
          </div>
        </div>
      );
    }
    return <button type="button" className={`btn ${crew ? "ghost" : ""}`} onClick={() => setAsking(tag)}>{crew ? `Switch to the ${name}` : `Join the ${name}`}</button>;
  };
  const lockedLine = locked && <p className="fl-foot">{crew ? `You can change crews once a month. Next change from ${dateOf(next)}.` : `You left your crew recently. You can join one again from ${dateOf(next)}.`}</p>;

  if (!cup.data) return cup.error ? <Note retry={cup.reload}>Couldn't load the crews.</Note> : <Skeleton rows={3} label="Loading the crews" />;

  if (!crew) {
    return (
      <div className="fl-crews">
        <Lead title="A crew is a team you trade the month with." note="Pick one and join. You get its private room." />
        <div className="fl-crewlist pick">
          {CREW_ORDER.map((t) => <CrewRow key={t} tag={t} stats={statsOf(t)}>{joinFor(t)}</CrewRow>)}
        </div>
        {lockedLine}
        <EventRow />
      </div>
    );
  }

  const c = CREWS[crew];
  const stats = statsOf(crew);
  const facts = [stats?.members != null && `${stats.members} members`, BOARDS && stats?.place && `${ordinal(stats.place)} of ${CREW_ORDER.length} crews this month`].filter(Boolean);
  return (
    <div className="fl-crews">
      <Lead title={`You're in the ${c.name}.`} note="Your people on the Floor. Talk to them in your private room.">
        <button type="button" className="btn" onClick={() => go("chat", { room: crew })}><Icon name="chat" size={15} /> Open the crew room</button>
      </Lead>

      <section className="fl-crew rise-in">
        <InkPicture className={`fl-crew-pic ${c.invert ? "invert" : ""}`} src={`${BASE}${phone ? c.small : c.img}`} at={c.pos} />
        <div className="fl-crew-words">
          <p>{c.motto}</p>
          <Kept pct={stats?.pct ?? null} big />
          {facts.length > 0 && <p className="fl-crew-facts">{facts.join(" · ")}</p>}
          <Roster tag={crew} members={stats?.members} />
        </div>
      </section>

      <EventRow />

      <div className="fl-crew-grid reveal" ref={rest}>
        {BOARDS && <Boards tag={crew} />}
        <section className="fl-crew-others">
          <h3>Other crews</h3>
          <div className="fl-crewlist">
            {CREW_ORDER.filter((t) => t !== crew).map((t) => <CrewRow key={t} tag={t} stats={statsOf(t)}>{joinFor(t)}</CrewRow>)}
          </div>
          {lockedLine}
          {asking === "leave" ? (
            <div className="fl-confirm">
              <span>{`Leave the ${c.name}? You won't be able to join a crew again for a month.`}</span>
              <div>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => change(null)}>Leave</button>
                <button type="button" className="fl-text-btn" onClick={() => setAsking(null)}>Cancel</button>
              </div>
            </div>
          ) : !locked && <button type="button" className="fl-text-btn" onClick={() => setAsking("leave")}>Leave the crew</button>}
        </section>
      </div>
    </div>
  );
}
