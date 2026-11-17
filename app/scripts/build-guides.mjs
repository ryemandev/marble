// Static guide pages at /guides/<slug>/ from content/guides/*.md, and the page shell every content page shares.
// A page dated in the future isn't built until that day: that's how the weekly batches go live.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";
import { parse as parseYaml } from "yaml";
import { ORIGIN, ld, organization } from "./seo/site-data.mjs";

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const slugify = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
export const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10));
export const human = (d) => { const t = new Date(iso(d)); return isNaN(t) ? "" : t.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); };
export const TODAY = process.env.CONTENT_NOW || iso(new Date());

// Markdown → HTML. Raw HTML in the Markdown is shown as text, never run; headings get ids for links to a section;
// links to other sites open in a new tab and carry no referrer; links on trademarble.app stay in the same tab.
export function makeMarked() {
  const used = new Map();
  const md = new Marked({ gfm: true, breaks: false });
  md.use({
    renderer: {
      html: ({ text }) => esc(text),
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(inner) || "section";
        const n = used.get(id) || 0; used.set(id, n + 1);
        if (n) id = `${id}-${n + 1}`;
        const level = Math.min(Math.max(depth, 2), 4); // the page's own title is the only h1
        return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${level}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safe = /^(https?:|mailto:|\/|#)/i.test(href || "") ? href : "#";
        const external = /^https?:/i.test(safe) && !safe.startsWith(ORIGIN);
        return `<a href="${esc(safe)}"${title ? ` title="${esc(title)}"` : ""}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
      },
      image({ href, title, text }) {
        const safe = /^(https?:|\/)/i.test(href || "") ? href : "";
        return safe ? `<img src="${esc(safe)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""} loading="lazy" decoding="async" />` : "";
      },
    },
  });
  return md;
}

// README.md and files starting with _ are notes and drafts; a page dated after `today` waits for its week
export function readGuides(dir, today = TODAY) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md") && !/^(readme\.md|_)/i.test(f)).map((f) => {
    const raw = readFileSync(join(dir, f), "utf8").replace(/^﻿/, "");
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
    if (!m) throw new Error(`${dir}: ${f} has no front matter`);
    const fm = parseYaml(m[1]) || {};
    const slug = slugify(fm.slug || f.replace(/\.md$/, ""));
    if (!fm.title || !fm.description) throw new Error(`${dir}: ${f} needs a title and a description`);
    return {
      file: f, slug, fm, title: String(fm.title), description: String(fm.description),
      date: iso(fm.date) || iso(new Date()), updated: iso(fm.updated || fm.date) || iso(new Date()),
      author: String(fm.author || "Marble"), keywords: Array.isArray(fm.keywords) ? fm.keywords.map(String) : String(fm.keywords || "").split(",").map((s) => s.trim()).filter(Boolean),
      related: Array.isArray(fm.related) ? fm.related.map((s) => slugify(s)) : [],
      faq: Array.isArray(fm.faq) ? fm.faq.filter((x) => x && x.q && x.a).map((x) => ({ q: String(x.q), a: String(x.a) })) : [],
      body: m[2],
    };
  }).filter((g) => g.date <= today).sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title));
}

const FONTS = "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Unbounded:wght@800&display=swap";
export const head = ({ title, description, url, type = "article", jsonLd, extra = "" }) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#ffffff" />
<meta name="color-scheme" content="light" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="${type}" />
<meta property="og:site_name" content="Marble" />
<meta property="og:locale" content="en_GB" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:image" content="${ORIGIN}/og.jpg?v=4" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.jpg?v=4" />
${extra}<link rel="icon" href="/favicon.ico?v=4" sizes="48x48" />
<link rel="icon" href="/favicon.svg?v=4" type="image/svg+xml" />
<link rel="icon" href="/favicon-96.png?v=4" type="image/png" sizes="96x96" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=4" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONTS}" />
<link rel="stylesheet" href="/guides/guides.css" />
${jsonLd}
</head>`;

// The owner's wordmark, inline so it's crisp and needs no request
const LOGO = readFileSync(new URL("../public/brand/marble-logo-black.svg", import.meta.url), "utf8").replace(/ role="img" aria-label="marble"/, ' aria-hidden="true" focusable="false"');
const brand = (cls, label, fontSize) => `<a class="${cls}" href="/" aria-label="${label}">${LOGO.replace("<svg ", `<svg width="${Math.round(fontSize * 4.6)}" height="${Math.round(fontSize * 1.68)}" `)}</a>`;
export const top = `<header class="g-top">
  ${brand("g-brand", "Marble home", 24)}
  <nav class="g-nav" aria-label="Marble"><a href="/guides/">Guides</a><a href="/prop-firms/">Prop firms</a><a class="g-cta" href="/desk/">Start journaling</a></nav>
</header>`;
export const bottom = `<footer class="g-foot">
  ${brand("g-brand small", "Marble home", 17)}
  <p>Marble is a trading journal, not financial advice. Trading carries a high risk of loss.</p>
  <p><a href="/">Home</a> · <a href="/free-trading-journal">Free trading journals compared</a> · <a href="/guides/">Guides</a> · <a href="/prop-firms/">Prop firm rules</a> · <a href="/everything">Everything in Marble</a> · <a href="/legal">Terms &amp; privacy</a></p>
</footer>`;

export const CTA = `<aside class="g-cta-box">
  <p class="g-kicker">Marble</p>
  <p class="g-cta-title">Journal every trade. <span class="silver">See your own numbers.</span></p>
  <p>Log each trade with its dollars and how it felt, or import it from Topstep, Tradovate, NinjaTrader, MetaTrader and more. Marble is free forever.</p>
  <a class="g-cta big" href="/desk/">Start journaling</a>
</aside>`;

function guidePage(g, bySlug) {
  const url = `${ORIGIN}/guides/${g.slug}/`;
  const body = makeMarked().parse(g.body);
  const words = g.body.split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 230));
  const related = g.related.map((s) => bySlug.get(s)).filter(Boolean);
  const graph = [
    organization(),
    {
      "@type": "Article", "@id": `${url}#article`, mainEntityOfPage: url, headline: g.title.slice(0, 110), description: g.description,
      datePublished: g.date, dateModified: g.updated, inLanguage: "en-GB", image: `${ORIGIN}/og.jpg?v=4`, wordCount: words,
      ...(g.keywords.length ? { keywords: g.keywords.join(", ") } : {}),
      author: g.author === "Marble" ? { "@id": `${ORIGIN}/#organization` } : { "@type": "Person", name: g.author },
      publisher: { "@id": `${ORIGIN}/#organization` },
    },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Marble", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${ORIGIN}/guides/` },
      { "@type": "ListItem", position: 3, name: g.title, item: url },
    ] },
    ...(g.faq.length ? [{ "@type": "FAQPage", "@id": `${url}#faq`, url, mainEntity: g.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }] : []),
  ];
  const faqHtml = g.faq.length ? `<section class="g-faq" id="faq" aria-labelledby="faq-title">
  <h2 id="faq-title">Questions</h2>
  ${g.faq.map(({ q, a }) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n  ")}
</section>` : "";
  const relHtml = related.length ? `<nav class="g-related" aria-label="Related guides">
  <h2>Related guides</h2>
  <ul>${related.map((r) => `<li><a href="/guides/${r.slug}/"><strong>${esc(r.title)}</strong><span>${esc(r.description)}</span></a></li>`).join("")}</ul>
</nav>` : "";
  const extra = `<meta property="article:published_time" content="${g.date}" />\n<meta property="article:modified_time" content="${g.updated}" />\n`;
  // The brand goes on the end only while the title still fits in a search result (60 characters)
  const title = `${g.title} — Marble`.length <= 60 ? `${g.title} — Marble` : g.title;
  return `${head({ title, description: g.description, url, jsonLd: ld({ "@context": "https://schema.org", "@graph": graph }), extra })}
<body>
${top}
<main class="g-main">
  <nav class="g-crumbs" aria-label="Breadcrumb"><a href="/">Marble</a><span aria-hidden="true">/</span><a href="/guides/">Guides</a></nav>
  <article class="g-article">
    <header class="g-head">
      <p class="g-kicker">Guide</p>
      <h1>${esc(g.title)}</h1>
      <p class="g-lede">${esc(g.description)}</p>
      <p class="g-meta">By ${esc(g.author)} · <time datetime="${g.date}">${human(g.date)}</time>${g.updated !== g.date ? ` · Updated <time datetime="${g.updated}">${human(g.updated)}</time>` : ""} · ${mins} min read</p>
    </header>
    <div class="g-body">
${body}
    </div>
    ${faqHtml}
  </article>
  ${CTA}
  ${relHtml}
  <p class="g-back"><a href="/">← Marble, the trading journal</a></p>
</main>
${bottom}
</body>
</html>
`;
}

function indexPage(guides) {
  const url = `${ORIGIN}/guides/`;
  const graph = [
    organization(),
    { "@type": "CollectionPage", "@id": url, url, name: "Trading journal guides — Marble", inLanguage: "en-GB", isPartOf: { "@id": `${ORIGIN}/#website` },
      mainEntity: { "@type": "ItemList", itemListElement: guides.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${ORIGIN}/guides/${g.slug}/`, name: g.title })) } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Marble", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: url },
    ] },
  ];
  return `${head({ title: "Trading Journal Guides — Marble", description: "Plain-English guides to journaling your trades, how prop firm rules work and what your own numbers say.", url, type: "website", jsonLd: ld({ "@context": "https://schema.org", "@graph": graph }) })}
<body>
${top}
<main class="g-main">
  <header class="g-head">
    <p class="g-kicker">Guides</p>
    <h1>Trading guides. <span class="silver">In plain English.</span></h1>
    <p class="g-lede">Guides to journaling your trades, how prop firm rules work and what your own numbers say.</p>
  </header>
  ${guides.length ? `<ul class="g-list">${guides.map((g) => `<li><a href="/guides/${g.slug}/"><span class="g-date"><time datetime="${g.date}">${human(g.date)}</time></span><strong>${esc(g.title)}</strong><span>${esc(g.description)}</span></a></li>`).join("")}</ul>` : `<p class="g-lede">New guides are on their way.</p>`}
  ${CTA}
</main>
${bottom}
</body>
</html>
`;
}

const CSS = `/* Marble guides: long-form reading in the site's look. White and true black, Unbounded for the headings, Geist for the rest. */
:root { --bg: #fff; --panel: #f3f3f2; --text: #000; --text-2: #5a5a58; --text-3: #6e6e6c; --line: rgba(0, 0, 0, 0.09); --line-2: rgba(0, 0, 0, 0.18);
  --sans: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; --mono: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; --display: "Unbounded", "Arial Black", system-ui, sans-serif; color-scheme: light; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { background: var(--bg); -webkit-text-size-adjust: 100%; scroll-padding-top: 80px; }
body { background: var(--bg); color: var(--text); font: 17px/1.7 var(--sans); -webkit-font-smoothing: antialiased; overflow-x: clip; }
a { color: inherit; }
img { max-width: 100%; height: auto; }
:focus-visible { outline: 2px solid #000; outline-offset: 3px; border-radius: 4px; }
.silver { color: var(--text-3); }

.g-top { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; background: var(--bg); border-bottom: 1px solid var(--line);
  padding: calc(14px + env(safe-area-inset-top, 0px)) max(24px, env(safe-area-inset-right, 0px)) 14px max(24px, env(safe-area-inset-left, 0px)); }
.g-brand { display: inline-flex; align-items: center; color: #000; text-decoration: none; }
.g-brand svg { display: block; flex: none; }
.g-brand.small { font-size: 17px; gap: 5px; }
.g-nav { display: flex; align-items: center; gap: 22px; }
.g-nav a { font: 500 13px/1.3 var(--sans); color: var(--text-2); text-decoration: none; white-space: nowrap; }
.g-nav a:hover { color: var(--text); }
.g-cta { display: inline-flex; align-items: center; height: 38px; padding: 0 16px; border-radius: 999px; color: #fff !important; background: #000;
  font: 600 13px/1 var(--sans) !important; letter-spacing: 0 !important; text-transform: none !important; text-decoration: none; }
.g-cta.big { height: 52px; padding: 0 22px; font-size: 15px !important; margin-top: 8px; }

.g-main { max-width: 760px; margin: 0 auto; padding: 48px max(24px, env(safe-area-inset-right, 0px)) 72px max(24px, env(safe-area-inset-left, 0px)); }
.g-crumbs { display: flex; gap: 10px; font: 500 13px/1.3 var(--sans); color: var(--text-3); margin-bottom: 36px; }
.g-crumbs a { color: var(--text-3); text-decoration: none; } .g-crumbs a:hover { color: var(--text); }
.g-kicker { font: 500 13px/1.3 var(--sans); color: var(--text-3); margin-bottom: 18px; }
.g-head h1 { font: 800 clamp(30px, 5vw, 48px)/1.06 var(--display); letter-spacing: -0.035em; text-wrap: balance; }
.g-lede { margin-top: 20px; font-size: 19px; line-height: 1.6; color: var(--text-2); text-wrap: pretty; }
.g-meta { margin-top: 18px; font: 500 13px/1.5 var(--sans); color: var(--text-3); }
.g-head { padding-bottom: 36px; border-bottom: 1px solid var(--line); margin-bottom: 40px; }

.g-body { overflow-wrap: anywhere; }
.g-body > * + * { margin-top: 1.1em; }
.g-body h2, .g-body h3, .g-body h4 { position: relative; letter-spacing: -0.03em; line-height: 1.15; text-wrap: balance; }
.g-body h2 { font: 800 clamp(23px, 3vw, 28px)/1.15 var(--display); margin-top: 2em; color: var(--text); }
.g-body h3 { font: 600 22px/1.2 var(--sans); margin-top: 1.7em; }
.g-body h4 { font: 600 18px/1.3 var(--sans); margin-top: 1.5em; }
.g-body .anchor { position: absolute; left: -1.1em; width: 1em; color: var(--text-3); text-decoration: none; opacity: 0; -webkit-text-fill-color: var(--text-3); }
.g-body h2:hover .anchor, .g-body h3:hover .anchor, .g-body h4:hover .anchor { opacity: 1; }
.g-body p, .g-body li { color: var(--text); }
.g-body a { text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 3px; }
.g-body a:hover { text-decoration-color: #000; }
.g-body ul, .g-body ol { padding-left: 1.3em; } .g-body li + li { margin-top: 0.4em; }
.g-body strong { color: #000; font-weight: 600; }
.g-body blockquote { border-left: 2px solid var(--line-2); padding: 4px 0 4px 18px; color: var(--text-2); }
.g-body code { font: 500 0.88em/1.5 var(--mono); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; }
.g-body pre { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; overflow-x: auto; }
.g-body pre code { border: 0; padding: 0; background: none; }
.g-body hr { border: 0; border-top: 1px solid var(--line); margin: 2.4em 0; }
.g-body table { width: 100%; border-collapse: collapse; font-size: 15px; display: block; overflow-x: auto; }
.g-body th, .g-body td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.g-body th { white-space: nowrap; }
.g-body td { min-width: 9em; }
.g-body th { font: 500 11px/1.4 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3); }
.g-body img { border-radius: 12px; border: 1px solid var(--line); }

.g-faq { margin-top: 56px; padding-top: 32px; border-top: 1px solid var(--line); }
.g-faq h2 { font: 600 30px/1.15 var(--sans); letter-spacing: -0.03em; margin-bottom: 12px; }
.g-faq details { border-bottom: 1px solid var(--line); }
.g-faq summary { cursor: pointer; padding: 18px 0; font: 600 17px/1.4 var(--sans); list-style: none; display: flex; justify-content: space-between; gap: 16px; }
.g-faq summary::-webkit-details-marker { display: none; }
.g-faq summary::after { content: "+"; font-family: var(--mono); color: var(--text-3); }
.g-faq details[open] summary::after { content: "–"; }
.g-faq details p { padding: 0 0 18px; color: var(--text-2); }

.g-cta-box { margin-top: 56px; padding: 32px; border-radius: 20px; background: var(--panel); box-shadow: inset 0 0 0 1px var(--line); }
.g-cta-title { font: 600 28px/1.1 var(--sans); letter-spacing: -0.035em; margin-bottom: 14px; text-wrap: balance; }
.g-cta-box p:not(.g-kicker):not(.g-cta-title) { color: var(--text-2); }

.g-related { margin-top: 48px; }
.g-related h2 { font: 500 13px/1.3 var(--sans); color: var(--text-3); margin-bottom: 14px; }
.g-related ul, .g-list { list-style: none; display: grid; gap: 1px; background: var(--line); border-radius: 16px; overflow: hidden; box-shadow: 0 0 0 1px var(--line); }
.g-related a, .g-list a { display: flex; flex-direction: column; gap: 6px; padding: 20px 22px; background: var(--bg); text-decoration: none; }
.g-related a:hover, .g-list a:hover { background: var(--panel); }
.g-related strong, .g-list strong { font: 600 18px/1.3 var(--sans); letter-spacing: -0.02em; color: var(--text); }
.g-related span, .g-list span { color: var(--text-2); font-size: 15px; line-height: 1.5; }
.g-list { margin-top: 8px; }
.g-list .g-date { font: 500 13px/1.3 var(--sans); color: var(--text-3); }
.g-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 1px; margin-top: 8px; background: var(--line); border-radius: 16px; overflow: hidden; box-shadow: 0 0 0 1px var(--line); }
.g-facts div { background: var(--bg); padding: 16px 18px; }
.g-facts dt { font: 500 11px/1.4 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3); }
.g-facts dd { margin-top: 6px; font-weight: 600; line-height: 1.45; }
.g-section { margin-top: 56px; }
.g-intro { margin-top: 40px; }
.g-section > h2 { font: 600 30px/1.15 var(--sans); letter-spacing: -0.03em; text-wrap: balance; }
.g-section > p { margin-top: 12px; color: var(--text-2); }
.g-section .g-body { margin-top: 20px; }
.g-body td:first-child { font-weight: 600; color: var(--text); }
.g-sources summary { cursor: pointer; font-weight: 600; padding: 12px 0; }
.g-sources ul { list-style: none; columns: 2 240px; column-gap: 24px; font-size: 14px; }
.g-sources li { break-inside: avoid; padding: 3px 0; overflow-wrap: anywhere; }
.g-sources a { color: var(--text-2); }
.g-back { margin-top: 40px; font-size: 15px; } .g-back a { color: var(--text-2); text-decoration: none; } .g-back a:hover { color: var(--text); }

.g-foot { border-top: 1px solid var(--line); padding: 32px max(24px, env(safe-area-inset-right, 0px)) calc(40px + env(safe-area-inset-bottom, 0px)) max(24px, env(safe-area-inset-left, 0px));
  display: flex; flex-direction: column; gap: 10px; align-items: flex-start; color: var(--text-3); font-size: 13px; max-width: 760px; margin: 0 auto; }
.g-foot a { color: var(--text-2); text-decoration: none; } .g-foot a:hover { color: var(--text); }

@media (max-width: 640px) {
  body { font-size: 16px; }
  .g-top { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .g-main { padding: 32px max(16px, env(safe-area-inset-right, 0px)) 56px max(16px, env(safe-area-inset-left, 0px)); }
  .g-nav { gap: 12px; }
  .g-nav a { font-size: 10px; letter-spacing: 0.1em; }
  .g-nav .g-cta { padding: 0 12px; }
  .g-brand:not(.small) { font-size: 21px; }
  .g-lede { font-size: 17px; }
  .g-body h2, .g-section > h2 { font-size: 25px; } .g-body h3 { font-size: 20px; }
  .g-body .anchor { display: none; }
  .g-cta-box { padding: 24px 20px; }
  .g-foot { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
}
`;

export function buildGuides(root, outDir, dir = process.env.GUIDES_DIR || join(root, "content", "guides")) {
  const guides = readGuides(dir);
  const bySlug = new Map(guides.map((g) => [g.slug, g]));
  const slugs = new Set();
  for (const g of guides) { if (slugs.has(g.slug)) throw new Error(`guides: duplicate slug ${g.slug}`); slugs.add(g.slug); }
  mkdirSync(join(outDir, "guides"), { recursive: true });
  writeFileSync(join(outDir, "guides", "guides.css"), CSS);
  writeFileSync(join(outDir, "guides", "index.html"), indexPage(guides));
  for (const g of guides) {
    mkdirSync(join(outDir, "guides", g.slug), { recursive: true });
    writeFileSync(join(outDir, "guides", g.slug, "index.html"), guidePage(g, bySlug));
  }
  console.log(`guides: ${guides.length} built into /guides/`);
  // A guide linking to one that isn't written yet (or a related slug with a typo) would be a dead link live
  for (const g of guides) {
    const missing = [...g.body.matchAll(/\]\(\/guides\/([^/)#\s]+)\/?[^)]*\)/g)].map((m) => m[1]).concat(g.related).filter((s) => !bySlug.has(s));
    if (missing.length) console.warn(`guides: WARNING ${g.file} links to guides that don't exist: ${[...new Set(missing)].join(", ")}`);
  }
  return guides;
}
