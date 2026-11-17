export const PLATFORMS = {
  tradovate: { name: "Tradovate", file: "ready", export: "Performance or Orders report" },
  topstepx: { name: "TopstepX", file: "ready", export: "trade history" },
  rithmic: { name: "Rithmic", file: "ready", export: "order history from R | Trader Pro" },
  ninjatrader: { name: "NinjaTrader", file: "ready", export: "Executions or Trades grid" },
  metatrader: { name: "MetaTrader 4 / 5", file: "ready", export: "account history report" },
  ctrader: { name: "cTrader", file: "ready", export: "history statement" },
  "interactive-brokers": { name: "Interactive Brokers", file: "ready", export: "Flex Query report" },
  dxtrade: { name: "DXtrade", file: "columns", export: "trade history" },
  tradelocker: { name: "TradeLocker", file: "firm", export: "statement from your firm, if offered" }, // TradeLocker has no CSV export of its own
  "match-trader": { name: "Match-Trader", file: "columns", export: "trade history" },
  tradingview: { name: "TradingView", file: "columns", export: "paper trading history" },
};

export const GROUPS = [
  {
    key: "futures", title: "Futures prop firms", short: "Futures",
    firms: [
      { slug: "topstep", name: "Topstep", on: ["topstepx"] },
      { slug: "apex", name: "Apex Trader Funding", on: ["tradovate", "rithmic"] },
      { slug: "tradeify", name: "Tradeify", on: ["tradovate", "rithmic"] },
      { slug: "myfundedfutures", name: "MyFundedFutures", on: ["tradovate"] },
      { slug: "take-profit-trader", name: "Take Profit Trader", on: ["tradovate"] },
      { slug: "lucid", name: "Lucid Trading", on: ["tradovate", "rithmic"] },
      { slug: "tradeday", name: "TradeDay", on: ["tradovate", "rithmic"] },
      { slug: "elite-trader-funding", name: "Elite Trader Funding", on: ["tradovate", "rithmic"] },
      { slug: "phidias", name: "Phidias", on: ["tradovate", "rithmic"] },
      { slug: "earn2trade", name: "Earn2Trade", on: ["tradovate", "rithmic"] },
      { slug: "bulenox", name: "Bulenox", on: ["rithmic"] },
      { slug: "funded-futures-network", name: "Funded Futures Network", on: ["rithmic"] },
    ],
  },
  {
    key: "forex", title: "Forex and CFD prop firms", short: "Forex & CFD",
    firms: [
      { slug: "ftmo", name: "FTMO", on: ["metatrader", "ctrader"] },
      { slug: "fundednext", name: "FundedNext", on: ["metatrader", "match-trader"] },
      { slug: "the5ers", name: "The5ers", on: ["metatrader", "ctrader"] },
      { slug: "e8", name: "E8 Markets", on: ["metatrader", "tradelocker"] },
      { slug: "fundingpips", name: "FundingPips", on: ["metatrader", "ctrader", "match-trader"] },
      { slug: "fxify", name: "FXIFY", on: ["metatrader", "dxtrade"] },
      { slug: "goat", name: "Goat Funded Trader", on: ["metatrader", "ctrader", "tradelocker"] },
      { slug: "aqua", name: "Aqua Funded", on: ["metatrader", "match-trader"] },
      { slug: "for-traders", name: "For Traders", on: ["metatrader", "ctrader", "dxtrade", "match-trader"] },
      { slug: "alpha-capital", name: "Alpha Capital Group", on: ["metatrader", "ctrader", "dxtrade", "tradelocker"] },
    ],
  },
  {
    key: "platforms", title: "Platforms and brokers", short: "Platforms",
    firms: [
      { slug: "tradovate", name: "Tradovate", on: ["tradovate"] },
      { slug: "ninjatrader", name: "NinjaTrader", on: ["ninjatrader"] },
      { slug: "rithmic", name: "Rithmic", on: ["rithmic"] },
      { slug: "amp", name: "AMP Futures", on: ["rithmic"] },
      { slug: "interactive-brokers", name: "Interactive Brokers", on: ["interactive-brokers"] },
      { slug: "metatrader", name: "MetaTrader", on: ["metatrader"] },
      { slug: "ctrader", name: "cTrader", on: ["ctrader"] },
      { slug: "dxtrade", name: "DXtrade", on: ["dxtrade"] },
      { slug: "tradelocker", name: "TradeLocker", on: ["tradelocker"] },
      { slug: "match-trader", name: "Match-Trader", on: ["match-trader"] },
      { slug: "tradingview", name: "TradingView", on: ["tradingview"] },
    ],
  },
];

export const ALL = GROUPS.flatMap((g) => g.firms.map((f) => ({ ...f, group: g.key })));

export const LINES = {
  today: "Upload the export from your platform and Marble pairs every fill into trades, with the fees the file holds, and skips any it already has.",
  small: "Names and logos belong to their owners. Marble isn't affiliated with or endorsed by any firm or platform shown.",
};

