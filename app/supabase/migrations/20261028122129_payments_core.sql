-- Payments: everything the Stripe webhook writes goes through these functions, which only the service role (the edge
-- functions) can call. Each one is idempotent, because Stripe retries events.

-- Founders' seats: a refunded seat comes back, so a refunded purchase lets go of its number
alter table public.lifetime_purchases alter column seat drop not null;
alter table public.lifetime_purchases add column if not exists refunded_at timestamptz;

-- Commissions: the original amount (so a partial refund can scale it), the payment intent behind an invoice (refunds
-- arrive by charge/payment intent), and clawbacks (a refund after the commission was already paid out comes off the
-- next payout as a negative line)
alter table public.commissions add column if not exists stripe_payment_intent text;
alter table public.commissions add column if not exists gross_pence integer;
alter table public.commissions add column if not exists kind text not null default 'earning';
update public.commissions set gross_pence = amount_pence where gross_pence is null;
alter table public.commissions drop constraint if exists commissions_amount_pence_check;
alter table public.commissions add constraint commissions_kind_check check (kind in ('earning', 'clawback'));
alter table public.commissions add constraint commissions_amount_sign check ((kind = 'earning' and amount_pence >= 0) or (kind = 'clawback' and amount_pence <= 0));
create index if not exists commissions_pi on public.commissions (stripe_payment_intent);

-- Every Stripe event we've finished handling (an audit trail, and a fast skip for retries of finished events)
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security; -- no policies: only the service role reads or writes

-- Settings only the server may read (the webhook signing secret, when stripe-setup created the endpoint)
create table if not exists public.server_settings (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.server_settings enable row level security; -- no policies: service role only

-- A subscription as Stripe last described it
create or replace function public.stripe_upsert_subscription(
  p_id text, p_user uuid, p_status text, p_plan text, p_currency text, p_amount integer,
  p_trial_end timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean
) returns void
language sql security definer set search_path = '' as $$
  insert into public.subscriptions (id, user_id, status, plan, currency, amount, trial_end, current_period_end, cancel_at_period_end)
  values (p_id, p_user, p_status, p_plan, lower(p_currency), p_amount, p_trial_end, p_period_end, coalesce(p_cancel_at_period_end, false))
  on conflict (id) do update set
    status = excluded.status, plan = excluded.plan, currency = excluded.currency, amount = excluded.amount,
    trial_end = excluded.trial_end, current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end
$$;

-- A Founders' Lifetime payment: the next free seat, 1 to 500, assigned under a lock so two payments at the same
-- moment can never get the same seat or a 501st. Returns the seat, or null if all 500 are taken (the webhook then
-- refunds the payment). Idempotent on the payment intent.
create or replace function public.stripe_lifetime_paid(p_user uuid, p_payment_intent text, p_currency text, p_amount integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  existing record;
  next_seat integer;
begin
  perform pg_advisory_xact_lock(hashtext('marble_founders_seats'));
  select * into existing from public.lifetime_purchases where stripe_payment_intent = p_payment_intent;
  if found then return existing.seat; end if;
  select s into next_seat from generate_series(1, 500) s
    where not exists (select 1 from public.lifetime_purchases l where l.seat = s)
    order by s limit 1;
  if next_seat is null then return null; end if;
  -- One lifetime per trader: a trader buying again after a refund reuses their row
  insert into public.lifetime_purchases (user_id, stripe_payment_intent, seat, currency, amount, refunded, refunded_at)
  values (p_user, p_payment_intent, next_seat, lower(p_currency), p_amount, false, null)
  on conflict (user_id) do update set stripe_payment_intent = excluded.stripe_payment_intent, seat = excluded.seat,
    currency = excluded.currency, amount = excluded.amount, refunded = false, refunded_at = null, created_at = now();
  return next_seat;
end $$;

-- A referral commission: 15% of a payment a referred trader made in their first 12 months (counted from their first
-- payment), already converted to pence by the webhook. Returns what happened, for the log.
create or replace function public.stripe_record_commission(
  p_payer uuid, p_ref text, p_payment_intent text, p_paid integer, p_currency text, p_pence integer, p_paid_at timestamptz default now()
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  ref record;
  first_paid timestamptz;
begin
  if p_paid <= 0 or p_pence <= 0 then return 'nothing paid'; end if;
  select * into ref from public.referrals where referred_id = p_payer;
  if not found then return 'not referred'; end if;
  if exists (select 1 from public.commissions where stripe_payment_ref = p_ref) then return 'already recorded'; end if;
  select min(created_at) into first_paid from public.commissions where referral_id = ref.id and kind = 'earning';
  if first_paid is not null and p_paid_at > first_paid + interval '12 months' then return 'past 12 months'; end if;
  insert into public.commissions (referral_id, referrer_id, stripe_payment_ref, stripe_payment_intent, paid_amount, paid_currency, amount_pence, gross_pence, status, kind, created_at)
  values (ref.id, ref.referrer_id, p_ref, p_payment_intent, p_paid, lower(p_currency), p_pence, p_pence, 'pending', 'earning', p_paid_at);
  return 'recorded';
end $$;

-- A refund (full or partial) on a payment: frees a Founders' seat when a lifetime payment is refunded in full, and
-- takes the refunded share back from any commission on it (or claws it back if it was already paid out).
create or replace function public.stripe_refund(p_payment_intent text, p_amount integer, p_refunded integer)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  keep numeric := case when p_amount > 0 then greatest(0, (p_amount - p_refunded)::numeric / p_amount) else 0 end;
  done text := '';
begin
  if keep = 0 then
    update public.lifetime_purchases set refunded = true, refunded_at = now(), seat = null
      where stripe_payment_intent = p_payment_intent and not refunded;
    if found then done := 'seat freed; '; end if;
  end if;
  for c in select * from public.commissions where stripe_payment_intent = p_payment_intent and kind = 'earning' loop
    if c.status in ('pending', 'approved') then
      update public.commissions set amount_pence = round(c.gross_pence * keep)::int, status = case when keep = 0 then 'reversed' else c.status end where id = c.id;
      done := done || 'commission reduced; ';
    elsif c.status = 'paid' then
      -- Already paid out: the refunded share comes off the next payout
      insert into public.commissions (referral_id, referrer_id, stripe_payment_ref, stripe_payment_intent, paid_amount, paid_currency, amount_pence, gross_pence, status, kind)
      values (c.referral_id, c.referrer_id, c.stripe_payment_ref || ':refund:' || p_refunded, p_payment_intent, 0, c.paid_currency,
              -round(c.gross_pence * (1 - keep))::int, 0, 'approved', 'clawback')
      on conflict (stripe_payment_ref) do nothing;
      done := done || 'clawback added; ';
    end if;
  end loop;
  return coalesce(nullif(done, ''), 'nothing to change');
end $$;

-- Commissions become payable 14 days after the payment (past the refund window)
create or replace function public.approve_due_commissions() returns integer
language sql security definer set search_path = '' as $$
  with done as (
    update public.commissions set status = 'approved'
    where status = 'pending' and kind = 'earning' and created_at < now() - interval '14 days'
    returning 1
  ) select count(*)::int from done
$$;

-- Admin: who is owed a payout (approved total of £50 or more), with where to send it
create or replace function public.admin_payouts_due()
returns table (user_id uuid, handle extensions.citext, name text, method text, destination text, amount_pence bigint, lines bigint, oldest timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  perform public.approve_due_commissions();
  return query
    select c.referrer_id, p.handle, p.name, s.method, s.destination, sum(c.amount_pence)::bigint, count(*), min(c.created_at)
    from public.commissions c
    join public.profiles p on p.id = c.referrer_id
    left join public.payout_settings s on s.user_id = c.referrer_id
    where c.status = 'approved'
    group by c.referrer_id, p.handle, p.name, s.method, s.destination
    having sum(c.amount_pence) >= 5000
    order by sum(c.amount_pence) desc;
end $$;

-- Admin: record that a payout was sent: one payout row, and its approved commissions marked paid
create or replace function public.admin_mark_paid(p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  total bigint;
  how text;
  pid uuid;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select coalesce(sum(amount_pence), 0) into total from public.commissions where referrer_id = p_user and status = 'approved';
  if total < 5000 then raise exception 'Under the £50 minimum'; end if;
  select method into how from public.payout_settings where user_id = p_user;
  if how is null then raise exception 'No payout details on file'; end if;
  insert into public.payouts (user_id, amount_pence, method, status, paid_at) values (p_user, total, how, 'sent', now()) returning id into pid;
  update public.commissions set status = 'paid', payout_id = pid where referrer_id = p_user and status = 'approved';
  return pid;
end $$;

-- What the trader's plan screen and profile show
create or replace function public.my_billing()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'access', public.has_access(),
    'lifetime', (select jsonb_build_object('seat', l.seat, 'since', l.created_at) from public.lifetime_purchases l where l.user_id = (select auth.uid()) and not l.refunded),
    'subscription', (select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_end', s.trial_end, 'period_end', s.current_period_end,
                       'cancel_at_period_end', s.cancel_at_period_end, 'currency', s.currency, 'amount', s.amount)
                     from public.subscriptions s where s.user_id = (select auth.uid()) order by s.updated_at desc limit 1),
    'customer', exists (select 1 from public.customers c where c.user_id = (select auth.uid())),
    'seats_left', greatest(0, 500 - public.founders_seats_taken())
  )
$$;

-- Who can call what
revoke execute on function public.stripe_upsert_subscription(text, uuid, text, text, text, integer, timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.stripe_lifetime_paid(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.stripe_refund(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.approve_due_commissions() from public, anon, authenticated;
grant execute on function public.stripe_upsert_subscription(text, uuid, text, text, text, integer, timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.stripe_lifetime_paid(uuid, text, text, integer) to service_role;
grant execute on function public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz) to service_role;
grant execute on function public.stripe_refund(text, integer, integer) to service_role;
grant execute on function public.approve_due_commissions() to service_role;
grant execute on function public.founders_seats_taken() to service_role;
revoke execute on function public.admin_payouts_due() from public, anon;
revoke execute on function public.admin_mark_paid(uuid) from public, anon;
revoke execute on function public.my_billing() from public, anon;
grant execute on function public.admin_payouts_due() to authenticated;
grant execute on function public.admin_mark_paid(uuid) to authenticated;
grant execute on function public.my_billing() to authenticated;
;
