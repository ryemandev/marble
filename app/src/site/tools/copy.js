export const TOOLS = [
  { slug: "prop-firm-rules", name: "Prop firm rules compared", short: "Compare firm rules" },
  { slug: "drawdown-calculator", name: "Drawdown calculator", short: "Drawdown calculator" },
  { slug: "position-size-calculator", name: "Position size calculator", short: "Position size calculator" },
];

export const COMPARE = {
  h1: ["Prop firm rules,", "side by side."],
  lede: "Pick up to three firms and account sizes and see their daily loss limits, drawdowns, profit targets, consistency rules, minimum days and contract limits next to each other, each from the firm's own pages with the day it was checked.",
  faq: [
    { q: "Where do these rules come from?", a: "From each firm's own website, help centre and terms, read on the date shown beside it. Where a firm's pages disagree or don't publish a rule, the table says so instead of guessing. Firms change rules often, so the firm's own dashboard always has the final word." },
    { q: "What's the difference between an end-of-day and an intraday trailing drawdown?", a: "An end-of-day drawdown moves up only with your closing balance each day. An intraday one follows your highest balance during the day, and at some firms your highest open profit while a trade is still running, so the floor can rise during a trade that later gives the profit back." },
    { q: "What is a consistency rule?", a: "A cap on how much of your total profit one day may be. With a 50% rule, a $1,500 best day needs at least $3,000 of total profit. At some firms it applies to passing the evaluation; at others to each payout." },
  ],
};

export const DRAWDOWN = {
  h1: ["How many losses", "until you breach?"],
  lede: "Enter your account and what a losing trade costs you, or pick your firm's plan, and see how many losses in a row reach the drawdown floor and the daily loss limit, with the balance after each one.",
  faq: [
    { q: "Why does a loss that lands exactly on the floor count?", a: "Firms treat touching the floor as reaching it: the account fails, or the day ends, at the floor itself, not below it." },
    { q: "Does a trailing drawdown move down after a loss?", a: "No. A trailing floor only ever moves up, with your highest balance (or highest end-of-day balance), until it stops where the firm says, often at the starting balance. Losses bring the balance closer to it; they never lower it." },
    { q: "Why might my firm's figure be tighter than this?", a: "Most firms count open positions as they happen, and some trail your highest open profit during a trade. This works from closed losses of a fixed size, so it's the best case; your firm's dashboard has the exact figure." },
  ],
};

export const SIZER = {
  h1: ["Position size,", "worked out."],
  lede: "Choose the market, the dollars you're prepared to lose on the trade and where your stop is, and see how many contracts or lots that comes to, what the loss is at the stop, and how it sits against your firm's contract limit.",
  faq: [
    { q: "How is the size worked out?", a: "The stop distance in ticks (or pips) times what one tick is worth for one contract gives the loss per contract at the stop. The dollars you set, divided by that, rounded down to whole contracts (or to 0.01 lots), is the size." },
    { q: "Do micros count against my firm's contract limit?", a: "At most futures firms ten micros count as one mini (Topstep, Apex and many others). Some firms set separate micro limits. Your firm's rules say which." },
    { q: "Are commissions included?", a: "No. Commissions and slippage add to the loss at the stop, and most firms count fees against your limits, so the real loss at the stop is a little more than shown." },
  ],
};

export const BY_SLUG = { "prop-firm-rules": COMPARE, "drawdown-calculator": DRAWDOWN, "position-size-calculator": SIZER };
