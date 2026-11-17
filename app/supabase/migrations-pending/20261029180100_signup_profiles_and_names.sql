-- Security audit 2, M1 and M7: no public profile or handle before a real sign-in, and real names stay private.
-- NOT APPLIED. Written 29 October 2026. Deploy the app build that calls ensure_profile() (src/live/sync.js load())
-- with it; an older build still works for everyone whose profile already exists, which is everyone confirmed today.
--
-- M1: a script that calls /auth/v1/otp with random addresses used to get a profile and a handle per address before
-- any email was confirmed. Now:
--   create_profile_for(user)   internal: makes the profile, its private row and any referral, once
--   handle_new_user()          AFTER INSERT on auth.users: only for a user who is already confirmed (Google, Discord,
--                              or an email the project auto-confirms). An email sign-up waits.
--   handle_user_confirmed()    AFTER UPDATE OF email_confirmed_at: the moment an email sign-up confirms (the magic link
--                              or the 6-digit code), its profile is made
--   ensure_profile()           the app calls it on sign-in if the profile is missing (a session means a real sign-in)
--   For email sign-ups the name and handle never come from the sign-up's own metadata (the browser can send any
--   full_name); only Google and Discord names are used, and only privately (below).
--
-- M7: the provider's full name used to be copied into profiles.name, which every signed-in trader can read. Now:
--   profile_private.full_name  the name Google or Discord gave, readable only by its owner; the setup screen prefills
--                              the public name from it, and the trader chooses what others see
--   profiles.name              starts blank; it's the name the trader typed in setup ("the name others see")
--   A new handle is built from the first name only, never the full name.
--   Existing traders: their current name is copied to full_name, and a name that is still exactly the provider's full
--   name (never edited) is cut to its first word. Handles stay as they are.
--
-- Also here, because the sign-up path uses them (L5, and giveaways in community part 4):
--   email_norm(email)       one person's address however it's written: lower-case, +tags dropped, and for Gmail the
--                           dots dropped and googlemail.com read as gmail.com (supabase/functions/_shared/email-norm.js
--                           is the same rule, unit tested)
--   email_norm_hash(email)  sha256 of that, like email_hash()
--   same_person(a, b)       two accounts on what is really one address: a referral between them doesn't count

begin;

-- ---------- One address, however it's written ----------
create or replace function public.email_norm(p_email text)
returns text language sql immutable parallel safe set search_path = ''
as $$
  with e as (select lower(btrim(coalesce(p_email, ''))) as s),
  p as (
    select s,
           case when position('@' in s) > 0 then regexp_replace(s, '@[^@]*$', '') else s end as l,
           case when position('@' in s) > 0 then regexp_replace(s, '^.*@', '') end as d
      from e
  ),
  q as (select s, split_part(l, '+', 1) as l, case when d = 'googlemail.com' then 'gmail.com' else d end as d from p)
  select case when d is null then s
              else (case when d = 'gmail.com' then replace(l, '.', '') else l end) || '@' || d end
    from q
$$;
create or replace function public.email_norm_hash(p_email text)
returns text language sql immutable parallel safe set search_path = ''
as $$ select encode(extensions.digest(convert_to(public.email_norm(p_email), 'UTF8'), 'sha256'), 'hex') $$;
revoke all on function public.email_norm_hash(text) from public, anon, authenticated;
create or replace function public.same_person(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.email_norm(a.email) = public.email_norm(b.email)
                     from auth.users a, auth.users b where a.id = p_a and b.id = p_b and a.email is not null and b.email is not null), false)
$$;
revoke all on function public.same_person(uuid, uuid) from public, anon, authenticated;

-- ---------- The private full name ----------
alter table public.profile_private add column if not exists full_name text
  check (full_name is null or char_length(full_name) <= 120);
comment on column public.profile_private.full_name is 'The name Google or Discord gave at sign-up. Private to its owner; profiles.name is what others see.';
-- Readable by its owner through the existing "own private: read" policy; only the server writes it (no update grant)

-- ---------- Making a profile, once ----------
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
  ref := lower(nullif(u.raw_user_meta_data ->> 'ref', ''));
  if ref is not null then select id into referrer from public.profiles where referral_code = ref and id <> p_user; end if;
  -- A second account on the same address can't refer itself (audit 2, L5)
  if referrer is not null and public.same_person(referrer, p_user) then referrer := null; end if;
  insert into public.profile_private (id, referred_by, full_name) values (p_user, case when referrer is not null then ref end, v_full)
  on conflict (id) do nothing;
  if referrer is not null then
    insert into public.referrals (referrer_id, referred_id) values (referrer, p_user) on conflict do nothing;
  end if;
  return true;
end $$;
revoke all on function public.create_profile_for(uuid) from public, anon, authenticated;

-- A new auth user: a profile now only if they're already confirmed (an identity provider, or auto-confirm)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null or new.phone_confirmed_at is not null
     or coalesce(new.raw_app_meta_data ->> 'provider', 'email') not in ('email', 'phone', 'anonymous') then
    perform public.create_profile_for(new.id);
  end if;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- An email sign-up confirms (magic link or code): now it gets its profile
create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.create_profile_for(new.id);
  return new;
end $$;
revoke all on function public.handle_user_confirmed() from public, anon, authenticated;
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- The app's fallback: a signed-in trader with no profile yet (a session is a real sign-in)
create or replace function public.ensure_profile()
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return false; end if;
  return public.create_profile_for(auth.uid());
end $$;
revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;

-- ---------- Existing rows ----------
-- Unconfirmed email sign-ups that never signed in lose the profile they were given at sign-up (their handle is held
-- for 90 days by profiles_guard); they get a new one if they ever confirm. (0 such accounts on 29 October 2026.)
delete from public.profiles p using auth.users u
 where u.id = p.id and u.email_confirmed_at is null and u.phone_confirmed_at is null and u.last_sign_in_at is null
   and coalesce(u.raw_app_meta_data ->> 'provider', 'email') in ('email', 'phone');

-- Real names: keep each trader's current name privately, then cut a name that is still exactly what the provider
-- sent (never edited in setup or on the profile) to its first word. Names the trader typed themselves stay.
update public.profile_private pp set full_name = left(nullif(btrim(p.name), ''), 120)
  from public.profiles p where p.id = pp.id and pp.full_name is null;
update public.profiles p set name = split_part(btrim(p.name), ' ', 1)
  from auth.users u
 where u.id = p.id and position(' ' in btrim(p.name)) > 0
   and btrim(p.name) = btrim(coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.raw_user_meta_data ->> 'name', ''));

commit;
