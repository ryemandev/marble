create or replace function public.search_posts(p_q text, p_limit integer default 20)
returns table (id uuid, parent_id uuid, kind text, body text, created_at timestamptz, author_handle extensions.citext,
  anonymous boolean, mine boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_words text[];
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select coalesce(array_agg(w), '{}') into v_words
    from (select distinct w from regexp_split_to_table(lower(btrim(left(coalesce(p_q, ''), 100))), '\s+') as w
           where w <> '' limit 6) x;
  if coalesce(char_length(array_to_string(v_words, '')), 0) < 2 then return; end if;
  if not public.rate_ok(me, 'post_search', 60, interval '1 minute') then
    raise exception 'Slow down a little.' using errcode = 'P0001';
  end if;
  return query
  select p.id, p.parent_id, p.kind, left(p.body, 600), p.created_at,
         case when p.anonymous then null else pr.handle end,
         p.anonymous, p.user_id = me
    from public.posts p join public.profiles pr on pr.id = p.user_id
   where not p.hidden
     and (p.parent_id is null or not exists (select 1 from public.posts h where h.id = p.parent_id and h.hidden))
     and (p.anonymous or not exists (select 1 from public.dm_blocks b where b.blocker = me and b.blocked = p.user_id))
     and not exists (select 1 from unnest(v_words) as w
                      where p.body not ilike '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 30);
end $$;
revoke all on function public.search_posts(text, integer) from public, anon;
grant execute on function public.search_posts(text, integer) to authenticated;;
