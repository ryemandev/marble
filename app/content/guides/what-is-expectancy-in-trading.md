---
title: "What Is Expectancy in Trading? Formula and Examples"
description: "Expectancy is your average result per trade. The formula in dollars and in R, worked examples, breakeven win rate, and why small samples mislead."
slug: what-is-expectancy-in-trading
date: 2026-10-29
updated: 2026-10-29
author: Marble
keywords: ["what is expectancy in trading", "trading expectancy formula", "expectancy in r", "how to calculate expectancy", "positive expectancy trading"]
related: ["how-to-calculate-r-multiple", "what-is-profit-factor", "how-to-write-a-trading-playbook", "how-to-review-your-trades-weekly"]
faq:
  - q: "Is a high win rate the same as positive expectancy?"
    a: "No. A high win rate with small wins and large losses can still lose money. Expectancy combines how often you win with how much you win and lose, so it's the better single measure."
  - q: "Should expectancy be in dollars or in R?"
    a: "Start with dollars: they tell you what a trade is worth at your current size. R is an optional second way. It ignores position size, which helps if you compare setups traded at different sizes."
  - q: "How many trades do I need to trust an expectancy figure?"
    a: "There's no magic number, but a handful of trades tells you very little, and one large winner can swing a small sample. Treat early figures as provisional and watch how they settle as trades add up."
---

Expectancy is the average amount you make or lose per trade, in dollars. **Expectancy = (win rate × average win) − (loss rate × average loss)**, or simply your net P&L divided by the number of trades. A setup with an example expectancy of $75 has made, on average, $75 on each trade; a negative figure means it loses money over time, whatever its win rate. It's the single most useful number in a trading journal, because it combines how often you win with how much.

## The expectancy formula

There are two equivalent ways to work it out.

**From the averages:**

> Expectancy = (win rate × average win) − (loss rate × average loss)

where the average loss is written as a positive number.

**From the totals:**

> Expectancy = total result ÷ number of trades

Both give the same answer. The first shows *why* the number is what it is; the second is quicker in a spreadsheet: `=AVERAGE()` of your net P&L column.

Work in dollars first: that's what each trade actually made or lost. R multiples are an optional second way. In R, every trade is measured against what you risked, so results at different sizes compare fairly. If R is new to you, start with [how to calculate R multiple](/guides/how-to-calculate-r-multiple/).

## Worked example in dollars

An illustrative setup has 40 trades: 16 winners averaging **+$525** and 24 losers averaging **−$225**.

- Win rate = 16 ÷ 40 = 40%; loss rate = 60%
- (0.40 × 525) − (0.60 × 225) = 210 − 135 = **+$75 per trade**
- Check with totals: (16 × 525) − (24 × 225) = 8,400 − 5,400 = $3,000; 3,000 ÷ 40 = $75

So, over those 40 trades, each one made $75 on average.

## The same in R

If your usual risk (1R) is $250, that's winners of +2.1R, losers of −0.9R and +0.30R a trade on average. Expectancy in dollars is just expectancy in R multiplied by your risk per trade. Double your size and the dollars double, but the R stays the same.

(Figures are for illustration. Past results don't predict future ones.)

## Win rate alone can mislead

Two illustrative setups:

| | Setup A | Setup B |
|---|---|---|
| Win rate | 70% | 35% |
| Average win | +$40 | +$250 |
| Average loss | −$120 | −$100 |
| Expectancy | (0.7 × 40) − (0.3 × 120) = **−$8** | (0.35 × 250) − (0.65 × 100) = **+$22.50** |

Setup A wins seven times in ten and still loses money; Setup B loses most of the time and makes money. Win rate feels good or bad trade by trade, but expectancy is what decides the result.

## Breakeven win rate

For any ratio of average win to average loss, there's a win rate where expectancy is exactly zero:

> Breakeven win rate = average loss ÷ (average win + average loss)

For Setup B: 100 ÷ (250 + 100) = **28.6%**. Above that win rate it makes money; below, it doesn't. For Setup A: 120 ÷ (40 + 120) = **75%**, which it falls short of.

This is a handy check when a setup's win rate drifts. It tells you how much room there is before the setup stops paying.

## Why small samples mislead

Expectancy is an average, and averages of a few numbers swing about. One illustrative example: 20 trades total **+$400**, an expectancy of +$20. But one of them was a single **+$800** winner. Without it, the other 19 trades total **−$400**, an expectancy of about −$21.

Is the setup good, or did one trade carry it? With 20 trades you can't tell yet. Ways to keep yourself honest:

- **Look at the median trade** as well as the average, to see whether a few outliers dominate.
- **Check expectancy without your biggest winner.** If it flips negative, be cautious.
- **Let the sample grow** before you drop a setup or lean on it.
- **Compare periods.** A setup whose expectancy holds across several months is telling you more than one strong month.

## Expectancy by setup, not just overall

Your overall expectancy blends everything you trade. Split it by setup and you often find one or two that do the work and one that gives it back, plus trades with no setup at all. That's where your playbook should come from; see [how to write a trading setup playbook](/guides/how-to-write-a-trading-playbook/).

Splitting by other things helps too: time of day, market, how you felt, and on-plan trades against off-plan ones. Each split answers a different question in your [weekly review](/guides/how-to-review-your-trades-weekly/).

## Expectancy and fees

Work expectancy from **net** results, after commissions, if you can. On short-term futures trades, fees can be a noticeable share of a small average. If you track R from prices only (before fees), compare it with your net P&L now and then, so you know how much fees take.

## Expectancy and profit factor

Profit factor is gross profit divided by gross loss. It uses the same trades as expectancy but answers a slightly different question: how many dollars you make for each one you lose, rather than how much per trade. For the 40-trade example above, it's 8,400 ÷ 5,400 = **1.56**. See [what is profit factor](/guides/what-is-profit-factor/).

## How to track expectancy in your journal

1. **Record every trade's net result,** so each has a dollar figure.
2. **Name the setup** from a short, fixed list.
3. **Average the dollars** by setup and by month.
4. **Note the sample size** next to every figure.

If you also want expectancy in R, record the initial stop on every trade and average the R the same way.

Marble shows what each setup has made in dollars, and Stats shows your profit factor, so you can see which setups have paid without building the sums yourself.

---

Marble shows what each setup has made in dollars, and Ask gives your overall expectancy. [See how it works](https://trademarble.app).

*Marble is a trading journal. Nothing here is financial advice.*
