-- Marble is free for everyone, step two of two (owner, 4 Nov 2026: "remove all functions to do with that paid stuff").
-- Goes on only after the new app is live, because the old app still calls these functions.
--
-- What it does: takes the plan, trial, gift, referral and Stripe functions away, takes their references out of the functions
-- that stay, and moves the paid tables into the locked `retired` schema. No rows are destroyed. Every old definition is in
-- retired.before_free (step one), and the tables move back with: alter table retired.<name> set schema public;

begin;

-- swap(function, old, new, old, new...): exact edits to a stored function. Stops if the text isn't there.
create function pg_temp.swap(f regprocedure, pairs text[]) returns void language plpgsql as $$
declare
  d text := pg_get_functiondef(f);
  i int;
begin
  for i in 1 .. array_length(pairs, 1) by 2 loop
    if position(pairs[i] in d) = 0 then raise exception 'Not found in %: %', f, left(pairs[i], 60); end if;
    d := replace(d, pairs[i], pairs[i + 1]);
  end loop;
  execute d;
end $$;

-- 1. The plan checks come out of what stays
select pg_temp.swap('public.voice_ask(uuid,text)'::regprocedure, array[$x$  if not public.has_access_for(me) then raise exception 'Voice sessions are part of your plan.' using errcode = '42501'; end if;
$x$, '']);
select pg_temp.swap('public.voice_hand(uuid,boolean)'::regprocedure, array[$x$  if not public.has_access_for(me) then raise exception 'Voice sessions are part of your plan.' using errcode = '42501'; end if;
$x$, '']);
select pg_temp.swap('public.voice_vote(uuid,boolean)'::regprocedure, array[$x$  if not public.has_access_for(me) then raise exception 'Voice sessions are part of your plan.' using errcode = '42501'; end if;
$x$, '']);
select pg_temp.swap('public.voice_join(uuid,uuid,boolean)'::regprocedure, array[$x$  if not public.has_access_for(p_user) then raise exception 'Voice sessions are part of your plan.' using errcode = '42501'; end if;
$x$, '']);
select pg_temp.swap('public.voice_sessions_now()'::regprocedure, array[$x$'plan', public.has_access_for(me)$x$, $x$'plan', true$x$]);
select pg_temp.swap('public.dm_inbox()'::regprocedure, array[$x$'plan', public.has_access_for(me)$x$, $x$'plan', true$x$]);
select pg_temp.swap('public.dm_post(uuid,uuid,text,jsonb)'::regprocedure, array[$x$  if p_card is not null and not public.has_access_for(p_me) then
    raise exception 'Sharing a trade or a page is part of your Marble plan. Text replies still work.' using errcode = 'P0001';
  end if;
$x$, '']);
select pg_temp.swap('public.dm_thread_for(uuid,uuid)'::regprocedure, array[$x$  if not public.has_access_for(p_me) then
    raise exception 'Starting a conversation is part of your Marble plan. Replies in your conversations still work.' using errcode = 'P0001';
  end if;
$x$, '']);
select pg_temp.swap('public.set_crew(text)'::regprocedure, array[$x$  if not public.has_access_for(v_me) then raise exception 'Crews need an active plan' using errcode = '42501'; end if;
$x$, '']);
select pg_temp.swap('public.share_page(uuid,uuid,text,text[],text,boolean)'::regprocedure, array[$x$  if not public.has_access_for(me) then raise exception 'Sharing is part of your Marble plan.' using errcode = 'P0001'; end if;
$x$, '']);
select pg_temp.swap('public.share_save(uuid,integer,uuid)'::regprocedure, array[$x$  if not public.has_access_for(me) then raise exception 'Saving a copy is part of your Marble plan.' using errcode = 'P0001'; end if;
$x$, '']);
select pg_temp.swap('public.news_feed(integer)'::regprocedure, array['public.has_access()', 'true']);

-- 2. Sign-up no longer knows about referrals
create or replace function public.create_profile_for(p_user uuid)
returns boolean
language plpgsql security definer
set search_path to ''
as $$
declare
  u auth.users;
  provider text;
  v_full text;
  base text;
  candidate text;
  tries int := 0;
begin
  select * into u from auth.users where id = p_user;
  if not found then return false; end if;
  if exists (select 1 from public.profiles where id = p_user) then return false; end if;
  provider := coalesce(u.raw_app_meta_data ->> 'provider', 'email');
  -- Only an identity provider's name is believed; an email sign-up's metadata is whatever the browser sent
  v_full := case when provider <> 'email'
    then left(nullif(btrim(coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.raw_user_meta_data ->> 'name', '')), ''), 120) end;
  -- The handle comes from the first name only (never the full name), or 'trader' and five digits
  base := lower(regexp_replace(split_part(coalesce(v_full, ''), ' ', 1), '[^a-z0-9]', '', 'gi'));
  if char_length(base) < 3 or public.handle_reserved(base) then base := 'trader'; end if;
  base := left(base, 14);
  candidate := case when base = 'trader' then base || lpad((floor(random() * 100000))::int::text, 5, '0') else base end;
  while not public.handle_free_for(candidate, p_user) loop
    tries := tries + 1;
    candidate := base || lpad((floor(random() * 100000))::int::text, 5, '0');
    if tries > 50 then candidate := left('trader' || replace(gen_random_uuid()::text, '-', ''), 20); end if;
  end loop;
  insert into public.profiles (id, handle, name) values (p_user, candidate, '')
  on conflict (id) do nothing;
  if not found then return false; end if;
  insert into public.profile_private (id, full_name) values (p_user, v_full)
  on conflict (id) do nothing;
  return true;
end $$;

create or replace function public.handle_free_for(h text, p_user uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select h is not null
    and not exists (select 1 from public.profiles p where p.handle = h and p.id is distinct from p_user)
    and not exists (select 1 from public.handle_holds x where x.handle = h and x.user_id is distinct from p_user and x.released_at > now() - interval '90 days')
$$;

create or replace function public.profiles_guard()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.handle is distinct from old.handle then
      if (public.handle_reserved(new.handle) and not public.is_admin()) or not public.handle_free_for(new.handle, new.id) then
        raise exception 'That handle isn''t available' using errcode = '23505';
      end if;
      insert into public.handle_holds (handle, user_id, released_at) values (old.handle, old.id, now())
        on conflict (handle) do update set user_id = excluded.user_id, released_at = excluded.released_at;
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    new.member_no := case when new.show_number then (select m.no from public.members m where m.user_id = old.id) end;
    return new;
  end if;
  -- An account that's gone: its handle is held, so nobody inherits its old links
  insert into public.handle_holds (handle, user_id, released_at) values (old.handle, old.id, now())
    on conflict (handle) do update set released_at = excluded.released_at;
  return old;
end $$;

-- 3. Housekeeping that no longer has a table to tidy
create or replace function public.admin_purge()
returns void
language sql security definer
set search_path to ''
as $$
  delete from public.active_days where day < (now() at time zone 'utc')::date - 400;
  delete from public.owner_alerts where at < now() - interval '30 days';
$$;

-- 4. The admin screens, without plans
select pg_temp.swap('public.admin_activity()'::regprocedure, array[$x$    'referred', (select count(*) from public.referrals r where r.referred_id is not null),
$x$, '']);

select pg_temp.swap('public.admin_events()'::regprocedure, array[
  $x$,
        'codes', (select count(*) from public.gift_codes g where g.competition_id = c.id))$x$, ')',
  $x$,
        'codes', (select count(*) from public.gift_codes x where x.giveaway_id = g.id))$x$, ')']);

select pg_temp.swap('public.admin_health()'::regprocedure, array[$x$    'stripe', jsonb_build_object('last', (select max(e.processed_at) from public.stripe_events e),
      'week', (select count(*) from public.stripe_events e where e.processed_at > now() - interval '7 days')),
$x$, '']);

select pg_temp.swap('public.admin_users(text,text,text,integer)'::regprocedure, array[
  $x$  if p_filter not in ('all', 'trial', 'paying', 'failing', 'lifetime', 'free', 'lapsed', 'none', 'referred', 'active', 'quiet') then$x$,
  $x$  if p_filter not in ('all', 'active', 'quiet') then$x$,
  $x$           public.admin_plan_of(p.id) as plan,
$x$, '',
  $x$           (select rp.handle from public.referrals r join public.profiles rp on rp.id = r.referrer_id where r.referred_id = p.id) as referrer,
$x$, '',
  $x$      when 'trial' then b.plan ->> 'kind' = 'trial'
      when 'paying' then b.plan ->> 'kind' in ('monthly', 'yearly') and b.plan ->> 'status' in ('active', 'past_due')
      when 'failing' then b.plan ->> 'status' = 'past_due'
      when 'lifetime' then b.plan ->> 'kind' = 'lifetime'
      when 'free' then b.plan ->> 'kind' in ('gift', 'gift_lifetime')
      when 'lapsed' then b.plan ->> 'kind' = 'lapsed' or b.plan ->> 'status' = 'canceled'
      when 'none' then b.plan ->> 'kind' = 'none'
      when 'referred' then b.referrer is not null
$x$, '',
  $x$'plan', k.plan, 'trades', k.trades, 'referrer', k.referrer, 'heard_from', k.heard_from$x$,
  $x$'trades', k.trades, 'heard_from', k.heard_from$x$]);

create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_weeks jsonb;
begin
  perform public.admin_gate();
  select jsonb_agg(w.n order by w.k desc) into v_weeks from (
    select k, (select count(*) from public.profiles p
                where p.created_at > now() - make_interval(days => 7 * (k + 1)) and p.created_at <= now() - make_interval(days => 7 * k))::int as n
    from generate_series(0, 12) k) w;
  return jsonb_build_object(
    'at', now(),
    'traders', (select count(*) from public.profiles),
    'signups', jsonb_build_object(
      'week', (select count(*) from public.profiles p where p.created_at > now() - interval '7 days'),
      'prev', (select count(*) from public.profiles p where p.created_at > now() - interval '14 days' and p.created_at <= now() - interval '7 days'),
      'weeks', coalesce(v_weeks, '[]'::jsonb)),
    'needs', jsonb_build_object(
      'reports', (select count(distinct coalesce(r.post_id, r.message_id, r.idea_id)) from public.reports r where r.resolved_at is null),
      'dm_reports', (select count(*) from public.dm_reports d where d.status = 'open'),
      'bugs', (select count(*) from public.bug_reports b where b.status = 'new'),
      'syncs', (select count(*) from public.connections c where c.status <> 'ok'),
      'cron_failed', (select count(distinct d.jobid) from cron.job_run_details d where d.status = 'failed' and d.start_time > now() - interval '24 hours'),
      'csp_day', (select count(*) from public.csp_reports c where c.received_at > now() - interval '24 hours'))
  );
end $$;

create or replace function public.admin_trader(p_user uuid)
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_p public.profiles;
  v_u auth.users;
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_gate();
  select * into v_p from public.profiles where id = p_user;
  if not found then raise exception 'No such trader' using errcode = 'P0001'; end if;
  select * into v_u from auth.users where id = p_user;
  return jsonb_build_object(
    'id', v_p.id, 'handle', v_p.handle, 'name', v_p.name, 'avatar', v_p.avatar_url, 'joined', v_p.created_at,
    'no', (select m.no from public.members m where m.user_id = p_user), 'show_number', v_p.show_number,
    'email', v_u.email, 'email_confirmed', v_u.email_confirmed_at is not null, 'last_seen', v_u.last_sign_in_at,
    'last_active', (select max(a.day) from public.active_days a where a.user_id = p_user),
    'active_30', (select count(*) from public.active_days a where a.user_id = p_user and a.day > v_today - 30),
    'providers', coalesce(v_u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'heard_from', (select pp.heard_from from public.profile_private pp where pp.id = p_user),
    'news', (select pp.marketing_opt_in from public.profile_private pp where pp.id = p_user),
    'crew', (select c.crew from public.crew_members c where c.user_id = p_user),
    'staff', public.is_staff(p_user),
    'admin', exists (select 1 from public.admins a where a.user_id = p_user),
    'journal', jsonb_build_object(
      'trades', (select count(*) from public.trades t where t.user_id = p_user),
      'synced', (select count(*) from public.trades t where t.user_id = p_user and t.source = 'sync'),
      'accounts', (select count(*) from public.accounts a where a.user_id = p_user and not a.archived),
      'imports', (select count(*) from public.imports i where i.user_id = p_user and i.undone_at is null)),
    'connections', coalesce((select jsonb_agg(jsonb_build_object('platform', c.platform, 'status', c.status,
                       'last_synced', c.last_synced_at, 'error', left(c.last_error, 200)) order by c.platform)
                     from public.connections c where c.user_id = p_user), '[]'::jsonb),
    'community', jsonb_build_object(
      'posts', (select count(*) from public.posts p where p.user_id = p_user),
      'hidden', (select count(*) from public.posts p where p.user_id = p_user and p.hidden),
      'chat_30d', (select count(*) from public.chat_messages m where m.user_id = p_user and m.created_at > now() - interval '30 days'),
      'reported', (select count(*) from public.reports r where r.post_id in (select p.id from public.posts p where p.user_id = p_user)
                     or r.message_id in (select m.id from public.chat_messages m where m.user_id = p_user)),
      'reports_made', (select count(*) from public.reports r where r.user_id = p_user),
      'dm_paused_until', (select max(b.until) from public.dm_bans b where b.user_id = p_user and b.until > now())),
    'events', jsonb_build_object(
      'competitions', (select count(*) from public.competition_entries e where e.user_id = p_user),
      'giveaways', (select count(*) from public.giveaway_entries e where e.user_id = p_user))
  );
end $$;

-- 5. The owner's email: new accounts only
create or replace function public.owner_alerts_due()
returns jsonb
language sql stable security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'owners', coalesce((select jsonb_agg(distinct u.email::text)
                          from public.admins a join public.staff s on s.user_id = a.user_id join auth.users u on u.id = a.user_id
                         where u.email is not null), '[]'::jsonb),
    'totals', jsonb_build_object('accounts', (select count(*) from public.profiles)),
    'alerts', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select a.id, a.kind, a.ref, a.at, a.user_id,
             (select m.no from public.members m where m.user_id = a.user_id) as no,
             p.handle::text as handle, p.name, p.created_at as joined,
             coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
             pp.heard_from
        from public.owner_alerts a
        left join public.profiles p on p.id = a.user_id
        left join auth.users u on u.id = a.user_id
        left join public.profile_private pp on pp.id = a.user_id
       where a.sent_at is null and a.tries < 5
         and a.at < now() - interval '2 minutes' and a.at > now() - interval '2 days'
       order by a.id
       limit 50) x), '[]'::jsonb)
  )
$$;

-- 6. Triggers that fire on sales and referral links
drop trigger if exists owner_alert on public.lifetime_purchases;
drop trigger if exists owner_alert on public.subscriptions;
drop trigger if exists referral_alias_hold on public.referral_aliases;

-- 7. The paid functions go. Each definition is in retired.before_free.
drop function if exists public.admin_commission_review(uuid, text);
drop function if exists public.admin_finance();
drop function if exists public.admin_free50_claims();
drop function if exists public.admin_free50_revoke(uuid, text);
drop function if exists public.admin_gift_code_revoke(uuid);
drop function if exists public.admin_gift_codes();
drop function if exists public.admin_gift_codes_make(integer, integer, text, uuid, uuid, timestamp with time zone);
drop function if exists public.admin_grant_access(uuid, integer, text);
drop function if exists public.admin_grant_revoke(uuid);
drop function if exists public.admin_mark_paid(uuid);
drop function if exists public.admin_paying(jsonb);
drop function if exists public.admin_payouts();
drop function if exists public.admin_payouts_due();
drop function if exists public.admin_plan_of(uuid);
drop function if exists public.admin_ref_lookup(text);
drop function if exists public.admin_referral_claims(boolean);
drop function if exists public.admin_referral_code_set(uuid, text);
drop function if exists public.admin_referral_terms_set(uuid, numeric, integer, boolean, text);
drop function if exists public.admin_referrals();
drop function if exists public.admin_referrer(uuid);
drop function if exists public.admin_stripe_note(text, text, jsonb);
drop function if exists public.admin_traders(text);
drop function if exists public.approve_due_commissions();
drop function if exists public.claim_referral(text);
drop function if exists public.founders_seats_taken();
drop function if exists public.free50_claim(uuid, text);
drop function if exists public.free50_status();
drop function if exists public.free50_throwaway(text);
drop function if exists public.funnel_report(integer);
drop function if exists public.funnel_step(text);
drop function if exists public.funnel_cap(text);
drop function if exists public.gift_code_new();
drop function if exists public.my_billing();
drop function if exists public.my_free50();
drop function if exists public.my_ref_clicks();
drop function if exists public.my_referral_terms();
drop function if exists public.owner_alert_lifetime();
drop function if exists public.owner_alert_subscription();
drop function if exists public.record_trial(uuid, text, text);
drop function if exists public.redeem_gift_code(text);
drop function if exists public.ref_click(text);
drop function if exists public.referral_alias_hold();
drop function if exists public.referrer_of(text);
drop function if exists public.stripe_dispute(text, text, uuid, text, integer);
drop function if exists public.stripe_lifetime_paid(uuid, text, text, integer, boolean);
drop function if exists public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamp with time zone, text);
drop function if exists public.stripe_refund(text, integer, integer);
drop function if exists public.stripe_upsert_subscription(text, uuid, text, text, text, integer, timestamp with time zone, timestamp with time zone, boolean);
drop function if exists public.trial_card_seen(text, text);
drop function if exists public.trial_eligible_for(uuid);
drop function if exists public.trial_email_candidates();
drop function if exists public.trial_emails_cron_ok(text);
drop function if exists public.card_hash(text);
drop function if exists public.has_access();
-- has_access_for stays, always true for anyone signed in: the deployed topstepx and ibkr functions still ask it. It can go
-- the next time those two are deployed, because their source no longer does.

-- 8. The paid tables move into the locked schema, rows and all. Nothing can reach them through the API from here.
alter table public.subscriptions set schema retired;
alter table public.customers set schema retired;
alter table public.lifetime_purchases set schema retired;
alter table public.trial_uses set schema retired;
alter table public.commissions set schema retired;
alter table public.payouts set schema retired;
alter table public.payout_settings set schema retired;
alter table public.referrals set schema retired;
alter table public.referral_aliases set schema retired;
alter table public.referral_claims set schema retired;
alter table public.referral_terms set schema retired;
alter table public.ref_clicks set schema retired;
alter table public.free50_claims set schema retired;
alter table public.access_grants set schema retired;
alter table public.gift_codes set schema retired;
alter table public.payment_disputes set schema retired;
alter table public.stripe_events set schema retired;
alter table public.funnel_counts set schema retired;

-- 9. The referral columns: a copy is kept, then they go
create table if not exists retired.profile_referrals as
  select p.id, p.referral_code, pp.referred_by
  from public.profiles p left join public.profile_private pp on pp.id = p.id;
alter table public.profiles drop column referral_code;
alter table public.profile_private drop column referred_by;

-- 10. Stop here rather than leave a function pointing at something that's gone
do $$
declare hit text;
begin
  select string_agg(p.proname::text, ', ') into hit
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'has_access_for'
    and pg_get_functiondef(p.oid) ~ '(public\.(subscriptions|customers|lifetime_purchases|trial_uses|commissions|payouts|payout_settings|referrals|referral_aliases|referral_claims|referral_terms|ref_clicks|free50_claims|access_grants|gift_codes|payment_disputes|stripe_events|funnel_counts)\M|referral_code|referred_by|has_access|admin_plan_of|admin_paying|founders_seats_taken|referrer_of)';
  if hit is not null then raise exception 'Still pointing at paid things: %', hit; end if;
end $$;

commit;
;
