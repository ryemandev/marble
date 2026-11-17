alter table public.accounts
  add column if not exists firm_plan text
    constraint accounts_firm_plan_check check (firm_plan is null or firm_plan ~ '^[a-z0-9][a-z0-9.-]{2,119}$'),
  add column if not exists firm_phase text
    constraint accounts_firm_phase_check check (firm_phase is null or firm_phase ~ '^[a-z0-9_]{1,24}(:[a-z0-9_-]{1,24})?(#[0-9])?$');

comment on column public.accounts.firm_plan is 'The prop firm rule set this account runs on (src/lib/firm-rules id: firm.program.size), or null.';
comment on column public.accounts.firm_phase is 'The stage of firm_plan the account is at (evaluation, evaluation_step2, funded:consistency, live#2…); null = the first.';;
