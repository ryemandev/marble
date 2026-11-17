alter table public.profile_private
  add column showcase jsonb
    constraint profile_private_showcase_check check (
      showcase is null or (jsonb_typeof(showcase) = 'object' and pg_column_size(showcase) <= 2048)
    );

comment on column public.profile_private.showcase is 'The Showcase look (src/print/look.js): scene, layout, frame, shape, stats, title, chop, chopText, at. The app checks every field when it reads it back.';

grant select (showcase), insert (showcase), update (showcase) on public.profile_private to authenticated;;
