export const CREWS = {
  OLY: { tag: "OLY", name: "Olympians", no: "I", world: "The old masters", motto: "Long memories, steady hands.", img: "art/masters/wanderer-friedrich-960.webp", small: "art/masters/wanderer-friedrich-480.webp", pos: "50% 40%" },
  NITE: { tag: "NITE", name: "Night Shift", no: "II", world: "Anime and ink", motto: "Anime on the second screen. Every entry, one clean brushstroke.", img: "site/c1-nite.webp", small: "site/c1-nite-700.webp", pos: "50% 18%", invert: true },
  PIT: { tag: "PIT", name: "Pit Lane", no: "III", world: "The supercars", motto: "Supercar speed, cold heads. They know exactly when to pit.", img: "site/c1-pit.webp", small: "site/c1-pit-700.webp", pos: "50% 78%" },
};
export const CREW_ORDER = ["OLY", "NITE", "PIT"];
export const crewName = (tag) => CREWS[tag]?.name || "";

export const ROOM_GENERAL = "general";
export const GENERAL_ABOUT = "Everyone, every market.";
export const TOPICS = [
  { id: "futures", name: "Futures", about: "Index, energy and metals futures: sessions, execution and process." },
  { id: "forex", name: "Forex", about: "Currency pairs: sessions, news days and how you trade them." },
  { id: "stocks", name: "Stocks", about: "Shares and ETFs: the open, earnings and holding overnight." },
  { id: "props", name: "Prop firms", about: "Evaluations, rules, payouts and choosing a firm." },
  { id: "psych", name: "Psychology", about: "Tilt, discipline, routines and the head side of trading." },
  { id: "wins", name: "Wins & losses", about: "Post the day, good or bad, and what it taught you." },
  { id: "help", name: "Help", about: "Stuck on something, in trading or in Marble? Ask here." },
];
export const TOPIC_IDS = TOPICS.map((t) => t.id);
const TOPIC = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
export const roomName = (room) => (room === ROOM_GENERAL ? "General" : TOPIC[room]?.name || crewName(room));
