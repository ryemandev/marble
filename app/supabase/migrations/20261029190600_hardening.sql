-- Security audit 2: the small database fixes (L1 avatar URLs and storage names, L2 avatars via the server, L4 grants, M6 ideas/polls, L9 pg_net)
alter table public.profiles drop constraint if exists profiles_avatar_url_ours;
alter table public.profiles add constraint profiles_avatar_url_ours check (
  avatar_url is null or avatar_url ~ ('^https://your-project-ref\.supabase\.co/storage/v1/object/public/avatars/'
    || id::text || '/[A-Za-z0-9_-]{1,80}\.(png|jpe?g|webp)(\?v=[0-9]{1,20})?$'));

create policy "plain file names" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('avatars', 'community', 'screenshots', 'bug-reports')
              or (name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and name !~ '\.\.' and position('%' in name) = 0));
create policy "plain file names: changes" on storage.objects as restrictive for update to authenticated
  using (true)
  with check (bucket_id not in ('avatars', 'community', 'screenshots', 'bug-reports')
              or (name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and name !~ '\.\.' and position('%' in name) = 0));

drop policy if exists "avatars: owner writes" on storage.objects;
drop policy if exists "avatars: owner updates" on storage.objects;

revoke insert, update, delete, truncate on table
  public.admins, public.customers, public.subscriptions, public.lifetime_purchases, public.referrals, public.trial_uses,
  public.payment_disputes, public.stripe_events, public.server_settings, public.rate_events, public.handle_holds,
  public.commissions, public.payouts
  from authenticated, anon;

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

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    execute 'revoke usage on schema net from anon, authenticated';
    execute 'revoke all on all functions in schema net from anon, authenticated';
    execute 'revoke all on all tables in schema net from anon, authenticated';
  end if;
end $$;;
