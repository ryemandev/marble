# Search pages: the 12-week plan

About 300 pages, released a batch a week from Monday 2 November 2026. Each page's `date` is its release day: the build skips any page dated in the future, so a batch can be written early and goes live with the first deploy on or after its Monday. Each batch still needs the owner's OK to deploy.

Rules for every page:

- Built on facts Marble holds or has checked: the firm rules data (`src/lib/firm-rules`), contract specs, the importer's formats, or a cited source.
- Firm figures come from the data, never retyped. If a firm's data is re-checked, its pages update on the next build.
- Never promise profits or tell anyone what to trade.
- Title 60 characters or fewer, description 160 or fewer.
- No two pages target the same search. Pick one and link to it from the other.

| Week | Monday | Pages | What |
|---|---|---|---|
| 1 | 2 Nov 2026 | 23 | `/prop-firms/` and one page per firm (22). **Built.** |
| 2 | 9 Nov | 26 | `/futures/` and contract pages (ES, MES, NQ, MNQ, YM, MYM, RTY, M2K, CL, MCL, GC, MGC, plus 6E, ZN, SI, NG from CME's specs), `/glossary/` and its first 8 terms |
| 3 | 16 Nov | 25 | Rule-filter lists from the data: prop firms with no daily loss limit, with end-of-day drawdown, with static drawdown, with no consistency rule, that allow news trading, that allow overnight holds, instant funding, one-step and two-step evaluations, by account size. Plus the first 15 programme pages |
| 4 | 23 Nov | 25 | Programme pages, futures firms (`/prop-firms/<firm>/<programme>/`, every size in full) |
| 5 | 30 Nov | 25 | Programme pages, forex and CFD firms |
| 6 | 7 Dec | 25 | 10 firm-vs-firm comparisons (Apex vs Topstep, Topstep vs Tradeify, FTMO vs FundedNext…), 15 glossary terms |
| 7 | 14 Dec | 25 | 10 comparisons, 15 glossary terms |
| 8 | 21 Dec | 25 | 10 comparisons, 5 articles, 10 glossary terms |
| 9 | 28 Dec | 25 | 10 articles, 15 glossary terms |
| 10 | 4 Jan 2027 | 25 | 10 articles, 15 glossary terms |
| 11 | 11 Jan | 25 | Export guides for every format the importer reads that has none yet, 10 articles, the last glossary terms |
| 12 | 18 Jan | 25 | Remaining programme pages and comparisons people search for most |

## Glossary terms (about 90)

Trailing drawdown, end-of-day drawdown, intraday drawdown, static drawdown, daily loss limit, maximum loss limit, consistency rule, profit target, evaluation, funded account, instant funding, payout, profit split, scaling plan, minimum trading days, news trading rule, overnight hold, R multiple, expectancy, profit factor, win rate, average win, average loss, risk-reward ratio, position sizing, tick, tick value, point value, contract, micro contract, lot, pip, leverage, margin, slippage, commission, round turn, stop loss, take profit, breakeven, scaling in, scaling out, MAE, MFE, drawdown, equity curve, Sharpe ratio, trading plan, playbook, setup, A+ setup, revenge trading, overtrading, FOMO, tilt, trading journal, trade review, session (Asia, London, New York), market open, RTH and ETH, Globex, rollover, front month, liquidity, volatility, ATR, VWAP, support and resistance, order flow, DOM, limit order, market order, stop order, bracket order, OCO, partial fill, fill, execution, P&L, gross and net P&L, realised and unrealised P&L, balance and equity, high-water mark, reset, activation fee, copy trading, trade copier.

## Articles (about 45)

How a prop firm evaluation measures you, rule by rule, how trailing drawdown really eats a winning day, end-of-day vs intraday drawdown with worked trades, how to plan a payout under a consistency rule, why most evaluations fail on the daily loss limit, how to size for a $2,000 drawdown, how to journal a funded account, how to recover after a red week, how many trades before your stats mean anything, how to find your best trading hours, how to grade a trade, how to set daily loss rules for yourself, how to track fees and payouts across firms, trading journal vs spreadsheet, what to write after each trade, building a pre-market routine, how to review a losing streak, and the rest as the search data shows demand.
