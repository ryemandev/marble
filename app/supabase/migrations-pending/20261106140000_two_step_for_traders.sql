-- Two-step sign-in for traders (owner, 6 Nov 2026: go with every recommendation; audit item P8).
-- Written and applied 6 November 2026.
--
-- A trader who has turned on a code app can only reach their private rows once this session has passed the code. Without
-- this the code would be a screen in the app and the same email link would still read everything straight from the API.
-- Traders with no code app are not touched: two_step_ok() is true for them and the policies add nothing.
--
-- What it makes:
--   two_step_ok()    true when this session passed the code, or the trader has no verified code app
--   restrictive "two-step" policies on the tables that hold a trader's private record, for signed-in callers

create or replace function public.two_step_ok()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
revoke all on function public.two_step_ok() from public, anon;
grant execute on function public.two_step_ok() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['trades', 'accounts', 'connections', 'imports', 'notes', 'notebooks', 'pages', 'strategies',
    'daily_plans', 'discipline_rules', 'prop_money', 'profile_private', 'push_subscriptions', 'dm_messages', 'dm_members']
  loop
    execute format('drop policy if exists "two-step: code passed" on public.%I', t);
    execute format('create policy "two-step: code passed" on public.%I as restrictive for all to authenticated using ((select public.two_step_ok())) with check ((select public.two_step_ok()))', t);
  end loop;
end $$;
