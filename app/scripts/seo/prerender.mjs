// Prerendering for search engines and AI crawlers. Most AI crawlers (GPTBot, ClaudeBot, PerplexityBot, CCBot…) read
// the raw HTML and run no JavaScript, so a React page arrives to them as an empty <div id="root">. After the build,
// this opens each page in headless Chrome, lets it settle (reduced motion, scrolled through so every section has
// drawn), and writes the page's own markup into the HTML file, so the words a visitor reads are in the file itself.
//
// Nothing changes for visitors: the copy sits in #root inside a [data-prerender] wrapper that a two-line script
// hides the moment the page starts (html.js), and React replaces it when the site mounts, exactly as before. With
// JavaScript off, the copy shows. If the site somehow fails to mount within a few seconds, the copy is shown rather
// than a blank page. It's the same content visitors see, never different text for robots.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".webmanifest": "application/manifest+json" };

// Serves the built site the way Cloudflare does: /legal → legal.html, folders → index.html
function serve(dir) {
  return createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = normalize(join(dir, p));
    if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    else if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
    if (!existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(f)] || "application/octet-stream" }).end(readFileSync(f));
  });
}

// The two lines that hide the copy for visitors whose browser runs the site (and the failsafe). Hidden as display:none,
// so its pictures are never fetched: on a phone they'd compete with the hero for the first seconds of mobile data.
export const BOOT_SCRIPT = 'document.documentElement.classList.add("js");setTimeout(function(){if(document.querySelector("[data-prerender]"))document.documentElement.classList.remove("js")},6000)';
const BOOT_STYLE = ".js [data-prerender]{display:none}";

// What the copy keeps: text, links, headings, images (all lazy, so the hidden copy fetches nothing). What it
// drops: frames (the live demo), canvases, video, scripts, and anything only meant for screen readers' live regions.
async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.getElementById("root").cloneNode(true);
    root.querySelectorAll("iframe, canvas, video, audio, script, noscript, template, [aria-live]").forEach((n) => n.remove());
    root.querySelectorAll("img").forEach((img) => {
      if ((img.getAttribute("src") || "").startsWith("data:")) { img.remove(); return; }
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      img.removeAttribute("fetchpriority");
    });
    root.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
    // The menu's rolling words are every letter twice (an animation), with the real word beside them for screen
    // readers; in the copy they become the plain word once, so a crawler reads "Pricing", not "PPrriicciinngg"
    root.querySelectorAll(".roll").forEach((roll) => {
      const word = [...roll.querySelectorAll(".roll-col")].map((c) => c.firstElementChild?.textContent || "").join("");
      const twin = roll.nextElementSibling;
      if (twin && twin.classList.contains("sr-only") && twin.textContent.trim() === word.trim()) twin.remove();
      const plain = document.createElement("span");
      plain.textContent = word;
      roll.replaceWith(plain);
    });
    // Rolling numbers are a column of 0–9 per digit (an animation) beside the real value; keep just the value
    root.querySelectorAll(".odo").forEach((odo) => {
      const value = odo.querySelector(".sr-only")?.textContent ?? "";
      const plain = document.createElement("span");
      plain.className = odo.className;
      plain.textContent = value;
      odo.replaceWith(plain);
    });
    return root.innerHTML;
  });
}

export async function prerender(outDir, pages, { chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" } = {}) {
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; } catch { console.warn("prerender: puppeteer-core not installed — skipped"); return {}; }
  if (!existsSync(chrome)) { console.warn(`prerender: Chrome not found at ${chrome} — skipped (set CHROME_PATH)`); return {}; }
  const server = serve(outDir);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: "new" });
  const found = {};
  try {
    for (const { path, file } of pages) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      // The live demo is a whole app in a frame; the copy drops it anyway, so don't load it
      await page.setRequestInterception(true);
      page.on("request", (r) => (/^\/demo(\.html)?$/.test(new URL(r.url()).pathname) ? r.abort() : r.continue()));
      await page.goto(base + path, { waitUntil: "networkidle0", timeout: 120000 });
      // Scroll through so every section that waits to be seen has drawn
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
        scrollTo(0, 0);
      });
      await new Promise((r) => setTimeout(r, 1200));
      // Some pieces build addresses from the page's own location (e.g. SVG references); make them site-relative
      const html = (await snapshot(page)).split(base).join("");
      if (/127\.0\.0\.1|localhost/.test(html)) throw new Error(`prerender: a local address is left in ${file}`);
      // What the build also wants from the rendered page: the FAQ as it reads on screen
      found[path] = await page.evaluate(() => ({
        faq: [...document.querySelectorAll(".qi-row")].map((row) => ({
          q: row.querySelector(".qi-qt")?.textContent.trim() || "",
          a: [...row.querySelectorAll(".qi-inner p")].map((p) => p.textContent.trim()).join(" "),
        })).filter((x) => x.q && x.a),
      }));
      await page.close();
      const target = join(outDir, file);
      let doc = readFileSync(target, "utf8");
      if (!doc.includes('<div id="root"></div>')) throw new Error(`prerender: no empty #root in ${file}`);
      doc = doc.replace('<div id="root"></div>', `<div id="root"><div data-prerender>${html}</div></div>`);
      // The boot lines go first in <head>, before any stylesheet, so the hidden copy never paints
      doc = doc.replace(/<head>/i, `<head>\n    <script>${BOOT_SCRIPT}</script>\n    <style>${BOOT_STYLE}</style>`);
      writeFileSync(target, doc);
      console.log(`prerender: ${file} ← ${path} (${Math.round(html.length / 1024)} KB of markup)`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  return found;
}
