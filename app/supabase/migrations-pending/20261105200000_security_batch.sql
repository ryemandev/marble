-- Security batch, 5 November 2026 (owner: "Yes, apply it"). From the two audits of that day. Nothing here reads or changes
-- a trade. Undo steps: ROLLBACK.md section 43.

-- 1. The database's own run history grows about 3MB a day and nothing cleared it
select cron.schedule('cron-history-purge', '13 4 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- 2. Sizes. One account can't fill the database. Not valid: rows already here are left alone, new writes are checked.
alter table public.trades add constraint trades_sizes check (pg_column_size(fills) <= 65536 and char_length(setup) <= 60 and char_length(emotion) <= 60 and cardinality(screenshots) <= 8) not valid;
alter table public.profiles add constraint profiles_sizes check (char_length(style) <= 40 and cardinality(markets) <= 8) not valid;
alter table public.daily_plans add constraint plans_sizes check (pg_column_size(bias) <= 2048 and pg_column_size(news) <= 2048 and pg_column_size(risk) <= 2048 and pg_column_size(levels) <= 2048 and pg_column_size(checklist) <= 8192) not valid;
alter table public.profile_private add constraint private_sizes check (pg_column_size(import_mappings) <= 32768) not valid;
alter table public.imports add constraint imports_sizes check (pg_column_size(open_fills) <= 262144) not valid;

-- Numbers that aren't numbers, and account kinds the app doesn't have
alter table public.trades add constraint trades_numbers_real check (pnl <> 'NaN' and r <> 'NaN' and commission not in ('NaN', 'Infinity', '-Infinity')) not valid;
alter table public.accounts add constraint accounts_balance_real check (balance <> 'NaN') not valid;
alter table public.accounts add constraint accounts_kind_ok check (kind in ('Evaluation', 'Funded', 'Live', 'Paper')) not valid;

-- Storage: 200MB a trader across every bucket, and Study keeps to plain paths like the rest
create function public.storage_room() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(sum((metadata->>'size')::bigint), 0) < 209715200 from storage.objects where owner_id = (select auth.uid())::text
$$;
revoke execute on function public.storage_room() from public, anon;
grant execute on function public.storage_room() to authenticated;
create policy "files: 200MB each" on storage.objects as restrictive for insert to authenticated with check ((select public.storage_room()));
create policy "study: plain paths" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'study' or (name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$' and name !~ '\.\.'));

-- 3. A public name that is the private full name becomes the handle. The trader can set any name they like in Profile.
update public.profiles p set name = p.handle::text from public.profile_private pp
  where pp.id = p.id and lower(btrim(p.name)) = lower(btrim(pp.full_name)) and p.handle is not null and p.handle::text <> '';

-- 4. Admin powers in policies need the second sign-in step, as the admin door already does
create function public.admin_aal2() returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;
revoke execute on function public.admin_aal2() from public, anon;
grant execute on function public.admin_aal2() to authenticated;
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies
    where schemaname in ('public', 'storage') and (qual like '%is_admin()%' or with_check like '%is_admin()%')
  loop
    execute format('alter policy %I on %I.%I %s %s', p.policyname, p.schemaname, p.tablename,
      case when p.qual is not null then 'using (' || replace(p.qual, 'is_admin()', 'public.admin_aal2()') || ')' else '' end,
      case when p.with_check is not null then 'with check (' || replace(p.with_check, 'is_admin()', 'public.admin_aal2()') || ')' else '' end);
  end loop;
end $$;

-- Grants no policy allows, so removing them changes nothing in the app
revoke insert, update, delete on public.econ_events, public.news_items from authenticated;
revoke update on public.oracle_waitlist, public.reports, public.idea_votes, public.polls from authenticated;
revoke delete on public.reports, public.news_rules from authenticated;
revoke usage on schema net from anon, authenticated, public;
revoke all on all functions in schema net from anon, authenticated;
revoke all on all tables in schema net from anon, authenticated;
-- Anything new starts closed: a new table or function needs its grants written out
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- 5. Old referral rows leave with the account, and nobody keeps a deleted trader's code
alter table retired.profile_referrals add constraint profile_referrals_user foreign key (id) references auth.users (id) on delete cascade;
create function retired.referral_forget() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.referral_code is not null then
    update retired.profile_referrals set referred_by = null where referred_by = old.referral_code;
  end if;
  return null;
end $$;
revoke execute on function retired.referral_forget() from public, anon, authenticated;
create trigger referral_forget after delete on retired.profile_referrals for each row execute function retired.referral_forget();

-- 6. A close is stamped by the server and can't claim Verified
create function public.closes_stamp() returns trigger language plpgsql set search_path = '' as $$
begin
  new.closed_at := greatest(least(coalesce(new.closed_at, now()), now()), now() - interval '2 days');
  new.facts := new.facts - 'verified';
  return new;
end $$;
revoke execute on function public.closes_stamp() from public, anon, authenticated;
create trigger closes_stamp before insert on public.closes for each row execute function public.closes_stamp();
revoke update, delete on public.closes from authenticated;

-- Housekeeping
create index rate_events_at on public.rate_events (at);
create index posts_feed_top on public.posts (created_at desc) where parent_id is null and not hidden;
alter table public.reports validate constraint reports_one_target;
