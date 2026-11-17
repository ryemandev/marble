-- A trader who already owns lifetime and somehow pays again (two tabs, say) gets 0 back, and the webhook refunds
-- that second payment; null still means all 500 seats are gone
create or replace function public.stripe_lifetime_paid(p_user uuid, p_payment_intent text, p_currency text, p_amount integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  existing record;
  next_seat integer;
begin
  perform pg_advisory_xact_lock(hashtext('marble_founders_seats'));
  select * into existing from public.lifetime_purchases where stripe_payment_intent = p_payment_intent;
  if found then return coalesce(existing.seat, 0); end if;
  if exists (select 1 from public.lifetime_purchases where user_id = p_user and not refunded) then return 0; end if;
  select s into next_seat from generate_series(1, 500) s
    where not exists (select 1 from public.lifetime_purchases l where l.seat = s)
    order by s limit 1;
  if next_seat is null then return null; end if;
  insert into public.lifetime_purchases (user_id, stripe_payment_intent, seat, currency, amount, refunded, refunded_at)
  values (p_user, p_payment_intent, next_seat, lower(p_currency), p_amount, false, null)
  on conflict (user_id) do update set stripe_payment_intent = excluded.stripe_payment_intent, seat = excluded.seat,
    currency = excluded.currency, amount = excluded.amount, refunded = false, refunded_at = null, created_at = now();
  return next_seat;
end $$;
revoke execute on function public.stripe_lifetime_paid(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.stripe_lifetime_paid(uuid, text, text, integer) to service_role;
;
