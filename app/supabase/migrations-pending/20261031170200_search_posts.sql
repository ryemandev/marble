-- The app's search box: Community posts. NOT APPLIED. Written 30 October 2026 for review.
-- Needs 20261030100000_dms_and_sharing.sql (its feed() and dm_blocks), live now. Apply it, then deploy the app build
-- with the search box (src/components/Search.jsx); until it's applied the search box simply shows no posts.
--
-- What it makes:
--   search_posts(p_q, p_limit)   the posts (and replies) a signed-in trader can see whose words contain every word
--                                searched for, newest first, at most 30. It answers exactly as feed() would: hidden
--                                posts and replies to hidden posts never, a trader you blocked's named posts never, an
--                                anonymous post's author never. 60 searches a minute per trader (rate_ok).
--
-- Trades and Study pages are searched on the trader's own device (they're already there). Private messages are too:
-- their bodies are encrypted at rest and opened only by dm_thread() and dm_inbox() for the two people in a
-- conversation, so there is deliberately no server-side message search (it would mean opening every message a
-- trader has on every keystroke, a second read path into private messages to keep safe, and a heavy query anyone
-- signed in could run over and over). The search box looks through the messages already loaded on the device.
--
-- To undo: drop function public.search_posts(text, integer);

begin;

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
  -- Up to six words of the first 100 characters, each at least as long as one letter; under two letters in all, nothing
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
     -- Replies to a post the moderators hid are hidden with it (as in feed())
     and (p.parent_id is null or not exists (select 1 from public.posts h where h.id = p.parent_id and h.hidden))
     -- Someone you blocked: their named posts are hidden from you; anonymous ones never are (as in feed())
     and (p.anonymous or not exists (select 1 from public.dm_blocks b where b.blocker = me and b.blocked = p.user_id))
     -- Every word, anywhere in the post, as typed: % _ and \ in a word match only themselves
     and not exists (select 1 from unnest(v_words) as w
                      where p.body not ilike '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 30);
end $$;
revoke all on function public.search_posts(text, integer) from public, anon;
grant execute on function public.search_posts(text, integer) to authenticated;

commit;
