-- Security audit, 2026-10-28: who may use Marble, decided in the database, not only in the browser.

-- Chargebacks: an open or lost dispute switches access off; a won one gives it back (the webhook fills this)
create table if not exists public.payment_disputes (
  id text primary key,                 -- Stripe's dispute id
  payment_intent text,
  user_id uuid,                        -- no foreign key: the record outlives a deleted account
  status text not null check (status in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_disputes enable row level security; -- server only: no policies for users

-- Access for any user id: admins; an unrefunded lifetime; a trial until it ends; a paid plan until its period ends
-- (three days' grace for a late card); a cancelled plan until the end of what was paid for. Never with an open or
-- lost chargeback.
create or replace function public.has_access_for(p_user uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_user is not null and (
    exists (select 1 from public.admins a where a.user_id = p_user)
    or (
      not exists (select 1 from public.payment_disputes d where d.user_id = p_user and d.status in ('open', 'lost'))
      and (
        exists (select 1 from public.lifetime_purchases l where l.user_id = p_user and not l.refunded)
        or exists (select 1 from public.subscriptions s where s.user_id = p_user and (
             (s.status = 'trialing' and coalesce(s.trial_end, s.current_period_end) > now())
          or (s.status in ('active', 'past_due') and (s.current_period_end is null or s.current_period_end + interval '3 days' > now()))
          or (s.status = 'canceled' and s.current_period_end > now())
        ))
      )
    )
  )
$$;
revoke all on function public.has_access_for(uuid) from public, anon, authenticated;
grant execute on function public.has_access_for(uuid) to service_role;

-- The signed-in trader's own access (what the app and the policies below ask)
create or replace function public.has_access()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.has_access_for((select auth.uid()))
$$;

-- The paywall, enforced by the database: without access a trader can still read and delete their own data (to
-- export it or leave), but can't add or change journal or community data. Restrictive, so it applies on top of
-- each table's own "it's yours" rules.
do $$
declare t text;
begin
  foreach t in array array['trades', 'imports', 'notes', 'strategies', 'daily_plans', 'posts', 'ideas', 'polls', 'poll_votes', 'idea_votes'] loop
    execute format('drop policy if exists "paid: add" on public.%I', t);
    execute format('drop policy if exists "paid: change" on public.%I', t);
    execute format('create policy "paid: add" on public.%I as restrictive for insert to authenticated with check ((select public.has_access()))', t);
    execute format('create policy "paid: change" on public.%I as restrictive for update to authenticated using ((select public.has_access())) with check ((select public.has_access()))', t);
  end loop;
end $$;

-- Uploads that belong to the journal or the community need access too (avatars and bug reports don't)
drop policy if exists "paid: uploads" on storage.objects;
create policy "paid: uploads" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('screenshots', 'community') or (select public.has_access()));;
