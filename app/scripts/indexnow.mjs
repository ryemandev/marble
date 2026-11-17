import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "trademarble.app";
const here = dirname(fileURLToPath(import.meta.url));
const { key } = JSON.parse(readFileSync(join(here, "seo", "indexnow.json"), "utf8"));

try {
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`, { headers: { "Cache-Control": "no-cache" } })).text();
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith(`https://${HOST}/`));
  if (!urlList.length) throw new Error("no URLs found in the live sitemap");
  const k = await fetch(`https://${HOST}/${key}.txt`);
  if (!k.ok || (await k.text()).trim() !== key) throw new Error(`key file https://${HOST}/${key}.txt isn't live yet`);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList }),
  });
  console.log(`IndexNow: ${res.status} ${res.statusText} — ${urlList.length} URLs submitted`);
} catch (e) {
  console.warn(`IndexNow: skipped (${e.message})`);
}
