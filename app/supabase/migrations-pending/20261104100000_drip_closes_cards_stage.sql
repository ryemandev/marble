-- The Drip rebuild: what the new app needs on the server.
-- Goes on with the go-live (owner, 4 Nov 2026: "Going live do everything needed"). Names checked against the live schema.
-- Verified cards are held back in 20261104100500_drip_verified_cards_held.sql: nothing calls them while MONEY_CARDS is off.
--
-- What it makes:
--   closes        a trader's daily closes, so finishes and Founder numbers survive a new phone and can't be typed in
--   accounts      the stage (kind) is locked once broker data has arrived, so an evaluation can't be relabelled as live
--   prop_money    a payout says where it came from, so a payout typed by hand can never read as verified

-- 1. Daily closes. One a day, your own only. No update policy: a close stands as it was made.
create table if not exists public.closes (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  facts jsonb not null default '{}'::jsonb check (pg_column_size(facts) < 4000),
  closed_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.closes enable row level security;
create policy "closes: read your own" on public.closes for select to authenticated using (user_id = (select auth.uid()));
create policy "closes: add your own" on public.closes for insert to authenticated
  with check (user_id = (select auth.uid()) and day between current_date - 1 and current_date + 1);

-- 2. An account's stage is fixed once synced trades exist on it
create or replace function public.lock_account_kind() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind is distinct from old.kind
    and exists (select 1 from public.trades t where t.account_id = old.id and t.source = 'sync') then
    raise exception 'This account has broker data, so its type is locked';
  end if;
  return new;
end $$;
drop trigger if exists accounts_lock_kind on public.accounts;
create trigger accounts_lock_kind before update of kind on public.accounts
  for each row execute function public.lock_account_kind();

-- 3. Where a payout came from. There's no firm feed yet, so today every payout is 'typed'.
alter table public.prop_money add column if not exists source text not null default 'typed' check (source in ('typed', 'statement'));

-- A trigger function, so nobody needs to call it directly (applied live as lock_account_kind_not_callable).
revoke execute on function public.lock_account_kind() from public, anon, authenticated;
