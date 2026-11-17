-- Security audit, 2026-10-28: handles, referral codes and who may change which column.

-- 1. Referral links use a code that never changes (the trader's handle when they first set up their desk), so a
--    renamed handle can't be grabbed by someone else to collect commission from old links.
alter table public.profiles add column if not exists referral_code extensions.citext;
update public.profiles set referral_code = handle where referral_code is null and updated_at > created_at; -- set-up desks
-- (a one-off backfill for the first accounts on the original deployment was here)
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

-- 2. Names nobody can take (staff, the brand, system words), and handles held for 90 days after someone lets go
create or replace function public.handle_reserved(h text)
returns boolean language sql immutable set search_path to '' as $$
  select lower(coalesce(h, '')) = any (array['marble','admin','administrator','support','staff','team','help','billing','jules',
    'root','mod','moderator','official','security','payments','legal','press','partners','careers','desk','app','api','www',
    'info','contact','hello','founder','founders','owner','system','null','undefined','trademarble'])
    or lower(coalesce(h, '')) ~ '(marble|official|admin|support)'
$$;
create table if not exists public.handle_holds (
  handle extensions.citext primary key,
  user_id uuid,                 -- who let it go (they may take it back); no foreign key, it outlives the account
  released_at timestamptz not null default now()
);
alter table public.handle_holds enable row level security; -- server only

create or replace function public.handle_free_for(h text, p_user uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select h is not null
    and not exists (select 1 from public.profiles p where (p.handle = h or p.referral_code = h) and p.id is distinct from p_user)
    and not exists (select 1 from public.handle_holds x where x.handle = h and x.user_id is distinct from p_user and x.released_at > now() - interval '90 days')
$$;
revoke all on function public.handle_free_for(text, uuid) from public, anon, authenticated;

-- Every profile change: a new handle must be free and not reserved; the old one is held; the referral code is set
-- once, the first time the desk is set up, and never changes after that.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.handle is distinct from old.handle then
      if (public.handle_reserved(new.handle) and not public.is_admin()) or not public.handle_free_for(new.handle, new.id) then
        raise exception 'That handle isn''t available' using errcode = '23505';
      end if;
      insert into public.handle_holds (handle, user_id, released_at) values (old.handle, old.id, now())
        on conflict (handle) do update set user_id = excluded.user_id, released_at = excluded.released_at;
    end if;
    new.referral_code := coalesce(old.referral_code, new.handle);
    new.id := old.id;
    new.created_at := old.created_at;
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
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update or delete on public.profiles for each row execute function public.profiles_guard();

-- 3. New traders get a neutral handle (from their display name if they gave one, else "trader" and digits), never
--    the first half of their email address. Referrals at sign-up follow the link's code.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  base text := lower(regexp_replace(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'name', ''), '[^a-z0-9]', '', 'gi'));
  candidate text;
  tries int := 0;
  ref text := lower(nullif(new.raw_user_meta_data ->> 'ref', ''));
  referrer uuid;
begin
  if char_length(base) < 3 or public.handle_reserved(base) then base := 'trader'; end if;
  base := left(base, 14);
  candidate := case when base = 'trader' then base || lpad((floor(random() * 100000))::int::text, 5, '0') else base end;
  while not public.handle_free_for(candidate, new.id) loop
    tries := tries + 1;
    candidate := base || lpad((floor(random() * 100000))::int::text, 5, '0');
    if tries > 50 then candidate := 'trader' || replace(gen_random_uuid()::text, '-', ''); candidate := left(candidate, 20); end if;
  end loop;
  insert into public.profiles (id, handle, name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''));
  if ref is not null then select id into referrer from public.profiles where referral_code = ref and id <> new.id; end if;
  insert into public.profile_private (id, referred_by) values (new.id, case when referrer is not null then ref end);
  if referrer is not null then
    insert into public.referrals (referrer_id, referred_id) values (referrer, new.id) on conflict do nothing;
  end if;
  return new;
end $$;

create or replace function public.claim_referral(p_ref text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare
  me uuid := (select auth.uid());
  owner uuid;
begin
  if me is null or p_ref is null then return false; end if;
  if exists (select 1 from public.referrals where referred_id = me) then return false; end if;
  if (select created_at from auth.users where id = me) < now() - interval '1 day' then return false; end if;
  select id into owner from public.profiles where referral_code = lower(p_ref);
  if owner is null or owner = me then return false; end if;
  insert into public.referrals (referrer_id, referred_id) values (owner, me) on conflict do nothing;
  update public.profile_private set referred_by = lower(p_ref) where id = me and referred_by is null;
  return true;
end $$;

-- 4. Traders may change only the columns they own; ids, dates, referral fields stay as the server set them
revoke update on public.profiles from authenticated;
grant update (name, handle, bio, avatar_url, avatar_art, cover, markets, style, show_as) on public.profiles to authenticated;
revoke update on public.profile_private from authenticated;
grant update (desk_account, currency, marketing_opt_in, terms_accepted_at, import_mappings, default_risk, checklist,
  daily_loss_limit, max_trades, stop_after_losses, tour_done_at) on public.profile_private to authenticated;

-- 5. Signed-out visitors get nothing from the tables, and nobody can empty a table
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- 6. Pictures only from Marble's own storage, and art only by name (no addresses that could track readers)
alter table public.profiles drop constraint if exists profiles_avatar_url_ours;
alter table public.profiles add constraint profiles_avatar_url_ours check (avatar_url is null
  or left(avatar_url, char_length('https://your-project-ref.supabase.co/storage/v1/object/public/avatars/' || id::text || '/'))
     = 'https://your-project-ref.supabase.co/storage/v1/object/public/avatars/' || id::text || '/');
alter table public.profiles drop constraint if exists profiles_art_keys;
alter table public.profiles add constraint profiles_art_keys check ((avatar_art is null or avatar_art ~ '^[a-z0-9/_-]{1,80}$') and (cover = '' or cover ~ '^[a-z0-9/_-]{1,80}$'));
alter table public.strategies drop constraint if exists strategies_img_key;
alter table public.strategies add constraint strategies_img_key check (img is null or img ~ '^[a-z0-9/_-]{1,80}$');
alter table public.posts drop constraint if exists posts_image_ours;
alter table public.posts add constraint posts_image_ours check (image_url is null or image_url ~ ('^' || user_id::text || '/[A-Za-z0-9._-]{1,120}$'));;
