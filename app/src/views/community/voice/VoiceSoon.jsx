import { useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { LIVE } from "../../../mode";
import { SAMPLE } from "../../../data";
import { setState, useStore } from "../../../store";
import { useCm } from "../context";
import { Air, LowerThird, Questions, RunSheet, onAirOf, useNow } from "./OnAir";
import { previewSession } from "./demoVoice";
import { isVoiceIdea } from "./rules";

function usePreviewTalk(handles) {
  const [talking, setTalking] = useState([]);
  useEffect(() => {
    let i = 0, t = 0;
    const next = () => {
      const speaking = i % 4 !== 3;
      setTalking(speaking && handles.length ? [handles[(i * 2 + 1) % handles.length]] : []);
      i++;
      t = setTimeout(next, speaking ? 4200 + (i % 3) * 900 : 1100);
    };
    next();
    return () => clearTimeout(t);
  }, [handles.join()]);
  return talking;
}

function Demand() {
  const { go } = useCm();
  const added = useStore((s) => s.ideas) || [];
  const myVotes = useStore((s) => s.ideaVotes) || {};
  const idea = [...added, ...(LIVE ? [] : SAMPLE.IDEAS || [])].find(isVoiceIdea);
  if (!idea) {
    return (
      <div className="vsn-demand">
        <span className="vsn-demand-text"><b>Want it?</b><span>Tell us in Ideas &amp; polls. The more traders ask, the sooner it's on.</span></span>
        <button type="button" className="btn ghost" onClick={() => go("ideas")}><Icon name="bulb" size={15} />Ideas &amp; polls</button>
      </div>
    );
  }
  const mine = !!myVotes[idea.id];
  const n = idea.votes + (mine ? 1 : 0);
  const vote = () => setState((s) => ({ ideaVotes: { ...(s.ideaVotes || {}), [idea.id]: !(s.ideaVotes || {})[idea.id] } }));
  return (
    <div className="vsn-demand">
      <button type="button" className={`vsn-vote ${mine ? "on" : ""}`} aria-pressed={mine} onClick={vote}
        aria-label={mine ? `You'd join. ${n} traders want voice sessions. Take back your vote` : `I'd join. ${n} traders want voice sessions`}>
        <Icon name={mine ? "check" : "up"} size={15} /><span>{mine ? "You're counted" : "I'd join"}</span>
      </button>
      <span className="vsn-demand-text">
        <b><span className="num">{n.toLocaleString()}</span> {n === 1 ? "trader wants" : "traders want"} this</b>
        <span>Your vote counts in Ideas &amp; polls, where traders decide what Marble builds next. <button type="button" className="link" onClick={() => go("ideas")}>See it there</button></span>
      </span>
    </div>
  );
}

export default function VoiceSoon({ head, phone }) {
  const [s] = useState(previewSession);
  const talking = usePreviewTalk(onAirOf(s).map((p) => p.handle));
  const now = useNow(true);
  return (
    <>
      {head}
      <div className="oa-scroll vsn">
        <div className="vsn-intro">
          <h2 className="vsn-title">Hear the open.<span>Ask the room.</span></h2>
          <p className="vsn-line">Live voice sessions in Community, each with a host: listen in, ask questions in writing, and raise your hand to speak. Nothing is recorded.</p>
          <Demand />
        </div>
        <section className="vsn-preview" aria-label="Preview of a voice session, with sample traders">
          <Air s={s} phone={phone} preview talking={talking} />
          <LowerThird s={s} talking={talking} tuned now={now} phone={phone} />
          {phone
            ? <div className="oa-phone-pane"><span className="caps faint vsn-cap">Questions</span><Questions s={s} readonly /></div>
            : (
              <div className="oa-body">
                <div className="oa-col"><span className="caps faint">Run sheet</span><RunSheet s={s} /></div>
                <div className="oa-col wide"><span className="caps faint">Questions</span><Questions s={s} readonly /></div>
              </div>
            )}
          <p className="vsn-note">A preview with sample traders and questions. No microphone, and nothing here is live.</p>
        </section>
      </div>
    </>
  );
}
