-- A new trader's referral code is fixed at sign-up (their first handle), so their invite link works from day one.
-- handle_free_for already keeps the handle clear of every existing code and held name.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  base text := lower(regexp_replace(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'name', ''), '[^a-z0-9]', '', 'gi'));
  candidate text;
  tries int := 0;
  ref text := lower(nullif(new.raw_user_meta_data ->> 'ref', ''));
  referrer uuid;
begin
  if char_length(base) < 3 or public.handle_reserved(base) then base := 'trader'; end if;
  base := left(base, 14);
  candidate := case when base = 'trader' then base || lpad((floor(random() * 100000))::int::text, 5, '0') else base end;
  while not public.handle_free_for(candidate, new.id) loop
    tries := tries + 1;
    candidate := base || lpad((floor(random() * 100000))::int::text, 5, '0');
    if tries > 50 then candidate := 'trader' || replace(gen_random_uuid()::text, '-', ''); candidate := left(candidate, 20); end if;
  end loop;
  insert into public.profiles (id, handle, name, referral_code)
  values (new.id, candidate, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), candidate);
  if ref is not null then select id into referrer from public.profiles where referral_code = ref and id <> new.id; end if;
  insert into public.profile_private (id, referred_by) values (new.id, case when referrer is not null then ref end);
  if referrer is not null then
    insert into public.referrals (referrer_id, referred_id) values (referrer, new.id) on conflict do nothing;
  end if;
  return new;
end $function$;

-- Anyone who signed up before this without one gets their handle as their code
update public.profiles set referral_code = handle where referral_code is null;;
