---
title: "How to Calculate R Multiple (With Futures Examples)"
description: "R multiple is your result divided by your planned risk. The formula, worked NQ and MNQ examples, expectancy, and why traders use R alongside P&L."
slug: how-to-calculate-r-multiple
date: 2026-10-29
updated: 2026-10-29
author: Marble
keywords: ["how to calculate r multiple", "r multiple trading", "r multiple formula", "what is 1r in trading", "expectancy in r"]
related: ["what-is-expectancy-in-trading", "what-is-profit-factor", "how-to-review-your-trades-weekly", "prop-firm-evaluation-journal"]
faq:
  - q: "Is an R multiple the same as a risk-reward ratio?"
    a: "No. Risk-reward is what you plan before the trade, such as aiming for 2:1. The R multiple is what actually happened, measured against the risk you took. A 2:1 plan can end at +2R, −1R or anything in between."
  - q: "Can I calculate R without a stop?"
    a: "Not honestly. R needs a planned risk. If you trade without a hard stop, write down the price where you'd be wrong before you enter, and use that."
  - q: "What is a good R multiple?"
    a: "There's no single figure. A single trade's R means little; what tells you something is the average R across many trades, which depends on both your win rate and the size of your wins and losses."
---

An R multiple is a trade's result divided by the amount you planned to risk on it. For a long trade, **R = (exit − entry) ÷ (entry − stop)**; for a short, **R = (entry − exit) ÷ (stop − entry)**. A trade that risks $200 and makes $500 is +2.5R, and one stopped out as planned is −1R. Because R measures every trade against its own risk, it puts a one-lot trade and a ten-lot trade on the same scale.

## What is 1R?

**1R is your initial risk on the trade:** the money you'd lose if your original stop were hit.

> 1R = distance from entry to stop × value of one point × number of contracts

Then:

> R multiple = result ÷ 1R

Two rules make the number meaningful:

- **Use the initial stop,** the one you set at entry, not where you moved it later.
- **Measure the result the same way every time,** either before fees (gross) or after them (net). More on that below.

## Point values for common futures contracts

To turn points into money, you need what one point is worth.

| Contract | Value of 1 point | Minimum tick (0.25) |
|---|---|---|
| NQ (E-mini Nasdaq-100) | $20 | $5.00 |
| MNQ (Micro E-mini Nasdaq-100) | $2 | $0.50 |
| ES (E-mini S&P 500) | $50 | $12.50 |
| MES (Micro E-mini S&P 500) | $5 | $1.25 |

For other contracts, check the exchange's contract specifications.

You don't strictly need point values to work out R, because they cancel out. They matter when you want R from a P&L figure, or 1R in money.

## Worked example: a long NQ trade

You buy **1 NQ at 21,000.00** with a stop at **20,980.00**, and exit at **21,050.00**. (Prices are for illustration.)

1. **Risk in points:** 21,000.00 − 20,980.00 = 20 points
2. **1R in money:** 20 × $20 × 1 = **$400**
3. **Result in points:** 21,050.00 − 21,000.00 = 50 points
4. **Result in money:** 50 × $20 = **$1,000**
5. **R multiple:** $1,000 ÷ $400 = **+2.5R** (or 50 ÷ 20 in points)

## The same trade on MNQ

Now take the same prices with **3 MNQ**:

- 1R = 20 points × $2 × 3 = **$120**
- Result = 50 points × $2 × 3 = **$300**
- R multiple = $300 ÷ $120 = **+2.5R**

The dollars are very different, but the R is identical. That's the point: when you move between micros and minis, or change size, your results stay comparable.

## Worked example: a short with slippage

You sell **1 NQ at 21,000.00** with a stop at **21,012.50**: 12.5 points, so 1R = 12.5 × $20 = **$250**. The market rallies and your stop fills at **21,014.00**.

- Result = 21,000.00 − 21,014.00 = −14 points = −$280
- R multiple = −$280 ÷ $250 = **−1.12R**

That extra −0.12R is slippage. A journal in R shows it straight away; in dollars it's easy to miss.

## Why traders use R alongside P&L

**It removes size.** If you traded 1 contract last month and 3 this month, comparing dollars tells you more about size than skill. R compares like with like.

**It shows whether losses are controlled.** If your losses cluster around −1R, your stops are doing their job. Losses at −1.8R or −2.5R mean moved stops, no stop or heavy slippage, and they stand out instantly.

**It lets you measure expectancy.** Expectancy is your average R per trade:

> Expectancy = (win rate × average win in R) − (loss rate × average loss in R)

Say a setup has 40 trades: 16 winners averaging +2.1R and 24 losers averaging −0.9R.

- 0.40 × 2.1 = 0.84
- 0.60 × 0.9 = 0.54
- Expectancy = 0.84 − 0.54 = **+0.30R per trade**, or +12R over the 40 trades

Measured this way, two setups can be compared even if you traded them at different sizes. There's more on this in [what is expectancy in trading](/guides/what-is-expectancy-in-trading/), and on its partner measure in [what is profit factor](/guides/what-is-profit-factor/).

**It connects to prop-firm limits.** If your firm's daily loss limit is $1,000 and your usual 1R is $250, the limit is 4R: four full losses in a day. Seeing limits in R makes them concrete. (Figures are for illustration; check your firm's current rules.)

## Common mistakes when calculating R

- **Using the moved stop.** If you moved your stop to breakeven, the trade's risk didn't become zero. Always use the stop you started with.
- **No stop at all.** Without a planned stop, there's no 1R. Write down where you'd be wrong before you enter.
- **Mixing gross and net.** Fees reduce R slightly. If fees were $5 on the NQ example, net R = ($1,000 − $5) ÷ $400 = 2.49R. Pick one method and stick to it.
- **Scaling in without adding up the risk.** If you add contracts, 1R is the total planned risk across all of them, each from its own entry to the stop.
- **Partial exits.** Use the average exit price weighted by contracts, or work out each piece's R and weight it.

## Calculating R for forex and CFDs

The same formula works in pips. If you risk 25 pips and make 50, that's +2R, whatever your lot size. Swap and commission work like futures fees: decide whether you include them.

## How to track R in a spreadsheet or journal

In a spreadsheet with Side in column B, Entry in C, Stop in D and Exit in E:

```
=IF(B2="Long",(E2-C2)/(C2-D2),(C2-E2)/(D2-C2))
```

Then average the column by setup to get each setup's expectancy, and sum it by week for your [weekly review](/guides/how-to-review-your-trades-weekly/).

Marble works in dollars, and knows the point values of common futures contracts, including NQ, MNQ, ES and MES. If you have no prices you can enter the result in R, and a CSV can carry R too. Marble doesn't work R out for you, so keep the formula above if you track it.

If you're new to journaling, start with [what a trading journal is and what to record](/guides/what-is-a-trading-journal/). Trading an evaluation? See [how to journal a prop firm evaluation](/guides/prop-firm-evaluation-journal/).

---

Marble works in dollars. If you have no prices you can enter the result in R. [Try Marble](https://trademarble.app).

*Marble is a trading journal. Nothing here is financial advice.*
