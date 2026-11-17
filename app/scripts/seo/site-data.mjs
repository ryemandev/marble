// Search-engine and AI-crawler files for trademarble.app, built from the same data the website shows (the
// firms Marble imports from, the FAQ as it reads on the page) so they can never say something the site doesn't.
// Used by build-web.mjs: JSON-LD for the home, legal and section pages, their head tags, sitemap.xml, llms.txt
// and llms-full.txt.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ORIGIN = "https://trademarble.app";
const ORG_ID = `${ORIGIN}/#organization`;
const SITE_ID = `${ORIGIN}/#website`;
const APP_ID = `${ORIGIN}/#app`;

export const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

// The newest change to any file under these paths, as a date for sitemap lastmod
export function lastChanged(root, paths) {
  let newest = 0;
  const walk = (p) => {
    let s; try { s = statSync(p); } catch { return; }
    if (s.isDirectory()) readdirSync(p).forEach((n) => walk(join(p, n)));
    else newest = Math.max(newest, s.mtimeMs);
  };
  paths.forEach((p) => walk(join(root, p)));
  return new Date(newest || Date.now()).toISOString().slice(0, 10);
}

export async function loadSiteData(root) {
  const firms = await import(pathToFileURL(join(root, "src/site/works/firms.js")).href);
  // Every feature, as /everything lists it (written for the browser: bundled first)
  const everything = await importBundled(join(root, "src/site/everything/features.js"));
  // The prop firm rules the free tools are built on: each firm and the day its pages were last checked
  const firmRules = JSON.parse(readFileSync(join(root, "src/lib/firm-rules/index.json"), "utf8"));
  return { firms, everything, firmRules };
}

// A module written for the browser (extensionless imports, as Vite allows), bundled here so Node can load it
export async function importBundled(file) {
  const { build } = await import("esbuild");
  const { outputFiles } = await build({ entryPoints: [file], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
}

// Marble's own profiles on other sites. Listed as the Organization's sameAs, they tell Google these accounts and
// trademarble.app are the same brand. Full https addresses; an empty list leaves sameAs out.
export const SOCIAL_PROFILES = [
  "https://x.com/_trademarble",
  "https://www.instagram.com/trademarble/",
  "https://www.youtube.com/@trademarble",
];

// The brand's name as Google should show it ("Marble"), and the longer name people may search for
const BRAND = { name: "Marble", alternateName: ["Trade Marble", "TradeMarble", "Marble Trading Journal"] };

export const organization = () => ({
  "@type": "Organization",
  "@id": ORG_ID,
  ...BRAND,
  url: `${ORIGIN}/`,
  // A square PNG of at least 112px: the app icon, the black m on white
  logo: { "@type": "ImageObject", url: `${ORIGIN}/icon-512.png?v=4`, width: 512, height: 512 },
  email: "support@example.com",
  founder: { "@type": "Person", name: "[Your full name]" },
  areaServed: "Worldwide",
  ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
});

// Google takes the site name in results from this, on the home page
const website = () => ({ "@type": "WebSite", "@id": SITE_ID, url: `${ORIGIN}/`, ...BRAND, inLanguage: "en-GB", publisher: { "@id": ORG_ID } });

// Marble is free: one offer at nothing, pointing at the page that says so
const offers = () => [{ "@type": "Offer", name: "Free", price: "0", priceCurrency: "GBP", url: `${ORIGIN}/pricing`, availability: "https://schema.org/InStock" }];

const APP_DESCRIPTION = "A free trading journal for prop and personal accounts: every trade with its result in dollars, one total P&L by day, week, month or any range, and a place to study. Imports trades from Topstep, Tradovate, NinjaTrader, Rithmic, MetaTrader, cTrader and Interactive Brokers.";

function softwareApp() {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: "Marble",
    url: `${ORIGIN}/`,
    description: APP_DESCRIPTION,
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Trading journal",
    isAccessibleForFree: true,
    operatingSystem: "Web browser (desktop and mobile)",
    image: `${ORIGIN}/og.jpg?v=4`,
    publisher: { "@id": ORG_ID },
    offers: offers(),
  };
}

const faqPage = (faq, url) => (faq?.length ? {
  "@type": "FAQPage",
  "@id": `${url}#faq`,
  url,
  mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
} : null);

// The FAQ's structured data lives on /faq only, the page that is the FAQ, so it isn't claimed twice
export const homeJsonLd = () => ld({ "@context": "https://schema.org", "@graph": [organization(), website(), softwareApp()] });

const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A section page's head: title, description, canonical address and share tags (src/seo/pages.js has the words)
export function pageHead(page) {
  const url = `${ORIGIN}/${page.slug}`;
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Marble" />`,
    `<meta property="og:locale" content="en_GB" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:image" content="${ORIGIN}/og.jpg?v=4" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Marble, the trading journal" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${ORIGIN}/og.jpg?v=4" />`,
  ].join("\n    ");
}

// Every feature on /everything as one ItemList: each item is "Group: feature", what it does, and its own address on
// the page (/everything#oracle-time-questions), so a search engine (and its AI overview) can name what Marble does
function featureList({ everything }, url) {
  const items = everything.GROUPS.flatMap((g) => g.features.map((f) => ({ g, f })));
  return {
    "@type": "ItemList",
    "@id": `${url}#features`,
    name: "Everything in Marble",
    description: `Every feature of Marble, the trading journal, in ${everything.GROUPS.length} groups.`,
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: items.map(({ g, f }, i) => ({
      "@type": "ListItem", position: i + 1, name: `${g.name}: ${f.name}`, description: everything.plainText(f), url: `${url}#${f.id}`,
    })),
  };
}

// A section page: the page itself and where it sits, plus what it's about: the app and its one free offer on /pricing, the
// questions and answers on /faq, every feature on /everything
// A free tool page: the tool as a free web application, the questions it answers, and for the comparison, the rules
// it shows as a dataset with the day they were checked and the firms' own pages it was read from
function toolNodes(data, page, url) {
  const app = {
    "@type": "WebApplication", "@id": `${url}#tool`, name: page.name, url, description: page.description,
    applicationCategory: "FinanceApplication", operatingSystem: "Any", browserRequirements: "Requires JavaScript",
    isAccessibleForFree: true, inLanguage: "en-GB", publisher: { "@id": ORG_ID },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  const rules = data.firmRules;
  const firms = rules ? Object.values(rules.firms) : [];
  const dataset = page.tool.kind === "compare" && firms.length ? {
    "@type": "Dataset", "@id": `${url}#rules`, name: "Prop firm trading rules", url,
    description: `The trading rules of ${firms.length} prop firms (${firms.map((f) => f.name).join(", ")}) by program and account size: daily loss limits, maximum drawdowns and how they trail, profit targets, consistency rules, minimum trading days, contract limits, and news and holding rules, each read on the firm's own pages.`,
    dateModified: firms.map((f) => f.checked).sort().at(-1), version: rules.version, isAccessibleForFree: true,
    creator: { "@id": ORG_ID }, publisher: { "@id": ORG_ID },
    variableMeasured: ["Daily loss limit", "Maximum drawdown", "Profit target", "Consistency rule", "Minimum trading days", "Contract limit"],
    isBasedOn: firms.map((f) => f.src).filter((u) => /^https:\/\//.test(u || "")),
  } : null;
  return [app, faqPage(page.tool.faq, url), dataset];
}

export function pageJsonLd(data, page, faq) {
  const url = `${ORIGIN}/${page.slug}`;
  const features = page.slug === "everything" && data.everything ? featureList(data, url) : null;
  const graph = [
    organization(),
    website(),
    { "@type": "WebPage", "@id": url, url, name: page.title, description: page.description, inLanguage: "en-GB",
      isPartOf: { "@id": SITE_ID }, about: { "@id": APP_ID }, publisher: { "@id": ORG_ID }, breadcrumb: { "@id": `${url}#breadcrumb` },
      ...(features ? { mainEntity: { "@id": features["@id"] } } : page.tool ? { mainEntity: { "@id": `${url}#tool` } } : {}) },
    { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: "Marble", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: page.name, item: url },
    ] },
  ];
  // Marble is software, not a shipped product: as a Product, Google asked for shipping, returns and reviews
  if (page.slug === "pricing") graph.push(softwareApp());
  if (page.slug === "faq") graph.push(faqPage(faq, url));
  if (page.faq) graph.push(faqPage(page.faq, url));
  if (page.tool) graph.push(...toolNodes(data, page, url));
  // The app itself, with the same names as its featureList (schema.org's word for what an application does)
  if (features) graph.push(features, { ...softwareApp(), featureList: features.itemListElement.map((x) => x.name) });
  return ld({ "@context": "https://schema.org", "@graph": graph.filter(Boolean) });
}

export const legalJsonLd = () => ld({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "@id": `${ORIGIN}/legal`, url: `${ORIGIN}/legal`, name: "Terms, Privacy & Policies — Marble", inLanguage: "en-GB", isPartOf: { "@id": SITE_ID }, publisher: { "@id": ORG_ID } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Marble", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Terms, privacy and policies", item: `${ORIGIN}/legal` },
    ] },
  ],
});

// A light shape check: every node has a @type, every URL is absolute and on the site or schema.org, nothing empty
export function checkJsonLd(html) {
  const problems = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch (e) { problems.push(`invalid JSON: ${e.message}`); continue; }
    const visit = (o, path) => {
      if (Array.isArray(o)) return o.forEach((x, i) => visit(x, `${path}[${i}]`));
      if (o && typeof o === "object") {
        if (path !== "$" && !("@type" in o) && !("@id" in o) && !path.endsWith("@context")) problems.push(`no @type at ${path}`);
        for (const [k, v] of Object.entries(o)) {
          if (v === "" || v == null) problems.push(`empty ${path}.${k}`);
          if (typeof v === "string" && /^(url|item|@id|logo|image)$/.test(k) && !/^https:\/\//.test(v)) problems.push(`relative URL ${path}.${k}`);
          if (k === "sameAs" && (!Array.isArray(v) || !v.length || v.some((u) => typeof u !== "string" || !/^https:\/\/[^/]+\.[^/]+/.test(u)))) problems.push(`sameAs at ${path} needs full https profile addresses`);
          visit(v, `${path}.${k}`);
        }
      }
    };
    visit(obj["@graph"] || obj, "$");
  }
  return problems;
}

export function sitemap(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(({ loc, lastmod }) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`;
}

// llms.txt (the proposed format: H1, a one-paragraph summary in a blockquote, then sections of links) and
// llms-full.txt (the same facts plus every FAQ answer and guide in full), for AI assistants and agents
export function llmsTxt({ firms, everything }, faq, guides, pages = [], sections = []) {
  const groups = firms.GROUPS.map((g) => `- ${g.title}: ${g.firms.map((f) => f.name).join(", ")}`).join("\n");
  const ready = Object.values(firms.PLATFORMS).filter((p) => p.file === "ready").map((p) => p.name).join(", ");
  const facts = `## Facts

- What it is: Marble is a web-based trading journal. Each trade is logged with its result in dollars and how it felt; analytics then show which setups, hours and habits make or cost money.
- Who it's for: futures, forex/CFD and stock traders, on prop firm and personal accounts.
- Ask your journal: reads the trader's own journal and answers a set menu of questions in numbers (best and worst hours, which setup has paid the most, what going off plan has cost, how much of the profit came from the best day), each with the trades behind it. The answers are worked out from the journal itself; they describe past trades and aren't advice.
- Imports: trades can be imported from the export files of ${ready}. Marble never asks for a trading password and never places trades.
- Prop firms and platforms covered:
${groups}
- Price: Marble is free forever, with every feature in it. No payment, no card, no trial and no plans to choose.
- Data: each trader's journal is private, never sold, and can be exported or deleted at any time. Data is stored in the UK, in London.
- Not advice: Marble is a journal, not a broker, signal service or financial adviser.
- Company: Marble is run by [Your full name], [your business type and location]. Contact: support@example.com.`;
  const links = `## Pages

- [Marble — the trading journal](${ORIGIN}/): what Marble does, the live app running and the FAQ.
${pages.map((p) => `- [${p.name}](${ORIGIN}/${p.slug}): ${p.description}`).join("\n")}
- [Terms, privacy and policies](${ORIGIN}/legal): terms of service, privacy policy, refunds, risk disclaimer, community rules, cookies.
${guides.length ? `\n## Guides\n\n${guides.map((g) => `- [${g.title}](${ORIGIN}/guides/${g.slug}/): ${g.description}`).join("\n")}\n` : ""}${sections.filter((s) => s.items.length).map((s) => `\n## ${s.title}\n\n${s.items.map((p) => `- [${p.title}](${p.url}): ${p.description}`).join("\n")}\n`).join("")}`;
  const head = `# Marble\n\n> Marble is a free trading journal for prop and personal accounts. It records every trade with its result in dollars and how it felt, imports trades from the major platforms, and shows your total P&L in dollars by day, week, month or any range. It's free forever.\n`;
  // What Marble does, group by group (/everything has each feature in full; llms-full.txt carries them all)
  const featureGroups = everything?.GROUPS || [];
  const does = featureGroups.length ? `\n\n## What Marble does\n\nEvery feature, in ${featureGroups.length} groups. In full: ${ORIGIN}/everything\n\n${featureGroups.map((g) => `- ${g.name}: ${g.line} (${g.features.map((f) => f.name).join("; ")})`).join("\n")}` : "";
  const short = `${head}\n${facts}${does}\n\n${links}`;
  const featureText = featureGroups.length ? `\n## Everything in Marble, feature by feature\n\nSource: ${ORIGIN}/everything\n\n${featureGroups.map((g) => `### ${g.name}\n\n${g.line}\n\n${g.features.map((f) => `- ${f.name}: ${everything.plainText(f)}`).join("\n")}`).join("\n\n")}\n` : "";
  const faqText = faq?.length ? `\n## Frequently asked questions\n\n${faq.map(({ q, a }) => `### ${q}\n\n${a}`).join("\n\n")}\n` : "";
  const guideText = guides.length ? `\n## Guides in full\n\n${guides.map((g) => `### ${g.title}\n\nSource: ${ORIGIN}/guides/${g.slug}/\n\n${g.body.trim()}`).join("\n\n")}\n` : "";
  return { short, full: `${short}${featureText}${faqText}${guideText}` };
}
