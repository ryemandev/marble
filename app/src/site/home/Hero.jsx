import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Tank from "../../drip/Tank";
import { Wordmark } from "../../components/Logo";
import { useMedia } from "../../lib/useMedia.js";
import { StartFree, reduced } from "../heroes/shared";
import Lines from "../ink/Lines";
import { between, usePinned } from "../ink/useRise";
import "./hero.css";

const BASE = import.meta.env.BASE_URL;

const TITLE = "Stop paying to build better habits.";
const SUB = ["Live and funded accounts, one total.", "By day, week, month or any dates."];

// The tank runs a little above the top of the screen, so the ink can fill it completely
const OVER = 0.14;
const ZERO = 0.98;

export default function Hero() {
  const root = useRef(null), stage = useRef(null), head = useRef(null), logo = useRef(null), splash = useRef(null);
  const phone = useMedia("(max-width: 760px)");
  const p = usePinned(root, stage);
  const [rest, setRest] = useState(0.2);

  // At rest the ink stops just above the headline, so the logo stands on white and every word reads whole on the ink
  useLayoutEffect(() => {
    const measure = () => {
      const H = stage.current.clientHeight, top = stage.current.getBoundingClientRect().top;
      const y = head.current.getBoundingClientRect().top - top - 16;
      const h = H * (1 + OVER), z = h * ZERO;
      setRest(Math.max(0.02, (z - (y + H * OVER)) / (z - h * 0.04)));
    };
    measure();
    document.fonts?.ready.then(measure);
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

  // The logo lets one drop go, and the tank takes it
  useEffect(() => {
    if (reduced()) return undefined;
    const box = logo.current?.querySelector("svg")?.getBoundingClientRect();
    if (!box || !stage.current) return undefined;
    const x = box.left + box.width * 0.494, y = box.top + box.height * 0.908;
    const drop = document.createElement("i");
    drop.className = "logo-drop";
    drop.style.left = `${x}px`;
    drop.style.top = `${y}px`;
    stage.current.append(drop);
    const fall = drop.animate(
      [{ transform: "translateY(0) scale(.5, .3)", offset: 0 }, { transform: "translateY(0) scale(1, 1.1)", offset: 0.34, easing: "cubic-bezier(.55,0,.9,.4)" }, { transform: `translateY(${Math.max(40, (splash.current?.top().y ?? y + 200) - y)}px) scale(.8, 1.35)`, offset: 1 }],
      { duration: 760, delay: 1000, fill: "both" },
    );
    fall.onfinish = () => { drop.remove(); splash.current?.splash(x, 26); };
    return () => { fall.cancel(); drop.remove(); };
  }, []);

  // The surface answers the cursor as it crosses
  const skim = useRef(0);
  const move = (e) => {
    if (e.pointerType !== "mouse" || !splash.current) return;
    const t = splash.current.top();
    if (Math.abs(e.clientY - t.y) > 26 || performance.now() - skim.current < 90) return;
    skim.current = performance.now();
    splash.current.splash(e.clientX - t.left, 7);
  };

  const rise = between(p, 0, 0.48);
  // In steps the spring smooths out: every change of level also stirs the surface
  const ratio = Math.round((rest + (1 - rest) * rise) * 48) / 48;
  // The painting steps back as the film's words come up over it
  const alpha = between(p, 0.04, 0.42) * (1 - (phone ? 0.72 : 0.5) * between(p, phone ? 0.86 : 0.8, 1));
  const words = 1 - between(p, 0.06, 0.26);
  const picture = { src: `${BASE}art/masters/jerome-writing-caravaggio.webp`, at: phone ? [0.68, 0.5] : [0.5, 0.42], alpha };

  return (
    <section id="top" className="hero" ref={root} aria-labelledby="hm-title">
      <div className="hero-stage" ref={stage} onPointerMove={move}>
        <Tank className="hero-tank" ratio={ratio} zero={ZERO} picture={picture} splashRef={splash} label="Ink rising up the page, with Caravaggio's Saint Jerome writing in his book showing inside it" />
        <div className="hero-over" style={{ visibility: p >= 1 ? "hidden" : undefined }}>
          <div className="hero-logo" ref={logo} style={{ opacity: 1 - between(p, 0.5, 0.7) }}><Wordmark width={1200} pour /></div>
          <h1 id="hm-title" className="hero-title" ref={head} style={{ opacity: 1 - between(p, 0.14, 0.34) }}><small className="hero-kicker">The free trading journal</small> <Lines as="span" className="hero-line" text={TITLE} now /></h1>
          <div className="hero-foot" style={{ opacity: words, visibility: words ? undefined : "hidden" }}>
            <p className="hero-sub">{SUB[0]} <br />{SUB[1]}</p>
            <div className="hero-start">
              <div className="hero-go">
                <StartFree />
                <a className="hero-demo" href={`${BASE}demo.html`}>Open the sample desk</a>
              </div>
              <span className="hero-then">Nothing to pay. No card, no plans.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
