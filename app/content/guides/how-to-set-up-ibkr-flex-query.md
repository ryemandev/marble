---
title: "How to Set Up an IBKR Flex Query for a Trading Journal"
description: "Create an Interactive Brokers Activity Flex Query with the right trade fields, set CSV delivery, and download the report for your journal."
slug: how-to-set-up-ibkr-flex-query
date: 2026-10-29
updated: 2026-11-05
author: Marble
keywords: ["ibkr flex query", "interactive brokers flex query setup", "export trades interactive brokers", "ibkr trading journal"]
related: ["trading-journal-for-futures-traders-uk", "how-to-calculate-r-multiple", "trading-journal-spreadsheet-template"]
faq:
  - q: "Why can't I see a Flex Query I created?"
    a: "Flex Queries belong to the username that created them. Log in to the portal with that same username to see or edit them."
---

To get your Interactive Brokers trades into a journal, create an **Activity Flex Query** in the client portal under **Performance & Reports → Flex Queries**, tick the **Trades** section with execution-level fields, set the delivery format to **CSV**, and save it. You can then run it whenever you like, download the file and import it.

## What is a Flex Query?

A Flex Query is a report template you build once in IBKR's portal: you choose the sections, the fields and the format. Each time it runs, IBKR fills it with up-to-date data. That makes it a reliable way to get every execution, with commissions, in a consistent layout.

## How to create an Activity Flex Query (step by step)

Menu names in IBKR's portal change from time to time. These steps match the layout in October 2026; if yours differs, check IBKR's help pages for Flex Queries.

1. **Log in to the client portal** and open **Performance & Reports → Flex Queries**.
2. **Create a new Activity Flex Query** (the **+** beside Activity Flex Query) and give it a name such as "Journal trades".
3. **Sections: tick Trades,** and choose the **Executions** level of detail.
4. **Select these fields:** Account ID, Symbol, Date/Time, Buy/Sell, Quantity, Trade Price, IB Commission, Multiplier, Trade ID and Open/Close Indicator. You can tick more, but these are the ones a journal needs.
5. **Delivery configuration:**
   - Format: **CSV**
   - Include header and trailer records: **No**
   - Include column headers: **Yes**
   - Include section code and line descriptor: **No**
   - Period: **Last 365 Calendar Days**
6. **General configuration:**
   - Date format: **yyyyMMdd**
   - Time format: **HHmmss**
   - Date/time separator: **; (semicolon)**
7. **Save the query.**

### Why these fields matter

- **Multiplier** turns a price move into money. For futures it's the point value, so without it a journal can't work out P&L.
- **Open/Close Indicator** tells the journal whether each execution opened or closed a position. That matters when a report starts while you were already in a trade.
- **Trade ID** lets a journal recognise executions it already has, so running the report again doesn't create duplicates.
- **IB Commission** is written as a negative number, as a cost.

Some tools that read Flex reports don't support day-first dates (dd/MM), which is one reason to use yyyyMMdd: it can't be misread.

## Download the file

On the Flex Queries page, run the query, choose CSV if asked, and download the report. Import that file into your journal like any other export. Repeat whenever you want to bring in new trades.

## Time zone and dates

Flex reports write times without a zone. They follow your account's reporting time zone, which is often US Eastern. Check one trade you remember against the report, and set the same zone in your journal.

## Futures in IBKR reports

For futures, a few fields are worth checking once:

- **Symbol** may include the contract month (for example `MESZ6`), depending on the fields you pick. A journal should group months under one market.
- **Multiplier** is the dollars per point, for example 5 for MES and 20 for NQ.
- **Quantity** may be negative for sells. With Buy/Sell included, a journal can read the side from that instead.

Once trades are in, add your initial stop to each, so you can see the [dollars at risk](/guides/how-to-calculate-r-multiple/). If you'd rather keep a spreadsheet, the same fields map onto the columns in our [trading journal spreadsheet template](/guides/trading-journal-spreadsheet-template/).

## Troubleshooting

- **The report is empty.** Check the query's period and that the right account is ticked in the delivery settings.
- **Duplicate trades.** Trade ID wasn't in the query. Add it, then remove the duplicate import.
- **Positions look reversed.** Open/Close Indicator is missing, so a closing execution from before the report's start was read as an opening one. Add the field.
- **Wrong P&L on futures.** Multiplier is missing.

UK trader using IBKR for futures? See [what UK futures traders need from a journal](/guides/trading-journal-for-futures-traders-uk/).

---

Marble imports this report as a file. [Start with Marble](https://trademarble.app).

*Interactive Brokers is a trademark of its owner. Marble isn't affiliated with or endorsed by Interactive Brokers.*

*Marble is a trading journal. Nothing here is financial advice.*
