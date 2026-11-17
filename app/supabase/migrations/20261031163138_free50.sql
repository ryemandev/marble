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

create table public.free50_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  seat integer not null check (seat between 1 and 50),
  claimed_at timestamptz not null default now(),
  ip_hash text not null unique check (ip_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null unique check (email_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid references public.access_grants(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) between 3 and 300),
  check ((revoked_at is null) = (revoke_reason is null))
);
comment on table public.free50_claims is 'The first 50 free seats: who claimed, when, which seat, hashes of the connection and normalised email, and whether it was taken back. Read and written through the free50_ functions only.';
create unique index free50_claims_live_seat on public.free50_claims (seat) where revoked_at is null;
create index free50_claims_at on public.free50_claims (claimed_at desc);
alter table public.free50_claims enable row level security;
revoke all on table public.free50_claims from anon, authenticated, service_role;

create or replace function public.free50_throwaway(p_domain text)
returns boolean language sql immutable parallel safe set search_path = ''
as $f$
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
$f$;
revoke all on function public.free50_throwaway(text) from public, anon, authenticated;

create or replace function public.free50_status()
returns jsonb language sql stable security definer set search_path = ''
as $f$
  with n as (select count(*)::int as taken from public.free50_claims c where c.revoked_at is null)
  select jsonb_build_object('claimed', least(n.taken, 50), 'cap', 50, 'open', n.taken < 50) from n
$f$;
revoke all on function public.free50_status() from public;
grant execute on function public.free50_status() to anon, authenticated, service_role;

create or replace function public.free50_claim(p_user uuid, p_ip_hash text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $f$
declare
  v_user auth.users; v_mine public.free50_claims; v_email_hash text; v_taken int; v_seat int; v_grant uuid; v_sub boolean;
begin
  if p_user is null or coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'free50_claim needs an account and a connection hash' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('marble_free50', 0));
  select * into v_user from auth.users u where u.id = p_user;
  if not found then return jsonb_build_object('ok', false, 'error', 'Sign in first, then claim your seat.'); end if;
  select * into v_mine from public.free50_claims c where c.user_id = p_user;
  if found then
    if v_mine.revoked_at is null then return jsonb_build_object('ok', true, 'seat', v_mine.seat, 'already', true); end if;
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
  if v_taken >= 50 then return jsonb_build_object('ok', false, 'error', 'All 50 free seats have been claimed. The plans below are still open.'); end if;
  v_email_hash := public.email_norm_hash(v_user.email);
  if exists (select 1 from public.free50_claims c where c.email_hash = v_email_hash) then
    return jsonb_build_object('ok', false, 'error', 'A free seat has already been claimed with this email address.');
  end if;
  if exists (select 1 from public.free50_claims c where c.ip_hash = p_ip_hash) then
    return jsonb_build_object('ok', false, 'error', 'Someone on this connection has already claimed a free seat.');
  end if;
  select min(s) into v_seat from generate_series(1, 50) s
   where not exists (select 1 from public.free50_claims c where c.seat = s and c.revoked_at is null);
  insert into public.access_grants (user_id, until, source) values (p_user, null, 'free50') returning id into v_grant;
  insert into public.free50_claims (user_id, seat, ip_hash, email_hash, grant_id) values (p_user, v_seat, p_ip_hash, v_email_hash, v_grant);
  v_sub := exists (select 1 from public.subscriptions s where s.user_id = p_user and s.status in ('trialing', 'active', 'past_due') and not s.cancel_at_period_end);
  return jsonb_build_object('ok', true, 'seat', v_seat, 'claimed', v_taken + 1, 'cap', 50, 'subscription_on', v_sub);
end $f$;
revoke all on function public.free50_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.free50_claim(uuid, text) to service_role;

create or replace function public.my_free50()
returns jsonb language sql stable security definer set search_path = ''
as $f$
  select jsonb_build_object('seat', c.seat, 'since', c.claimed_at)
    from public.free50_claims c where c.user_id = (select auth.uid()) and c.revoked_at is null
$f$;
revoke all on function public.my_free50() from public, anon;
grant execute on function public.my_free50() to authenticated;

create or replace function public.admin_free50_claims()
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
begin
  perform public.admin_gate();
  return jsonb_build_object('cap', 50,
    'claimed', (select count(*) from public.free50_claims c where c.revoked_at is null),
    'claims', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'seat', c.seat, 'claimed_at', c.claimed_at, 'revoked_at', c.revoked_at, 'reason', c.revoke_reason,
        'user', (select jsonb_build_object('id', p.id, 'handle', p.handle) from public.profiles p where p.id = c.user_id))
        order by c.claimed_at desc) from public.free50_claims c), '[]'::jsonb));
end $f$;
revoke all on function public.admin_free50_claims() from public, anon;
grant execute on function public.admin_free50_claims() to authenticated;

create or replace function public.admin_free50_revoke(p_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = ''
as $f$
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
end $f$;
revoke all on function public.admin_free50_revoke(uuid, text) from public, anon;
grant execute on function public.admin_free50_revoke(uuid, text) to authenticated;

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
                  'career:ip', 'career:email', 'career:all', 'career:verified', 'free50:ip'));;
