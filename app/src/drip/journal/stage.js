import { useMemo } from "react";
import { SAMPLE } from "../../data";
import { LIVE } from "../../mode";
import { setState, useStore } from "../../store";
import { STAGES, simulated, stageOf, useSample } from "../accounts";

const FIRST = ["funded", "live", "eval", "paper"];

// Sample trades carry no fees, so the demo makes theirs up the same way every time, and leaves every
// fifth one without any so the "none reported" state shows.
export function withFees(t) {
  if (LIVE || t.commission != null || t.source !== "import") return t;
  const n = parseInt(String(t.id).slice(1), 10);
  if (!Number.isFinite(n) || n % 5 === 0) return t;
  return { ...t, commission: ((n % 4) + 1) * 4.24 };
}

// Money is shown one stage at a time, the same pick on Journal and Stats. Evaluation is simulated, so it
// never joins real money. Archived accounts still know their stage, so old trades never turn into live ones.
export function useStage(all) {
  const added = useStore((s) => s.accounts);
  const picked = useStore((s) => s.moneyStage);
  const sample = useSample();
  const of = useMemo(() => {
    const map = {};
    for (const a of [...(LIVE ? [] : SAMPLE.ACCOUNTS || []), ...added]) map[a.id] = stageOf(a);
    return (t) => map[t.account] ?? stageOf({ kind: t.accountKind });
  }, [added]);
  const offered = useMemo(() => { const has = new Set(all.map(of)); return Object.keys(STAGES).filter((s) => has.has(s)); }, [all, of]);
  const stage = picked && offered.includes(picked) ? picked : FIRST.find((s) => offered.includes(s)) || "live";
  const tag = [STAGES[stage], simulated(stage) ? "Simulated" : null, sample ? "Sample data" : null].filter(Boolean).join(" · ");
  return { stage, offered, of, tag, sample, pick: (s) => setState({ moneyStage: s }) };
}
