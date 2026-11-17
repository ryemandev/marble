// The ink's drips, right to left: where, how wide, how far ahead of the line, when it sets off. They end
// round with straight sides, like the drips on the logo.
const DRIPS = [[0.95, 0.03, 0.3, 0.12], [0.84, 0.016, 0.52, 0.03], [0.73, 0.038, 0.22, 0.22], [0.61, 0.02, 0.44, 0.07], [0.49, 0.032, 0.28, 0.16], [0.37, 0.018, 0.6, 0], [0.26, 0.04, 0.24, 0.2], [0.14, 0.018, 0.48, 0.02], [0.05, 0.03, 0.32, 0.1]];
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const out = (t) => 1 - (1 - t) ** 3;

// cubic-bezier(.65,0,.35,1), the same curve as --pour in drip.css
export const eased = (function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const miss = X(t) - x; if (Math.abs(miss) < 1e-5) break; t -= miss / dX(t); }
    return Y(t);
  };
})(0.65, 0, 0.35, 1);

// The line itself at t. Off screen, it starts above the top and the drips arrive first. On screen, it starts on the
// top edge, so the ink is there from the first frame.
export const lineAt = (H, t, onScreen = false) => (onScreen ? eased(t) * (H + 2) : -0.66 * H + inOut(t) * (1.74 * H));

// The edge of the ink at a moment in the pour, t from 0 to 1, as a vector path
export function pourPath(W, H, t, onScreen = false) {
  const n = (v) => v.toFixed(1);
  const base = lineAt(H, t, onScreen);
  const top = n(Math.min(base, -1) - 2000);
  let d = `M0 ${top}L${W} ${top}L${W} ${n(base)}`;
  for (const [cx, w, reach, at] of DRIPS) {
    const x = cx * W, r = Math.min(30, Math.max(7, w * W));
    const tip = base + reach * H * out(Math.min(1, Math.max(0, (t - at) / 0.6)));
    if (tip < base + 3) continue;
    const f = Math.min(r * 0.9, (tip - base) * 0.5); // the curve where the drip leaves the line
    const end = Math.max(base + f, tip - r); // where the round end begins
    d += `L${n(x + r + f)} ${n(base)}Q${n(x + r)} ${n(base)} ${n(x + r)} ${n(base + f)}L${n(x + r)} ${n(end)}A${n(r)} ${n(tip - end)} 0 0 1 ${n(x - r)} ${n(end)}L${n(x - r)} ${n(base + f)}Q${n(x - r)} ${n(base)} ${n(x - r - f)} ${n(base)}`;
  }
  return `${d}L0 ${n(base)}Z`;
}
