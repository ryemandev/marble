import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { reducedMotion } from "../components/overlay";

// The tab bar's droplet: one white capsule that stretches from the tab it's leaving to the tab it's
// reaching, necks in the middle like a drop pulling away, then settles. Its leading edge moves faster
// than its trailing edge, and that difference is the whole effect. It's a real path, drawn fresh on each
// frame, so its edge stays pixel-sharp at any size. There's no blur filter behind it.
// The labels flip colour exactly where the white drop crosses them, then a second copy of the drop sits on
// top and multiplies it green. White turns green and the black lettering stays black. This bar is the only
// place the green is used.
function dropPath(l, r, h, inset) {
  const top = inset, bot = h - inset, rad = (bot - top) / 2;
  const span = Math.max(r - l, rad * 2);
  const left = l, right = l + span;
  const stretch = Math.max(0, span - rad * 5) / (rad * 8);
  const pinch = Math.min(rad * 0.62, stretch * rad * 1.3);
  const a = left + rad, b = right - rad, mid = (a + b) / 2, k = (b - a) * 0.28;
  const y0 = top + pinch, y1 = bot - pinch;
  return `M${a} ${top}C${a + k} ${top} ${mid - k} ${y0} ${mid} ${y0}C${mid + k} ${y0} ${b - k} ${top} ${b} ${top}A${rad} ${rad} 0 0 1 ${b} ${bot}C${b - k} ${bot} ${mid + k} ${y1} ${mid} ${y1}C${mid - k} ${y1} ${a + k} ${bot} ${a} ${bot}A${rad} ${rad} 0 0 1 ${a} ${top}Z`;
}

export default function TabBar({ tabs, value, onChange, counts = {}, label = "App sections" }) {
  const bar = useRef(null);
  const svg = useRef(null);
  const path = useRef(null);
  const tintBox = useRef(null);
  const tint = useRef(null);
  const motion = useRef({ l: 0, r: 0, vl: 0, vr: 0, tl: 0, tr: 0, raf: 0, last: 0, ready: false });
  // The drop answers the finger, not the screen: it sets off for a tab the moment that tab is touched, while the
  // screen is still on its way. If the touch turns into a scroll or slides off, it comes back.
  const [aim, setAim] = useState(null);
  const clicked = useRef(false);
  const at = aim ?? value;
  useEffect(() => { setAim(null); }, [value]);
  const touch = (id) => (e) => { if (e.pointerType === "mouse" && e.button !== 0) return; clicked.current = false; setAim(id); };
  const pick = (id) => (e) => { clicked.current = true; setAim(id === value ? null : id); onChange(id, e); };
  const live = useRef({ touch, pick });
  live.current = { touch, pick };
  useEffect(() => {
    // While the browser is drawing a tab change it sends every tap to the page itself, not to what is under the
    // finger. A tap that lands on a tab in that moment is still a tap on that tab, so it is never lost.
    const under = (e) => (e.target !== document.documentElement ? null : [...(bar.current?.querySelectorAll("[data-tab]") || [])].find((b) => {
      const r = b.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    })?.dataset.tab);
    const down = (e) => { const id = under(e); if (id) live.current.touch(id)(e); };
    const click = (e) => { const id = under(e); if (id) live.current.pick(id)(e); };
    const lift = () => requestAnimationFrame(() => { if (!clicked.current) setAim(null); });
    const drop = () => setAim(null);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("click", click, true);
    document.addEventListener("pointerup", lift, true);
    document.addEventListener("pointercancel", drop, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("pointerup", lift, true);
      document.removeEventListener("pointercancel", drop, true);
    };
  }, []);

  useLayoutEffect(() => {
    const m = motion.current;
    const draw = () => {
      const el = bar.current;
      if (!el || !path.current) return;
      const h = el.clientHeight;
      const d = dropPath(m.l, m.r, h, 5);
      for (const [box, p] of [[svg, path], [tintBox, tint]]) {
        box.current.setAttribute("viewBox", `0 0 ${el.clientWidth} ${h}`);
        p.current.setAttribute("d", d);
      }
    };
    const step = (now) => {
      const dt = Math.min(0.032, (now - m.last) / 1000 || 0.016);
      m.last = now;
      const rightward = m.tl >= m.l;
      // The edge going first is stiff, the edge following is loose
      const [kl, kr] = rightward ? [150, 380] : [380, 150];
      const [cl, cr] = rightward ? [20, 30] : [30, 20];
      for (let i = 0; i < 2; i++) {
        const h = dt / 2;
        m.vl += ((m.tl - m.l) * kl - m.vl * cl) * h; m.l += m.vl * h;
        m.vr += ((m.tr - m.r) * kr - m.vr * cr) * h; m.r += m.vr * h;
      }
      draw();
      const rest = Math.abs(m.tl - m.l) + Math.abs(m.tr - m.r) + Math.abs(m.vl) / 60 + Math.abs(m.vr) / 60 < 0.15;
      if (rest) { m.l = m.tl; m.r = m.tr; m.vl = m.vr = 0; draw(); m.raf = 0; return; }
      m.raf = requestAnimationFrame(step);
    };
    const place = (animate) => {
      const el = bar.current?.querySelector(`[data-tab="${at}"]`);
      if (!el) return;
      const box = bar.current.getBoundingClientRect(), r = el.getBoundingClientRect();
      m.tl = r.left - box.left + 1;
      m.tr = r.right - box.left - 1;
      if (!animate || !m.ready || reducedMotion()) {
        m.l = m.tl; m.r = m.tr; m.vl = m.vr = 0; m.ready = true; draw();
        return;
      }
      if (!m.raf) { m.last = performance.now(); m.raf = requestAnimationFrame(step); }
    };
    place(true);
    document.fonts?.ready.then(() => place(false));
    const ro = new ResizeObserver(() => place(false));
    ro.observe(bar.current);
    return () => { ro.disconnect(); cancelAnimationFrame(m.raf); m.raf = 0; };
  }, [at, tabs.length]);

  return (
    <nav className="tabbar" ref={bar} aria-label={label}>
      <svg className="tabbar-drop" ref={svg} aria-hidden="true" preserveAspectRatio="none"><path ref={path} /></svg>
      <div className="tabbar-tabs">
        {tabs.map((t) => (
          <button key={t.id} type="button" data-tab={t.id} className="tabbar-tab" aria-current={value === t.id ? "page" : undefined}
            onPointerDown={touch(t.id)} onClick={pick(t.id)}>
            {t.label}{counts[t.id] > 0 && <i className="tabbar-count" aria-label={`${counts[t.id]} unread`} />}
          </button>
        ))}
      </div>
      <svg className="tabbar-drop tabbar-tint" ref={tintBox} aria-hidden="true" preserveAspectRatio="none"><path ref={tint} /></svg>
    </nav>
  );
}
