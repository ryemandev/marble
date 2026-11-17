import { useEffect, useMemo, useState } from "react";
import { firmRulesOf, firmShort, phaseOf, planIn } from "../lib/firm-rules/catalog";
import { loadFirmNow, loadedFirm } from "../lib/firm-rules/load";
import { track } from "../lib/firm-rules/track";
import { isPayout } from "../views/money/model";

export function useFirm(slug) {
  const [firm, setFirm] = useState(() => (firmRulesOf(slug) ? loadedFirm(slug) : null));
  useEffect(() => {
    if (!firmRulesOf(slug)) { setFirm(null); return; }
    let live = true;
    setFirm(loadedFirm(slug));
    loadFirmNow(slug).then((f) => { if (live) setFirm(f); }, () => {});
    return () => { live = false; };
  }, [slug]);
  return firm;
}

export function useTracked(account, trades, tick, money) {
  const firm = useFirm(account?.firmPlan ? account.firm : null);
  const plan = account?.firmPlan ? planIn(firm, account.firmPlan) : null;
  const phase = plan ? phaseOf(plan, account.firmPhase) : null;
  const meta = firmRulesOf(account?.firm);
  const id = account?.id;
  const mine = useMemo(() => (id ? trades.filter((t) => t.account === id) : []), [trades, id]);
  const payouts = useMemo(() => (id && Array.isArray(money) ? money.filter((m) => m.account === id && isPayout(m)).map((m) => m.day) : []), [money, id]);
  const result = useMemo(
    () => (plan && phase ? track({ plan, phase, firmName: firmShort(account.firm), group: meta?.group, start: account.balance, trades: mine, payouts }) : null),
    [plan, phase, meta, account?.balance, mine, payouts, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return { firm, plan, phase, meta, result, loading: !!account?.firmPlan && !firm };
}
