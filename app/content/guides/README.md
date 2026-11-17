# Marble guides

SEO guide articles served at `trademarble.app/guides/<slug>/`. Each file is Markdown with YAML frontmatter (`title`, `description`, `slug`, `date`, `updated`, `author`, `keywords`, `related`, optional `faq` as `{q, a}` pairs). The body has no H1: the page generator renders `title` as the heading. Bodies start with the answer paragraph, use H2/H3 for sub-questions, and link to each other as `/guides/<slug>/`.

## Batch 1 (29 October 2026)

| Slug | Summary |
|---|---|
| `what-is-a-trading-journal` | What a trading journal is, what to record (facts, plan, process, context), why dollars come first, and paper vs spreadsheet vs app. |
| `how-to-export-trades-from-tradovate` | Exporting Tradovate's Performance and Orders reports as CSV, what each contains, the missing-commissions caveat and importing. |
| `how-to-export-trades-from-topstepx` | Exporting TopstepX's Trades tab and reading its UTC times. |
| `how-to-export-trades-from-rithmic-r-trader-pro` | Exporting R \| Trader Pro Order History, showing hidden columns (Qty Filled, Order Number), the short export window, and fills to trades. |
| `how-to-export-trades-from-ninjatrader-8` | Exporting NinjaTrader 8 Executions or Trades from Trade Performance, and the semicolon, decimal-comma and date-order gotchas. |
| `how-to-export-trade-history-from-mt5-and-mt4` | MT5 History → Report and MT4 Detailed Statement step by step, what's inside, and handling broker server time. |
| `how-to-calculate-r-multiple` | The R multiple formula with worked NQ ($20/point) and MNQ ($2/point) examples, expectancy, and common mistakes, for traders who also measure in R. Marble works in dollars. |
| `prop-firm-evaluation-journal` | Journaling an evaluation: daily loss limits, trailing drawdown types, consistency rules, a pre-session checklist and breach reviews (general, not firm-specific). |
| `how-to-review-your-trades-weekly` | A 45-minute weekly review: complete the data, setups that pay, mistakes ranked by cost in dollars, one rule to fix, and a template. |
| `trading-journal-for-futures-traders-uk` | What UK futures and prop traders need: New York hours on UK time (including clock-change weeks), dollars vs pounds, UK GDPR, imports and how to choose. |

## Batch 2 (29 October 2026)

| Slug | Summary |
|---|---|
| `how-to-export-trades-from-ctrader` | Exporting a cTrader statement (XLSX or HTML) from History, ticking all columns, exporting in English, and net vs gross P&L. |
| `how-to-set-up-ibkr-flex-query` | Building an IBKR Activity Flex Query with execution fields and CSV delivery, then downloading the file. |
| `trading-journal-spreadsheet-template` | The column list as a table, with Excel/Sheets formulas for dollars at risk, P&L, expectancy, profit factor and R, plus a summary tab. No downloadable file. |
| `what-is-expectancy-in-trading` | The expectancy formula in dollars and R, win rate vs expectancy, breakeven win rate, and why small samples mislead. |
| `trailing-drawdown-explained` | Static, end-of-day and intraday trailing drawdown with worked examples (labelled as illustrations), locking, and how to track your room. |
| `how-to-stop-revenge-trading` | Recognising revenge trading, measuring its cost in dollars, rules set in advance, a routine for the moment, and weekly review. |
| `futures-market-hours-uk-time` | CME Globex hours in CT, ET and UK time, the daily break, grains, trade dates, and the 2026/2027 clock-change gap weeks. |
| `what-is-profit-factor` | Profit factor formula and steps, how it links to win rate and expectancy, and what it doesn't tell you. |
| `how-to-write-a-trading-playbook` | What a setup playbook contains, how to write yes-or-no rules, a fill-in template (format only, no strategies), and how to review it. |
| `tracking-multiple-prop-firm-accounts` | Naming and importing each account, a daily line per account, journaling copied trades, and a fees-and-payouts ledger. |

## Batch 3 (6 November 2026)

| Slug | Summary |
|---|---|
| `free-tradezella-alternative` | What Marble gives for free against TradeZella, and what a trader gives up. |
| `free-tradervue-alternative` | The same against Tradervue. |
| `free-edgewonk-alternative` | The same against Edgewonk. |

## Keep these facts current

- Rival prices and free plans in these three guides and `src/site/journals/copy.js` were read on 6 November 2026. Re-check every few months.

- Prop-firm-to-platform lists are "as listed in October 2026" (from `src/site/works/firms.js`). Re-check every few months.
- TopstepX API price ($29/month, 50% code) is quoted from Topstep's help centre in October 2026.
- Clock-change dates in the UK guide and `futures-market-hours-uk-time` give 2026 and 2027; add the next year each autumn. Both also mention "late October 2026" as the time of writing.
- CME hours in `futures-market-hours-uk-time` come from a broker's summary of CME hours (October 2026). Check them against CME's own trading-hours pages, especially grains.
- The IBKR Flex Query settings match what Marble's importer reads (`src/live/import/ibkr.js`). If the importer changes, update the guide.
- Copy-trading rules and funded-account caps in `tracking-multiple-prop-firm-accounts` are described in general terms only.
- Platform menu names come from platform and journal help pages, not hands-on testing. Where sources disagreed (Rithmic's export window, Tradovate's menu path), the guides say so.
