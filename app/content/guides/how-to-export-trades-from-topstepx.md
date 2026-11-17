---
title: "How to Export Trades from TopstepX to CSV"
description: "Export your TopstepX trades to CSV in five steps, read the UTC times correctly and bring the file into your journal."
slug: how-to-export-trades-from-topstepx
date: 2026-10-29
updated: 2026-11-05
author: Marble
keywords: ["export trades from topstepx", "topstepx trade history csv", "topstep trading journal", "topstepx export utc"]
related: ["prop-firm-evaluation-journal", "trailing-drawdown-explained", "tracking-multiple-prop-firm-accounts", "trading-journal-for-futures-traders-uk"]
faq:
  - q: "Should I export from the Trades tab or the Orders tab?"
    a: "The Trades tab, for a journal. It gives one row per completed trade with entry, exit, size, fees and P&L. Orders lists every order, filled or not."
---

To export trades from TopstepX, open the **Trades** tab at the bottom of the trading screen, click **Export**, choose your date range and click **Export** again. The file downloads as a CSV with one row per completed trade. Its times are reported to be in UTC, so tell your journal that when you import.

## Trades or Orders: which TopstepX export do you need?

TopstepX can export from either the Orders tab or the Trades tab. For a journal, use **Trades**:

- **Trades** has one row per finished trade, with the entry and exit already matched.
- **Orders** lists every order you placed, including cancelled ones, which a journal would have to filter and pair.

Several journal tools specifically ask for the Trades export and won't read the Orders file.

## How to export your trades from TopstepX (step by step)

1. **Log in to TopstepX** and open the trading screen.
2. **Check which account is selected,** if you have more than one combine or funded account.
3. **Open the Trades tab** at the bottom of the page.
4. **Click Export.**
5. **Choose the date range,** then click **Export** again.
6. **Wait for the confirmation** at the bottom-left of the screen. The file is saved to your downloads.

These steps follow [Topstep's help article on TopstepX](https://help.topstep.com/en/articles/14434175-topstepx). If the screen looks different, check there first.

## What's in the TopstepX trades file?

Community scripts that convert this file list these columns:

| Column | What it holds |
|---|---|
| `Id` | The trade's ID |
| `ContractName` | The contract, such as `MNQZ6` (market, month code, year) |
| `EnteredAt`, `ExitedAt` | Entry and exit time |
| `EntryPrice`, `ExitPrice` | Average entry and exit price |
| `Size` | Contracts |
| `Type` | `Long` or `Short` |
| `PnL` | The trade's profit or loss |
| `Fees` | Fees for the trade |
| `TradeDay` | The trading day it counts towards |

Fees are in their own column, so check whether your journal subtracts them from `PnL`. Topstep's trading day doesn't always match the calendar date: a trade on Sunday evening, for example, can count towards Monday.

## What time zone are TopstepX exports in?

The export's times are reported to be in **UTC**, not your local time. That matters if you trade from the UK:

- In winter, UK time is UTC, so the times match your clock.
- In British Summer Time, the UK is UTC+1, so a trade you took at 14:35 shows as 13:35.

The easiest check is to find one trade you remember, such as the first trade of a session, and compare the file's time with the chart. If your journal lets you set the file's zone, choose UTC.

## How to import a TopstepX file into a journal

1. **Upload the CSV as downloaded.** Don't open and re-save it in a spreadsheet, which can change the dates.
2. **Pick the account,** for example your current combine or funded account.
3. **Set the time zone to UTC** if your journal asks.
4. **Check a trade or two** against TopstepX.
5. **Add your initial stop and setup,** so you can see the [dollars at risk](/guides/how-to-calculate-r-multiple/) and group results by setup.

## Troubleshooting

- **Times are an hour out.** The journal read UTC times as UK time, or the other way round.
- **Trades are missing.** Check the selected account and date range. A trade near midnight may sit on a different `TradeDay` from the date you expect.
- **Contract names look different.** `MNQZ6` and `MNQH7` are both MNQ, just different months. A good journal groups them as one market.
- **Duplicates after re-exporting.** Use a journal that matches on the trade `Id`, or don't overlap your date ranges.

Trading a combine? See [how to journal a prop firm evaluation](/guides/prop-firm-evaluation-journal/) for tracking the daily loss limit and drawdown alongside your trades, and [trailing drawdown explained](/guides/trailing-drawdown-explained/) for how the floor moves.

---

Marble reads the TopstepX file as it downloads. [Start with Marble](https://trademarble.app).

*Topstep and TopstepX are trademarks of their owners. Marble isn't affiliated with or endorsed by Topstep.*

*Marble is a trading journal. Nothing here is financial advice.*
