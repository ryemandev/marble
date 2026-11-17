const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function zoned(y, mo, d, h, mi, tz) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const want = Date.UTC(y, mo, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    t += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return t;
}

export const IMPACT = [
  [/^(the )?employment situation/i, "high", "Jobs report", "US"],
  [/^consumer price index/i, "high", "CPI", "US"],
  [/^personal income and outlays/i, "high", "PCE inflation", "US"],
  [/^gross domestic product/i, "high", "GDP", "US"],
  [/^fomc statement/i, "high", "FOMC decision", "US"],
  [/^producer price index/i, "med", "PPI", "US"],
  [/^job openings and labor turnover/i, "med", "JOLTS", "US"],
  [/^employment cost index/i, "med", "Employment cost index", "US"],
  [/^u\.s\. international trade in goods and services/i, "med", "Trade balance", "US"],
  [/^productivity and costs/i, "med", "Productivity", "US"],
  [/^bank rate decision/i, "high", "BoE rate decision", "GB"],
  [/^consumer price inflation, uk/i, "high", "UK CPI", "GB"],
  [/^gdp (monthly estimate|first quarterly estimate), uk/i, "high", "UK GDP", "GB"],
  [/^labour market overview, uk/i, "high", "UK jobs", "GB"],
  [/^retail sales, great britain/i, "med", "UK retail sales", "GB"],
  [/^ecb monetary policy decision/i, "high", "ECB rate decision", "EU"],
];
export function rate(title) {
  for (const [re, impact, short, country] of IMPACT) if (re.test(title.trim())) return { impact, short, country };
  return null;
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function eventRow(source, title, at, extra = {}) {
  const r = rate(title);
  if (!r || !Number.isFinite(at)) return null;
  const day = new Date(at - 5 * 36e5).toISOString().slice(0, 10); // the New York date is close enough for a key
  return { id: `${source}:${day}:${slug(r.short)}`, source, title: title.trim().slice(0, 200), short: r.short, country: r.country, impact: r.impact,
    at: new Date(at).toISOString(), status: "scheduled", ...extra };
}

export function dedupe(rows) {
  const seen = new Map();
  for (const e of rows) if (!seen.has(e.id)) seen.set(e.id, { id: e.id, source: e.source, title: e.title, short: e.short, country: e.country, impact: e.impact, at: e.at, status: e.status || "scheduled", period: e.period ?? null });
  return [...seen.values()];
}

/* ---------- iCalendar (BLS, BEA) ---------- */
export function parseIcs(text, source) {
  const out = [];
  for (const block of String(text).split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0].replace(/\r?\n[ \t]/g, "");
    const line = (k) => (body.match(new RegExp(`^${k}([^:\\n]*):(.*)$`, "m")) || []);
    const [, , value = ""] = line("DTSTART");
    const m = value.trim().match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)/);
    if (!m) continue;
    const [y, mo, d, h, mi] = [+m[1], +m[2] - 1, +m[3], +m[4], +m[5]];
    const at = value.trim().endsWith("Z") ? Date.UTC(y, mo, d, h, mi) : zoned(y, mo, d, h, mi, "America/New_York"); // both feeds are New York time
    const title = (line("SUMMARY")[2] || "").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ");
    const row = eventRow(source, title, at, { period: periodOf(title) });
    if (row) out.push(row);
  }
  return out;
}
const periodOf = (title) => (title.match(/,\s*((?:[A-Z][a-z]+|\d(?:st|nd|rd|th) Quarter)\s+\d{4}.*)$/) || [])[1]?.slice(0, 60) || null;

/* ---------- ONS release calendar (JSON) ---------- */
export function parseOns(json) {
  return (json?.releases || []).flatMap((r) => {
    const d = r.description || {};
    if (!d.title || d.cancelled || /time series$/i.test(d.title)) return [];
    const row = eventRow("ONS", d.title, Date.parse(d.release_date), { status: d.postponed ? "postponed" : "scheduled" });
    return row ? [row] : [];
  });
}

export function parseFomc(html) {
  const out = [];
  for (const [, year, section] of String(html).matchAll(/(\d{4}) FOMC Meetings([\s\S]*?)(?=\d{4} FOMC Meetings|$)/g)) {
    for (const [, mo, days] of section.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([A-Za-z/]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g)) {
      const last = mo.split("/").pop().toLowerCase(), day = +String(days).replace(/[^\d-]/g, "").split("-").pop();
      const mi = MONTHS.findIndex((n) => n.startsWith(last.slice(0, 3)));
      if (mi < 0 || !day) continue;
      const row = eventRow("Fed", "FOMC statement", zoned(+year, mi, day, 14, 0, "America/New_York"));
      if (row) out.push(row);
    }
  }
  return out;
}

const text = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
export function parseBoe(html) {
  const out = [], t = text(html);
  const parts = t.split(/(\d{4}) (?:confirmed|provisional) dates/i);
  for (let i = 1; i < parts.length; i += 2) {
    const year = +parts[i];
    for (const [, d, mo] of parts[i + 1].matchAll(/(?:Monday|Tuesday|Wednesday|Thursday|Friday) (\d{1,2}) ([A-Z][a-z]+)/g)) {
      const mi = MONTHS.indexOf(mo.toLowerCase());
      if (mi < 0) continue;
      const row = eventRow("BoE", "Bank Rate decision", zoned(year, mi, +d, 12, 0, "Europe/London"));
      if (row && !out.some((x) => x.id === row.id)) out.push(row);
    }
  }
  return out;
}

export function parseEcb(html) {
  const out = [];
  for (const [, d, mo, y] of text(html).matchAll(/(\d{2})\/(\d{2})\/(\d{4}) Governing Council of the ECB: monetary policy meeting[^(]*\(Day 2\)/g)) {
    const row = eventRow("ECB", "ECB monetary policy decision", zoned(+y, +mo - 1, +d, 14, 15, "Europe/Berlin"));
    if (row && !out.some((x) => x.id === row.id)) out.push(row);
  }
  return out;
}

export const FEEDS = [
  ["Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml"],
  ["Federal Reserve", "https://www.federalreserve.gov/feeds/speeches.xml"],
  ["ECB", "https://www.ecb.europa.eu/rss/press.html"],
  ["Bank of England", "https://www.bankofengland.co.uk/rss/news"],
  ["BLS", "https://www.bls.gov/feed/bls_latest.rss"],
  ["BEA", "https://apps.bea.gov/rss/rss.xml"],
];
const decode = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// A stable id for a link, so the same story is stored once
export function idOf(url) {
  let h = 2166136261;
  for (const c of url) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `${(h >>> 0).toString(36)}-${url.length.toString(36)}`;
}
const safeUrl = (u) => { try { const x = new URL(String(u).trim()); return x.protocol === "https:" ? x.href : null; } catch { return null; } };
export function parseRss(xml, source, now = Date.now()) {
  const out = [];
  for (const [, item] of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const tag = (k) => (item.match(new RegExp(`<${k}\\b[^>]*>([\\s\\S]*?)</${k}>`)) || [])[1];
    const title = decode(tag("title")), url = safeUrl(decode(tag("link")) || decode(tag("guid")));
    const at = Date.parse(decode(tag("pubDate") || tag("dc:date")));
    if (!title || !url || !Number.isFinite(at) || at > now + 36e5) continue;
    out.push({ id: idOf(url), kind: "official", source, title: title.slice(0, 300), url, published_at: new Date(at).toISOString() });
  }
  return out;
}
export function parseMediastack(json, now = Date.now()) {
  return (json?.data || []).flatMap((a) => {
    const url = safeUrl(a.url), at = Date.parse(a.published_at), title = decode(a.title);
    if (!url || !title || !Number.isFinite(at) || at > now + 36e5) return [];
    return [{ id: idOf(url), kind: "market", source: decode(a.source || "News").slice(0, 60), title: title.slice(0, 300), url, published_at: new Date(at).toISOString() }];
  });
}

export const BLS_SERIES = {
  CPI: [["CUSR0000SA0", "pct", "%"]],
  PPI: [["WPSFD4", "pct", "%"]],
  "Jobs report": [["CES0000000001", "chg", "K"], ["LNS14000000", "lvl", "%"]],
  JOLTS: [["JTS000000000000000JOL", "lvl", "K"]],
};
export function blsFigures(seriesRows, how, unit) {
  const rows = (seriesRows || []).filter((r) => /^M(0[1-9]|1[0-2])$/.test(r.period) && r.value !== "-").map((r) => ({ p: `${r.year}-${r.period.slice(1)}`, v: +r.value }))
    .filter((r) => Number.isFinite(r.v)).sort((a, b) => b.p.localeCompare(a.p));
  const fig = (i) => {
    if (how === "lvl") return rows[i] ? fmt(rows[i].v, unit, false) : null;
    if (!rows[i] || !rows[i + 1]) return null;
    const d = how === "pct" ? ((rows[i].v - rows[i + 1].v) / rows[i + 1].v) * 100 : rows[i].v - rows[i + 1].v;
    return fmt(d, unit, true);
  };
  return { period: rows[0]?.p || null, latest: fig(0), before: fig(1) };
}
export const BEA_SERIES = {
  GDP: ["T10101", "Q", /^Gross domestic product$/i],
  "PCE inflation": ["T20807", "M", /^Personal consumption expenditures \(PCE\)$/i],
};
export function beaFigures(json, line) {
  const rows = (json?.BEAAPI?.Results?.Data || []).filter((r) => line.test(String(r.LineDescription).trim()))
    .map((r) => ({ p: String(r.TimePeriod).replace(/^(\d{4})M(\d\d)$/, "$1-$2").replace(/^(\d{4})Q(\d)$/, "$1-Q$2"), v: +String(r.DataValue).replace(/,/g, "") }))
    .filter((r) => Number.isFinite(r.v)).sort((a, b) => b.p.localeCompare(a.p));
  return { period: rows[0]?.p || null, latest: rows[0] ? fmt(rows[0].v, "%", true) : null, before: rows[1] ? fmt(rows[1].v, "%", true) : null };
}
export const ONS_SERIES = { "UK CPI": "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data" };
const MON = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
export function onsFigures(json) {
  const rows = (json?.months || []).map((m) => { const [y, mo] = String(m.date).split(" "); return { p: MON[mo] ? `${y}-${MON[mo]}` : null, v: +m.value }; })
    .filter((r) => r.p && Number.isFinite(r.v)).sort((a, b) => b.p.localeCompare(a.p));
  return { period: rows[0]?.p || null, latest: rows[0] ? fmt(rows[0].v, "%", false) : null, before: rows[1] ? fmt(rows[1].v, "%", false) : null };
}
const fmt = (v, unit, signed) => {
  const s = unit === "%" ? v.toFixed(1) : unit === "K" ? Math.round(v).toLocaleString("en-US") : String(v);
  return `${signed && v > 0 ? "+" : v < 0 ? "−" : ""}${s.replace("-", "")}${unit}`;
};
export function settle(event, figs, now = Date.now()) {
  if (!figs.length || figs.some((f) => !f.period)) return null;
  const period = figs[0].period, joined = (k) => (figs.every((f) => f[k]) ? figs.map((f) => f[k]).join(" · ") : null);
  const out = now >= Date.parse(event.at);
  if (!out) return event.prev && event.data_period === period ? null : { prev: joined("latest"), data_period: period };
  if (event.actual || !event.data_period || period <= event.data_period) return null; // not published yet, or already written
  return { actual: joined("latest"), prev: joined("before"), data_period: period, actual_at: new Date(now).toISOString() };
}
