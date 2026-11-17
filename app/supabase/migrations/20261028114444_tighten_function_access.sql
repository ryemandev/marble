-- The sign-up trigger is never called directly
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- is_admin is used inside policies for signed-in traders only
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- has_access only ever answers for the caller (no way to ask about another trader)
drop function public.has_access(uuid);
create or replace function public.has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.lifetime_purchases l where l.user_id = (select auth.uid()) and not l.refunded)
    or exists (select 1 from public.subscriptions s where s.user_id = (select auth.uid())
               and (s.status in ('trialing', 'active') or (s.status in ('past_due', 'canceled') and s.current_period_end > now())))
  )
$$;
revoke execute on function public.has_access() from public, anon;
grant execute on function public.has_access() to authenticated;

-- An admin can see that they're an admin; nobody can write this table from the app
create policy "admins: read own" on public.admins for select to authenticated using (user_id = (select auth.uid()));

-- Extensions live outside the API schema
create schema if not exists extensions;
alter extension citext set schema extensions;
;
