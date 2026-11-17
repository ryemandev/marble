---
title: "Trading Journal Spreadsheet Template: Columns & Formulas"
description: "Build a trading journal in Excel or Google Sheets: the 22 columns to include, formulas for P&L, expectancy, profit factor and R, and a summary tab."
slug: trading-journal-spreadsheet-template
date: 2026-10-29
updated: 2026-11-05
author: Marble
keywords: ["trading journal spreadsheet template", "trading journal excel template", "trading journal google sheets", "trading journal columns", "trade log spreadsheet"]
related: ["what-is-a-trading-journal", "how-to-calculate-r-multiple", "what-is-expectancy-in-trading", "what-is-profit-factor"]
faq:
  - q: "Excel or Google Sheets for a trading journal?"
    a: "Either. The formulas in this guide work in both. Google Sheets is easier on a phone and across devices; Excel copes better with very large files."
  - q: "Can I paste my broker's export straight into the spreadsheet?"
    a: "Only if it already has one row per trade. Exports with one row per fill, such as Tradovate Orders or NinjaTrader Executions, need pairing into trades first, which is fiddly by hand."
  - q: "How many columns does a trading journal need?"
    a: "Fewer than you think. The essentials are date, market, side, size, entry, stop, exit, fees, net P&L and setup. Add more only when you'll actually review them."
---

A trading journal spreadsheet needs one row per trade and about 20 columns: the facts (date, market, side, size, entry, exit, fees), the plan (initial stop and setup), the process (on plan, grade, mistake) and the context (feeling, note, screenshot link), plus formula columns that work out dollars at risk, net P&L and, if you want it, R. A second tab then calculates your net dollars, win rate, expectancy and profit factor, overall and by setup. Below is the full column list and every formula, ready to type into Excel or Google Sheets.

## The trade log: 22 columns

Put these across row 1 of a sheet called **Trades**, one trade per row from row 2. Columns marked *formula* are worked out; you type the rest.

| Col | Header | Example | What goes in it |
|---|---|---|---|
| A | Date | 2026-10-27 | Trade date (use one format throughout) |
| B | Time | 09:42 | Entry time, in one fixed time zone |
| C | Account | Eval 1 | Which account, if you trade several |
| D | Market | MNQ | Contract or symbol, without the month |
| E | Side | Long | Long or Short, spelled the same way every time |
| F | Size | 3 | Contracts or lots |
| G | Entry | 21000.00 | Average entry price |
| H | Stop | 20980.00 | Your **initial** stop, not where you moved it |
| I | Exit | 21050.00 | Average exit price |
| J | Point value | 2 | Dollars per point (MNQ 2, NQ 20, MES 5, ES 50) |
| K | Fees | 2.10 | Commissions and fees for the whole trade |
| L | Risk ($) | 120.00 | *formula*: money at risk to the initial stop |
| M | Gross P&L | 300.00 | *formula*: result before fees |
| N | Net P&L | 297.90 | *formula*: result after fees |
| O | R | 2.50 | *formula*: optional, result in multiples of risk |
| P | Setup | Pullback | From your playbook's list of setups |
| Q | On plan | Y | Y if the trade followed your plan, N if not |
| R | Grade | A | Your process grade, if you use one |
| S | Mistake | Moved stop | One named mistake, or blank |
| T | Feeling | Calm | How you felt, from a short fixed list |
| U | Note | Waited for the close | One line, in your own words |
| V | Screenshot | (link) | A link to the chart image |

Columns L to O are formulas, so you type 18 values a trade, fewer once you copy down defaults such as point value.

The example row is an illustration: long 3 MNQ at 21,000.00 with a stop at 20,980.00, out at 21,050.00.

## The formulas

Type these in row 2 and fill them down.

**Risk ($), column L:**

```
=ABS(G2-H2)*J2*F2
```

**Gross P&L, column M:**

```
=IF(E2="Long",I2-G2,G2-I2)*J2*F2
```

**Net P&L, column N:**

```
=M2-K2
```

**R multiple, column O:**

```
=IF(E2="Long",(I2-G2)/(G2-H2),(G2-I2)/(H2-G2))
```

Check them against the example: risk = 20 points × $2 × 3 = $120; gross = 50 × $2 × 3 = $300; net = $297.90; R = 50 ÷ 20 = 2.5. If you'd rather count fees in R, use `=N2/L2` instead, which gives 2.48R here. See [how to calculate R multiple](/guides/how-to-calculate-r-multiple/) for why the initial stop matters.

For forex and CFDs, where point values vary, you can skip columns J, L and M, type the net P&L into N from your statement, and work out R from prices or pips as above.

## The summary tab

Add a second sheet called **Summary**. These formulas read the Trades sheet; widen the ranges as your log grows.

| Measure | Formula |
|---|---|
| Net P&L | `=SUM(Trades!N2:N1000)` |
| Trades | `=COUNT(Trades!N2:N1000)` |
| Win rate | `=COUNTIF(Trades!N2:N1000,">0")/COUNT(Trades!N2:N1000)` |
| Expectancy (average $ a trade) | `=AVERAGE(Trades!N2:N1000)` |
| Average win ($) | `=AVERAGEIF(Trades!N2:N1000,">0")` |
| Average loss ($) | `=AVERAGEIF(Trades!N2:N1000,"<0")` |
| Profit factor | `=SUMIF(Trades!N2:N1000,">0")/ABS(SUMIF(Trades!N2:N1000,"<0"))` |
| Average $, on plan | `=AVERAGEIF(Trades!Q2:Q1000,"Y",Trades!N2:N1000)` |
| Average $, off plan | `=AVERAGEIF(Trades!Q2:Q1000,"N",Trades!N2:N1000)` |
| Largest loss ($) | `=MIN(Trades!N2:N1000)` |
| Total R (optional) | `=SUM(Trades!O2:O1000)` |
| Average R (optional) | `=AVERAGE(Trades!O2:O1000)` |

Two of these have their own guides: [expectancy](/guides/what-is-expectancy-in-trading/) and [profit factor](/guides/what-is-profit-factor/).

### By setup and by mistake

List your setups down column A of the Summary sheet (from row 15, say) and put these beside each:

- Trades: `=COUNTIF(Trades!P$2:P$1000,A15)`
- Net P&L: `=SUMIF(Trades!P$2:P$1000,A15,Trades!N$2:N$1000)`
- Expectancy: `=AVERAGEIF(Trades!P$2:P$1000,A15,Trades!N$2:N$1000)`

Do the same with your mistake names against column S to see the total dollars of trades where each mistake happened. That's the starting point for ranking mistakes by cost in your [weekly review](/guides/how-to-review-your-trades-weekly/).

## Keep the data clean

Spreadsheets break quietly when the data is inconsistent. A few rules:

- **Use drop-down lists** (data validation) for Side, Setup, On plan, Mistake and Feeling, so "Long", "long" and "L" don't become three different things.
- **Never leave Stop blank.** If you had no stop, the R formula will divide by zero. Write down where you'd have been wrong before you enter.
- **One time zone.** If you trade US futures from the UK, New York time keeps the open at 09:30 all year. See [futures market hours in UK time](/guides/futures-market-hours-uk-time/).
- **Market without the month.** Write MNQ, not MNQZ6, so the same market groups together.
- **Don't overwrite formulas** when pasting. Paste values only into the typed columns.

## What a spreadsheet won't do for you

A spreadsheet is free and completely yours, which is a real advantage. The trade-offs are the work around it:

- **Pairing fills.** Platform exports such as [Tradovate's Orders report](/guides/how-to-export-trades-from-tradovate/) or [NinjaTrader's Executions](/guides/how-to-export-trades-from-ninjatrader-8/) list fills, not trades. Turning a scale-in and two partial exits into one row is manual work.
- **Duplicates.** Re-pasting an overlapping export doubles trades unless you check IDs.
- **Time zones.** Each platform writes times differently, and the spreadsheet won't convert them.
- **Screenshots and notes** live elsewhere, as links.

If that becomes the part you dread, a journal app takes it over. Marble, for example, imports the export files from Tradovate, TopstepX, Rithmic, NinjaTrader, MetaTrader, cTrader and Interactive Brokers, pairs the fills into trades, and shows your dollars and profit factor, so what you type is only the setup and the note.

If you're starting from scratch, read [what a trading journal is](/guides/what-is-a-trading-journal/) first.

---

Marble does the dollar arithmetic for you and keeps your notes with your trades and a photo with each day. [Try Marble](https://trademarble.app).

*Marble is a trading journal. Nothing here is financial advice.*
