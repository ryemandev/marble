-- Security audit 2, M2: handles that look like the owner's or Marble's are reserved (same lists as _shared/handles.js)
create or replace function public.handle_fold(h text, p_digits boolean default true)
returns text language sql immutable parallel safe set search_path = ''
as $$
  select regexp_replace(
           replace(replace(
             regexp_replace(
               case when p_digits then translate(lower(coalesce(h, '')), '01i!|34@5$789', 'olllleaasstbg')
                    else translate(lower(coalesce(h, '')), 'i', 'l') end,
               '[^a-z]', '', 'g'),
             'rn', 'm'), 'vv', 'w'),
           '(.)\1+', '\1', 'g')
$$;

create or replace function public.handle_reserved(h text)
returns boolean language sql immutable parallel safe set search_path = ''
as $$
  with forms as (
    select f from unnest(array[public.handle_fold(h, true), public.handle_fold(h, false)]) f
  ),
  exact as (
    select public.handle_fold(w, true) as w from unnest(array[
      'jules',
      'marble', 'trademarble', 'marblehq', 'oracle', 'support', 'admin', 'administrator', 'help', 'helpdesk', 'team', 'official',
      'staff', 'mod', 'mods', 'moderator', 'moderators', 'billing', 'security', 'payments', 'legal', 'press', 'partners',
      'careers', 'desk', 'app', 'api', 'www', 'info', 'contact', 'hello', 'founder', 'founders', 'owner', 'system', 'root',
      'null', 'undefined']) w
  ),
  contains as (
    select public.handle_fold(w, true) as w
      from unnest(array['marble', 'marbel', 'official', 'admin', 'support', 'moderat', 'staff', 'oracle']) w
  ),
  role as (
    select '^(the)?('
      || (select string_agg(public.handle_fold(w, true), '|') from unnest(array['mod', 'mods', 'help', 'team', 'staff', 'jules']) w)
      || ')('
      || (select string_agg(public.handle_fold(w, true), '|') from unnest(array['team', 'desk', 'crew', 'squad', 'staff', 'hq', 'official', 'support', 'help', 'admin', 'mod']) w)
      || ')?$' as re
  )
  select exists (
    select 1 from forms, role
     where forms.f in (select w from exact)
        or exists (select 1 from contains c where position(c.w in forms.f) > 0)
        or left(forms.f, 3) = public.handle_fold('jul', true)
        or forms.f ~ role.re
  )
$$;;
