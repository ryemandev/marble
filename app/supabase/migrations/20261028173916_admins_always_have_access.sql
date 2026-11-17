-- The owner and any admin always get into the app, paywall or not
create or replace function public.has_access()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    or exists (select 1 from public.lifetime_purchases l where l.user_id = (select auth.uid()) and not l.refunded)
    or exists (select 1 from public.subscriptions s where s.user_id = (select auth.uid())
               and (s.status in ('trialing', 'active') or (s.status in ('past_due', 'canceled') and s.current_period_end > now())))
  )
$function$;;
