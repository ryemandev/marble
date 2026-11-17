import { useEffect, useState } from "react";
import { RULE_FIRMS, dayWords, phaseKeys, phaseLabel, phaseOf, planFor, sizeLabel } from "../../lib/firm-rules/catalog";
import { loadFirm } from "../../lib/firm-rules/load";
import { ruleWords } from "../../lib/firm-rules/words";
import Logo from "../works/Logo";
import { COMPARE } from "./copy";
import { PlanPicker, Questions, ToolEnd, startPick } from "./shared";
import "./tools.css";

const ROWS = [
  ["dll", "Daily loss limit"], ["reset", "Day resets at"], ["dd", "Max drawdown"], ["target", "Profit target"], ["cons", "Consistency"],
  ["days", "Minimum days"], ["payDays", "Payout days"], ["size", "Contracts"], ["news", "News"], ["hold", "Holding"], ["time", "Time limits"],
];
const RULE_OF = { dll: "dll", dd: "dd", target: "target", cons: "cons", days: "days", payDays: "pay", size: "size", news: "news", hold: "hold", time: "time" };
const START = [startPick("topstep", 50000), startPick("apex", 100000), startPick("ftmo", 100000)];

// Every firm file the columns need, loaded once each
function useFiles(slugs) {
  const [files, setFiles] = useState({});
  const key = [...new Set(slugs)].sort().join(",");
  useEffect(() => {
    let live = true;
    for (const s of key.split(",").filter(Boolean)) loadFirm(s).then((f) => { if (live && f) setFiles((x) => (x[s] ? x : { ...x, [s]: f })); }, () => {});
    return () => { live = false; };
  }, [key]);
  return files;
}

export default function Compare() {
  const [picks, setPicks] = useState(START);
  const files = useFiles(picks.map((p) => p.firm));
  const cols = picks.map((pick) => {
    const plan = files[pick.firm] ? planFor(files[pick.firm], pick.program, pick.size, pick.ver) : null;
    const phase = plan ? phaseOf(plan, pick.phase) : null;
    const meta = RULE_FIRMS.find((f) => f.slug === pick.firm);
    return { pick, plan, phase, meta, words: plan && phase ? ruleWords(plan, phase) : null };
  });
  const setAt = (i, next) => setPicks((ps) => ps.map((p, j) => (j === i ? next : p)));
  const add = () => setPicks((ps) => [...ps, startPick(RULE_FIRMS.find((f) => !ps.some((p) => p.firm === f.slug))?.slug || "topstep")]);
  const remove = (i) => setPicks((ps) => ps.filter((_, j) => j !== i));
  const shown = ROWS.filter(([k]) => cols.some((c) => c.words?.[k]));

  return (
    <>
      <section className="tl-tool tl-wrap" aria-label="Compare prop firm rules">
        <div className="tl-cmp" style={{ "--n": cols.length }}>
          <div className="tl-cmp-pickers">
            {cols.map((c, i) => (
              <div key={i} className="tl-panel tl-cmp-pick">
                <div className="tl-cmp-pick-head">
                  <Logo slug={c.pick.firm} name={c.meta?.name} size={22} className="tl-logo" />
                  {cols.length > 1 && <button type="button" className="tl-x" onClick={() => remove(i)} aria-label={`Remove ${c.meta?.name}`}>Remove</button>}
                </div>
                <PlanPicker pick={c.pick} onChange={(p) => setAt(i, p)} plan={c.plan} file={files[c.pick.firm]} compact idBase={`cmp-${i}`} />
              </div>
            ))}
            {cols.length < 3 && <button type="button" className="tl-panel tl-cmp-add" onClick={add}><span aria-hidden="true">+</span> Add a firm</button>}
          </div>
          <table className="tl-cmp-table">
            <caption className="sr-only">The rules of {cols.map((c) => `${c.meta?.name} ${sizeLabel(c.pick.size)}`).join(", ")}, side by side</caption>
            <thead>
              <tr><th scope="col"><span className="sr-only">Rule</span></th>{cols.map((c, i) => <th key={i} scope="col">{c.meta?.name} {sizeLabel(c.pick.size)}<span className="tl-cmp-stage">{c.plan ? `${c.plan.n}, ${phaseLabel(c.plan, c.pick.phase || phaseKeys(c.plan)[0]).toLowerCase()}` : "Loading…"}</span></th>)}</tr>
            </thead>
            <tbody>
              {shown.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  {cols.map((c, i) => {
                    const x = c.phase?.[RULE_OF[k]]?.x;
                    return (
                      <td key={i} data-firm={`${c.meta?.name} ${sizeLabel(c.pick.size)}`} className={/^(Check with the firm|Not published)$/.test(c.words?.[k] || "") ? "unclear" : ""}>
                        {c.words?.[k] || "–"}
                        {x?.length > 0 && <span className="tl-xd">Pages disagree, stricter shown: {x.slice(0, 3).map((u, j) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" aria-label={`${c.meta?.name} page ${j + 1}`}>{j + 1}</a>)}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="tl-cmp-checked">
                <th scope="row">Checked</th>
                {cols.map((c, i) => <td key={i} data-firm={`${c.meta?.name} ${sizeLabel(c.pick.size)}`}>{c.meta ? <>{dayWords(c.meta.checked)}, <a href={c.meta.src} target="_blank" rel="noopener noreferrer">{c.meta.name}'s page</a></> : "–"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="tl-note tl-cmp-foot">Where a firm's own pages disagree, the stricter figure is shown and the pages are linked. "Check with the firm" and "Not published" mean there's no settled figure; the firm's page has the details. Amounts are in each plan's own currency, mostly US dollars.</p>
      </section>

      <section className="tl-wrap tl-all" aria-labelledby="tl-all-title">
        <h2 id="tl-all-title" className="tl-h2">Every firm's main plan</h2>
        <p className="tl-note">Each firm's main program at 50K (or the size nearest it), first stage. Pick any of them above for the rest of its rules and its other sizes. † The firm's own pages disagree on this one; the stricter figure is shown.</p>
        <div className="tl-all-scroll">
          <table className="tl-all-table">
            <thead><tr><th scope="col">Firm</th><th scope="col">Max drawdown</th><th scope="col">Daily loss limit</th><th scope="col">Profit target</th><th scope="col">Consistency</th><th scope="col">Checked</th></tr></thead>
            <tbody>
              {RULE_FIRMS.filter((f) => f.main).map((f) => (
                <tr key={f.slug}>
                  <th scope="row"><a className="tl-all-firm" href={`/prop-firms/${f.slug}/`}>{f.name}</a><span className="tl-all-plan">{f.main.n} {sizeLabel(f.main.size)}</span></th>
                  {[["dd", "Max drawdown", "–"], ["dll", "Daily loss limit", "–"], ["target", "Profit target", "None"], ["cons", "Consistency", "–"]].map(([k, label, empty]) => (
                    <td key={k} data-k={label}>{f.main[k] || empty}{f.main.x?.includes(k) && <sup className="tl-dag" title="The firm's pages disagree; the stricter figure is shown">†</sup>}</td>
                  ))}
                  <td data-k="Checked"><a href={f.src} target="_blank" rel="noopener noreferrer">{dayWords(f.checked)}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="tl-wrap"><Questions faq={COMPARE.faq} id="cmp" /></div>
      <ToolEnd line="Pick your account's firm and plan and the Desk shows your room to the drawdown, worked out from your own trades." />
    </>
  );
}
