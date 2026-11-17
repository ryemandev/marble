// Ink running off the section above into the white below. One long sheet; phones see its middle.
const RUNS = [[92, 24, 64], [236, 16, 36], [414, 30, 118], [566, 15, 30], [744, 24, 84], [908, 14, 44], [1082, 32, 132], [1252, 17, 50], [1374, 22, 92]];
const W = 1440, BASE = 12, FILLET = 13;

const path = () => {
  let d = `M0 0H${W}V${BASE}`;
  for (const [x, w, len] of [...RUNS].reverse()) {
    const r = w / 2, neck = r * 0.66;
    d += `H${x + neck + FILLET}Q${x + neck} ${BASE} ${x + neck} ${BASE + FILLET}V${len - r * 3}`;
    d += `C${x + neck} ${len - r * 2} ${x + r} ${len - r * 1.7} ${x + r} ${len - r}`;
    d += `A${r} ${r} 0 0 1 ${x - r} ${len - r}`;
    d += `C${x - r} ${len - r * 1.7} ${x - neck} ${len - r * 2} ${x - neck} ${len - r * 3}`;
    d += `V${BASE + FILLET}Q${x - neck} ${BASE} ${x - neck - FILLET} ${BASE}`;
  }
  return `${d}H0Z`;
};
const D = path();

export default function DripEdge({ className = "" }) {
  return <svg className={`drip-edge ${className}`} viewBox={`0 0 ${W} 150`} preserveAspectRatio="xMidYMin slice" aria-hidden="true"><path d={D} /></svg>;
}
