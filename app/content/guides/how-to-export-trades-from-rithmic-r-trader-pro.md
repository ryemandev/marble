---
title: "How to Export Trades from Rithmic R | Trader Pro"
description: "Export your Order History from Rithmic R | Trader Pro to CSV: the hidden columns to show first, the limited date window, time zones and fills to trades."
slug: how-to-export-trades-from-rithmic-r-trader-pro
date: 2026-10-29
updated: 2026-11-05
author: Marble
keywords: ["export trades from rithmic", "r trader pro order history export", "rithmic csv export", "rithmic trade history", "r trader pro export columns"]
related: ["how-to-export-trades-from-ninjatrader-8", "tracking-multiple-prop-firm-accounts", "prop-firm-evaluation-journal", "how-to-review-your-trades-weekly"]
faq:
  - q: "Why is Qty Filled missing from my R | Trader Pro export?"
    a: "R | Trader Pro only exports the columns visible in the grid. Right-click a column heading in Order History, choose Add/Remove Columns, add Qty Filled (and Order Number), then export again."
  - q: "How far back can I export from R | Trader Pro?"
    a: "Only a short window at a time. Guides disagree on whether it's a week or a single day, so export in small chunks and import each file. A journal that skips duplicates makes overlaps harmless."
---

To export trades from Rithmic's R | Trader Pro, open **Order History**, pick the account and date, make sure the **Qty Filled** and **Order Number** columns are showing, then export the Completed Orders grid to CSV. R | Trader Pro only exports the columns you can see, and it fetches a limited window at a time, so a longer period means several exports. The file lists orders, not trades, so your journal pairs the fills into trades for you.

Many futures prop firms run accounts on Rithmic, including Apex, Bulenox, Tradeify, Lucid Trading, TradeDay, Elite Trader Funding, Phidias, Earn2Trade and Funded Futures Network, as listed in October 2026. If you trade one of those accounts through R | Trader Pro, this is how you get your history out.

## How to export Order History (step by step)

1. **Open R | Trader Pro** and log in with your Rithmic account.
2. **Open Order History.** In most versions it's under the **File** menu. Some versions open it by right-clicking the account and choosing Order History.
3. **Choose the account and date,** then click the search or fetch button to load the orders.
4. **Show the columns you need.** In the Completed Orders section, right-click any column heading and choose **Add/Remove Columns**.
5. **Add at least:** Buy/Sell, Symbol, Qty Filled, Avg Fill Price, Update Time, Order Number and Account. Status and a commission column are worth adding too. Click OK.
6. **Export.** Use the export button (in some versions a clipboard icon at the top of the window) and choose **Export to CSV**. Save the file.
7. **Repeat for each day or week** you want to bring in.

Menu names vary between versions and between the builds some prop firms supply. If yours doesn't match, check your firm's or Rithmic's help pages.

## Why do Qty Filled and Order Number matter?

They're hidden in some layouts, and without them a journal can't rebuild your trades properly.

- **Qty Filled** is how many contracts actually filled. It's different from the order's quantity: a limit order for 3 that filled 2 has a Qty Filled of 2. Without it, partial fills look like full ones.
- **Order Number** is the order's unique ID. It lets a journal recognise an order it has already imported, so re-importing an overlapping day doesn't create duplicates.
- **Status** lets the journal ignore cancelled and rejected orders, which have no fills.

If you exported before adding these, add them and export again. The file can't be fixed afterwards.

## How much history can you export at once?

Not much. One guide says R | Trader Pro exports a week at a time; another says a single day. Either way, plan to export in pieces:

- Export **day by day** if your version only shows one date.
- Export **week by week** if it accepts a range.
- Name each file by account and date, such as `bulenox-50k_2026-10-26.csv`.

Overlaps are fine as long as your journal skips orders it already has, which it can do using the Order Number.

Some versions also have a separate **Fill History** view that lists executions. If your journal accepts it, it works on the same principle, but the steps above use Order History, which is the export journals most often support.

## What time zone does R | Trader Pro use?

Look at the time column's name. R | Trader Pro writes the zone into the header, for example `Update Time (EST)` or `Update Time (PDT)`. The zone depends on your settings and your computer's clock, and one guide notes that some firm-supplied builds default to US Central time.

Two things to watch:

- If the header says EST or PDT and you're in the UK, your trades will be several hours behind your own clock. That's expected; your journal should convert them.
- A trade near the date boundary can land on a different day than you expect. If one seems to be missing, export the day either side.

## Commissions in the Rithmic export

Order History only includes fees if you add a commission column, such as Commission Fill Rate. Without one, the P&L your journal works out is before commissions. Check your firm's or broker's fee schedule, and compare your journal's totals with your account statement.

## Orders to trades: how a journal pairs the fills

Order History is a list of fills, not finished trades. A journal matches them first in, first out. For example, on MNQ, where a point is worth $2:

| Order | Side | Qty Filled | Avg Fill Price |
|---|---|---|---|
| 1 | Buy | 2 | 21,000.00 |
| 2 | Sell | 1 | 21,010.00 |
| 3 | Sell | 1 | 21,020.00 |

That's **one trade**: long 2 contracts, out in two pieces. The first contract made 10 points and the second made 20, so the gross result is 30 points × $2 = **$60**, with an average exit of 21,015.00. Add your initial stop so you can see the [dollars at risk](/guides/how-to-calculate-r-multiple/).

A position still open at the end of an export is carried until the file that contains its exit. That's why it helps to export whole days, and to import them in order.

Marble reads the Order History CSV as it comes. It takes the time zone from the column name and pairs the fills into trades, first in, first out. If Qty Filled or Order Number is missing, it tells you which columns to show and to export again. A position left open at the end of one file is carried into the next import.

## Troubleshooting

- **Only one day came through.** Your version exports a single date at a time. Export the other days separately.
- **Quantities look wrong.** Qty Filled wasn't in the export, so the order quantity was used. Add the column and export again.
- **The file won't import.** It must be a real CSV. Renaming an `.xls` or `.xlsx` file to `.csv` doesn't convert it; open it and save it as CSV, or export again.
- **Trades are hours out.** The journal read the file in the wrong zone. Check the zone in the time column's header.
- **Duplicates.** You imported the same day twice into a journal that doesn't match on Order Number.

Trading through NinjaTrader on a Rithmic connection? You can also export from there; see [how to export trades from NinjaTrader 8](/guides/how-to-export-trades-from-ninjatrader-8/).

---

Marble imports R | Trader Pro's Order History without reformatting, and never asks for your Rithmic password. [Try Marble](https://trademarble.app).

*Rithmic, R | Trader Pro and the firms named are trademarks of their owners. Marble isn't affiliated with or endorsed by them.*

*Marble is a trading journal. Nothing here is financial advice.*
