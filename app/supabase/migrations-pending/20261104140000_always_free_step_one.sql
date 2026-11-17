-- Marble is free for everyone (owner, 4 Nov 2026: "turn the server to always free ... every user is free").
-- Step one of two. Goes on just before the new site does. Nothing a user can do depends on a plan after this.
-- Step two (20261104150000) takes the paid functions away once the old app has gone, because the old app still calls them.
--
-- Nothing is deleted here. Every function and policy is copied into retired.before_free first, so any of them can be put back.

begin;

-- A locked room for what's been retired. Not exposed through the API.
create schema if not exists retired;
revoke all on schema retired from public, anon, authenticated;

create table if not exists retired.before_free (
  kind text not null,
  name text not null,
  definition text not null,
  saved_at timestamptz not null default now()
);

insert into retired.before_free (kind, name, definition)
select 'function', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f';

insert into retired.before_free (kind, name, definition)
select 'policy', schemaname || '.' || tablename || ' / ' || policyname,
       jsonb_build_object('permissive', permissive, 'roles', roles, 'cmd', cmd, 'using', qual, 'check', with_check)::text
from pg_policies
where schemaname in ('public', 'storage');

-- Everyone who is signed in has everything
create or replace function public.has_access_for(p_user uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $$ select p_user is not null $$;

-- The plan gates come off. The rules that aren't about money (blocks, sync rows, plain file names) stay.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname in ('public', 'storage') and permissive = 'RESTRICTIVE'
      and (coalesce(qual, '') ilike '%has_access%' or coalesce(with_check, '') ilike '%has_access%')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- No trials, so no trial emails. 20261104130000 swaps this job for the welcome email, so it may already be gone.
select cron.unschedule(jobname) from cron.job where jobname = 'trial-emails';

-- Stop here rather than go on half done
do $$
begin
  if exists (select 1 from pg_policies where coalesce(qual, '') ilike '%has_access%' or coalesce(with_check, '') ilike '%has_access%') then
    raise exception 'A policy still depends on a plan';
  end if;
end $$;

commit;
