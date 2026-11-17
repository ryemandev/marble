import { art, greeting } from "../../data";
import { useInkPicture } from "../../components/Backdrop";
import { useMedia } from "../../lib/useMedia.js";
import { FirmLogo } from "../../live/FirmPicker";
import { coverTone } from "../../views/study/model";
import { Money, figureSize } from "../Money";
import { money } from "../week";

const PANEL_W = 358, PANEL_H = 150;

// The print changes with the time of day. crop places it on a 358x150 panel, [left, top, width], so a print's border
// stays out of sight.
const HOURS = {
  "Good morning": { src: "prints/red-fuji-hokusai", crop: [-72, -46, 460] },
  "Good afternoon": { src: "prints/great-wave-hokusai-clean", crop: [0, -28, 358] },
  "Good evening": { src: "prints/night-rain-karasaki-hiroshige", crop: [-128, -42, 540] },
};

const pct = (v, of) => `${(v / of) * 100}%`;

// The black runs down over the picture the way it runs off the logo. Each run creeps longer, and the ones with a drop
// let it go and pull back a little. [across, width, length, ms, start, reach, drop], on a 608 wide panel.
const RUNS = [
  [36, 18, 88, 11000, 6200, 26, true], [103, 11, 34, 9000, 1500, 10, false], [182, 22, 124, 14000, 2400, 30, true], [268, 10, 44, 10000, 7000, 12, false],
  [353, 16, 96, 12000, 9800, 24, true], [438, 11, 34, 9500, 3300, 9, false], [523, 20, 112, 13000, 400, 28, true], [578, 10, 50, 10500, 5200, 12, false],
];
const DRIP_W = 608, DRIP_H = 130, BASE = 10, FILLET = 12;
const STUB = BASE + FILLET + 2;
const band = () => {
  let d = `M0 0H${DRIP_W}V${BASE}`;
  for (const [x, w] of [...RUNS].reverse()) {
    const neck = (w / 2) * 0.66;
    d += `H${x + neck + FILLET}Q${x + neck} ${BASE} ${x + neck} ${BASE + FILLET}V${STUB}H${x - neck}V${BASE + FILLET}Q${x - neck} ${BASE} ${x - neck - FILLET} ${BASE}`;
  }
  return `${d}H0Z`;
};
const BAND = band();

function Run({ run: [x, w, len, ms, start, reach, drop] }) {
  const r = w / 2, neck = r * 0.66, top = Math.max(STUB + 2, len - r * 3), mid = top + r * 2, long = top + 1 - STUB + 1;
  const time = { "--ms": `${ms}ms`, "--start": `-${start}ms`, "--reach": `${reach}px`, "--stretch": 1 + reach / long, "--back": 1 + (reach * 0.7) / long, "--eased": `${reach * 0.7}px` };
  return (
    <g style={time}>
      <rect className="dp-neck" x={x - neck} y={STUB - 1} width={neck * 2} height={long} />
      <path className="dp-bulb" d={`M${x - neck} ${top}C${x - neck} ${top + r} ${x - r} ${top + r * 1.3} ${x - r} ${mid}A${r} ${r} 0 0 0 ${x + r} ${mid}C${x + r} ${top + r * 1.3} ${x + neck} ${top + r} ${x + neck} ${top}Z`} />
      {drop && <ellipse className="dp-drop" cx={x} cy={mid + reach} rx={r * 0.72} ry={r * 0.92} />}
    </g>
  );
}

function DeskPicture() {
  const phone = useMedia("(max-width: 1100px)");
  const yours = useInkPicture();
  const hour = HOURS[greeting()] || HOURS["Good afternoon"];
  if (yours) {
    const at = yours.at ? `${yours.at[0] * 100}% ${yours.at[1] * 100}%` : "50% 40%";
    return <div className="dp-pic yours"><img src={yours.src} alt="" draggable="false" style={{ objectPosition: at }} /></div>;
  }
  const src = art(hour.src, phone ? 960 : undefined);
  const [left, top, width] = hour.crop;
  return (
    <div className="dp-pic" style={{ "--tone": coverTone(src) }}>
      <img src={src} alt="" draggable="false" style={{ left: pct(left, PANEL_W), top: pct(top, PANEL_H), width: pct(width, PANEL_W) }} />
    </div>
  );
}

// The Desk's panel. It looks the same on any day: the ink keeps running whatever the money did, and nothing says how it went but the
// figure itself. Tapping the figure shows how it was built. Before there are trades, dayWord takes its place: never $0.
export default function DeskPlate({ label, words, days, net, unset, dayWord, line, onFigure }) {
  const down = !unset && !dayWord && net < 0;
  return (
    <section className="dp" aria-label={`${[label, ...words].join(", ")}: ${dayWord || (unset ? "set the dates" : money(net, { sign: true }))}`}>
      <div className={`dp-foot ${down ? "down" : ""}`}>
        <div className="dp-head">
          <p><b>{label}</b>{words.map((w) => ` · ${w}`).join("")}</p>
          {days && (
            <ol className="dp-days" aria-label="Days closed this week">
              {days.map((d) => <li key={d.key} className={d.closed ? "on" : ""}>{d.letter}</li>)}
            </ol>
          )}
        </div>
        {dayWord
          ? <p className="dp-figure words day" style={{ "--chars": dayWord.length }}>{dayWord}</p>
          : unset
          ? <p className="dp-figure words">Set dates</p>
          : <button type="button" className="dp-figure" style={figureSize(net)} onClick={onFigure} aria-label="How this figure was built"><Money value={net} onBlack /></button>}
        {line && <p className="dp-line" style={{ "--chars": line.length }}>{line}</p>}
      </div>
      <div className="dp-top" aria-hidden="true">
        <DeskPicture />
        <svg className="dp-drip" viewBox={`0 0 ${DRIP_W} ${DRIP_H}`} preserveAspectRatio="xMidYMin meet"><path d={BAND} />{RUNS.map((r) => <Run key={r[0]} run={r} />)}</svg>
      </div>
    </section>
  );
}

const STEP = (of) => (of <= 6000 ? 500 : of <= 12000 ? 1000 : 2500);
const LAST = 500;

// How far the account can fall, on a line from nothing to the firm's limit. Only an account with a firm has one.
export function DeskRuler({ account, room }) {
  const left = Math.max(0, room.left);
  const of = Math.max(room.of > 0 ? room.of : 0, left, LAST * 2);
  const step = STEP(of);
  const ticks = [];
  for (let at = step; at <= of; at += step) ticks.push(at);
  const place = (v) => `${Math.min(100, (v / of) * 100)}%`;
  return (
    <section className="dk-ruler" aria-label={`${account.name}: ${money(left)} drawdown left, estimate from your trades`}>
      <span className="dk-ruler-firm"><FirmLogo slug={account.firm} size={16} /></span>
      <p className="dk-ruler-left"><Money value={left} sign={false} /> drawdown left</p>
      <p className="dk-ruler-sub">estimate from your trades</p>
      <div className="dk-ruler-line" aria-hidden="true">
        <i className="last" style={{ width: place(LAST) }} />
        {ticks.map((at) => <i key={at} className="tick" style={{ left: place(at) }} />)}
        <i className="needle" style={{ left: place(left) }} />
      </div>
    </section>
  );
}
