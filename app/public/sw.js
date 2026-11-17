const PAGE = "marble-page";
const FILES = "marble-files";
const MEDIA = "marble-media";
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = [PAGE, FILES, MEDIA];
    for (const name of await caches.keys()) if (!keep.includes(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

const put = async (cache, req, res) => { if (res.ok && res.type !== "opaque") await (await caches.open(cache)).put(req, res); };

// The kept page is as locked down as the one from the network: its own security headers go with it. They stay a match
// for its inline scripts too, because the page and its policy are always stored together.
const LOCKS = ["Content-Security-Policy", "Content-Security-Policy-Report-Only", "Cross-Origin-Opener-Policy", "Permissions-Policy", "Referrer-Policy", "Report-To", "Reporting-Endpoints", "X-Content-Type-Options", "X-Frame-Options", "X-Robots-Tag"];
function pageCopy(html, res) {
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  for (const name of LOCKS) if (res.headers.has(name)) headers.set(name, res.headers.get(name));
  return new Response(html, { headers });
}

async function page(req, e) {
  const net = fetch(req).then(async (res) => {
    if (res.ok && new URL(res.url).pathname.startsWith("/desk")) {
      const html = await res.clone().text();
      await (await caches.open(PAGE)).put("/desk/", pageCopy(html, res));
      await tidy(html);
    }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  const kept = () => caches.open(PAGE).then((c) => c.match("/desk/"));
  try {
    const first = await Promise.race([net, new Promise((done) => setTimeout(done, 4000, "slow"))]);
    if (first !== "slow") return first;
    return (await kept()) || net;
  } catch (err) {
    const copy = await kept();
    if (copy) return copy;
    throw err;
  }
}
async function tidy(html) {
  const now = new Set([...html.matchAll(/\/assets\/[\w.-]+/g)].map((m) => m[0]));
  const cache = await caches.open(FILES);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (now.has(path)) continue;
    const res = await cache.match(req);
    const at = Date.parse(res?.headers.get("x-kept-at") || "") || 0;
    if (Date.now() - at > 864e5) await cache.delete(req);
  }
}

async function file(req) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const headers = new Headers(res.headers);
    headers.set("x-kept-at", new Date().toISOString());
    await cache.put(req, new Response(await res.clone().blob(), { status: res.status, headers }));
  }
  return res;
}

async function fresh(cacheName, req, e) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const update = fetch(req).then(async (res) => { await put(cacheName, req, res.clone()); return res; });
  if (hit) { e.waitUntil(update.catch(() => {})); return hit; }
  return update;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") { if (url.pathname.startsWith("/desk")) e.respondWith(page(req, e)); return; }
    if (url.pathname.startsWith("/assets/")) e.respondWith(file(req));
    else if (/^\/(art\/|site\/|[\w-]+\.(png|svg|ico)$)/.test(url.pathname)) e.respondWith(fresh(MEDIA, req, e));
    return;
  }
  if (FONTS.test(req.url)) e.respondWith(fresh(MEDIA, req, e));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  e.waitUntil(self.registration.showNotification(d.title || "Marble", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: "/icon-192.png?v=4",
    badge: "/badge-96.png?v=4",
    data: { url: d.url || "/desk/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/desk/", self.location.origin);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/desk")) url.href = new URL("/desk/", self.location.origin).href;
  e.waitUntil((async () => {
    const open = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).find((c) => new URL(c.url).pathname.startsWith("/desk"));
    if (!open) return self.clients.openWindow(url.href);
    if (open.url !== url.href) open.postMessage({ marble: "open", hash: url.hash });
    return open.focus();
  })());
});
