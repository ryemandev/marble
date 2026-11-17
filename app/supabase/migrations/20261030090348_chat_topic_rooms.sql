do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages'
                  and policyname = 'chat: not from people you blocked') then
    raise exception 'Apply 20261030100000_dms_and_sharing.sql before this file.';
  end if;
end $$;

alter table public.chat_messages drop constraint chat_messages_room_check;
alter table public.chat_messages add constraint chat_messages_room_check check (room in
  ('general', 'futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help', 'OLY', 'NITE', 'PIT'));
comment on table public.chat_messages is 'In-app chat: General, seven topic rooms and one room per crew. Kept 90 days. Written by the trader, cards and crew set by the server.';

drop policy "chat: read your rooms" on public.chat_messages;
create policy "chat: read your rooms" on public.chat_messages for select to authenticated using (
  (select public.is_admin())
  or (not hidden and created_at > now() - interval '90 days'
      and (room in ('general', 'futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help') or room = (select public.my_crew()))));
drop policy "chat: write in your rooms" on public.chat_messages;
create policy "chat: write in your rooms" on public.chat_messages for insert to authenticated with check (
  user_id = (select auth.uid()) and not hidden
  and (room in ('general', 'futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help') or room = (select public.my_crew())));

drop policy "chat rooms: join your rooms" on realtime.messages;
create policy "chat rooms: join your rooms" on realtime.messages for select to authenticated
  using (realtime.topic() in ('chat:general', 'chat:futures', 'chat:forex', 'chat:stocks', 'chat:props', 'chat:psych', 'chat:wins', 'chat:help')
    or realtime.topic() = 'chat:' || coalesce((select public.my_crew()), '-'));
drop policy "chat rooms: say you're here" on realtime.messages;
create policy "chat rooms: say you're here" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence'
    and (realtime.topic() in ('chat:general', 'chat:futures', 'chat:forex', 'chat:stocks', 'chat:props', 'chat:psych', 'chat:wins', 'chat:help')
      or realtime.topic() = 'chat:' || coalesce((select public.my_crew()), '-')));;
