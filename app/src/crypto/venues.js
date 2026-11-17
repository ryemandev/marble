export const CRYPTO_GROUPS = [
  {
    key: "exchanges", title: "Exchanges",
    firms: [
      { slug: "bybit", name: "Bybit", how: "file", reads: "File export", hint: "Includes Bybit Demo Trading", exportHint: "Assets → Unified Trading Account → History Records → Transaction Log → Export (for Demo Trading, switch to Demo first)." },
      { slug: "binance", name: "Binance", how: "file", reads: "File export", hint: "USD-M futures", exportHint: "Orders → Futures Order → USD-M → Trade History → Export (\"Beyond 3 months – Custom\" for older trades)." },
      { slug: "okx", name: "OKX", how: "file", reads: "File export", hint: "Position history", exportHint: "Assets → Order center → Position history → Download, as CSV in UTC." },
    ],
  },
  {
    key: "onchain", title: "On-chain",
    firms: [
      { slug: "hyperliquid", name: "Hyperliquid", how: "wallet", reads: "Public wallet address", hint: "Read-only, no key" },
    ],
  },
  {
    key: "crypto-prop", title: "Crypto prop firms",
    firms: [
      { slug: "hyrotrader", name: "HyroTrader", how: "file", reads: "Bybit Demo export", hint: "Or Marble's template", exportHint: "From your linked Bybit Demo account: Assets → Unified Trading Account → History Records → Transaction Log → Export (for Demo Trading, switch to Demo first)." },
      { slug: "breakout", name: "Breakout", how: "template", reads: "Marble's template" },
      { slug: "kraken-prop", name: "Kraken Prop", how: "template", reads: "Marble's template", hint: "Not offered in the UK", logo: "kraken" },
      { slug: "bitfunded", name: "BitFunded", how: "template", reads: "Marble's template" },
      { slug: "propr", name: "Propr", how: "template", reads: "Marble's template" },
      { slug: "carrot-funding", name: "Carrot Funding", how: "template", reads: "Marble's template" },
      { slug: "klein-funding", name: "Klein Funding", how: "file", reads: "Bybit export", hint: "Or Marble's template", exportHint: "From your linked Bybit account: Assets → Unified Trading Account → History Records → Transaction Log → Export (for Demo Trading, switch to Demo first)." },
      { slug: "fundedbit", name: "Fundedbit", how: "file", reads: "Bybit export", exportHint: "From your linked Bybit account: Assets → Unified Trading Account → History Records → Transaction Log → Export (for Demo Trading, switch to Demo first)." },
      { slug: "tradeify-crypto", name: "Tradeify Crypto", how: "template", reads: "Marble's template" },
      { slug: "ftmo", name: "FTMO", how: "markets-file", reads: "MetaTrader or cTrader export", hint: "Crypto CFDs" },
      { slug: "fxify", name: "FXIFY", how: "markets-file", reads: "MetaTrader export", hint: "Crypto CFDs" },
      { slug: "fundednext", name: "FundedNext", how: "markets-file", reads: "MetaTrader export", hint: "Crypto CFDs" },
    ],
  },
];

export const CRYPTO_FIRMS = CRYPTO_GROUPS.flatMap((g) => g.firms.map((f) => ({ ...f, group: g.key, groupTitle: g.title })));
const BY_SLUG = Object.fromEntries(CRYPTO_FIRMS.map((f) => [f.slug, f]));
export const cryptoFirmOf = (slug) => (slug && BY_SLUG[slug]) || null;

// The short names traders type
export const CRYPTO_ALIASES = {
  bybit: ["bybit demo", "by bit"],
  binance: ["binance futures", "bnb"],
  okx: ["okex"],
  hyperliquid: ["hl", "hype", "hyper liquid"],
  hyrotrader: ["hyro", "hyro trader"],
  breakout: ["breakout prop", "breakoutprop"],
  "kraken-prop": ["kraken"],
  "carrot-funding": ["carrot"],
  "klein-funding": ["klein", "cleo"],
  "tradeify-crypto": ["tradeify"],
};

export const QUOTES = ["USDT", "USDC", "USD"];
