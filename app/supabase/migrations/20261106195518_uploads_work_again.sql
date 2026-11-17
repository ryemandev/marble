-- Uploads work again (owner, 6 Nov 2026: "Yes, apply it").
-- "backdrops: owner writes" counted a trader's backdrops with a subquery on storage.objects inside a policy on
-- storage.objects, which stopped every upload made as a trader with infinite recursion. The rule stays the same, four
-- backdrops each, with the count moved into a function so the policy no longer reads its own table.

create or replace function public.backdrop_room()
returns boolean language sql stable security definer set search_path = ''
as $$
  select count(*) < 4 from storage.objects o
  where o.bucket_id = 'backdrops' and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;
revoke all on function public.backdrop_room() from public, anon;
grant execute on function public.backdrop_room() to authenticated;

drop policy if exists "backdrops: owner writes" on storage.objects;
create policy "backdrops: owner writes" on storage.objects for insert to authenticated with check (
  bucket_id = 'backdrops' and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[a-z0-9]{1,24}\.jpg$'
  and (select public.backdrop_room())
);;
