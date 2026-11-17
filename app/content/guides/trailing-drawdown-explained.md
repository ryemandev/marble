---
title: "Trailing Drawdown Explained: Intraday vs End-of-Day"
description: "How prop firm trailing drawdown works: static, end-of-day and intraday trailing, when the floor locks, worked examples, and how to track it in a journal."
slug: trailing-drawdown-explained
date: 2026-10-29
updated: 2026-11-05
author: Marble
keywords: ["trailing drawdown explained", "intraday trailing drawdown", "end of day trailing drawdown", "prop firm drawdown", "trailing drawdown lock"]
related: ["prop-firm-evaluation-journal", "tracking-multiple-prop-firm-accounts", "how-to-calculate-r-multiple", "how-to-stop-revenge-trading"]
faq:
  - q: "Does trailing drawdown include unrealised profit?"
    a: "It depends on the firm and the account type. Some intraday trailing drawdowns follow your equity including open profit; others follow closed balance only. Your firm's rules page will say which."
  - q: "What does it mean when a trailing drawdown locks?"
    a: "On many accounts the floor stops moving up once it reaches a set level, often around the starting balance. After that it behaves like a static limit, so further profit adds to your buffer."
  - q: "Is trailing drawdown the same as a daily loss limit?"
    a: "No. A daily loss limit caps what you can lose in one trading day and resets. Trailing drawdown is an account-wide floor that follows your high point and doesn't reset."
---

A trailing drawdown is a loss limit that moves up as your account makes new highs. Your balance must never fall to the floor, which sits a fixed amount below your highest point. With **end-of-day** trailing, the floor moves only at the close, based on your closing balance; with **intraday** trailing, it moves in real time as your balance, and on some accounts your open profit, reaches new highs. On many accounts the floor stops trailing once it reaches a set level. The exact rules vary by firm, so always check your firm's current rulebook.

## The three kinds of drawdown limit

| Type | How the floor moves | What it means for you |
|---|---|---|
| **Static** | Never moves | Your room only grows as you profit |
| **End-of-day trailing** | Rises at the close if your closing balance is a new high | Intraday swings don't move it; only where you finish the day |
| **Intraday trailing** | Rises in real time with each new high | Profit you give back during the day can still cost you room |

Names vary: maximum loss limit, trailing threshold, max drawdown. They describe the same idea, but the details behind each name differ from firm to firm.

## Worked example: one trade, three rules

All figures are illustrations. A $50,000 account has a $2,000 drawdown, so the floor starts at **$48,000**.

You start the day at $50,000. A trade goes **$1,200 into profit**, so your equity touches $51,200. Then the market turns and you close it at **+$200**, finishing the day at **$50,200**.

| Rule | Floor after the day | Room left (balance − floor) |
|---|---|---|
| Static | $48,000 | $2,200 |
| End-of-day trailing | $48,200 | $2,000 |
| Intraday trailing on closed balance | $48,200 | $2,000 |
| Intraday trailing including open profit | $49,200 | **$1,000** |

Same trade, same result. Under the last rule, the open profit you gave back took half your room, even though the trade made money.

## Worked example: a week of end-of-day trailing

Same illustrative account, end-of-day trailing, $2,000 drawdown.

| Day | Closing balance | Highest close so far | Floor | Room left |
|---|---|---|---|---|
| Start | $50,000 | $50,000 | $48,000 | $2,000 |
| Mon | $50,600 | $50,600 | $48,600 | $2,000 |
| Tue | $50,100 | $50,600 | $48,600 | $1,500 |
| Wed | $51,000 | $51,000 | $49,000 | $2,000 |
| Thu | $50,400 | $51,000 | $49,000 | $1,400 |
| Fri | $50,900 | $51,000 | $49,000 | $1,900 |

Notice that your room is never more than $2,000 while the floor is trailing. Profit raises the floor, so it doesn't add to your cushion; only losses from a high reduce it. That's the defining feature of a trailing drawdown, and the reason it feels tighter than the headline number.

## When the floor locks

On many accounts the trailing stops once the floor reaches a set level, often around the starting balance. Continuing the illustration: if the floor locked at $50,000, it would lock once your highest close reached $52,000. From then on it stays at $50,000, so a balance of $53,000 gives you $3,000 of room, and the limit behaves like a static one.

Where the lock sits, and whether it's based on closing or intraday highs, is one of the most important things to read in your firm's rules.

## Trailing drawdown vs daily loss limit

They're separate rules, and many accounts have both:

- **Daily loss limit:** caps what you can lose in one trading day, then resets for the next day.
- **Trailing drawdown:** an account-wide floor that follows your high point and doesn't reset.

On a given day, the one that binds is whichever is closer. If your daily loss limit is $1,000 but you're only $700 above the floor, the floor is your real limit that day. See [how to journal a prop firm evaluation](/guides/prop-firm-evaluation-journal/) for a daily checklist.

## Forex and CFD accounts

Many forex and CFD prop firms use a different model: a maximum loss fixed relative to the starting balance, plus a daily loss limit measured from the day's starting balance or equity. Whether open positions count, and which figure the daily limit is measured from, varies. The same principle holds: write down exactly how your firm measures it.

## Questions to answer from your firm's rules

1. Is the drawdown static, end-of-day trailing or intraday trailing?
2. If intraday, does it follow **closed balance** or **equity including open profit**?
3. Does it stop trailing, and at what level?
4. Does the evaluation use the same rule as the funded account?
5. How does it interact with the daily loss limit?

Firms change these rules often. Re-read them when you buy an account and before each payout.

## How to track trailing drawdown in your journal

Your platform shows your balance; your journal should show your **room**.

- **Each day, log:** closing balance, the highest balance your firm's rule uses, the floor, and the room left.
- **Before each session, write the room in dollars.** As an example, if you usually risk $250 a trade and you have $1,000 of room, that's four full losses. (Some traders write that as 4R; see [how to calculate R multiple](/guides/how-to-calculate-r-multiple/).)
- **On intraday trailing, note big give-backs.** A trade that went well into profit and closed near flat may have cost you room even if it made money. Tagging these shows how often it happens.
- **After a breach or near miss,** review what led up to it, including how you felt. Trades taken to win back a loss are a common thread; see [how to stop revenge trading](/guides/how-to-stop-revenge-trading/).

If you run several accounts, track each floor separately; see [tracking multiple prop firm accounts](/guides/tracking-multiple-prop-firm-accounts/).

Marble can show one account at a time or several together, and Stats shows your P&L curve and deepest drawdown from a high point. Pick your firm and plan when you add an account and the Desk shows its room to the drawdown, worked out from your trades. Your firm's dashboard always has the final word.

---

Marble tracks every prop account you add, with your P&L in dollars and each account's room to drawdown. [Try Marble](https://trademarble.app).

*Marble isn't affiliated with or endorsed by any prop firm. Always check your firm's current rules.*

*Marble is a trading journal. Nothing here is financial advice.*
