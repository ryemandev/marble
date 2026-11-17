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
end $$;;
