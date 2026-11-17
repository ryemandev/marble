import { useEffect, useState } from "react";
import { RULE_FIRMS, dayWords, firmRulesOf, pageLinks, phaseKeys, phaseLabel, phaseOf, planFor, programsOf, sizeLabel, versionLabel, versionsOf } from "../../lib/firm-rules/catalog";
import { loadFirm } from "../../lib/firm-rules/load";
import { StartFree } from "../heroes/shared";

export const clean = (v) => { const [whole, ...rest] = v.replace(/[^\d.]/g, "").split("."); return whole.slice(0, 9) + (rest.length ? "." + rest.join("").slice(0, 4) : ""); };

// A firm's rule sets, loaded the first time they're asked for
function useFirmFile(slug) {
  const [file, setFile] = useState(null);
  useEffect(() => {
    let live = true;
    setFile(null);
    if (slug) loadFirm(slug).then((f) => { if (live) setFile(f); }, () => {});
    return () => { live = false; };
  }, [slug]);
  return file;
}

export function usePlan(pick) {
  const file = useFirmFile(pick.firm);
  const plan = file ? planFor(file, pick.program, pick.size, pick.ver) : null;
  const phase = plan ? phaseOf(plan, pick.phase) : null;
  return { file, plan, phase };
}

export const startPick = (firm, size = 50000) => {
  const prog = programsOf(firm)[0];
  return { firm, program: prog.p, size: prog.sizes.includes(size) ? size : prog.sizes[0], phase: null };
};

export function PlanPicker({ pick, onChange, plan, file, label = "Firm", compact = false, idBase }) {
  const programs = programsOf(pick.firm, { legacy: true });
  const prog = programs.find((p) => p.p === pick.program) || programs[0];
  const keys = plan ? phaseKeys(plan) : [];
  const versions = plan && file ? versionsOf(file, plan.p, plan.size) : [];
  const set = (next) => onChange({ ...pick, ...next });
  return (
    <div className={`tl-pick ${compact ? "compact" : ""}`}>
      <label className="tl-field wide"><span className="tl-label">{label}</span>
        <select id={idBase && `${idBase}-firm`} value={pick.firm} onChange={(e) => onChange(startPick(e.target.value, pick.size))}>
          <optgroup label="Futures">{RULE_FIRMS.filter((f) => f.group === "futures").map((f) => <option key={f.slug} value={f.slug}>{f.name}</option>)}</optgroup>
          <optgroup label="Forex and CFDs">{RULE_FIRMS.filter((f) => f.group !== "futures").map((f) => <option key={f.slug} value={f.slug}>{f.name}</option>)}</optgroup>
        </select>
      </label>
      {programs.length > 1 && (
        <label className="tl-field wide"><span className="tl-label">Program</span>
          <select value={prog.p} onChange={(e) => { const p = programs.find((x) => x.p === e.target.value); set({ program: p.p, size: p.sizes.includes(pick.size) ? pick.size : p.sizes[0], phase: null }); }}>
            {programs.filter((p) => !p.legacy).map((p) => <option key={p.p} value={p.p}>{p.n}</option>)}
            {programs.some((p) => p.legacy) && <optgroup label="No longer sold">{programs.filter((p) => p.legacy).map((p) => <option key={p.p} value={p.p}>{p.n}</option>)}</optgroup>}
          </select>
        </label>
      )}
      <label className="tl-field"><span className="tl-label">Size</span>
        <select value={pick.size} onChange={(e) => set({ size: +e.target.value })}>
          {prog.sizes.map((n) => <option key={n} value={n}>{sizeLabel(n)}</option>)}
        </select>
      </label>
      {versions.length > 1 && (
        <label className="tl-field"><span className="tl-label">Bought</span>
          <select value={plan.id} onChange={(e) => set({ ver: versions.find((v) => v.id === e.target.value)?.ver || 1, phase: null })}>
            {versions.map((v) => <option key={v.id} value={v.id}>{versionLabel(v)}</option>)}
          </select>
        </label>
      )}
      {keys.length > 1 && (
        <label className="tl-field"><span className="tl-label">Stage</span>
          <select value={pick.phase || keys[0]} onChange={(e) => set({ phase: e.target.value })}>
            {keys.map((k) => <option key={k} value={k}>{phaseLabel(plan, k)}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export function Checked({ slug, className = "" }) {
  const f = firmRulesOf(slug);
  if (!f) return null;
  return (
    <p className={`tl-checked ${className}`}>
      {f.name}'s rules checked {dayWords(f.checked)} on <a href={f.src} target="_blank" rel="noopener noreferrer">its own pages</a>.
    </p>
  );
}

export function Disputed({ name, what, rule }) {
  if (!rule?.x?.length) return null;
  return (
    <p className="tl-note">
      {name}'s pages {rule.xa ? `don't settle ${what} exactly` : `disagree on ${what}`}. This uses the stricter {rule.xa ? "reading" : "figure"}. The pages:{" "}
      {pageLinks(rule.x).map((p, j) => <span key={p.url}>{j > 0 && " · "}<a href={p.url} target="_blank" rel="noopener noreferrer">{p.label}</a></span>)}.
    </p>
  );
}

export function Questions({ faq, id }) {
  return (
    <section className="tl-faq" aria-labelledby={`${id}-faq`}>
      <h2 id={`${id}-faq`} className="tl-h2">Questions</h2>
      <dl>
        {faq.map(({ q, a }) => (
          <div key={q} className="tl-qa"><dt>{q}</dt><dd>{a}</dd></div>
        ))}
      </dl>
      <p className="tl-note">Marble isn't connected with any prop firm. Every figure here is arithmetic on the rules a firm publishes and the numbers you enter; it isn't advice, and your firm's own dashboard always has the final word.</p>
    </section>
  );
}

export function ToolEnd({ line }) {
  return (
    <section className="tl-end" aria-labelledby="tl-end-title">
      <div className="tl-wrap tl-end-in">
        <span className="hx-kicker">Marble, the trading journal</span>
        <h2 id="tl-end-title" className="tl-end-title"><span>Track this every day</span><span className="silver">in Marble.</span></h2>
        <p className="hx-sub tl-end-sub">{line} Marble is free forever.</p>
        <div className="hx-actions tl-end-actions"><StartFree /></div>
      </div>
    </section>
  );
}
