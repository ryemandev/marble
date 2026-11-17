import { DOW as DAYS, MON as MONTHS, pad } from "../../lib/basics.js";

export const RULES = 12;
const MAX_LINE = 300; // characters a trader can type on one line
export const MAX_LINES = 400;
// What one session can hold, in bytes: the table takes 128 KB of lines, and 400 rows of keys, times and marks need the rest
export const MAX_NOTE = 100000;
const KEEP_LINE = MAX_NOTE;
export const MAX_TITLE = 120; // a page's title
export const MAX_NB_TITLE = 60; // a notebook's title
const MAX_SECONDS = 86400; // a time on a line: up to a day into a video

export const COVERS = [
  ["masters/self-portrait-rembrandt", "Rembrandt", "50% 30%"],
  ["masters/wanderer-friedrich", "The wanderer", "50% 34%"],
  ["anime/night-figure", "Night figure", "50% 30%"],
  ["anime/samurai-duel", "The duel", "50% 40%"],
  ["masters/charging-chasseur-gericault", "The chasseur", "50% 28%"],
  ["masters/colossus-goya", "The colossus", "50% 30%"],
  ["masters/joseph-carpenter-la-tour", "The carpenter", "60% 30%"],
  ["masters/narcissus-caravaggio", "Narcissus", "50% 34%"],
  ["masters/calling-of-matthew-caravaggio", "The calling", "34% 46%"],
  ["masters/magdalen-la-tour", "The candle", "35% 30%"],
  ["masters/both-members-bellows", "The ring", "30% 12%"],
  ["masters/jerome-writing-caravaggio", "The writer", "78% 30%"],
  ["masters/sower-millet", "The sower", "42% 12%"],
  ["anime/moon-reflection", "The moon", "50% 64%"],
  ["japan/torii-tunnel", "The gates", "50% 30%"],
  ["prints/ghosts-of-the-taira-kuniyoshi", "The ghosts", "24% 50%"],
];
export const coverPos = (cover) => COVERS.find((c) => c[0] === cover)?.[2] || "50% 25%";
export const nextCover = (notebooks) => COVERS[(notebooks?.length || 0) % COVERS.length][0];

// One curve doesn't fit every picture. These carry their own [brightness, contrast], brightness first, where
// the shared --pic-press would leave them mud or a blank. Everything else takes --pic-press.
export const TONES = {
  "prints/red-fuji-hokusai": [0.7, 3.8],
  "prints/night-rain-karasaki-hiroshige": [0.66, 4.2],
  "masters/wanderer-friedrich": [0.72, 4],
  "masters/self-portrait-rembrandt": [1.25, 2.4],
  "masters/sower-millet": [2.2, 2.6],
  "masters/joseph-carpenter-la-tour": [1.8, 2.4],
  "masters/magdalen-la-tour": [1.4, 2.2],
  "masters/both-members-bellows": [1.2, 2.2],
  "masters/calling-of-matthew-caravaggio": [1.2, 2],
};
// A picture's own tone, from its library path or its address at any size
export const toneOf = (picture) => TONES[String(picture).replace(/^.*\/art\//, "").replace(/(-\d+|-full|-tall)?\.webp$/, "")];
// The same as a filter, for the --tone a picture's CSS reads. Nothing means the shared press.
export const coverTone = (picture) => {
  const t = toneOf(picture);
  return t ? `grayscale(1) brightness(${t[0]}) contrast(${t[1]})` : undefined;
};

// The same two curves level by level, for a picture drawn on a canvas
export function pressLevels(tone) {
  const clip = (v) => Math.min(1, Math.max(0, v)); // a filter clips at each step
  const f = (v) => (tone ? (clip(v * tone[0]) - 0.5) * tone[1] + 0.5 : clip((v - 0.5) * 1.9 + 0.5) * 0.92);
  return Uint8ClampedArray.from({ length: 256 }, (_, i) => Math.round(f(i / 255) * 255));
}

/* ---------- Times ---------- */

export function clock(t) {
  if (t == null || t === "" || !Number.isFinite(+t) || +t < 0) return "";
  const s = Math.floor(+t), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function parseClock(v) {
  const s = String(v ?? "").trim();
  if (/^\d{1,6}$/.test(s)) return +s <= MAX_SECONDS ? +s : null;
  if (!/^(?:\d{1,2}:)?[0-5]?\d:[0-5]\d$/.test(s)) return null;
  const t = s.split(":").reduce((a, x) => a * 60 + +x, 0);
  return t <= MAX_SECONDS ? t : null;
}

// Whole seconds for a line to keep, or null
export const wholeSeconds = (t) => (t == null || t === "" || !Number.isFinite(+t) || +t < 0 ? null : Math.min(MAX_SECONDS, Math.floor(+t)));

/* ---------- YouTube links ---------- */

export function videoId(url) {
  const s = String(url || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  return s.match(/(?:youtube(?:-nocookie)?\.com\/(?:.*[?&]v=|shorts\/|live\/|embed\/|v\/|e\/)|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;
}
export function linkStart(url) {
  const m = String(url || "").match(/[?&#](?:t|start)=([\dhms]+)/);
  if (!m) return 0;
  if (/^\d+$/.test(m[1])) return wholeSeconds(+m[1]) ?? 0;
  const [, h = 0, mi = 0, se = 0] = m[1].match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/) || [];
  return wholeSeconds(+h * 3600 + +mi * 60 + +se) ?? 0;
}

/* ---------- Lines ---------- */

// A row is tidied, unless a zero-width mark at its start says to keep it exactly as written. The notepad marks the rows
// that need it: a blank line, an indent, two spaces in a row.
const EXACT = String.fromCodePoint(0x200b);
const tidied = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export function cleanLine(l) {
  const text = String(l?.text ?? "");
  return { t: wholeSeconds(l?.t), text: (text.startsWith(EXACT) ? text : tidied(text)).slice(0, KEEP_LINE), key: !!l?.key };
}
export const cleanLines = (lines) => (Array.isArray(lines) ? lines.map(cleanLine).filter((l) => l.text).slice(0, MAX_LINES) : []);

export function addLine(lines, { text, t = null, key = false }) {
  const l = cleanLine({ text: String(text ?? "").trim().slice(0, MAX_LINE), t, key });
  return l.text && lines.length < MAX_LINES ? [...lines, l] : lines;
}
// New words for line i; clearing them takes the line away
export function editLine(lines, i, text) {
  if (!lines[i]) return lines;
  const l = cleanLine({ ...lines[i], text });
  return l.text ? lines.map((x, j) => (j === i ? l : x)) : lines.filter((_, j) => j !== i);
}
export const removeLine = (lines, i) => (lines[i] ? lines.filter((_, j) => j !== i) : lines);
// Star a line as a key lesson, or unstar it
export const toggleKey = (lines, i) => (lines[i] ? lines.map((x, j) => (j === i ? { ...x, key: !x.key } : x)) : lines);
// Put a line back where it was (undo)
export const insertLine = (lines, i, line) => [...lines.slice(0, i), cleanLine(line), ...lines.slice(i)];

export function stampFor(page, liveT) {
  if (!page?.videoId) return null;
  return wholeSeconds(liveT ?? page.videoAt);
}

/* ---------- The notepad ---------- */

// A note is plain text, kept exactly as it was typed. Each of its lines is stored as a row, as lines always were, so
// the times and marks on older rows stay put.
export const plain = (text) => text.split(EXACT).join("");

export const textOf = (lines) => (lines || []).map((l) => plain(l.text)).join("\n");

export function linesOf(text, was = [], t = null) {
  const all = String(text ?? "");
  if (!all.trim()) return [];
  // A shared row opens back up, so its lines can find their own again
  const old = (was || []).flatMap((l) => {
    const parts = plain(l.text).split("\n");
    return parts.length === 1 ? [l] : parts.map((text, i) => ({ t: i ? null : l.t ?? null, text, key: !!l.key }));
  });
  const pool = new Map();
  for (const l of old) { const k = plain(l.text); pool.set(k, [...(pool.get(k) || []), l]); }
  const rows = all.split("\n");
  const kept = rows.map((s) => pool.get(s)?.shift() || null);
  // A line that was edited stayed where it was, so its time and mark stay with it
  const free = new Set(old);
  for (const l of kept) free.delete(l);
  const from = rows.map((s, i) => kept[i] || (s.trim() && free.has(old[i]) ? old[i] : null));
  const row = (s, mark) => ({ t: mark?.t ?? (s.trim() ? wholeSeconds(t) : null), text: s && s === tidied(s) ? s : EXACT + s, key: !!mark?.key });
  if (rows.length <= MAX_LINES) return rows.map((s, i) => kept[i] || row(s, from[i]));
  // Past the row limit, lines share a row: a long note is never cut short. The row keeps its lines' first time and any mark.
  const each = Math.ceil(rows.length / MAX_LINES), packed = [];
  for (let i = 0; i < rows.length; i += each) {
    const marks = from.slice(i, i + each).filter(Boolean);
    packed.push(row(rows.slice(i, i + each).join("\n"), { t: marks.find((m) => m.t != null)?.t, key: marks.some((m) => m.key) }));
  }
  return packed;
}

// Does this much writing fit on one session?
export const fitsNote = (text) => new TextEncoder().encode(String(text ?? "")).length <= MAX_NOTE;

// The rows as a reader sees them: a blank line is blank, and a shared row opens back up
export const rowsOf = (lines) => (lines || []).flatMap((l) => plain(l.text).split("\n").map((text, i) => ({ t: i ? null : l.t ?? null, text, key: !!l.key })));

// A line to stand for a session with no title
export const snippet = (page) => rowsOf(page.lines).map((l) => l.text.trim()).find(Boolean) || "";

/* ---------- A notebook's pages ---------- */

export const sortPages = (pages) => [...pages].sort((a, b) => (a.n - b.n) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id)));
export const pagesOf = (pages, notebookId) => sortPages(pages.filter((p) => p.notebookId === notebookId));
// Every page there is, as one notebook in the order it was written. Nothing is moved or rewritten: each page
// still belongs to the notebook it was filed under, and this is only the order they're read in.
export function flatPages(notebooks, pages) {
  const at = new Map(notebooks.map((nb) => [nb.id, nb.position ?? 0]));
  const place = (p) => at.get(p.notebookId) ?? 0;
  return [...pages].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || (place(a) - place(b)) || ((a.n || 0) - (b.n || 0)));
}
// The notebook a new page is filed under: wherever the last one went, or the last one touched
export function homeOf(notebooks, flat) {
  const last = flat.at(-1);
  if (last) return last.notebookId;
  if (!notebooks.length) return null;
  return notebooks.reduce((a, b) => (String(b.updatedAt || "") > String(a.updatedAt || "") ? b : a)).id;
}
// The number a new page is filed under
export const nextN = (written) => written.reduce((m, p) => Math.max(m, p.n || 0), 0) + 1;

export function keyLessons(written) {
  return written.flatMap((p, i) => (p.lines || []).map((l, li) => ({ ...l, li })).filter((l) => l.key && l.text)
    .map((l) => ({ text: l.text, t: l.t, li: l.li, page: i + 1, pageId: p.id, videoId: p.videoId || null, createdAt: p.createdAt })));
}

export function bookOf(written) {
  const fresh = written.length + 1;
  const keys = keyLessons(written);
  const keyPages = Math.max(1, Math.ceil(keys.length / RULES));
  const keyFrom = fresh + 1;
  return { written, fresh, keys, keyFrom, keyPages, last: keyFrom + keyPages - 1 };
}

export function freshPage(notebookId, written) {
  const prev = written.at(-1);
  return {
    id: null, fresh: true, notebookId, n: nextN(written), title: "", lines: [], attachments: [], tradeId: null,
    videoId: prev?.videoId ?? null, videoTitle: prev?.videoTitle ?? null, videoChannel: prev?.videoChannel ?? null,
    videoLen: prev?.videoLen ?? null, videoAt: prev?.videoAt ?? null, createdAt: null, updatedAt: null,
  };
}

export const isEmptyPage = (p, prev) => !p.lines?.length && !p.attachments?.length && !String(p.title || "").trim() && !p.tradeId && (p.videoId || null) === (prev?.videoId || null);

/* ---------- Dates ---------- */

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysBetween = (iso, now) => Math.round((dayStart(new Date(now)) - dayStart(new Date(iso))) / 864e5);
const valid = (iso) => !!iso && !Number.isNaN(Date.parse(iso));

export function pageDate(iso, now) {
  if (!valid(iso)) return "";
  const d = daysBetween(iso, now), x = new Date(iso);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${DAYS[x.getDay()]} ${x.getDate()} ${MONTHS[x.getMonth()]}`;
}
export function shortDate(iso, now) {
  if (!valid(iso)) return "";
  const d = daysBetween(iso, now), x = new Date(iso);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${MONTHS[x.getMonth()]} ${x.getDate()}`;
}
export function weekRange(now) {
  const b = new Date(now), a = new Date(b.getTime() - 7 * 864e5);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}` : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}
const latest = (...isos) => isos.filter(valid).sort().at(-1) || null;

/* ---------- The shelf ---------- */

export function notebookSummary(nb, pages) {
  const written = pagesOf(pages, nb.id);
  return {
    pages: written.length,
    keys: keyLessons(written).length,
    last: latest(nb.updatedAt, nb.createdAt, ...written.map((p) => p.updatedAt)),
  };
}

export function ribbonOf(notebooks, pages) {
  if (!notebooks.length) return null;
  const withLast = notebooks.map((nb) => ({ nb, ...notebookSummary(nb, pages) }));
  const top = withLast.reduce((a, b) => (String(b.last || "") > String(a.last || "") ? b : a));
  const written = pagesOf(pages, top.nb.id);
  const n = Math.min(Math.max(1, top.nb.lastPage || 1), written.length + 1);
  return { notebook: top.nb, n, page: written[n - 1] || null, fresh: n > written.length };
}

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function search(notebooks, pages, q, limit = 8) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length || words.join("").length < 2) return [];
  const has = (s) => { const f = fold(s); return words.every((w) => f.includes(w)); };
  const out = [];
  for (const nb of [...notebooks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    pagesOf(pages, nb.id).forEach((p, i) => {
      if (p.title && has(p.title)) out.push({ nb, page: i + 1, pageId: p.id, text: p.title, t: null, title: true });
      (p.lines || []).forEach((l, li) => {
        const words = plain(l.text);
        if (has(words)) out.push({ nb, page: i + 1, pageId: p.id, text: words.split("\n").find(has) || words, t: l.t, li, key: !!l.key });
      });
    });
  }
  return out.slice(0, limit);
}

export function thisWeek(notebooks, pages, now) {
  const from = new Date(now).getTime() - 7 * 864e5;
  const out = [];
  for (const nb of [...notebooks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    for (const k of keyLessons(pagesOf(pages, nb.id))) {
      if (valid(k.createdAt) && Date.parse(k.createdAt) >= from) out.push({ ...k, nb });
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.page - b.page || a.li - b.li);
}

// The whole shelf, counted
export const shelfCount = (pages) => ({ pages: pages.length, keys: pages.reduce((a, p) => a + (p.lines || []).filter((l) => l.key && l.text).length, 0) });

// Anything from the example desk: shown, never saved
export const isExample = (x) => !!x && (x.example === true || String(x.id || "").startsWith("ex-"));
