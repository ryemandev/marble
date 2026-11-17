import { useLayoutEffect, useRef, useState } from "react";
import { Roll, START_URL, sectionUrl } from "../Header";
import "./heroes.css";

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const NF = [0, 2].map((d) => new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const usd = (n, { sign = true, cents = false } = {}) =>
  `${n < 0 ? "−" : sign && n > 0 ? "+" : ""}$${NF[cents ? 1 : 0].format(Math.abs(n))}`;
export const price = (n) => NF[1].format(n);

const DIGITS = Array.from({ length: 10 }, (_, d) => <span key={d}>{d}</span>);

export function Odometer({ value, className = "" }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const measure = () => setH(Math.round(parseFloat(getComputedStyle(el).fontSize)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const chars = [...value];
  return (
    <span className={`odo ${className}`} ref={ref} style={h ? { "--odo-h": `${h}px` } : undefined}>
      <span className="sr-only">{value}</span>
      <span className="odo-row" aria-hidden="true">
        {chars.map((ch, i) => {
          const key = chars.length - i;
          return /\d/.test(ch)
            ? <span key={`d${key}`} className="odo-d"><span className="odo-col" style={{ transform: `translateY(${-ch * h}px)` }}>{DIGITS}</span></span>
            : <span key={`s${key}`} className="odo-s">{ch}</span>;
        })}
      </span>
    </span>
  );
}

export const StartFree = ({ children = "Start journaling" }) => (
  <a className="cta lg" href={START_URL}><span>{children}</span></a>
);

// The quiet second button: a link, or an action on the page
export function Ghost({ href, onClick, children }) {
  const inner = <><Roll>{children}</Roll><span className="sr-only">{children}</span></>;
  return href
    ? <a className="ghost lg" href={href}>{inner}</a>
    : <button type="button" className="ghost lg" onClick={onClick}>{inner}</button>;
}

// The great wave, pressed negative so it stands in the ink. It closes a page.
export const EndWave = () => {
  const b = import.meta.env.BASE_URL;
  return (
    <div className="end-wave" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet={`${b}site/end-crest-780.webp 780w, ${b}site/end-crest.webp 1170w`} sizes="100vw" />
        <img srcSet={`${b}site/end-wave-1440.webp 1440w, ${b}site/end-wave-1920.webp 1920w, ${b}site/end-wave.webp 2880w`} sizes="100vw" alt="" loading="lazy" decoding="async" />
      </picture>
    </div>
  );
};

export const SeeEverything = ({ children = "See everything Marble does", className = "" }) => (
  <a className={`hx-more ${className}`} href={sectionUrl("everything")}>
    <Roll>{children}</Roll><span className="sr-only">{children}</span><span className="hx-more-arrow" aria-hidden="true">→</span>
  </a>
);
