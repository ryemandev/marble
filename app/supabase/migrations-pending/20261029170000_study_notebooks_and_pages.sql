-- Study: notebooks and their pages (the "hardback" Study tab), and today's notes moved into them.
-- NOT APPLIED. Written 29 October 2026 for review. Apply it BEFORE deploying the app build that has the new Study tab
-- (src/views/Study.jsx, src/views/study/): that build reads and writes these two tables. Until they exist, the app
-- still loads, Study shows "Your notebooks didn't load just now", and anything written waits in the browser's outbox.
--
-- What it makes:
--   notebooks   one per topic: title, the statue on its cover, its place on the shelf, the page the ribbon marks
--   pages       one row per page: its number, title, the YouTube lesson it's under (11-character id, title, channel,
--               length, where it was left), an optional linked trade, and its lines as jsonb [{ t, text, key }]
--               (t: whole seconds into the lesson or null; key: a key lesson). A search column over the title and
--               lines (tsvector, 'simple') with a GIN index, for searching on the server later; the app searches
--               what it has loaded. attachments: the page's photos as jsonb [{ path, w, h, caption, t }], at most
--               8, each path in the trader's own folder for this very page (checked by study_photos_ok).
--   storage     a PRIVATE bucket `study` for those photos: 2 MB a file, WebP, JPEG, PNG or GIF only. The app redraws
--               every photo in the browser as WebP or JPEG (about 1 MB, at most 2000px) before upload, which also
--               strips its EXIF data; the original file is never uploaded. Paths: "<user id>/<page id>/<photo id>.webp"
--               and a small copy "…-t.webp".
--
-- Photo storage, kept tight (the screenshots bucket's shape, tighter):
--   * read, add and delete only inside your own "<user id>/" folder; no update policy at all, so a stored photo is
--     never overwritten (each photo is a new path); the app shows them only through short-lived signed URLs
--   * adding needs a plan: its own RESTRICTIVE has_access() policy on insert (the existing "paid: uploads" policy for
--     screenshots and community is left as it is)
--   * the bucket itself enforces the 2 MB limit and the image types, whatever a browser sends
--   * storage objects can't cascade from a table: the app deletes a page's photos from the bucket when the photo, its
--     page or its notebook goes (through its outbox, once Undo's 12 seconds have passed). delete-account must empty
--     this bucket too: add "study" to BUCKETS in supabase/functions/delete-account/index.ts.
--
-- Access, the same as notes today:
--   * row level security on both; a trader reads and writes only their own rows (user_id = auth.uid())
--   * the paywall: the same RESTRICTIVE has_access() policies on insert and update as notes ("paid: add",
--     "paid: change"); reading and deleting stay open, so a lapsed trader can still read, export and delete
--   * a page can only sit in its owner's notebook (a composite foreign key on (notebook_id, user_id)) and can only
--     link its owner's trade (checked in the insert and update policies)
--   * anon gets nothing; authenticated gets select, insert, update, delete (as on notes)
--   * user_id references auth.users on delete cascade, so delete-account removes them with the rest; deleting a
--     notebook deletes its pages; deleting a trade unlinks it from any page (set null)
--
-- Moving the notes over (run once, safe to run again: nothing already moved is moved twice):
--   * each trader's folders become notebooks (a blank folder becomes "Notes"), in the order first used, each with
--     the next statue along as its cover
--   * each note becomes one page in its folder's notebook, numbered in the order written, keeping the note's id,
--     date, title and linked trade (if that trade is the trader's own)
--   * its body splits into lines, one per line of text (blank lines dropped); video_at (e.g. "12:44") becomes the
--     first line's time and the page's last-watched place. Old notes never stored which video, so video_id is null;
--     the trader can give a page its lesson later.
--   * the ribbon of each new notebook is put on its last page
-- The notes table itself is left exactly as it is (the app stops reading it). Drop it in a later migration once
-- Study has been live for a while.

begin;

-- ---------- Notebooks ----------
create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  cover text check (cover is null or cover ~ '^[a-z0-9/_-]{1,80}$'),
  position int not null default 0 check (position between 0 and 100000),
  last_page int not null default 1 check (last_page between 1 and 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- lets pages point at (notebook, owner) together, so a page can't be filed in someone else's notebook
  unique (id, user_id)
);
comment on table public.notebooks is 'Study: one notebook per topic. last_page is the ribbon (the page it was left at).';
create index notebooks_user on public.notebooks (user_id, position);

-- ---------- Pages ----------
-- A page's photos, checked: a list of at most 8, each { path, w, h, caption?, t? } and nothing else, the path in the
-- owner's folder for this very page
create or replace function public.study_photos_ok(a jsonb, owner uuid, page uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(a) = 'array' and jsonb_array_length(a) <= 8 and not exists (
    select 1 from jsonb_array_elements(a) as e(x)
    where jsonb_typeof(x) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(x) as k(key) where k.key not in ('path', 'w', 'h', 'caption', 't'))
       or jsonb_typeof(x -> 'path') is distinct from 'string'
       or not coalesce((x ->> 'path') ~ ('^' || owner::text || '/' || page::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'), false)
       or not (case when jsonb_typeof(x -> 'w') = 'number' then (x ->> 'w')::numeric between 1 and 10000 else false end)
       or not (case when jsonb_typeof(x -> 'h') = 'number' then (x ->> 'h')::numeric between 1 and 10000 else false end)
       or coalesce(jsonb_typeof(x -> 'caption'), 'null') not in ('string', 'null')
       or char_length(coalesce(x ->> 'caption', '')) > 140
       or coalesce(jsonb_typeof(x -> 't'), 'null') not in ('number', 'null')
       or not (case when jsonb_typeof(x -> 't') = 'number' then (x ->> 't')::numeric between 0 and 86400 else true end)
  )
$$;

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  n int not null check (n between 1 and 9999),
  title text not null default '' check (char_length(title) <= 120),
  video_id text check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_title text check (video_title is null or char_length(video_title) <= 200),
  video_channel text check (video_channel is null or char_length(video_channel) <= 120),
  video_len int check (video_len is null or video_len between 0 and 86400),
  video_at int check (video_at is null or video_at between 0 and 86400),
  trade_id uuid references public.trades (id) on delete set null,
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 400 and pg_column_size(lines) <= 131072),
  attachments jsonb not null default '[]'::jsonb constraint pages_attachments_ok check (public.study_photos_ok(attachments, user_id, id)),
  search tsvector generated always as (
    to_tsvector('simple'::regconfig, title || ' ' || coalesce(jsonb_path_query_array(lines, '$[*].text')::text, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (notebook_id, user_id) references public.notebooks (id, user_id) on delete cascade
);
comment on table public.pages is 'Study: a notebook page. lines is [{t: seconds|null, text, key: bool}]; key lessons are lines with key = true.';
comment on column public.pages.search is 'Full-text search over the title and lines (simple config). The app does not read it.';
-- Two devices writing the same fresh page offline both keep theirs, so (notebook_id, n) is ordered, not unique
create index pages_notebook on public.pages (notebook_id, n, created_at);
create index pages_user on public.pages (user_id);
create index pages_trade on public.pages (trade_id) where trade_id is not null;
create index pages_search on public.pages using gin (search);

-- ---------- updated_at ----------
create or replace function public.study_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger notebooks_touch before update on public.notebooks for each row execute function public.study_touch_updated_at();
create trigger pages_touch before update on public.pages for each row execute function public.study_touch_updated_at();

-- ---------- Row level security ----------
alter table public.notebooks enable row level security;
alter table public.pages enable row level security;

create policy "own notebooks" on public.notebooks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "paid: add" on public.notebooks as restrictive for insert to authenticated
  with check ((select public.has_access()));
create policy "paid: change" on public.notebooks as restrictive for update to authenticated
  using ((select public.has_access())) with check ((select public.has_access()));

create policy "own pages: read" on public.pages for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own pages: add" on public.pages for insert to authenticated
  with check (user_id = (select auth.uid())
    and (trade_id is null or exists (select 1 from public.trades t where t.id = trade_id and t.user_id = (select auth.uid()))));
create policy "own pages: change" on public.pages for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (trade_id is null or exists (select 1 from public.trades t where t.id = trade_id and t.user_id = (select auth.uid()))));
create policy "own pages: remove" on public.pages for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "paid: add" on public.pages as restrictive for insert to authenticated
  with check ((select public.has_access()));
create policy "paid: change" on public.pages as restrictive for update to authenticated
  using ((select public.has_access())) with check ((select public.has_access()));

revoke all on table public.notebooks from anon;
revoke all on table public.pages from anon;
grant select, insert, update, delete on table public.notebooks to authenticated;
grant select, insert, update, delete on table public.pages to authenticated;

-- ---------- The photos' bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study', 'study', false, 2097152, array['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "study: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study: owner writes" on storage.objects for insert to authenticated
  with check (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Adding a photo needs a plan (its own RESTRICTIVE policy, so the existing "paid: uploads" isn't touched)
create policy "study: paid uploads" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'study' or (select public.has_access()));

-- ---------- Moving today's notes over ----------
-- Helpers for this migration only (pg_temp: gone when the session ends)

-- "12:44", "1:02:03" or "90" in seconds; null when it isn't a time or is past a day
create function pg_temp.study_secs(v text) returns int language sql immutable as $$
  select (case
    when s ~ '^\d{1,5}$' and s::int <= 86400 then s::int
    when s ~ '^(\d{1,2}:)?[0-5]?\d:[0-5]\d$' then (
      select nullif(least(sum(p::int * (60 ^ (k - o))::int), 86401), 86401)::int
      from unnest(string_to_array(s, ':')) with ordinality as u(p, o), (select cardinality(string_to_array(s, ':')) as k) c)
    else null end)::int
  from (select btrim(coalesce(v, '')) as s) x
$$;

-- A note's body as page lines: one per line of text, blank ones dropped, the first keeping the note's time. A
-- body of more than 400 lines puts the rest together on the 400th, so nothing is lost.
create function pg_temp.study_lines(body text, t int) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('t', case when b = 1 then t end, 'text', txt, 'key', false) order by b), '[]'::jsonb)
  from (
    select least(i, 400) as b, string_agg(line, ' ' order by i) as txt
    from (
      select row_number() over (order by ord) as i, btrim(l) as line
      from regexp_split_to_table(coalesce(body, ''), E'\\r?\\n') with ordinality as s(l, ord)
      where btrim(l) <> ''
    ) numbered
    group by least(i, 400)
  ) grouped
$$;

-- The folder a note is filed in, as a notebook title
create function pg_temp.study_folder(folder text) returns text language sql immutable as $$
  select left(coalesce(nullif(btrim(folder), ''), 'Notes'), 60)
$$;

-- 1. A notebook for each trader's folder, in the order the folders were first used
with folders as (
  select user_id, pg_temp.study_folder(folder) as title, min(created_at) as first_at, max(created_at) as last_at, count(*) as cnt
  from public.notes
  group by user_id, pg_temp.study_folder(folder)
), numbered as (
  select f.*, (row_number() over (partition by f.user_id order by f.first_at, f.title) - 1)::int as pos
  from folders f
)
insert into public.notebooks (user_id, title, cover, position, last_page, created_at, updated_at)
select nb.user_id, nb.title,
  (array['gods/apollo-light', 'gods/david-curls', 'gods/headband-hero', 'gods/hercules-dark',
         'gods/muse-dark', 'gods/goddess-shadow', 'gods/crowned-queen', 'gods/flower-crown'])[1 + nb.pos % 8],
  -- the ribbon on its last page, so it opens where the notes ended
  nb.pos, least(nb.cnt, 9999)::int, nb.first_at, nb.last_at
from numbered nb
where not exists (select 1 from public.notebooks x where x.user_id = nb.user_id and x.title = nb.title);

-- 2. A page for each note not moved yet (the page keeps the note's id), numbered on after any pages already there
with target as (
  select distinct on (user_id, title) id, user_id, title
  from public.notebooks
  order by user_id, title, created_at, id
), todo as (
  select x.*, t.id as nb_id
  from public.notes x
  join target t on t.user_id = x.user_id and t.title = pg_temp.study_folder(x.folder)
  where not exists (select 1 from public.pages p where p.id = x.id)
)
insert into public.pages (id, notebook_id, user_id, n, title, trade_id, lines, video_at, created_at, updated_at)
select d.id, d.nb_id, d.user_id,
  coalesce((select max(p.n) from public.pages p where p.notebook_id = d.nb_id), 0)
    + row_number() over (partition by d.nb_id order by d.created_at, d.id),
  left(btrim(d.title), 120),
  case when exists (select 1 from public.trades tr where tr.id = d.trade_id and tr.user_id = d.user_id) then d.trade_id end,
  pg_temp.study_lines(d.body, pg_temp.study_secs(d.video_at)),
  pg_temp.study_secs(d.video_at),
  d.created_at, d.created_at
from todo d;

commit;
