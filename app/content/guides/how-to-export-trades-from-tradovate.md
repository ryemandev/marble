---
title: "How to Export Trades from Tradovate (Performance & Orders)"
description: "Step-by-step: export your Tradovate Performance or Orders report as CSV, what each file contains, why commissions are missing, and how to import it."
slug: how-to-export-trades-from-tradovate
date: 2026-10-29
updated: 2026-10-29
author: Marble
keywords: ["export trades from tradovate", "tradovate performance report csv", "tradovate orders export", "tradovate trade history", "tradovate commissions export"]
related: ["how-to-export-trades-from-ninjatrader-8", "tracking-multiple-prop-firm-accounts", "prop-firm-evaluation-journal", "trading-journal-for-futures-traders-uk"]
faq:
  - q: "Should I export the Performance or the Orders report from Tradovate?"
    a: "Performance if you want one row per finished round trip with its P&L. Orders if you want every filled order, so a journal can rebuild trades from the fills itself. Both work for most journals."
  - q: "Does the Tradovate export include commissions?"
    a: "No. Neither the Performance nor the Orders report includes commissions or exchange fees, so the P&L is gross. Fees appear in the Cash History report for the same dates."
  - q: "What time zone are Tradovate exports in?"
    a: "Your local time, as set on the computer or device you exported from. Tell your journal the same zone when you import."
---

To export your trades from Tradovate, open Account Reports, choose the **Performance** or **Orders** tab, set the date range, click **Go**, then download the report as a CSV. Performance gives one row per round trip with its P&L; Orders gives every order with its fill price and time. Neither includes commissions, so if you want net figures, download the **Cash History** report for the same dates as well.

## Which Tradovate report should you export?

Tradovate's Account Reports has several tabs, including Performance, Fills, Orders, Position History, Cash History and Account Balance History. For a trading journal, two matter most, plus one for fees.

| Report | One row per | What's in it | Best for |
|---|---|---|---|
| **Performance** | Matched buy and sell (a round trip) | Symbol, quantity, buy and sell prices, buy and sell times, P&L, duration | Quick review of finished trades |
| **Orders** | Order | Buy or sell, contract, filled quantity, average fill price, fill time, status | Rebuilding trades from fills, including scale-ins and partial exits |
| **Cash History** | Cash movement | Commissions, fees and other account debits and credits | Working out net P&L |

If your journal pairs fills into trades itself, either file works. If it expects one row per trade, use Performance.

## How to export the Performance report (step by step)

1. **Log in to Tradovate** on the web or desktop app.
2. **Open Account Reports.** Depending on your version, click the **Reports** icon in the toolbar, or open the account drop-down and click the **gear** beside your account.
3. **Choose the account.** If you trade several prop-firm accounts, each one is exported separately.
4. **Click the Performance tab.**
5. **Set the date range.** Pick a preset such as This Week or This Month, or a custom From and To date, then click **Go**.
6. **Click Download Report** and choose **CSV**. A PDF is fine for your records but won't import into a journal.

Button labels have changed over the years. If something doesn't match, check Tradovate's own help centre.

## How to export the Orders report

The steps are the same, but choose the **Orders** tab in step 4. The Orders report includes orders that were cancelled or never filled, so a journal should only read the rows whose status is filled. Most journals filter these out for you.

## What's in each file?

**Performance CSV.** Open-source importers that read this file list columns such as `symbol`, `qty`, `buyPrice`, `sellPrice`, `pnl`, `boughtTimestamp`, `soldTimestamp`, `duration`, `buyFillId` and `sellFillId`. A few things to know:

- The entry is whichever came first, the buy or the sell, so a short shows its sell time before its buy time.
- Losses are written in accounting style, like `$(36.00)`.
- One position closed in pieces can appear as several rows, one per matched pair of fills.

**Orders CSV.** Expect columns such as `B/S`, `Contract`, `Product`, `avgPrice`, `filledQty`, `Fill Time`, `Status`, `Order ID` and `Account`. Each filled order is one execution; your journal pairs the buys and sells into trades, first in, first out.

## Why aren't my commissions in the Tradovate export?

Because neither report carries them. The P&L in Performance is gross: before commissions and exchange fees. On a busy day with micros, that gap can be a large share of the result.

You have two options:

1. **Download Cash History** for the same account and date range. That's where Tradovate records commissions and fees, and you can reconcile the total against your journal.
2. **Use your fee schedule.** If you trade a prop-firm account, its commission per contract is on the firm's pricing or help pages. Multiply by contracts traded to estimate fees.

Either way, compare like with like. Gross P&L from the export won't match the net change in your account balance.

## Time zones and date formats

Tradovate writes times in your local time, and the dates are month first: `03/10/2026` is 10 March, not 3 October. If you trade from the UK, set your journal's import to UK time (or whatever zone your device was in when you exported), and check one trade you remember against the chart.

## Exporting several prop-firm accounts

Many futures prop firms run their accounts on Tradovate, including Apex, Tradeify, MyFundedFutures, Take Profit Trader, Lucid Trading, TradeDay, Elite Trader Funding, Phidias and Earn2Trade, as listed in October 2026. Firms do change platforms, so check your firm's help pages.

Export each account on its own and name the files clearly, for example `apex-eval-1_2026-10.csv`. Importing them into separate accounts in your journal keeps evaluations and funded accounts apart, which matters when you [journal a prop firm evaluation](/guides/prop-firm-evaluation-journal/). For naming and daily tracking across several accounts, see [tracking multiple prop firm accounts](/guides/tracking-multiple-prop-firm-accounts/).

## How to import a Tradovate file into a trading journal

1. **Don't open and re-save the file in Excel first.** Spreadsheets can rewrite dates and numbers. Upload it exactly as downloaded.
2. **Choose the account** the trades belong to.
3. **Confirm the time zone** you exported in.
4. **Check two or three trades** against Tradovate: same entry, exit and size.
5. **Add what the file can't know:** your initial stop (so you can see the [dollars at risk](/guides/how-to-calculate-r-multiple/)), the setup and a note.

In Marble, you drop the Performance or Orders CSV into Import. Marble recognises the file from its headers, pairs the fills into trades, and keeps a position scaled across several Performance rows as one trade. It also skips any trades it already has, so overlapping date ranges are safe, and it tells you when a file has no commissions.

## Troubleshooting

- **The file is empty.** Check that the right account is selected and the date range covers days you traded, then click Go again before downloading.
- **The P&L doesn't match my account.** Usually it's commissions. It can also be a trade that was open at the start or end of the range; widen the range by a day either side.
- **Trades appear twice.** You've imported overlapping ranges into a journal that doesn't skip duplicates. Remove one import, or use a journal that matches on Tradovate's fill or order IDs.
- **Times are an hour out.** The import's time zone doesn't match the zone you exported in, which is common around the dates UK and US clocks change.

If you also use NinjaTrader as your front end, you can export from there instead; see [how to export trades from NinjaTrader 8](/guides/how-to-export-trades-from-ninjatrader-8/).

---

Marble reads Tradovate's Performance and Orders exports as they come, with no reformatting. [Import your first file](https://trademarble.app).

*Tradovate and the firms named are trademarks of their owners. Marble isn't affiliated with or endorsed by them.*

*Marble is a trading journal. Nothing here is financial advice.*
