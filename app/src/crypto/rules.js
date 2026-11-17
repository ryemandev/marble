import { fmtMoney, plural } from "../data.js";

export function rulesWords(r) {
  const parts = [r.stopAfter && `${plural(r.stopAfter, "loss")} in a row`, r.lossLimit && `${fmtMoney(r.lossLimit)} down`, r.maxTrades && plural(r.maxTrades, "trade"), r.maxLeverage && `one trade over ${+r.maxLeverage}×`].filter(Boolean);
  const liq = r.minLiqDistance ? `Liquidation stays at least ${+r.minLiqDistance}% away.` : "";
  if (!parts.length) return liq;
  return [`You stop for the day after ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}` : parts[0]}.`, liq].filter(Boolean).join(" ");
}
