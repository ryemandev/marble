---
title: "How to Export Trade History from MT5 and MT4"
description: "Export your MetaTrader 5 History report or MT4 Detailed Statement step by step, choose HTML or Excel, and fix times shown in broker server time."
slug: how-to-export-trade-history-from-mt5-and-mt4
date: 2026-10-29
updated: 2026-10-29
author: Marble
keywords: ["export trade history mt5", "mt4 detailed statement", "metatrader trade history export", "mt5 history report excel", "mt4 server time"]
related: ["how-to-export-trades-from-ctrader", "tracking-multiple-prop-firm-accounts", "how-to-calculate-r-multiple", "prop-firm-evaluation-journal"]
faq:
  - q: "Should I choose HTML or Open XML when exporting from MT5?"
    a: "Either works for journals that read MetaTrader reports. Open XML opens in Excel; HTML opens in a browser. Don't use a PDF or screenshot, which a journal can't read."
  - q: "Why are the times in my MetaTrader report a couple of hours out?"
    a: "MetaTrader writes times in the broker's server time, not yours. Many servers run two or three hours ahead of UTC. Changing your computer's time zone doesn't change the report."
  - q: "Does the MT4 report include open trades?"
    a: "Account History covers closed trades. Open positions sit in the Trade tab until they close, then appear in the history."
---

To export your trade history from **MetaTrader 5**, open the Toolbox (Ctrl+T), go to the **History** tab, right-click to choose the period, then right-click again and choose **Report**, saving as HTML or Open XML (Excel). In **MetaTrader 4**, right-click the **Account History** tab, choose **All History** or a custom period, then choose **Save as Detailed Report** to save an HTML file. Both reports show times in your broker's **server time**, not your own, so your journal needs to know the server's offset.

Most forex and CFD prop firms offer MetaTrader, including FTMO, FundedNext, The5ers, E8 Markets, FundingPips, FXIFY, Goat Funded Trader, Aqua Funded and For Traders, as listed in October 2026. Access depends on each firm, so check yours.

## MT5: how to export your trade history (step by step)

1. **Open MetaTrader 5** on desktop and log in to the account you want.
2. **Open the Toolbox** with **Ctrl+T**, or from the View menu.
3. **Click the History tab.**
4. **Choose the period.** Right-click in the history and pick **All History**, **Last 3 Months**, **Last Month** or **Custom Period**.
5. **Right-click again and choose Report.**
6. **Pick a format:** **Open XML (MS Office Excel 2007)** or **HTML (Internet Explorer)**.
7. **Choose a folder and save.**

Menu wording varies slightly between builds and brokers. If yours looks different, check your broker's or firm's help page.

## What's in the MT5 report?

The report has a summary and three tables:

- **Positions:** one row per position, with open time, symbol, type, volume, open price, S / L, T / P, close time, close price, commission, swap and profit. The headers repeat "Time" and "Price" for the open and the close.
- **Orders:** every order placed, filled or not.
- **Deals:** every execution, with Time, Deal, Symbol, Type, Direction (in or out), Volume, Price, Order, Commission, Swap, Profit, Balance and Comment.

Deals also include balance rows such as deposits and withdrawals. A journal should ignore those and only read buys and sells.

## MT4: how to export a Detailed Statement (step by step)

1. **Open MetaTrader 4** and log in.
2. **Open the Terminal** with **Ctrl+T**.
3. **Click the Account History tab.**
4. **Right-click and choose the period:** **All History**, **Last 3 Months**, **Last Month** or **Custom Period**.
5. **Right-click again and choose Save as Detailed Report.** (Save as Report gives a shorter version.)
6. **Choose a folder and save** the HTML file.

MT4's own help notes that the preset periods select trades by their **close time**. A trade opened last month and closed this month appears in this month's history.

### What's in the MT4 statement?

The closed transactions table has one row per ticket: Ticket, Open Time, Type, Size, Item, Price, S / L, T / P, Close Time, Price (the second one is the exit), Commission, Taxes, Swap and Profit. The Commission, Taxes and Comments columns can be shown or hidden from the right-click menu, so turn them on before exporting. The detailed version also adds summary figures and a balance chart.

## Why are the times in my MetaTrader report wrong?

They aren't wrong; they're in **server time**. MetaTrader stamps every trade with the broker's server clock, and changing your computer's time zone doesn't change that.

Many brokers and prop firms run their servers two or three hours ahead of UTC, commonly UTC+2 in winter and UTC+3 in summer. Yours may differ. For a UK trader on a server like that:

| Your UK time | Server time shown |
|---|---|
| 14:30 in winter (UK on GMT, UTC+0) | 16:30 (server on UTC+2) |
| 14:30 in summer (UK on BST, UTC+1) | 16:30 (server on UTC+3) |

The gap can differ for a week or two around the clock changes, because servers and the UK don't always change on the same date.

**To find your server's offset,** look at the Market Watch window: its title shows the server's current time. Compare it with your own clock and note the difference. Then tell your journal which server time the file uses, or it will place every trade hours out and your time-of-day analysis will be meaningless.

## HTML or Excel: which format should you choose?

Both hold the same data. Open XML (`.xlsx`) opens in Excel; HTML opens in a browser. Use whichever your journal reads. Don't re-save the file in an older `.xls` format, and don't send a PDF or screenshot, which a journal can't read.

## Forex and CFD details to check before you import

- **Volume is in lots,** and P&L is in your account currency. There's no fixed "point value" as with futures, so a journal takes the profit from the report.
- **Swap and commission are separate** from profit. Net result = profit + commission + swap (MetaTrader writes costs as negative numbers).
- **Partial closes** create several deals for one position.
- **Hedging accounts** can hold a long and a short in the same symbol at once. Check how your journal treats them.
- **The S / L column isn't always your original stop.** It shows the stop the position had when it closed. If you moved it to breakeven, it won't reflect the risk you started with. Note your initial stop in your journal when you enter, so you can see the [dollars at risk](/guides/how-to-calculate-r-multiple/).

## Importing a MetaTrader report into a journal

1. **Export one account at a time.** If you trade several prop-firm accounts, name each file by account and dates.
2. **Upload the file as saved.**
3. **Set the server time** you found above.
4. **Check a few trades** against MetaTrader.
5. **Add your initial stop, setup and notes,** so your [weekly review](/guides/how-to-review-your-trades-weekly/) has more than P&L to work with.

Marble reads the MT5 History report (HTML or XLSX) and the MT4 Detailed Statement, ignores balance and cancelled rows, and lets you pick the server time the file uses: UTC+2 with +3 in summer, or a fixed UTC+2 or UTC+3. It remembers your choice for the next file.

## Troubleshooting

- **Trades are missing.** Check the period. MT4 selects by close time, and open positions won't appear until they close.
- **Everything is two or three hours out.** The journal read server time as UK time. Set the server offset.
- **Deposits show up as trades.** The journal didn't filter balance rows. Remove them, or use a journal that reads only buys and sells.
- **The file won't open in the journal.** It may have been saved as old `.xls`. Export again as Open XML or HTML.

If your firm also offers cTrader, see [how to export trade history from cTrader](/guides/how-to-export-trades-from-ctrader/). Running several firm accounts? See [tracking multiple prop firm accounts](/guides/tracking-multiple-prop-firm-accounts/).

---

Marble imports MetaTrader 4 and 5 reports with the server time handled. [Try Marble](https://trademarble.app).

*MetaTrader and the firms named are trademarks of their owners. Marble isn't affiliated with or endorsed by them.*

*Marble is a trading journal. Nothing here is financial advice.*
