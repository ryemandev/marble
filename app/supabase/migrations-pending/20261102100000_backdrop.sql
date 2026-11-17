-- The trader's background behind the light theme's panels (src/backdrop.js): which picture (one of Marble's, their
-- own photo, or none), glass or soft panels, and black and white for their own photo. Until this is applied, the app
-- keeps each trader's choice on their own device only (src/store.js) and never sends it (src/live/sync.js saves it
-- only once profile_private has this column), and their own photo can't be uploaded, so nothing fails either way.
-- APPLIED live on 2 November 2026 with the owner's OK.
--
-- No new table: the choice is one small JSON object on the trader's own private row, like the Showcase's look
-- (20261101100000). Their own photo is one JPEG in their own folder of a private bucket, `backdrops`: only they can
-- read, add or delete it, adding one needs a plan, and a folder holds at most four (the app keeps one and deletes the
-- rest, src/live/backdrop.js). delete-account empties the bucket's folder with the rest of the trader's files.

begin;

alter table public.profile_private
  add column backdrop jsonb
    constraint profile_private_backdrop_check check (
      backdrop is null or (jsonb_typeof(backdrop) = 'object' and pg_column_size(backdrop) <= 1024)
    );

comment on column public.profile_private.backdrop is 'The background behind the light theme (src/backdrop.js): pic, panels, own (a path in the backdrops bucket), mono, at. The app checks every field when it reads it back.';

grant select (backdrop), insert (backdrop), update (backdrop) on public.profile_private to authenticated;

-- ---------- The trader's own photo ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backdrops', 'backdrops', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "backdrops: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'backdrops' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "backdrops: owner writes" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'backdrops' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[a-z0-9]{1,24}\.jpg$'
    and (select count(*) from storage.objects o
         where o.bucket_id = 'backdrops' and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 4
  );
create policy "backdrops: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'backdrops' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Adding a photo needs a plan (its own RESTRICTIVE policy, so the existing "paid: uploads" isn't touched)
create policy "backdrops: paid uploads" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'backdrops' or (select public.has_access()));

commit;
