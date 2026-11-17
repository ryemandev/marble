-- Founders' Lifetime £199 for the first 500 (no deadline); after that a standard lifetime with no seat and no cap.
create or replace function public.founders_seats_taken()
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select count(*)::int from public.lifetime_purchases where not refunded and seat is not null
$function$;

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

revoke all on function public.stripe_lifetime_paid(uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.stripe_lifetime_paid(uuid, text, text, integer, boolean) to service_role;;
