import { Choice, Field } from "../components/forms";
import { dayWords, firstPhaseKey, firmRulesOf, kindForPhase, phaseKeys, phaseLabel, phaseOf, planFor, planIn, programsOf, sizeLabel, versionLabel, versionsOf } from "../lib/firm-rules/catalog";
import { planLine } from "../lib/firm-rules/words";
import { useFirm } from "./useFirmRules";

const NONE = "none";

export default function FirmPlanFields({ firm: slug, value, onChange, span = 4 }) {
  const meta = firmRulesOf(slug);
  const file = useFirm(slug);
  if (!meta) return null;
  const plan = value.plan ? planIn(file, value.plan) : null;
  const programs = programsOf(slug, { legacy: true });
  const current = programs.find((p) => plan ? p.p === plan.p : false) || (value.program && programs.find((p) => p.p === value.program)) || programs[0];
  const pick = (program, size, phase, version = plan ? plan.ver || 1 : undefined) => {
    const next = size == null ? null : planFor(file, program, size, version);
    if (!next) { onChange({ plan: null, phase: null, program, size: null, kind: null }); return; }
    const key = phase && phaseKeys(next).includes(phase) ? phase : firstPhaseKey(next);
    onChange({ plan: next.id, phase: key, program, size: next.size, kind: kindForPhase(phaseOf(next, key)) });
  };
  const ph = plan ? phaseOf(plan, value.phase) : null;
  const keys = plan ? phaseKeys(plan) : [];
  const versions = plan ? versionsOf(file, plan.p, plan.size) : [];
  const line = plan && ph ? planLine(plan, ph) : null;
  return (
    <>
      {programs.length > 1 && (
        <Field label="Program" span={span}>
          <select value={current.p} disabled={!file} onChange={(e) => {
            const p = programs.find((x) => x.p === e.target.value);
            pick(p.p, plan && p.sizes.includes(plan.size) ? plan.size : null, value.phase);
          }}>
            {programs.filter((p) => !p.legacy).map((p) => <option key={p.p} value={p.p}>{p.n}</option>)}
            {programs.some((p) => p.legacy) && (
              <optgroup label="No longer sold">
                {programs.filter((p) => p.legacy).map((p) => <option key={p.p} value={p.p}>{p.n}</option>)}
              </optgroup>
            )}
          </select>
        </Field>
      )}
      <Field label="Account size" span={span} hint={!file ? `Loading ${meta.name}'s rules…` : plan ? null : `Pick one to track ${meta.name}'s rules on this account`}>
        <Choice label="Account size" value={plan ? String(plan.size) : NONE}
          options={[...current.sizes.map((n) => [String(n), sizeLabel(n)]), [NONE, "No firm rules"]]}
          onChange={(v) => (file ? pick(current.p, v === NONE ? null : +v, value.phase) : null)} />
      </Field>
      {versions.length > 1 && (
        <Field label="Bought" span={span} hint={`${meta.name} changed these rules for accounts bought from ${dayWords(versions[versions.length - 1].from)}`}>
          <Choice label="Bought" value={plan.id} options={versions.map((v) => [v.id, versionLabel(v)])} onChange={(id) => pick(plan.p, plan.size, value.phase, versions.find((v) => v.id === id)?.ver || 1)} />
        </Field>
      )}
      {plan && keys.length > 1 && (
        <Field label="Stage" span={span}>
          <Choice label="Stage" value={value.phase || keys[0]} options={keys.map((k) => [k, phaseLabel(plan, k)])} onChange={(k) => pick(plan.p, plan.size, k)} />
        </Field>
      )}
      {line && <p className={`field span-${span} firm-plan-line xs muted`}>{line}. <span className="faint">Checked {dayWords(meta.checked)}.</span></p>}
    </>
  );
}
