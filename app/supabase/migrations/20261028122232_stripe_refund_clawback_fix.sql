-- A refund after payout claws back only what's still owed back: the commission's target after the refund, minus what
-- was paid out and any earlier clawbacks on the same payment
create or replace function public.stripe_refund(p_payment_intent text, p_amount integer, p_refunded integer)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  keep numeric := case when p_amount > 0 then greatest(0, (p_amount - p_refunded)::numeric / p_amount) else 0 end;
  target integer;
  standing integer;
  done text := '';
begin
  if keep = 0 then
    update public.lifetime_purchases set refunded = true, refunded_at = now(), seat = null
      where stripe_payment_intent = p_payment_intent and not refunded;
    if found then done := 'seat freed; '; end if;
  end if;
  for c in select * from public.commissions where stripe_payment_intent = p_payment_intent and kind = 'earning' loop
    target := round(c.gross_pence * keep)::int;
    if c.status in ('pending', 'approved') then
      update public.commissions set amount_pence = target, status = case when keep = 0 then 'reversed' else c.status end where id = c.id;
      done := done || 'commission reduced; ';
    elsif c.status = 'paid' then
      select c.amount_pence + coalesce(sum(x.amount_pence), 0) into standing
        from public.commissions x where x.kind = 'clawback' and x.stripe_payment_ref like c.stripe_payment_ref || ':refund:%';
      if target < standing then
        insert into public.commissions (referral_id, referrer_id, stripe_payment_ref, stripe_payment_intent, paid_amount, paid_currency, amount_pence, gross_pence, status, kind)
        values (c.referral_id, c.referrer_id, c.stripe_payment_ref || ':refund:' || p_refunded, p_payment_intent, 0, c.paid_currency, target - standing, 0, 'approved', 'clawback')
        on conflict (stripe_payment_ref) do nothing;
        done := done || 'clawback added; ';
      end if;
    end if;
  end loop;
  return coalesce(nullif(done, ''), 'nothing to change');
end $$;
revoke execute on function public.stripe_refund(text, integer, integer) from public, anon, authenticated;
grant execute on function public.stripe_refund(text, integer, integer) to service_role;
;
