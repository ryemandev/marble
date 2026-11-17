import { forwardRef, useEffect, useId, useMemo, useRef } from "react";
import { art, fmtMoney } from "../data";
import { svgRef } from "./svgRef";
import { reducedMotion } from "./overlay";
import { Rolling } from "./charts";

export const Card = forwardRef(function Card({ className = "", children, ...rest }, ref) {
  return <section ref={ref} className={`card ${className}`} {...rest}>{children}</section>;
});

export const Label = ({ children, right }) => (
  <div className="label">
    <span>{children}</span>
    {right}
  </div>
);

export const Pnl = ({ value, className = "", decimals, count = false }) => {
  const format = (v) => fmtMoney(v, { sign: true, decimals });
  return <span className={`num ${value > 0 ? "win" : value < 0 ? "loss" : ""} ${className}`}>{count ? <Rolling value={value} format={format} /> : format(value)}</span>;
};

const WIDE = [[78, 46], [62, 38], [70, 52], [54, 30]];
export function Skeleton({ rows = 3, kind = "rows", label = "Loading" }) {
  return (
    <div className={`skel skel-${kind}`} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row" aria-hidden="true" style={{ "--i": i }}>
          {kind === "rows" && <i className="skel-dot" />}
          <span className="skel-lines">{WIDE[i % 4].map((w, j) => <i key={j} style={{ width: `${w}%` }} />)}</span>
        </div>
      ))}
    </div>
  );
}

export const Chip = ({ children, tone = "" }) => <span className={`chip ${tone}`}>{children}</span>;

export const Grade = ({ grade }) => (grade ? <span className={`grade g-${grade.replace("+", "p")}`}>{grade}</span> : <span className="grade g-none" title="Not graded yet">—</span>);

export function Hero({ img, eyebrow, title, line2, quote, subtitle, children, position = "center 30%" }) {
  const ref = useRef(null);
  const dispRef = useRef(null);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    const el = ref.current;
    const scroller = el.closest(".main-scroll");
    const artEl = el.querySelector(".hero-art");
    const still = reducedMotion();
    const scrolled = () => (scroller && scroller.scrollHeight > scroller.clientHeight + 1 ? scroller.scrollTop : window.scrollY);
    const calm = document.documentElement.classList.contains("calm");
    let raf = 0, pending = 0;
    let intro = still || calm ? 0 : 1;
    const t0 = performance.now();

    const apply = () => {
      pending = 0;
      const moved = still ? 0 : scrolled();
      const p = Math.min(1, Math.max(0, moved / (el.offsetHeight * 0.9)));
      el.style.setProperty("--p", p.toFixed(3));
      const scale = Math.max(intro * 90, p * 70);
      dispRef.current?.setAttribute("scale", String(scale));
      artEl.style.filter = !calm && scale > 0.5 ? svgRef(`liquid${id}`) : "none";
    };
    const introTick = (t) => {
      intro = Math.max(0, 1 - (t - t0) / 1300);
      intro = intro * intro;
      apply();
      if (intro > 0) raf = requestAnimationFrame(introTick);
    };
    if (still) apply();
    else raf = requestAnimationFrame(introTick);
    const onScroll = () => { if (!pending) pending = requestAnimationFrame(apply); };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pending);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header className="hero" ref={ref}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id={`liquid${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="3" />
          <feDisplacementMap ref={dispRef} in="SourceGraphic" scale="90" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="hero-art" style={{ backgroundImage: `url(${art(img)})`, backgroundPosition: position }} />
      <div className="hero-shade" />
      <div className="hero-content">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className={quote ? "hero-quote" : "hero-title"}>
          {title}
          {line2 && <span className="hero-line2">{line2}</span>}
        </h1>
        {subtitle && <p className="hero-sub">{subtitle}</p>}
        {children}
      </div>
    </header>
  );
}

export function Sparkline({ data, height = 36, color }) {
  const w = 120;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - 2 - ((v - min) / (max - min || 1)) * (height - 4)}`).join(" ");
  const c = color || (data.at(-1) >= data[0] ? "var(--win)" : "var(--loss)");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Ring({ value, size = 44, stroke = 4, color = "var(--text)", children }) {
  const r = (size - stroke) / 2;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line-2)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          pathLength="100" strokeDasharray="100" strokeDashoffset={100 - value}
          style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}

const pnum = (v) => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);
const priceText = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(+v.toFixed(5)));
export function TradeLevels({ trade, height = 240 }) {
  const entry = pnum(trade.entry), stop = pnum(trade.stop), exit = pnum(trade.exit);
  const list = Array.isArray(trade.fills?.list) ? trade.fills.list.filter((f) => pnum(f.price) != null && f.time) : [];
  if (entry == null && exit == null && !list.length) {
    return <div className="levels-empty muted xs" style={{ height }}>Add the entry and exit prices to see this trade drawn out.</div>;
  }
  const w = 800, padX = 56;
  const t0 = list.length ? Date.parse(list[0].time) : Date.parse(trade.traded_at || "") || 0;
  const t1 = list.length ? Date.parse(list.at(-1).time) : Date.parse(trade.closedAt || "") || t0;
  const span = Math.max(1, t1 - t0);
  const xAt = (t) => (t1 > t0 ? padX + ((t - t0) / span) * (w - padX * 2) : w / 2);
  const prices = [entry, stop, exit, ...list.map((f) => +f.price)].filter((v) => v != null);
  let lo = Math.min(...prices), hi = Math.max(...prices);
  if (hi === lo) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.18;
  lo -= pad; hi += pad;
  const y = (v) => 14 + ((hi - v) / (hi - lo)) * (height - 28);
  const win = (+trade.pnl || 0) >= 0;
  const lines = [[entry, "var(--silver)", "Entry"], [exit, "var(--text)", "Exit"], [stop, "var(--loss)", "Stop"]].filter(([v]) => v != null);
  const tags = lines.map(([v, c, l]) => ({ c, l, v, top: y(v) - 17 })).sort((a, b) => a.top - b.top);
  for (let i = 1; i < tags.length; i++) tags[i].top = Math.max(tags[i].top, tags[i - 1].top + 16);
  const path = list.length
    ? list.map((f) => [xAt(Date.parse(f.time)), y(+f.price)])
    : [[padX, y(entry ?? exit)], [w - padX, y(exit ?? entry)]];
  const desc = [entry != null && `entry ${priceText(entry)}`, stop != null && `stop ${priceText(stop)}`, exit != null && `exit ${priceText(exit)}`, list.length && `${list.length} fill${list.length === 1 ? "" : "s"}`].filter(Boolean).join(", ");
  return (
    <div className="levels" style={{ position: "relative" }} role="img" aria-label={`The trade's prices: ${desc}`}>
      {tags.map(({ c, l, v, top }) => (
        <span key={l} className="num candle-tag" style={{ top, color: c }}>{l} {priceText(v)}</span>
      ))}
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden="true">
        {entry != null && exit != null && (
          <rect x="0" width={w} y={Math.min(y(entry), y(exit))} height={Math.max(1, Math.abs(y(entry) - y(exit)))} fill={win ? "var(--win)" : "var(--loss)"} opacity=".07" />
        )}
        {lines.map(([v, c, l]) => (
          <line key={l} x1="0" x2={w} y1={y(v)} y2={y(v)} stroke={c} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" opacity=".8" />
        ))}
        <polyline points={path.map((p) => p.join(",")).join(" ")} fill="none" stroke={win ? "var(--win)" : "var(--loss)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity=".7" />
      </svg>
      {(list.length ? list : [entry != null && { price: entry, role: "entry", x: padX }, exit != null && { price: exit, role: "exit", x: w - padX }].filter(Boolean)).map((f, i) => (
        <span key={i} className={`fill-dot ${f.role === "exit" ? "out" : "in"}`} title={`${f.role === "exit" ? "Exit" : "Entry"} ${f.qty ? `${f.qty} at ` : ""}${priceText(+f.price)}${f.time ? `, ${new Date(f.time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false })} ET` : ""}`}
          style={{ left: `${((f.x ?? xAt(Date.parse(f.time))) / w) * 100}%`, top: y(+f.price) }} />
      ))}
    </div>
  );
}

export function Candles({ seed = 7, side = "long", win = true, height = 240 }) {
  const candles = useMemo(() => {
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    let price = 100;
    const drift = (side === "long") === win ? 0.35 : -0.35;
    return Array.from({ length: 48 }, (_, i) => {
      const o = price;
      const move = (rnd() - 0.5) * 3 + (i > 18 ? drift : 0);
      const c = o + move;
      const h = Math.max(o, c) + rnd() * 1.4;
      const l = Math.min(o, c) - rnd() * 1.4;
      price = c;
      return { o, c, h, l };
    });
  }, [seed, side, win]);
  const all = candles.flatMap((c) => [c.h, c.l]);
  const min = Math.min(...all), max = Math.max(...all);
  const w = 800, cw = w / candles.length;
  const y = (v) => 10 + ((max - v) / (max - min)) * (height - 20);
  const entry = candles[18].c, exit = candles[40].c;
  const stop = side === "long" ? entry - (max - min) * 0.12 : entry + (max - min) * 0.12;
  const lines = [
    [entry, "var(--silver)", "Entry"],
    [exit, "var(--text)", "Exit"],
    [stop, "var(--loss)", "Stop"],
  ];
  const tags = lines.map(([v, c, l]) => ({ c, l, top: y(v) - 17 })).sort((a, b) => a.top - b.top);
  for (let i = 1; i < tags.length; i++) tags[i].top = Math.max(tags[i].top, tags[i - 1].top + 16);
  return (
    <div style={{ position: "relative" }}>
    {tags.map(({ c, l, top }) => (
      <span key={l} className="num candle-tag" style={{ top, color: c }}>{l}</span>
    ))}
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} className="candles">
      <rect x={18 * cw} width={22 * cw} y="0" height={height} fill={win ? "var(--win)" : "var(--loss)"} opacity=".05" />
      {candles.map((c, i) => {
        const up = c.c >= c.o;
        return (
          <g key={i} stroke={up ? "var(--win)" : "var(--loss)"} fill={up ? "var(--win)" : "var(--bg)"}>
            <line x1={i * cw + cw / 2} x2={i * cw + cw / 2} y1={y(c.h)} y2={y(c.l)} vectorEffect="non-scaling-stroke" />
            <rect x={i * cw + cw * 0.2} width={cw * 0.6} y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fillOpacity={up ? 0.9 : 0.9} />
          </g>
        );
      })}
      {lines.map(([v, c, l]) => (
        <line key={l} x1="0" x2={w} y1={y(v)} y2={y(v)} stroke={c} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" opacity=".8" />
      ))}
    </svg>
    </div>
  );
}

export function ArtCard({ img, children, className = "", position = "center", style, width = 960 }) {
  return (
    <div className={`art-card ${className}`} style={style}>
      <div className="art-card-img" style={{ backgroundImage: `url(${art(img, width)})`, backgroundPosition: position }} />
      <div className="art-card-shade" />
      <div className="art-card-body">{children}</div>
    </div>
  );
}

export const Avatar = ({ name, img, src, size = 32 }) => (
  <div className="avatar" style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)), backgroundImage: src ? `url(${src})` : img ? `url(${art(img, 160)})` : undefined }} aria-hidden="true">
    {!src && !img && (Array.from(String(name || "").trim())[0] || "?").toUpperCase()}
  </div>
);

export const Icon = ({ name, size = 16 }) => {
  const p = {
    plus: "M12 5v14M5 12h14",
    bug: "M9 9.5a3 3 0 0 1 6 0V15a3 3 0 0 1-6 0zM12 9.5V18M9.5 6.8 8 5M14.5 6.8 16 5M9 12H5M15 12h4M9 15.5l-3 2M15 15.5l3 2M9 9l-3-2M15 9l3-2",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
    bolt: "M13 3 5 14h6l-1 7 8-11h-6l1-7z",
    filter: "M4 5h16l-6 8v6l-4-2v-4L4 5z",
    chevL: "M15 6l-6 6 6 6",
    chevR: "M9 6l6 6-6 6",
    bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0",
    mail: "M4 6h16v12H4zM4 7l8 6 8-6",
    heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
    chat: "M5 5h14v10H9l-4 4V5z",
    share: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
    play: "M8 5v14l11-7z",
    check: "M5 12l5 5 9-10",
    alert: "M12 4 2.5 20h19L12 4zM12 10v4.5M12 17.4v.1",
    trash: "M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13",
    flag: "M6 21V4M6 4h11l-2 4 2 4H6",
    lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
    send: "M4 12l16-8-6 16-3-7-7-1z",
    sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
    flame: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z",
    wallet: "M4 7h15v12H4zM4 7l11-3v3M15 13h2",
    image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 0 0 .01",
    close: "M6 6l12 12M18 6L6 18",
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
    menu: "M4 7h16M4 12h16M4 17h16",
    expand: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
    shrink: "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5",
    desk: "M4 5h16v10H4zM9 19h6M12 15v4",
    list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
    crown: "M4 18h16M5 15l-1-8 5 4 3-6 3 6 5-4-1 8z",
    trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6",
    edit: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
    upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
    chart: "M4 19h16M7 16v-5M12 16V7M17 16v-3",
    calendar: "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4",
    copy: "M9 9h11v11H9zM5 15H4V4h11v1",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    up: "M12 19V5M6 11l6-6 6 6",
    poll: "M5 20V10M12 20V4M19 20v-7",
    bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
    cash: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4",
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={p} />
    </svg>
  );
};
