import { dedupe, parseBoe, parseEcb, parseFomc, parseIcs, parseOns } from "../_shared/news.js";

const BASE = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONTACT = (Deno.env.get("DATA_CONTACT_EMAIL") || "").trim();
const db = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

async function allowed(req: Request) {
  const r = await fetch(`${BASE}/rest/v1/rpc/news_sync_cron_ok`, { method: "POST", headers: db, body: JSON.stringify({ p_secret: req.headers.get("x-marble-cron") || "" }) });
  return r.ok && (await r.json()) === true;
}

// deno-lint-ignore no-explicit-any
type Parse = (text: string) => any[];
const SOURCES: [string, string, Parse, boolean?][] = [
  ["BLS", "https://www.bls.gov/schedule/news_release/bls.ics", (t) => parseIcs(t, "BLS"), true],
  ["BEA", "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics", (t) => parseIcs(t, "BEA")],
  ["ONS", "https://api.beta.ons.gov.uk/v1/search/releases?release-type=type-upcoming&limit=200", (t) => parseOns(JSON.parse(t))],
  ["Fed", "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", parseFomc],
  ["BoE", "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", parseBoe],
  ["ECB", "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", parseEcb],
];

Deno.serve(async (req) => {
  if (req.method !== "POST" || !(await allowed(req))) return json({ error: "Not allowed" }, 401);
  const ua = `Marble economic calendar (${CONTACT || "https://trademarble.app"})`;
  const from = Date.now() - 2 * 864e5, to = Date.now() + 120 * 864e5;
  const report: Record<string, string | number> = {};
  // deno-lint-ignore no-explicit-any
  const rows: any[] = [];
  await Promise.all(SOURCES.map(async ([name, url, parse, needsContact]) => {
    if (needsContact && !CONTACT) { report[name] = "skipped: set DATA_CONTACT_EMAIL"; return; }
    try {
      const r = await fetch(url, { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) { await r.body?.cancel(); report[name] = `HTTP ${r.status}`; return; }
      const got = parse(await r.text()).filter((e) => { const t = Date.parse(e.at); return t >= from && t <= to; });
      rows.push(...got);
      report[name] = got.length;
    } catch (e) { report[name] = `failed: ${(e as Error).message}`; }
  }));
  const now = new Date().toISOString();
  const list = dedupe(rows).map((e) => ({ ...e, updated_at: now }));
  if (list.length) {
    const r = await fetch(`${BASE}/rest/v1/econ_events?on_conflict=id`, { method: "POST", headers: { ...db, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(list) });
    if (!r.ok) { const why = await r.text(); console.error("news-calendar save", why); return json({ ok: false, error: "save failed", sources: report }, 500); }
  }
  const old = await fetch(`${BASE}/rest/v1/econ_events?at=lt.${new Date(Date.now() - 120 * 864e5).toISOString()}`, { method: "DELETE", headers: db });
  await old.body?.cancel();
  console.log("news-calendar", JSON.stringify({ saved: list.length, sources: report }));
  return json({ ok: true, saved: list.length, sources: report });
});
