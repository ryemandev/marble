---
title: "How to Export Trades from NinjaTrader 8 (Executions CSV)"
description: "Export your NinjaTrader 8 executions or trades to CSV from Trade Performance, choose the right grid, and avoid semicolon and date-format problems."
slug: how-to-export-trades-from-ninjatrader-8
date: 2026-10-29
updated: 2026-10-29
author: Marble
keywords: ["export trades from ninjatrader 8", "ninjatrader executions export csv", "ninjatrader trade performance export", "nt8 export trades", "ninjatrader csv semicolon"]
related: ["how-to-export-trades-from-tradovate", "how-to-export-trades-from-rithmic-r-trader-pro", "how-to-review-your-trades-weekly"]
faq:
  - q: "Should I export Executions or Trades from NinjaTrader 8?"
    a: "Executions, for most journals. It has one row per fill, so the journal can pair them however your position was built. The Trades display splits scaled positions into separate trades."
  - q: "Why is my NinjaTrader export separated by semicolons?"
    a: "Exports can follow your Windows regional settings. Where the comma is the decimal separator, the file may use semicolons between columns. A journal that detects the delimiter will read either."
  - q: "How far back can NinjaTrader 8 export?"
    a: "Trade Performance can report on past dates, but NinjaTrader support has said very long ranges can be unreliable. Exporting a month or two at a time is safer."
---

To export trades from NinjaTrader 8, open **Control Center → New → Trade Performance**, choose your account and dates, set the display to **Executions**, click **Generate**, then right-click the grid, choose **Export** and save as **CSV**. Executions gives one row per fill, which is what most trading journals want. Before you import, check the file's delimiter and date format, because both can follow your Windows regional settings.

## Executions or Trades: which grid should you export?

Trade Performance can show your history several ways. Two are useful for a journal.

| Display | One row per | Typical columns | Watch out for |
|---|---|---|---|
| **Executions** | Fill | Instrument, Action, Quantity, Price, Time, ID, E/X, Position, Order ID, Name, Commission, Rate, Account, Connection | Nothing extra: this is the raw record |
| **Trades** | Paired trade | Instrument, market position, quantity, entry and exit price and time, profit, commission | Scale-ins and scale-outs become separate trades |

NinjaTrader doesn't store trades as such; it pairs executions to build them. Its own help guide notes that positions scaled in or out are counted as separate trades in the Trades display. If you add to winners or take partial profits, export **Executions** and let your journal do the pairing, so one idea stays one trade.

## How to export executions from Trade Performance (step by step)

1. **Open Trade Performance** from the Control Center: **New → Trade Performance**.
2. **Choose the account.** Use the filter options to limit the report to one account, for example a single prop-firm evaluation.
3. **Set the From and To dates.** If you can, start on a day you were flat. NinjaTrader builds reports from executions, so a range that starts mid-position can pair fills oddly.
4. **Set Display to Executions.**
5. **Click Generate.**
6. **Right-click anywhere in the results** and choose **Export**.
7. **Set "Save as type" to CSV** (Excel is also offered), choose a folder and save.

NinjaTrader gives exported files a generic name starting "NinjaTrader Grid", so rename each one with the account and dates, such as `apex-pa-1_2026-10.csv`.

Keep ranges modest. NinjaTrader support has said very long ranges can cause errors, and around 60 days was reported as a practical maximum. For a longer history, export month by month.

## Exporting just today's executions

The Control Center's **Executions** tab shows your recent fills. You can right-click it and choose Export in the same way. For anything older than the current session, use Trade Performance.

## Locale problems: semicolons, decimal commas and date order

This is where most NinjaTrader imports go wrong. The export can follow your Windows regional settings, so the same steps produce different files on different PCs.

### Semicolons instead of commas

On systems where the decimal separator is a comma, as in much of Europe, exports can be separated by semicolons. A sample shared on NinjaTrader's forum was semicolon-separated. That's still a valid file; your journal just needs to detect it.

### Decimal commas

On the same systems a price may be written `21000,25` rather than `21000.25`. A journal that assumes full stops will read that as the wrong number, or fail.

### Day first or month first

Dates follow your Windows short date format. On a PC set to UK English, 29 October 2026 is written `29/10/2026`; on a US-English PC it's `10/29/2026`. The danger is the days up to the 12th: `03/10/2026` could be 3 October or 10 March. Tell your journal which order your PC uses, and check a trade you remember.

### Don't re-save it in Excel

Opening the CSV in Excel can convert dates and turn numbers into text. Upload the file exactly as NinjaTrader saved it.

## Time zone

Times are written in the time zone NinjaTrader displays, which is usually your computer's. If you're in the UK and haven't changed it, that's UK time, and it shifts by an hour when the clocks change. If you set NinjaTrader to another zone, such as US Eastern, tell your journal.

## Commissions

The Executions grid has a Commission column, but an older sample shared on NinjaTrader's forum didn't include one. If commissions show as zero, your connection may not report them. Compare the totals with your broker's or firm's statement, which NinjaTrader's support treats as the authoritative record.

## NinjaTrader with Tradovate or Rithmic accounts

NinjaTrader 8 is often the front end for an account that actually runs on Tradovate or Rithmic, which is common with futures prop firms. You can export from NinjaTrader, or from the underlying platform:

- [How to export trades from Tradovate](/guides/how-to-export-trades-from-tradovate/)
- [How to export trades from Rithmic R | Trader Pro](/guides/how-to-export-trades-from-rithmic-r-trader-pro/)

Pick one source per account and stick to it. Importing the same trades from two places can create duplicates, because each platform uses its own IDs.

## Importing a NinjaTrader file into a journal

1. **Upload the CSV untouched.**
2. **Choose the account** the trades belong to.
3. **Confirm the date order** (day or month first) and the time zone.
4. **Check two or three trades** against the chart.
5. **Add your initial stop and setup** so you can see the [dollars at risk](/guides/how-to-calculate-r-multiple/) and compare setups in your [weekly review](/guides/how-to-review-your-trades-weekly/).

Marble reads the Executions CSV whether it's split by commas or semicolons, and handles decimal commas. If it can't tell whether your dates are day first or month first, it asks you, then remembers the answer for next time. It pairs the fills into trades and skips any it already has.

## Troubleshooting

- **All my trades are on the wrong dates.** Day and month were read the wrong way round. Change the date order and import again.
- **Prices are wildly wrong.** Decimal commas were read as thousands separators.
- **The report includes trades before my From date.** NinjaTrader may build the report from the last time you were flat. Start the range on a flat day.
- **Executions are out of order.** Fills that share the same timestamp can appear in any order, which NinjaTrader says is expected. A journal that reads the E/X (entry or exit) column and the fill IDs can still pair them correctly.

---

Marble imports NinjaTrader 8 executions, whatever your Windows settings. [Bring in your first file](https://trademarble.app).

*NinjaTrader and the platforms named are trademarks of their owners. Marble isn't affiliated with or endorsed by them.*

*Marble is a trading journal. Nothing here is financial advice.*
