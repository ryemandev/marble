import { FEEDS, parseMediastack, parseRss } from "../_shared/news.js";

const BASE = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MEDIASTACK = (Deno.env.get("MEDIASTACK_KEY") || "").trim();
const CONTACT = (Deno.env.get("DATA_CONTACT_EMAIL") || "").trim();
const db = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

async function allowed(req: Request) {
  const r = await fetch(`${BASE}/rest/v1/rpc/news_sync_cron_ok`, { method: "POST", headers: db, body: JSON.stringify({ p_secret: req.headers.get("x-marble-cron") || "" }) });
  return r.ok && (await r.json()) === true;
}
const busy = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return !["Sat", "Sun"].includes(p.weekday) && +p.hour >= 6 && +p.hour <= 18 ? true : +p.minute < 10;
};

Deno.serve(async (req) => {
  if (req.method !== "POST" || !(await allowed(req))) return json({ error: "Not allowed" }, 401);
  const ua = `Marble news wire (${CONTACT || "https://trademarble.app"})`;
  const report: Record<string, string | number> = {};
  // deno-lint-ignore no-explicit-any
  const items: any[] = [];
  const jobs = FEEDS.map(async ([source, url]: [string, string]) => {
    if (source === "BLS" && !CONTACT) { report[url] = "skipped: set DATA_CONTACT_EMAIL"; return; }
    try {
      const r = await fetch(url, { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) { await r.body?.cancel(); report[url] = `HTTP ${r.status}`; return; }
      const got = parseRss(await r.text(), source).slice(0, 25);
      items.push(...got);
      report[url] = got.length;
    } catch (e) { report[url] = `failed: ${(e as Error).message}`; }
  });
  if (!MEDIASTACK) report.mediastack = "skipped: set MEDIASTACK_KEY";
  else if (!busy()) report.mediastack = "skipped: quiet hours";
  else jobs.push((async () => {
    try {
      const q = new URLSearchParams({ access_key: MEDIASTACK, categories: "business", languages: "en", sort: "published_desc", limit: "50" });
      const r = await fetch(`https://api.mediastack.com/v1/news?${q}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) { await r.body?.cancel(); report.mediastack = `HTTP ${r.status}`; return; }
      const got = parseMediastack(await r.json());
      items.push(...got);
      report.mediastack = got.length;
    } catch (e) { report.mediastack = `failed: ${(e as Error).message.replace(MEDIASTACK, "…")}`; }
  })());
  await Promise.all(jobs);
  const unique = [...new Map(items.map((i) => [i.id, i])).values()];
  if (unique.length) {
    const r = await fetch(`${BASE}/rest/v1/news_items?on_conflict=id`, { method: "POST", headers: { ...db, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(unique) });
    if (!r.ok) { console.error("news-wire save", await r.text()); return json({ ok: false, error: "save failed", sources: report }, 500); }
  }
  const old = await fetch(`${BASE}/rest/v1/news_items?published_at=lt.${new Date(Date.now() - 14 * 864e5).toISOString()}`, { method: "DELETE", headers: db });
  await old.body?.cancel();
  console.log("news-wire", JSON.stringify({ saved: unique.length, sources: report }));
  return json({ ok: true, saved: unique.length, sources: report });
});
