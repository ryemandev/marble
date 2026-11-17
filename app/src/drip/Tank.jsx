import { useEffect, useRef } from "react";
import { reducedMotion } from "../components/overlay";
import { pressLevels, toneOf } from "../views/study/model.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SPLASH_LIFE = 2.4;

const pictures = new Map();
// Marble's pictures in pure black and white. Done once, on a canvas, because not every phone can filter a canvas as it draws.
function pressed(src) {
  return new Promise((done) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      const fit = Math.min(1, 1500 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * fit);
      c.height = Math.round(im.naturalHeight * fit);
      const x = c.getContext("2d");
      x.drawImage(im, 0, 0, c.width, c.height);
      x.globalCompositeOperation = "saturation";
      x.fillStyle = "#000";
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = "source-over";
      try {
        const px = x.getImageData(0, 0, c.width, c.height), d = px.data, levels = pressLevels(toneOf(src));
        for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = levels[d[i]];
        x.putImageData(px, 0, 0);
      } catch {
        // A trader's own picture on another address can't be read back, so it takes the nearest blend
        x.globalCompositeOperation = "overlay";
        x.drawImage(c, 0, 0);
      }
      done(c);
    };
    im.onerror = () => done(null);
    im.src = src;
  });
}

// A level of ink behind glassless, flat type. Whatever `paint` draws is drawn twice: in ink on the panel,
// then in paper inside the liquid, so the words turn white exactly where the ink reaches them. It's all
// one canvas at the screen's full density, so the edge is sharp. The level is a spring, the surface two
// slow waves, and a tap or a falling drop sends a ripple across it. `flat` holds it still: the level as a shape, nothing moving.
export default function Tank({ ratio = 0, zero = 0.62, roll, paint, picture, label, className = "", height, splashRef, flat = false, full = false, mark = "" }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const live = useRef({ ratio, roll, paint, picture });
  live.current = { ratio, roll, paint, picture };
  const redraw = useRef(null);

  useEffect(() => {
    const el = box.current, c = canvas.current, ctx = c.getContext("2d");
    const still = flat || reducedMotion();
    const m = { w: 0, h: 0, dpr: 1, y: null, v: 0, tilt: 0, amp: still ? 0 : 4, shown: 0, ripples: [], raf: 0, last: 0, t: 0, fade: 1, picture: null, visible: true, ink: "#000", paper: "#fff", panel: "#f3f3f2", settled: false };
    const readColours = () => {
      const s = getComputedStyle(el);
      m.ink = s.getPropertyValue("--tank-ink").trim() || "#000";
      m.paper = s.getPropertyValue("--tank-paper").trim() || "#fff";
    };
    const size = () => {
      const r = el.getBoundingClientRect();
      m.dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.ceil(r.width * m.dpr); c.height = Math.ceil(r.height * m.dpr);
      m.w = c.width / m.dpr; m.h = c.height / m.dpr; // the whole bitmap, or a half-width card leaves its last column uncleared
      readColours();
    };
    const targetY = () => {
      if (full) return -60; // the ink is over the top of the panel, so the picture shows whole
      const r = clamp(live.current.ratio, -1, 1), z = m.h * zero;
      return r >= 0 ? z - r * (z - m.h * 0.04) : z - r * (m.h * 0.97 - z);
    };
    const surface = (x) => {
      const t = m.t, base = m.y;
      let y = base + m.tilt * ((x - m.w / 2) / (m.w / 2));
      y += m.amp * (0.62 * Math.sin(x * 0.0125 + t * 1.15) + 0.38 * Math.sin(x * 0.027 - t * 1.6));
      y += (still ? 0 : 1.2) * Math.sin(x * 0.009 - t * 0.7);
      for (const r of m.ripples) {
        const age = t - r.at, d = Math.abs(x - r.x);
        const front = age * 210, near = Math.exp(-((d - front) ** 2) / 5200);
        y += r.power * Math.exp(-age * 1.7) * near * Math.cos((d - front) * 0.05);
      }
      return y;
    };
    const wavePath = (lift = 0, stretch = 1) => {
      const step = 8;
      ctx.beginPath();
      ctx.moveTo(0, m.h + 2);
      ctx.lineTo(0, surface(0) + lift);
      let px = 0, py = surface(0) + lift;
      for (let x = step; x <= m.w + step * 3; x += step) {
        const y = surface(x * stretch) + lift;
        ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        px = x; py = y;
      }
      ctx.lineTo(px, py);
      ctx.lineTo(px, m.h + 2); // Off the canvas, so the edge can't cut a sliver into the ink
      ctx.closePath();
    };
    const draw = () => {
      if (!m.w) return;
      ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
      ctx.clearRect(0, 0, m.w, m.h);
      const shown = live.current.roll != null ? m.shown : 0;
      const paintIn = (colour, on) => live.current.paint?.(ctx, { w: m.w, h: m.h, colour, on, shown, zeroY: m.h * zero });
      paintIn(m.ink, false);
      // A paler wave behind the front one gives the ink depth without any gloss
      if (!still) {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = m.ink;
        wavePath(-5, 1.18);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      wavePath();
      ctx.clip();
      ctx.fillStyle = m.ink;
      ctx.fillRect(0, 0, m.w, m.h);
      showPicture();
      paintIn(m.paper, true);
      ctx.restore();
    };
    // A picture lives inside the ink only, so the ink is what reveals it
    const showPicture = () => {
      const pic = pictures.get(live.current.picture?.src);
      if (!pic) return;
      const { src, at = [0.5, 0.5], alpha = 0.5, trim: [left, right, top = 0, bottom = 0] = [0, 0] } = live.current.picture;
      if (m.picture !== src) { m.picture = src; m.fade = still ? 1 : 0; }
      const sx = pic.width * left, sw = pic.width * (1 - left - right);
      const sy = pic.height * top, sh = pic.height * (1 - top - bottom);
      const fit = Math.max(m.w / sw, m.h / sh), w = sw * fit, h = sh * fit;
      const y = (m.h - h) * at[1];
      ctx.save();
      ctx.globalAlpha = alpha * m.fade;
      ctx.drawImage(pic, sx, sy, sw, sh, (m.w - w) * at[0], y, w, h);
      ctx.restore();
    };
    redraw.current = () => { if (!still) return; m.y = targetY(); m.shown = live.current.roll ?? 0; draw(); };
    const step = (now) => {
      m.raf = 0;
      // A frame's own clock can read earlier than the moment the tank started, on a first load most of all. Time never
      // runs backwards here: if it did, the figure would roll away from its total and show a loss that never happened.
      const dt = Math.min(0.033, Math.max(0, (now - m.last) / 1000) || 0.016);
      m.last = now;
      m.t += dt;
      const target = targetY();
      if (m.y == null) m.y = full ? target : m.h * zero;
      if (full) m.y = target;
      const a = (target - m.y) * 34 - m.v * 7.6;
      m.v += a * dt;
      m.y += m.v * dt;
      m.tilt += (clamp(-m.v * 0.03, -16, 16) - m.tilt) * Math.min(1, dt * 5);
      m.amp += (1.6 - m.amp) * Math.min(1, dt * 0.9);
      const want = live.current.roll ?? 0;
      m.shown += (want - m.shown) * Math.min(1, dt * 7);
      if (Math.abs(want - m.shown) < 0.5) m.shown = want;
      m.ripples = m.ripples.filter((r) => m.t - r.at < SPLASH_LIFE);
      m.fade = Math.min(1, m.fade + dt * 2.2);
      draw();
      if (m.visible) m.raf = requestAnimationFrame(step);
    };
    const start = () => {
      if (still) { m.y = targetY(); m.shown = live.current.roll ?? 0; m.tilt = 0; draw(); return; }
      if (!m.raf && m.visible) { m.last = performance.now(); m.raf = requestAnimationFrame(step); }
    };
    const splash = (x, power = 14) => {
      if (still) return;
      m.ripples.push({ x, at: m.t, power });
      m.amp = Math.min(5, m.amp + power * 0.12);
    };
    if (splashRef) splashRef.current = {
      splash,
      top: () => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, y: r.top + (m.y ?? targetY()) }; },
    };
    const tap = (e) => { const r = el.getBoundingClientRect(); splash(e.clientX - r.left, 7); };
    el.addEventListener("pointerdown", tap);

    size();
    const ro = new ResizeObserver(() => { size(); if (still) draw(); });
    ro.observe(el);
    const io = new IntersectionObserver((es) => {
      m.visible = es[0].isIntersecting && !document.hidden;
      if (m.visible) start(); else { cancelAnimationFrame(m.raf); m.raf = 0; }
    });
    io.observe(el);
    const hide = () => { m.visible = !document.hidden; if (m.visible) start(); };
    document.addEventListener("visibilitychange", hide);
    Promise.all([document.fonts?.load?.("800 48px Unbounded"), document.fonts?.load?.("600 14px Geist"), document.fonts?.load?.("500 13px Geist")]).catch(() => {}).then(() => { if (still) draw(); });
    start();
    return () => {
      cancelAnimationFrame(m.raf);
      ro.disconnect(); io.disconnect();
      el.removeEventListener("pointerdown", tap);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [zero, full]);

  useEffect(() => {
    const src = picture?.src;
    if (!src || pictures.has(src)) { redraw.current?.(); return undefined; }
    let gone = false;
    pressed(src).then((c) => { if (!gone && c) { pictures.set(src, c); redraw.current?.(); } });
    return () => { gone = true; };
  }, [picture?.src]);

  // A moved level sets the surface going, then settles
  useEffect(() => { splashRef?.current?.splash?.(box.current.clientWidth * 0.5, 4); redraw.current?.(); }, [ratio, roll]); // eslint-disable-line react-hooks/exhaustive-deps
  // `mark` stands for anything else the paint reads. When it changes, a tank that's holding still draws again.
  useEffect(() => { redraw.current?.(); }, [mark]);

  return (
    <div ref={box} className={`tank ${className}`} style={height ? { height } : undefined} role="img" aria-label={label}>
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  );
}

export const moneyFont = (px) => `800 ${px}px Unbounded, "Arial Black", sans-serif`;
export const textFont = (px, weight = 500) => `${weight} ${px}px Geist, system-ui, sans-serif`;

// The biggest size a figure can be and still fit
export function fitFont(ctx, text, room, most) {
  ctx.font = moneyFont(100);
  const at100 = ctx.measureText(text).width || 1;
  return Math.min(most, Math.floor((room / at100) * 100));
}
export { TAU };
