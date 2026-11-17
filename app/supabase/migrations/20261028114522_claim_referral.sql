-- Google and Apple sign-ins can't carry the referral handle in sign-up data, so the app claims it once, right after
-- the first sign-in. Only for an account under a day old, only once, never your own handle.
create or replace function public.claim_referral(p_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  owner uuid;
begin
  if me is null or p_ref is null then return false; end if;
  if exists (select 1 from public.referrals where referred_id = me) then return false; end if;
  if (select created_at from auth.users where id = me) < now() - interval '1 day' then return false; end if;
  select id into owner from public.profiles where handle = lower(p_ref);
  if owner is null or owner = me then return false; end if;
  insert into public.referrals (referrer_id, referred_id) values (owner, me) on conflict do nothing;
  update public.profile_private set referred_by = lower(p_ref) where id = me and referred_by is null;
  return true;
end $$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;
;
