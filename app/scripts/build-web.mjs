// Builds trademarble.app for Cloudflare: the website at /, its sections as pages of their own (/features,
// /journal, /pricing, /faq), the app at /desk/, the owner's admin area at /admin/, the legal pages at /legal.html, the app as the website
// shows it running at /demo.html, and guides at /guides/.
// Run with `npm run build:web`; deploy with `npm run deploy` (Cloudflare Workers, static assets).
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFirms } from "./build-firms.mjs";
import { buildGuides } from "./build-guides.mjs";
import { prerender } from "./seo/prerender.mjs";
import { ORIGIN, checkJsonLd, homeJsonLd, importBundled, lastChanged, legalJsonLd, llmsTxt, loadSiteData, pageHead, pageJsonLd, sitemap } from "./seo/site-data.mjs";
import { VOICE_LIVE } from "../src/mode.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "web", "public");

rmSync(out, { recursive: true, force: true });
// Absolute paths (base "/"), so every page finds the same /assets and /art wherever it sits
execSync(`npx vite build --base=/ --outDir "${out}" --emptyOutDir`, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_APP_URL: "/desk/" },
});

// The website is the home page; the app moves to /desk/
renameSync(join(out, "site.html"), join(out, "index-site.html"));
mkdirSync(join(out, "desk"), { recursive: true });
renameSync(join(out, "index.html"), join(out, "desk", "index.html"));
renameSync(join(out, "index-site.html"), join(out, "index.html"));
// The admin area has its own folder too
mkdirSync(join(out, "admin"), { recursive: true });
renameSync(join(out, "admin.html"), join(out, "admin", "index.html"));
// The flat copies the preview link needs aren't part of the live site
for (const f of ["devices.html"]) if (existsSync(join(out, f))) rmSync(join(out, f));
// The section pages move up beside legal.html, so Cloudflare serves pages/pricing.html as /pricing
const { PAGES } = await importBundled(join(root, "src/seo/pages.js"));
for (const page of PAGES) renameSync(join(out, "pages", `${page.slug}.html`), join(out, `${page.slug}.html`));
rmSync(join(out, "pages"), { recursive: true, force: true });

// ---------- Search engines and AI crawlers (scripts/seo/) ----------
// Guides: static article pages at /guides/<slug>/ from content/guides/*.md
const guides = buildGuides(root, out);
const firmPages = buildFirms(root, out);
// Each section page's title, description, canonical address and share tags (long ones get cut off in results)
for (const page of PAGES) {
  if (page.title.length > 60 || page.description.length > 160) throw new Error(`pages.js: /${page.slug} needs a title of 60 characters or fewer and a description of 160 or fewer`);
  const file = join(out, `${page.slug}.html`);
  writeFileSync(file, readFileSync(file, "utf8").replace(/(<meta name="color-scheme"[^>]*>)/i, `$1\n    ${pageHead(page)}`));
}
// The home, legal and section pages get their real copy written into the HTML (most AI crawlers run no JavaScript)
const rendered = await prerender(out, [
  { path: "/", file: "index.html" },
  { path: "/legal", file: "legal.html" },
  ...PAGES.map((page) => ({ path: `/${page.slug}`, file: `${page.slug}.html` })),
]);
const faq = rendered["/faq"]?.faq || [];
const siteData = await loadSiteData(root);
// Structured data, plus Search Console / Bing verification tags when their tokens are set (env or .env)
const envFile = existsSync(join(root, ".env")) ? Object.fromEntries(readFileSync(join(root, ".env"), "utf8").split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2).map((x) => x.trim()))) : {};
const envOf = (k) => process.env[k] || envFile[k] || "";
const verify = [
  envOf("VITE_GSC_VERIFY") && `<meta name="google-site-verification" content="${envOf("VITE_GSC_VERIFY").replace(/"/g, "")}" />`,
  envOf("VITE_BING_VERIFY") && `<meta name="msvalidate.01" content="${envOf("VITE_BING_VERIFY").replace(/"/g, "")}" />`,
].filter(Boolean).join("\n    ");
const addToHead = (file, html) => {
  const p = join(out, file);
  writeFileSync(p, readFileSync(p, "utf8").replace(/<\/head>/i, `    ${html}\n  </head>`));
};
addToHead("index.html", `${homeJsonLd(siteData)}${verify ? `\n    ${verify}` : ""}`);
addToHead("legal.html", legalJsonLd());
for (const page of PAGES) addToHead(`${page.slug}.html`, pageJsonLd(siteData, page, faq));
for (const f of ["index.html", "legal.html", ...PAGES.map((page) => `${page.slug}.html`), "guides/index.html", ...guides.map((g) => `guides/${g.slug}/index.html`), "prop-firms/index.html", ...firmPages.map((p) => `prop-firms/${p.slug}/index.html`)]) {
  const problems = checkJsonLd(readFileSync(join(out, f), "utf8"));
  if (problems.length) throw new Error(`structured data in ${f}: ${problems.join("; ")}`);
}
// sitemap.xml, dated by when each page's source last changed
const newestGuide = guides.reduce((d, g) => (g.updated > d ? g.updated : d), "");
writeFileSync(join(out, "sitemap.xml"), sitemap([
  { loc: `${ORIGIN}/`, lastmod: lastChanged(root, ["site.html", "src/site"]) },
  // A section page changes when its section's folder (src/site/<id>) or its own words do; a tool page, when the tools
  // or the firm rules data do (paths)
  ...PAGES.map((page) => ({ loc: `${ORIGIN}/${page.slug}`, lastmod: lastChanged(root, [`pages/${page.slug}.html`, "src/seo", ...page.sections.map((id) => `src/site/${id}`), ...(page.paths || [])]) })),
  { loc: `${ORIGIN}/legal`, lastmod: lastChanged(root, ["legal.html", "src/site/legal"]) },
  { loc: `${ORIGIN}/guides/`, lastmod: newestGuide || lastChanged(root, ["scripts/build-guides.mjs"]) },
  ...guides.map((g) => ({ loc: `${ORIGIN}/guides/${g.slug}/`, lastmod: g.updated })),
  ...(firmPages.length ? [{ loc: `${ORIGIN}/prop-firms/`, lastmod: firmPages.reduce((d, p) => (p.updated > d ? p.updated : d), "") }] : []),
  ...firmPages.map((p) => ({ loc: p.url, lastmod: p.updated })),
]));
// llms.txt and llms-full.txt for AI assistants and agents
const llms = llmsTxt(siteData, faq, guides, PAGES, [{ title: "Prop firm rules", items: firmPages }]);
writeFileSync(join(out, "llms.txt"), llms.short);
writeFileSync(join(out, "llms-full.txt"), llms.full);
console.log(`seo: ${faq.length} FAQ answers in structured data, sitemap with ${3 + PAGES.length + guides.length + (firmPages.length ? 1 + firmPages.length : 0)} pages, llms.txt written`);

// Tidy addresses (Cloudflare already serves /legal.html as /legal, so point there), then the pages that have gone: they
// go home. /c/ is the public card page, served by web/worker.js.
writeFileSync(join(out, "_redirects"), [
  "/desk /desk/ 301",
  "/admin /admin/ 301",
  "/site.html / 301",
  "/site / 301",
  "/terms /legal#terms 301",
  "/privacy /legal#privacy 301",
  "/refunds /legal#refunds 301",
  "/earn / 301",
  "/earn.html / 301",
  "/partners / 301",
  "/partners.html / 301",
  "/careers / 301",
  "/careers.html / 301",
  "/r/* / 301",
  "",
].join("\n"));

const htmlFiles = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? htmlFiles(p) : n.endsWith(".html") ? [p] : [];
});
// Cookie-free visit counts: Cloudflare Web Analytics' beacon on every page of the website and in the app, when its
// token is set (VITE_CF_BEACON_TOKEN in .env or the environment). Empty: no script at all. The demo the website shows
// in a frame isn't counted (it would count every home page visit twice), and nor is the unsubscribe page: its address
// carries a signed link, which has no business in analytics. The admin area isn't counted either.
const CF_BEACON = envOf("VITE_CF_BEACON_TOKEN").trim();
if (CF_BEACON) {
  if (!/^[0-9a-f]{32}$/i.test(CF_BEACON)) throw new Error("VITE_CF_BEACON_TOKEN should be the 32-character token from Cloudflare Web Analytics");
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${CF_BEACON}"}'></script>`;
  const pages = htmlFiles(out).filter((f) => !/[\\/](demo|unsubscribe)\.html$/.test(f) && !/[\\/]admin[\\/]/.test(f));
  for (const f of pages) writeFileSync(f, readFileSync(f, "utf8").replace(/<\/body>/i, `  ${beacon}\n  </body>`));
  console.log(`analytics: Cloudflare Web Analytics beacon on ${pages.length} pages`);
}
const inlineHashes = [...new Set(htmlFiles(out).flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/<script(?![^>]*\b(?:src=|type=["']?application\/ld\+json))[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]).filter((code) => code.trim())
    .map((code) => `'sha256-${createHash("sha256").update(code, "utf8").digest("base64")}'`)))];
// ---------- Security headers ----------
// Everything from here to "End of the security headers" only works text, and touches no files, so tests/headers.test.js
// runs exactly these lines. It takes inlineHashes, PAGES and VOICE_LIVE, and makes headersFile, the text of _headers.

// The Content-Security-Policy: what pages may load and run. Inline <script>s are allowed by their exact SHA-256,
// worked out here from the built HTML, so editing one never silently breaks the policy. Structured-data blocks
// (application/ld+json) never run, so they need no hash, and leaving them out keeps the header under Cloudflare's
// 2,000-character line limit now that every guide carries its own. It's enforced since 2 November 2026, after it ran
// Report-Only from 30 October with nothing of Marble's own reported (only browser extensions) and the live pages loaded
// clean with it enforced; CSP_ENFORCE=0 builds it Report-Only again (the browser reports what it would block, blocks
// nothing). Every violation is reported to the csp-report edge function (report-uri for older browsers; report-to,
// through Reporting-Endpoints and Report-To, for the rest), which keeps a trimmed copy for 30 days.
const SUPABASE = "https://your-project-ref.supabase.co";
const CSP_REPORTS = `${SUPABASE}/functions/v1/csp-report`;
// Cloudflare Turnstile, the bot check on sign-in (src/lib/turnstile.js): its script and frame
const TURNSTILE = "https://challenges.cloudflare.com";
// LiveKit Cloud, for voice sessions: its API and signalling (https and wss). Only in the policy while VOICE_LIVE is on
// (src/mode.js), so with voice off a future injection has no open exit. That one switch brings it and the microphone back.
const LIVEKIT = "https://*.livekit.cloud wss://*.livekit.cloud";
// The microphone: while VOICE_LIVE is on, the app may ask for it (voice sessions, only when a trader turns their mic
// on). The website never. Set per page, not on /*, so the app's rule can differ.
const NO_MIC = "  Permissions-Policy: camera=(), microphone=(), geolocation=()";
const APP_MIC = "  Permissions-Policy: camera=(), microphone=(self), geolocation=()";
const CONNECT = `'self' ${SUPABASE} wss://your-project-ref.supabase.co https://accounts.google.com/gsi/ https://fonts.googleapis.com https://fonts.gstatic.com https://cloudflareinsights.com`;
const policy = (framedBy) => [
  "default-src 'self'",
  // Study's lesson video talks to YouTube's IFrame API (the player itself runs in a youtube-nocookie frame)
  `script-src 'self' https://accounts.google.com/gsi/client https://static.cloudflareinsights.com https://www.youtube.com/iframe_api https://www.youtube.com/s/player/ ${TURNSTILE} ${inlineHashes.join(" ")}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${SUPABASE} https://*.googleusercontent.com https://cdn.discordapp.com https://i.ytimg.com`,
  // The share card's image export fetches the font stylesheet and font files to embed them. Voice sessions talk to
  // LiveKit Cloud (src/views/community/voice/engine.js), which hands out regional hostnames under livekit.cloud; the
  // audio itself (WebRTC) isn't covered by CSP. Its SDK is bundled, so no script comes from LiveKit.
  VOICE_LIVE ? `connect-src ${CONNECT} ${LIVEKIT}` : `connect-src ${CONNECT}`,
  `frame-src 'self' https://accounts.google.com/gsi/ https://www.youtube-nocookie.com ${TURNSTILE}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${framedBy}`,
  // Only when the policy is enforced: browsers ignore it in a Report-Only policy and say so in the console on every
  // page. Local testing runs on plain http, where it would push the site's own demo frame to an https address that
  // isn't served; CSP_LOCAL=1 leaves it out there. Live, everything is already https.
  ...(process.env.CSP_LOCAL === "1" || process.env.CSP_ENFORCE === "0" ? [] : ["upgrade-insecure-requests"]),
  `report-uri ${CSP_REPORTS}`,
  "report-to csp",
].join("; ");
const CSP_HEADER = process.env.CSP_ENFORCE === "0" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
// The website frames only its own demo (src/site/live/Shoulder.jsx points at /demo.html), so /* allows the site itself.
// Nothing frames the app or the admin area: those two take the rule off and put it back with 'none'. Cloudflare applies
// the rules in order and, inside a rule, removes before it adds, so this leaves one policy. CSP beats X-Frame-Options in
// modern browsers, which is why DENY alone doesn't settle it.
const NEVER_FRAMED = [`  ! ${CSP_HEADER}`, `  ${CSP_HEADER}: ${policy("'none'")}`];

// Long caching for hashed files; security headers everywhere
const headersFile = [
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  // Pictures keep their names when they change, so they're cached for a week and refreshed quietly after that
  "/site/*",
  "  Cache-Control: public, max-age=604800, stale-while-revalidate=86400",
  "/art/*",
  "  Cache-Control: public, max-age=604800, stale-while-revalidate=86400",
  "/og.jpg",
  "  Cache-Control: public, max-age=604800, stale-while-revalidate=86400",
  // The favicon PNGs (favicon-48/96/192.png) are covered by /*.png; a second rule would repeat the header
  "/*.png",
  "  Cache-Control: public, max-age=604800, stale-while-revalidate=86400",
  "/favicon.svg",
  "  Cache-Control: public, max-age=604800, stale-while-revalidate=86400",
  "/favicon.ico",
  "  Cache-Control: public, max-age=604800, stale-while-revalidate=86400",
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  // Browsers only ever use https here after the first visit
  "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
  // Google's sign-in popup still works; other sites' windows can't reach into ours
  "  Cross-Origin-Opener-Policy: same-origin-allow-popups",
  `  ${CSP_HEADER}: ${policy("'self'")}`,
  // Where "report-to csp" sends: the Reporting API's header, and the older Report-To for browsers from before it
  `  Reporting-Endpoints: csp="${CSP_REPORTS}"`,
  `  Report-To: {"group":"csp","max_age":10886400,"endpoints":[{"url":"${CSP_REPORTS}"}]}`,
  // The app can't be framed at all; the website, legal pages and the demo only by the site itself (it shows the demo)
  "/desk/*",
  "  X-Frame-Options: DENY",
  // The app and the demo the website shows in a frame are never pages of their own in search results
  "  X-Robots-Tag: noindex, nofollow",
  ...NEVER_FRAMED,
  !VOICE_LIVE ? NO_MIC : APP_MIC,
  "/guides/*",
  "  X-Frame-Options: SAMEORIGIN",
  NO_MIC,
  "/prop-firms/*",
  "  X-Frame-Options: SAMEORIGIN",
  NO_MIC,
  // The admin area: never framed, never indexed (and not named in robots.txt, which anyone can read), no microphone
  "/admin/*",
  "  X-Frame-Options: DENY",
  "  X-Robots-Tag: noindex, nofollow",
  ...NEVER_FRAMED,
  NO_MIC,
  ...["/", "/index.html", "/legal", "/legal.html", ...PAGES.flatMap((page) => [`/${page.slug}`, `/${page.slug}.html`]), "/demo", "/demo.html", "/404.html", "/unsubscribe", "/unsubscribe.html"].flatMap((p) => [p, "  X-Frame-Options: SAMEORIGIN", NO_MIC, ...(p.startsWith("/demo") ? ["  X-Robots-Tag: noindex, nofollow"] : [])]),
  "",
].join("\n");
// ---------- End of the security headers ----------
writeFileSync(join(out, "_headers"), headersFile);
// Cloudflare refuses a deploy whose _headers has a line over 2,000 characters, so catch it here instead
const longLine = readFileSync(join(out, "_headers"), "utf8").split("\n").findIndex((l) => l.length > 2000);
if (longLine >= 0) throw new Error(`_headers line ${longLine + 1} is over Cloudflare's 2,000-character limit`);

console.log(`\nBuilt trademarble.app into ${out}`);
