-- Files: avatars (public to view), trade screenshots (private to the owner), community images (signed-in traders)
-- Every file lives under a folder named by its owner's user id: <uid>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('screenshots', 'screenshots', false, 8388608, array['image/png', 'image/jpeg', 'image/webp']),
  ('community', 'community', false, 4194304, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: owner writes" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner updates" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "screenshots: owner only" on storage.objects for all to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "community: signed-in read" on storage.objects for select to authenticated using (bucket_id = 'community');
create policy "community: owner writes" on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "community: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = (select auth.uid())::text);
;
