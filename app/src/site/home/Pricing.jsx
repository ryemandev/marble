import { useRef } from "react";
import { Wordmark } from "../../components/Logo";
import Tank from "../../drip/Tank";
import { StartFree } from "../heroes/shared";
import { between, useProgress } from "../ink/useRise";
import Costs from "../journals/Costs";
import "./free.css";

// One statement. The ink comes up through the wordmark and the words, and they turn white along its edge.
export default function Pricing({ as: Heading = "h2" }) {
  const root = useRef(null), stage = useRef(null);
  const p = useProgress(root, stage);
  const after = between(p, 0.56, 0.74);
  return (
    <>
    <section id="pricing" className="fr" ref={root} aria-labelledby="fr-title">
      <div className="fr-stage" ref={stage}>
        <Tank className="fr-tank" ratio={0.06 + 0.94 * between(p, 0, 0.56)} zero={0.98} label="Ink rising up the page" />
        <div className="fr-over">
          <Heading id="fr-title" className="fr-title">
            <span className="sr-only">Marble is free forever.</span>
            <span className="fr-mark" aria-hidden="true"><Wordmark width={1200} /></span>
            <span className="fr-word" aria-hidden="true"><span>is free </span><span>forever.</span></span>
          </Heading>
          <div className="fr-say" style={{ opacity: after, visibility: after ? undefined : "hidden" }}>
            <p>Every feature, for everyone. Nothing to pay, no card, no trial and no plans to choose.</p>
            <StartFree />
          </div>
        </div>
      </div>
    </section>
    <Costs />
    </>
  );
}
