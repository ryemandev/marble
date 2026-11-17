import { useMemo } from "react";
import { NOW, SAMPLE } from "../../data";
import { LIVE } from "../../mode";
import { useOwnStore } from "../../store";
import { CURRENCIES } from "./model";
import { pad } from "../../lib/basics.js";

export const moneyToday = () => `${NOW.year}-${pad(NOW.month + 1)}-${pad(NOW.day)}`;

export function useMoneyAccounts() {
  const added = useOwnStore((s) => s.accounts);
  return useMemo(() => [...(LIVE ? [] : SAMPLE.ACCOUNTS || []), ...(added || [])], [added]);
}
export const byIdOf = (accounts) => Object.fromEntries(accounts.map((a) => [a.id, a]));

export function startCurrency(money, me) {
  const last = [...(money || [])].sort((a, b) => String(a.at || a.day).localeCompare(String(b.at || b.day))).at(-1)?.currency;
  if (CURRENCIES.includes(last)) return last;
  const mine = me?.private?.currency;
  return CURRENCIES.includes(mine) ? mine : "USD";
}
