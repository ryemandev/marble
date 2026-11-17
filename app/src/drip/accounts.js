import { useMemo } from "react";
import { SAMPLE, isToday, todayKey } from "../data";
import { LIVE } from "../mode";
import { exampleOn, useAllTrades, useStore } from "../store";
import { inWorld } from "../world";

// Marble's words for an account's stage. Evaluation money is simulated and must always read that way.
export const STAGES = { live: "Live", funded: "Funded", eval: "Evaluation", paper: "Paper" };
export function stageOf(a) {
  const k = String(a?.status || a?.kind || "").toLowerCase();
  if (k.startsWith("eval")) return "eval";
  if (k.startsWith("fund")) return "funded";
  if (k.startsWith("paper")) return "paper";
  return "live";
}
export const simulated = (stage) => stage === "eval" || stage === "paper";

// True while the numbers on screen are made up, so they can be labelled
export const useSample = () => useStore((s) => !LIVE || !!s.example?.on);
export const isSample = () => !LIVE || exampleOn();

export function useAccounts() {
  const world = useStore((s) => s.world);
  const added = useStore((s) => s.accounts);
  const all = useAllTrades();
  const day = useStore(() => todayKey());
  return useMemo(() => {
    const base = (LIVE ? added : [...(SAMPLE.ACCOUNTS || []).filter((a) => inWorld(a, world)), ...added]).filter((a) => !a.archived);
    return base.map((a) => {
      const mine = all.filter((t) => t.account === a.id);
      const pnl = mine.reduce((sum, t) => sum + (+t.pnl || 0), 0);
      const today = mine.filter(isToday).reduce((sum, t) => sum + (+t.pnl || 0), 0);
      const sample = !LIVE && (SAMPLE.ACCOUNTS || []).includes(a);
      return { ...a, stage: stageOf(a), equity: sample ? a.balance : (+a.balance || 0) + pnl, today };
    });
  }, [all, added, world, day]);
}
