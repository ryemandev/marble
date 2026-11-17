-- The Floor's rail: "priya · 148 days". How many days a trader has closed, and nothing else about them.
-- closes stays private to its owner: this hands back a count, never a day or a fact, to signed-in traders only.
-- At most 60 handles a call. No-trade days count the same, and the count sorts nothing.
create or replace function public.floor_days(p_handles text[])
returns table (handle text, days integer)
language sql stable security definer set search_path = '' as $$
  select pr.handle::text, count(c.day)::integer
  from public.profiles pr
  left join public.closes c on c.user_id = pr.id
  where (select auth.uid()) is not null
    and pr.handle::text = any (p_handles[1:60])
  group by pr.handle
$$;
revoke all on function public.floor_days(text[]) from public, anon;
grant execute on function public.floor_days(text[]) to authenticated;
