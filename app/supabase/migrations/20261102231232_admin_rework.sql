-- The admin area, reworked: supabase/migrations-pending/20261103100000_admin_rework.sql, lines 47 to 1191 (undo: ROLLBACK.md
-- section 35). Run through a check that the text is the file's, byte for byte.
do $apply$
declare
  v_body text := $tb$-- ---------- Referral links: codes and custom codes ----------
create table public.referral_aliases (
  code text primary key check (code ~ '^[a-z0-9._]{2,24}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.referral_aliases is 'A referrer''s earlier referral codes, kept working after the admin gives them a custom one. Read through the referral functions only.';
alter table public.referral_aliases enable row level security;
revoke all on table public.referral_aliases from anon, authenticated;

-- An earlier code that goes (its account deleted, or the admin gives it back) is held 90 days like a handle, so nobody
-- new picks it up while old links still point at it
create or replace function public.referral_alias_hold()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.handle_holds (handle, user_id, released_at) values (old.code, old.user_id, now())
    on conflict (handle) do update set user_id = excluded.user_id, released_at = excluded.released_at;
  return old;
end $$;
revoke all on function public.referral_alias_hold() from public, anon, authenticated;
create trigger referral_alias_hold before delete on public.referral_aliases for each row execute function public.referral_alias_hold();

-- Whose code is it: their current code, then an earlier one
create or replace function public.referrer_of(p_code text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.id from public.profiles p where p.referral_code = lower(btrim(p_code))),
    (select a.user_id from public.referral_aliases a where a.code = lower(btrim(p_code))))
$$;
revoke all on function public.referrer_of(text) from public, anon, authenticated;

-- ---------- Referral links: clicks ----------
create table public.ref_clicks (
  day date not null,
  code text not null check (code ~ '^[a-z0-9._]{2,24}$'),
  referrer_id uuid references auth.users(id) on delete set null,
  n integer not null default 0 check (n >= 0),
  primary key (day, code)
);
comment on table public.ref_clicks is 'Referral link opens per UTC day and code, and whose code it was then (null: nobody''s). Nothing about who clicked. Kept 400 days.';
create index ref_clicks_referrer on public.ref_clicks (referrer_id, day);
alter table public.ref_clicks enable row level security;
revoke all on table public.ref_clicks from anon, authenticated;

create or replace function public.ref_click(p_ref text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := lower(btrim(coalesce(p_ref, '')));
  v_day date := (now() at time zone 'utc')::date;
  v_owner uuid;
begin
  if v_code !~ '^[a-z0-9._]{2,24}$' then return false; end if;
  v_owner := public.referrer_of(v_code);
  -- Anyone can call this, so codes nobody has get 500 new rows a day at most (a real code's row is one a day)
  if v_owner is null and not exists (select 1 from public.ref_clicks c where c.day = v_day and c.code = v_code)
     and (select count(*) from public.ref_clicks c where c.day = v_day and c.referrer_id is null) >= 500 then
    return false;
  end if;
  insert into public.ref_clicks as c (day, code, referrer_id, n)
  values (v_day, v_code, v_owner, 1)
  on conflict (day, code) do update set n = c.n + 1, referrer_id = excluded.referrer_id
    where c.n < 5000;
  return v_owner is not null;
end $$;
revoke all on function public.ref_click(text) from public;
grant execute on function public.ref_click(text) to anon, authenticated;

-- ---------- Referral links: every claim, and what happened ----------
create table public.referral_claims (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  code text not null check (char_length(code) <= 40),
  user_id uuid references auth.users(id) on delete cascade,
  referrer_id uuid references auth.users(id) on delete set null,
  result text not null check (result in ('linked', 'unknown_code', 'own_code', 'same_person', 'account_too_old', 'already_referred'))
);
comment on table public.referral_claims is 'Each attempt to link a new account to a referral code, and the outcome. Read through the admin functions only. Kept 400 days.';
create index referral_claims_at on public.referral_claims (at desc);
create index referral_claims_referrer on public.referral_claims (referrer_id, at desc);
alter table public.referral_claims enable row level security;
revoke all on table public.referral_claims from anon, authenticated;
revoke all on sequence public.referral_claims_id_seq from anon, authenticated;  -- the id counter, opened by default

create or replace function public.claim_referral(p_ref text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_code text := left(lower(btrim(coalesce(p_ref, ''))), 40);
  owner uuid;
  v_result text;
begin
  if me is null or v_code = '' then return false; end if;
  -- One record per account and code is enough: a second try of the same code changes nothing
  -- and an account trying code after code stops being recorded (or linked) after 10
  if exists (select 1 from public.referral_claims c where c.user_id = me and c.code = v_code)
     or (select count(*) from public.referral_claims c where c.user_id = me) >= 10 then
    return exists (select 1 from public.referrals r where r.referred_id = me);
  end if;
  owner := public.referrer_of(v_code);
  v_result := case
    when owner is not null and exists (select 1 from public.referrals where referred_id = me and referrer_id = owner) then 'linked'
    when exists (select 1 from public.referrals where referred_id = me) then 'already_referred'
    when owner is null then 'unknown_code'
    when owner = me then 'own_code'
    when (select created_at from auth.users where id = me) < now() - interval '1 day' then 'account_too_old'
    when public.same_person(owner, me) then 'same_person'
    else 'linked' end;
  if v_result = 'linked' then
    insert into public.referrals (referrer_id, referred_id) values (owner, me) on conflict do nothing;
    update public.profile_private set referred_by = (select p.referral_code from public.profiles p where p.id = owner)
      where id = me and referred_by is null;
  end if;
  insert into public.referral_claims (code, user_id, referrer_id, result) values (v_code, me, owner, v_result);
  return v_result = 'linked';
end $$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ---------- A partner's own deal ----------
create table public.referral_terms (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rate numeric(4,3) check (rate is null or (rate >= 0 and rate <= 0.6)),
  months integer check (months is null or months between 1 and 36),
  paused boolean not null default false,
  note text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.referral_terms is 'A referrer''s own commission deal, set in the admin area. No row: the standard 30% for 12 months. Paused: new commission is held for review.';
alter table public.referral_terms enable row level security;
revoke all on table public.referral_terms from anon, authenticated;

create or replace function public.stripe_record_commission(p_payer uuid, p_ref text, p_payment_intent text, p_paid integer, p_currency text, p_pence integer, p_paid_at timestamp with time zone default now(), p_card text default null::text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  ref record;
  terms record;
  first_paid timestamptz;
  v_status text := 'pending';
  v_months integer;
  v_pence integer;
begin
  if p_paid <= 0 or p_pence <= 0 then return 'nothing paid'; end if;
  select * into ref from public.referrals where referred_id = p_payer;
  if not found then return 'not referred'; end if;
  if exists (select 1 from public.commissions where stripe_payment_ref = p_ref
             or (p_payment_intent is not null and stripe_payment_intent = p_payment_intent and kind = 'earning')) then
    return 'already recorded';
  end if;
  select * into terms from public.referral_terms where user_id = ref.referrer_id;
  v_months := coalesce(terms.months, 12);
  select min(created_at) into first_paid from public.commissions where referral_id = ref.id and kind = 'earning';
  if first_paid is not null and p_paid_at > first_paid + make_interval(months => v_months) then return 'past ' || v_months || ' months'; end if;
  -- p_pence is the commission at the standard 30% (billing.js COMMISSION_RATE); a partner's own rate scales it
  v_pence := round(p_pence * coalesce(terms.rate, 0.3) / 0.3)::integer;
  if v_pence <= 0 then return 'no commission on this deal'; end if;
  if coalesce(terms.paused, false)
     or public.same_person(ref.referrer_id, p_payer)
     or (public.card_hash(p_card) is not null and exists (
           select 1 from public.trial_uses t join public.customers c on c.stripe_customer_id = t.stripe_customer
            where t.email_hash = public.card_hash(p_card) and c.user_id = ref.referrer_id)) then
    v_status := 'held';
  end if;
  insert into public.commissions (referral_id, referrer_id, stripe_payment_ref, stripe_payment_intent, paid_amount, paid_currency, amount_pence, gross_pence, status, kind, created_at)
  values (ref.id, ref.referrer_id, p_ref, p_payment_intent, p_paid, lower(p_currency), v_pence, v_pence, v_status, 'earning', p_paid_at);
  return case when v_status = 'held' then 'recorded, held for review' else 'recorded' end;
exception when unique_violation then
  return 'already recorded';
end $$;
revoke all on function public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz, text) to service_role;

create or replace function public.my_referral_terms()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('rate', coalesce(t.rate, 0.3), 'months', coalesce(t.months, 12), 'own', t.user_id is not null and (t.rate is not null or t.months is not null))
  from (select (select auth.uid()) as me) x left join public.referral_terms t on t.user_id = x.me
$$;
revoke all on function public.my_referral_terms() from public, anon;
grant execute on function public.my_referral_terms() to authenticated;

create or replace function public.my_ref_clicks()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'all', coalesce(sum(c.n), 0),
    'days30', coalesce(sum(c.n) filter (where c.day > (now() at time zone 'utc')::date - 30), 0))
  from public.ref_clicks c where c.referrer_id = (select auth.uid())
$$;
revoke all on function public.my_ref_clicks() from public, anon;
grant execute on function public.my_ref_clicks() to authenticated;

-- ---------- App users: the days they open the app ----------
create table public.active_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
comment on table public.active_days is 'The UTC days a trader opened the app, for counting active members. Written by seen(), read by the admin functions only. Kept 400 days.';
create index active_days_day on public.active_days (day);
alter table public.active_days enable row level security;
revoke all on table public.active_days from anon, authenticated;

create or replace function public.seen()
returns void language sql security definer set search_path = ''
as $$
  insert into public.active_days (user_id, day)
  select (select auth.uid()), (now() at time zone 'utc')::date where (select auth.uid()) is not null
  on conflict do nothing
$$;
revoke all on function public.seen() from public, anon;
grant execute on function public.seen() to authenticated;

-- Free access given in the admin area, with a note of why
alter table public.access_grants drop constraint access_grants_source_check;
alter table public.access_grants add constraint access_grants_source_check check (source = any (array['code', 'free50', 'admin']));
alter table public.access_grants add column note text check (note is null or char_length(note) <= 120);

-- ---------- Member numbers ----------
-- Every account gets a number in the order accounts were made (#1 is the first) and keeps it; a number is never given
-- twice. members holds it, and the trader can read their own. profiles.member_no is the copy others see, there only
-- while the trader shows it (show_number, theirs to change in Profile), so a hidden number stays hidden.
create sequence public.member_no_seq as integer;
revoke all on sequence public.member_no_seq from public, anon, authenticated;
create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  no integer not null unique check (no > 0),
  created_at timestamptz not null default now()
);
comment on table public.members is 'Each account''s member number, in the order accounts were made. Never given twice. The trader reads their own.';
alter table public.members enable row level security;
revoke all on table public.members from anon, authenticated;
grant select on table public.members to authenticated;
create policy "own number: read" on public.members for select to authenticated using (user_id = (select auth.uid()));

alter table public.profiles add column member_no integer check (member_no is null or member_no > 0);
alter table public.profiles add column show_number boolean not null default true;
comment on column public.profiles.member_no is 'The member number, while the trader shows it (show_number); otherwise empty. Set by the profile triggers from members.';
grant update (show_number) on public.profiles to authenticated;

-- The accounts so far, oldest first; new ones take the next number as their profile is made
insert into public.members (user_id, no)
select p.id, row_number() over (order by p.created_at, p.id) from public.profiles p;
select setval('public.member_no_seq', coalesce((select max(m.no) from public.members m), 0) + 1, false);
alter table public.members alter column no set default nextval('public.member_no_seq');
alter sequence public.member_no_seq owned by public.members.no;

create or replace function public.profiles_number()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  begin
    insert into public.members (user_id) values (new.id) on conflict (user_id) do nothing;
  exception when others then
    raise warning 'member number not given: %', sqlerrm;  -- never stops an account being made
  end;
  new.member_no := case when new.show_number then (select m.no from public.members m where m.user_id = new.id) end;
  return new;
end $$;
revoke all on function public.profiles_number() from public, anon, authenticated;
create trigger profiles_number before insert on public.profiles for each row execute function public.profiles_number();

-- As before (handles held, ids and join dates fixed), and: the referral code changes only through
-- admin_referral_code_set, and the public number follows show_number
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = ''
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
    if not (coalesce(current_setting('marble.code_change', true), '') = 'on' and public.is_admin()) then
      new.referral_code := coalesce(old.referral_code, new.handle);
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    new.member_no := case when new.show_number then (select m.no from public.members m where m.user_id = old.id) end;
    return new;
  end if;
  -- An account that's gone: its handle and code are held, so nobody inherits its old links
  insert into public.handle_holds (handle, user_id, released_at) values (old.handle, old.id, now())
    on conflict (handle) do update set released_at = excluded.released_at;
  if old.referral_code is not null and old.referral_code <> old.handle then
    insert into public.handle_holds (handle, user_id, released_at) values (old.referral_code, old.id, now())
      on conflict (handle) do update set released_at = excluded.released_at;
  end if;
  return old;
end $$;

-- Through the guard above, which fills member_no; nobody's "last updated" time moves for it
alter table public.profiles disable trigger profiles_touch;
update public.profiles set show_number = true;
alter table public.profiles enable trigger profiles_touch;

-- As before, and a handle can't be someone's earlier referral code either (a new account's code is its handle)
create or replace function public.handle_free_for(h text, p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select h is not null
    and not exists (select 1 from public.profiles p where (p.handle = h or p.referral_code = h) and p.id is distinct from p_user)
    and not exists (select 1 from public.handle_holds x where x.handle = h and x.user_id is distinct from p_user and x.released_at > now() - interval '90 days')
    and not exists (select 1 from public.referral_aliases a where a.code = lower(h) and a.user_id is distinct from p_user)
$$;

-- As before, and a code given at sign-up is looked up like a link (earlier codes too), and what happened is recorded
-- with the other claims, so claim_referral on first sign-in finds it and changes nothing
create or replace function public.create_profile_for(p_user uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  u auth.users;
  provider text;
  v_full text;
  base text;
  candidate text;
  tries int := 0;
  ref text;
  referrer uuid;
  v_result text;
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
  insert into public.profiles (id, handle, name, referral_code) values (p_user, candidate, '', candidate)
  on conflict (id) do nothing;
  if not found then return false; end if;
  -- A second account on the same address can't refer itself (audit 2, L5)
  ref := left(lower(btrim(nullif(u.raw_user_meta_data ->> 'ref', ''))), 40);
  if ref is not null then
    referrer := public.referrer_of(ref);
    v_result := case when referrer is null then 'unknown_code' when referrer = p_user then 'own_code'
                     when public.same_person(referrer, p_user) then 'same_person' else 'linked' end;
    if v_result <> 'linked' then referrer := null; end if;
  end if;
  insert into public.profile_private (id, referred_by, full_name)
  values (p_user, case when referrer is not null then (select p.referral_code from public.profiles p where p.id = referrer) end, v_full)
  on conflict (id) do nothing;
  if referrer is not null then
    insert into public.referrals (referrer_id, referred_id) values (referrer, p_user) on conflict do nothing;
  end if;
  if ref is not null then
    insert into public.referral_claims (code, user_id, referrer_id, result)
    values (ref, p_user, coalesce(referrer, public.referrer_of(ref)), v_result);
  end if;
  return true;
end $$;

-- ---------- Running costs ----------
create table public.admin_costs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  pence integer not null check (pence >= 0 and pence < 100000000),
  every text not null check (every in ('month', 'year')),
  since date not null default current_date,
  until date check (until is null or until >= since),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);
comment on table public.admin_costs is 'What running Marble costs, typed in by the admin (in pence, GBP). Read and written through the admin functions only.';
alter table public.admin_costs enable row level security;
revoke all on table public.admin_costs from anon, authenticated;

-- ---------- The admin-stripe edge function: its gate and its log ----------
create or replace function public.admin_whoami()
returns uuid language sql stable security definer set search_path = ''
as $$ select public.admin_gate() $$;
revoke all on function public.admin_whoami() from public, anon;
grant execute on function public.admin_whoami() to authenticated;

create or replace function public.admin_stripe_note(p_action text, p_id text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  if p_action not in ('discount.create', 'discount.on', 'discount.off') then raise exception 'Not a Stripe action' using errcode = 'P0001'; end if;
  perform public.admin_note(p_action, 'discount', left(p_id, 80), p_detail);
end $$;
revoke all on function public.admin_stripe_note(text, text, jsonb) from public, anon;
grant execute on function public.admin_stripe_note(text, text, jsonb) to authenticated;

-- ---------- Users ----------
-- p_filter: all, trial, paying, failing, lifetime, free, lapsed, none, referred, active (opened the app in 7 days),
-- quiet (joined over 14 days ago, not opened in 14). p_sort: joined, active, trades. 100 a page.
create or replace function public.admin_users(p_query text default '', p_filter text default 'all', p_sort text default 'joined', p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := left(regexp_replace(btrim(coalesce(p_query, '')), '^@', ''), 80);
  v_like text;
  v_no integer;
  v_today date := (now() at time zone 'utc')::date;
  v_out jsonb;
begin
  perform public.admin_gate();
  -- #214 or 214 finds member 214 too
  if v_q ~ '^#?[0-9]{1,9}$' then v_no := ltrim(v_q, '#')::integer; end if;
  if p_filter not in ('all', 'trial', 'paying', 'failing', 'lifetime', 'free', 'lapsed', 'none', 'referred', 'active', 'quiet') then
    raise exception 'Unknown filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  with base as (
    select p.id, p.handle, p.name, p.avatar_url, p.created_at, u.email, u.last_sign_in_at, m.no,
           public.admin_plan_of(p.id) as plan,
           (select max(a.day) from public.active_days a where a.user_id = p.id) as last_active,
           (select count(*) from public.trades t where t.user_id = p.id) as trades,
           (select rp.handle from public.referrals r join public.profiles rp on rp.id = r.referrer_id where r.referred_id = p.id) as referrer,
           pp.heard_from,
           (lower(p.handle::text) = lower(v_q) or lower(coalesce(u.email, '')) = lower(v_q) or m.no = v_no) as exact
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.profile_private pp on pp.id = p.id
    left join public.members m on m.user_id = p.id
    where v_q = '' or p.handle::text ilike v_like or u.email ilike v_like or p.name ilike v_like or m.no = v_no
  ), kept as (
    select * from base b where case p_filter
      when 'all' then true
      when 'trial' then b.plan ->> 'kind' = 'trial'
      when 'paying' then b.plan ->> 'kind' in ('monthly', 'yearly') and b.plan ->> 'status' in ('active', 'past_due')
      when 'failing' then b.plan ->> 'status' = 'past_due'
      when 'lifetime' then b.plan ->> 'kind' = 'lifetime'
      when 'free' then b.plan ->> 'kind' in ('gift', 'gift_lifetime')
      when 'lapsed' then b.plan ->> 'kind' = 'lapsed' or b.plan ->> 'status' = 'canceled'
      when 'none' then b.plan ->> 'kind' = 'none'
      when 'referred' then b.referrer is not null
      when 'active' then b.last_active > v_today - 7
      when 'quiet' then b.created_at < now() - interval '14 days' and (b.last_active is null or b.last_active <= v_today - 14)
    end
  )
  select jsonb_build_object(
    'total', (select count(*) from public.profiles),
    'matched', (select count(*) from kept),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'no', k.no, 'handle', k.handle, 'name', k.name, 'email', k.email,
              'avatar', k.avatar_url, 'joined', k.created_at, 'last_sign_in', k.last_sign_in_at, 'last_active', k.last_active,
              'plan', k.plan, 'trades', k.trades, 'referrer', k.referrer, 'heard_from', k.heard_from) order by k.rn)
            from (select kept.*, row_number() over (order by
                    kept.exact desc,
                    case when p_sort = 'active' then kept.last_active end desc nulls last,
                    case when p_sort = 'trades' then kept.trades end desc nulls last,
                    kept.created_at desc, kept.id) as rn
                  from kept order by rn
                  offset greatest(0, coalesce(p_offset, 0)) limit 100) k), '[]'::jsonb))
  into v_out;
  return v_out;
end $$;
revoke all on function public.admin_users(text, text, text, integer) from public, anon;
grant execute on function public.admin_users(text, text, text, integer) to authenticated;

-- One trader, as before (20261031150100), plus when they last opened the app, who referred them, their referral code
-- and deal, and each gift's id, source and note (so a gift given here can be taken back)
create or replace function public.admin_trader(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
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
    'currency', (select pp.currency from public.profile_private pp where pp.id = p_user),
    'news', (select pp.marketing_opt_in from public.profile_private pp where pp.id = p_user),
    'referred_by', (select pp.referred_by from public.profile_private pp where pp.id = p_user),
    'referrer', (select jsonb_build_object('id', rp.id, 'handle', rp.handle, 'since', r.created_at)
                 from public.referrals r join public.profiles rp on rp.id = r.referrer_id where r.referred_id = p_user),
    'referral_code', v_p.referral_code,
    'terms', (select jsonb_build_object('rate', t.rate, 'months', t.months, 'paused', t.paused, 'note', t.note)
              from public.referral_terms t where t.user_id = p_user),
    'crew', (select c.crew from public.crew_members c where c.user_id = p_user),
    'staff', public.is_staff(p_user),
    'admin', exists (select 1 from public.admins a where a.user_id = p_user),
    'access', public.has_access_for(p_user),
    'plan', public.admin_plan_of(p_user),
    'subscription', (select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_end', s.trial_end, 'period_end', s.current_period_end,
                       'cancels', s.cancel_at_period_end, 'amount', s.amount, 'currency', s.currency, 'since', s.created_at)
                     from public.subscriptions s where s.user_id = p_user order by s.updated_at desc limit 1),
    'lifetime', (select jsonb_build_object('seat', l.seat, 'since', l.created_at, 'amount', l.amount, 'currency', l.currency,
                   'refunded', l.refunded) from public.lifetime_purchases l where l.user_id = p_user order by l.refunded, l.created_at desc limit 1),
    'gifts', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'source', g.source, 'until', g.until, 'since', g.created_at,
                 'revoked', g.revoked_at, 'label', coalesce(g.note, c.label), 'code', c.code) order by g.created_at desc)
               from public.access_grants g left join public.gift_codes c on c.id = g.code_id where g.user_id = p_user), '[]'::jsonb),
    'disputes', (select count(*) from public.payment_disputes d where d.user_id = p_user and d.status in ('open', 'lost')),
    'stripe_customer', (select c.stripe_customer_id from public.customers c where c.user_id = p_user),
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
    'referrals', jsonb_build_object(
      'referred', (select count(*) from public.referrals r where r.referrer_id = p_user),
      'clicks', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.referrer_id = p_user),
      'pence', coalesce((select jsonb_object_agg(x.status, x.pence) from (select c.status, sum(c.amount_pence) as pence
                 from public.commissions c where c.referrer_id = p_user group by c.status) x), '{}'::jsonb)),
    'events', jsonb_build_object(
      'competitions', (select count(*) from public.competition_entries e where e.user_id = p_user),
      'giveaways', (select count(*) from public.giveaway_entries e where e.user_id = p_user))
  );
end $$;
revoke all on function public.admin_trader(uuid) from public, anon;
grant execute on function public.admin_trader(uuid) to authenticated;

-- How Marble is used: active members by day, week and month, how each week's new accounts keep coming back, where
-- people heard about Marble, and how many use each part of it
create or replace function public.admin_activity()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'since', (select min(a.day) from public.active_days a),
    'dau', (select count(*) from public.active_days a where a.day = v_today),
    'wau', (select count(distinct a.user_id) from public.active_days a where a.day > v_today - 7),
    'mau', (select count(distinct a.user_id) from public.active_days a where a.day > v_today - 30),
    'days', (select jsonb_agg(jsonb_build_object('day', d.day,
               'active', (select count(*) from public.active_days a where a.day = d.day),
               'signups', (select count(*) from public.profiles p where (p.created_at at time zone 'utc')::date = d.day)) order by d.day)
             from generate_series(v_today - 29, v_today, interval '1 day') as d(day)),
    -- Weeks start on Monday (UTC). wN: of that week's new accounts, how many opened the app in their Nth week after it.
    'cohorts', (select jsonb_agg(jsonb_build_object('week', w.start, 'size', w.size,
                  'w1', case when w.start + 14 <= v_today + 1 then w.w1 end,
                  'w2', case when w.start + 21 <= v_today + 1 then w.w2 end,
                  'w4', case when w.start + 35 <= v_today + 1 then w.w4 end) order by w.start desc)
                from (select s.start, count(*) as size,
                        count(*) filter (where exists (select 1 from public.active_days a where a.user_id = p.id and a.day >= s.start + 7 and a.day < s.start + 14)) as w1,
                        count(*) filter (where exists (select 1 from public.active_days a where a.user_id = p.id and a.day >= s.start + 14 and a.day < s.start + 21)) as w2,
                        count(*) filter (where exists (select 1 from public.active_days a where a.user_id = p.id and a.day >= s.start + 28 and a.day < s.start + 35)) as w4
                      from public.profiles p
                      cross join lateral (select date_trunc('week', p.created_at at time zone 'utc')::date as start) s
                      where p.created_at > now() - interval '9 weeks'
                      group by s.start) w),
    'heard', coalesce((select jsonb_object_agg(x.k, x.n) from (
               select case when pp.heard_from is null then 'none' when pp.heard_from like 'other:%' then 'other' else pp.heard_from end as k, count(*) as n
               from public.profiles p left join public.profile_private pp on pp.id = p.id group by 1) x), '{}'::jsonb),
    'referred', (select count(*) from public.referrals r where r.referred_id is not null),
    'use', jsonb_build_object(
      'traders', (select count(*) from public.profiles),
      'with_trades', (select count(distinct t.user_id) from public.trades t),
      'trades', (select count(*) from public.trades),
      'trades_7d', (select count(*) from public.trades t where t.created_at > now() - interval '7 days'),
      'synced', (select count(distinct c.user_id) from public.connections c where c.status = 'ok'),
      'imported', (select count(distinct i.user_id) from public.imports i where i.undone_at is null),
      'push', (select count(distinct s.user_id) from public.push_subscriptions s),
      'posted_30d', (select count(distinct p.user_id) from public.posts p where p.created_at > now() - interval '30 days'),
      'study', (select count(distinct n.user_id) from public.notebooks n))
  );
end $$;
revoke all on function public.admin_activity() from public, anon;
grant execute on function public.admin_activity() to authenticated;

-- ---------- Free access, given and taken back here ----------
-- p_months null: for good. A trader with a paid plan doesn't need it; the admin area says so before this is called.
create or replace function public.admin_grant_access(p_user uuid, p_months integer, p_note text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.admin_gate();
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'No such trader' using errcode = 'P0001'; end if;
  if p_months is not null and (p_months < 1 or p_months > 36) then raise exception 'Between 1 and 36 months, or for good' using errcode = 'P0001'; end if;
  if v_note is null or char_length(v_note) < 3 then raise exception 'Say why, in a few words' using errcode = 'P0001'; end if;
  insert into public.access_grants (user_id, starts_at, until, source, note)
  values (p_user, now(), case when p_months is null then null else now() + make_interval(months => p_months) end, 'admin', left(v_note, 120))
  returning id into v_id;
  perform public.admin_note('access.grant', 'trader', p_user::text, jsonb_build_object('grant', v_id, 'months', p_months, 'note', left(v_note, 120)));
  return v_id;
end $$;
revoke all on function public.admin_grant_access(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_access(uuid, integer, text) to authenticated;

-- Takes back free access given here or by a gift code (a first-50 seat goes back through admin_free50_revoke)
create or replace function public.admin_grant_revoke(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  g public.access_grants;
begin
  perform public.admin_gate();
  select * into g from public.access_grants where id = p_id for update;
  if not found then raise exception 'No such grant' using errcode = 'P0001'; end if;
  if g.source = 'free50' then raise exception 'Take a first-50 seat back from the free seats list' using errcode = 'P0001'; end if;
  if g.revoked_at is not null then return; end if;
  update public.access_grants set revoked_at = now() where id = p_id;
  perform public.admin_note('access.revoke', 'trader', g.user_id::text, jsonb_build_object('grant', p_id, 'source', g.source));
end $$;
revoke all on function public.admin_grant_revoke(uuid) from public, anon;
grant execute on function public.admin_grant_revoke(uuid) to authenticated;

-- ---------- Referrals ----------
-- A referred trader counts as paying on a live monthly or yearly plan, or lifetime
create or replace function public.admin_paying(p_plan jsonb)
returns boolean language sql immutable set search_path = ''
as $$ select (p_plan ->> 'kind' in ('monthly', 'yearly') and p_plan ->> 'status' in ('active', 'past_due')) or p_plan ->> 'kind' = 'lifetime' $$;
revoke all on function public.admin_paying(jsonb) from public, anon, authenticated;

-- The whole programme: the last 30 days by day, every referrer with their numbers and deal, the codes people opened
-- that nobody has, what happened to each claim, and commission held for review
create or replace function public.admin_referrals()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_gate();
  perform public.approve_due_commissions();
  return jsonb_build_object(
    'standard', jsonb_build_object('rate', 0.3, 'months', 12, 'min_payout', 5000, 'hold_days', 60, 'window_days', 30),
    'totals', jsonb_build_object(
      'clicks', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.referrer_id is not null),
      'clicks_30', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.referrer_id is not null and c.day > v_today - 30),
      'broken_30', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.referrer_id is null and c.day > v_today - 30),
      'signups', (select count(*) from public.referrals r where r.referred_id is not null),
      'signups_30', (select count(*) from public.referrals r where r.referred_id is not null and r.created_at > now() - interval '30 days'),
      'trials', (select count(*) from public.referrals r where public.admin_plan_of(r.referred_id) ->> 'kind' = 'trial'),
      'paying', (select count(*) from public.referrals r where r.referred_id is not null and public.admin_paying(public.admin_plan_of(r.referred_id))),
      'pence', coalesce((select jsonb_object_agg(x.status, x.pence) from (select c.status, sum(c.amount_pence) as pence
                 from public.commissions c group by c.status) x), '{}'::jsonb),
      'paid_out', (select coalesce(sum(p.amount_pence), 0) from public.payouts p where p.status = 'sent')),
    'days', (select jsonb_agg(jsonb_build_object('day', d.day,
               'clicks', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.day = d.day and c.referrer_id is not null),
               'signups', (select count(*) from public.referrals r where (r.created_at at time zone 'utc')::date = d.day)) order by d.day)
             from generate_series(v_today - 29, v_today, interval '1 day') as d(day)),
    'referrers', coalesce((select jsonb_agg(x order by (x ->> 'paying')::int desc, (x ->> 'signups')::int desc, (x ->> 'clicks')::int desc)
      from (select y.x from (select jsonb_build_object(
              'id', p.id, 'handle', p.handle, 'name', p.name, 'avatar', p.avatar_url, 'code', p.referral_code,
              'aliases', (select coalesce(jsonb_agg(a.code order by a.created_at), '[]'::jsonb) from public.referral_aliases a where a.user_id = p.id),
              'clicks', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.referrer_id = p.id),
              'clicks_30', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.referrer_id = p.id and c.day > v_today - 30),
              'signups', (select count(*) from public.referrals r where r.referrer_id = p.id and r.referred_id is not null),
              'paying', (select count(*) from public.referrals r where r.referrer_id = p.id and r.referred_id is not null and public.admin_paying(public.admin_plan_of(r.referred_id))),
              'pence', coalesce((select jsonb_object_agg(y.status, y.pence) from (select c.status, sum(c.amount_pence) as pence
                         from public.commissions c where c.referrer_id = p.id group by c.status) y), '{}'::jsonb),
              'payout_method', (select s.method from public.payout_settings s where s.user_id = p.id),
              'terms', (select jsonb_build_object('rate', t.rate, 'months', t.months, 'paused', t.paused, 'note', t.note)
                        from public.referral_terms t where t.user_id = p.id)) as x
            from public.profiles p
            where exists (select 1 from public.referrals r where r.referrer_id = p.id)
               or exists (select 1 from public.ref_clicks c where c.referrer_id = p.id)
               or exists (select 1 from public.commissions c where c.referrer_id = p.id)
               or exists (select 1 from public.referral_terms t where t.user_id = p.id)) y
            -- Anyone can open a link, so opens alone could put every account here: the list stops at the top 200
            order by (y.x ->> 'paying')::int desc, (y.x ->> 'signups')::int desc, (y.x ->> 'clicks')::int desc limit 200) z), '[]'::jsonb),
    'broken', coalesce((select jsonb_agg(jsonb_build_object('code', b.code, 'clicks', b.n, 'last', b.last) order by b.n desc)
                from (select c.code, sum(c.n) as n, max(c.day) as last from public.ref_clicks c
                      where c.referrer_id is null and c.day > v_today - 30 group by c.code order by 2 desc limit 20) b), '[]'::jsonb),
    'claims', coalesce((select jsonb_object_agg(x.result, x.n) from (select c.result, count(*) as n from public.referral_claims c
                where c.at > now() - interval '30 days' group by c.result) x), '{}'::jsonb),
    'held', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'at', c.created_at, 'pence', c.amount_pence,
                 'paid', c.paid_amount, 'currency', c.paid_currency,
                 'referrer', jsonb_build_object('id', rp.id, 'handle', rp.handle),
                 'payer', (select jsonb_build_object('id', pp.id, 'handle', pp.handle) from public.referrals r join public.profiles pp on pp.id = r.referred_id where r.id = c.referral_id),
                 'why', case when coalesce((select t.paused from public.referral_terms t where t.user_id = c.referrer_id), false) then 'paused'
                             else 'same_person' end) order by c.created_at desc)
               from public.commissions c left join public.profiles rp on rp.id = c.referrer_id where c.status = 'held'), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_referrals() from public, anon;
grant execute on function public.admin_referrals() to authenticated;

-- One referrer: their codes, deal, payout details, clicks by day, everyone they referred, every commission and payout,
-- and every claim made with their codes
create or replace function public.admin_referrer(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_p public.profiles;
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_gate();
  select * into v_p from public.profiles where id = p_user;
  if not found then raise exception 'No such trader' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'id', v_p.id, 'handle', v_p.handle, 'name', v_p.name, 'avatar', v_p.avatar_url, 'code', v_p.referral_code,
    'aliases', (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'since', a.created_at) order by a.created_at), '[]'::jsonb)
                from public.referral_aliases a where a.user_id = p_user),
    'terms', (select jsonb_build_object('rate', t.rate, 'months', t.months, 'paused', t.paused, 'note', t.note, 'updated', t.updated_at)
              from public.referral_terms t where t.user_id = p_user),
    'payout', (select jsonb_build_object('method', s.method, 'destination', s.destination, 'updated', s.updated_at)
               from public.payout_settings s where s.user_id = p_user),
    'days', (select jsonb_agg(jsonb_build_object('day', d.day,
               'clicks', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.day = d.day and c.referrer_id = p_user),
               'signups', (select count(*) from public.referrals r where r.referrer_id = p_user and (r.created_at at time zone 'utc')::date = d.day)) order by d.day)
             from generate_series(v_today - 29, v_today, interval '1 day') as d(day)),
    'clicks', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.referrer_id = p_user),
    'referred', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'name', p.name, 'joined', r.created_at,
                   'plan', public.admin_plan_of(p.id),
                   'pence', (select coalesce(sum(c.amount_pence), 0) from public.commissions c where c.referral_id = r.id and c.status <> 'reversed'))
                 order by r.created_at desc)
               from public.referrals r join public.profiles p on p.id = r.referred_id where r.referrer_id = p_user), '[]'::jsonb),
    'commissions', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'at', c.created_at, 'kind', c.kind, 'status', c.status,
                   'pence', c.amount_pence, 'paid', c.paid_amount, 'currency', c.paid_currency,
                   'payer', (select pp.handle from public.referrals r join public.profiles pp on pp.id = r.referred_id where r.id = c.referral_id))
                 order by c.created_at desc)
               from (select * from public.commissions x where x.referrer_id = p_user order by x.created_at desc limit 200) c), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'pence', o.amount_pence, 'method', o.method, 'status', o.status, 'at', coalesce(o.paid_at, o.created_at))
                 order by o.created_at desc) from public.payouts o where o.user_id = p_user), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('at', c.at, 'code', c.code, 'result', c.result,
                   'who', (select p.handle from public.profiles p where p.id = c.user_id)) order by c.at desc)
               from (select * from public.referral_claims x where x.referrer_id = p_user order by x.at desc limit 100) c), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_referrer(uuid) from public, anon;
grant execute on function public.admin_referrer(uuid) to authenticated;

-- The latest 200 claims, or only the ones that didn't link
create or replace function public.admin_referral_claims(p_failed boolean default false)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'at', c.at, 'code', c.code, 'result', c.result,
            'who', (select jsonb_build_object('id', p.id, 'handle', p.handle) from public.profiles p where p.id = c.user_id),
            'referrer', (select jsonb_build_object('id', p.id, 'handle', p.handle) from public.profiles p where p.id = c.referrer_id))
          order by c.at desc)
    from (select * from public.referral_claims x where not p_failed or x.result <> 'linked' order by x.at desc limit 200) c), '[]'::jsonb);
end $$;
revoke all on function public.admin_referral_claims(boolean) from public, anon;
grant execute on function public.admin_referral_claims(boolean) to authenticated;

-- Test a code: is it well formed, whose is it, and has anyone opened it
create or replace function public.admin_ref_lookup(p_code text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  -- A whole link works too: trademarble.app/r/code or …/desk/?ref=code
  v_code text := lower(regexp_replace(regexp_replace(btrim(coalesce(p_code, '')), '^.*(/r/|[?&]ref=)', ''), '[/?&#].*$', ''));
  v_owner uuid;
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_gate();
  v_owner := case when v_code ~ '^[a-z0-9._]{2,24}$' then public.referrer_of(v_code) end;
  return jsonb_build_object(
    'code', v_code,
    'well_formed', v_code ~ '^[a-z0-9._]{2,24}$',
    'owner', (select jsonb_build_object('id', p.id, 'handle', p.handle, 'name', p.name, 'code', p.referral_code) from public.profiles p where p.id = v_owner),
    'via', case when v_owner is null then null when exists (select 1 from public.profiles p where p.referral_code = v_code) then 'code' else 'alias' end,
    'clicks_today', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.code = v_code and c.day = v_today),
    'clicks_30', (select coalesce(sum(c.n), 0) from public.ref_clicks c where c.code = v_code and c.day > v_today - 30),
    'claims', (select count(*) from public.referral_claims c where c.code = v_code),
    'linked', (select count(*) from public.referral_claims c where c.code = v_code and c.result = 'linked'));
end $$;
revoke all on function public.admin_ref_lookup(text) from public, anon;
grant execute on function public.admin_ref_lookup(text) to authenticated;

-- A custom code for a partner. Their old code keeps working (it becomes an alias). Giving them back an alias of
-- their own swaps the two.
create or replace function public.admin_referral_code_set(p_user uuid, p_code text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_old text;
begin
  perform public.admin_gate();
  if v_code !~ '^[a-z0-9._]{2,24}$' then raise exception '2 to 24 letters, numbers, dots or underscores' using errcode = 'P0001'; end if;
  select p.referral_code into v_old from public.profiles p where p.id = p_user for update;
  if not found then raise exception 'No such trader' using errcode = 'P0001'; end if;
  if v_old = v_code then return v_code; end if;
  -- Free the way a handle is: nobody else's handle, code or earlier code, not held after an account left, not reserved.
  -- One of their own earlier codes is theirs already (even a reserved one, like the owner's), so it can always go back.
  if not exists (select 1 from public.referral_aliases a where a.code = v_code and a.user_id = p_user)
     and (public.handle_reserved(v_code) or not public.handle_free_for(v_code, p_user)) then
    raise exception 'That code is taken, held for 90 days after an account closed, or reserved' using errcode = 'P0001';
  end if;
  delete from public.referral_aliases where code = v_code and user_id = p_user;
  if v_old is not null then
    insert into public.referral_aliases (code, user_id) values (v_old, p_user) on conflict (code) do nothing;
  end if;
  perform set_config('marble.code_change', 'on', true);  -- profiles_guard lets the code change for this update only
  update public.profiles set referral_code = v_code where id = p_user;
  perform set_config('marble.code_change', '', true);
  perform public.admin_note('referral.code', 'trader', p_user::text, jsonb_build_object('from', v_old, 'to', v_code));
  return v_code;
end $$;
revoke all on function public.admin_referral_code_set(uuid, text) from public, anon;
grant execute on function public.admin_referral_code_set(uuid, text) to authenticated;

-- A partner's deal. Rate as a fraction (0.4 is 40%). Nulls, not paused and no note: back to the standard terms.
create or replace function public.admin_referral_terms_set(p_user uuid, p_rate numeric, p_months integer, p_paused boolean, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.admin_gate();
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'No such trader' using errcode = 'P0001'; end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 0.6) then raise exception 'A rate from 0%% to 60%%' using errcode = 'P0001'; end if;
  if p_months is not null and (p_months < 1 or p_months > 36) then raise exception 'From 1 to 36 months' using errcode = 'P0001'; end if;
  if p_rate is null and p_months is null and not coalesce(p_paused, false) and v_note is null then
    delete from public.referral_terms where user_id = p_user;
  else
    insert into public.referral_terms (user_id, rate, months, paused, note, updated_at, updated_by)
    values (p_user, round(p_rate, 3), p_months, coalesce(p_paused, false), left(v_note, 300), now(), (select auth.uid()))
    on conflict (user_id) do update set rate = excluded.rate, months = excluded.months, paused = excluded.paused,
      note = excluded.note, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  perform public.admin_note('referral.terms', 'trader', p_user::text,
    jsonb_build_object('rate', p_rate, 'months', p_months, 'paused', coalesce(p_paused, false)));
end $$;
revoke all on function public.admin_referral_terms_set(uuid, numeric, integer, boolean, text) from public, anon;
grant execute on function public.admin_referral_terms_set(uuid, numeric, integer, boolean, text) to authenticated;

-- Held commission: release it (back to waiting its 60 days) or reject it. Waiting or approved commission can be held.
create or replace function public.admin_commission_review(p_id uuid, p_action text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  c public.commissions;
  v_to text;
begin
  perform public.admin_gate();
  select * into c from public.commissions where id = p_id for update;
  if not found then raise exception 'No such commission' using errcode = 'P0001'; end if;
  if c.kind <> 'earning' then raise exception 'Only earnings can be reviewed' using errcode = 'P0001'; end if;
  v_to := case
    when p_action = 'release' and c.status = 'held' then 'pending'
    when p_action = 'reject' and c.status in ('held', 'pending', 'approved') then 'reversed'
    when p_action = 'hold' and c.status in ('pending', 'approved') then 'held' end;
  if v_to is null then raise exception 'Can''t % a commission that is %', p_action, c.status using errcode = 'P0001'; end if;
  update public.commissions set status = v_to where id = p_id;
  perform public.admin_note('commission.' || p_action, 'commission', p_id::text,
    jsonb_build_object('from', c.status, 'to', v_to, 'pence', c.amount_pence, 'referrer', c.referrer_id));
  return v_to;
end $$;
revoke all on function public.admin_commission_review(uuid, text) from public, anon;
grant execute on function public.admin_commission_review(uuid, text) to authenticated;

-- Payouts due now (the same list as admin_payouts_due, which the desk's Admin page still reads) and every payout made
create or replace function public.admin_payouts()
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  perform public.approve_due_commissions();
  return jsonb_build_object(
    'due', coalesce((select jsonb_agg(jsonb_build_object('user_id', d.user_id, 'handle', d.handle, 'name', d.name, 'method', d.method,
              'destination', d.destination, 'pence', d.amount_pence, 'lines', d.lines, 'oldest', d.oldest) order by d.amount_pence desc)
            from public.admin_payouts_due() d), '[]'::jsonb),
    'building', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.referrer_id, 'handle', p.handle, 'approved', x.approved, 'pending', x.pending,
              'next', x.next_due) order by x.approved + x.pending desc)
            from (select c.referrer_id,
                    coalesce(sum(c.amount_pence) filter (where c.status = 'approved'), 0) as approved,
                    coalesce(sum(c.amount_pence) filter (where c.status = 'pending'), 0) as pending,
                    min(c.created_at) filter (where c.status = 'pending') + interval '60 days' as next_due
                  from public.commissions c where c.status in ('approved', 'pending') group by c.referrer_id
                  having coalesce(sum(c.amount_pence) filter (where c.status = 'approved'), 0) < 5000) x
            join public.profiles p on p.id = x.referrer_id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'user_id', o.user_id, 'handle', p.handle, 'pence', o.amount_pence,
              'method', o.method, 'status', o.status, 'at', coalesce(o.paid_at, o.created_at),
              'lines', (select count(*) from public.commissions c where c.payout_id = o.id)) order by o.created_at desc)
            from public.payouts o left join public.profiles p on p.id = o.user_id), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_payouts() from public, anon;
grant execute on function public.admin_payouts() to authenticated;

-- ---------- Finance: what the database knows (Stripe's own figures come from the admin-stripe edge function) ----------
create or replace function public.admin_finance()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'subs', coalesce((select jsonb_agg(jsonb_build_object('plan', s.plan, 'currency', lower(s.currency), 'status', s.status, 'n', s.n, 'amount', s.amount))
              from (select x.plan, x.currency, x.status, count(*) as n, sum(x.amount) as amount from public.subscriptions x
                    where x.status in ('active', 'past_due', 'trialing') group by 1, 2, 3) s), '[]'::jsonb),
    'cancelling', (select count(*) from public.subscriptions s where s.status in ('active', 'past_due', 'trialing') and s.cancel_at_period_end),
    'ended_30', (select count(*) from public.subscriptions s where s.status = 'canceled' and s.updated_at > now() - interval '30 days'),
    'lifetime', jsonb_build_object(
      'sold', (select count(*) from public.lifetime_purchases l where not l.refunded),
      'month', (select count(*) from public.lifetime_purchases l where not l.refunded and l.created_at >= v_month),
      'by_currency', coalesce((select jsonb_object_agg(x.cur, x.amount) from (select lower(l.currency) as cur, sum(l.amount) as amount
                       from public.lifetime_purchases l where not l.refunded group by 1) x), '{}'::jsonb),
      'refunded', (select count(*) from public.lifetime_purchases l where l.refunded)),
    'seats', jsonb_build_object('cap', 500, 'taken', public.founders_seats_taken()),
    'commissions', jsonb_build_object(
      'pence', coalesce((select jsonb_object_agg(x.status, x.pence) from (select c.status, sum(c.amount_pence) as pence
                 from public.commissions c group by c.status) x), '{}'::jsonb),
      'earned_month', (select coalesce(sum(c.amount_pence), 0) from public.commissions c where c.created_at >= v_month and c.status <> 'reversed'),
      'paid_month', (select coalesce(sum(o.amount_pence), 0) from public.payouts o where o.status = 'sent' and coalesce(o.paid_at, o.created_at) >= v_month),
      'paid_all', (select coalesce(sum(o.amount_pence), 0) from public.payouts o where o.status = 'sent')),
    'disputes', (select count(*) from public.payment_disputes d where d.status = 'open'),
    'costs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'pence', c.pence, 'every', c.every, 'since', c.since,
              'until', c.until, 'note', c.note, 'live', c.since <= v_today and (c.until is null or c.until >= v_today)) order by c.pence desc)
            from public.admin_costs c), '[]'::jsonb),
    'costs_month', (select coalesce(round(sum(case when c.every = 'year' then c.pence / 12.0 else c.pence end)), 0)::bigint
                    from public.admin_costs c where c.since <= v_today and (c.until is null or c.until >= v_today))
  );
end $$;
revoke all on function public.admin_finance() from public, anon;
grant execute on function public.admin_finance() to authenticated;

create or replace function public.admin_cost_save(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.admin_gate();
  if p_id is null then
    insert into public.admin_costs (name, pence, every, since, until, note)
    values (btrim(p ->> 'name'), (p ->> 'pence')::integer, coalesce(p ->> 'every', 'month'), coalesce((p ->> 'since')::date, current_date),
            (p ->> 'until')::date, nullif(btrim(coalesce(p ->> 'note', '')), ''))
    returning id into v_id;
  else
    update public.admin_costs set name = btrim(p ->> 'name'), pence = (p ->> 'pence')::integer, every = coalesce(p ->> 'every', 'month'),
      since = coalesce((p ->> 'since')::date, since), until = (p ->> 'until')::date, note = nullif(btrim(coalesce(p ->> 'note', '')), '')
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'No such cost' using errcode = 'P0001'; end if;
  end if;
  perform public.admin_note(case when p_id is null then 'cost.add' else 'cost.edit' end, 'cost', v_id::text,
    jsonb_build_object('name', left(p ->> 'name', 60), 'pence', p ->> 'pence', 'every', p ->> 'every'));
  return v_id;
end $$;
revoke all on function public.admin_cost_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_cost_save(uuid, jsonb) to authenticated;

create or replace function public.admin_cost_delete(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  perform public.admin_gate();
  delete from public.admin_costs where id = p_id returning name into v_name;
  if v_name is null then raise exception 'No such cost' using errcode = 'P0001'; end if;
  perform public.admin_note('cost.delete', 'cost', p_id::text, jsonb_build_object('name', v_name));
end $$;
revoke all on function public.admin_cost_delete(uuid) from public, anon;
grant execute on function public.admin_cost_delete(uuid) to authenticated;

-- ---------- An email to the owner for each new account and plan ----------
-- (owner, 2 Nov 2026: "a notification to my email every time someone signed up, how they paid, what plan, and their
-- number".) Triggers queue a line here; every 2 minutes, if anything is waiting, pg_cron calls the owner-alerts edge
-- function, which reads the queue (owner_alerts_due), asks Stripe how they paid, sends through Resend and marks them
-- (owner_alerts_done). Each line waits 2 minutes first, so the email has the handle they picked and their referral.
-- Lines are kept 30 days. A failed queue line never stops a sign-up or a payment being saved.
create table public.owner_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('signup', 'plan', 'paid', 'lifetime')),
  ref text not null check (char_length(ref) <= 80),
  user_id uuid references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  sent_at timestamptz,
  tries smallint not null default 0,
  unique (kind, ref)
);
comment on table public.owner_alerts is 'Emails to the owner waiting to go: a new account (signup), a plan started (plan), a trial''s first payment (paid), a lifetime bought (lifetime). Kept 30 days.';
create index owner_alerts_waiting on public.owner_alerts (at) where sent_at is null;
alter table public.owner_alerts enable row level security;
revoke all on table public.owner_alerts from anon, authenticated;
revoke all on sequence public.owner_alerts_id_seq from anon, authenticated;

create or replace function public.owner_alert(p_kind text, p_ref text, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.owner_alerts (kind, ref, user_id) values (p_kind, p_ref, p_user) on conflict (kind, ref) do nothing;
exception when others then
  raise warning 'owner alert not queued: %', sqlerrm;
end $$;
revoke all on function public.owner_alert(text, text, uuid) from public, anon, authenticated;

create or replace function public.owner_alert_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.owner_alert('signup', new.id::text, new.id);
  return null;
end $$;
revoke all on function public.owner_alert_profile() from public, anon, authenticated;
create trigger owner_alert after insert on public.profiles for each row execute function public.owner_alert_profile();

-- A new subscription (a trial, or paid at once), and a trial's first payment
create or replace function public.owner_alert_subscription()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.owner_alert('plan', new.id, new.user_id);
  elsif old.status = 'trialing' and new.status = 'active' then
    perform public.owner_alert('paid', new.id, new.user_id);
  end if;
  return null;
end $$;
revoke all on function public.owner_alert_subscription() from public, anon, authenticated;
create trigger owner_alert after insert or update of status on public.subscriptions for each row execute function public.owner_alert_subscription();

create or replace function public.owner_alert_lifetime()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not new.refunded then perform public.owner_alert('lifetime', new.id::text, new.user_id); end if;
  return null;
end $$;
revoke all on function public.owner_alert_lifetime() from public, anon, authenticated;
create trigger owner_alert after insert on public.lifetime_purchases for each row execute function public.owner_alert_lifetime();

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'owner_alerts_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'owner_alerts_cron', 'Shared secret: the pg_cron job to the owner-alerts edge function');
  end if;
end $$;

create or replace function public.owner_alerts_cron_ok(p_secret text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(length(p_secret) = 64 and p_secret = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'owner_alerts_cron' limit 1), false)
$$;
revoke all on function public.owner_alerts_cron_ok(text) from public, anon, authenticated;
grant execute on function public.owner_alerts_cron_ok(text) to service_role;

-- What's waiting (at most 50, none older than 2 days), each with the trader as they are now: number, handle, name,
-- how they signed up, how they found Marble, who referred them, their Stripe customer and the plan or lifetime it's
-- about. Never their email address or journal. With the owners' addresses (as crash_digest) and Marble's totals.
create or replace function public.owner_alerts_due()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'owners', coalesce((select jsonb_agg(distinct u.email::text)
                          from public.admins a join public.staff s on s.user_id = a.user_id join auth.users u on u.id = a.user_id
                         where u.email is not null), '[]'::jsonb),
    'totals', jsonb_build_object(
      'accounts', (select count(*) from public.profiles),
      'paying', (select count(distinct s.user_id) from public.subscriptions s where s.status in ('active', 'past_due'))
                + (select count(*) from public.lifetime_purchases l where not l.refunded),
      'trials', (select count(distinct s.user_id) from public.subscriptions s where s.status = 'trialing')),
    'alerts', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select a.id, a.kind, a.ref, a.at, a.user_id,
             (select m.no from public.members m where m.user_id = a.user_id) as no,
             p.handle::text as handle, p.name, p.created_at as joined,
             coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
             pp.heard_from,
             (select rp.handle::text from public.referrals r join public.profiles rp on rp.id = r.referrer_id where r.referred_id = a.user_id) as referrer,
             (select c.stripe_customer_id from public.customers c where c.user_id = a.user_id) as customer,
             case when a.kind in ('plan', 'paid') then
               (select jsonb_build_object('plan', s.plan, 'status', s.status, 'currency', s.currency, 'amount', s.amount, 'trial_end', s.trial_end)
                  from public.subscriptions s where s.id = a.ref) end as sub,
             case when a.kind = 'lifetime' then
               (select jsonb_build_object('seat', l.seat, 'currency', l.currency, 'amount', l.amount, 'refunded', l.refunded, 'payment_intent', l.stripe_payment_intent)
                  from public.lifetime_purchases l where l.id::text = a.ref) end as lifetime
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
revoke all on function public.owner_alerts_due() from public, anon, authenticated;
grant execute on function public.owner_alerts_due() to service_role;

-- Sent (or not worth sending: the account or plan is gone) and failed, to try again (5 tries)
create or replace function public.owner_alerts_done(p_done bigint[], p_failed bigint[])
returns void language sql security definer set search_path = ''
as $$
  update public.owner_alerts set sent_at = now() where id = any(coalesce(p_done, '{}')) and sent_at is null;
  update public.owner_alerts set tries = tries + 1 where id = any(coalesce(p_failed, '{}')) and sent_at is null;
$$;
revoke all on function public.owner_alerts_done(bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.owner_alerts_done(bigint[], bigint[]) to service_role;

-- To stop the emails: select cron.unschedule('owner-alerts');
select cron.schedule(
  'owner-alerts',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/owner-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'owner_alerts_cron' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from public.owner_alerts a where a.sent_at is null and a.tries < 5
                  and a.at < now() - interval '2 minutes' and a.at > now() - interval '2 days');
  $job$
);

-- ---------- Nightly tidy ----------
create or replace function public.admin_purge()
returns void language sql security definer set search_path = ''
as $$
  delete from public.ref_clicks where day < (now() at time zone 'utc')::date - 400;
  delete from public.referral_claims where at < now() - interval '400 days';
  delete from public.active_days where day < (now() at time zone 'utc')::date - 400;
  delete from public.owner_alerts where at < now() - interval '30 days';
$$;
revoke all on function public.admin_purge() from public, anon, authenticated;
select cron.schedule('admin-purge', '37 3 * * *', 'select public.admin_purge()');$tb$;
begin
  if md5(v_body) <> 'daceb44d24291b6ecf85166641265d29' then
    raise exception 'Not the file''s text (md5 %), nothing applied', md5(v_body);
  end if;
  execute v_body;
end $apply$;;
