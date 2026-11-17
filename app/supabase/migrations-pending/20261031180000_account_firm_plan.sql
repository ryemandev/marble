-- Prop firm rules per account: which of the firm's rule sets an account runs on, and which stage it's at, so the desk
-- can hold the firm's live rules (daily loss, drawdown, target, consistency, days, contracts) against the account's
-- own trades. NOT APPLIED. Written 31 October 2026 (renumbered from 20261031100000, which News took). Undo: section
-- 28 of ROLLBACK.md.
--
-- firm_plan   the rule set's id in src/lib/firm-rules (firm.program.size, e.g. "topstep.trading-combine.50k",
--             "ftmo.2-step.100k"); null for an account with no firm rules (a broker, or the trader's own rules only)
-- firm_phase  the stage within it, by kind and path: "evaluation", "evaluation_step2", "funded:consistency",
--             "live#2"; null means the first stage
--
-- The rules themselves are public data shipped with the app (from the firms' own pages), never stored per trader.
-- accounts already has row level security ("own accounts": a trader reads and writes only their own rows) and
-- table-level grants to authenticated, which cover new columns, so nothing else changes.
--
-- Deploy with it: the app build that reads and writes these. Apply this first: the account form sends them once a
-- trader picks a plan (src/live/sync.js accountOut), while accounts without a plan, and setup, save either way.

begin;

alter table public.accounts
  add column if not exists firm_plan text
    constraint accounts_firm_plan_check check (firm_plan is null or firm_plan ~ '^[a-z0-9][a-z0-9.-]{2,119}$'),
  add column if not exists firm_phase text
    constraint accounts_firm_phase_check check (firm_phase is null or firm_phase ~ '^[a-z0-9_]{1,24}(:[a-z0-9_-]{1,24})?(#[0-9])?$');

comment on column public.accounts.firm_plan is 'The prop firm rule set this account runs on (src/lib/firm-rules id: firm.program.size), or null.';
comment on column public.accounts.firm_phase is 'The stage of firm_plan the account is at (evaluation, evaluation_step2, funded:consistency, live#2…); null = the first.';

commit;
