---
title: "What Is Profit Factor in Trading? Formula and Examples"
description: "Profit factor is gross profit divided by gross loss. How to calculate it, what it tells you, how it links to win rate and expectancy, and its limits."
slug: what-is-profit-factor
date: 2026-10-29
updated: 2026-10-29
author: Marble
keywords: ["what is profit factor", "profit factor formula", "profit factor trading", "how to calculate profit factor", "profit factor vs expectancy"]
related: ["what-is-expectancy-in-trading", "how-to-calculate-r-multiple", "trading-journal-spreadsheet-template", "how-to-review-your-trades-weekly"]
faq:
  - q: "What does a profit factor of 1 mean?"
    a: "Your winning trades made exactly as much as your losing trades lost, so you broke even. Above 1 you made money over those trades; below 1 you lost."
  - q: "Should profit factor include commissions?"
    a: "Yes, if you want it to reflect what reached your account. Fees shrink winners and enlarge losers, so a gross profit factor can look healthier than the net one."
  - q: "Is profit factor or expectancy more useful?"
    a: "They answer different questions. Profit factor is a ratio of money won to money lost. Expectancy is the average result per trade. Read them together, with the number of trades."
---

Profit factor is your gross profit divided by your gross loss: the total of all winning trades divided by the total of all losing trades, ignoring the minus sign. A profit factor of 1.5 means you made $1.50 for every $1 you lost over those trades. Above 1 is profitable, exactly 1 is breakeven, and below 1 is losing.

## The profit factor formula

> Profit factor = gross profit ÷ gross loss

- **Gross profit** is the sum of every winning trade.
- **Gross loss** is the sum of every losing trade, as a positive number.
- **Breakeven trades** add nothing to either side.

In a spreadsheet, with net P&L in column N:

```
=SUMIF(N2:N1000,">0")/ABS(SUMIF(N2:N1000,"<0"))
```

Dollars are the natural way to work it out. You can also calculate it in R, where it isn't distorted by trades taken at different sizes.

## A worked example

Over a month, an illustrative account has 30 trades: the winners total **$3,400** and the losers total **$2,000**.

- Profit factor = 3,400 ÷ 2,000 = **1.70**
- Net result = 3,400 − 2,000 = $1,400
- Expectancy = 1,400 ÷ 30 = about **$46.67 a trade**

For every dollar lost, $1.70 came back on winning trades.

## How to calculate profit factor from your journal (step by step)

1. **Choose the period and the trades:** a month, a setup, or one account.
2. **Decide gross or net,** and use the same choice every time (see below).
3. **Add up the winning trades.** That's gross profit.
4. **Add up the losing trades** and drop the minus sign. That's gross loss.
5. **Divide** gross profit by gross loss.
6. **Write the number of trades next to it,** so you know how much weight it can bear.

## Reading the number

| Profit factor | What it means over those trades |
|---|---|
| Below 1 | Losers took more than winners made |
| Exactly 1 | Breakeven before anything else |
| Above 1 | Winners made more than losers took |

There's no universal "good" figure, because it depends on how many trades it covers and how much each trade makes after costs. A profit factor is a description of past trades, not a forecast. What it's best for is comparison: one setup against another, this quarter against last, on-plan trades against off-plan ones.

## How profit factor links to win rate and payoff

Profit factor is built from two things: how often you win and how big your wins are compared with your losses.

> Profit factor = (win rate ÷ loss rate) × (average win ÷ average loss)

Take an illustrative setup with a 40% win rate, an average win of $525 and an average loss of $225:

- Win rate ÷ loss rate = 0.40 ÷ 0.60 = 0.667
- Average win ÷ average loss = 525 ÷ 225 = 2.333
- Profit factor = 0.667 × 2.333 = **1.56**

That's the same setup used in [what is expectancy in trading](/guides/what-is-expectancy-in-trading/), where its expectancy is $75 a trade. The two numbers describe the same trades from different angles.

It also shows why win rate on its own isn't enough. A 70% win rate with an average win of $40 and an average loss of $120 gives (0.7 ÷ 0.3) × (40 ÷ 120) = **0.78**: losing money despite winning most trades.

## What profit factor doesn't tell you

### How much each trade is worth

Two illustrative sets of trades, each with $1,500 of gross profit and $1,000 of gross loss:

| | Set X | Set Y |
|---|---|---|
| Trades | 10 | 100 |
| Profit factor | 1.5 | 1.5 |
| Net result | $500 | $500 |
| Expectancy per trade | $50 | $5 |

Same profit factor, very different trades. Set Y makes $5 a trade, so it's far more sensitive to fees and slippage: an extra $3 a trade in costs would take $300 of its $500. Always read profit factor alongside expectancy and the number of trades.

### How rough the ride was

A profit factor says nothing about the order of wins and losses. A long losing run in the middle, which might break a prop firm's drawdown limit, can hide inside a healthy figure. Look at your largest losing streak and deepest drawdown as well; see [trailing drawdown explained](/guides/trailing-drawdown-explained/).

### Whether the sample is big enough

With few trades, one large winner can lift profit factor a long way. If you have no losing trades at all, the formula divides by zero and the figure is meaningless rather than infinite. Note the number of trades next to every profit factor you quote.

## Gross or net?

"Gross profit" in the formula means the total of winners, not "before fees". You can still choose whether each trade's P&L is before or after commissions. Using net P&L gives the profit factor of what reached your account. Fees make winners smaller and losers bigger, so net profit factor is always a little lower than one worked from prices alone.

## Using profit factor in your review

Profit factor is most useful when you split it:

- **By setup:** which setups win more than they lose?
- **By on plan and off plan:** do off-plan trades pull the figure below 1?
- **By month:** is it stable, or did one month carry the rest?

Pair it with expectancy and your net dollars in your [weekly review](/guides/how-to-review-your-trades-weekly/). If you keep a spreadsheet, the formulas are in our [trading journal spreadsheet template](/guides/trading-journal-spreadsheet-template/).

Marble works out your profit factor in Stats from the trades you log or import, so you don't have to maintain the formulas.

---

Marble works out your P&L and profit factor from the same trades, so the numbers always agree. [Try Marble](https://trademarble.app).

*Marble is a trading journal. Nothing here is financial advice.*
