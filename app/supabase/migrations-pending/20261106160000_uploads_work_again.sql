-- Uploads work again. Written and applied 6 November 2026 (owner: "Yes, apply it").
--
-- "backdrops: owner writes" (20261102100000_backdrop.sql) counted a trader's backdrops with a subquery on storage.objects
-- inside a policy on storage.objects. Every insert policy runs for every bucket, so Postgres stopped every upload made as a
-- trader with "infinite recursion detected in policy for relation objects": chart photos, day photos, Study images, bug
-- report pictures, backdrops and card pictures. Avatars go through a function and aren't touched.
--
-- The rule stays the same, four backdrops each, with the count moved into a function so the policy no longer reads its own
-- table. Tried on production in a rolled-back transaction on 6 November 2026: screenshot, backdrop and card picture all
-- went in, and a card picture with no link of its own was still refused.

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
);
