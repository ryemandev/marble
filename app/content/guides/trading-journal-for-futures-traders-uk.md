---
title: "Trading Journal for UK Futures Traders: What You Need"
description: "What UK futures and prop traders need from a trading journal: New York hours on UK time, dollars vs pounds, UK GDPR, platform imports and how to choose."
slug: trading-journal-for-futures-traders-uk
date: 2026-10-29
updated: 2026-11-05
author: Marble
keywords: ["trading journal uk", "futures trading journal uk", "prop firm trading journal uk", "new york open uk time", "trading journal gdpr"]
related: ["futures-market-hours-uk-time", "tracking-multiple-prop-firm-accounts", "how-to-set-up-ibkr-flex-query", "how-to-export-trades-from-tradovate"]
faq:
  - q: "What time does the New York session open in the UK?"
    a: "The US stock market opens at 09:30 New York time, which is 14:30 UK time for most of the year. For two or three weeks in March and one week from late October, when the US and UK change their clocks on different dates, it's 13:30."
  - q: "Should I record futures P&L in pounds or dollars?"
    a: "In dollars, the currency the contracts trade in. Point values and fees are in dollars, so converting each trade adds noise. Convert totals separately if you need them in pounds."
  - q: "Does UK GDPR apply to a trading journal app?"
    a: "If the company behind it handles personal data of people in the UK, it's expected to follow UK data protection law. Check its privacy policy for where data is stored, who processes it and how to export or delete it."
---

A UK futures trader needs a journal that handles US markets on UK time. It should import from the platform you actually use (Tradovate, Rithmic, TopstepX or NinjaTrader, for most futures prop traders), store each trade's time correctly when the US and UK change their clocks on different dates, keep P&L in the dollars you trade, and look after your data under UK GDPR. If you trade prop-firm accounts, it also needs to keep evaluations and funded accounts apart. Here's what to check, and how to choose.

## Trading the New York session from the UK

If you trade US contracts such as NQ, ES and their micros, your trading day runs on New York's clock. For most of the year New York is five hours behind the UK. But the US and UK change their clocks on different dates, so twice a year the gap shrinks to four hours:

- From the **second Sunday in March** (US clocks go forward) until the **last Sunday in March** (UK clocks go forward).
- From the **last Sunday in October** (UK clocks go back) until the **first Sunday in November** (US clocks go back).

In 2027 that's 14 to 28 March and 31 October to 7 November. (As this guide was written, in late October 2026, New York was opening at 13:30 UK until 1 November.)

| Event | New York time | UK, most of the year | UK, during the gap weeks |
|---|---|---|---|
| CME Globex opens for the week (Sunday) | 18:00 | 23:00 | 22:00 |
| Daily CME break | 17:00 to 18:00 | 22:00 to 23:00 | 21:00 to 22:00 |
| Many major US data releases | 08:30 | 13:30 | 12:30 |
| US stock market open | 09:30 | 14:30 | 13:30 |
| US stock market close | 16:00 | 21:00 | 20:00 |

Holiday hours differ, so check CME's calendar around US holidays.

### Why this matters for your journal

Platforms write times in different zones. TopstepX exports are reported to be in UTC, Tradovate uses your local time, R | Trader Pro puts the zone in the column name, and MetaTrader uses the broker's server time. If your journal assumes the wrong zone, every trade shifts, and your time-of-day analysis tells you the wrong story.

What to look for:

- The journal **asks or detects which zone** each file is in.
- It stores times properly, so a trade on the Friday before the clocks change and one on the Monday after both land at the right UK time.
- Its time-of-day stats use a fixed clock. In New York time the open is always 09:30; in UK time it moves between 14:30 and 13:30, so stats in UK time blur the clock-change weeks. See [futures market hours in UK time](/guides/futures-market-hours-uk-time/).

Many futures prop firms also define the trading day by US hours, so from the UK the new day can start in the evening. Check your firm's rules, and see [how to journal a prop firm evaluation](/guides/prop-firm-evaluation-journal/).

## Dollars, pounds and your P&L

US futures are priced and settled in dollars, and most futures prop-firm accounts are in dollars too. When you're paid, the money is converted to pounds somewhere along the way, and the rate and fees depend on the firm's payout method and your bank.

For your journal:

- **Keep trades in dollars.** Point values ($20 a point on NQ, $2 on MNQ) and commissions are in dollars, so converting each trade adds noise.
- **Review in dollars.** Your P&L, fees and prop limits are all in dollars, so it's the cleanest way to read your trades. If you also use an [R multiple](/guides/how-to-calculate-r-multiple/), it reads the same in any currency.
- **Convert totals separately** when you need a figure in pounds.

If you need figures for HMRC, use your broker's or firm's statements and speak to an accountant. A journal is for reviewing your trading, not a tax record.

## Your data: UK GDPR and where your journal is stored

A trading journal holds more than numbers: account names, balances, screenshots, and notes about how you felt. Under UK GDPR and the Data Protection Act 2018, you have the right to see your data, take a copy, correct it and have it deleted, and you can complain to the Information Commissioner's Office (ICO) if a company handles it badly.

Before you sign up, check the privacy policy for:

1. **Where your data is stored:** the UK, the EU or elsewhere, and what safeguards apply if it leaves the UK.
2. **Whether it's sold or shared** for advertising.
3. **How to export everything,** in a format you can use elsewhere.
4. **How to delete your account** and how long deletion takes.
5. **What it asks for to import trades.** A file import needs no password at all. Be wary of any app that asks for your trading password.

Marble's journal is stored in London, it's never sold, and you can export or delete it at any time. It never asks for your trading password: trades come in from a file or by hand.

## Importing from the platforms UK futures traders use

Most futures prop firms run on one of a few platforms. As listed in October 2026:

- **Tradovate:** Apex, Tradeify, MyFundedFutures, Take Profit Trader, Lucid Trading and others. See [how to export trades from Tradovate](/guides/how-to-export-trades-from-tradovate/).
- **Rithmic (R | Trader Pro):** Apex, Bulenox, Tradeify, Funded Futures Network and others. See [how to export from R | Trader Pro](/guides/how-to-export-trades-from-rithmic-r-trader-pro/).
- **TopstepX:** Topstep. See [how to export trades from TopstepX](/guides/how-to-export-trades-from-topstepx/).
- **NinjaTrader 8:** a front end for many of these. See [how to export from NinjaTrader 8](/guides/how-to-export-trades-from-ninjatrader-8/).
- **Interactive Brokers:** some UK traders use it for futures directly. Its Flex Query reports download as a file; see [how to set up an IBKR Flex Query](/guides/how-to-set-up-ibkr-flex-query/).

Firms change platforms, so check your firm's help pages. A journal that reads your platform's own export file, without you reformatting it, will save you the most time.

## What else to look for in a futures journal

- **Contract point values** for minis and micros, so your dollars are right without typing them in.
- **Contract months grouped as one market,** so NQZ6 and NQH7 both count as NQ.
- **Fills paired into trades,** including scale-ins and partial exits.
- **Commissions per trade,** or a clear note when the export doesn't include them.
- **Several accounts side by side:** evaluations, funded and personal. See [tracking multiple prop firm accounts](/guides/tracking-multiple-prop-firm-accounts/).
- **Setups, photos and notes,** so you can see how the dollars were made or lost.
- **Works on your phone,** for logging feelings and notes as they happen.
- **Clear costs in pounds,** with no surprises and nothing hard to cancel.

## How to choose: a three-step test

1. **Import two weeks of real trades** from your platform. Do they match your statement, including fees?
2. **Check the times** on a trade you remember, ideally one from a clock-change week.
3. **Do one [weekly review](/guides/how-to-review-your-trades-weekly/) in it.** Does it answer your questions, or do you end up in a spreadsheet anyway?

## Where Marble fits

Marble is a trading journal built in Scotland for futures, forex and prop-firm traders. It imports files from Tradovate, TopstepX, Rithmic, NinjaTrader 8, MetaTrader, cTrader and Interactive Brokers, and lets you set the time zone each file is in. It's free forever.

---

If Marble sounds like it fits how you trade, it's free, so your own trades are the honest test. [Start with Marble](https://trademarble.app).

*Names of platforms and firms belong to their owners. Marble isn't affiliated with or endorsed by them.*

*Marble is a trading journal. Nothing here is financial advice.*
