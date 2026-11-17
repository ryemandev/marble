-- Community rework, part 2 of 4: live chat. A General room for everyone and one room per crew. No direct messages.
-- NOT APPLIED. Written 29 October 2026 for review. Needs part 1 (crew_members, my_crew(), trade_card()).
--
-- What it makes or changes:
--   chat_messages        room 'general' or a crew tag; read and write General and your own crew's room only;
--                        kept 90 days (older rows can't be read, and are deleted as new messages arrive and by
--                        chat_purge()); at most 10 messages a minute and 600 a day; a trade card built by the server
--   chat_purge()         deletes messages older than 90 days (for a nightly job, if pg_cron is turned on later)
--   reports              gains message_id, so a chat message can be reported the same way as a post; at most 20
--                        reports an hour; a new report names exactly one thing
--   supabase_realtime    chat_messages is added, so new messages arrive live. Realtime checks row security for each
--                        listener, so a crew room's messages only reach that crew.
--   realtime.messages    policies for the private presence channels: join General or your own crew's room only

begin;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room text not null check (room in ('general', 'OLY', 'NITE', 'PIT')),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- The author's crew when they wrote it (its tag shows beside their name), set by the server
  crew text check (crew is null or crew in ('OLY', 'NITE', 'PIT')),
  body text not null check (char_length(body) between 1 and 1000),
  trade jsonb,
  reply_to uuid references public.chat_messages(id) on delete set null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.chat_messages is 'In-app chat: General and one room per crew. Kept 90 days. Written by the trader, cards and crew set by the server.';
create index chat_messages_room_time on public.chat_messages (room, created_at desc);
create index chat_messages_created on public.chat_messages (created_at);
create index chat_messages_user on public.chat_messages (user_id);

alter table public.chat_messages enable row level security;
revoke all on table public.chat_messages from anon, authenticated;
grant select, delete on table public.chat_messages to authenticated;
grant insert (room, body, trade, reply_to) on table public.chat_messages to authenticated;
grant update (hidden) on table public.chat_messages to authenticated;

-- Read: General, and your own crew's room, for 90 days. Admins read every room.
create policy "chat: read your rooms" on public.chat_messages for select to authenticated using (
  (select public.is_admin())
  or (not hidden and created_at > now() - interval '90 days' and (room = 'general' or room = (select public.my_crew()))));
create policy "chat: write in your rooms" on public.chat_messages for insert to authenticated with check (
  user_id = (select auth.uid()) and not hidden and (room = 'general' or room = (select public.my_crew())));
create policy "chat: delete own or admin" on public.chat_messages for delete to authenticated using (
  user_id = (select auth.uid()) or (select public.is_admin()));
create policy "chat: admin hides" on public.chat_messages for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "paid: add" on public.chat_messages as restrictive for insert to authenticated with check ((select public.has_access()));

-- Before a message is saved: the time, the author's crew and the trade card come from the server; a reply must be to a
-- message in the same room; the rate limit; and anything past 90 days is cleared out
create or replace function public.chat_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() and (not public.rate_ok(new.user_id, 'chat', 10, interval '1 minute')
      or not public.rate_ok(new.user_id, 'chat_day', 600, interval '1 day')) then
    raise exception 'Slow down a little: too many messages at once.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  new.hidden := false;
  new.crew := (select c.crew from public.crew_members c where c.user_id = new.user_id);
  new.trade := public.trade_card(new.user_id, new.trade);
  if new.reply_to is not null and not exists (select 1 from public.chat_messages m where m.id = new.reply_to and m.room = new.room) then
    new.reply_to := null;
  end if;
  delete from public.chat_messages where created_at < now() - interval '90 days';
  return new;
end $$;
revoke all on function public.chat_before_insert() from public, anon, authenticated;
create trigger chat_before_insert before insert on public.chat_messages
  for each row execute function public.chat_before_insert();

create or replace function public.chat_purge()
returns integer language sql security definer set search_path = ''
as $$
  with gone as (delete from public.chat_messages where created_at < now() - interval '90 days' returning 1)
  select count(*)::int from gone
$$;
revoke all on function public.chat_purge() from public, anon, authenticated;

-- Live: new messages reach everyone allowed to read them
alter publication supabase_realtime add table public.chat_messages;

-- "Here" counts ride on private Realtime channels (security audit 2, L3): the app joins chat:<room> with
-- { private: true }, and only a signed-in trader may join General or their own crew's room, and only to say they're
-- there (presence); nobody can broadcast into a room. Turn off "Allow public access" in Realtime settings after the
-- app build that uses private channels is live.
create policy "chat rooms: join your rooms" on realtime.messages for select to authenticated
  using (realtime.topic() = 'chat:general' or realtime.topic() = 'chat:' || coalesce((select public.my_crew()), '-'));
create policy "chat rooms: say you're here" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence'
    and (realtime.topic() = 'chat:general' or realtime.topic() = 'chat:' || coalesce((select public.my_crew()), '-')));

-- ---------- Reports: chat messages too ----------
alter table public.reports add column message_id uuid references public.chat_messages(id) on delete cascade;
create index reports_message on public.reports (message_id) where message_id is not null;
-- Every new report names exactly one post, idea or message (rows already there are left as they are)
alter table public.reports add constraint reports_one_target check (num_nonnulls(post_id, idea_id, message_id) = 1) not valid;

create or replace function public.reports_rate_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.rate_ok(new.user_id, 'report', 20, interval '1 hour') then
    raise exception 'Too many reports in the last hour. Try again later.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end $$;
revoke all on function public.reports_rate_limit() from public, anon, authenticated;
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.reports_rate_limit();

commit;
