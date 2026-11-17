import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MoneyText } from "../drip/Money";
import { Icon } from "../components/ui";
import { VIEW, LETTERS, DRIPS } from "../components/Logo";
import { Modal, reducedMotion } from "../components/overlay";
import { SAMPLE, fmtMoney, plural } from "../data";
import { LIVE, MONEY_CARDS } from "../mode";
import { getState, useStore } from "../store";
import { marketCode, marketMark } from "../lib/markets";
import { DOW, pad } from "../lib/basics.js";
import { nyOf } from "../live/time";
import { utcOf, worldOf } from "../world";
import { STAGES, isSample, simulated, stageOf } from "../drip/accounts";
import { FINISHES, byStage, finishFor, keyOf, nextFinish, stampOf, unfolded, useCloses } from "../drip/week";
import { sourceWord } from "../lib/trail";
import { LOOK, WEIGHT, WINDOWS, engrave, keepOf, placeOf, placement, toneOf, upOf, weave } from "./engrave";
import { canChart, frameFor, sampleBars, seedOf, tickOf } from "./flexbars";
import { DayChart, TradeChart } from "./FlexChart";
import { OWN_LIMIT_MB, SHELVES, addOwn, dropOwn, isOwn, loadOwn, onFlexReset, pick, pictureUrl, setFlexStyle, setLook, shelfOf, useFlexStyle, useLook, useOwnPictures, usePicture } from "./flexpics";
import { logoSvg } from "./marketlogos";
import "./flex.css";

const SITE = "trademarble.app";

export const FORMATS = {
  wide: { label: "Wide", hint: "16:9", where: "X, YouTube", w: 720, h: 405 },
  post: { label: "Post", hint: "1:1", where: "Instagram, Discord", w: 540, h: 540 },
  story: { label: "Story", hint: "9:16", where: "Stories, TikTok", w: 360, h: 640 },
};
// The month's total is off unless a trader turns it on, and it never counts days up
export const SHOW = { money: true, record: false, handle: true, chart: true, levels: true, logo: true, held: true, date: true, number: true };

// Where things sit on each size of card, in the card's own pixels. big is the size and line of the two big lines and
// the room they have; a square card with a chart sets them smaller, so the chart keeps its height.
const LAYOUT = {
  post: { mark: 116, big: [92, 96, 480], charted: [64, 68, 480], type: 12.5, chart: { w: 540, h: 540, x0: 30, ax: 510, y0: 150, y1: 262 } },
  // The times under a Story chart end at y1 + 20, and the big lines under them start at 388
  story: { mark: 92, big: [64, 68, 316], type: 11.5, chart: { w: 360, h: 640, x0: 22, ax: 338, y0: 232, y1: 350 } },
  wide: { mark: 104, big: [60, 64, 300], type: 12, chart: { w: 720, h: 405, x0: 350, ax: 694, y0: 34, y1: 350 } },
};

/* ---------- The picture ---------- */

// A card's picture covers the whole card and is printed at the saved image's size. A mini sits behind a
// tile's words. Everything is drawn once, so the saved image matches the screen.
const PHOTO = {
  post: { w: 540, h: 540, scale: 2 },
  story: { w: 360, h: 640, scale: 3 },
  wide: { w: 720, h: 405, scale: 1920 / 720 },
  mini: { w: 240, h: 132, scale: 2, src: 480 },
};
const PAPER = { white: "#fff", silver: "#cfcfcc", black: "#000", carbon: "#0b0b0b" };
const DARK = { black: true, carbon: true };
// A full card's picture has a window of its own, so it can use nearly every tone. A mini's stops at panel
// grey: it meets a white page, and the panel's edge has to hold.
const MINI = { white: [0, 0.953], silver: [0, 0.82], black: [0, 0.953], carbon: [0.045, 0.953] };
const PLATE = { white: [0, 1], silver: [0, 0.82], black: [0, 0.94], carbon: [0.045, 0.94] };
const WEAVE = 2 ** -0.5;
const KEEP = 72; // baked pictures held in memory
const baked = new Map();
const images = new Map();
const sizes = new Map(); // how big each picture is, for keeping a dragged one over its window

// Hard black and white, stretched to this crop's own darkest and lightest so a dim picture holds up.
// With `keep`, the picture fades to bare paper outside its window.
function press(d, W, H, finish, scale, tone = MINI, keep = null, strength = 1) {
  const [lo, hi] = tone[finish] || tone.white;
  const count = W * H, grey = new Float32Array(count), seen = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    const v = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    grey[i] = v;
    seen[Math.min(255, v | 0)]++;
  }
  let dark = 0, light = 255, sum = 0;
  while (dark < 254 && (sum += seen[dark]) < count * 0.02) dark++;
  sum = 0;
  while (light > dark + 1 && (sum += seen[light]) < count * 0.02) light--;
  const carbon = finish === "carbon", hard = !keep, ground = DARK[finish] ? 0 : 1;
  for (let i = 0; i < count; i++) {
    let c = Math.min(1, Math.max(0, (grey[i] - dark) / (light - dark)));
    c = c * c * (3 - 2 * c);
    if (hard) c = c * c * (3 - 2 * c); // a mini is small, so it spends its tones on edges
    if (keep) c = ground + (c - ground) * Math.min(1, keep(i % W, (i / W) | 0) * strength);
    let g = lo + (hi - lo) * c;
    if (carbon) { // the same weave the bare finish shows, carried through the picture
      const x = (i % W) / scale, y = ((i / W) | 0) / scale;
      if (((x + y) * WEAVE) % 4 < 2) g += (1 - g) * 0.055;
      if (((x - y + 4096) * WEAVE) % 4 < 2) g += (1 - g) * 0.03;
    }
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g * 255;
  }
}

const canvasOf = (W, H) => {
  const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
  return [c, c.getContext("2d", { willReadFrequently: true })];
};

// A mini: the top of the tile, pressed like the card. The words sit under it on solid paper.
function printMini(img, p, finish) {
  const W = Math.round(p.w * p.scale), H = Math.round(p.h * p.scale);
  const [c, ctx] = canvasOf(W, H);
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight), sw = W / k, sh = H / k;
  ctx.drawImage(img, (img.naturalWidth - sw) * 0.6, (img.naturalHeight - sh) * upOf(img.naturalWidth, img.naturalHeight), sw, sh, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H);
  press(px.data, W, H, finish, p.scale);
  ctx.putImageData(px, 0, 0);
  return c.toDataURL("image/jpeg", 0.9);
}

// A full card's picture, in its window, on the finish's own paper
function printCard(img, kind, finish, o, path) {
  const p = PHOTO[kind], unit = o.draft ? 0.5 : 1;
  const W = Math.round(p.w * p.scale * unit), H = Math.round(p.h * p.scale * unit);
  const [c, ctx] = canvasOf(W, H);
  const win = WINDOWS[kind][o.plate], at = placement(img.naturalWidth, img.naturalHeight, W, H, win, o.look, placeOf(path, kind, o.plate));
  const keep = keepOf(win, W, H);
  ctx.fillStyle = PAPER[finish] || PAPER.black;
  ctx.fillRect(0, 0, W, H);
  if (o.style === "photo") {
    ctx.drawImage(img, at.x, at.y, at.w, at.h);
    const px = ctx.getImageData(0, 0, W, H);
    press(px.data, W, H, finish, p.scale * unit, PLATE, keep, o.look.strength);
    ctx.putImageData(px, 0, 0);
  } else {
    if (finish === "carbon") weave(ctx, W, H, p.scale * unit);
    engrave(ctx, img, at, W, H, { ink: DARK[finish] ? "#fff" : "#000", keep, dark: !!DARK[finish], strength: o.look.strength, unit, weight: WEIGHT[kind], tone: toneOf(path) });
  }
  return c.toDataURL("image/jpeg", o.draft ? 0.72 : 0.92);
}

const load = (url) => {
  if (!images.has(url)) {
    const job = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    job.catch(() => images.delete(url));
    images.set(url, job);
    if (images.size > 24) images.delete(images.keys().next().value);
  }
  return images.get(url);
};

const printOf = (o = {}) => ({ plate: o.plate || "chart", style: o.style || "lines", draft: !!o.draft, look: { ...LOOK, ...o.look } });
export const photoKey = (path, kind, finish, o) => {
  const k = printOf(o);
  return [path, kind, finish, k.plate, k.style, k.look.x, k.look.y, k.look.zoom, k.look.strength].join("|");
};

// The picture as the card prints it, drawn once into a JPEG. Done on a canvas rather than with CSS
// filters, blend modes and masks so the saved image matches the screen (iPhone Safari drops those on export).
export function bakePhoto(path, kind, finish = "black", o) {
  const key = photoKey(path, kind, finish, o), print = printOf(o);
  if (print.draft || !baked.has(key)) {
    const url = pictureUrl(path, PHOTO[kind].src);
    const job = !url ? Promise.reject(new Error("No such picture")) : load(url).then((img) => {
      sizes.set(path, [img.naturalWidth, img.naturalHeight]);
      return kind === "mini" ? printMini(img, PHOTO.mini, finish) : printCard(img, kind, finish, print, path);
    });
    if (print.draft) return job;
    job.catch(() => baked.delete(key));
    baked.set(key, job);
    if (baked.size > KEEP) baked.delete(baked.keys().next().value);
  }
  return baked.get(key);
}

// The baked picture, and which one it is: while a new one bakes, the last stays on show. Another
// finish's tones would sit wrong under this finish's type, so those don't.
export function usePhoto(path, kind, finish = "black", o) {
  const key = photoKey(path, kind, finish, o), draft = !!o?.draft;
  const [got, setGot] = useState({ src: null, of: "", finish: "" });
  useEffect(() => {
    if (!path) return undefined;
    let live = true;
    bakePhoto(path, kind, finish, o).then((src) => live && setGot({ src, of: draft ? "" : key, finish }), () => live && setGot({ src: null, of: key, finish }));
    return () => { live = false; };
  }, [key, draft]);
  return path && got.finish === finish ? [got.src, got.of] : [null, ""];
}

// What a card's picture is filed under. A trade card goes by its trade, so the trader's pick follows
// the trade; a day or payout card has a line of its own and a default of its own.
const subjectOf = (card) => card.subject || { id: `${card.kind}:${card.id || card.title}`, month: `${card.kind}:${card.id || card.title}` };

// A picture is a choice, and so is none. Kept apart from the picks, because a pick that isn't on the
// shelves falls back to the card's default.
const PLAIN = "marble.flex.plain";
const watchers = new Set();
let plain = (() => {
  try { return JSON.parse(localStorage.getItem(PLAIN)) || {}; } catch { return {}; }
})();
const watchPlain = (l) => { watchers.add(l); return () => watchers.delete(l); };
onFlexReset(() => { plain = {}; watchers.forEach((l) => l()); });
function setPlain(id, on) {
  plain = { ...plain };
  if (on) plain[id] = true; else delete plain[id];
  try { localStorage.setItem(PLAIN, JSON.stringify(plain)); } catch {}
  watchers.forEach((l) => l());
}
function choosePicture(card, id) {
  const who = subjectOf(card);
  setPlain(who.id, !id);
  if (id) pick(who.id, id);
}

// The picture a card wears: the one it's given, else the trader's pick, else its default. Null is none.
function useCardPicture(card, given) {
  const who = subjectOf(card);
  const id = usePicture(who);
  const none = useSyncExternalStore(watchPlain, () => !!plain[who.id]);
  useEffect(() => { loadOwn(); }, []); // a pick of the trader's own shows once this device's are in
  return given !== undefined ? given : none ? null : id;
}

const num = (v) => (v == null || v === "" || !Number.isFinite(+v) ? null : +v);
const places = (v) => (num(v) == null ? 0 : (String(v).split(".")[1] || "").length);
const clockOf = (t) => (worldOf(t) === "crypto" ? utcOf : nyOf);
const heldText = (s) => {
  if (!(s >= 0)) return null;
  const m = Math.round(s / 60);
  return s < 60 ? `${s}s` : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
};
const later = (time, minutes) => {
  const [h, m] = String(time || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const t = h * 60 + m + minutes;
  return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
};

// Prices, times and the day. Example trades in the demo carry no prices, so theirs are made up
// around the market's level the same way every time.
export function cardFacts(t) {
  const dir = t.side === "short" ? -1 : 1;
  const real = num(t.entry) != null;
  const [base, unit, dp] = (!real && !LIVE && SAMPLE.MARKET?.[t.symbol]) || [];
  let entry = null, exit = null, stop = null;
  if (real) { entry = num(t.entry); exit = num(t.exit); stop = num(t.stop); }
  else if (base != null) {
    const h = parseInt(String(t.id).slice(1), 10) || 7;
    const tick = tickOf(t.symbol, dp);
    entry = Math.round((base + (((h * 37) % 40) - 20) * unit * 0.25) / tick) * tick;
    exit = t.r == null ? null : Math.round((entry + dir * t.r * unit) / tick) * tick;
    stop = entry - dir * unit;
  }
  const digits = base != null ? dp : Math.min(6, Math.max(2, places(t.entry), places(t.exit), places(t.stop)));
  const price = (v) => (v == null ? null : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  const closed = t.closedAt && Date.parse(t.closedAt);
  const out = closed ? clockOf(t)(closed) : null;
  return {
    prices: { entry, exit, stop },
    digits, entry: price(entry), exit: price(exit), stop: price(stop),
    held: heldText(closed ? Math.round((closed - Date.parse(t.traded_at)) / 1000) : t.heldMinutes != null ? t.heldMinutes * 60 : NaN),
    entryAt: t.time || null,
    exitAt: out ? `${pad(out.hour)}:${pad(out.minute)}` : t.heldMinutes != null ? later(t.time, t.heldMinutes) : null,
    day: (t.weekday != null && t.day ? `${DOW[t.weekday]} ${t.day} ${String(t.date).split(" ")[0]}` : t.date || ""),
  };
}

// What the chart on a trade's card needs, for a trade that may have one
function chartOf(t, f) {
  const { entry, exit } = f.prices;
  if (!canChart({ entry, exit, bars: t.bars }, isSample())) return null;
  const closed = t.closedAt && Date.parse(t.closedAt);
  const held = t.heldMinutes ?? (closed ? Math.round((closed - Date.parse(t.traded_at)) / 60000) : 30);
  return {
    entry, exit, held, side: t.side === "short" ? -1 : 1, dp: f.digits, tick: tickOf(t.symbol, f.digits),
    tf: t.frame || frameFor(held), at: f.entryAt, code: marketCode(t.symbol), seed: seedOf(t.id), bars: t.bars || null,
  };
}

const allTrades = () => (LIVE ? getState().logged : [...getState().logged, ...(SAMPLE.TRADES || [])]);
const numberOf = (t) => {
  const list = allTrades();
  const at = t.traded_at ? list.filter((x) => x.traded_at && x.traded_at <= t.traded_at).length : list.findIndex((x) => x.id === t.id) + 1;
  return at || null;
};

const fullDate = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// What a trade's card says. A card always says what kind of account the money came from, and how it got here.
export function tradeCard(t, account) {
  const f = cardFacts(t);
  const from = account || getState().accounts?.find((a) => a.id === t.account) || (t.accountKind ? { kind: t.accountKind } : null);
  const stage = from ? stageOf(from) : null; // a trade on no account can't say what kind of money it is
  return {
    kind: "trade",
    title: `${marketCode(t.symbol)} ${t.side === "short" ? "short" : "long"}`,
    symbol: t.symbol,
    when: f.day,
    date: t.dayKey || t.day ? fullDate(stampOf(t)) : null,
    money: t.pnl,
    r: t.r,
    stage,
    source: sourceWord([t]),
    no: numberOf(t),
    held: f.held,
    prices: { entry: f.entry, exit: f.exit },
    chart: chartOf(t, f),
    subject: { id: t.id, month: t.month, date: t.date },
  };
}

const big = (v) => fmtMoney(v, { sign: true, decimals: Math.abs(v) >= 1000 || Number.isInteger(v) ? 0 : 2 }).replace("-", "−");

const dayTrades = (card) => {
  const all = unfolded(allTrades()).filter((t) => keyOf(stampOf(t)) === card.id);
  return (card.stage && byStage(all, [])[card.stage]) || all;
};
const REAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The trades a card's money came from, for its public link. Only a trade's or a closed day's card has any.
export function tradesBehind(card) {
  const ids = card.kind === "trade" ? [card.subject?.id] : card.kind === "day" && /^\d{4}-\d{2}-\d{2}$/.test(card.id || "") ? dayTrades(card).map((t) => t.id) : [];
  return ids.filter((id) => REAL_ID.test(id || "")).slice(0, 500);
}

// A closed day's card is filed under the day, so what it needs from the trades underneath is read here: the year, the
// market it traded most and where the money behind its figure came from
export function withDay(card) {
  if (card.kind !== "day" || !/^\d{4}-\d{2}-\d{2}$/.test(card.id || "")) return card;
  const list = dayTrades(card);
  const seen = new Map();
  for (const t of list) if (t.symbol) seen.set(t.symbol, (seen.get(t.symbol) || 0) + 1);
  const symbol = [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { ...card, date: card.date ?? fullDate(Date.parse(`${card.id}T12:00:00Z`)), symbol: card.symbol ?? symbol, source: card.source ?? sourceWord(list) };
}

function Mark({ width }) {
  return (
    <svg className="fc-logo" width={width} height={(width * VIEW.h) / VIEW.w} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
      <g fill="currentColor"><path d={LETTERS} /><path d={DRIPS} /></g>
    </svg>
  );
}

// The logos are drawn at such different scales that each needs its own height to look the same size. Small sits beside
// the date, big takes a whole big line, in parts of the line's type size.
const LOGO_HEIGHT = { nasdaq: 24, sp500: 15, dowjones: 15, cme: 15, dax: 16, ftse100: 17 };
const LOGO_BIG = { nasdaq: 0.86, sp500: 0.66, dowjones: 0.8, cme: 0.72, dax: 0.9, ftse100: 0.78 };

// A flag in the card's own black and white, baked so the saved image matches
const flags = new Map();
function greyFlag(src) {
  if (!flags.has(src)) {
    flags.set(src, load(src).then((img) => {
      const [c, ctx] = canvasOf(72, 72);
      const k = Math.max(72 / (img.naturalWidth || 72), 72 / (img.naturalHeight || 72)), w = (img.naturalWidth || 72) * k, h = (img.naturalHeight || 72) * k;
      ctx.drawImage(img, (72 - w) / 2, (72 - h) / 2, w, h);
      const px = ctx.getImageData(0, 0, 72, 72), d = px.data;
      for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.min(255, 1.35 * (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]));
      ctx.putImageData(px, 0, 0);
      return c.toDataURL("image/png");
    }));
  }
  return flags.get(src);
}
function Flag({ src }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let live = true; greyFlag(src).then((u) => live && setUrl(u), () => {}); return () => { live = false; }; }, [src]);
  return url ? <img src={url} alt="" /> : <span className="fc-flag-blank" />;
}
function MarketMark({ symbol }) {
  const mark = marketMark(symbol);
  const svg = mark?.logo && logoSvg(mark.logo);
  if (svg) return <span className="fc-market-logo" style={{ "--logo": `${LOGO_HEIGHT[mark.logo] || 22}px` }} dangerouslySetInnerHTML={{ __html: svg }} />;
  if (mark?.flags) return <span className="fc-flags">{mark.flags.map((f) => <Flag key={f.src} src={f.src} />)}</span>;
  return null;
}

// The market as a big line: its owner's logo, the flags and the code for a currency pair, or the code alone
function MarketLine({ symbol, logos, size }) {
  const mark = logos ? marketMark(symbol) : null;
  const svg = mark?.logo && logoSvg(mark.logo);
  if (svg) return <span className="fc-mark" style={{ height: Math.round(size * LOGO_BIG[mark.logo]) }} dangerouslySetInnerHTML={{ __html: svg }} />;
  return <>{mark?.flags && <span className="fc-flags">{mark.flags.map((f) => <Flag key={f.src} src={f.src} />)}</span>}{marketCode(symbol)}</>;
}

// Unbounded this tight fuses a few pairs of letters. Those pairs get air and nothing else moves.
const aired = (text) => String(text).split(/(ay|ed|CL|ng)/).map((x, i) => (i % 2 ? <span key={i}><span className="air">{x[0]}</span>{x[1]}</span> : x));

// Words that run past the room left for them come down to fit, on the same baseline, leaving room for what's beside them
function Fit({ room, children }) {
  const text = useRef(null);
  useLayoutEffect(() => {
    let live = true;
    const fit = () => {
      const el = text.current;
      if (!live || !el) return;
      el.style.fontSize = "";
      const w = el.offsetWidth, next = el.nextElementSibling;
      const space = room - (next ? next.offsetWidth + 12 : 0);
      if (w > space) el.style.fontSize = `${Math.floor((parseFloat(getComputedStyle(el).fontSize) * space) / w * 2) / 2}px`;
    };
    fit();
    document.fonts?.load("800 60px Unbounded").then(fit, () => {});
    return () => { live = false; };
  });
  return <span ref={text}>{children}</span>;
}

// Whether a card has something to chart, which decides how much room its picture gets
const chartIn = (card, show) => !!(show.chart && (card.chart || (MONEY_CARDS && show.money && card.steps?.length)));
// Whether this face has a place for the market's logo: a big line on a day without money, or beside the stage on a
// trade. A trade's prices take that place on the face without money.
const markOn = (card, show, charted) => {
  const money = MONEY_CARDS && show.money && card.money != null;
  const prices = show.levels && !charted && card.prices?.entry;
  return !!(show.logo && card.symbol && (card.kind === "trade" ? money || !prices : card.kind === "day" && !money));
};

/* ---------- The card ---------- */

export function FlexCard({ card: given, format = "post", finish = "black", show: asked, handle, founder, cardRef, record, picture, look: moved, draft }) {
  const size = FORMATS[format], lay = LAYOUT[format];
  const style = useFlexStyle();
  const show = { ...SHOW, ...style.show, ...asked };
  const card = useMemo(() => withDay(given), [given]);
  const kept = useLook(subjectOf(card).id);
  const look = moved || kept;
  const moneyOn = MONEY_CARDS && show.money && card.money != null;
  const figure = moneyOn ? card.figure ?? big(card.money) : card.fallback ?? "Closed";
  const sample = isSample();
  const spec = card.chart;
  const trade = useMemo(() => (spec ? { ...spec, ...(spec.bars || sampleBars(spec)) } : null), [spec?.seed, spec?.entry, spec?.exit, spec?.bars]);
  const charted = chartIn(card, show);
  const [photo] = usePhoto(useCardPicture(card, picture), format, finish, { plate: charted ? "chart" : "open", style: style.picture, look, draft });
  const chartBox = look.note && format !== "wide" ? { ...lay.chart, y1: lay.chart.y1 - 24 } : lay.chart;
  const no = card.kind === "founder" ? null : card.no ?? (card.kind === "day" ? parseInt(String(card.title).replace(/\D/g, ""), 10) || null : null);
  const [type, line, room] = (charted && lay.charted) || lay.big;

  // The second big line: the money, or on the face without it what the day was
  const noTrades = card.kind === "day" && card.steps?.length === 0;
  const second = moneyOn ? <MoneyText text={figure} />
    : noTrades ? "No trades"
    : card.kind === "day" && card.symbol ? <MarketLine symbol={card.symbol} logos={show.logo && markOn(card, show, charted)} size={type} />
    : aired(figure === card.title ? (card.kind === "payout" ? "Paid" : "Closed") : figure);

  // Under them. Money says what kind it is and how it got here; a simulated stage takes the whole line, so its source
  // moves down beside the date.
  const name = show.handle ? handle ?? getState().profile?.handle : null;
  const at = name ? `@${name}` : null;
  const paid = card.kind === "payout";
  const kindOf = card.stage ? STAGES[card.stage] : null;
  const fake = simulated(card.stage);
  const stageLine = moneyOn ? [kindOf, fake ? "Simulated" : paid ? "Self-reported" : card.source].filter(Boolean).join(" · ") : null;
  const closedBy = at ? (card.kind === "founder" ? at : `Closed by ${at}`) : null;
  const prices = show.levels && !charted && card.prices?.entry ? card.prices : null;
  const dated = show.date ? card.date ?? card.when : null;
  const slotA = moneyOn ? stageLine : prices ? null : closedBy;
  const marked = markOn(card, show, charted);
  const slotB = [moneyOn || prices ? at : null, moneyOn && fake ? card.source : null, dated, card.kind === "trade" && show.held ? card.held && `Held ${card.held}` : null, moneyOn && show.record && record ? record : null].filter(Boolean).join(" · ");
  const priced = prices && <span className={`fc-prices ${`${prices.entry}${prices.exit || ""}`.length > 12 ? "long" : ""}`}><span>Entry <b>{prices.entry}</b></span>{prices.exit && <span>Exit <b>{prices.exit}</b></span>}</span>;
  const smallMark = marked && card.kind === "trade" ? <MarketMark symbol={card.symbol} /> : null;

  const seat = card.kind === "founder" ? null : founder;
  const left = [card.check ? `${SITE}/c/${card.check}` : SITE, sample ? "Sample data" : null].filter(Boolean);
  const right = [seat ? `Founder Nº ${String(seat).padStart(3, "0")}` : null, show.number && no ? `Nº ${String(no).padStart(4, "0")}` : null].filter(Boolean);
  return (
    <div ref={cardRef} className={`fc fc-${finish} fmt-${format}`} style={{ width: size.w, height: size.h }}>
      {photo && <img className="fc-pic" src={photo} alt="" />}
      {charted && trade && <TradeChart chart={trade} box={chartBox} finish={finish} levels={show.levels} size={lay.type} />}
      {charted && !trade && <DayChart steps={card.steps} box={chartBox} finish={finish} total={moneyOn ? figure : null} />}
      <div className="fc-top"><Mark width={lay.mark} /></div>
      <div className="fc-foot">
        {look.note && <p className="fc-note"><span>{look.note}</span></p>}
        <div className="fc-big" style={{ fontSize: type, lineHeight: `${line}px`, "--line": `${line}px` }}>
          <div className="fc-line"><Fit room={room}>{aired(card.title)}</Fit></div>
          <div className={`fc-line ${moneyOn && figure.startsWith("−") ? "loss" : ""}`}><Fit room={room}>{second}</Fit></div>
        </div>
        <div className="fc-slots">
          {prices && !moneyOn && <div className="fc-a">{priced}</div>}
          {slotA && <div className="fc-a"><Fit room={room}>{slotA}</Fit>{smallMark}</div>}
          {(slotB || (prices && moneyOn)) && <div className="fc-b">{moneyOn && priced}<span>{slotB}</span></div>}
        </div>
        <div className={`fc-tiny ${sample || seat ? "long" : ""}`}><span>{left.join(" · ")}</span>{right.length > 0 && <span className="no">{right.join(" · ")}</span>}</div>
      </div>
    </div>
  );
}

// A small card for a wall of them
export function FlexMini({ card, finish = "white", on, onClick, show = SHOW, picture, className = "", style }) {
  const moneyOn = MONEY_CARDS && show.money && card.money != null;
  const [photo] = usePhoto(useCardPicture(card, picture), "mini", finish);
  const { lean, tilt } = useTilt(7);
  return (
    <button type="button" ref={lean} className={`fc-mini fc-${finish} ${photo ? "has-pic" : ""} ${className}`} style={style} aria-pressed={on} onClick={onClick} aria-label={[card.title, card.when].filter(Boolean).join(", ")} {...tilt}>
      {photo && <img className="fc-mini-pic" src={photo} alt="" />}
      <span className="fc-mini-top"><b>{card.title}</b><span>{String(card.when || "").replace(/^[A-Z][a-z]{2} /, "")}</span></span>
      <span className="fc-mini-big">{moneyOn ? card.figure ?? big(card.money) : card.fallback ?? "Closed"}</span>
      <span className="fc-mini-foot">{card.stage && <span>{STAGES[card.stage]}</span>}{card.kind === "payout" && <span>Self-reported</span>}</span>
    </button>
  );
}

/* ---------- Motion ---------- */

// A card leans a little towards the pointer. Mouse only, and never on the card that gets saved: the
// lean sits on a wrapper round it.
export function useTilt(most = 5) {
  const lean = useRef(null);
  const onPointerMove = (e) => {
    if (e.pointerType !== "mouse" || !lean.current || reducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    lean.current.style.transform = `perspective(1100px) rotateX(${(-y * most).toFixed(2)}deg) rotateY(${(x * most).toFixed(2)}deg)`;
  };
  const onPointerLeave = () => { if (lean.current) lean.current.style.transform = ""; };
  return { lean, tilt: { onPointerMove, onPointerLeave } };
}

// Changing the finish turns the card over; changing the size slides it in
function useTurn(finish, format) {
  const turn = useRef(null);
  const was = useRef({ finish, format });
  useEffect(() => {
    const flipped = was.current.finish !== finish, moved = was.current.format !== format;
    was.current = { finish, format };
    if ((!flipped && !moved) || reducedMotion()) return;
    turn.current?.animate(
      flipped ? [{ transform: "perspective(1100px) rotateY(82deg)" }, { transform: "perspective(1100px) rotateY(0deg)" }]
        : [{ transform: "translateY(16px) scale(0.97)", opacity: 0.4 }, { transform: "none", opacity: 1 }],
      { duration: flipped ? 340 : 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [finish, format]);
  return turn;
}

/* ---------- Saving and sharing ---------- */

let lib = null, fonts = null; // html-to-image and the fonts it embeds, loaded on first use
export async function cardBlob(node, format) {
  lib ||= await import("html-to-image");
  await document.fonts?.ready;
  if (fonts == null) {
    try { fonts = await lib.getFontEmbedCSS(node); } catch { fonts = ""; }
  }
  const f = FORMATS[format];
  return lib.toBlob(node, { pixelRatio: 1080 / Math.min(f.w, f.h), fontEmbedCSS: fonts || undefined });
}
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
// The share sheet where there is one, a download where there isn't. Says which, for a toast.
export async function shareBlob(blob, name, text) {
  const file = new File([blob], name, { type: "image/png" });
  if (!navigator.canShare?.({ files: [file] })) { saveBlob(blob, name); return "saved"; }
  try { await navigator.share({ files: [file], text }); return "shared"; }
  catch (e) {
    if (e?.name === "AbortError") return "cancelled";
    saveBlob(blob, name);
    return "saved";
  }
}

// A computer has no share sheet worth the name, so it gets the image on the clipboard. The picture is handed over as a
// promise because Safari only lets go of the clipboard inside the tap itself.
const CAN_COPY = () => typeof ClipboardItem === "function" && !!navigator.clipboard?.write && !!window.matchMedia?.("(pointer: fine)").matches;
const copyImage = (blob) => navigator.clipboard.write([new ClipboardItem({ "image/png": Promise.resolve(blob) })]);

// A card's sign. It swaps the sign and never the number: the trader's figure stays as it was logged.
const SIGNS = ["$", "¥", "€", "£"];

/* ---------- The studio ---------- */

const captionOf = (c) => c.caption || (MONEY_CARDS && c.money != null ? `${c.figure ?? big(c.money)}${c.title ? ` on ${c.title}` : ""}${simulated(c.stage) ? ", simulated money" : ""}. Journaled on Marble.` : "Another one closed. Journaled on Marble.");
const nameOf = (id) => (isOwn(id) ? "Your own" : id.split("/")[1].replace(/-/g, " "));
const FOUNDER = [{ id: "silver", name: "Silver", need: 0 }];
const TABS = [["picture", "Picture"], ["style", "Style"], ["details", "Details"]];

export default function FlexStudio({ trade, card: given, record, format: first, finish: wearing, onClose, onPost }) {
  const accounts = useStore((s) => s.accounts);
  const card = withDay(given || tradeCard(trade, [...accounts, ...(!LIVE ? SAMPLE.ACCOUNTS || [] : [])].find((a) => a.id === trade.account)));
  const closes = useCloses();
  const earned = Object.keys(closes).length;
  const style = useFlexStyle();
  const founderCard = card.kind === "founder";
  const choices = founderCard ? FOUNDER : FINISHES;
  const [tab, setTab] = useState("picture");
  const [format, setFormat] = useState(first || style.format || "wide");
  const [finish, setFinish] = useState(wearing || finishFor(earned, style.finish));
  const show = { ...SHOW, ...style.show };
  const [handle, setHandle] = useState(() => getState().profile.handle);
  const sign = style.sign || "$";
  const signable = MONEY_CARDS && card.money != null && card.kind !== "payout"; // a payout already says its own currency
  const [caption, setCaption] = useState(() => (signable ? captionOf(card).replaceAll("$", sign) : captionOf(card)));
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [scale, setScale] = useState(1);
  const picture = useCardPicture(card);
  const [shelf, setShelf] = useState(() => (picture ? shelfOf(picture) : SHELVES[0][0]));
  const [err, setErr] = useState("");
  const mine = useOwnPictures();
  const who = subjectOf(card);
  const kept = useLook(who.id);
  const [moving, setMoving] = useState(null); // the picture's place while it's being dragged
  const look = moving || kept;
  const plate = chartIn(card, show) ? "chart" : "open";
  const print = { plate, style: style.picture, look };
  const [, photoOf] = usePhoto(picture, format, finish, moving ? { ...print, draft: true } : print);
  const stageRef = useRef(null);
  const cardRef = useRef(null);
  const toastTimer = useRef(null);
  const drag = useRef(null);
  const { lean, tilt } = useTilt();
  const turn = useTurn(finish, format);
  const ready = useRef({ key: "", blob: null }); // the card as it stands, already an image, so Share opens straight away
  const f = FORMATS[format];
  const coming = founderCard ? null : nextFinish(earned);
  const settled = !moving && (!picture || photoOf === photoKey(picture, format, finish, print)); // the picture is in, or couldn't be, so the card can be saved
  const signed = useMemo(() => (signable && sign !== "$" ? { ...card, figure: (card.figure ?? big(card.money)).replace("$", sign) } : card), [card, sign, signable]);
  const signedRecord = signable && typeof record === "string" ? record.replaceAll("$", sign) : record;
  const lookKey = JSON.stringify([format, finish, picture, show, handle, settled, kept, style.picture, sign]);
  const [link, setLink] = useState(null); // the public link this exact card has, once a trader makes one
  const [asking, setAsking] = useState(false);
  const [dropping, setDropping] = useState(false);
  const linkId = link?.key === lookKey ? link.id : null;
  const linked = useMemo(() => (linkId ? { ...signed, check: linkId } : signed), [signed, linkId]); // printed on the card, so a saved image carries it too
  const linkable = useMemo(() => (LIVE && !isSample() ? tradesBehind(card) : []), [card]);
  const cardKey = lookKey + (linkId || "");
  const placed = kept.x || kept.y || (kept.zoom ?? 1) !== 1 || (kept.strength ?? 1) !== 1;

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useLayoutEffect(() => {
    const s = stageRef.current;
    if (!s) return undefined;
    const fit = () => setScale(Math.min(1, (s.clientWidth - 24) / f.w, (s.clientHeight - 24) / f.h));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(s);
    return () => ro.disconnect();
  }, [f.w, f.h]);
  useEffect(() => {
    if (!settled) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const blob = await cardBlob(cardRef.current, format);
        if (!cancelled) ready.current = { key: cardKey, blob };
      } catch {}
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [cardKey]);

  const say = (msg) => { clearTimeout(toastTimer.current); setToast(msg); toastTimer.current = setTimeout(() => setToast(""), 2600); };
  const fileName = `marble-${String(card.title || "card").replace(/\W+/g, "-")}-${format}.png`.toLowerCase();
  const image = () => (ready.current.key === cardKey ? ready.current.blob : cardBlob(cardRef.current, format));
  const download = async () => {
    setBusy("download");
    try { saveBlob(await image(), fileName); say("Saved. Ready to post."); }
    catch { say("Couldn't make the image. Try again."); }
    setBusy("");
  };
  const share = async () => {
    setBusy("share");
    try {
      const how = await shareBlob(await image(), fileName, linkId ? `${caption}\n\n${SITE}/c/${linkId}` : caption);
      if (how === "saved") say("Sharing isn't open here, so the image was saved instead.");
    } catch { say("Couldn't make the image. Try again."); }
    setBusy("");
  };
  const copy = async () => {
    setBusy("copy");
    try { await copyImage(await image()); say("Copied. Paste it anywhere."); }
    catch { say("Couldn't copy that here. Use Save image."); }
    setBusy("");
  };
  const toX = async () => {
    setBusy("x");
    try {
      await copyImage(await image());
      const text = encodeURIComponent(`${caption}

${linkId ? `${SITE}/c/${linkId}` : SITE}`.trim());
      const opened = window.open(`https://x.com/intent/post?text=${text}`, "_blank");
      if (opened) opened.opener = null;
      say(opened ? "Copied. Paste it into your post." : "Copied. Open X and paste it into your post.");
    } catch { say("Couldn't copy that here. Use Save image."); }
    setBusy("");
  };
  // The card is drawn again with its address on it before the picture is taken
  const makeLinkNow = async () => {
    setBusy("link"); setAsking(false);
    const id = (await import("../live/publicCards")).newLinkId();
    setLink({ id, key: lookKey });
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { makeLink } = await import("../live/publicCards");
      await makeLink({ id, kind: card.kind, format, trades: linkable, money: MONEY_CARDS && !!show.money && card.money != null, sign, blob: await cardBlob(cardRef.current, format) });
      await copyLinkNow(id, true);
    } catch (e) { setLink(null); say(e.message || "Couldn't make the link. Try again."); }
    setBusy("");
  };
  const copyLinkNow = async (id = linkId, first = false) => {
    try { await navigator.clipboard.writeText(`https://${SITE}/c/${id}`); say(first ? "Link made and copied." : "Link copied."); }
    catch { say(first ? "Link made. Tap Copy to copy it." : "Couldn't copy that here. Open it and copy the address."); }
  };
  const takeDownNow = async () => {
    if (!dropping) { setDropping(true); return; }
    setBusy("down");
    try {
      const { takeLinkDown } = await import("../live/publicCards");
      await takeLinkDown(linkId);
      setLink(null); say("Taken down.");
    } catch { say("Couldn't take that down. Try again."); }
    setDropping(false); setBusy("");
  };
  const post = async () => {
    setBusy("post");
    try { await onPost({ card: signed, finish, picture, caption: caption === captionOf(card) ? null : caption }); }
    catch { say("Couldn't post that. Try again."); }
    setBusy("");
  };
  const wear = (id) => { setErr(""); choosePicture(card, id); };
  const addMine = async (file) => {
    if (!file) return;
    try { wear(await addOwn(file)); } catch (e) { setErr(e.message); }
  };
  const dropMine = async () => { await dropOwn(picture); wear(null); };
  const pickFinish = (id) => { setFinish(id); if (!founderCard) setFlexStyle({ finish: id }); };
  const pickFormat = (id) => { setFormat(id); setFlexStyle({ format: id }); };
  const pickSign = (id) => { setCaption((c) => c.replaceAll(sign, id)); setFlexStyle({ sign: id }); };
  const toggle = (k) => setFlexStyle({ show: { ...style.show, [k]: !show[k] } });

  // Dragging the card moves its picture. It stays over its window, so no edge of it ever shows.
  const fit = (next) => {
    const size = sizes.get(picture);
    return size ? placement(size[0], size[1], f.w, f.h, WINDOWS[format][plate], next, placeOf(picture, format, plate)).look : next;
  };
  const grab = (e) => {
    if (!picture || e.button || !e.target.closest?.(".fc")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: { ...LOOK, ...kept } };
    setMoving(drag.current.from);
  };
  const slide = (e) => {
    const d = drag.current;
    if (!d) { tilt.onPointerMove(e); return; }
    d.next = fit({ ...d.from, x: d.from.x + (e.clientX - d.x) / (f.w * scale), y: d.from.y + (e.clientY - d.y) / (f.w * scale) });
    d.frame ||= requestAnimationFrame(() => { d.frame = 0; setMoving(d.next); });
  };
  const drop = () => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.frame);
    drag.current = null;
    if (d.next) setLook(who.id, { x: d.next.x, y: d.next.y });
    setMoving(null);
  };
  const nudge = (e) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!k || !picture) return;
    e.preventDefault();
    const next = fit({ ...LOOK, ...kept, x: (kept.x || 0) + k[0] * 0.01, y: (kept.y || 0) + k[1] * 0.01 });
    setLook(who.id, { x: next.x, y: next.y });
  };

  return (
    <Modal label="Your card" onClose={onClose} className="overlay flex-overlay">
      <div className="flex-studio">
        <div className={`flex-stage ${picture ? "can-move" : ""}`} ref={stageRef} tabIndex={picture ? 0 : undefined} role={picture ? "application" : undefined}
          aria-label={picture ? "Your card. Use the arrow keys to move the picture." : undefined} onKeyDown={nudge}
          onPointerDown={grab} onPointerMove={slide} onPointerUp={drop} onPointerCancel={drop} onPointerLeave={tilt.onPointerLeave}>
          <div className="flex-lean" ref={lean} style={{ width: f.w * scale, height: f.h * scale }}>
            <div ref={turn}>
              <div className="flex-scale" style={{ transform: `scale(${scale})` }}>
                <FlexCard card={linked} format={format} finish={finish} handle={handle} cardRef={cardRef} record={signedRecord} picture={picture} founder={card.seat} look={moving || undefined} draft={!!moving} />
              </div>
            </div>
          </div>
        </div>

        <aside className="flex-panel">
          <div className="flex-row">
            <b className="flex-title">Your card</b>
            <button className="icon-btn" onClick={onClose} aria-label="Close" data-autofocus><Icon name="close" /></button>
          </div>

          <div className="flex-tabs" role="tablist" aria-label="Change your card">
            {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
          </div>

          <div className="flex-body">
            {tab === "picture" && (
              <>
                <div className="flex-group">
                  <div className="fx-shelves" role="tablist" aria-label="Picture shelves">
                    {[...SHELVES, ["yours", "Yours"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={shelf === k} className={shelf === k ? "on" : ""} onClick={() => setShelf(k)}>{l}</button>)}
                  </div>
                  <div className="fx-pics">
                    <button type="button" className={`fx-none ${picture ? "" : "on"}`} aria-pressed={!picture} onClick={() => wear(null)}>None</button>
                    {shelf === "yours" && (
                      <label className="fx-add" title={`A JPEG or PNG up to ${OWN_LIMIT_MB} MB`}>
                        <Icon name="upload" size={16} /><span>Add</span>
                        <input type="file" className="file-input" accept="image/*" aria-label="Add a picture of your own" onChange={(e) => { addMine(e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                    )}
                    {(shelf === "yours" ? mine : SHELVES.find((x) => x[0] === shelf)[2]).map((b) => (
                      <button key={b} type="button" className={picture === b ? "on" : ""} onClick={() => wear(b)} aria-pressed={picture === b} aria-label={`${nameOf(b)} picture`}>
                        <img src={pictureUrl(b, 160)} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                  {shelf === "yours" && <p className="flex-note" role={err ? "alert" : undefined}>{err || "Pictures you add stay on this device. They're never sent anywhere."}</p>}
                  {shelf === "yours" && isOwn(picture) && <button type="button" className="flex-drop" onClick={dropMine}>Remove this picture from this device</button>}
                </div>

                {picture && (
                  <div className="flex-group">
                    <div className="flex-label"><span>Drawn as</span></div>
                    <div className="flex-two">
                      {[["lines", "Engraved"], ["photo", "Photo"]].map(([k, l]) => <button key={k} type="button" className={(style.picture || "lines") === k ? "on" : ""} aria-pressed={(style.picture || "lines") === k} onClick={() => setFlexStyle({ picture: k })}>{l}</button>)}
                    </div>
                    <label className="flex-slide"><span>Zoom</span><input type="range" min="1" max="3" step="0.02" value={kept.zoom ?? 1} onChange={(e) => setLook(who.id, { zoom: +e.target.value })} /></label>
                    <label className="flex-slide"><span>Strength</span><input type="range" min="0.4" max="1.5" step="0.02" value={kept.strength ?? 1} onChange={(e) => setLook(who.id, { strength: +e.target.value })} /></label>
                    <p className="flex-note">Drag the card to move the picture.{placed ? " " : ""}{placed && <button type="button" className="flex-drop inline" onClick={() => setLook(who.id, { x: 0, y: 0, zoom: 1, strength: 1 })}>Put it back</button>}</p>
                  </div>
                )}
              </>
            )}

            {tab === "style" && (
              <>
                <div className="flex-group">
                  <div className="flex-label"><span>Finish</span>{coming && <span>{coming.name} at {plural(coming.need, "closed day")}</span>}</div>
                  <div className="fx-finishes">
                    {choices.map((x) => {
                      const got = earned >= x.need;
                      return <button key={x.id} type="button" className={`fc-${x.id} ${finish === x.id ? "on" : ""}`} disabled={!got} aria-pressed={finish === x.id} onClick={() => pickFinish(x.id)}>{x.name}{!got && <Icon name="lock" size={12} />}</button>;
                    })}
                  </div>
                </div>
                <div className="flex-group">
                  <div className="flex-label"><span>Size</span></div>
                  <div className="flex-formats">
                    {Object.entries(FORMATS).map(([k, v]) => (
                      <button key={k} className={format === k ? "on" : ""} aria-pressed={format === k} onClick={() => pickFormat(k)} title={`For ${v.where}`} aria-label={`${v.label} ${v.hint}, for ${v.where}`}>
                        <b>{v.label}</b><span>{v.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "details" && (
              <>
                {signable && show.money && (
                  <div className="flex-group">
                    <div className="flex-label"><span>Currency</span></div>
                    <div className="flex-signs">
                      {SIGNS.map((s) => <button key={s} type="button" className={sign === s ? "on" : ""} aria-pressed={sign === s} onClick={() => pickSign(s)}>{s}</button>)}
                    </div>
                    <p className="flex-note">Only the sign changes. Your number stays as you logged it.</p>
                  </div>
                )}
                <div className="flex-group">
                  <div className="flex-label"><span>On the card</span></div>
                  <div className="flex-toggles">
                    {[
                      ...(MONEY_CARDS && card.money != null ? [["money", "The money"]] : []),
                      ...(chartIn(card, { ...show, chart: true }) ? [["chart", "The chart"]] : []),
                      ...(card.kind === "trade" ? [["levels", "Entry and exit"]] : []),
                      ...(card.symbol && marketMark(card.symbol) && (markOn(card, { ...show, logo: true }, chartIn(card, show))) ? [["logo", "Market logo"]] : []),
                      ...(card.held ? [["held", "Time held"]] : []),
                      ["date", "The date"],
                      ...(card.kind !== "founder" ? [["number", "The number"]] : []),
                      ...(MONEY_CARDS && show.money && card.money != null && record ? [["record", "Month total"]] : []),
                      ["handle", "My handle"],
                    ].map(([k, l]) => (
                      <label key={k} className={`check ${show[k] ? "done" : ""}`}>
                        <input type="checkbox" checked={show[k]} onChange={() => toggle(k)} />
                        <span className="box"><Icon name="check" size={11} /></span><span>{l}</span>
                      </label>
                    ))}
                  </div>
                  {show.handle && <div className="flex-field"><span>@</span><input value={handle} maxLength={20} aria-label="Your handle" onChange={(e) => setHandle(e.target.value.replace(/\s/g, ""))} /></div>}
                </div>
                <div className="flex-group">
                  <div className="flex-label"><span>Your words</span><span>{(kept.note || "").length} of 60</span></div>
                  <input className="flex-line" value={kept.note || ""} maxLength={60} placeholder="A line of your own" aria-label="A line of your own on the card" onChange={(e) => setLook(who.id, { note: e.target.value })} />
                </div>
                <div className="flex-group">
                  <div className="flex-label"><span>Caption</span></div>
                  <textarea className="flex-caption" rows={2} aria-label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="flex-foot">
            <div className="flex-actions">
              <button className="btn" onClick={share} disabled={!!busy || !settled}><Icon name="share" size={15} /> {busy === "share" ? "Preparing…" : "Share"}</button>
              <button className="btn ghost" onClick={download} disabled={!!busy || !settled}>{busy === "download" ? "Rendering…" : "Save image"}</button>
              {CAN_COPY() && <button className="btn ghost" onClick={copy} disabled={!!busy || !settled}>{busy === "copy" ? "Copying…" : "Copy image"}</button>}
              {CAN_COPY() && <button className="btn ghost" onClick={toX} disabled={!!busy || !settled}>{busy === "x" ? "Copying…" : "Post on X"}</button>}
              {onPost && <button className="btn ghost" onClick={post} disabled={!!busy}>{busy === "post" ? "Posting…" : "Post to the Feed"}</button>}
              {linkable.length > 0 && !(linkId && busy !== "link") && !asking && <button className="btn ghost" onClick={() => setAsking(true)} disabled={!!busy || !settled}>{busy === "link" ? "Making link…" : "Make a link"}</button>}
            </div>
            {asking && !linkId && (
              <div className="flex-link" role="group" aria-label="Make a public link">
                <p>Anyone with the link sees this card, where its numbers came from, if they've changed since and how many days you've closed. You can take it down any time.</p>
                <div className="flex-link-row">
                  <button className="btn" onClick={makeLinkNow}>Make the link</button>
                  <button className="btn ghost" onClick={() => setAsking(false)}>Not now</button>
                </div>
              </div>
            )}
            {linkId && busy !== "link" && (
              <div className="flex-link">
                <a href={`https://${SITE}/c/${linkId}`} target="_blank" rel="noopener noreferrer">{SITE}/c/{linkId}</a>
                <div className="flex-link-row">
                  <button className="btn ghost" onClick={() => copyLinkNow()} disabled={!!busy}>Copy</button>
                  <button className="btn ghost" onClick={takeDownNow} disabled={!!busy}>{busy === "down" ? "Taking down…" : dropping ? "Take it down?" : "Take down"}</button>
                </div>
              </div>
            )}
            <p className="flex-note">{card.kind === "payout" ? "You entered this payout, so it says self-reported. Nothing on a card is shared until you share it." : "Nothing on a card is shared until you share it."}</p>
          </div>
        </aside>
      </div>
      {toast && <div className="flex-toast" role="status">{toast}</div>}
    </Modal>
  );
}
