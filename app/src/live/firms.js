import { GROUPS } from "../site/works/firms.js";
import { LOGOS } from "../site/works/logos.js";
import { CRYPTO_ALIASES, CRYPTO_FIRMS, CRYPTO_GROUPS } from "../crypto/venues.js";

export const FIRMS = [];
for (const g of GROUPS) {
  for (const f of g.firms) {
    if (FIRMS.some((x) => x.slug === f.slug)) continue;
    FIRMS.push({ slug: f.slug, name: f.name, group: g.key, groupTitle: g.title, logo: LOGOS[f.slug] || null });
  }
}
const LOGO_OF = Object.fromEntries(CRYPTO_FIRMS.filter((f) => f.logo).map((f) => [f.slug, f.logo]));
const logoFor = (slug) => LOGOS[slug] || LOGOS[LOGO_OF[slug]] || null;
export const CRYPTO_PICK = CRYPTO_FIRMS.map((f) => ({ slug: f.slug, name: f.name, group: f.group, groupTitle: f.groupTitle, logo: logoFor(f.slug), world: "crypto", how: f.how, reads: f.reads, hint: f.hint || null }));
export const FIRM_GROUPS = [...GROUPS, ...CRYPTO_GROUPS].map((g) => ({ key: g.key, title: g.title }));

const BY_SLUG = Object.fromEntries([...CRYPTO_PICK, ...FIRMS].map((f) => [f.slug, f])); // Markets' entry wins a shared slug
export const firmOf = (slug) => (slug && BY_SLUG[slug]) || null;

// The short names traders actually type
const ALIASES = {
  apex: ["apex trader", "atf"],
  myfundedfutures: ["mffu", "my funded futures", "mff"],
  "take-profit-trader": ["tpt"],
  "elite-trader-funding": ["etf", "elite"],
  "funded-futures-network": ["ffn"],
  "interactive-brokers": ["ibkr", "ib", "interactive"],
  metatrader: ["mt4", "mt5", "meta trader"],
  ninjatrader: ["nt8", "ninja"],
  topstep: ["topstepx"],
  "goat": ["goat funded", "gft"],
  "for-traders": ["fortraders"],
  "alpha-capital": ["alpha capital", "acg"],
  fundednext: ["funded next"],
  "the5ers": ["5ers", "five ers"],
  e8: ["e8 funding", "e8 markets"],
  fxify: ["fx ify"],
  fundingpips: ["funding pips"],
  amp: ["amp futures"],
  "match-trader": ["matchtrader"],
  dxtrade: ["dx trade"],
  tradelocker: ["trade locker"],
  ...CRYPTO_ALIASES,
};

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function score(f, q) {
  const name = norm(f.name), slug = f.slug.replace(/-/g, " ");
  const names = [name, slug, ...(ALIASES[f.slug] || []).map(norm)];
  let best = 0;
  for (const n of names) {
    if (n === q) best = Math.max(best, 100);
    else if (n.startsWith(q)) best = Math.max(best, 80);
    else if (n.split(" ").some((w) => w.startsWith(q))) best = Math.max(best, 60);
    else if (n.replace(/ /g, "").includes(q.replace(/ /g, ""))) best = Math.max(best, 40);
  }
  return best;
}

export function searchFirms(query, world = "markets") {
  const pool = world === "crypto" ? CRYPTO_PICK : FIRMS;
  const q = norm(query);
  if (!q) return pool.slice();
  return pool.map((f, i) => ({ f, i, s: score(f, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.f);
}

export function matchFirm(name) {
  const n = norm(name);
  if (!n) return null;
  let found = null;
  for (const f of FIRMS) {
    for (const cand of [norm(f.name), f.slug.replace(/-/g, " "), ...(ALIASES[f.slug] || []).map(norm)]) {
      if (n === cand || n.startsWith(`${cand} `)) {
        if (!found || cand.length > found.len) found = { firm: f, len: cand.length };
      }
    }
  }
  return found?.firm || null;
}

export function readAccountName(name) {
  const n = norm(name);
  if (!n) return null;
  let best = null;
  for (const f of FIRMS) {
    for (const cand of [norm(f.name), f.slug.replace(/-/g, " "), ...(ALIASES[f.slug] || []).map(norm)]) {
      if ((n === cand || n.startsWith(`${cand} `)) && (!best || cand.length > best.cand.length)) best = { f, cand };
    }
  }
  if (!best) return null;
  const words = String(name).trim().split(/\s+/);
  return { firm: best.f.slug, label: words.slice(best.cand.split(" ").length).join(" ") };
}

export function accountTitle(a) {
  if (!a) return "";
  const f = firmOf(a.firm);
  if (f) return [f.name, a.label].filter(Boolean).join(" ");
  return [a.name, a.label && !String(a.name || "").endsWith(a.label) ? a.label : null].filter(Boolean).join(" ");
}

export function logoBox(slug, size = 24) {
  const l = logoFor(slug);
  if (!l) return null;
  const r = Math.min(Math.max(l.ratio, 0.6), 9);
  const h = Math.round(Math.min(size * 1.25, Math.max(size * 0.5, (size * 2.1) / Math.sqrt(r))));
  return { file: l.file, w: Math.round(h * r), h };
}
