-- The admin area, part 1 of 2: the admin door, the admin log, and gift codes. NOT APPLIED. Written 30 October 2026
-- for review. Apply before 20261031150100_admin_area.sql (part 2 uses the door and the log made here).
--
-- The door
--   admin_gate()        every admin_ function calls it first: an admin (public.admins, through is_admin()) signed in
--                       with two-step sign-in (the JWT's aal is aal2). Raises otherwise. Not callable from the browser.
--   admin_log           one row per admin write: who, what, which row, and the details. Append-only (a trigger
--                       refuses updates and deletes, owners included). No grants and no policies: read through
--                       admin_log_list() (part 2) only.
--   admin_note()        writes one admin_log row. Internal.
--
-- Gift codes (prizes: free months or lifetime for winners and their friends)
--   gift_codes          single-use codes, XXXX-XXXX-XXXX from 32 letters and digits (no I, O, 0 or 1), 60 bits of
--                       chance each. months = 1 to 36, or null for lifetime. Made only by admin_gift_codes_make().
--   access_grants       what a redeemed code gives: access from now until a date, or for good (until null).
--   has_access_for()    the paywall, REPLACED: the same rules as before, plus an active grant. A grant sits inside the
--                       payment-dispute rule like every paid plan (an open or lost chargeback switches it off too).
--                       Admins still always get in. Nothing else in it changes.
--   my_billing()        REPLACED: the same keys as before, plus 'gift' (null, or {lifetime, until, since}).
--   redeem_gift_code()  a signed-in trader redeems a code: one use, 8 tries an hour, never on top of lifetime. Free
--                       months add on to any free months still running. A Stripe subscription is never touched: the
--                       answer says when one is still on, and the app tells the trader to cancel it in billing.
--   admin_gift_codes(), admin_gift_codes_make(), admin_gift_code_revoke()   the admin side (two-step, logged).
--
-- Codes are kept as written (admin-only table, no grants), so the owner can find one again to send to a winner.

begin;

-- ---------- The door ----------
create or replace function public.admin_gate()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    raise exception 'The admin area needs two-step sign-in. Enter the code from your authenticator app first.'
      using errcode = 'P0001', hint = 'aal2';
  end if;
  return auth.uid();
end $$;
revoke all on function public.admin_gate() from public, anon, authenticated;

-- ---------- The admin log ----------
create table public.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- No foreign key: the record stays exactly as written, even if that account is deleted later
  admin_id uuid,
  action text not null check (action ~ '^[a-z_.]{3,60}$'),
  target_type text check (target_type is null or target_type ~ '^[a-z_]{2,30}$'),
  target_id text check (target_id is null or char_length(target_id) <= 80),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 20000)
);
comment on table public.admin_log is 'Every write made from the admin area: who, what, which row, the details. Append-only. Read through admin_log_list() only.';
create index admin_log_at on public.admin_log (at desc);
alter table public.admin_log enable row level security;
revoke all on table public.admin_log from anon, authenticated;

create or replace function public.admin_log_append_only()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'The admin log can''t be changed or deleted' using errcode = '42501';
end $$;
revoke all on function public.admin_log_append_only() from public, anon, authenticated;
create trigger admin_log_append_only before update or delete on public.admin_log
  for each row execute function public.admin_log_append_only();
create trigger admin_log_no_truncate before truncate on public.admin_log
  for each statement execute function public.admin_log_append_only();
-- The server key has no use for it either (edge functions never write the log)
revoke all on table public.admin_log from service_role;

create or replace function public.admin_note(p_action text, p_type text, p_id text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into public.admin_log (admin_id, action, target_type, target_id, detail)
  values ((select auth.uid()), p_action, p_type, p_id, coalesce(p_detail, '{}'::jsonb))
$$;
revoke all on function public.admin_note(text, text, text, jsonb) from public, anon, authenticated;

-- ---------- Gift codes and what they give ----------
create table public.gift_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  -- Free months (1 to 36), or null for lifetime
  months integer check (months is null or months between 1 and 36),
  -- What it's for, in the owner's words: "October draw: winner", "Cup 1: 2nd place, a friend"
  label text not null check (char_length(btrim(label)) between 3 and 80),
  batch uuid not null,
  competition_id uuid references public.competitions(id) on delete set null,
  giveaway_id uuid references public.giveaways(id) on delete set null,
  -- Optional last moment it can be redeemed
  redeem_by timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  check (redeemed_by is null or redeemed_at is not null),
  check (redeemed_at is null or revoked_at is null)
);
comment on table public.gift_codes is 'Single-use gift codes for prizes: free months or lifetime. Made in the admin area; redeemed through redeem_gift_code().';
create index gift_codes_batch on public.gift_codes (batch);
create index gift_codes_created on public.gift_codes (created_at desc);
alter table public.gift_codes enable row level security;
revoke all on table public.gift_codes from anon, authenticated, service_role;

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  -- null: for good
  until timestamptz,
  source text not null default 'code' check (source in ('code')),
  code_id uuid references public.gift_codes(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (until is null or until > starts_at)
);
comment on table public.access_grants is 'Free access from a redeemed gift code: until a date, or for good (until null). Read by has_access_for().';
create index access_grants_user on public.access_grants (user_id);
alter table public.access_grants enable row level security;
revoke all on table public.access_grants from anon, authenticated, service_role;

-- ---------- The paywall: the same rules, plus an active grant ----------
create or replace function public.has_access_for(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
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
        -- A gift code: free months, or lifetime (admin area, 20261031150000)
        or exists (select 1 from public.access_grants g where g.user_id = p_user and g.revoked_at is null
                     and g.starts_at <= now() and (g.until is null or g.until > now()))
      )
    )
  )
$$;

-- The trader's plan for the app: the same keys as before, plus 'gift'
create or replace function public.my_billing()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'access', public.has_access(),
    'lifetime', (select jsonb_build_object('seat', l.seat, 'since', l.created_at) from public.lifetime_purchases l where l.user_id = (select auth.uid()) and not l.refunded),
    'subscription', (select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_end', s.trial_end, 'period_end', s.current_period_end,
                       'cancel_at_period_end', s.cancel_at_period_end, 'currency', s.currency, 'amount', s.amount)
                     from public.subscriptions s where s.user_id = (select auth.uid()) order by s.updated_at desc limit 1),
    'customer', exists (select 1 from public.customers c where c.user_id = (select auth.uid())),
    'seats_left', greatest(0, 500 - public.founders_seats_taken()),
    'trial_eligible', public.trial_eligible_for((select auth.uid())),
    'gift', (select case when count(*) = 0 then null else jsonb_build_object(
               'lifetime', bool_or(g.until is null),
               'until', case when bool_or(g.until is null) then null else max(g.until) end,
               'since', min(g.created_at)) end
             from public.access_grants g
             where g.user_id = (select auth.uid()) and g.revoked_at is null and (g.until is null or g.until > now()))
  )
$$;

-- ---------- Redeeming ----------
-- After the rate limit, a code that can't be used is answered {ok: false, error}, never raised: a raised error would
-- roll back the rate limit's own count with everything else, and wrong guesses would never add up.
create or replace function public.redeem_gift_code(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_raw text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_code text;
  v_g public.gift_codes;
  v_from timestamptz;
  v_until timestamptz;
  v_sub boolean;
begin
  if v_me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.rate_ok(v_me, 'gift_code', 8, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'That''s a lot of tries. Try again in an hour.');
  end if;
  if v_raw !~ '^[A-Z0-9]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'A gift code is 12 letters and numbers, like ABCD-EFGH-JKLM.');
  end if;
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);
  -- One redemption at a time per account, so two codes redeemed at once still add up
  perform pg_advisory_xact_lock(hashtext('marble_gift:' || v_me::text));
  select * into v_g from public.gift_codes where code = v_code for update;
  if not found or v_g.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'That code isn''t valid. Check it, or ask whoever gave it to you.');
  end if;
  if v_g.redeemed_at is not null then
    return jsonb_build_object('ok', false, 'error', case when v_g.redeemed_by = v_me then 'You''ve already used this code.' else 'This code has already been used.' end);
  end if;
  if v_g.redeem_by is not null and now() > v_g.redeem_by then
    return jsonb_build_object('ok', false, 'error', format('This code could be used until %s. Ask whoever gave it to you for a new one.',
      to_char(v_g.redeem_by at time zone 'Europe/London', 'FMDD Mon YYYY')));
  end if;
  if exists (select 1 from public.lifetime_purchases l where l.user_id = v_me and not l.refunded)
     or exists (select 1 from public.access_grants g where g.user_id = v_me and g.revoked_at is null and g.until is null) then
    return jsonb_build_object('ok', false, 'error', 'You already have Marble for good, so there''s nothing to add. Pass the code on to a friend.');
  end if;
  if v_g.months is null then
    v_until := null;
  else
    -- Free months start now, or when free months already running end
    select greatest(now(), coalesce(max(g.until), now())) into v_from
      from public.access_grants g where g.user_id = v_me and g.revoked_at is null and g.until > now();
    v_until := v_from + make_interval(months => v_g.months);
  end if;
  insert into public.access_grants (user_id, until, source, code_id) values (v_me, v_until, 'code', v_g.id);
  update public.gift_codes set redeemed_by = v_me, redeemed_at = now() where id = v_g.id;
  -- A Stripe subscription that will still charge (a trial that turns paid, or a plan that renews)
  v_sub := exists (select 1 from public.subscriptions s where s.user_id = v_me
                     and s.status in ('trialing', 'active', 'past_due') and not s.cancel_at_period_end);
  return jsonb_build_object('ok', true, 'lifetime', v_g.months is null, 'months', v_g.months, 'until', v_until, 'subscription_on', v_sub);
end $$;
revoke all on function public.redeem_gift_code(text) from public, anon;
grant execute on function public.redeem_gift_code(text) to authenticated;

-- ---------- The admin side of gift codes ----------
-- A new code: 12 characters from 32 (2^60 possibilities); 256 is a multiple of 32, so every character is equally likely
create or replace function public.gift_code_new()
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_b bytea := extensions.gen_random_bytes(12);
  v_s text := '';
begin
  for i in 0..11 loop
    v_s := v_s || substr(v_abc, (get_byte(v_b, i) % 32) + 1, 1);
    if i in (3, 7) then v_s := v_s || '-'; end if;
  end loop;
  return v_s;
end $$;
revoke all on function public.gift_code_new() from public, anon, authenticated;

create or replace function public.admin_gift_codes_make(p_count integer, p_months integer, p_label text,
  p_competition uuid default null, p_giveaway uuid default null, p_redeem_by timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin uuid := public.admin_gate();
  v_batch uuid := gen_random_uuid();
  v_codes text[] := '{}';
  v_code text;
begin
  if p_count is null or p_count not between 1 and 50 then raise exception 'Make between 1 and 50 codes at a time' using errcode = '22023'; end if;
  if p_months is not null and p_months not between 1 and 36 then raise exception 'Free months are 1 to 36, or lifetime' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_label, ''))) not between 3 and 80 then raise exception 'Say what the codes are for (3 to 80 characters)' using errcode = '22023'; end if;
  if p_redeem_by is not null and p_redeem_by <= now() then raise exception 'The last day to use them has to be in the future' using errcode = '22023'; end if;
  if p_competition is not null and not exists (select 1 from public.competitions where id = p_competition) then raise exception 'No such competition' using errcode = '22023'; end if;
  if p_giveaway is not null and not exists (select 1 from public.giveaways where id = p_giveaway) then raise exception 'No such giveaway' using errcode = '22023'; end if;
  for i in 1..p_count loop
    loop
      v_code := public.gift_code_new();
      exit when not exists (select 1 from public.gift_codes where code = v_code);
    end loop;
    insert into public.gift_codes (code, months, label, batch, competition_id, giveaway_id, redeem_by, created_by)
    values (v_code, p_months, btrim(p_label), v_batch, p_competition, p_giveaway, p_redeem_by, v_admin);
    v_codes := v_codes || v_code;
  end loop;
  -- The log names the batch, never the codes themselves
  perform public.admin_note('gift_codes.make', 'gift_batch', v_batch::text, jsonb_build_object('count', p_count,
    'months', p_months, 'lifetime', p_months is null, 'label', btrim(p_label), 'competition', p_competition,
    'giveaway', p_giveaway, 'redeem_by', p_redeem_by));
  return jsonb_build_object('batch', v_batch, 'codes', to_jsonb(v_codes));
end $$;
revoke all on function public.admin_gift_codes_make(integer, integer, text, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.admin_gift_codes_make(integer, integer, text, uuid, uuid, timestamptz) to authenticated;

create or replace function public.admin_gift_codes()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'months', c.months, 'label', c.label, 'batch', c.batch,
      'competition', (select x.title from public.competitions x where x.id = c.competition_id),
      'giveaway', (select x.title from public.giveaways x where x.id = c.giveaway_id),
      'redeem_by', c.redeem_by, 'created_at', c.created_at, 'redeemed_at', c.redeemed_at, 'revoked_at', c.revoked_at,
      'redeemed_by', (select jsonb_build_object('id', p.id, 'handle', p.handle) from public.profiles p where p.id = c.redeemed_by),
      'status', case when c.revoked_at is not null then 'revoked' when c.redeemed_at is not null then 'used'
                     when c.redeem_by is not null and c.redeem_by < now() then 'expired' else 'unused' end)
      order by c.created_at desc, c.code)
    from (select * from public.gift_codes order by created_at desc limit 500) c), '[]'::jsonb);
end $$;
revoke all on function public.admin_gift_codes() from public, anon;
grant execute on function public.admin_gift_codes() to authenticated;

create or replace function public.admin_gift_code_revoke(p_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_g public.gift_codes;
begin
  perform public.admin_gate();
  select * into v_g from public.gift_codes where id = p_id for update;
  if not found then raise exception 'No such code' using errcode = 'P0001'; end if;
  if v_g.redeemed_at is not null then raise exception 'That code has been used, so it can''t be cancelled' using errcode = 'P0001'; end if;
  if v_g.revoked_at is not null then return; end if;
  update public.gift_codes set revoked_at = now() where id = p_id;
  perform public.admin_note('gift_codes.revoke', 'gift_code', p_id::text, jsonb_build_object('label', v_g.label, 'months', v_g.months, 'batch', v_g.batch));
end $$;
revoke all on function public.admin_gift_code_revoke(uuid) from public, anon;
grant execute on function public.admin_gift_code_revoke(uuid) to authenticated;

commit;
