-- Fees & payouts: what a trader has paid prop firms and what the firms have paid them (the receipt screen,
-- src/views/Money.jsx). NOT APPLIED. Written 31 October 2026 for review. Apply it BEFORE deploying the app build that
-- has the Fees & payouts screen: that build reads and writes this table. Until it exists, the app still loads, the
-- screen says "Your fees and payouts didn't load just now" and nothing can be added (live/sync.js loads it apart).
--
-- What it makes:
--   prop_money  one row per fee or payout the trader types in:
--     day           the date it was paid (a date, no time)
--     firm          the firm's slug from Marble's firm list ("apex", "topstep"), or the name the trader typed
--     account_id    optional: one of the trader's own accounts. Deleting the account deletes its rows (cascade),
--                   as the app says when it asks; archiving it keeps them.
--     kind          eval | reset | activation | data | other (fees) or payout (money back)
--     amount_minor  the amount in the currency's smallest unit (pence, cents): a whole number from 1 to 100,000,000
--                   (£1m), always positive; the kind says which way it went
--     currency      GBP, USD or EUR. Never converted: the app adds each currency up on its own.
--     note          optional, up to 140 characters
-- They are the trader's own figures. Nothing checks them with a firm, and the app never calls them verified.
--
-- Access, the same as the rest of the journal:
--   * row level security; a trader reads, adds, changes and deletes only their own rows (user_id = auth.uid())
--   * a row can only link the trader's own account (checked in the insert and update policies)
--   * the paywall: the same RESTRICTIVE has_access() policies on insert and update as notes and Study ("paid: add",
--     "paid: change"); reading and deleting stay open, so a lapsed trader can still read, export and delete
--   * anon gets nothing; authenticated gets select, insert, update, delete
--   * user_id references auth.users on delete cascade, so delete-account removes them with the rest
--
-- The app's "Your data" export reads it like the other tables (live/sync.js exportAll: "prop_money").
--
-- Undo (deletes every fee and payout traders have entered, so export them first):
--   drop table if exists public.prop_money;
--   drop function if exists public.prop_money_touch();

begin;

create table public.prop_money (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  day date not null check (day between date '2000-01-01' and date '2100-12-31'),
  firm text not null check (char_length(btrim(firm)) between 1 and 60 and firm = btrim(firm)),
  kind text not null check (kind in ('eval', 'reset', 'activation', 'data', 'other', 'payout')),
  amount_minor integer not null check (amount_minor between 1 and 100000000),
  currency text not null default 'GBP' check (currency in ('GBP', 'USD', 'EUR')),
  note text check (note is null or char_length(note) <= 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.prop_money is 'Fees & payouts: a trader''s own record of prop firm fees (eval, reset, activation, data, other) and payouts. Typed in by the trader, never checked with a firm.';
comment on column public.prop_money.amount_minor is 'In the currency''s smallest unit (pence, cents), always positive; kind = payout is money back.';
comment on column public.prop_money.firm is 'A slug from Marble''s firm list (src/site/works/firms.js), or the name the trader typed.';
create index prop_money_user on public.prop_money (user_id, day);
create index prop_money_account on public.prop_money (account_id) where account_id is not null;

-- ---------- updated_at ----------
create or replace function public.prop_money_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger prop_money_touch before update on public.prop_money for each row execute function public.prop_money_touch();

-- ---------- Row level security ----------
alter table public.prop_money enable row level security;

create policy "own money: read" on public.prop_money for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own money: add" on public.prop_money for insert to authenticated
  with check (user_id = (select auth.uid())
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))));
create policy "own money: change" on public.prop_money for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))));
create policy "own money: remove" on public.prop_money for delete to authenticated
  using (user_id = (select auth.uid()));
-- The paywall: adding and changing need a trial, a plan or lifetime. Reading and deleting stay open.
create policy "paid: add" on public.prop_money as restrictive for insert to authenticated
  with check ((select public.has_access()));
create policy "paid: change" on public.prop_money as restrictive for update to authenticated
  using ((select public.has_access())) with check ((select public.has_access()));

revoke all on table public.prop_money from anon;
grant select, insert, update, delete on table public.prop_money to authenticated;

commit;
