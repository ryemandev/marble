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
create policy "paid: add" on public.prop_money as restrictive for insert to authenticated
  with check ((select public.has_access()));
create policy "paid: change" on public.prop_money as restrictive for update to authenticated
  using ((select public.has_access())) with check ((select public.has_access()));
revoke all on table public.prop_money from anon;
grant select, insert, update, delete on table public.prop_money to authenticated;;
