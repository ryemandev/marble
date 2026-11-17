-- Security audit 2: the small database fixes. NOT APPLIED. Written 29 October 2026. Apply after the trial-emails
-- schedule (20261029130300, which turns on pg_net) and deploy the avatar-upload function and the app build with it.
--
--   L1  profiles_avatar_url_ours   an avatar URL must be a plain file name in the trader's own folder: no "../", no
--                                  other folder, PNG, JPEG or WebP, an optional ?v=<digits>
--       storage names              files in avatars, community, screenshots and bug-reports must be <uid>/<plain name>:
--                                  no "..", no second folder, no encoded slashes
--   L2  avatars bucket             the browser can't write to it any more (it's public): the avatar-upload function
--                                  checks the first bytes are a real image and saves it with the service role. Reading
--                                  and deleting your own files stay as they were.
--   L4  grants                     the browser roles lose INSERT, UPDATE, DELETE and TRUNCATE on the money and admin
--                                  tables. Only row rules stopped those writes; now the grants do too. Every write to
--                                  them goes through the service role or a SECURITY DEFINER function already.
--   M6  ideas and polls            at most 10 ideas and 10 polls a day per trader (posts have 20 an hour in community
--                                  part 1, reports 20 an hour in part 2)
--   L9  pg_net                     the browser roles can't use the net schema (it holds the cron secret's requests)

begin;

-- ---------- L1: avatar URLs ----------
alter table public.profiles drop constraint if exists profiles_avatar_url_ours;
alter table public.profiles add constraint profiles_avatar_url_ours check (
  avatar_url is null or avatar_url ~ ('^https://your-project-ref\.supabase\.co/storage/v1/object/public/avatars/'
    || id::text || '/[A-Za-z0-9_-]{1,80}\.(png|jpe?g|webp)(\?v=[0-9]{1,20})?$'));

-- ---------- L1: storage object names (Marble's own buckets; other buckets keep their own rules) ----------
create policy "plain file names" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('avatars', 'community', 'screenshots', 'bug-reports')
              or (name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and name !~ '\.\.' and position('%' in name) = 0));
create policy "plain file names: changes" on storage.objects as restrictive for update to authenticated
  using (true)
  with check (bucket_id not in ('avatars', 'community', 'screenshots', 'bug-reports')
              or (name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and name !~ '\.\.' and position('%' in name) = 0));

-- ---------- L2: the public avatars bucket is written by the server only ----------
drop policy if exists "avatars: owner writes" on storage.objects;
drop policy if exists "avatars: owner updates" on storage.objects;

-- ---------- L4: no browser writes to money and admin tables ----------
revoke insert, update, delete, truncate on table
  public.admins, public.customers, public.subscriptions, public.lifetime_purchases, public.referrals, public.trial_uses,
  public.payment_disputes, public.stripe_events, public.server_settings, public.rate_events, public.handle_holds,
  public.commissions, public.payouts
  from authenticated, anon;

-- ---------- M6: ideas and polls, a few a day ----------
create or replace function public.ideas_polls_rate_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() and not public.rate_ok(new.user_id, tg_table_name, 10, interval '1 day') then
    raise exception 'That''s plenty for today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.ideas_polls_rate_limit() from public, anon, authenticated;
drop trigger if exists ideas_rate_limit on public.ideas;
create trigger ideas_rate_limit before insert on public.ideas for each row execute function public.ideas_polls_rate_limit();
drop trigger if exists polls_rate_limit on public.polls;
create trigger polls_rate_limit before insert on public.polls for each row execute function public.ideas_polls_rate_limit();

-- ---------- L9: pg_net is for the database's own jobs ----------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    execute 'revoke usage on schema net from anon, authenticated';
    execute 'revoke all on all functions in schema net from anon, authenticated';
    execute 'revoke all on all tables in schema net from anon, authenticated';
  end if;
end $$;

commit;
