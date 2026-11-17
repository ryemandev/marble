-- Security audit, 2026-10-28, part 3.

-- 1. Votes: who voted for what is private (each trader sees only their own votes); everyone sees the counts.
--    A poll vote can only be cast or changed while the poll is open, for a real option, and never moved.
drop policy if exists "idea votes: read" on public.idea_votes;
create policy "idea votes: read own" on public.idea_votes for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "poll votes: read" on public.poll_votes;
create policy "poll votes: read own" on public.poll_votes for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "poll votes: own, while open" on public.poll_votes;
create policy "poll votes: own, while open" on public.poll_votes for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.polls p where p.id = poll_votes.poll_id and p.ends_at > now()
    and poll_votes.option >= 0 and poll_votes.option < coalesce(array_length(p.options, 1), 0)));
drop policy if exists "poll votes: change own" on public.poll_votes;
create policy "poll votes: change own" on public.poll_votes for update to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.polls p where p.id = poll_votes.poll_id and p.ends_at > now()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.polls p where p.id = poll_votes.poll_id and p.ends_at > now()
    and poll_votes.option >= 0 and poll_votes.option < coalesce(array_length(p.options, 1), 0)));
create or replace function public.poll_votes_fixed()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.poll_id is distinct from old.poll_id or new.user_id is distinct from old.user_id then
    raise exception 'A vote can''t be moved' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists poll_votes_fixed on public.poll_votes;
create trigger poll_votes_fixed before update on public.poll_votes for each row execute function public.poll_votes_fixed();

-- The counts, without saying who: idea votes per idea, poll votes per option (your own included; the app knows yours)
create or replace function public.vote_counts()
returns jsonb language sql stable security definer set search_path to '' as $$
  select case when (select auth.uid()) is null then '{}'::jsonb else jsonb_build_object(
    'ideas', coalesce((select jsonb_object_agg(idea_id, n) from (select idea_id, count(*) n from public.idea_votes group by idea_id) x), '{}'::jsonb),
    'polls', coalesce((select jsonb_object_agg(poll_id, opts) from (
      select poll_id, jsonb_object_agg(option, n) opts from (select poll_id, option, count(*) n from public.poll_votes group by poll_id, option) y group by poll_id) z), '{}'::jsonb)
  ) end
$$;
revoke all on function public.vote_counts() from public, anon;
grant execute on function public.vote_counts() to authenticated;

-- 2. Community pictures: nobody can list the bucket or read other traders' files directly (no image posts yet;
--    when they ship, they'll be served by signed links for visible posts only)
drop policy if exists "community: signed-in read" on storage.objects;
drop policy if exists "community: owner reads" on storage.objects;
create policy "community: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3. Money records outlive accounts: a deleted trader's referral, commissions and payouts stay (with the person
--    blanked), so nobody loses money owed and refunds can still be clawed back
alter table public.referrals alter column referred_id drop not null;
alter table public.referrals alter column referrer_id drop not null;
alter table public.referrals drop constraint referrals_referred_id_fkey,
  add constraint referrals_referred_id_fkey foreign key (referred_id) references auth.users(id) on delete set null;
alter table public.referrals drop constraint referrals_referrer_id_fkey,
  add constraint referrals_referrer_id_fkey foreign key (referrer_id) references auth.users(id) on delete set null;
alter table public.commissions alter column referral_id drop not null;
alter table public.commissions alter column referrer_id drop not null;
alter table public.commissions drop constraint commissions_referral_id_fkey,
  add constraint commissions_referral_id_fkey foreign key (referral_id) references public.referrals(id) on delete set null;
alter table public.commissions drop constraint commissions_referrer_id_fkey,
  add constraint commissions_referrer_id_fkey foreign key (referrer_id) references auth.users(id) on delete set null;
alter table public.payouts alter column user_id drop not null;
alter table public.payouts drop constraint payouts_user_id_fkey,
  add constraint payouts_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

-- 4. One free trial per person: remembered by a hash of their email (and their Stripe customer), so deleting the
--    account or opening several checkouts doesn't earn another. No email is stored.
create table if not exists public.trial_uses (
  email_hash text primary key,
  stripe_customer text,
  used_at timestamptz not null default now()
);
alter table public.trial_uses enable row level security; -- server only
create or replace function public.email_hash(p_email text)
returns text language sql immutable set search_path to '' as $$
  select encode(extensions.digest(convert_to(lower(trim(coalesce(p_email, ''))), 'UTF8'), 'sha256'), 'hex')
$$;
create or replace function public.trial_eligible_for(p_user uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_user is not null
    and not exists (select 1 from public.subscriptions s where s.user_id = p_user)
    and not exists (select 1 from public.trial_uses t join auth.users u on t.email_hash = public.email_hash(u.email) where u.id = p_user)
$$;
revoke all on function public.trial_eligible_for(uuid) from public, anon, authenticated;
create or replace function public.record_trial(p_user uuid, p_customer text)
returns void language sql security definer set search_path to '' as $$
  insert into public.trial_uses (email_hash, stripe_customer)
  select public.email_hash(u.email), p_customer from auth.users u where u.id = p_user
  on conflict (email_hash) do nothing
$$;
revoke all on function public.record_trial(uuid, text) from public, anon, authenticated;

-- 5. A simple rate limit the server functions ask before calling Topstep or IBKR: at most p_max in the window
create table if not exists public.rate_events (
  user_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_lookup on public.rate_events (user_id, kind, at);
alter table public.rate_events enable row level security; -- server only
create or replace function public.rate_ok(p_user uuid, p_kind text, p_max int, p_window interval)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  delete from public.rate_events where at < now() - interval '1 day';
  if (select count(*) from public.rate_events where user_id = p_user and kind = p_kind and at > now() - p_window) >= p_max then
    return false;
  end if;
  insert into public.rate_events (user_id, kind) values (p_user, p_kind);
  return true;
end $$;
revoke all on function public.rate_ok(uuid, text, int, interval) from public, anon, authenticated;

-- 6. Commission is approved 60 days after the payment (inside the chargeback window it could still be clawed back)
create or replace function public.approve_due_commissions()
returns integer language sql security definer set search_path to '' as $$
  with done as (
    update public.commissions set status = 'approved'
    where status = 'pending' and kind = 'earning' and created_at < now() - interval '60 days'
    returning 1
  ) select count(*)::int from done
$$;

-- 7. Paying a referrer out can't happen twice at once
create or replace function public.admin_mark_paid(p_user uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  total bigint;
  how text;
  pid uuid;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('marble_payout:' || p_user::text));
  perform 1 from public.commissions where referrer_id = p_user and status = 'approved' for update;
  select coalesce(sum(amount_pence), 0) into total from public.commissions where referrer_id = p_user and status = 'approved';
  if total < 5000 then raise exception 'Under the £50 minimum'; end if;
  select method into how from public.payout_settings where user_id = p_user;
  if how is null then raise exception 'No payout details on file'; end if;
  insert into public.payouts (user_id, amount_pence, method, status, paid_at) values (p_user, total, how, 'sent', now()) returning id into pid;
  update public.commissions set status = 'paid', payout_id = pid where referrer_id = p_user and status = 'approved';
  return pid;
end $$;

-- 8. Stripe events for traders who've deleted their account are noted and skipped, never retried for days
create or replace function public.stripe_upsert_subscription(p_id text, p_user uuid, p_status text, p_plan text, p_currency text,
  p_amount integer, p_trial_end timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not exists (select 1 from auth.users where id = p_user) then return; end if;
  insert into public.subscriptions (id, user_id, status, plan, currency, amount, trial_end, current_period_end, cancel_at_period_end)
  values (p_id, p_user, p_status, p_plan, lower(p_currency), p_amount, p_trial_end, p_period_end, coalesce(p_cancel_at_period_end, false))
  on conflict (id) do update set
    status = excluded.status, plan = excluded.plan, currency = excluded.currency, amount = excluded.amount,
    trial_end = excluded.trial_end, current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end;
end $$;

-- A lifetime payment: the seat number; 0 = they already own lifetime (refund it); null = sold out (refund it);
-- -1 = the account is gone; -2 = this exact payment was already refunded (nothing more to do)
create or replace function public.stripe_lifetime_paid(p_user uuid, p_payment_intent text, p_currency text, p_amount integer)
returns integer language plpgsql security definer set search_path to '' as $$
declare
  existing record;
  next_seat integer;
begin
  perform pg_advisory_xact_lock(hashtext('marble_founders_seats'));
  select * into existing from public.lifetime_purchases where stripe_payment_intent = p_payment_intent;
  if found then return case when existing.refunded then -2 else coalesce(existing.seat, 0) end; end if;
  if not exists (select 1 from auth.users where id = p_user) then return -1; end if;
  if exists (select 1 from public.lifetime_purchases where user_id = p_user and not refunded) then return 0; end if;
  select s into next_seat from generate_series(1, 500) s
    where not exists (select 1 from public.lifetime_purchases l where l.seat = s)
    order by s limit 1;
  if next_seat is null then return null; end if;
  insert into public.lifetime_purchases (user_id, stripe_payment_intent, seat, currency, amount, refunded, refunded_at)
  values (p_user, p_payment_intent, next_seat, lower(p_currency), p_amount, false, null)
  on conflict (user_id) do update set stripe_payment_intent = excluded.stripe_payment_intent, seat = excluded.seat,
    currency = excluded.currency, amount = excluded.amount, refunded = false, refunded_at = null, created_at = now();
  return next_seat;
end $$;

-- 9. Chargebacks: opened → access off and that payment's commission frozen; won → access back, commission
--    resumes; lost → treated as a full refund (lifetime seat freed, commission reversed or clawed back)
create or replace function public.stripe_dispute(p_id text, p_payment_intent text, p_user uuid, p_status text, p_amount integer)
returns text language plpgsql security definer set search_path to '' as $$
begin
  if p_status not in ('open', 'won', 'lost') then return 'ignored status'; end if;
  insert into public.payment_disputes (id, payment_intent, user_id, status) values (p_id, p_payment_intent, p_user, p_status)
  on conflict (id) do update set status = excluded.status, updated_at = now(),
    user_id = coalesce(public.payment_disputes.user_id, excluded.user_id);
  if p_status = 'open' then
    update public.commissions set status = 'held' where stripe_payment_intent = p_payment_intent and kind = 'earning' and status in ('pending', 'approved');
    return 'access off, commission held';
  elsif p_status = 'won' then
    update public.commissions set status = 'pending' where stripe_payment_intent = p_payment_intent and kind = 'earning' and status = 'held';
    return 'access back, commission resumed';
  else
    update public.commissions set status = 'pending' where stripe_payment_intent = p_payment_intent and kind = 'earning' and status = 'held';
    return 'lost: ' || public.stripe_refund(p_payment_intent, greatest(p_amount, 1), greatest(p_amount, 1));
  end if;
end $$;
revoke all on function public.stripe_dispute(text, text, uuid, text, integer) from public, anon, authenticated;

-- 10. No plaintext webhook secret kept in the database (it lives in the function's secrets)
delete from public.server_settings where name = 'stripe_webhook_secret';

-- 11. One read policy each (own or admin) instead of two
drop policy if exists "admins read reports" on public.bug_reports;
drop policy if exists "own reports: read" on public.bug_reports;
create policy "reports: read own or admin" on public.bug_reports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "admins read the waitlist" on public.oracle_waitlist;
drop policy if exists "own waitlist: read" on public.oracle_waitlist;
create policy "waitlist: read own or admin" on public.oracle_waitlist for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "payouts: admin" on public.payouts;
create policy "payouts: admin adds" on public.payouts for insert to authenticated with check ((select public.is_admin()));
create policy "payouts: admin changes" on public.payouts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "payouts: admin removes" on public.payouts for delete to authenticated using ((select public.is_admin()));;
