-- Chat: seven topic rooms beside General and the crew rooms. NOT APPLIED. Written 31 October 2026 to the rooms the owner
-- chose: Futures, Forex, Stocks, Prop firms, Psychology, Wins & losses and Help.
-- Needs 20261029160100_community_2_chat.sql (live) and 20261030100000_dms_and_sharing.sql (applied just before this
-- one: the check below stops if it isn't). Undo: section 21 of ROLLBACK.md.
--
-- What it changes, and only this:
--   chat_messages        the room check gains futures, forex, stocks, props, psych, wins and help. Like General, any
--                        signed-in trader can read a topic room and write in it. Your crew's room stays your crew's.
--   realtime.messages    the private presence channels chat:<topic> can be joined by any signed-in trader, the same as
--                        chat:general ("here" counts). Nobody can broadcast into a room, as before.
--
-- What stays exactly as it is, because it doesn't depend on the room:
--   * the plan check on writing ("paid: add", RESTRICTIVE, has_access());
--   * chat_before_insert(): the rate limit (10 a minute and 600 a day across every room together), the time, the
--     author's crew and the trade card set by the server, and a reply only to a message in the same room;
--   * "chat: not from people you blocked" (RESTRICTIVE, from the DM file): blocked traders' messages don't reach you in
--     a topic room either, loaded or live;
--   * the 90 days, chat_purge(), deleting your own, admins hiding, and reporting a message.
--
-- The four policies replaced below were made by 20261029160100 and aren't changed by the DM file as it stands (it adds
-- its own policies beside them). If the DM review edits any of these four, carry that edit into this file before it's
-- applied, or it will be lost.

begin;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages'
                  and policyname = 'chat: not from people you blocked') then
    raise exception 'Apply 20261030100000_dms_and_sharing.sql before this file.';
  end if;
end $$;

-- The rooms. Topic slugs are lower case, so they can never be mistaken for a crew tag (OLY, NITE, PIT).
alter table public.chat_messages drop constraint chat_messages_room_check;
alter table public.chat_messages add constraint chat_messages_room_check check (room in
  ('general', 'futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help', 'OLY', 'NITE', 'PIT'));
comment on table public.chat_messages is 'In-app chat: General, seven topic rooms and one room per crew. Kept 90 days. Written by the trader, cards and crew set by the server.';

-- Read: General and the topics, and your own crew's room, for 90 days. Admins read every room.
drop policy "chat: read your rooms" on public.chat_messages;
create policy "chat: read your rooms" on public.chat_messages for select to authenticated using (
  (select public.is_admin())
  or (not hidden and created_at > now() - interval '90 days'
      and (room in ('general', 'futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help') or room = (select public.my_crew()))));
drop policy "chat: write in your rooms" on public.chat_messages;
create policy "chat: write in your rooms" on public.chat_messages for insert to authenticated with check (
  user_id = (select auth.uid()) and not hidden
  and (room in ('general', 'futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help') or room = (select public.my_crew())));

-- "Here" counts: join General, a topic or your own crew's room, and only to say you're there (presence)
drop policy "chat rooms: join your rooms" on realtime.messages;
create policy "chat rooms: join your rooms" on realtime.messages for select to authenticated
  using (realtime.topic() in ('chat:general', 'chat:futures', 'chat:forex', 'chat:stocks', 'chat:props', 'chat:psych', 'chat:wins', 'chat:help')
    or realtime.topic() = 'chat:' || coalesce((select public.my_crew()), '-'));
drop policy "chat rooms: say you're here" on realtime.messages;
create policy "chat rooms: say you're here" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence'
    and (realtime.topic() in ('chat:general', 'chat:futures', 'chat:forex', 'chat:stocks', 'chat:props', 'chat:psych', 'chat:wins', 'chat:help')
      or realtime.topic() = 'chat:' || coalesce((select public.my_crew()), '-')));

commit;
