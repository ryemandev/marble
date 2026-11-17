-- The trader's own pre-market checklist and risk rules (nothing shows until they write them)
alter table public.profile_private
  add column if not exists checklist text[] not null default '{}',
  add column if not exists daily_loss_limit numeric,
  add column if not exists max_trades integer,
  add column if not exists stop_after_losses integer;
alter table public.profile_private
  add constraint profile_private_checklist_size check (cardinality(checklist) <= 12),
  add constraint profile_private_loss_limit_pos check (daily_loss_limit is null or daily_loss_limit > 0),
  add constraint profile_private_max_trades_range check (max_trades is null or max_trades between 1 and 100),
  add constraint profile_private_stop_losses_range check (stop_after_losses is null or stop_after_losses between 1 and 20);

-- Oracle early access: one row per trader who asked
create table public.oracle_waitlist (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.oracle_waitlist enable row level security;
create policy "own waitlist: read" on public.oracle_waitlist for select to authenticated using (user_id = (select auth.uid()));
create policy "own waitlist: join" on public.oracle_waitlist for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own waitlist: leave" on public.oracle_waitlist for delete to authenticated using (user_id = (select auth.uid()));
create policy "admins read the waitlist" on public.oracle_waitlist for select to authenticated using ((select public.is_admin()));
revoke all on public.oracle_waitlist from anon;

-- Bug reports from inside the app
create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  steps text not null default '' check (char_length(steps) <= 4000),
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 20000),
  screenshot_path text check (screenshot_path is null or char_length(screenshot_path) <= 300),
  status text not null default 'new' check (status in ('new', 'seen', 'fixed')),
  created_at timestamptz not null default now()
);
create index bug_reports_user_created on public.bug_reports (user_id, created_at desc);
create index bug_reports_created on public.bug_reports (created_at desc);
alter table public.bug_reports enable row level security;
create policy "own reports: read" on public.bug_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "own reports: send" on public.bug_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new'
    and (screenshot_path is null or split_part(screenshot_path, '/', 1) = (select auth.uid())::text));
create policy "admins read reports" on public.bug_reports for select to authenticated using ((select public.is_admin()));
create policy "admins update reports" on public.bug_reports for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.bug_reports from anon;
revoke update on public.bug_reports from authenticated;
grant update (status) on public.bug_reports to authenticated;

-- At most 10 reports an hour from one trader
create or replace function public.bug_reports_rate_limit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (select count(*) from public.bug_reports b where b.user_id = new.user_id and b.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many reports in the last hour. Try again later.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.bug_reports_rate_limit() from public, anon, authenticated;
create trigger bug_reports_rate_limit before insert on public.bug_reports for each row execute function public.bug_reports_rate_limit();

-- Screenshots attached to reports: private, images only, 5 MB, in the reporter's own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bug-reports', 'bug-reports', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
create policy "bug-reports: owner writes" on storage.objects for insert to authenticated
  with check (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bug-reports: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bug-reports: admins read" on storage.objects for select to authenticated
  using (bucket_id = 'bug-reports' and (select public.is_admin()));;
