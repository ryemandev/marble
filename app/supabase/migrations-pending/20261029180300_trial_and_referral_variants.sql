-- Security audit 2, L5: the free trial and referral commission can't be had again with an email variant
-- (a.b+1@gmail.com, ab@googlemail.com) or a second account on the same card. NOT APPLIED. Written 29 October 2026.
-- Needs 20261029180100 (email_norm, email_norm_hash, same_person). Deploy stripe-webhook with it
-- (_shared/webhook.js now passes the card fingerprint).
--
--   trial_uses        each trial now records three hashes: the email as typed (as before), the normalised email, and
--                     the card ("card:" + Stripe's card fingerprint). Existing rows stay; their normalised hashes are
--                     added for the accounts that still exist.
--   record_trial()    + p_card (the card fingerprint, optional)
--   trial_card_seen() service role: was this card already used for a trial by another Stripe customer? The webhook
--                     then ends the new trial at once (the subscription carries on as a paid one).
--   trial_eligible_for()  also refuses when the normalised email already had a trial
--   claim_referral()  a second account on the same normalised email can't refer itself
--   stripe_record_commission()  + p_card: a commission is 'held' for review (never paid automatically) when the
--                     payer and the referrer share a normalised email, or the payer's card is one the referrer used
--                     for their own trial

begin;

alter table public.trial_uses add column if not exists kind text not null default 'email'
  check (kind in ('email', 'email_norm', 'card'));

create or replace function public.card_hash(p_fingerprint text)
returns text language sql immutable parallel safe set search_path = ''
as $$ select case when nullif(btrim(p_fingerprint), '') is null then null
             else encode(extensions.digest(convert_to('card:' || btrim(p_fingerprint), 'UTF8'), 'sha256'), 'hex') end $$;
revoke all on function public.card_hash(text) from public, anon, authenticated;

drop function if exists public.record_trial(uuid, text);
create or replace function public.record_trial(p_user uuid, p_customer text, p_card text default null)
returns void language sql security definer set search_path = ''
as $$
  insert into public.trial_uses (email_hash, stripe_customer, kind)
  select h.hash, p_customer, h.kind from auth.users u
  cross join lateral (values (public.email_hash(u.email), 'email'), (public.email_norm_hash(u.email), 'email_norm'),
                             (public.card_hash(p_card), 'card')) as h(hash, kind)
  where u.id = p_user and h.hash is not null
  on conflict (email_hash) do nothing
$$;
revoke all on function public.record_trial(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_trial(uuid, text, text) to service_role;

create or replace function public.trial_card_seen(p_card text, p_customer text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.card_hash(p_card) is not null and exists (
    select 1 from public.trial_uses t where t.email_hash = public.card_hash(p_card) and t.stripe_customer is distinct from p_customer)
$$;
revoke all on function public.trial_card_seen(text, text) from public, anon, authenticated;
grant execute on function public.trial_card_seen(text, text) to service_role;

create or replace function public.trial_eligible_for(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_user is not null
    and not exists (select 1 from public.subscriptions s where s.user_id = p_user)
    and not exists (select 1 from public.trial_uses t join auth.users u
                      on t.email_hash in (public.email_hash(u.email), public.email_norm_hash(u.email)) where u.id = p_user)
$$;

-- Trials already used: their normalised hash too, for accounts that still exist (others can't be worked out)
insert into public.trial_uses (email_hash, stripe_customer, kind, used_at)
select public.email_norm_hash(u.email), t.stripe_customer, 'email_norm', t.used_at
  from public.trial_uses t join auth.users u on public.email_hash(u.email) = t.email_hash
 where t.kind = 'email'
on conflict (email_hash) do nothing;

create or replace function public.claim_referral(p_ref text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  owner uuid;
begin
  if me is null or p_ref is null then return false; end if;
  if exists (select 1 from public.referrals where referred_id = me) then return false; end if;
  if (select created_at from auth.users where id = me) < now() - interval '1 day' then return false; end if;
  select id into owner from public.profiles where referral_code = lower(p_ref);
  if owner is null or owner = me then return false; end if;
  -- The same person on a second address spelling isn't a referral (audit 2, L5)
  if public.same_person(owner, me) then return false; end if;
  insert into public.referrals (referrer_id, referred_id) values (owner, me) on conflict do nothing;
  update public.profile_private set referred_by = lower(p_ref) where id = me and referred_by is null;
  return true;
end $$;

drop function if exists public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz);
create or replace function public.stripe_record_commission(p_payer uuid, p_ref text, p_payment_intent text, p_paid integer,
  p_currency text, p_pence integer, p_paid_at timestamptz default now(), p_card text default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  ref record;
  first_paid timestamptz;
  v_status text := 'pending';
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
  -- One person paying themselves through a second account: held for a person to look at, never paid on its own
  if public.same_person(ref.referrer_id, p_payer)
     or (public.card_hash(p_card) is not null and exists (
           select 1 from public.trial_uses t join public.customers c on c.stripe_customer_id = t.stripe_customer
            where t.email_hash = public.card_hash(p_card) and c.user_id = ref.referrer_id)) then
    v_status := 'held';
  end if;
  insert into public.commissions (referral_id, referrer_id, stripe_payment_ref, stripe_payment_intent, paid_amount, paid_currency, amount_pence, gross_pence, status, kind, created_at)
  values (ref.id, ref.referrer_id, p_ref, p_payment_intent, p_paid, lower(p_currency), p_pence, p_pence, v_status, 'earning', p_paid_at);
  return case when v_status = 'held' then 'recorded, held for review' else 'recorded' end;
exception when unique_violation then
  return 'already recorded';
end $$;
revoke all on function public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz, text) to service_role;

commit;
