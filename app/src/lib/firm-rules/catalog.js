import INDEX from "./index.json" with { type: "json" };
import { MON as MONTHS } from "../basics.js";

export { INDEX };

export const RULE_FIRMS = Object.entries(INDEX.firms).map(([slug, f]) => ({ slug, ...f }));
export const hasRules = (slug) => !!(slug && INDEX.firms[slug]);
export const firmRulesOf = (slug) => (slug && INDEX.firms[slug]) || null;
const SHORT = { apex: "Apex", goat: "Goat", "alpha-capital": "Alpha Capital" };
export const firmShort = (slug) => SHORT[slug] || firmRulesOf(slug)?.name || "";

const sized = (p) => (p.sizes.some((n) => n == null) ? { ...p, sizes: p.sizes.filter((n) => n != null) } : p);
export const programsOf = (slug, { legacy = false } = {}) => (firmRulesOf(slug)?.programs || []).filter((p) => legacy || !p.legacy).map(sized).filter((p) => p.sizes.length);

// 50000 → "50K", 1500 → "1.5K", 250000 → "250K"
export const sizeLabel = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));

export function pageLinks(urls = []) {
  const seen = {};
  return urls.map((url) => {
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { host = "page"; }
    seen[host] = (seen[host] || 0) + 1;
    return { url, label: seen[host] > 1 ? `${host} (${seen[host]})` : host };
  });
}

// A day in words for the pages: "2026-10-29" → 29 Oct 2026
export const dayWords = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return y ? `${d} ${MONTHS[m - 1]} ${y}` : ""; };

export function readFirm(file) {
  if (!file?.plans) return null;
  const url = (r) => (r && typeof r === "object" && (typeof r.s === "number" || r.x)
    ? { ...r, ...(typeof r.s === "number" ? { s: file.urls[r.s] } : {}), ...(r.x ? { x: r.x.map((i) => file.urls[i]).filter(Boolean) } : {}) } : r);
  const RULES = ["target", "days", "time", "dll", "dd", "cons", "size", "news", "hold", "pay"];
  return {
    ...file,
    plans: file.plans.map((p) => ({ ...p, phases: p.phases.map((ph) => ({ ...ph, ...Object.fromEntries(RULES.filter((k) => k in ph).map((k) => [k, url(ph[k])])) })) })),
  };
}
export const planIn = (firm, id) => firm?.plans.find((p) => p.id === id) || null;

export const versionsOf = (firm, program, size) => (firm?.plans || []).filter((p) => p.p === program && p.size === size).sort((a, b) => (a.ver || 1) - (b.ver || 1));
export function planFor(firm, program, size, version) {
  const all = versionsOf(firm, program, size);
  return all.find((p) => version != null && (p.id === version || (p.ver || 1) === version)) || all.find((p) => !p.to) || all[all.length - 1] || null;
}
// "Bought before 22 Oct 2026" / "Bought from 22 Oct 2026"
export const versionLabel = (plan) => (plan?.to ? `Bought before ${dayWords(plan.to)}` : plan?.from ? `Bought from ${dayWords(plan.from)}` : "Current rules");

export function phaseKeys(plan) {
  const seen = {};
  return (plan?.phases || []).map((ph) => {
    const base = ph.path ? `${ph.k}:${ph.path}` : ph.k;
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] > 1 ? `${base}#${seen[base]}` : base;
  });
}
export function phaseOf(plan, key) {
  if (!plan?.phases?.length) return null;
  const i = phaseKeys(plan).indexOf(key);
  return plan.phases[i >= 0 ? i : 0];
}
export const firstPhaseKey = (plan) => phaseKeys(plan)[0] || null;

const KIND = { evaluation: "Evaluation", evaluation_step1: "Step 1", evaluation_step2: "Step 2", evaluation_step3: "Step 3", funded: "Funded", live: "Live", instant_funded: "Instant funded" };
const PATH = { standard: "standard path", consistency: "consistency path" };
export function phaseLabel(plan, key) {
  const keys = phaseKeys(plan);
  const i = Math.max(0, keys.indexOf(key));
  const ph = plan?.phases?.[i];
  if (!ph) return "";
  const n = (key || keys[i]).split("#")[1];
  const pathWords = ph.path ? PATH[ph.path] || ph.pn || `${ph.path} path` : null;
  const own = !ph.path && plan.phases.filter((x) => x.k === ph.k).length > 1 ? String(ph.n || "").split(/\s+[–-]\s+|\s*\(/)[0].trim() : "";
  if (own && own.length <= 28 && !plan.phases.some((x) => x !== ph && String(x.n || "").startsWith(own))) return own;
  return `${KIND[ph.k] || ph.k}${pathWords ? `, ${pathWords}` : ""}${n ? ` (${n})` : ""}`;
}
export const kindForPhase = (ph) => (!ph ? "Evaluation" : /^evaluation/.test(ph.k) ? "Evaluation" : ph.k === "live" ? "Live" : "Funded");
