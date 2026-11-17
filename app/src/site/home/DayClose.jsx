import { useEffect, useRef, useState } from "react";
import Pour from "../../drip/Pour";
import { FlexCard, FORMATS } from "../../views/Flex";
import { reduced } from "../heroes/shared";
import DripEdge from "../ink/DripEdge";
import Lines from "../ink/Lines";
import { useProgress } from "../ink/useRise";
import "./day-close.css";

// A sample session. Monday's −$306 and Tuesday's +$467 make the week so far.
const MONEY = [["Today", "+$467"], ["This week", "+$161"]];
const TRADES = [["CL", "long", "13:34", "+$215"], ["ES", "short", "12:26", "−$306"], ["CL", "long", "09:41", "+$558"]];
const CARD = { kind: "day", title: "Day 19", when: "27 Oct", money: 467, stage: "funded", steps: [558, -306, 215] };

function HoldToClose({ onDone }) {
  const [held, setHeld] = useState(false);
  const timer = useRef(null);
  const start = (e) => {
    if (e.pointerType === "mouse" && e.button) return;
    setHeld(true);
    timer.current = setTimeout(onDone, reduced() ? 0 : 640);
  };
  const stop = () => { clearTimeout(timer.current); setHeld(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button type="button" className={`hold ${held ? "held" : ""}`} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); onDone(); } }}>
      <span className="hold-label">Hold to close the day</span>
      <span className="hold-fill" aria-hidden="true"><span className="hold-label on">Hold to close the day</span></span>
    </button>
  );
}

// The real card, sized to its box
function Fitted({ card, finish, picture, record }) {
  const box = useRef(null);
  const [k, setK] = useState(0.6);
  useEffect(() => {
    const el = box.current;
    const fit = () => setK(Math.min(1, el.clientWidth / FORMATS.wide.w, el.clientHeight / FORMATS.wide.h));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="dc-fit" ref={box}>
      <div className="dc-card" style={{ width: FORMATS.wide.w * k, height: FORMATS.wide.h * k }}>
        <div style={{ transform: `scale(${k})`, transformOrigin: "0 0" }}>
          <FlexCard card={card} format="wide" finish={finish} picture={picture} record={record} show={{ money: true, record: true, handle: false, logo: false }} />
        </div>
      </div>
    </div>
  );
}

export default function DayClose() {
  const root = useRef(null), stage = useRef(null);
  const p = useProgress(root, stage);
  const [step, setStep] = useState("open"); // open, pouring, done
  const pour = () => setStep((s) => (s === "open" ? "pouring" : s));

  // The day closes when someone holds. Coming back from above sets it again
  useEffect(() => {
    if (p === 0) setStep("open");
  }, [p]);

  return (
    <section id="close" className="dc" ref={root} aria-labelledby="dc-title">
      <div className="dc-stage" ref={stage}>
        <DripEdge />
        <div className="dc-open" aria-hidden={step !== "open"}>
          <div className="dc-say">
            <Lines id="dc-title" className="dc-title" text="Close the day." />
            <p className="dc-sub">One hold at the end of every session. What the day made or lost, the trades behind it, if there were any, and it's done.</p>
          </div>
          <div className="dc-sheet">
            <div className="dc-head"><p>Tuesday · 27 October</p><span>Sample data</span></div>
            <div className="dc-money">
              {MONEY.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
            </div>
            <p className="close-line">CL long made the most at +$558. ES short cost the most at −$306.</p>
            <ul className="close-trades">
              {TRADES.map(([sym, side, time, pnl]) => <li key={time}><span><b>{sym}</b> {side}<i>{time}</i></span><span className="num">{pnl}</span></li>)}
            </ul>
            <HoldToClose onDone={pour} />
          </div>
        </div>
        {step !== "open" && (
          <Pour className="dc-pour close-pour" onDone={() => setStep("done")}>
            <div className={`dc-reveal ${step === "done" ? "ready" : ""}`}>
              <Fitted card={CARD} finish="black" picture="prints/great-wave-hokusai" record="Tuesday, 3 trades" />
              <div className="close-after">
                <h3 className="loud">Day 19 closed</h3>
                <p>Nothing left to do today. Sample card.</p>
              </div>
            </div>
          </Pour>
        )}
      </div>
    </section>
  );
}
