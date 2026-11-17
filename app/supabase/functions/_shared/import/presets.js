export const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Whether a header (or any of its alternatives) is in the file
const hasOne = (headers, n) => {
  if (n && typeof n === "object" && !Array.isArray(n)) {
    if (n.match) return headers.some((h) => new RegExp(n.match, "i").test(String(h).trim()));
    if (n.nth) return headers.filter((h) => norm(h) === norm(n.nth[0])).length >= n.nth[1];
  }
  return [].concat(n).some((alt) => headers.some((h) => norm(h) === norm(alt)));
};
const has = (headers, ...names) => names.every((n) => hasOne(headers, n));

export const FIELDS = {
  fills: [
    ["time", "Time", true], ["symbol", "Symbol", true], ["side", "Buy or sell", false], ["qty", "Quantity", true], ["price", "Price", true],
    ["commission", "Commission", false], ["id", "Fill id", false], ["account", "Account", false], ["effect", "Entry or exit", false],
    ["pnl", "Realised P&L", false], ["multiplier", "Multiplier", false],
    ["maker", "Maker or taker", false, "crypto"], ["funding", "Funding", false, "crypto"], ["leverage", "Leverage", false, "crypto"], ["liqPrice", "Liquidation price", false, "crypto"],
  ],
  roundtrip: [
    ["symbol", "Symbol", true], ["side", "Long or short", true], ["qty", "Quantity", true], ["entryPrice", "Entry price", true], ["exitPrice", "Exit price", true],
    ["entryTime", "Entry time", true], ["exitTime", "Exit time", false], ["pnl", "P&L", false], ["commission", "Commission", false],
    ["stop", "Stop", false], ["id", "Trade id", false], ["account", "Account", false],
    ["multiplier", "Multiplier", false],
    ["funding", "Funding", false, "crypto"], ["leverage", "Leverage", false, "crypto"], ["liqPrice", "Liquidation price", false, "crypto"],
    ["feeMaker", "Maker fees", false, "crypto"], ["feeTaker", "Taker fees", false, "crypto"],
  ],
  funding: [["time", "Time", true], ["symbol", "Symbol", true], ["amount", "Amount", true], ["id", "Payment id", false], ["account", "Account", false]],
};

export const CRYPTO_TEMPLATE_HEADERS = ["Opened (UTC)", "Closed (UTC)", "Symbol", "Side", "Quantity", "Entry price", "Exit price", "Fees", "Funding", "Leverage", "Liquidation price", "Realised P&L", "Notes"];
export const CRYPTO_TEMPLATE_CSV = [
  CRYPTO_TEMPLATE_HEADERS.join(","),
  "2026-10-27 09:30:00,2026-10-27 11:05:00,BTCUSDT,Long,0.05,67250.5,67980,2.71,-0.42,10,61200,,Example: Realised P&L left blank is worked out from the prices",
  "2026-10-28 14:00:00,2026-10-29 02:15:00,ETHUSDT,Short,1.2,3550,3502.25,1.88,0.65,5,,57.30,Example: funding received while short",
].join("\n") + "\n";

export const STABLE = /^(USDT|USDC|USD|BUSD|FDUSD)$/i;
const NOT_STABLE = "^(?!(usdt|usdc|usd|busd|fdusd)$).+";

export const PRESETS = [
  {
    id: "tradovate-performance", name: "Tradovate · Performance", shape: "pairs",
    detect: (h) => (has(h, "buyFillId", "sellFillId", "boughtTimestamp", "soldTimestamp") ? 10 : 0),
    fields: { symbol: "symbol", qty: "qty", buyPrice: "buyPrice", sellPrice: "sellPrice", buyTime: "boughtTimestamp", sellTime: "soldTimestamp", buyId: "buyFillId", sellId: "sellFillId" },
    note: "Tradovate's Performance report has no commissions.",
  },
  {
    id: "tradovate-orders", name: "Tradovate · Orders", shape: "fills",
    detect: (h) => (has(h, ["orderId", "Order ID"], "B/S", "Contract", ["avgPrice", "Avg Fill Price"], ["Fill Time", "Timestamp"]) ? 9 : 0),
    fields: { time: ["Fill Time", "Timestamp"], symbol: "Contract", side: "B/S", qty: ["filledQty", "Filled Qty"], price: ["avgPrice", "Avg Fill Price"], id: ["orderId", "Order ID"], account: "Account" },
    keep: { column: "Status", match: "fill" }, // only filled orders are executions
    note: "Tradovate's Orders export has no commissions.",
  },
  {
    id: "topstepx", name: "TopstepX · Trades", shape: "roundtrip", pnlIs: "gross", tz: "UTC",
    detect: (h) => (has(h, "ContractName", "EnteredAt", "ExitedAt", "EntryPrice", "ExitPrice") ? 9 : 0),
    fields: { symbol: "ContractName", side: "Type", qty: "Size", entryPrice: "EntryPrice", exitPrice: "ExitPrice", entryTime: "EnteredAt", exitTime: "ExitedAt", pnl: "PnL", commission: { sum: ["Fees", "Commissions"] }, id: "Id" },
  },
  {
    id: "rithmic", name: "Rithmic R | Trader Pro · Order History", shape: "fills", tzFromHeader: true,
    detect: (h) => (has(h, "Buy/Sell", "Symbol", "Avg Fill Price", { match: "^update time" }) ? 8 : 0),
    fields: { time: { match: "^update time" }, symbol: "Symbol", side: "Buy/Sell", qty: "Qty Filled", price: "Avg Fill Price", id: "Order Number", account: "Account", commissionRate: "Commission Fill Rate" },
    keep: { column: "Status", match: "fill", optional: true },
    mustHave: ["qty", "id"],
    hint: "In R | Trader Pro, show the Qty Filled and Order Number columns in Order History, then export again.",
  },
  {
    id: "ninjatrader-executions", name: "NinjaTrader 8 · Executions", shape: "fills",
    detect: (h) => (has(h, "Instrument", "Action", "Quantity", "Price", "Time", "E/X") ? 9 : 0),
    fields: { time: "Time", symbol: "Instrument", side: "Action", qty: "Quantity", price: "Price", commission: "Commission", id: "ID", account: "Account", effect: "E/X" },
  },
  {
    id: "ninjatrader-trades", name: "NinjaTrader 8 · Trades", shape: "roundtrip", pnlIs: "gross",
    detect: (h) => (has(h, "Instrument", "Market pos.", "Entry price", "Exit price", "Entry time", "Exit time") ? 9 : 0),
    fields: { symbol: "Instrument", side: "Market pos.", qty: "Qty", entryPrice: "Entry price", exitPrice: "Exit price", entryTime: "Entry time", exitTime: "Exit time", pnl: "Profit", commission: { sum: ["Commission", "Clearing Fee", "Exchange Fee", "IP Fee", "NFA Fee"] }, account: "Account" },
  },
  {
    id: "mt5-deals", name: "MetaTrader 5 · History (Deals)", shape: "fills", feesSigned: true, serverTime: true,
    detect: (h) => (has(h, "Time", "Deal", "Symbol", "Type", "Direction", "Volume", "Price", "Profit") ? 9 : 0),
    fields: { time: "Time", symbol: "Symbol", side: "Type", qty: "Volume", price: "Price", id: "Deal", effect: "Direction", commission: { sum: ["Commission", "Swap"] }, pnl: "Profit" },
    keep: { column: "Type", match: "^(buy|sell)$" }, // not balance, credit or deposit rows
  },
  {
    id: "mt4-statement", name: "MetaTrader 4 · Detailed Statement", shape: "roundtrip", pnlIs: "gross", feesSigned: true, serverTime: true,
    detect: (h) => (has(h, "Ticket", "Open Time", "Type", "Size", "Item", "Close Time", { nth: ["Price", 2] }) ? 9 : 0),
    fields: { id: "Ticket", entryTime: "Open Time", side: "Type", qty: "Size", symbol: "Item", entryPrice: { nth: ["Price", 1] }, stop: "S / L", exitTime: "Close Time", exitPrice: { nth: ["Price", 2] }, commission: { sum: ["Commission", "Taxes", "Swap"] }, pnl: "Profit" },
    keep: { column: "Type", match: "^(buy|sell)$" }, // not balance rows or cancelled pending orders
  },
  {
    id: "ctrader", name: "cTrader · Statement", shape: "roundtrip", pnlIs: "net", feesSigned: true,
    detect: (h) => (has(h, "Opening Time", "Closing Time", "Entry Price", "Closing Price", "Opening Direction") ? 9 : 0),
    fields: { entryTime: "Opening Time", exitTime: "Closing Time", entryPrice: "Entry Price", exitPrice: "Closing Price", symbol: "Symbol", side: "Opening Direction", id: "Order ID", qty: "Closing Quantity", commission: { sum: ["Commission", "Swap"] }, pnl: { match: "^net [a-z]{3}$" } },
  },
  {
    id: "ibkr-flex", name: "Interactive Brokers · Flex Query", shape: "fills", feesSigned: true,
    detect: (h) => (has(h, "Symbol", "DateTime", "Buy/Sell", "Quantity", ["TradePrice", "Price"]) ? 9 : 0),
    fields: { time: "DateTime", symbol: "Symbol", side: "Buy/Sell", qty: "Quantity", price: ["TradePrice", "Price"], commission: ["IBCommission", "Commission"], account: "ClientAccountID", id: ["TradeID", "IBExecID", "TransactionID"], multiplier: "Multiplier", effect: ["Open/CloseIndicator", "Open/Close"] },
  },

  {
    id: "bybit-translog", name: "Bybit · Transaction Log (also Demo Trading)", shape: "fills", world: "crypto",
    tz: "UTC", tzFromHeader: true, linear: true, pnlIs: "gross", feesSigned: true, feeSignFrom: { total: "Change", parts: ["Cash Flow", "Funding"] },
    detect: (h) => (has(h, "Contract", "Direction", "Filled Price", "Fee Paid", "Cash Flow", "Wallet Balance") ? 9 : 0),
    // "Time", "Time(UTC)", or any zone the file names after it
    fields: { time: { match: "^time\\s*(\\(.*\\))?$" }, symbol: "Contract", side: "Direction", qty: "Quantity", price: "Filled Price", commission: "Fee Paid", id: "Trade ID" },
    keep: { column: "Type", match: "^(trade|liquidation|adl|delivery)$" }, // not transfers, bonuses or interest
    fundingRows: { column: "Type", match: "^settlement$", amount: "Funding" },
    liquidation: { column: "Type", match: "^(liquidation|adl)$" },
    skip: [{ column: "Currency", match: NOT_STABLE, reason: "Not in USDT or USDC (an inverse contract, or the coin side of a spot trade): Marble reads USDT and USDC trades only" }],
    note: "Times are UTC. Funding in the file is added to the trade it was paid on.",
  },
  {
    id: "binance-futures-trades", name: "Binance · USDⓈ-M Futures Trade History", shape: "fills", world: "crypto",
    tz: "UTC", tzFromHeader: true, linear: true, pnlIs: "gross", feeSign: "cost", feeCoin: "Fee Coin",
    detect: (h) => (has(h, "Date(UTC)", "Symbol", "Side", "Price", "Quantity", "Realized Profit") ? 9 : 0),
    fields: { time: "Date(UTC)", symbol: "Symbol", side: "Side", qty: "Quantity", price: "Price", commission: "Fee", pnl: "Realized Profit", id: ["Trade ID", "TradeId"] },
    skip: [{ column: "Symbol", match: "USD_(PERP|\\d{6})$", reason: "A COIN-M contract: its P&L is in coin, which Marble doesn't read yet" }],
    note: "Funding isn't in this file: import Binance's Futures Transaction History as well.",
  },
  {
    id: "binance-futures-funding", name: "Binance · Futures Transaction History (funding)", shape: "funding", world: "crypto",
    tz: "UTC", tzFromHeader: true,
    detect: (h) => (has(h, "Date(UTC)", "type", "Amount", "Asset", "Symbol", "Transaction ID") ? 9 : 0),
    fields: { time: "Date(UTC)", symbol: "Symbol", amount: "Amount", id: "Transaction ID" },
    keep: { column: "type", match: "^funding_fee$" },
    skip: [{ column: "Asset", match: NOT_STABLE, reason: "Funding paid in coin (a COIN-M contract): Marble reads USDT and USDC only" }],
    note: "Funding is added to the Binance trades already in this account.",
  },
  {
    id: "okx-positions", name: "OKX · Position history", shape: "roundtrip", world: "crypto",
    tzFromHeader: true, linear: true, pnlIs: "gross", feesSigned: true,
    detect: (h) => (has(h, { match: "^position create time" }, "Instrument Name", "Average Open Price", "Average Close Price", "Funding Fee") ? 9 : 0),
    fields: {
      symbol: "Instrument Name", side: "Direction", qty: ["Total Close Quantity", "Max Position Quantity"], entryPrice: "Average Open Price", exitPrice: "Average Close Price",
      entryTime: { match: "^position create time" }, exitTime: { match: "^position update time" }, pnl: "Pnl", commission: { sum: ["Fee", "Liquidation Clearance Fee"] },
      funding: "Funding Fee", leverage: "Leverage", multiplier: { product: ["Contract Face Value", "Contract Multiplier"] },
    },
    stillOpen: { closed: "Total Close Quantity", max: "Max Position Quantity" },
    liquidation: { column: "Type", match: "liquidat|adl|deleverag" },
    skip: [{ column: "Instrument Name", match: "^[a-z0-9]+-usd-(swap|\\d{6})$", reason: "A coin-margined contract: its P&L is in coin, which Marble doesn't read yet" }],
    note: "Choose UTC as the time zone when you download it from OKX.",
  },
  {
    id: "crypto-template", name: "Marble crypto template", shape: "roundtrip", world: "crypto",
    tz: "UTC", linear: true, pnlIs: "gross", feeSign: "cost",
    detect: (h) => (has(h, "Opened (UTC)", "Closed (UTC)", "Symbol", "Side", "Entry price", "Exit price") ? 10 : 0),
    fields: {
      entryTime: "Opened (UTC)", exitTime: "Closed (UTC)", symbol: "Symbol", side: "Side", qty: "Quantity", entryPrice: "Entry price", exitPrice: "Exit price",
      commission: "Fees", funding: "Funding", leverage: "Leverage", liqPrice: "Liquidation price", pnl: ["Realised P&L", "Realized P&L"],
    },
  },
  { id: "generic-roundtrip", name: "Other platform · one row per trade", shape: "roundtrip", generic: true, pnlIs: "gross", detect: (h) => (guess(h, "entryPrice") && guess(h, "exitPrice") ? 2 : 0) },
  { id: "generic-fills", name: "Other platform · one row per fill", shape: "fills", generic: true, detect: (h) => (guess(h, "price") && guess(h, "qty") && guess(h, "symbol") ? 1 : 0) },
];

const SYNONYMS = {
  time: ["time", "date/time", "datetime", "timestamp", "fill time", "filled at", "execution time", "exec time", "trade time", "date time", "transaction time", "executed at", "created at"],
  date: ["date", "trade date", "fill date", "execution date"],
  symbol: ["symbol", "instrument", "contract", "ticker", "contract name", "product", "market", "security", "root", "item"],
  side: ["side", "action", "b/s", "buy/sell", "direction", "bs", "market pos.", "long/short", "trade type", "type"],
  qty: ["qty", "quantity", "size", "contracts", "filled qty", "filledqty", "qty filled", "shares", "lots", "volume", "amount", "filled"],
  price: ["price", "fill price", "avg price", "avgprice", "avg fill price", "execution price", "exec price", "t. price", "trade price", "tradeprice", "average price"],
  commission: ["commission", "commissions", "comm", "comm/fee", "fees", "fee", "total fees", "total commission"],
  id: ["fill id", "execution id", "exec id", "trade id", "fillid", "id", "order id", "orderid", "order number", "ticket", "deal"],
  account: ["account", "account name", "account id", "acct"],
  effect: ["e/x", "entry/exit", "open/close", "effect", "position effect"],
  entryPrice: ["entry price", "entryprice", "open price", "avg entry", "avg entry price", "entry"],
  exitPrice: ["exit price", "exitprice", "close price", "closing price", "avg exit", "avg exit price", "exit"],
  entryTime: ["entry time", "entrytime", "open time", "opening time", "opened", "entered at", "enteredat", "entry date", "open date", "opened at", "entry date/time"],
  exitTime: ["exit time", "exittime", "close time", "closing time", "closed", "exited at", "exitedat", "exit date", "close date", "closed at", "exit date/time"],
  pnl: ["pnl", "p&l", "profit", "net pnl", "gross pnl", "realized pnl", "realized p&l", "profit/loss", "net profit", "pl", "p/l", "realized"],
  stop: ["stop", "stop loss", "s/l", "sl", "stop price"],
};
export function guess(headers, field) {
  for (const s of SYNONYMS[field] || []) {
    const h = headers.find((x) => norm(x) === norm(s));
    if (h) return h;
  }
  return null;
}

// How well a preset fits these headers (0 is not at all)
export const scoreOf = (preset, headers) => preset.detect(headers);

// The preset that best fits these headers
export function detect(headers) {
  let best = null, score = 0;
  for (const p of PRESETS) {
    const s = p.detect(headers);
    if (s > score) { best = p; score = s; }
  }
  return best || PRESETS.find((p) => p.id === "generic-fills");
}
export const bestScore = (headers) => Math.max(0, ...PRESETS.map((p) => p.detect(headers)));

const CRYPTO_OPTIONS = ["world", "linear", "feeSign", "feeSignFrom", "feeCoin", "fundingRows", "liquidation", "skip", "stillOpen", "makerOf"];

export function mappingFor(preset, headers) {
  const base = { preset: preset.id, shape: preset.shape, keep: preset.keep || null, pnlIs: preset.pnlIs || "gross", feesSigned: !!preset.feesSigned, mustHave: preset.mustHave || [], hint: preset.hint || null };
  for (const k of CRYPTO_OPTIONS) if (preset[k] != null) base[k] = preset[k];
  if (!preset.generic) return { ...base, fields: { ...preset.fields } };
  const fields = {};
  for (const [f] of FIELDS[preset.shape]) {
    const h = guess(headers, f);
    if (h) fields[f] = h;
  }
  if (preset.shape === "fills") {
    // A date column and a separate time column
    const d = guess(headers, "date");
    if (d && fields.time && d !== fields.time) fields.time = { join: [d, fields.time] };
    else if (!fields.time && d) fields.time = d;
    if (fields.side && fields.side === fields.effect) delete fields.effect;
    if (fields.pnl) delete fields.pnl;
  }
  return { ...base, fields };
}

export const mappingKey = (preset, headers) => (preset.generic ? `cols:${headers.map(norm).join("|")}`.slice(0, 300) : preset.id);

export const presetById = (id) => PRESETS.find((p) => p.id === id);
