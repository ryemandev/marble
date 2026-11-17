---
title: "How to Track Multiple Prop Firm Accounts in One Journal"
description: "Track several prop firm accounts: name and import each one separately, log every account's limits daily, handle copied trades, and keep a ledger of fees."
slug: tracking-multiple-prop-firm-accounts
date: 2026-10-29
updated: 2026-11-05
author: Marble
keywords: ["track multiple prop firm accounts", "multiple funded accounts journal", "prop firm account tracker", "copy trading prop accounts journal", "prop firm fees and payouts tracker"]
related: ["prop-firm-evaluation-journal", "trailing-drawdown-explained", "how-to-export-trades-from-tradovate", "how-to-export-trades-from-topstepx"]
faq:
  - q: "Should copied trades count once or once per account?"
    a: "Both, for different questions. Count a copied trade once when you judge your decisions (win rate, expectancy, on plan or off plan). Sum the accounts when you want the money."
  - q: "Can I copy trades between my own prop firm accounts?"
    a: "It depends on the firm. Many futures firms allow copying between accounts you own, some ban copy software, and copying other people's trades is generally prohibited. Check your firm's current rules."
  - q: "Should I delete a breached account from my journal?"
    a: "No. Archive it. Its trades are part of your record, and breaches are among the most useful things to review."
---

To track multiple prop firm accounts, give each one its own account in your journal with a consistent name (firm, stage, size, number), import each account's trades separately, and log a daily line per account with its balance, drawdown floor and daily limit. If you copy trades across accounts, judge your decisions once, on a lead account, but keep each account's fills, because fees and rules can differ. Keep a separate ledger of evaluation fees and payouts, so you know whether the accounts are profitable as a whole.

## Why several accounts get messy

With one account, your platform's balance tells you most of what you need. With four or five, spread across firms, stages and platforms, it's easy to lose track of:

- which account is nearest its floor today,
- which ones have a consistency rule, and how close you are,
- what you've spent on evaluations and resets,
- and whether your trading is improving, or just multiplied.

A journal set up for several accounts answers all four.

## Name every account the same way

Pick a pattern and never break it. For example:

| Name | Firm | Stage | Size | Platform account |
|---|---|---|---|---|
| Apex · Eval · 50K · #1 | Apex Trader Funding | Evaluation | $50,000 | (the ID from your platform) |
| Apex · Funded · 50K · #1 | Apex Trader Funding | Funded | $50,000 | (ID) |
| Topstep · Combine · 50K | Topstep | Evaluation | $50,000 | (ID) |
| FTMO · Challenge · 100K | FTMO | Evaluation | $100,000 | (login) |

Include the platform's account ID or login somewhere, because that's what appears in export files. When an account passes and a new funded account is issued, create a new journal account for it rather than renaming the old one, so the evaluation's history stays intact.

## Import each account separately

- **One file per account** where you can. Name it by account and date range.
- **Multi-account files** (some platforms put an Account column in the export): choose the account on import, or split the file.

Platform guides: [Tradovate](/guides/how-to-export-trades-from-tradovate/), [TopstepX](/guides/how-to-export-trades-from-topstepx/), [Rithmic](/guides/how-to-export-trades-from-rithmic-r-trader-pro/), [NinjaTrader 8](/guides/how-to-export-trades-from-ninjatrader-8/), [MetaTrader](/guides/how-to-export-trade-history-from-mt5-and-mt4/) and [cTrader](/guides/how-to-export-trades-from-ctrader/).

## A daily line per account

At the end of each session, one row per open account. All figures here are illustrations:

| Account | Balance | Floor | Room | Daily limit left | Best day % | Days | Status |
|---|---|---|---|---|---|---|---|
| Apex · Eval · 50K · #1 | $51,300 | $49,300 | $2,000 | full | 38% | 6 | On track |
| Apex · Funded · 50K · #1 | $50,450 | $48,450 | $2,000 | full | n/a | 14 | Payout window |
| Topstep · Combine · 50K | $49,100 | $48,000 | $1,100 | full | 61% | 3 | Near floor |

Sort by **room**, smallest first. The account at the top is the one that needs the most care tomorrow. How each firm calculates the floor differs; see [trailing drawdown explained](/guides/trailing-drawdown-explained/).

## Copy trading across your own accounts

Many traders run the same trades on several accounts with a trade copier. Whether that's allowed depends on the firm:

- Many futures firms allow copying between accounts you own.
- Some firms ban copy-trading software altogether.
- Copying someone else's trades, or trading as a group, is generally prohibited.
- Firms often cap how many funded accounts you can hold at once; comparisons published in 2026 put a common cap at around five.

Check your firm's current rules before you copy anything.

### How to journal copied trades

Copied trades raise a counting problem. As an example, if one decision runs on five accounts and makes $400 on each, that's $2,000 in your accounts but only one decision.

- **For process stats** (win rate, expectancy, grades, on plan or off plan), use **one lead account**, or count each decision once.
- **For money,** sum the accounts: that's what you actually made or lost.
- **Keep every account's fills.** Slippage, fees and partial fills differ between accounts, and each account's limits depend on its own numbers.
- **Write your notes once,** on the lead account's trade.

## Keep a ledger of fees and payouts

Prop trading has costs that never appear in a trade export. Track them separately, in the currency you pay and receive:

| Date | Account | Item | Paid | Received |
|---|---|---|---|---|
| 2 Oct | Apex · Eval · 50K · #1 | Evaluation fee | £X | |
| 9 Oct | Topstep · Combine · 50K | Reset fee | £X | |
| 14 Oct | Apex · Funded · 50K · #1 | Activation fee | £X | |
| 28 Oct | Apex · Funded · 50K · #1 | Payout | | £X |

Add data or platform fees too, such as a paid API add-on. Over a quarter, payouts minus costs tells you whether the whole operation is in profit, which trading P&L on its own can't. If you need figures for tax, keep your firms' statements and speak to an accountant.

## Review across accounts weekly

In your [weekly review](/guides/how-to-review-your-trades-weekly/), add three questions:

1. **Which account came closest to a limit,** and why?
2. **Do I trade differently** on evaluations than on funded accounts: more trades, more size, different setups?
3. **Is the ledger moving the right way** this month?

For each evaluation's own rules, see [how to journal a prop firm evaluation](/guides/prop-firm-evaluation-journal/).

## Archive, don't delete

When an account passes, fails or is closed, archive it. Its trades still belong in your record, and a breached account is often the most instructive thing you'll review.

Marble tracks any number of accounts, each with its firm, and adds them into one total P&L that you can filter to one account, several or all. When an export holds several accounts it asks which one to import, and old accounts can be archived with their history kept.

---

Marble keeps every prop account in one journal, each with its own trades and history. [Try Marble](https://trademarble.app).

*Marble isn't affiliated with or endorsed by any prop firm named. Always check your firm's current rules.*

*Marble is a trading journal. Nothing here is financial advice.*
