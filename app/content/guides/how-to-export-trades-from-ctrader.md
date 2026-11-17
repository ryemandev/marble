---
title: "How to Export Trade History from cTrader (Statement)"
description: "Export your cTrader trade history as an XLSX or HTML statement, choose the right columns, keep it in English, and read net vs gross P&L correctly."
slug: how-to-export-trades-from-ctrader
date: 2026-10-29
updated: 2026-11-05
author: Marble
keywords: ["export trades from ctrader", "ctrader statement export", "ctrader trade history excel", "ctrader history export", "ctrader journal import"]
related: ["how-to-export-trade-history-from-mt5-and-mt4", "tracking-multiple-prop-firm-accounts", "how-to-calculate-r-multiple", "trailing-drawdown-explained"]
faq:
  - q: "Can I export Excel from cTrader Web?"
    a: "Reports differ. cTrader staff have said the web version offers an HTML statement, and a later reply said some export options are desktop-only. If you need XLSX, use cTrader Desktop."
  - q: "Why must the cTrader statement be in English?"
    a: "The column names follow the platform's language. Journals recognise the file by its English headers, such as Opening Time and Net USD, so switch cTrader to English before exporting."
  - q: "Does the cTrader statement include commission and swap?"
    a: "Yes, as separate columns, alongside gross and net P&L in your account currency. Check that those columns are switched on before you export."
---

To export your trade history from cTrader, open the **History** tab, set the date range and account, then click **Statement** and choose **XLSX** or **HTML** from the arrow beside it. Before you export, right-click the column headings to make sure every trade detail column is ticked, and set cTrader's language to English, because journals recognise the file by its English column names. The statement gives one row per closed position, with commission, swap and net P&L in your account currency.

Several forex and CFD prop firms offer cTrader, including FTMO, The5ers, FundingPips, Goat Funded Trader and For Traders, as listed in October 2026. Platforms vary by firm and account type, so check yours.

## How to export a cTrader statement on desktop (step by step)

1. **Open cTrader Desktop** and log in with your cTrader ID.
2. **Choose the account** from the account selector, if you have more than one.
3. **Click the History tab** at the bottom of the platform.
4. **Set the date range** with the date picker at the top of the History panel, or choose all history.
5. **Choose the columns.** Right-click the column headings and tick every trade detail column. Only ticked columns are exported.
6. **Click Statement** in the top-right of the History panel, then use the **arrow beside it** to pick **XLSX** or **HTML**.
7. **Save the file,** named by account and dates.

These steps follow broker and journal help pages rather than a single official guide, and cTrader's layout varies a little between brokers' builds. If yours differs, check your broker's or firm's help centre.

## How to export on cTrader Web

1. **Log in** at your broker's cTrader Web address.
2. **Click History** in the left-hand menu.
3. **Set the dates and account** with the filters at the top.
4. **Click Statement.**

cTrader staff have said the web version offers an HTML statement, and a later reply said some export options are only on desktop. If you need XLSX, or the button isn't there, use cTrader Desktop. Copy-trading accounts have also been reported to offer an HTML statement only.

## Set cTrader to English first

The statement's column names follow the platform's language. A journal that expects `Opening Time` won't recognise the same column in another language. Switch cTrader to English (cTrader's help centre explains how to change language for your cTrader ID), export, then switch back if you like.

## What's in the cTrader statement?

One row per closed position. With all columns ticked, expect:

| Column | What it holds |
|---|---|
| `Opening Time`, `Closing Time` | When the position opened and closed |
| `Symbol` | For example EURUSD or XAUUSD |
| `Opening Direction` | Buy or Sell |
| `Closing Direction` | The opposite side, on the exit |
| `Entry Price`, `Closing Price` | Average entry and exit |
| `Closing Quantity` | The size closed |
| `Order ID` | The ID that identifies the position's order |
| `Commission`, `Swap` | Costs, usually written as negatives |
| `Gross USD`, `Net USD` | P&L before and after costs, in your account currency |

The P&L headers carry your account's currency code, so an account in euros shows `Gross EUR` and `Net EUR`. **Net** already includes commission and swap; don't subtract them twice.

A position closed in parts can appear as more than one row, each with its own closing quantity.

## Time zone

cTrader shows times in the time zone set in the platform, which isn't necessarily UK time. Before you import, compare one trade's opening time in the file with when you remember taking it, and tell your journal the zone the file is in. Get this wrong and your time-of-day stats will be off by hours.

## Why the stop isn't in the statement

The statement gives what happened, not what you planned. It doesn't hold your initial stop, so it can't show what you risked on its own. Add your initial stop in your journal, so you can see the [dollars at risk](/guides/how-to-calculate-r-multiple/).

## How to import a cTrader statement into a journal

1. **Upload the XLSX or HTML file as saved.** Don't copy it into another spreadsheet first.
2. **Choose the account.** Keep each prop-firm account separate; see [tracking multiple prop firm accounts](/guides/tracking-multiple-prop-firm-accounts/).
3. **Set the time zone** you checked above.
4. **Check two or three trades** against cTrader, including the net P&L.
5. **Add your stop, setup and notes.**

Marble reads the cTrader statement in XLSX or HTML. It picks up the account currency from the `Net` column's name, keeps commission and swap with each trade, and skips trades it already has, so overlapping exports are safe.


## Troubleshooting

- **The journal doesn't recognise the file.** It was exported in another language, or some columns weren't ticked. Switch to English, tick all columns and export again.
- **P&L is double-counted on costs.** The journal subtracted commission and swap from a net figure. Use gross minus costs, or net on its own.
- **Prices or balances look like text.** Older forum reports mention thousands separators causing this. Upload the file untouched rather than re-saving it.
- **Trades are missing.** Widen the date range, and check the right account is selected.

If you also trade MetaTrader accounts, see [how to export trade history from MT5 and MT4](/guides/how-to-export-trade-history-from-mt5-and-mt4/).

---

Marble imports cTrader statements alongside your other accounts, so every firm's trades are reviewed in one place. [Try Marble](https://trademarble.app).

*cTrader and the firms named are trademarks of their owners. Marble isn't affiliated with or endorsed by them.*

*Marble is a trading journal. Nothing here is financial advice.*
