import { useRef } from "react";
import Tank from "../../drip/Tank";
import { useMedia } from "../../lib/useMedia.js";
import { Roll, sectionUrl } from "../Header";
import { Ghost, StartFree } from "../heroes/shared";
import Lines from "../ink/Lines";
import { between, useProgress } from "../ink/useRise";
import "./home.css";

const BASE = import.meta.env.BASE_URL;

export const SectionHead = ({ label, title, silver, children, id }) => (
  <header className="hm-head">
    {label && <span className="hx-kicker">{label}</span>}
    <Lines id={id} className="hm-h2" text={title} silver={silver} />
    {children && <p className="hx-sub hm-lede">{children}</p>}
  </header>
);

export const Arrow = ({ href, children, className = "" }) => (
  <a className={`hx-more ${className}`} href={href}><Roll>{children}</Roll><span className="sr-only">{children}</span><span className="hx-more-arrow" aria-hidden="true">→</span></a>
);

// The close of a page: the ink comes up one last time with the great wave in it, and one last offer
export function Close() {
  const root = useRef(null), stage = useRef(null);
  const p = useProgress(root, stage);
  const phone = useMedia("(max-width: 760px)");
  const picture = { src: `${BASE}site/${phone ? "end-wave-ink-tall" : "end-wave-ink"}.webp`, at: phone ? [0.5, 0.5] : [0.8, 0.42], alpha: 1 };
  return (
    <section className="hm-close" ref={root} aria-labelledby="hm-close-t">
      <div className="hm-close-stage" ref={stage}>
        <Tank className="hm-close-tank" ratio={between(p, 0.02, 0.78)} zero={0.98} picture={picture} label="The great wave inside the ink" />
        <div className="hm-close-in">
          <Lines id="hm-close-t" className="hm-close-title" text="Log your" silver="next trade." />
          <p className="hm-close-sub">It's free forever, every feature is in it, and there's no card to enter.</p>
          <div className="hx-actions">
            <StartFree />
            <Ghost href={sectionUrl("everything")}>See every feature</Ghost>
          </div>
        </div>
      </div>
    </section>
  );
}
