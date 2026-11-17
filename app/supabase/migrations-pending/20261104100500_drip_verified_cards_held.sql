-- Verified cards. HELD: not applied. Nothing calls this while MONEY_CARDS is off (src/mode.js), and the cards wait on a solicitor.
-- Split from 20261104100000 on 4 Nov 2026 so a public-read table isn't sitting on production unused.
--
-- The rule: the money on a verified card is summed here on the server, from synced trades only. The browser asks for a
-- card and never supplies a figure. Manual and imported trades are never counted.

-- 4. Verified cards
create table if not exists public.shared_cards (
  id text primary key default encode(extensions.gen_random_bytes(9), 'hex'),
  user_id uuid not null references auth.users (id) on delete cascade,
  handle text not null,
  kind text not null check (kind in ('day', 'week', 'trade')),
  stage text not null check (stage in ('live', 'funded', 'eval', 'paper')),
  period_from date not null,
  period_to date not null,
  amount numeric not null,
  trades int not null check (trades > 0),
  made_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.shared_cards enable row level security;
-- Anyone with the link can check a card, until its owner takes it back
create policy "cards: public can check" on public.shared_cards for select to anon, authenticated using (revoked_at is null);
create policy "cards: read your own" on public.shared_cards for select to authenticated using (user_id = (select auth.uid()));
create policy "cards: take back your own" on public.shared_cards for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- No insert policy: cards are only made by the function below. Only revoked_at may change.
revoke update on public.shared_cards from anon, authenticated;
grant update (revoked_at) on public.shared_cards to authenticated;

create or replace function public.make_verified_card(p_account uuid, p_from date, p_to date, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  total numeric;
  n int;
  stage_of text;
  who text;
  made text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select lower(a.kind) into stage_of from public.accounts a where a.id = p_account and a.user_id = me;
  if stage_of is null then raise exception 'That account is not yours'; end if;
  stage_of := case when stage_of like 'eval%' then 'eval' when stage_of like 'fund%' then 'funded'
                   when stage_of like 'paper%' then 'paper' else 'live' end;
  select coalesce(sum(t.pnl), 0), count(*) into total, n from public.trades t
    where t.user_id = me and t.account_id = p_account and t.source = 'sync'
      and t.traded_at >= p_from and t.traded_at < p_to + 1;
  if n = 0 then raise exception 'No synced trades in that period'; end if;
  select p.handle into who from public.profiles p where p.id = me;
  insert into public.shared_cards (user_id, handle, kind, stage, period_from, period_to, amount, trades)
    values (me, coalesce(who, ''), p_kind, stage_of, p_from, p_to, total, n) returning id into made;
  return made;
end $$;
revoke all on function public.make_verified_card(uuid, date, date, text) from public, anon;
grant execute on function public.make_verified_card(uuid, date, date, text) to authenticated;
