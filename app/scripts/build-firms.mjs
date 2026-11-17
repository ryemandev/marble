// Prop firm pages at /prop-firms/<firm>/ and the index at /prop-firms/: the checked rules from src/lib/firm-rules,
// with each firm's own words from content/prop-firms/<firm>.md. No .md (or a date still to come), no page.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ORIGIN, ld, organization } from "./seo/site-data.mjs";
import { CTA, bottom, esc, head, human, makeMarked, readGuides, slugify, top } from "./build-guides.mjs";
import { RULE_FIRMS, firmShort, phaseKeys, phaseLabel, planFor, planIn, programsOf, readFirm, sizeLabel, versionsOf } from "../src/lib/firm-rules/catalog.js";
import { planLine, ruleWords } from "../src/lib/firm-rules/words.js";

const ROWS = [
  ["target", "Profit target"], ["dll", "Daily loss limit"], ["reset", "Day resets"], ["dd", "Maximum drawdown"],
  ["cons", "Consistency"], ["days", "Minimum days"], ["payDays", "Days for a payout"], ["size", "Maximum size"],
  ["news", "News trading"], ["hold", "Holding trades"], ["time", "Time limits"],
];
const GROUPS = { futures: "Futures prop firms", forex: "Forex and CFD prop firms" };
const blank = (v) => v == null || v === "–" || v === "";
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
// A source by its address: ".../daily-loss-limit-explained/" → "Daily loss limit explained · apextraderfunding.com"
const pageName = (url) => {
  const host = hostOf(url);
  let last = "";
  try { last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || ""); } catch { return url; }
  last = last.replace(/\.[a-z]+$/, "").replace(/^\d+-/, "").replace(/[-_]+/g, " ").trim();
  // A firm's own address can hold words Marble doesn't use: those pages go by the firm's site alone
  return last && !/get funded/i.test(last) ? `${last.charAt(0).toUpperCase()}${last.slice(1)} · ${host}` : host;
};
const crumbs = (items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) });

// A firm's programmes, each at its 50K account (or its first size)
function programmes(slug, file) {
  return programsOf(slug).map((p) => {
    const size = p.sizes.includes(50000) ? 50000 : p.sizes[0];
    const plan = planFor(file, p.p, size);
    return plan && { ...p, size, plan, keys: phaseKeys(plan), versions: versionsOf(file, p.p, size).length };
  }).filter(Boolean);
}

function rulesTable(plan, keys) {
  const words = keys.map((k, i) => ruleWords(plan, plan.phases[i]));
  const rows = ROWS.filter(([k]) => words.some((w) => !blank(w[k])));
  return `<table><thead><tr><th>Rule</th>${keys.map((k) => `<th>${esc(phaseLabel(plan, k))}</th>`).join("")}</tr></thead><tbody>
${rows.map(([k, label]) => `<tr><td>${label}</td>${words.map((w) => `<td>${esc(blank(w[k]) ? "–" : cap(w[k]))}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>`;
}

function sizesTable(file, p) {
  if (p.sizes.length < 2) return "";
  const rows = p.sizes.map((size) => {
    const plan = planFor(file, p.p, size);
    const w = plan && ruleWords(plan, plan.phases[0]);
    return w ? `<tr><td>${sizeLabel(size)}</td><td>${esc(w.target)}</td><td>${esc(w.dll)}</td><td>${esc(w.dd)}</td></tr>` : "";
  }).join("");
  return `<h3>Every account size, ${esc(phaseLabel(p.plan, p.keys[0]).toLowerCase())}</h3>
<table><thead><tr><th>Size</th><th>Profit target</th><th>Daily loss limit</th><th>Maximum drawdown</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// One plain sentence per rule for the questions, from the same words the tables use
function say(w, noun, name) {
  if (blank(w)) return null;
  if (w === "None") return `there's no ${noun}`;
  if (w === "Check with the firm") return `${name}'s pages leave the ${noun} unclear, so check with ${name}`;
  if (w === "Not published") return `${name} doesn't publish a ${noun}`;
  return `the ${noun} is ${w.charAt(0).toLowerCase()}${w.slice(1)}`;
}
function questions(f, main) {
  const name = firmShort(f.slug);
  const where = `On ${name}'s ${main.n} ${sizeLabel(main.size)} account`;
  const ph = (i) => main.plan.phases[i] && ruleWords(main.plan, main.plan.phases[i]);
  const first = ph(0), funded = main.keys.length > 1 ? ph(1) : null;
  const label = (i) => phaseLabel(main.plan, main.keys[i]).toLowerCase();
  const both = (k, noun) => {
    const a = say(first[k], noun, name), b = funded && say(funded[k], noun, name);
    if (!a) return null;
    return `${where}, ${a} in the ${label(0)}${b && funded[k] !== first[k] ? `; in the ${label(1)} stage ${b}` : b ? `, and the same in the ${label(1)} stage` : ""}.`;
  };
  return [
    [`What is ${name}'s daily loss limit?`, both("dll", "daily loss limit")],
    [`What kind of drawdown does ${name} use?`, both("dd", "maximum drawdown")],
    [`Does ${name} have a consistency rule?`, both("cons", "consistency rule")],
    [`What is ${name}'s profit target?`, first.target && first.target !== "None" ? `${where}, the profit target in the ${label(0)} is ${first.target}.` : null],
    [`Can you hold trades overnight with ${name}?`, !blank(first.hold) && first.hold !== "Not published" ? `${where}: ${first.hold.charAt(0).toLowerCase()}${first.hold.slice(1)}.` : null],
    [`Can you trade the news with ${name}?`, !blank(first.news) && first.news !== "Not published" ? `${where}, news trading is ${first.news.toLowerCase()} in the ${label(0)}${funded && !blank(funded.news) && funded.news !== first.news ? ` and ${funded.news.toLowerCase()} in the ${label(1)} stage` : ""}.` : null],
  ].filter(([, a]) => a).map(([q, a]) => ({ q, a: `${a} Checked on ${human(f.checked)}; ${name}'s own pages have the final word.` }));
}

function firmPage(f, doc, file, others) {
  const url = `${ORIGIN}/prop-firms/${f.slug}/`;
  const name = firmShort(f.slug);
  const progs = programmes(f.slug, file);
  const main = progs.find((p) => p.plan.id === f.main?.id) || progs[0];
  const legacy = programsOf(f.slug, { legacy: true }).filter((p) => !progs.some((x) => x.p === p.p));
  const site = hostOf(f.src);
  const faq = [...questions(f, main), ...doc.faq];
  const glance = ruleWords(main.plan, main.plan.phases[0]);
  const facts = [["Account", `${main.n} ${sizeLabel(main.size)}`], ...ROWS.filter(([k]) => !blank(glance[k])).map(([k, label]) => [label, cap(glance[k])])];
  const graph = [
    organization(),
    { "@type": "Article", "@id": `${url}#article`, mainEntityOfPage: url, headline: doc.title.slice(0, 110), description: doc.description,
      datePublished: doc.date, dateModified: doc.updated > f.checked ? doc.updated : f.checked, inLanguage: "en-GB", image: `${ORIGIN}/og.jpg?v=4`,
      about: { "@type": "Organization", name: f.name, ...(site ? { url: `https://${site}/` } : {}) },
      author: { "@id": `${ORIGIN}/#organization` }, publisher: { "@id": `${ORIGIN}/#organization` } },
    crumbs([["Marble", `${ORIGIN}/`], ["Prop firms", `${ORIGIN}/prop-firms/`], [f.name, url]]),
    ...(faq.length ? [{ "@type": "FAQPage", "@id": `${url}#faq`, url, mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }] : []),
  ];
  const title = `${doc.title} — Marble`.length <= 60 ? `${doc.title} — Marble` : doc.title;
  const cta = CTA.replace(/<p class="g-cta-title">[\s\S]*?<\/p>\s*<p>[\s\S]*?<\/p>/, `<p class="g-cta-title">Trading with ${esc(name)}? <span class="silver">Know your room.</span></p>
  <p>Pick your ${esc(name)} plan when you add the account, and the Desk shows your room to the drawdown, worked out from your closed trades. Marble is free forever.</p>`);
  const sources = file.urls.map((u) => ({ url: u, label: pageName(u) }));
  return `${head({ title, description: doc.description, url, jsonLd: ld({ "@context": "https://schema.org", "@graph": graph }) })}
<body>
${top}
<main class="g-main">
  <nav class="g-crumbs" aria-label="Breadcrumb"><a href="/">Marble</a><span aria-hidden="true">/</span><a href="/prop-firms/">Prop firms</a></nav>
  <article class="g-article">
    <header class="g-head">
      <p class="g-kicker">Prop firm rules</p>
      <h1>${esc(f.name)} rules</h1>
      <p class="g-lede">${esc(doc.description)}</p>
      <p class="g-meta">Checked on <time datetime="${f.checked}">${human(f.checked)}</time> against ${file.urls.length} of ${esc(site || name)}'s pages · Marble isn't connected to ${esc(f.name)}</p>
    </header>
    <section aria-labelledby="glance"><h2 class="g-kicker" id="glance">At a glance · ${esc(main.n)} ${sizeLabel(main.size)}, ${esc(phaseLabel(main.plan, main.keys[0]).toLowerCase())}</h2>
      <dl class="g-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    </section>
    <div class="g-body g-intro">
${makeMarked().parse(doc.body)}
    </div>
${progs.map((p) => `    <section class="g-section" id="${slugify(p.n)}">
      <h2>${esc(p.n)}</h2>
      <p>${p.sizes.length > 1 ? `Sizes ${p.sizes.map(sizeLabel).join(", ")}. The table shows the ${sizeLabel(p.size)} account.` : `One size, ${sizeLabel(p.size)}.`} ${esc(planLine(p.plan, p.plan.phases[0]))}.${p.versions > 1 ? " The rules changed for accounts bought from a later date; these are the ones sold now." : ""}</p>
      <div class="g-body">
${rulesTable(p.plan, p.keys)}
${sizesTable(file, p)}
      </div>
    </section>`).join("\n")}
${legacy.length ? `    <section class="g-section"><h2>No longer sold</h2><p>${esc(legacy.map((p) => p.n).join(", "))}. Accounts already running keep their own rules.</p></section>` : ""}
    <section class="g-section g-sources"><h2>Where these rules come from</h2>
      <p>Every figure above is from ${esc(f.name)}'s own pages, read on ${human(f.checked)}. Where a page leaves a rule open, or two pages disagree, the table says so instead of guessing. Firms change their rules, so the firm's pages have the final word.</p>
      <details><summary>The ${sources.length} pages checked</summary><ul>${sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.label)}</a></li>`).join("")}</ul></details>
    </section>
    ${faq.length ? `<section class="g-faq" id="faq" aria-labelledby="faq-title"><h2 id="faq-title">Questions</h2>
  ${faq.map(({ q, a }) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n  ")}
</section>` : ""}
  </article>
  ${cta}
  <nav class="g-related" aria-label="Other prop firms"><h2>Other prop firms</h2>
  <ul>${others.map((o) => `<li><a href="/prop-firms/${o.f.slug}/"><strong>${esc(o.f.name)} rules</strong><span>${esc(o.line)}</span></a></li>`).join("")}<li><a href="/prop-firm-rules"><strong>Compare firms side by side</strong><span>Pick up to three firms and sizes and see their rules next to each other.</span></a></li></ul>
  </nav>
  <p class="g-back"><a href="/prop-firms/">← Every prop firm</a></p>
</main>
${bottom}
</body>
</html>
`;
}

function indexPage(items) {
  const url = `${ORIGIN}/prop-firms/`;
  const graph = [
    organization(),
    { "@type": "CollectionPage", "@id": url, url, name: "Prop firm rules — Marble", inLanguage: "en-GB", isPartOf: { "@id": `${ORIGIN}/#website` },
      mainEntity: { "@type": "ItemList", itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${url}${x.f.slug}/`, name: `${x.f.name} rules` })) } },
    crumbs([["Marble", `${ORIGIN}/`], ["Prop firms", url]]),
  ];
  const groups = Object.entries(GROUPS).map(([g, label]) => [label, items.filter((x) => x.f.group === g)]).filter(([, xs]) => xs.length);
  return `${head({ title: "Prop Firm Rules for 22 Firms, Checked — Marble", description: "Daily loss limits, drawdowns, profit targets, consistency rules and payouts for every major futures and forex prop firm, each from the firm's own pages.", url, type: "website", jsonLd: ld({ "@context": "https://schema.org", "@graph": graph }) })}
<body>
${top}
<main class="g-main">
  <nav class="g-crumbs" aria-label="Breadcrumb"><a href="/">Marble</a></nav>
  <header class="g-head">
    <p class="g-kicker">Prop firms</p>
    <h1>Prop firm rules, <span class="silver">firm by firm.</span></h1>
    <p class="g-lede">Daily loss limits, drawdowns, profit targets and consistency rules for ${items.length} prop firms, each read from the firm's own pages with the day it was checked.</p>
  </header>
${groups.map(([label, xs]) => `  <section class="g-section"><h2>${label}</h2>
  <ul class="g-list">${xs.map((x) => `<li><a href="/prop-firms/${x.f.slug}/"><span class="g-date">Checked ${human(x.f.checked)}</span><strong>${esc(x.f.name)} rules</strong><span>${esc(x.line)}</span></a></li>`).join("")}</ul>
  </section>`).join("\n")}
  <p class="g-back"><a href="/prop-firm-rules">Compare firms side by side →</a></p>
  ${CTA}
</main>
${bottom}
</body>
</html>
`;
}

export function buildFirms(root, outDir, dir = join(root, "content", "prop-firms")) {
  const docs = new Map(readGuides(dir).map((d) => [d.fm.firm || d.slug, d]));
  const items = RULE_FIRMS.filter((f) => docs.has(f.slug)).map((f) => {
    const file = readFirm(JSON.parse(readFileSync(join(root, "src/lib/firm-rules/firms", `${f.slug}.json`), "utf8")));
    const main = planIn(file, f.main?.id);
    return { f, file, doc: docs.get(f.slug), line: main ? planLine(main, main.phases[0]) : "" };
  });
  if (!items.length) return [];
  mkdirSync(join(outDir, "prop-firms"), { recursive: true });
  writeFileSync(join(outDir, "prop-firms", "index.html"), indexPage(items));
  for (const x of items) {
    const same = items.filter((o) => o.f.group === x.f.group), at = same.indexOf(x);
    const others = [...same.slice(at + 1), ...same.slice(0, at)].slice(0, 4);
    mkdirSync(join(outDir, "prop-firms", x.f.slug), { recursive: true });
    writeFileSync(join(outDir, "prop-firms", x.f.slug, "index.html"), firmPage(x.f, x.doc, x.file, others));
  }
  console.log(`prop firms: ${items.length} built into /prop-firms/`);
  return items.map((x) => ({ slug: x.f.slug, url: `${ORIGIN}/prop-firms/${x.f.slug}/`, title: `${x.f.name} rules`, description: x.doc.description, updated: x.doc.updated > x.f.checked ? x.doc.updated : x.f.checked, body: x.doc.body }));
}
