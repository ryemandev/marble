-- APPLIED live on 31 October 2026 with the owner's OK ("deploy it"); the free50 function deployed and FREE50_LIVE switched on.
-- First 50 free: the first 50 accounts get Marble for good. NOT APPLIED. Written 31 October 2026 for review.
-- Needs 20261031150000_admin_gifts.sql (access_grants, admin_gate, admin_note), 20261029180100 (email_norm_hash) and
-- 20261029120000 (form_rate_hits, form_rate_ok).
--
-- The owner's decisions (31 Oct 2026): the 50 get Marble free for good; they claim it straight after signing up; and
-- they're extra, never one of the 500 paid Founders' Lifetime seats (founders_seats_taken() is not touched here).
--
--   free50_claims        one row per claim: the account, when, its seat (1 to 50), a keyed hash of the connection it
--                        came from (an HMAC made by the free50 function, never the IP itself), the hash of the
--                        account's normalised email, the access_grants row it made, and whether it was taken back.
--                        Row level security on, no policies, no grants: only the functions below read or write it.
--   access_grants        source may now be 'free50' as well as 'code'. A claim's grant has until = null (for good), so
--                        has_access_for() and my_billing() already count it, unchanged.
--   free50_status()      {claimed, cap: 50, open}: the live count for the website and the app. Anyone may call it;
--                        it says nothing about who.
--   free50_claim()       the free50 edge function's call (service role only). Every rule is checked under one lock:
--                        the cap (claims not taken back), one per account, one per normalised email, one per
--                        connection, a confirmed email, no throwaway email domains, nothing for an account that already
--                        has Marble for good. A refusal comes back as {ok: false, error} in plain words.
--   my_free50()          the signed-in trader's own seat, for the plan card on their profile.
--   admin_free50_claims(), admin_free50_revoke()   the admin side (two-step, logged). Taking a seat back also ends
--                        its grant, and frees the seat for someone else.
--   form_rate_hits       takes one more kind, 'free50:ip', so the function can limit tries per connection with the
--                        forms' own form_rate_ok().
--
-- One per account, email and connection counts every claim ever made, a taken-back one included: a seat taken back
-- for breaking the rules can't be claimed again from the same account, address or connection. Only the cap counts
-- live claims alone. A deleted account's claim goes with it (on delete cascade), and so does its seat.
--
-- Test: supabase/tests/20261101110000_free50.test.sql (rolled back; it ends by raising its results).

begin;

-- ---------- access_grants: a second source ----------
-- The check made in 20261031150000 allows 'code' only; it is replaced by one that also allows 'free50'
do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.access_grants'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%source%'
  loop
    execute format('alter table public.access_grants drop constraint %I', v_name);
  end loop;
end $$;
alter table public.access_grants add constraint access_grants_source_check check (source in ('code', 'free50'));
comment on table public.access_grants is 'Free access: a redeemed gift code (source code), until a date or for good, or one of the first 50 free seats (source free50), for good. Read by has_access_for().';

-- ---------- The claims ----------
create table public.free50_claims (
  id uuid primary key default gen_random_uuid(),
  -- A deleted account's claim goes with it, and its seat comes free
  user_id uuid not null unique references auth.users(id) on delete cascade,
  seat integer not null check (seat between 1 and 50),
  claimed_at timestamptz not null default now(),
  -- HMAC-SHA256 of the connection (the free50 function's FORMS_HASH_SALT key; IPv6 by its /64), never the address
  ip_hash text not null unique check (ip_hash ~ '^[0-9a-f]{64}$'),
  -- email_norm_hash(): the same person across +tags, dotted Gmail addresses and googlemail.com
  email_hash text not null unique check (email_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid references public.access_grants(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) between 3 and 300),
  check ((revoked_at is null) = (revoke_reason is null))
);
comment on table public.free50_claims is 'The first 50 free seats: who claimed, when, which seat, hashes of the connection and normalised email, and whether it was taken back. Read and written through the free50_ functions only.';
-- A seat is held by one live claim at a time; a taken-back one frees it
create unique index free50_claims_live_seat on public.free50_claims (seat) where revoked_at is null;
create index free50_claims_at on public.free50_claims (claimed_at desc);
alter table public.free50_claims enable row level security;
revoke all on table public.free50_claims from anon, authenticated, service_role;

-- ---------- Throwaway email domains ----------
-- A short list of the common ones, and any address under them (x.mailinator.com). Not every throwaway service is
-- here; with the one-per-connection rule and the bot check it's enough to stop 50 seats going to one person.
create or replace function public.free50_throwaway(p_domain text)
returns boolean language sql immutable parallel safe set search_path = ''
as $$
  select exists (
    select 1 from unnest(array[
      'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
      'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me', '10minutemail.com', '10minutemail.net',
      'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempr.email',
      'yopmail.com', 'yopmail.fr', 'yopmail.net', 'trashmail.com', 'trashmail.de', 'getnada.com', 'nada.email',
      'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mailcatch.com', 'throwawaymail.com', 'fakeinbox.com',
      'emailondeck.com', 'mohmal.com', 'moakt.com', 'mintemail.com', 'discard.email', 'burnermail.io',
      'mail.tm', 'mail.gw', 'emailfake.com', 'getairmail.com', 'spamgourmet.com', 'mytemp.email', 'tmail.ws'
    ]) d
    where lower(btrim(coalesce(p_domain, ''))) = d or right(lower(btrim(coalesce(p_domain, ''))), char_length(d) + 1) = '.' || d
  )
$$;
revoke all on function public.free50_throwaway(text) from public, anon, authenticated;

-- ---------- The live count ----------
create or replace function public.free50_status()
returns jsonb language sql stable security definer set search_path = ''
as $$
  with n as (select count(*)::int as taken from public.free50_claims c where c.revoked_at is null)
  select jsonb_build_object('claimed', least(n.taken, 50), 'cap', 50, 'open', n.taken < 50) from n
$$;
revoke all on function public.free50_status() from public;
grant execute on function public.free50_status() to anon, authenticated, service_role;

-- ---------- Claiming a seat ----------
-- The free50 edge function calls this with the account from the trader's own sign-in and the hash of the connection
-- Cloudflare saw. Refusals are answered {ok: false, error}, never raised, so the function's own rate-limit counts
-- stand. Asking again from an account that already holds a seat answers {ok: true, seat, already: true} and changes
-- nothing.
create or replace function public.free50_claim(p_user uuid, p_ip_hash text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user auth.users;
  v_mine public.free50_claims;
  v_email_hash text;
  v_taken int;
  v_seat int;
  v_grant uuid;
  v_sub boolean;
begin
  if p_user is null or coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'free50_claim needs an account and a connection hash' using errcode = '22023';
  end if;
  -- One claim at a time, everywhere: the count, the seat and every one-per rule are read and written together
  perform pg_advisory_xact_lock(hashtextextended('marble_free50', 0));

  select * into v_user from auth.users u where u.id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Sign in first, then claim your seat.');
  end if;
  select * into v_mine from public.free50_claims c where c.user_id = p_user;
  if found then
    if v_mine.revoked_at is null then
      return jsonb_build_object('ok', true, 'seat', v_mine.seat, 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'This account''s free seat was taken back, so it can''t be claimed again.');
  end if;
  if v_user.email is null or v_user.email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'error', 'Confirm your email first, then claim your seat.');
  end if;
  if public.free50_throwaway(split_part(v_user.email, '@', 2)) then
    return jsonb_build_object('ok', false, 'error', 'Free seats need an email address you keep. Sign up with your own, not a throwaway one.');
  end if;
  if exists (select 1 from public.lifetime_purchases l where l.user_id = p_user and not l.refunded)
     or exists (select 1 from public.access_grants g where g.user_id = p_user and g.revoked_at is null and g.until is null) then
    return jsonb_build_object('ok', false, 'error', 'You already have Marble for good, so there''s nothing to add.');
  end if;
  select count(*) into v_taken from public.free50_claims c where c.revoked_at is null;
  if v_taken >= 50 then
    return jsonb_build_object('ok', false, 'error', 'All 50 free seats have been claimed. The plans below are still open.');
  end if;
  v_email_hash := public.email_norm_hash(v_user.email);
  if exists (select 1 from public.free50_claims c where c.email_hash = v_email_hash) then
    return jsonb_build_object('ok', false, 'error', 'A free seat has already been claimed with this email address.');
  end if;
  if exists (select 1 from public.free50_claims c where c.ip_hash = p_ip_hash) then
    return jsonb_build_object('ok', false, 'error', 'Someone on this connection has already claimed a free seat.');
  end if;

  -- The lowest seat not held: a seat taken back is the next one given
  select min(s) into v_seat from generate_series(1, 50) s
   where not exists (select 1 from public.free50_claims c where c.seat = s and c.revoked_at is null);
  insert into public.access_grants (user_id, until, source) values (p_user, null, 'free50') returning id into v_grant;
  insert into public.free50_claims (user_id, seat, ip_hash, email_hash, grant_id)
  values (p_user, v_seat, p_ip_hash, v_email_hash, v_grant);
  -- A Stripe subscription that will still charge (a trial that turns paid, or a plan that renews): the app tells the
  -- trader to cancel it, as it does for a gift code
  v_sub := exists (select 1 from public.subscriptions s where s.user_id = p_user
                     and s.status in ('trialing', 'active', 'past_due') and not s.cancel_at_period_end);
  return jsonb_build_object('ok', true, 'seat', v_seat, 'claimed', v_taken + 1, 'cap', 50, 'subscription_on', v_sub);
end $$;
revoke all on function public.free50_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.free50_claim(uuid, text) to service_role;

-- ---------- The trader's own seat ----------
create or replace function public.my_free50()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('seat', c.seat, 'since', c.claimed_at)
    from public.free50_claims c where c.user_id = (select auth.uid()) and c.revoked_at is null
$$;
revoke all on function public.my_free50() from public, anon;
grant execute on function public.my_free50() to authenticated;

-- ---------- The admin side ----------
create or replace function public.admin_free50_claims()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'cap', 50,
    'claimed', (select count(*) from public.free50_claims c where c.revoked_at is null),
    'claims', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'seat', c.seat, 'claimed_at', c.claimed_at, 'revoked_at', c.revoked_at, 'reason', c.revoke_reason,
        'user', (select jsonb_build_object('id', p.id, 'handle', p.handle) from public.profiles p where p.id = c.user_id))
        order by c.claimed_at desc)
      from public.free50_claims c), '[]'::jsonb));
end $$;
revoke all on function public.admin_free50_claims() from public, anon;
grant execute on function public.admin_free50_claims() to authenticated;

-- Taking a seat back: the claim and its grant both end (the trader loses free access at once), the seat is free for
-- someone else, and that account, email and connection can't claim again. The reason is kept and logged.
create or replace function public.admin_free50_revoke(p_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_c public.free50_claims;
begin
  perform public.admin_gate();
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'Say why the seat is being taken back (3 to 300 characters)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('marble_free50', 0));
  select * into v_c from public.free50_claims where id = p_id for update;
  if not found then raise exception 'No such claim' using errcode = 'P0001'; end if;
  if v_c.revoked_at is not null then return; end if;
  update public.free50_claims set revoked_at = now(), revoked_by = (select auth.uid()), revoke_reason = btrim(p_reason) where id = p_id;
  update public.access_grants set revoked_at = now() where id = v_c.grant_id and revoked_at is null;
  perform public.admin_note('free_seat.revoke', 'free_seat', p_id::text, jsonb_build_object('seat', v_c.seat, 'reason', btrim(p_reason)));
end $$;
revoke all on function public.admin_free50_revoke(uuid, text) from public, anon;
grant execute on function public.admin_free50_revoke(uuid, text) to authenticated;

-- ---------- The forms' rate limit: one more kind ----------
-- form_rate_hits.kind is checked against a list (20261029120000); 'free50:ip' joins it, so the free50 function can
-- count tries per connection with form_rate_ok() (an HMAC of the connection, kept two days, like the forms' own)
do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.form_rate_hits'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%kind%'
  loop
    execute format('alter table public.form_rate_hits drop constraint %I', v_name);
  end loop;
end $$;
alter table public.form_rate_hits add constraint form_rate_hits_kind_check
  check (kind in ('partner:ip', 'partner:email', 'partner:all', 'partner:verified',
                  'career:ip', 'career:email', 'career:all', 'career:verified', 'free50:ip'));

commit;
