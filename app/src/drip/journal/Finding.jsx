import { useEffect, useMemo, useState } from "react";
import { art, plural } from "../../data";
import { useMedia } from "../../lib/useMedia.js";
import { NEED, findLeak } from "../../lib/finding";
import { setState, useStore, useStrategies } from "../../store";
import { Money, figureSize } from "../Money";
import { TradeRow, cash } from "./bits";

const FIRST = 4;
// The picture at the head of Stats, unless the cost is a setup with a picture of its own
const STANDING = { src: "masters/narcissus-caravaggio", at: "50% 12%" };
const OWN = { at: "50% 14%" };
const size = (net) => ({ ...figureSize(net), "--size": "80px" });

const Figure = ({ net, onFigure }) => (onFigure
  ? <button type="button" className="st-fig" style={size(net)} onClick={onFigure} aria-label="How this figure was built"><Money value={net} onBlack /></button>
  : <p className="st-fig" style={size(net)}><Money value={net} onBlack /></p>);

function Rows({ rows, onOpen }) {
  const [all, setAll] = useState(false);
  return (
    <div className="jn-group swap">
      <div className="jn-rows">
        {(all ? rows : rows.slice(0, FIRST)).map((t) => (
          <div key={t.id} className="jn-rowset"><TradeRow t={t} sub={[t.date, t.time, t.setup].filter(Boolean).join(" · ")} onOpen={onOpen} /></div>
        ))}
      </div>
      {rows.length > FIRST && <button type="button" className="link jn-more" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
    </div>
  );
}

// The panel at the head of Stats: a picture, one figure, what it was, and the trades behind it one tap away.
function Hero({ label, head, net, title, foot, tag, top, picture, rows, opened, onOpen, onFigure }) {
  const phone = useMedia("(max-width: 1100px)");
  const [open, setOpen] = useState(!!opened);
  const money = <><p className="st-word">{head}</p><Figure net={net} onFigure={onFigure} /></>;
  return (
    <section className="sv-found" aria-label={label}>
      <div className={`st-hero rise-in ${top ? "lead" : ""}`} data-tour="analytics" style={{ "--i": 1 }}>
        {top && <div className="st-hero-head">{money}</div>}
        <div className="st-pic" aria-hidden="true">
          <img src={art(picture.src, phone ? 960 : undefined)} style={{ objectPosition: picture.at }} alt="" decoding="async" draggable="false" />
        </div>
        <div className="st-hero-words">
          {!top && money}
          <h2>{title}</h2>
          <p className="st-foot">{foot}</p>
          {rows.length > 0 && <button type="button" className="st-see" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide the trades" : `See the ${plural(rows.length, "trade")}`}</button>}
          <p className="st-tag">{tag}</p>
        </div>
      </div>
      {open && <Rows rows={rows} onOpen={onOpen} />}
    </section>
  );
}

// What cost the most, in dollars, as something that already happened
export default function Finding({ found, tag, tradeOf, onOpen }) {
  const strategies = useStrategies();
  const asked = useStore((s) => s.statsSeeCost); // the first file's "See the trades"
  useEffect(() => { if (asked) setState({ statsSeeCost: null }); }, [asked]);
  const own = found.setup ? strategies.find((s) => s.setup === found.setup)?.img : null;
  const picture = useMemo(() => (own ? { ...OWN, src: own } : STANDING), [own]);
  const foot = `${plural(found.n, "trade")}, ${found.won} won, ${Math.round(found.share * 100)}% of all you lost`;
  return (
    <Hero label={`Your biggest cost: ${found.title}, ${cash(found.net, { decimals: 0 })}. ${foot}. ${tag}.`} head="Your biggest cost" net={found.net} title={found.title} foot={foot} tag={tag}
      picture={picture} rows={found.ids.map(tradeOf).filter(Boolean)} opened={asked} onOpen={onOpen} />
  );
}

// A day or a week leads with its own total, so nothing larger stands over it
export function PeriodHero({ head, net, title, foot, tag, rows, onOpen, onFigure }) {
  return (
    <Hero top label={`${head}: ${foot}. ${tag}.`} head={head} net={net} title={title} foot={foot} tag={tag} picture={STANDING} rows={rows} onOpen={onOpen} onFigure={onFigure} />
  );
}

// The biggest cost on a day or a week, when the total has the panel
export function CostPanel({ found, tag, tradeOf, onOpen }) {
  const [open, setOpen] = useState(false);
  const rows = found.ids.map(tradeOf).filter(Boolean);
  return (
    <section className="st-cost" aria-label="Your biggest cost">
      <p className="st-word">Your biggest cost</p>
      <p className="st-cost-fig"><Money value={found.net} /></p>
      <h3>{found.title}</h3>
      <p className="st-foot">{plural(found.n, "trade")}, {found.won} won, {Math.round(found.share * 100)}% of all you lost</p>
      {rows.length > 0 && <button type="button" className="st-see" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide the trades" : `See the ${plural(rows.length, "trade")}`}</button>}
      <p className="st-tag">{tag}</p>
      {open && <Rows rows={rows} onOpen={onOpen} />}
    </section>
  );
}

// Nothing to say yet, and it says so
export function NoFinding({ found }) {
  return (
    <section className="sv-quiet">
      <b>{found.status === "short" ? "Not enough trades yet" : "Nothing stands out"}</b>
      <p>{found.status === "short"
        ? `Your biggest cost shows after ${NEED} trades, and there ${found.have === 1 ? "is" : "are"} ${found.have} so far.`
        : "No pattern of five or more trades lost money across more than one day."}</p>
    </section>
  );
}

export const useFinding = (journal) => useMemo(() => findLeak(journal), [journal]);
