-- Lifetime after the 500 founders' seats. NOT APPLIED. Written 29 October 2026 for review.
--
-- The owner's rule (29 Oct 2026): the Founders' Lifetime is £199 for the first 500 traders, with no deadline. When the
-- 500 are taken, lifetime carries on at a higher price with no cap. The cap on founders' seats stays exactly as it is
-- (seats 1 to 500, the seat_check constraint and generate_series(1, 500) below are unchanged).
--
-- What changes:
--   stripe_lifetime_paid()  gains p_standard (default false). A standard lifetime payment, the price after the 500,
--                           is recorded with no seat and answers -3, instead of being refunded as "sold out".
--                           Founders' payments behave exactly as before.
--   founders_seats_taken()  counts founders' seats only (rows that hold a seat), so standard lifetime purchases never
--                           use one up and a refunded founders' seat is offered again.
--
-- Apply this BEFORE the owner creates the standard lifetime prices in Stripe (lookup keys
-- marble_lifetime_standard_gbp / _usd / _jpy). Until those prices exist, create-checkout never sells a standard lifetime
-- and the webhook never sends p_standard, so the app works the same with or without this migration.

begin;

create or replace function public.founders_seats_taken()
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select count(*)::int from public.lifetime_purchases where not refunded and seat is not null
$function$;

-- A new argument means a new signature: the old one goes, so PostgREST never has two to choose between
drop function if exists public.stripe_lifetime_paid(uuid, text, text, integer);

create function public.stripe_lifetime_paid(p_user uuid, p_payment_intent text, p_currency text, p_amount integer, p_standard boolean default false)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing record;
  next_seat integer;
begin
  perform pg_advisory_xact_lock(hashtext('marble_founders_seats'));
  select * into existing from public.lifetime_purchases where stripe_payment_intent = p_payment_intent;
  if found then return case when existing.refunded then -2 when existing.seat is null then -3 else existing.seat end; end if;
  if not exists (select 1 from auth.users where id = p_user) then return -1; end if;
  if exists (select 1 from public.lifetime_purchases where user_id = p_user and not refunded) then return 0; end if;
  if p_standard then
    -- The standard lifetime: no founders' seat, no cap
    next_seat := null;
  else
    select s into next_seat from generate_series(1, 500) s
      where not exists (select 1 from public.lifetime_purchases l where l.seat = s)
      order by s limit 1;
    if next_seat is null then return null; end if;
  end if;
  insert into public.lifetime_purchases (user_id, stripe_payment_intent, seat, currency, amount, refunded, refunded_at)
  values (p_user, p_payment_intent, next_seat, lower(p_currency), p_amount, false, null)
  on conflict (user_id) do update set stripe_payment_intent = excluded.stripe_payment_intent, seat = excluded.seat,
    currency = excluded.currency, amount = excluded.amount, refunded = false, refunded_at = null, created_at = now();
  return coalesce(next_seat, -3);
end $function$;

-- Only the server (the Stripe webhook, with the service role) may call it, as before
revoke all on function public.stripe_lifetime_paid(uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.stripe_lifetime_paid(uuid, text, text, integer, boolean) to service_role;

commit;
