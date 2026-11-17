-- Trigger functions are only for the database's own triggers, never callable through the API
revoke all on function public.profiles_guard() from public, anon, authenticated;
revoke all on function public.poll_votes_fixed() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.record_trial(uuid, text) from public, anon, authenticated;
revoke all on function public.rate_ok(uuid, text, int, interval) from public, anon, authenticated;
revoke all on function public.trial_eligible_for(uuid) from public, anon, authenticated;
revoke all on function public.stripe_dispute(text, text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.has_access_for(uuid) from public, anon, authenticated;;
