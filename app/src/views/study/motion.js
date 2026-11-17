export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const turnEase = (t) => inOut(t) * 0.7 + easeOut(t) * 0.3;
export const fadeEase = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function animate(ms, fn, ease = inOut, done) {
  const manual = typeof window !== "undefined" && Array.isArray(window.__studyFrames) && window.__studyFrames;
  if (manual) {
    const a = { ms, fn, ease, done, t: 0 };
    manual.push(a);
    fn(ease(0), 0);
    return () => { a.dead = true; };
  }
  let raf = 0, t0 = null, stopped = false;
  const step = (now) => {
    if (stopped) return;
    if (t0 == null) t0 = now;
    const t = clamp((now - t0) / ms, 0, 1);
    fn(ease(t), t);
    if (t < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
if (typeof window !== "undefined" && window.__studyFrames) {
  window.__studyStep = (dt) => {
    const q = window.__studyFrames || [];
    for (const a of [...q]) {
      if (a.dead) { q.splice(q.indexOf(a), 1); continue; }
      a.t = Math.min(a.ms, a.t + dt);
      a.fn(a.ease(a.t / a.ms), a.t / a.ms);
      if (a.t >= a.ms) { q.splice(q.indexOf(a), 1); a.done?.(); }
    }
    return q.length;
  };
}
