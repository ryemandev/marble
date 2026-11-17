import { useRef } from "react";
import Tank from "../../drip/Tank";
import { useMedia } from "../../lib/useMedia.js";
import DripEdge from "../ink/DripEdge";
import Lines from "../ink/Lines";
import { between, useProgress } from "../ink/useRise";
import "./study.css";

const BASE = import.meta.env.BASE_URL;
const ZERO = 0.98;

// The ink comes up through the section, and the storm is only there where the ink is
export default function Study() {
  const root = useRef(null), stage = useRef(null);
  const p = useProgress(root, stage);
  const phone = useMedia("(max-width: 760px)");
  const picture = { src: `${BASE}site/${phone ? "pk-storm-960" : "pk-storm"}.webp`, at: phone ? [0.64, 0.5] : [0.5, 0.5], alpha: 1 };
  const words = between(p, 0.46, 0.66);
  return (
    <section id="study" className="sy" ref={root} aria-labelledby="sy-title">
      <div className="sy-stage" ref={stage}>
        <Tank className="sy-tank" ratio={between(p, 0.04, 0.82)} zero={ZERO} picture={picture} label="Ink rising through the section" />
        <DripEdge />
        <div className="sy-say">
          <Lines id="sy-title" className="sy-title" text="Keep what you learn." />
          <div className="sy-more" style={{ opacity: words, transform: `translateY(${(1 - words) * 16}px)` }}>
            <p>One giant notepad. The video sits at the top, your chart images go in with it, and you write underneath.</p>
            <p>Every notebook and session is one tab away, and so are your setups.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
