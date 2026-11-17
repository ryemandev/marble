-- Community rework, part 1 of 4: crews, and the feed (tagged posts, likes, trade cards, the anonymous board folded in).
-- NOT APPLIED. Written 29 October 2026 for review. Apply parts 1 to 4 in order, then ship the app build that uses them
-- (src/views/Community.jsx and src/views/community/). The app still runs on part 1 alone: the old client asks feed()
-- for p_kind 'post' or 'thread' and gets exactly what it got before.
--
-- What it makes or changes:
--   crew_members        one row per trader who has picked a crew (OLY, NITE or PIT), or left one (crew null)
--   my_crew()           the caller's crew, for row security and triggers
--   set_crew(p_crew)    join, switch or leave; a change is allowed once every 30 days (the first pick is free)
--   crew_counts()       how many traders are in each crew (counts only)
--   posts               kind gains 'lesson' and 'question'; crew is filled by the server from crew_members, never by
--                       the client, and is left empty on anonymous posts; at most 20 posts an hour
--   trade_card()        the trade card a post or chat message carries, built by the server from the author's own trade:
--                       symbol, side, setup, R, rules kept and where it came from. Never dollars, never the trade's id
--                       or date. A client sends only {"id": "<trade uuid>"}; anything else in it is thrown away, so a
--                       card can't be faked.
--   anon_card()         an anonymous post's card: no setup, and R rounded to the nearest 0.5
--   post_reactions      one like per trader per post
--   feed()              replaced: every top-level kind by default, filters for kind, crew, anonymous and replies to a
--                       post, like counts, and an anonymous post's crew is hidden as well as its author

begin;

-- ---------- Crews ----------
create table public.crew_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  crew text check (crew is null or crew in ('OLY', 'NITE', 'PIT')),
  joined_at timestamptz not null default now(),
  -- When the crew last changed (a first pick, a switch or leaving): the next change is allowed 30 days after
  changed_at timestamptz not null default now()
);
comment on table public.crew_members is 'Each trader''s crew (null = left, in no crew). Written only through set_crew(); one change every 30 days.';
create index crew_members_crew on public.crew_members (crew) where crew is not null;

alter table public.crew_members enable row level security;
revoke all on table public.crew_members from anon, authenticated;
grant select on table public.crew_members to authenticated;
-- Your own row only. Other traders' crews reach the app through feed(), chat rows and the boards, which show the tag.
create policy "crew members: read own" on public.crew_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.my_crew()
returns text language sql stable security definer set search_path = ''
as $$ select crew from public.crew_members where user_id = (select auth.uid()) $$;
revoke all on function public.my_crew() from public, anon;
grant execute on function public.my_crew() to authenticated;

-- Join, switch or leave (p_crew null). Returns the row as it now stands.
create or replace function public.set_crew(p_crew text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.crew_members;
begin
  if v_me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.has_access_for(v_me) then raise exception 'Crews need an active plan' using errcode = '42501'; end if;
  if p_crew is not null and p_crew not in ('OLY', 'NITE', 'PIT') then raise exception 'No such crew' using errcode = '22023'; end if;
  select * into v_row from public.crew_members where user_id = v_me for update;
  if not found then
    if p_crew is null then return jsonb_build_object('crew', null, 'changed_at', null, 'next_change', null); end if;
    insert into public.crew_members (user_id, crew) values (v_me, p_crew) returning * into v_row;
  elsif v_row.crew is distinct from p_crew then
    if v_row.changed_at > now() - interval '30 days' then
      raise exception 'You can change crews once a month' using errcode = 'P0001',
        detail = to_char(v_row.changed_at + interval '30 days', 'YYYY-MM-DD');
    end if;
    update public.crew_members set crew = p_crew, changed_at = now() where user_id = v_me returning * into v_row;
  end if;
  return jsonb_build_object('crew', v_row.crew, 'changed_at', v_row.changed_at, 'next_change', v_row.changed_at + interval '30 days');
end $$;
revoke all on function public.set_crew(text) from public, anon;
grant execute on function public.set_crew(text) to authenticated;

-- Members in each crew: counts only, never who
create or replace function public.crew_counts()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when (select auth.uid()) is null then '{}'::jsonb else coalesce(
    (select jsonb_object_agg(crew, n) from (select crew, count(*) n from public.crew_members where crew is not null group by crew) x), '{}'::jsonb) end
$$;
revoke all on function public.crew_counts() from public, anon;
grant execute on function public.crew_counts() to authenticated;

-- ---------- Trade cards: built by the server from the author's own trade ----------
-- src: manual | import | sync. via: the platform an import or sync came from (imports.platform), when known.
-- kept / of: the trade's own rules ticked, of how many. plan: followed_plan (true, false or null).
-- The card never carries the trade's id or its date, so the same trade shared in two places can't be matched up
-- (pre-deploy review C1).
-- p_anonymous: the card for an anonymous post goes further, with no setup and R rounded to the nearest 0.5
-- (anon_card), so it can't be matched to the same trade shared under a name either.
create or replace function public.anon_card(p_card jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select case when p_card is null then null else p_card || jsonb_build_object('setup', null,
    'r', case when p_card->>'r' is null then null else round(round((p_card->>'r')::numeric * 2) / 2, 1) end) end
$$;
revoke all on function public.anon_card(jsonb) from public, anon, authenticated;

create or replace function public.trade_card(p_user uuid, p_trade jsonb, p_anonymous boolean default false)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when p_anonymous then public.anon_card(c) else c end from (
    select jsonb_build_object(
      'sym', t.symbol, 'side', t.side, 'setup', t.setup,
      'r', case when t.r is null then null else round(t.r, 2) end,
      'kept', (select count(*) from unnest(t.kept) k where k), 'of', cardinality(t.kept),
      'plan', t.followed_plan, 'src', t.source, 'via', i.platform) c
    from public.trades t left join public.imports i on i.id = t.import_id
    where p_trade is not null and jsonb_typeof(p_trade) = 'object'
      and (p_trade->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and t.id = (p_trade->>'id')::uuid and t.user_id = p_user
  ) x
$$;
revoke all on function public.trade_card(uuid, jsonb, boolean) from public, anon, authenticated;

-- ---------- Posts ----------
alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind = any (array['post', 'win', 'loss', 'lesson', 'question', 'thread', 'reply']));

-- Before a post is saved: the server sets its crew and trade card, and holds a trader to 20 posts an hour
create or replace function public.posts_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() and not public.rate_ok(new.user_id, 'post', 20, interval '1 hour') then
      raise exception 'That''s a lot of posts in an hour. Try again a little later.' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.crew := case when new.anonymous then null else (select c.crew from public.crew_members c where c.user_id = new.user_id) end;
    -- A reply belongs to a top-level post and takes on its anonymity rules, never its crew
    if new.parent_id is not null then new.kind := 'reply'; end if;
    new.trade := public.trade_card(new.user_id, new.trade, new.anonymous);
  elsif new.trade is distinct from old.trade then
    new.trade := public.trade_card(old.user_id, new.trade, new.anonymous);
  elsif new.anonymous and not old.anonymous then
    -- Made anonymous afterwards: its card loses the setup and the exact R as well
    new.trade := public.anon_card(old.trade);
  end if;
  if tg_op = 'UPDATE' then new.crew := old.crew; end if;
  return new;
end $$;
revoke all on function public.posts_before_write() from public, anon, authenticated;
create trigger posts_before_write before insert or update on public.posts
  for each row execute function public.posts_before_write();

-- ---------- Likes ----------
create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
comment on table public.post_reactions is 'One like per trader per post. Counts reach the app through feed(); who liked what is private.';
create index post_reactions_user on public.post_reactions (user_id);
alter table public.post_reactions enable row level security;
revoke all on table public.post_reactions from anon, authenticated;
grant select, insert, delete on table public.post_reactions to authenticated;
create policy "reactions: read own" on public.post_reactions for select to authenticated using (user_id = (select auth.uid()));
create policy "reactions: add own" on public.post_reactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reactions: remove own" on public.post_reactions for delete to authenticated using (user_id = (select auth.uid()));
create policy "paid: add" on public.post_reactions as restrictive for insert to authenticated with check ((select public.has_access()));

-- ---------- The feed ----------
-- p_kind: one kind (win, lesson, question, post, thread...), or null for every top-level post
-- p_crew: one crew's named posts. p_anonymous: true for anonymous posts only (the board, folded in), false for named only.
-- p_parent: the replies to one post, oldest first, instead of the feed.
drop function if exists public.feed(text, text, timestamptz, integer);
create function public.feed(p_crew text default null, p_kind text default null, p_before timestamptz default now(),
  p_limit integer default 30, p_anonymous boolean default null, p_parent uuid default null)
returns table (id uuid, kind text, crew text, parent_id uuid, body text, trade jsonb, image_url text, created_at timestamptz,
  author_handle extensions.citext, author_name text, author_avatar text, anonymous boolean, mine boolean, replies bigint,
  likes bigint, liked boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.kind,
         case when p.anonymous then null else p.crew end,
         p.parent_id, p.body, p.trade, p.image_url, p.created_at,
         case when p.anonymous then null else pr.handle end,
         case when p.anonymous then null else pr.name end,
         case when p.anonymous then null else coalesce(pr.avatar_url, pr.avatar_art) end,
         p.anonymous, p.user_id = (select auth.uid()),
         (select count(*) from public.posts c where c.parent_id = p.id and not c.hidden),
         (select count(*) from public.post_reactions r where r.post_id = p.id),
         exists (select 1 from public.post_reactions r where r.post_id = p.id and r.user_id = (select auth.uid()))
  from public.posts p join public.profiles pr on pr.id = p.user_id
  where not p.hidden and (select auth.uid()) is not null
    and (case when p_parent is null then p.parent_id is null and p.kind <> 'reply' else p.parent_id = p_parent end)
    -- Replies to a post the moderators hid are hidden with it (security audit 2)
    and (p_parent is null or not exists (select 1 from public.posts h where h.id = p_parent and h.hidden))
    and (p_kind is null or p.kind = p_kind)
    and (p_crew is null or (p.crew = p_crew and not p.anonymous))
    and (p_anonymous is null or p.anonymous = p_anonymous)
    and p.created_at < p_before
  order by case when p_parent is null then p.created_at end desc, p.created_at asc
  limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.feed(text, text, timestamptz, integer, boolean, uuid) from public, anon;
grant execute on function public.feed(text, text, timestamptz, integer, boolean, uuid) to authenticated;

commit;
