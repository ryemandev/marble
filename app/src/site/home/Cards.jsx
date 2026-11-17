import { useLayoutEffect, useRef, useState } from "react";
import { FlexCard, FORMATS } from "../../views/Flex";
import Lines from "../ink/Lines";
import "./cards.css";

const SHOW = { money: true, record: true, handle: false, logo: false };

// Real cards on sample data. A red day is on the shelf for the same reason it's on the desk.
const SHELF = [
  { finish: "black", picture: "masters/self-portrait-rembrandt", card: { kind: "trade", title: "NQ long", when: "Wed 21 Oct", money: 628, stage: "funded", no: 42, held: "41m", chart: { entry: 20412.25, exit: 20443.75, side: 1, dp: 2, tick: 0.25, held: 41, tf: 1, at: "09:57", code: "NQ", seed: 15 } } },
  { finish: "black", picture: "prints/great-wave-hokusai", record: "Tuesday, 3 trades", card: { kind: "day", title: "Day 19", when: "27 Oct", money: 467, stage: "funded", steps: [558, -306, 215] } },
  { finish: "white", picture: "masters/wanderer-friedrich", card: { kind: "trade", title: "ES long", when: "Mon 26 Oct", money: -390, stage: "funded", no: 43, held: "18m", chart: { entry: 5984.5, exit: 5976.75, side: 1, dp: 2, tick: 0.25, held: 18, tf: 1, at: "10:41", code: "ES", seed: 29 } } },
  { finish: "black", picture: "masters/narcissus-caravaggio", record: "Monday, 4 trades", card: { kind: "day", title: "Day 18", when: "26 Oct", money: -306, stage: "funded", steps: [120, -390, 214, -250] } },
  { finish: "carbon", picture: "anime/ronin", record: "Closed days, red or green", card: { kind: "day", title: "Day 60", when: "Oct", fallback: "60 closed" } },
];

function Shelf({ scale }) {
  return SHELF.map(({ finish, picture, record, card }) => (
    <li key={card.title} style={{ width: FORMATS.wide.w * scale, height: FORMATS.wide.h * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <FlexCard card={card} format="wide" finish={finish} picture={picture} record={record} show={SHOW} />
      </div>
    </li>
  ));
}

export default function Cards() {
  const track = useRef(null);
  const [scale, setScale] = useState(0.7);

  useLayoutEffect(() => {
    const measure = () => {
      // Most of the screen's height, up to the card's real size, with the next card showing at the edge
      setScale(Math.max(0.42, Math.min(1, (window.innerHeight * 0.56) / FORMATS.wide.h, (innerWidth - 56) / FORMATS.wide.w)));
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

  const move = (way) => {
    const row = track.current;
    const by = (row.querySelector("li")?.offsetWidth || 400) + 24;
    row.scrollBy({ left: way * by, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <section id="cards" className="cd ink-section" aria-labelledby="cd-title">
      <div className="cd-stage">
        <div className="cd-say">
          <Lines id="cd-title" className="cd-title" text="Every day ends on a card." />
          <p className="cd-sub"><b>Sample data, not a real trader's results.</b> A card for every closed day and any trade, with your own dollars set large, on a red day the same as a green one. Evaluation money always says simulated. Carbon comes at 60 closed days.</p>
        </div>
        <ul className="cd-track" ref={track} tabIndex={0} aria-label="Sample cards">
          <Shelf scale={scale} />
        </ul>
        <div className="cd-nav">
          <button type="button" onClick={() => move(-1)} aria-label="Previous card"><span aria-hidden="true">←</span></button>
          <button type="button" onClick={() => move(1)} aria-label="Next card"><span aria-hidden="true">→</span></button>
        </div>
      </div>
    </section>
  );
}
