import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export const GODS = {
  "apollo-light": { width: 700, th: 6, br: 3, cl: 5, crop: [170, 40, 620, 467], focus: [360, 180], box: [-0.32, -0.02, 1.5, 1.12] },
  "goddess-shadow": {
    width: 600, crop: [130, 230, 450, 611], focus: [300, 420], levels: [0.04, 0.55],
    shape: [[240, 272], [300, 262], [360, 272], [395, 300], [415, 350], [420, 420], [405, 470], [380, 500], [345, 520], [345, 560], [352, 640], [228, 640], [240, 560], [235, 520], [205, 500], [175, 470], [140, 440], [118, 400], [125, 350], [160, 310], [200, 285]],
  },
  "headband-hero": { width: 600, th: 30, br: 3, cl: 4, crop: [130, 218, 470, 623], focus: [290, 430] },
  "hercules-dark": { width: 1200, th: 17.5, br: 2, cl: 6, crop: [230, 30, 590, 459], focus: [420, 170] },
  "david-curls": {
    width: 600, crop: [150, 222, 550, 698], focus: [350, 470], levels: [0.02, 0.36],
    shape: [[300, 236], [360, 238], [420, 250], [455, 290], [475, 340], [470, 390], [440, 420], [430, 450], [405, 475], [408, 500], [395, 525], [390, 560], [385, 590], [410, 588], [470, 585], [540, 600], [570, 640], [600, 700], [600, 720], [205, 720], [212, 640], [180, 600], [130, 560], [110, 500], [95, 440], [100, 400], [120, 350], [150, 310], [200, 275], [250, 250]],
  },
  "crowned-queen": { width: 600, th: 12, br: 3, cl: 4, crop: [140, 133, 470, 527], focus: [300, 375], levels: [0.04, 0.55] },
  "muse-dark": { width: 1600, th: 20, br: 3, cl: 4, crop: [820, 166, 1180, 595], focus: [1010, 330] },
  "titan-silhouette": { width: 600, th: 110, br: 3, cl: 3, dark: true, crop: [80, 60, 480, 536], focus: [310, 140], ink: 0.6 },
  "winged-angel": { width: 600, th: 170, br: 2, cl: 3, dark: true, crop: [90, 440, 510, 940], focus: [305, 600] },
};
const BOX = [0, 0, 1, 1];

// Inside a polygon (even-odd rule)
const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/* ---------- Cut out (tools/prep.cjs) ---------- */

const boxBlur = (a, w, h, r) => {
  const n = w * h, t = new Float32Array(n), o = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; c++; } } t[y * w + x] = s / c; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += t[yy * w + x]; c++; } } o[y * w + x] = s / c; }
  return o;
};

async function cutOut(god, g) {
  const { data, info } = await sharp(root(`public/art/gods/${god}.webp`)).resize(g.width).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  let m = new Uint8Array(n);
  if (g.shape) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inside(g.shape, x + 0.5, y + 0.5) ? 1 : 0;
  } else {
    const bl = boxBlur(lum, w, h, g.br);
    for (let i = 0; i < n; i++) m[i] = (g.dark ? bl[i] < g.th : bl[i] > g.th) ? 1 : 0;
  }
  // close small gaps: grow, then shrink, by cl pixels
  const morph = (a, r, grow) => { const o = new Uint8Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = grow ? 0 : 1; for (let dy = -r; dy <= r && (grow ? !v : v); dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const xx = x + dx, yy = y + dy; const k = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : a[yy * w + xx]; if (grow && k) { v = 1; break; } if (!grow && !k) { v = 0; break; } } o[y * w + x] = v; } return o; };
  if (g.cl) m = morph(morph(m, g.cl, true), g.cl, false);
  // keep the largest piece
  const lab = new Int32Array(n).fill(-1); let best = -1, bestN = 0, id = 0;
  for (let i = 0; i < n; i++) if (m[i] && lab[i] < 0) {
    const st = [i]; lab[i] = id; let cnt = 0;
    while (st.length) { const j = st.pop(); cnt++; const x = j % w, y = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const k = yy * w + xx; if (m[k] && lab[k] < 0) { lab[k] = id; st.push(k); } } }
    if (cnt > bestN) { bestN = cnt; best = id; }
    id++;
  }
  for (let i = 0; i < n; i++) m[i] = lab[i] === best ? 1 : 0;
  // fill holes: flood the background in from the border
  const bg = new Uint8Array(n), st = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const j = st.pop(); if (bg[j] || m[j]) continue; bg[j] = 1; const x = j % w, y = (j / w) | 0; if (x > 0) st.push(j - 1); if (x < w - 1) st.push(j + 1); if (y > 0) st.push(j - w); if (y < h - 1) st.push(j + w); }
  const mf = new Float32Array(n);
  for (let i = 0; i < n; i++) mf[i] = bg[i] ? 0 : 1;
  const soft = boxBlur(mf, w, h, 1);
  const rgba = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { rgba[i * 4] = data[i * 3]; rgba[i * 4 + 1] = data[i * 3 + 1]; rgba[i * 4 + 2] = data[i * 3 + 2]; rgba[i * 4 + 3] = Math.round(Math.min(1, soft[i] * 1.15) * 255); }
  return { rgba, w, h };
}

function sample({ rgba, w, h }, [lo, hi] = [0, 1]) {
  const n = w * h, L = new Float32Array(n), A = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    A[i] = rgba[i * 4 + 3] / 255;
    const l = Math.min(1, Math.max(0, ((0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2]) / 255 - lo) / (hi - lo)));
    L[i] = (1 - l) * A[i];
  }
  // the same running box blur as engrave.js
  const blur = (a, r) => { const o = new Float32Array(n), t = new Float32Array(n);
    for (let y = 0; y < h; y++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) { t[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) { o[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    return o; };
  return { L: blur(L, 1), Lbig: blur(L, 14), A, W: w, H: h };
}

function hatch(S, deg, sp, weight, bend, crop, phase = 0) {
  const [x0, y0, x1, y1] = crop, a = (deg * Math.PI) / 180, dir = [Math.cos(a), Math.sin(a)], nrm = [-dir[1], dir[0]];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 4;
  const at = (arr, x, y) => { const xi = Math.max(0, Math.min(S.W - 1, Math.round(x))), yi = Math.max(0, Math.min(S.H - 1, Math.round(y))); return arr[yi * S.W + xi]; };
  const runs = [];
  for (let k = -R + phase; k <= R; k += sp) {
    let run = null;
    for (let u = -R; u <= R; u += 1.5) {
      let x = cx + dir[0] * u + nrm[0] * k, y = cy + dir[1] * u + nrm[1] * k;
      const off = (at(S.Lbig, x, y) - 0.35) * bend * sp;
      x += nrm[0] * off; y += nrm[1] * off;
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1 && at(S.A, x, y) > 0.5;
      const hw = inside ? weight(at(S.L, x, y)) : 0;
      if (hw > 0.12) { if (!run) run = []; run.push([x, y, hw]); }
      else if (run) { if (run.length > 2) runs.push(run); run = null; }
    }
    if (run && run.length > 2) runs.push(run);
  }
  return runs;
}

const length = (run) => { let s = 0; for (let i = 1; i < run.length; i++) s += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]); return s; };

function outline(S, crop) {
  const segs = [], [x0, y0, x1, y1] = crop, st = 3;
  const v = (x, y) => (x < 0 || y < 0 || x >= S.W || y >= S.H ? 0 : S.A[y * S.W + x] > 0.5 ? 1 : 0);
  for (let y = y0; y < y1 - st; y += st) for (let x = x0; x < x1 - st; x += st) {
    const c = v(x, y) | (v(x + st, y) << 1) | (v(x + st, y + st) << 2) | (v(x, y + st) << 3);
    if (c === 0 || c === 15) continue;
    const e = [[x + st / 2, y], [x + st, y + st / 2], [x + st / 2, y + st], [x, y + st / 2]];
    const T = { 1: [3, 0], 2: [0, 1], 3: [3, 1], 4: [1, 2], 5: [3, 2], 6: [0, 2], 7: [3, 2], 8: [2, 3], 9: [0, 2], 10: [0, 3], 11: [1, 2], 12: [1, 3], 13: [0, 1], 14: [0, 3] }[c];
    const edge = x <= 8 || x >= S.W - 8 - st || y >= S.H - 8 - st || x <= x0 + st || x >= x1 - 2 * st || y >= y1 - 2 * st;
    if (T && !edge) segs.push([e[T[0]], e[T[1]]]);
  }
  const key = (p) => `${p[0]},${p[1]}`, map = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!map.has(k)) map.set(k, []); map.get(k).push(i); } });
  const used = new Set(), lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue; used.add(i);
    const line = [segs[i][0], segs[i][1]];
    for (let grow = true; grow;) { grow = false; const end = line[line.length - 1];
      for (const j of map.get(key(end)) || []) if (!used.has(j)) { used.add(j); const s = segs[j]; line.push(key(s[0]) === key(end) ? s[1] : s[0]); grow = true; break; } }
    if (line.length > 8) {
      let q = line.filter((_, k) => k % 3 === 0 || k === line.length - 1);
      for (let r = 0; r < 3; r++) { const o = [q[0]]; for (let k = 0; k < q.length - 1; k++) { const a = q[k], b = q[k + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(q[q.length - 1]); q = o; }
      lines.push(q.map((p) => [p[0], p[1], 0.55]));
    }
  }
  return lines.filter((l) => length(l) > 260).sort((a, b) => Math.min(...a.map((p) => p[1])) - Math.min(...b.map((p) => p[1])));
}

function simplify(run, tol = 0.18, wtol = 0.05) {
  if (run.length < 9) return run;
  const out = run.slice(0, 3);
  for (let i = 3; i < run.length - 3; i++) {
    const a = out[out.length - 1], b = run[i], c = run[i + 1];
    const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const off = Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / l;
    const t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (l * l);
    const wmid = a[2] + (c[2] - a[2]) * t;
    if (off > tol || Math.abs(b[2] - wmid) > Math.max(wtol, b[2] * 0.08)) out.push(b);
  }
  return out.concat(run.slice(-3));
}

export async function engrave(god, { angle = -30, sp = 5 } = {}) {
  const g = GODS[god];
  const cut = await cutOut(god, g);
  const S = sample(cut, g.levels);
  const { crop, focus } = g;
  const byFocus = (runs) => runs.map((r) => ({ r, d: Math.min(...r.map((p) => Math.hypot(p[0] - focus[0], p[1] - focus[1]))) })).sort((a, b) => a.d - b.d).map((o) => o.r);
  const passes = [
    g.shape ? [] : outline(S, crop), // a hand-drawn outline is only a guide, never drawn
    byFocus(hatch(S, angle, sp, (L) => Math.pow(L, 1.1) * sp * 0.336 * (g.ink ?? 1), 0.9, crop)),
    byFocus(hatch(S, angle, sp, (L) => Math.max(0, L - 0.34) * sp * 0.195 * (g.ink ?? 1), 0.9, crop, sp / 2)),
  ];
  const r1 = (v) => Math.round(v * 10) / 10;
  const json = {
    god, w: cut.w, h: cut.h, crop, focus, box: g.box || BOX,
    passes: passes.map((runs) => runs.map((run) => simplify(run).flatMap((p) => [r1(p[0]), r1(p[1]), Math.max(0.1, r1(p[2]))]))),
  };
  return { json, cut };
}

/* ---------- Previews ---------- */

export function ovalSVG(E, ow = 168, oh = 200, k = 3) {
  const [cx0, cy0, cx1, cy1] = E.crop;
  const bx = E.box[0] * ow, by = E.box[1] * oh, bw = E.box[2] * ow, bh = E.box[3] * oh;
  const sc = Math.min(bw / (cx1 - cx0), bh / (cy1 - cy0));
  const ox = bx + (bw - (cx1 - cx0) * sc) / 2 - cx0 * sc, oy = by + (bh - (cy1 - cy0) * sc) / 2 - cy0 * sc;
  let d = "";
  for (const pass of E.passes) for (const flat of pass) {
    const pts = []; for (let i = 0; i < flat.length; i += 3) pts.push(flat.slice(i, i + 3));
    const left = [], right = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const taper = Math.min(1, i / 3 + 0.35, (pts.length - 1 - i) / 3 + 0.35);
      const hw = Math.max(0.28, p[2] * taper) * sc;
      const X = p[0] * sc + ox, Y = p[1] * sc + oy;
      left.push([X - dy * hw, Y + dx * hw]); right.push([X + dy * hw, Y - dx * hw]);
    });
    d += `M${left.map((q) => q.map((v) => (v * k).toFixed(1)).join(",")).join("L")}L${right.reverse().map((q) => q.map((v) => (v * k).toFixed(1)).join(",")).join("L")}Z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ow * k}" height="${oh * k}"><defs><clipPath id="o"><ellipse cx="${ow * k / 2}" cy="${oh * k / 2}" rx="${ow * k / 2}" ry="${oh * k / 2}"/></clipPath></defs><rect width="100%" height="100%" fill="#f2f1ed"/><g clip-path="url(#o)"><path d="${d}" fill="#1b1b1d"/></g><ellipse cx="${ow * k / 2}" cy="${oh * k / 2}" rx="${ow * k / 2 - 1.5}" ry="${oh * k / 2 - 1.5}" fill="none" stroke="#2a2a2c" stroke-width="3"/></svg>`;
}

async function preview(dir, god, json, cut) {
  const g = GODS[god], [x0, y0, x1, y1] = g.crop;
  const grid = [];
  for (let x = 0; x < cut.w; x += 50) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${cut.h}" stroke="${x % 100 ? "#f0f3" : "#f0f9"}"/>${x % 100 ? "" : `<text x="${x + 2}" y="12" font-size="11" fill="#f0f">${x}</text>`}`);
  for (let y = 0; y < cut.h; y += 50) grid.push(`<line x1="0" y1="${y}" x2="${cut.w}" y2="${y}" stroke="${y % 100 ? "#f0f3" : "#f0f9"}"/>${y % 100 ? "" : `<text x="2" y="${y - 2}" font-size="11" fill="#f0f">${y}</text>`}`);
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cut.w}" height="${cut.h}">${grid.join("")}<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="#0f0" stroke-width="2"/><circle cx="${g.focus[0]}" cy="${g.focus[1]}" r="5" fill="#0f0"/></svg>`);
  await sharp(cut.rgba, { raw: { width: cut.w, height: cut.h, channels: 4 } }).flatten({ background: "#5a6a8a" }).composite([{ input: over }]).png().toFile(`${dir}/${god}-cut.png`);
  await sharp(Buffer.from(ovalSVG(json))).png().toFile(`${dir}/${god}-oval.png`);
}

/* ---------- Run ---------- */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const pi = args.indexOf("--preview");
  const dir = pi >= 0 ? args.splice(pi, 2)[1] : null;
  const names = args.length ? args : Object.keys(GODS);
  mkdirSync(root("public/art/engraved"), { recursive: true });
  if (dir) mkdirSync(dir, { recursive: true });
  for (const god of names) {
    if (!GODS[god]) { console.error(`No god called ${god}`); process.exitCode = 1; continue; }
    const { json, cut } = await engrave(god);
    const text = JSON.stringify(json);
    writeFileSync(root(`public/art/engraved/${god}.json`), text);
    const lines = json.passes.reduce((a, p) => a + p.length, 0), pts = json.passes.reduce((a, p) => a + p.reduce((b, r) => b + r.length / 3, 0), 0);
    console.log(`${god}: ${lines} lines, ${pts} points, ${(text.length / 1024).toFixed(0)} KB`);
    if (dir) await preview(dir, god, json, cut);
  }
}
