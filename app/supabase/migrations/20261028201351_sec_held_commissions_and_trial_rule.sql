-- A commission frozen while its payment is disputed
alter table public.commissions drop constraint commissions_status_check;
alter table public.commissions add constraint commissions_status_check check (status = any (array['pending', 'approved', 'paid', 'reversed', 'held']));

-- The plan screen's "free trial" promise follows the same rule as checkout (one trial per person)
create or replace function public.my_billing()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'access', public.has_access(),
    'lifetime', (select jsonb_build_object('seat', l.seat, 'since', l.created_at) from public.lifetime_purchases l where l.user_id = (select auth.uid()) and not l.refunded),
    'subscription', (select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_end', s.trial_end, 'period_end', s.current_period_end,
                       'cancel_at_period_end', s.cancel_at_period_end, 'currency', s.currency, 'amount', s.amount)
                     from public.subscriptions s where s.user_id = (select auth.uid()) order by s.updated_at desc limit 1),
    'customer', exists (select 1 from public.customers c where c.user_id = (select auth.uid())),
    'seats_left', greatest(0, 500 - public.founders_seats_taken()),
    'trial_eligible', public.trial_eligible_for((select auth.uid()))
  )
$$;;
