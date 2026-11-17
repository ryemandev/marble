import { LOGOS } from "./logos";
import { LINES } from "./firms";

const BASE = import.meta.env.BASE_URL;

export default function Logo({ slug, name, size = 28, className = "" }) {
  const l = LOGOS[slug];
  if (!l) return <span className={`wk-name ${className}`} style={{ fontSize: Math.round(size * 0.62) }}>{name}</span>;
  const r = Math.min(Math.max(l.ratio, 0.6), 9);
  const h = Math.round(Math.min(size * 1.25, Math.max(size * 0.5, (size * 2.1) / Math.sqrt(r))));
  return <img className={`wk-logo ${className}`} src={`${BASE}site/logos/${l.file}`} width={Math.round(h * r)} height={h} alt={name} decoding="async" />;
}

// The heading every version shares
export function Head({ center = false }) {
  return (
    <header className={`wk-head ${center ? "center" : ""}`}>
      <span className="hx-kicker">Works with</span>
      <h2 id="wk-title" className="wk-title"><span>Your firm.</span> <span className="silver">One journal.</span></h2>
      <p className="wk-lede">{LINES.today}</p>
    </header>
  );
}
