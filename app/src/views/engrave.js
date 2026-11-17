// A picture cut into lines, the way a banknote's portrait is: one set of curved lines that swell where
// the picture is light. Works on any picture, so a trader's own photo prints the same way as a painting.
// All of it happens on a canvas, so the saved image matches the screen.

const step = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Where a picture may show on each card, as parts of the card's width and height: a rounded shape
// grown from a point, usually the corner, so the picture runs off the card's edge like a trimmed print and
// stops before it reaches the chart or the money. "chart" is the card with a chart under the picture,
// "open" is the card without one. A hard window ends on a clean edge, and the words sit on bare paper beside it.
export const WINDOWS = {
  post: {
    chart: { cx: 1, cy: 0, rx: 0.72, ry: 0.27, top: 0.2, clear: [0.3, 0.16], hard: true },
    open: { cx: 1, cy: 0, rx: 0.705, ry: 0.41, hard: true },
  },
  story: {
    chart: { cx: 1, cy: 0, rx: 0.68, ry: 0.36, clear: [0.33, 0.11], hard: true },
    open: { cx: 1, cy: 0, rx: 0.67, ry: 0.585, hard: true },
  },
  wide: {
    chart: { cx: 0.3, cy: 0, rx: 0.17, ry: 0.36, clear: [0.2, 0.19], hard: true },
    open: { cx: 1, cy: 0.5, rx: 0.533, ry: 1.032, hard: true },
  },
};
export const LOOK = { x: 0, y: 0, zoom: 1, strength: 1 };
const FILL = 1.11; // how far past the window a picture sits at first, so there's room to move it

// Line spacing, in parts of 1080 of the card's width. Wide's picture is smaller on the card, so its lines are finer.
export const WEIGHT = { wide: 5, post: 7, story: 7 };

// Where the pictures cut for this card sit when there's no chart: w is the drawn width in the card's own pixels, f a
// point on the picture, c where that point lands on the card. tone: a and b are the black and white points, gamma the
// line weight, s how hard tones go to fat line or none, sharpen and calm the detail kept, relight how far the broad
// light is evened out. Any other picture starts from its window, and every picture can still be dragged and zoomed.
const CARD_W = { wide: 720, post: 540, story: 360 };
const OLD_MASTER = { a: 0.05, b: 0.76, gamma: 0.92, s: 0.5, sharpen: 1, calm: 0.3, relight: 0.4 };
export const PLACE = {
  "masters/wanderer-friedrich": {
    wide: { w: 888, f: [0.5, 0.355], c: [0.774, 0.22] },
    post: { w: 620, f: [0.5, 0.355], c: [0.66, 0.2] },
    story: { w: 620, f: [0.5, 0.355], c: [0.66, 0.16] },
    tone: OLD_MASTER,
  },
  "masters/self-portrait-rembrandt": {
    wide: { w: 590, f: [0.56, 0.29], c: [0.745, 0.46] },
    post: { w: 452, f: [0.56, 0.27], c: [0.685, 0.235] },
    story: { w: 500, f: [0.56, 0.28], c: [0.66, 0.255] },
    tone: OLD_MASTER,
  },
  "masters/jerome-writing-caravaggio": {
    wide: { w: 520, f: [0.72, 0.22], c: [0.936, 0.285] },
    post: { w: 760, f: [0.7, 0.3], c: [0.62, 0.23] },
    story: { w: 880, f: [0.7, 0.3], c: [0.56, 0.26] },
    tone: { a: 0.03, b: 0.85, gamma: 1, s: 0.45, sharpen: 1.6, calm: 0.2 },
  },
  "masters/magdalen-la-tour": {
    wide: { w: 600, f: [0.41, 0.135], c: [0.64, 0.25] },
    post: { w: 430, f: [0.38, 0.135], c: [0.56, 0.125] },
    story: { w: 470, f: [0.38, 0.135], c: [0.4, 0.132] },
    tone: { a: 0.05, b: 0.72, gamma: 0.9, s: 0.45, sharpen: 1.4, calm: 0.25, relight: 0.3 },
  },
  "anime/ronin": {
    wide: { w: 800, f: [0.56, 0.42], c: [0.77, 0.47] },
    post: { w: 600, f: [0.56, 0.42], c: [0.64, 0.25] },
    story: { w: 720, f: [0.58, 0.42], c: [0.54, 0.27] },
    tone: { a: 0.05, b: 0.95, gamma: 1.5 },
  },
};
export const placeOf = (path, kind, plate) => {
  const p = plate === "open" && PLACE[path]?.[kind];
  return p ? { ...p, w: p.w / CARD_W[kind] } : null;
};
export const toneOf = (path) => PLACE[path]?.tone || null;

// How much of a picture's spare height goes above the frame. A tall picture's face is near its top; a wide
// one is framed through the middle.
export const upOf = (iw, ih, top) => (ih > iw ? top ?? 0.1 : 0.45);

const boxOf = (win, W, H) => {
  const x = Math.max(0, win.cx - win.rx), y = Math.max(0, win.cy - win.ry), r = Math.min(1, win.cx + win.rx), b = Math.min(1, win.cy + win.ry);
  return { x: x * W, y: y * H, w: (r - x) * W, h: (b - y) * H };
};

// Where the picture lands on the card. It always covers the window, so no edge of it ever shows. `place` is a
// picture's own first position, from placeOf; without one it starts centred on its window.
export function placement(iw, ih, W, H, win, look = LOOK, place = null) {
  const b = boxOf(win, W, H);
  const cover = Math.max(b.w / iw, b.h / ih);
  const k = (place ? Math.max(cover, (place.w * W) / iw) : cover * FILL) * (look.zoom || 1);
  const w = iw * k, h = ih * k;
  const startX = place ? place.c[0] * W - place.f[0] * w : b.x + (b.w - w) / 2;
  const startY = place ? place.c[1] * H - place.f[1] * h : b.y + (b.h - h) * upOf(iw, ih, win.top);
  const x = clamp(startX + (look.x || 0) * W, b.x + b.w - w, b.x), y = clamp(startY + (look.y || 0) * W, b.y + b.h - h, b.y);
  return { x, y, w, h, look: { ...look, x: (x - startX) / W, y: (y - startY) / W } };
}

// How much of the picture to keep at a point: all of it inside the window, none past it
export function keepOf(win, W, H) {
  const edge = win.hard ? [1 - 2.5 / W, 1 + 2.5 / W] : [0.72, 1];
  return (px, py) => {
    const a = Math.abs(px / W - win.cx) / win.rx, b = Math.abs(py / H - win.cy) / win.ry;
    const k = 1 - step(edge[0], edge[1], Math.cbrt(a * a * a + b * b * b));
    if (!win.clear) return k;
    // and the lines stop short of the logo
    return k * (1 - (1 - step(win.clear[0], win.clear[0] + 0.08, px / W)) * (1 - step(win.clear[1], win.clear[1] + 0.05, py / H)));
  };
}

// A box blur, twice, over a grey picture
function blurred(src, w, h, r) {
  let from = src;
  const to = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += from[y * w + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        to[y * w + x] = sum / (2 * r + 1);
        sum += from[y * w + clamp(x + r + 1, 0, w - 1)] - from[y * w + clamp(x - r, 0, w - 1)];
      }
    }
    const out = new Float32Array(w * h);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += to[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / (2 * r + 1);
        sum += to[clamp(y + r + 1, 0, h - 1) * w + x] - to[clamp(y - r, 0, h - 1) * w + x];
      }
    }
    from = out;
  }
  return from;
}

// The picture's tones, stretched to the darkest and lightest inside its window, read a point at a time and given as
// how much line to draw there
function tones(img, at, W, H, keep, tone, gap, dark) {
  const t = { a: 0, b: 1, gamma: dark ? 1.5 : 1.15, s: 0, sharpen: 0, relight: 0, calm: 0, ...tone };
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(W / 2), height: Math.round(H / 2) });
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, at.x / 2, at.y / 2, at.w / 2, at.h / 2);
  const d = ctx.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height, w = c.width, h = c.height;
  const lum = new Float32Array(n), seen = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const v = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    lum[i] = v;
    if (keep((i % w) * 2, ((i / w) | 0) * 2) > 0.5) { seen[v | 0]++; count++; }
  }
  let lo = 0, hi = 255, sum = 0;
  while (lo < 250 && (sum += seen[lo]) < count * 0.02) lo++;
  sum = 0;
  while (hi > lo + 4 && (sum += seen[hi]) < count * 0.005) hi--;
  const base = t.calm ? blurred(lum, w, h, Math.max(1, Math.round((gap / 2) * t.calm))) : lum; // takes the craquelure off, so lines swell and don't speckle
  const soft = t.sharpen ? blurred(base, w, h, Math.max(2, Math.round(w / 200))) : null;
  const broad = t.relight ? blurred(base, w, h, Math.round(w / 14)) : null; // lifts a dark wall and holds a bright head down
  return (px, py) => {
    const i = clamp((py / 2) | 0, 0, h - 1) * w + clamp((px / 2) | 0, 0, w - 1);
    let v = soft ? base[i] + t.sharpen * (base[i] - soft[i]) : base[i];
    if (broad) v = lo + Math.max(0, v - lo) * clamp(((lo + hi) / 2 / Math.max(broad[i], 1)) ** t.relight, 0.5, 2.6);
    const light = clamp(((v - lo) / (hi - lo) - t.a) / (t.b - t.a), 0, 1);
    const x = (dark ? light : 1 - light) ** t.gamma;
    return x + t.s * (x * x * (3 - 2 * x) - x);
  };
}

// One set of arched lines across the picture. `weight` is the spacing in parts of 1080 of the card's width, so a saved
// card's lines are the same on any screen. `unit` scales the rest down for a quick draft while a picture is being dragged.
export function engrave(ctx, img, at, W, H, { ink, keep, dark, strength = 1, unit = 1, weight = 7, tone = null }) {
  const gap = (weight * W) / 1080, most = gap * 0.82 * strength, arch = (44 * W) / 1080, pace = Math.max(1, 2 * unit);
  const read = tones(img, at, W, H, keep, tone, gap, dark);
  ctx.fillStyle = ink;
  for (let y = -arch - gap; y < H + arch + gap; y += gap) {
    const top = [], bot = [];
    for (let px = 0; px <= W + pace; px += pace) {
      const u = (px - W / 2) / (W / 2);
      const yy = y + arch * (u * u) + 1.4 * unit * Math.sin((px / unit) * 0.018 + (y / unit) * 0.02);
      const k = keep(px, yy);
      const t = k <= 0 ? 0 : read(px, yy) * most * k;
      top.push(px, yy - t / 2);
      bot.push(px, yy + t / 2);
    }
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    for (let i = 2; i < top.length; i += 2) ctx.lineTo(top[i], top[i + 1]);
    for (let i = bot.length - 2; i >= 0; i -= 2) ctx.lineTo(bot[i], bot[i + 1]);
    ctx.closePath();
    ctx.fill();
  }
}

// The carbon finish's weave, drawn on the canvas the picture is printed on
export function weave(ctx, W, H, scale) {
  const lines = (angle, alpha) => {
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 2 * scale;
    const gap = 4 * scale * Math.SQRT2, far = W + H;
    ctx.beginPath();
    for (let d = -far; d < far; d += gap) {
      ctx.moveTo(d, 0);
      ctx.lineTo(d + angle * H, H);
    }
    ctx.stroke();
  };
  lines(1, 0.055);
  lines(-1, 0.03);
}
