import { useEffect, useRef, useState } from "react";
import { FOUNDER, STORY, LINE } from "./story";
import { Ghost, StartFree } from "../heroes/shared";
import { Roll } from "../Header";
import InkPicture from "../../drip/InkPicture";
import Lines from "../ink/Lines";
import "./letter.css";

const BASE = import.meta.env.BASE_URL;
const PORTRAIT_SRC = `${BASE}site/r1-fisherman.webp`;
const PORTRAIT_SET = `${BASE}site/r1-fisherman-360.webp 360w, ${BASE}site/r1-fisherman.webp 720w`;

const SIGNATURE =
  "M14 86 C18 70 24 46 30 22 C32 14 44 8 56 12 C70 16 70 34 56 42 C48 47 38 48 32 46 C44 52 54 66 62 80 C66 86 72 88 78 84 C84 78 86 66 88 58 C88 70 92 80 100 80 C108 80 112 70 114 58 C112 78 110 96 104 104 C98 112 88 110 90 100 C92 92 104 86 118 80 C128 76 140 68 140 60 C140 54 132 54 128 60 C124 68 128 80 140 80 C152 80 160 74 168 68 C182 62 204 64 230 58";

const LINES = (() => {
  const i = LINE.indexOf(", ");
  if (i < 0) return [LINE];
  const rest = LINE.slice(i + 2).split(" ");
  return [LINE.slice(0, i + 1), rest.slice(0, -3).join(" "), rest.slice(-3).join(" ")];
})();

function useSeen(ref, share = 0.2) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    const check = () => {
      const b = el.getBoundingClientRect();
      if (b.top < innerHeight * (1 - share) && b.bottom > 0) setSeen(true);
    };
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: share });
    io.observe(el);
    check();
    addEventListener("scroll", check, { passive: true });
    addEventListener("resize", check);
    return () => { io.disconnect(); removeEventListener("scroll", check); removeEventListener("resize", check); };
  }, [seen]);
  return seen;
}

export default function Letter({ story = STORY, full = null }) {
  const sheet = useRef(null);
  const sign = useRef(null);
  const open = useSeen(sheet, 0.15);
  const signed = useSeen(sign, 0.1);
  return (
    <section id="founder" className="fx fd-letter" aria-labelledby="fl-title">
      <div className="fl-wrap">
        <aside className="fl-side">
                    <Lines id="fl-title" className="fl-title" text="Why I built" silver="Marble." />
          <InkPicture className="fl-portrait" src={PORTRAIT_SRC} srcSet={PORTRAIT_SET} sizes="(max-width: 1100px) 100vw, 420px" at="50% 40%" aria-hidden="true" />
        </aside>

        <article className={`fl-sheet ${open ? "on" : ""}`} ref={sheet} aria-label={`A letter from ${FOUNDER.name}, Marble's founder`}>
          <p className="fl-salute">To the trader reading this,</p>
          <div className="fl-body">
            {story.map((p, i) => <p key={p.key} style={{ "--i": i }}>{p.text}</p>)}
          </div>
          {full && (
            <a className="hx-more fl-full" href={full}>
              <Roll>Read the full letter</Roll><span className="sr-only">Read the full letter</span><span className="hx-more-arrow" aria-hidden="true">→</span>
            </a>
          )}

          <div className="fl-close" style={{ "--i": story.length }}>
            <span className="fl-lead">To anyone struggling right now</span>
            <blockquote className="fl-line">
              <p aria-label={LINE}>{LINES.map((l, i) => <span key={i} aria-hidden="true" className={i === LINES.length - 1 && i > 0 ? "silver" : ""}>{l}</span>)}</p>
            </blockquote>
          </div>

          <div className={`fl-signed ${signed ? "on" : ""}`} ref={sign}>
            <svg className="fl-sig" viewBox="0 0 240 110" role="img" aria-label={FOUNDER.goesBy}>
              <path d={SIGNATURE} pathLength="1" />
            </svg>
            <span className="fl-who">{FOUNDER.goesBy} · {FOUNDER.role} · {FOUNDER.age} · {FOUNDER.from}</span>
          </div>

          <div className="fl-actions">
            <StartFree />
            <Ghost href="#community">Join the crew</Ghost>
            <span className="fl-free">Free forever</span>
          </div>
        </article>
      </div>
    </section>
  );
}
