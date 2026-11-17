-- Profile photos: an upload that may replace a file needs to see it first, so the owner can read their own folder.
-- (Photos are served from the bucket's public URL; this doesn't let anyone list anyone else's folder.)
create policy "avatars: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Taking back a poll vote
create policy "poll votes: take back own" on public.poll_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Whether the free trial is on offer: the same rule create-checkout uses (a trader's first subscription only)
create or replace function public.my_billing()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
    'access', public.has_access(),
    'lifetime', (select jsonb_build_object('seat', l.seat, 'since', l.created_at) from public.lifetime_purchases l where l.user_id = (select auth.uid()) and not l.refunded),
    'subscription', (select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_end', s.trial_end, 'period_end', s.current_period_end,
                       'cancel_at_period_end', s.cancel_at_period_end, 'currency', s.currency, 'amount', s.amount)
                     from public.subscriptions s where s.user_id = (select auth.uid()) order by s.updated_at desc limit 1),
    'customer', exists (select 1 from public.customers c where c.user_id = (select auth.uid())),
    'seats_left', greatest(0, 500 - public.founders_seats_taken()),
    'trial_eligible', not exists (select 1 from public.subscriptions s where s.user_id = (select auth.uid()))
  )
$function$;;
