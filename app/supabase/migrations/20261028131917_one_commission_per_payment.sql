-- With Managed Payments a one-off payment also produces an invoice, so the same payment arrives twice: as the
-- payment (payment_intent.succeeded / checkout) and as invoice.paid, under different references. A payment earns
-- one commission, whichever event gets here first.

-- Remove duplicates already recorded (keep the first)
delete from public.commissions c
using public.commissions d
where c.kind = 'earning' and d.kind = 'earning'
  and c.stripe_payment_intent is not null and c.stripe_payment_intent = d.stripe_payment_intent
  and (c.created_at, c.id) > (d.created_at, d.id);

-- The database itself refuses a second earning on the same payment, so two events at once can't both get in
create unique index if not exists commissions_one_per_payment on public.commissions (stripe_payment_intent)
  where kind = 'earning' and stripe_payment_intent is not null;

create or replace function public.stripe_record_commission(p_payer uuid, p_ref text, p_payment_intent text, p_paid integer, p_currency text, p_pence integer, p_paid_at timestamp with time zone default now())
returns text language plpgsql security definer set search_path = '' as $$
declare
  ref record;
  first_paid timestamptz;
begin
  if p_paid <= 0 or p_pence <= 0 then return 'nothing paid'; end if;
  select * into ref from public.referrals where referred_id = p_payer;
  if not found then return 'not referred'; end if;
  if exists (select 1 from public.commissions where stripe_payment_ref = p_ref
             or (p_payment_intent is not null and stripe_payment_intent = p_payment_intent and kind = 'earning')) then
    return 'already recorded';
  end if;
  select min(created_at) into first_paid from public.commissions where referral_id = ref.id and kind = 'earning';
  if first_paid is not null and p_paid_at > first_paid + interval '12 months' then return 'past 12 months'; end if;
  insert into public.commissions (referral_id, referrer_id, stripe_payment_ref, stripe_payment_intent, paid_amount, paid_currency, amount_pence, gross_pence, status, kind, created_at)
  values (ref.id, ref.referrer_id, p_ref, p_payment_intent, p_paid, lower(p_currency), p_pence, p_pence, 'pending', 'earning', p_paid_at);
  return 'recorded';
exception when unique_violation then
  return 'already recorded';
end $$;
revoke execute on function public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz) from public, anon, authenticated;
;
