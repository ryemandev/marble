// trademarble.app/c/<id>: the public page for a card. Everything else on the domain is static files and never reaches this
// Worker (wrangler.jsonc sends only /c/* here). The page is written on the server so a link preview sees the card itself,
// and everything on it beside the picture comes from card_link_read, not from the picture. Marble says where a number
// came from and doesn't check it against a broker, so the page never claims more than that.
const ID = /^[A-Za-z0-9]{10}$/;
const SIZES = { wide: [1920, 1080], post: [1080, 1080], story: [1080, 1920] };
const NAMES = { trade: "A trade", day: "A closed day" };
const CONTACT = "support@example.com";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const day = (at) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// The same shape a card prints: whole dollars from 1,000 up, a true minus sign
export function money(v, sign = "$") {
  const n = Number(v), abs = Math.abs(n);
  const digits = abs >= 1000 || Number.isInteger(n) ? 0 : 2;
  return `${n < 0 ? "−" : "+"}${sign}${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// The words the journal uses. Money from anywhere else gets no line at all.
export function cameFrom({ file = 0, typed = 0, other = 0 }) {
  const n = file + typed;
  if (other || !n) return null;
  if (file === n) return n === 1 ? "From a file" : `All ${n} from a file`;
  if (typed === n) return n === 1 ? "Typed in" : `All ${n} typed in`;
  return `${file} from a file, ${typed} typed in`;
}

export function since(card) {
  if (card.gone) return card.file + card.typed + card.other ? "Some deleted from the journal" : "Deleted from the journal";
  return card.same ? "Unchanged" : "Edited";
}

const CSS = `
:root { --ink: #000; --soft: #5a5a58; --line: #e4e4e1; --paper: #fff; --panel: #f2f2f0; --display: "Unbounded", "Arial Black", system-ui, sans-serif; --sans: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
html { color-scheme: light; -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 16px/1.5 var(--sans); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
.top, .card, .foot { width: 100%; max-width: 1120px; margin-inline: auto; padding-inline: max(20px, env(safe-area-inset-left, 0px)) max(20px, env(safe-area-inset-right, 0px)); }
.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-block: 20px; }
.top img { display: block; width: 116px; height: auto; }
.go { display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px; border-radius: 999px; background: var(--ink); color: var(--paper); font-weight: 600; font-size: 15px; text-decoration: none; }
.card { display: grid; gap: clamp(28px, 4vw, 56px); align-items: center; padding-block: clamp(12px, 3vw, 40px) clamp(40px, 6vw, 80px); }
.fmt-wide { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
.fmt-post { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
.fmt-story { grid-template-columns: minmax(0, 360px) minmax(0, 440px); justify-content: center; }
.pic { margin: 0; min-width: 0; }
.pic img { display: block; width: 100%; height: auto; border-radius: 16px; background: var(--panel); }
.facts { min-width: 0; }
h1 { margin: 0; font: 800 clamp(26px, 3vw, 36px)/1.12 var(--display); letter-spacing: -0.03em; text-wrap: balance; }
.big { margin: 16px 0 0; font: 800 clamp(38px, 5vw, 56px)/1.05 var(--display); letter-spacing: -0.04em; overflow-wrap: anywhere; }
.big small { display: block; margin-top: 8px; font: 500 15px/1.3 var(--sans); letter-spacing: 0; color: var(--soft); }
dl { display: grid; margin: 24px 0 0; border-top: 1px solid var(--line); }
dl div { display: flex; justify-content: space-between; gap: 20px; padding: 13px 0; border-bottom: 1px solid var(--line); }
dt { color: var(--soft); }
dd { margin: 0; font-weight: 600; text-align: right; }
.note { margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: var(--soft); text-wrap: pretty; }
.gone { max-width: 620px; margin-inline: auto; padding: clamp(48px, 9vw, 120px) max(20px, env(safe-area-inset-right, 0px)); }
.gone p { margin: 14px 0 0; font-size: 17px; color: var(--soft); }
.end { background: #000; color: #fff; }
.end img { display: block; width: 100%; height: clamp(150px, 24vw, 320px); object-fit: cover; object-position: 60% 70%; }
.end div { max-width: 1120px; margin-inline: auto; padding: clamp(32px, 5vw, 64px) max(20px, env(safe-area-inset-right, 0px)) clamp(40px, 6vw, 72px) max(20px, env(safe-area-inset-left, 0px)); }
.end h2 { margin: 0; max-width: 16em; font: 800 clamp(28px, 4.4vw, 56px)/1.08 var(--display); letter-spacing: -0.03em; text-wrap: balance; }
.end p { margin: 14px 0 24px; font-size: 18px; color: rgba(255, 255, 255, 0.72); }
.end .go { background: #fff; color: #000; }
.foot { display: flex; flex-wrap: wrap; gap: 8px 20px; padding-block: 20px; font-size: 14px; color: var(--soft); }
@media (max-width: 820px) {
  .fmt-wide, .fmt-post, .fmt-story { grid-template-columns: minmax(0, 1fr); }
  .fmt-story .pic { max-width: 360px; margin-inline: auto; width: 100%; }
}`;

function shell({ title, nonce, head = "", body, id }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#ffffff">
<title>${esc(title)}</title>
${head}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Unbounded:wght@800&display=swap" rel="stylesheet">
<style nonce="${nonce}">${CSS}</style>
</head>
<body>
<header class="top"><a href="/" aria-label="Marble"><img src="/brand/marble-logo-black.svg" alt="Marble" width="116" height="48"></a><a class="go" href="/desk/">Start free</a></header>
${body}
<section class="end"><img src="/site/end-wave-ink.webp" alt="" loading="lazy" width="1600" height="900"><div>
<h2>Stop paying to build better habits.</h2>
<p>The free trading journal. No card, no plans.</p>
<a class="go" href="/desk/">Start free</a>
</div></section>
<footer class="foot"><a href="/">trademarble.app</a><a href="/legal#terms">Terms</a><a href="/legal#privacy">Privacy</a>${id ? `<a href="mailto:${CONTACT}?subject=${encodeURIComponent(`Card ${id}`)}">Report this card</a>` : ""}</footer>
</body>
</html>`;
}

export function livePage(card, id, env, nonce) {
  const name = NAMES[card.kind] || "A card";
  const picture = `${env.SUPABASE_URL}/storage/v1/object/public/cards/${id}.jpg`;
  const [w, h] = SIZES[card.format] || SIZES.post;
  const title = `${name} on Marble`;
  const words = "See where the numbers on this card came from.";
  const from = cameFrom(card);
  const lines = [
    from && ["Where it came from", from],
    ["Since this card was made", since(card)],
    card.days > 0 && ["Days closed on Marble", card.days.toLocaleString("en-US")],
  ].filter(Boolean);
  const head = `<meta name="description" content="${esc(words)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Marble">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(words)}">
<meta property="og:url" content="https://trademarble.app/c/${id}">
<meta property="og:image" content="${esc(picture)}">
<meta property="og:image:width" content="${w}">
<meta property="og:image:height" content="${h}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(words)}">
<meta name="twitter:image" content="${esc(picture)}">`;
  const figure = card.money == null ? "" : `<p class="big">${esc(money(card.money, card.sign))}${card.simulated ? "<small>Simulated money</small>" : ""}</p>`;
  const body = `<main class="card fmt-${esc(SIZES[card.format] ? card.format : "post")}">
<figure class="pic"><img src="${esc(picture)}" alt="${esc(title)}" width="${w}" height="${h}"></figure>
<section class="facts">
<h1>${esc(title)}</h1>
${figure}
<dl>${lines.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
<p class="note">Link made ${esc(day(card.made_at))}. These lines come from the trader's journal, not from the picture. Marble shows where a number came from. It doesn't check it against a broker.</p>
</section>
</main>`;
  return shell({ title, nonce, head, body, id });
}

const notice = (title, words, nonce) => shell({ title, nonce, body: `<main class="gone"><h1>${esc(title)}</h1><p>${esc(words)}</p></main>` });
export const downPage = (card, nonce) => notice("This card was taken down", `Its owner took it back on ${day(card.removed_at)}.`, nonce);
export const missingPage = (nonce) => notice("There's no card here", "Check the link, or ask whoever sent it.", nonce);
export const troublePage = (nonce) => notice("This card didn't load", "Try again in a moment.", nonce);

function headers(env, nonce, extra = {}) {
  return {
    "content-type": "text/html; charset=utf-8",
    "x-robots-tag": "noindex", // not robots.txt: a link preview has to be able to read the page
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "content-security-policy": `default-src 'none'; img-src 'self' ${env.SUPABASE_URL}; style-src 'nonce-${nonce}' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    ...extra,
  };
}

export async function cardPage(id, env, nonce, get = fetch) {
  const send = (html, status, cache = "public, max-age=60") => new Response(html, { status, headers: headers(env, nonce, { "cache-control": cache }) });
  if (!ID.test(id)) return send(missingPage(nonce), 404);
  let card;
  try {
    const r = await get(`${env.SUPABASE_URL}/rest/v1/rpc/card_link_read`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ p_id: id }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`read ${r.status}`);
    card = await r.json();
  } catch {
    return send(troublePage(nonce), 503, "no-store");
  }
  if (!card) return send(missingPage(nonce), 404);
  if (card.state === "down") return send(downPage(card, nonce), 410);
  return send(livePage(card, id, env, nonce), 200);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.match(/^\/c\/([^/]*)\/?$/);
    if (!path) return env.ASSETS.fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    return cardPage(path[1], env, nonce);
  },
};
