export const PICTURES = [
  { id: "porsche-rear", name: "Porsche GT3", src: "/art/cars/porsche-rear" },
  { id: "porsche-911-black", name: "Porsche 911", src: "/art/cars/porsche-911-black", dark: true },
  { id: "porsche-wing", name: "Porsche at dusk", src: "/art/cars/porsche-wing", dark: true },
  { id: "ferrari-black", name: "Ferrari", src: "/art/cars/ferrari-black", dark: true },
  { id: "aston-dbs", name: "Aston Martin", src: "/art/cars/aston-dbs", dark: true },
  { id: "aston-road", name: "Aston on the road", src: "/art/cars/aston-road" },
  { id: "great-wave-hokusai", name: "The Great Wave", src: "/art/prints/great-wave-hokusai" },
  { id: "evening-snow-kanbara-hiroshige", name: "Evening snow", src: "/art/prints/evening-snow-kanbara-hiroshige" },
  { id: "self-portrait-rembrandt", name: "Rembrandt", src: "/art/masters/self-portrait-rembrandt", dark: true, at: [0.5, 0.2] },
  { id: "calling-of-matthew-caravaggio", name: "The calling", src: "/art/masters/calling-of-matthew-caravaggio", dark: true, at: [0.5, 0.3] },
  { id: "samurai-duel", name: "The duel", src: "/art/anime/samurai-duel", at: [0.5, 0.3] },
  { id: "torii-tunnel", name: "Torii", src: "/art/japan/torii-tunnel", at: [0.5, 0.5] },
  { id: "pale-horse-dore", name: "The pale horse", src: "/art/masters/pale-horse-dore", dark: true, at: [0.5, 0.4] },
  { id: "colossus-goya", name: "The colossus", src: "/art/masters/colossus-goya", dark: true, at: [0.5, 0.14] },
  { id: "wanderer-friedrich", name: "The wanderer", src: "/art/masters/wanderer-friedrich", at: [0.5, 0.34] },
  { id: "storm-below-fuji-hokusai", name: "Storm below Fuji", src: "/art/prints/storm-below-fuji-hokusai" },
];
export const NONE = "none";
export const OWN = "own";
export const BACKDROP = Object.freeze({ pic: NONE, panels: "glass", own: null, mono: false });

const OWN_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9]{1,24}\.jpg$/;
export const ownPathOk = (p) => typeof p === "string" && OWN_PATH.test(p);
const pictureOf = (id) => PICTURES.find((p) => p.id === id) || null;
// Pictures that have left, so a saved choice lands on the one that took its place
const MOVED = { "david-dark": "calling-of-matthew-caravaggio", "apollo-light": "wanderer-friedrich", "hercules-dark": "self-portrait-rembrandt", "titan-silhouette": "colossus-goya" };

export function backdropOf(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const pic = MOVED[r.pic] || r.pic;
  return {
    pic: pic === NONE || pic === OWN || pictureOf(pic) ? pic : BACKDROP.pic,
    panels: r.panels === "soft" ? "soft" : "glass",
    own: ownPathOk(r.own) ? r.own : null,
    mono: r.mono === true,
    at: Number.isFinite(r.at) && r.at > 0 ? r.at : 0,
  };
}

export function newerBackdrop(a, b) {
  const x = a && typeof a === "object" ? backdropOf(a) : null, y = b && typeof b === "object" ? backdropOf(b) : null;
  if (!x || !y) return x || y;
  return y.at > x.at ? y : x;
}
