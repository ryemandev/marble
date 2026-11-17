import { search as searchStudy } from "../views/study/model.js";

const MAX_QUERY = 100;
const MARKS = /\p{M}/gu;
export const fold = (s) => String(s ?? "").normalize("NFD").replace(MARKS, "").toLowerCase();
export const wordsOf = (q) => [...new Set(fold(String(q ?? "").slice(0, MAX_QUERY)).split(/\s+/).filter(Boolean))].slice(0, 6);
// Too short to search: nothing typed, or one letter
export const ready = (q) => wordsOf(q).join("").length >= 2;
export const hasAll = (text, words) => { const f = fold(text); return words.length > 0 && words.every((w) => f.includes(w)); };

function folded(text) {
  let out = "";
  const at = [];
  let i = 0;
  for (const ch of String(text ?? "")) {
    const f = fold(ch);
    out += f;
    for (let k = 0; k < f.length; k++) at.push(i);
    i += ch.length;
  }
  at.push(i);
  return { out, at };
}

export function snippet(text, words, width = 96) {
  const src = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!src) return [];
  const { out, at } = folded(src);
  const ranges = [];
  for (const w of words) {
    for (let from = 0; ; ) {
      const k = out.indexOf(w, from);
      if (k < 0 || !w) break;
      ranges.push([at[k], at[k + w.length]]);
      from = k + w.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const hits = [];
  for (const r of ranges) { const last = hits.at(-1); if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else hits.push([...r]); }
  let lo = 0, hi = src.length;
  if (src.length > width) {
    const first = hits[0]?.[0] ?? 0;
    lo = Math.max(0, Math.min(first - Math.floor(width / 3), src.length - width));
    hi = Math.min(src.length, lo + width);
    if (lo > 0) { const sp = src.indexOf(" ", lo); if (sp > 0 && sp < first) lo = sp + 1; }
    if (hi < src.length) { const sp = src.lastIndexOf(" ", hi); if (sp > Math.max(lo, hits[0]?.[1] ?? lo)) hi = sp; }
  }
  const parts = [];
  if (lo > 0) parts.push({ text: "…", hit: false });
  let p = lo;
  for (const [a, b] of hits) {
    const s = Math.max(a, lo), e = Math.min(b, hi);
    if (e <= s) continue;
    if (s > p) parts.push({ text: src.slice(p, s), hit: false });
    parts.push({ text: src.slice(s, e), hit: true });
    p = e;
  }
  if (p < hi) parts.push({ text: src.slice(p, hi), hit: false });
  if (hi < src.length) parts.push({ text: "…", hit: false });
  return parts;
}

const time = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? t : 0; };

export function findTrades(trades, words, limit = 6) {
  if (!words.length) return [];
  const out = [];
  for (const t of trades) {
    const symbol = String(t.symbol || "");
    if (!hasAll(`${symbol} ${t.setup || ""} ${t.note || ""}`, words)) continue;
    const inNote = words.some((w) => fold(t.note).includes(w));
    out.push({
      kind: "trade", id: t.id, trade: t, at: time(t.traded_at),
      exact: words.length === 1 && fold(symbol) === words[0] ? 1 : 0,
      title: `${symbol} ${t.side || ""}`.trim(), copies: t.copies?.n || 0, inNote,
      symbolParts: snippet(symbol, words), setupParts: snippet(t.setup || "", words),
      parts: inNote ? snippet(t.note, words) : snippet(t.setup || "", words),
    });
  }
  return out.sort((a, b) => b.exact - a.exact || b.at - a.at).slice(0, limit);
}

export function findPages(notebooks, pages, q, limit = 6) {
  return searchStudy(notebooks, pages, q, limit).map((r) => ({
    kind: "page", id: `${r.pageId}·${r.li ?? "t"}`, notebookId: r.nb.id, pageId: r.pageId, page: r.page, notebook: r.nb.title || "Notebook", cover: r.nb.cover || null,
    key: !!r.key, isTitle: !!r.title, parts: snippet(r.text, wordsOf(q)),
  }));
}

export function findPosts(rows, words, limit = 6) {
  return (rows || []).filter((p) => p && hasAll(p.body, words)).slice(0, limit).map((p) => ({
    kind: "post", id: p.id, postId: p.parent_id || p.id, reply: !!p.parent_id, at: time(p.created_at),
    who: p.anonymous ? null : p.author_handle || null, anonymous: !!p.anonymous, parts: snippet(p.body, words),
  }));
}

export function findMessages(threads, words, limit = 6) {
  if (!words.length) return [];
  const out = [];
  for (const th of threads || []) {
    const handle = th?.with?.handle || "";
    const msgs = [...(th.messages || [])].filter((m) => m && m.body).sort((a, b) => time(b.at) - time(a.at));
    const hit = msgs.find((m) => hasAll(m.body, words) || hasAll(`${handle} ${m.body}`, words));
    const byName = !hit && hasAll(handle, words);
    if (!hit && !byName) continue;
    const m = hit || msgs[0] || null;
    out.push({ kind: "dm", id: th.id, threadId: th.id, who: handle, avatar: th.with?.avatar || null, mine: !!m?.mine, at: time(m?.at || th.at), parts: m ? snippet(m.body, words) : [] });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}
