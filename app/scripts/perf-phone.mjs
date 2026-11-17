import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import puppeteer, { PredefinedNetworkConditions } from "puppeteer-core";

const dir = resolve(process.env.SITE_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "web", "public"));
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/"];
const RUNS = 3;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const TEXT = /^(text\/|application\/(json|manifest)|image\/svg)/;

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = normalize(join(dir, p));
  if (!f.startsWith(dir)) return res.writeHead(403).end();
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  else if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) return res.writeHead(404).end();
  const type = TYPES[extname(f)] || "application/octet-stream";
  let body = readFileSync(f);
  const headers = { "Content-Type": type };
  if (TEXT.test(type) && /\bbr\b/.test(req.headers["accept-encoding"] || "")) {
    body = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
    headers["Content-Encoding"] = "br";
  }
  res.writeHead(200, headers).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new" });

async function once(path) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.emulateNetworkConditions(PredefinedNetworkConditions["Slow 4G"]);
  await page.emulateCPUThrottling(4);
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", { urls: ["*cloudflareinsights.com*"] });
  const kind = new Map();
  const bytes = { total: 0, js: 0, css: 0, image: 0, font: 0, html: 0, other: 0 };
  let requests = 0;
  cdp.on("Network.responseReceived", (e) => kind.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    const k = { Script: "js", Stylesheet: "css", Image: "image", Font: "font", Document: "html" }[kind.get(e.requestId)] || "other";
    bytes[k] += e.encodedDataLength;
    bytes.total += e.encodedDataLength;
    requests++;
  });
  const t0 = Date.now();
  await page.goto(base + path, { waitUntil: "load", timeout: 180000 });
  const load = Date.now() - t0;
  const atLoad = bytes.total;
  await page.waitForNetworkIdle({ idleTime: 2500, timeout: 90000 }).catch(() => {});
  const paint = await page.evaluate(() => new Promise((done) => {
    const out = {};
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    out.fcp = fcp ? Math.round(fcp.startTime) : null;
    new PerformanceObserver((list) => {
      const e = list.getEntries().at(-1);
      const el = e.element;
      out.lcp = Math.round(e.startTime);
      out.what = el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : ""} ${(el.currentSrc || el.textContent || "").trim().slice(0, 40)}` : "";
    }).observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => done(out), 300);
  }));
  await ctx.close();
  return { ...paint, load, atLoad, requests, bytes };
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
for (const path of paths) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await once(path));
  runs.sort((a, b) => a.lcp - b.lcp);
  const m = runs[Math.floor(RUNS / 2)];
  console.log(`\n${path}  (median of ${RUNS}, phone on Slow 4G, CPU 4x)`);
  console.log(`  LCP ${m.lcp} ms  (runs: ${runs.map((r) => r.lcp).join(", ")})   FCP ${m.fcp} ms   load event ${m.load} ms`);
  console.log(`  LCP element: ${m.what}`);
  console.log(`  by the load event: ${kb(m.atLoad)}`);
  console.log(`  first load in all: ${kb(m.bytes.total)} in ${m.requests} requests — JS ${kb(m.bytes.js)}, CSS ${kb(m.bytes.css)}, images ${kb(m.bytes.image)}, fonts ${kb(m.bytes.font)}, HTML ${kb(m.bytes.html)}, other ${kb(m.bytes.other)}`);
}
await browser.close();
server.close();
