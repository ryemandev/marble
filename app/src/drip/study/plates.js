import { art } from "../../data";
import { COVERS, pagesOf } from "../../views/study/model.js";

const hash = (text) => [...String(text)].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)) >>> 0, 7);

// A picture for anything that has none yet: the same one every time, from the covers
export const plateFor = (name) => COVERS[hash(name) % COVERS.length][0];
// The picture a setup really shows. A statue saved before they came down shows whatever art() put in its place.
export function pictureOf(path, name) {
  if (!path) return plateFor(name);
  return art(path).replace(/^.*\/art\//, "").replace(/\.webp$/, "");
}

// The widest word decides how big a title can go without breaking inside a word
export const widestWord = (text) => Math.max(1, ...String(text).split(/\s+/).map((w) => [...w].length));

// A true minus sign, the same as money has
export const signed = (text) => String(text).replace("-", "−");

// Pages written about this setup: any page linked to one of its trades, newest first
export function notesFor(setup, pages, notebooks, trades) {
  const mine = new Map(trades.filter((t) => t.setup === setup).map((t) => [t.id, t]));
  const books = new Map(notebooks.map((nb) => [nb.id, nb]));
  return pages
    .filter((p) => p.tradeId && mine.has(p.tradeId) && books.has(p.notebookId))
    .map((p) => {
      const nb = books.get(p.notebookId);
      return { page: p, nb, n: pagesOf(pages, nb.id).findIndex((x) => x.id === p.id) + 1, trade: mine.get(p.tradeId) };
    })
    .sort((a, b) => String(b.page.createdAt || "").localeCompare(String(a.page.createdAt || "")));
}
