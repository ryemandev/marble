import { BEA_SERIES, BLS_SERIES, ONS_SERIES, beaFigures, blsFigures, onsFigures, settle } from "../_shared/news.js";

const BLS = BLS_SERIES as Record<string, string[][]>, BEA = BEA_SERIES as Record<string, [string, string, RegExp]>, ONS = ONS_SERIES as Record<string, string>;

const BASE = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BLS_KEY = (Deno.env.get("BLS_API_KEY") || "").trim(), BEA_KEY = (Deno.env.get("BEA_API_KEY") || "").trim();
const UA = { "User-Agent": `Marble economic calendar (${(Deno.env.get("DATA_CONTACT_EMAIL") || "https://trademarble.app").trim()})` };
const db = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Ev = { id: string; source: string; short: string; at: string; prev: string | null; actual: string | null; data_period: string | null; [k: string]: any };
type Figs = { period: string | null; latest: string | null; before: string | null };

async function allowed(req: Request) {
  const r = await fetch(`${BASE}/rest/v1/rpc/news_sync_cron_ok`, { method: "POST", headers: db, body: JSON.stringify({ p_secret: req.headers.get("x-marble-cron") || "" }) });
  return r.ok && (await r.json()) === true;
}
const get = async (url: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`HTTP ${r.status}`); }
  return r.json();
};

async function bls(events: Ev[]) {
  const ids = [...new Set(events.flatMap((e) => BLS[e.short].map(([s]) => s)))];
  const y = new Date().getUTCFullYear();
  const j = await get("https://api.bls.gov/publicAPI/v2/timeseries/data/", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seriesid: ids, startyear: String(y - 1), endyear: String(y), registrationkey: BLS_KEY }) });
  const data = Object.fromEntries((j.Results?.series || []).map((s: { seriesID: string; data: unknown[] }) => [s.seriesID, s.data]));
  return (e: Ev): Figs[] => BLS[e.short].map(([s, how, unit]) => blsFigures(data[s] as never, how, unit));
}
async function beaOf(e: Ev): Promise<Figs[]> {
  const [table, freq, line] = BEA[e.short];
  const y = new Date().getUTCFullYear();
  const q = new URLSearchParams({ UserID: BEA_KEY, method: "GetData", datasetname: "NIPA", TableName: table, Frequency: freq, Year: `${y - 1},${y}`, ResultFormat: "json" });
  return [beaFigures(await get(`https://apps.bea.gov/api/data?${q}`), line)];
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !(await allowed(req))) return json({ error: "Not allowed" }, 401);
  const now = Date.now();
  const q = `select=id,source,short,at,prev,actual,data_period&actual=is.null&status=eq.scheduled&at=gte.${new Date(now - 6 * 36e5).toISOString()}&at=lte.${new Date(now + 7 * 864e5).toISOString()}`;
  const r = await fetch(`${BASE}/rest/v1/econ_events?${q}`, { headers: db });
  if (!r.ok) return json({ ok: false, error: "read failed" }, 500);
  const due = ((await r.json()) as Ev[]).filter((e) => !e.prev || now >= Date.parse(e.at));
  const report: Record<string, string | number> = {};
  const updates: Record<string, unknown>[] = [];
  const apply = (e: Ev, figs: Figs[]) => { const s = settle(e, figs, now); if (s) updates.push({ id: e.id, ...s }); };

  const blsDue = due.filter((e) => e.source === "BLS" && BLS[e.short]);
  if (blsDue.length && !BLS_KEY) report.BLS = "skipped: set BLS_API_KEY";
  else if (blsDue.length) { try { const f = await bls(blsDue); blsDue.forEach((e) => apply(e, f(e))); report.BLS = blsDue.length; } catch (e) { report.BLS = `failed: ${(e as Error).message}`; } }

  const beaDue = due.filter((e) => e.source === "BEA" && BEA[e.short]);
  if (beaDue.length && !BEA_KEY) report.BEA = "skipped: set BEA_API_KEY";
  else for (const e of beaDue) { try { apply(e, await beaOf(e)); report.BEA = beaDue.length; } catch (x) { report.BEA = `failed: ${(x as Error).message.replaceAll(BEA_KEY, "…")}`; } }

  for (const e of due.filter((x) => x.source === "ONS" && ONS[x.short])) {
    try { apply(e, [onsFigures(await get(ONS[e.short]))]); report.ONS = (+report.ONS || 0) + 1; } catch (x) { report.ONS = `failed: ${(x as Error).message}`; }
  }

  for (const u of updates) {
    const { id, ...patch } = u;
    const w = await fetch(`${BASE}/rest/v1/econ_events?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", headers: { ...db, Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
    await w.body?.cancel();
  }
  console.log("news-actuals", JSON.stringify({ due: due.length, written: updates.length, sources: report }));
  return json({ ok: true, due: due.length, written: updates.length, sources: report });
});
