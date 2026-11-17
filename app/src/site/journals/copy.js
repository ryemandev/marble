// /free-trading-journal: what each free trading journal gives for nothing. Every row is read from the company's own
// pricing page (TraderSync's refuses a plain read, so its row comes from an archived copy). Re-check them when CHECKED moves.
export const CHECKED = "6 November 2026";

export const JOURNALS = [
  { name: "Marble", free: "Free forever", capped: "Nothing. Every feature, no plans", paid: "Never", ours: true },
  { name: "Stonk Journal", free: "Free forever", capped: "No trade limit. CSV import is paid", paid: "$10 a month", src: "https://stonkjournal.com/" },
  { name: "TradesViz", free: "Free forever", capped: "Stocks only, 1 account, 3,000 executions a month", paid: "About $15 a month", src: "https://www.tradesviz.com/free-trading-journal/" },
  { name: "Trademetria", free: "Free plan", capped: "30 imported orders a month, 1 account", paid: "$19.95 a month", src: "https://trademetria.com/pricing" },
  { name: "Tradervue", free: "Not on its pricing page", capped: "Trial on paid plans", paid: "$29.95 a month", src: "https://www.tradervue.com/site/pricing/" },
  { name: "TraderSync", free: "7-day trial", capped: "Paid after the trial", paid: "$29.95 a month", src: "https://tradersync.com/pricing/" },
  { name: "TradeZella", free: "None listed", capped: "No free plan", paid: "$35 a month", src: "https://www.tradezella.com/pricing" },
  { name: "Edgewonk", free: "None, 14-day refund", capped: "No free plan", paid: "$35 a month or $197 a year", src: "https://edgewonk.com/pricing" },
];

// The home page and /pricing: each company's lowest monthly price, with what its free offer is so the bar isn't the whole story
export const COSTS = [
  { name: "TradeZella", note: "No free plan", month: 35, price: "$35" },
  { name: "Edgewonk", note: "No free plan", month: 35, price: "$35" },
  { name: "TraderSync", note: "7-day trial", month: 29.95, price: "$29.95" },
  { name: "Tradervue", note: "Trial on paid plans", month: 29.95, price: "$29.95" },
  { name: "Trademetria", note: "Free plan: 30 orders a month", month: 19.95, price: "$19.95" },
  { name: "TradesViz", note: "Free plan: stocks, 1 account", month: 15, price: "About $15" },
  { name: "Stonk Journal", note: "Free plan: no CSV import", month: 10, price: "$10" },
];

export const CHECKS = [
  ["The cap", "A limit on trades or accounts bites as soon as you run more than one account, and prop traders often do. Check the limit against a busy month, not a quiet one."],
  ["The way in", "Check whether importing your platform's file is free, or only typing trades by hand. Some journals keep the import on a paid plan."],
  ["The way out", "Check you can take your whole record with you. In Marble, one zip holds your data, a spreadsheet of your trades and every photo."],
];

export const FAQ = [
  { q: "Is there a completely free trading journal?", a: "Yes. Marble is free forever with every feature in it, and there's no card, trial or plan to choose. Stonk Journal also has a free plan with no trade limit, and charges $10 a month for CSV import." },
  { q: "Is a free trading journal as good as a paid one?", a: "It depends on what you'd be paying for. Paid journals often charge for live broker links and trade replay. If you're happy to import a file or log trades by hand, a free journal can hold your whole record." },
  { q: "Is a spreadsheet enough for a trading journal?", a: "It can be, and it's free. A spreadsheet takes more upkeep: you build the formulas, the calendar and the stats yourself, and a prop account's rules and limits are yours to track by hand." },
  { q: "What should a free trading journal for prop firms include?", a: "More than one account, your firm's rules, and what you've spent against what you've been paid. Marble holds the rules for 22 prop firms and shows your fees against your payouts, all free." },
  { q: "Will Marble stay free?", a: "Yes. Marble is free forever, with every feature in it. If it ever closes, you'll get at least 60 days' notice and we'll email you your data, or a link to download it." },
  { q: "How does Marble make money?", a: "It doesn't yet. We plan to earn from prop firm affiliate codes: if you use one of our codes at a firm, the firm pays us a commission. Using one is up to you, and your journal isn't for sale." },
];
