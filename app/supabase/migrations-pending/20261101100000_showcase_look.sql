-- The Showcase's look: how a trader hangs their best win (the picture, shape, layout, frame, which figures show, the
-- title line and the letters on their seal; src/print/look.js). APPLIED live on 30 October 2026 with the owner's OK.
-- Until it's applied, the app keeps each trader's look on their own device only (src/store.js) and never sends it
-- (src/live/sync.js asks the server only once profile_private has this column), so nothing fails either way.
--
-- No new table: the look is one small JSON object on the trader's own private row. profile_private already has row
-- level security that lets a trader read and update only their own row, and column-level grants decide which columns
-- they may write; this adds the new column to those grants. A trader's own GIF or video ("Use your own") is never
-- stored here or anywhere on the server: it stays in their browser (src/print/own.js).

begin;

alter table public.profile_private
  add column showcase jsonb
    constraint profile_private_showcase_check check (
      showcase is null or (jsonb_typeof(showcase) = 'object' and pg_column_size(showcase) <= 2048)
    );

comment on column public.profile_private.showcase is 'The Showcase look (src/print/look.js): scene, layout, frame, shape, stats, title, chop, chopText, at. The app checks every field when it reads it back.';

grant select (showcase), insert (showcase), update (showcase) on public.profile_private to authenticated;

commit;
