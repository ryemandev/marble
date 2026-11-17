-- Voice sessions ("On air"): live, hosted audio sessions inside Community, with LiveKit Cloud carrying the audio.
-- NOT APPLIED. Written 29 October 2026 to the owner's choice (design 3, "On air"; scheduled sessions with a host only;
-- no recording). The research and the designs are in .scratch/research/voice and .scratch/designs/voice.
-- Needs 20261030100000_dms_and_sharing.sql first (staff, is_staff, dm_aal2, dm_who, dm_user_by_handle, dm_i_blocked,
-- dm_has_card_number) and the community migrations (crew_members). Apply it, then deploy the voice edge function and
-- the app build that uses it in the same sitting. The undo is section 23 of ROLLBACK.md.
-- The topic rooms (20261031140000_chat_topic_rooms.sql) can hold sessions too. This file only names their ids, so it
-- doesn't need that one applied first; keep the two room lists the same if either changes.
--
-- The rules, and where each one lives below:
--   * A session is scheduled by the owner (an admin who is staff, with two-step sign-in): a room (General, a topic room,
--     or one crew's room), a title, a start, a length (15 minutes to 4 hours), one to three hosts, and an optional run
--     sheet. At most two sessions may overlap. Sessions in General and the topic rooms are for everyone; crew-room
--     sessions are for that crew (and staff) only.
--   * A host goes on air from 15 minutes before the start. Everyone with a plan can then tune in as a listener. Hosts
--     (and guests a host brings on air) can talk; listeners can't. A session ends when a host ends it, and counts as
--     ended 15 minutes after its scheduled end whatever happens.
--   * Nothing is recorded. No audio, transcript or recording is stored anywhere: these tables hold the schedule,
--     written questions, raised hands, reports and a log of who joined and what hosts did.
--   * Listeners take part in writing: questions (up to 280 characters, three open at once) the room votes up, and a
--     raised hand. A host can mark a question "up next", answered or hidden, and bring its writer on air.
--   * Moderation: a host can mute someone, move a guest back to listening, remove someone from the session, or ban them
--     from voice for 24 hours. Staff (with two-step sign-in) can do all of that in any session, ban for 7 days or for
--     good, and lift bans. Hosts can't act on other hosts or on staff. Every action is logged in voice_log.
--   * Anyone who joined can report someone: the reason, a note, and who was talking at that moment. The owner reads
--     reports with two-step sign-in. Reporting never needs a plan.
--   * The plan: tuning in, asking, voting and raising a hand need a plan or trial (has_access_for). Reporting doesn't.
--   * LiveKit is only ever reached by the voice edge function, which calls voice_join() and voice_mod() here with the
--     service role and signs LiveKit tokens itself. The LiveKit keys never reach the database or the browser.
--   * Live: the database broadcasts {op} only (never content) on private channels 'voice:<session>'; the app reads the
--     session again through voice_state().
--   * Kept: the log 90 days; questions, votes and hands 30 days after the session; sessions 12 months; a resolved report
--     12 months. voice_purge() runs nightly.
--
-- Everything goes through SECURITY DEFINER functions with search_path = '': row security is ON for every new table
-- with no policies (a backstop), grants are revoked from anon and authenticated, and each write is rate-limited
-- through public.rate_ok().

begin;

-- =====================================================================================================================
-- 1. The tables
-- =====================================================================================================================
create table public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  room text not null check (room in ('general', 'futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help', 'OLY', 'NITE', 'PIT')),
  title text not null check (char_length(title) between 3 and 60),
  blurb text check (blurb is null or char_length(blurb) <= 200),
  -- The run sheet: [{ at: 'HH:MM' or null, what }], up to 10 lines; run_at is the line the host is on
  run jsonb not null default '[]'::jsonb check (jsonb_typeof(run) = 'array' and jsonb_array_length(run) <= 10),
  run_at smallint not null default 0 check (run_at between 0 and 10),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  -- The LiveKit room's name: random, so it can't be guessed from anything a trader sees
  lk_room text not null unique default 'v_' || replace(gen_random_uuid()::text, '-', ''),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  live_at timestamptz,
  ended_at timestamptz,
  check (ends_at > starts_at and ends_at <= starts_at + interval '4 hours')
);
create index voice_sessions_starts on public.voice_sessions (starts_at);
comment on table public.voice_sessions is 'Scheduled voice sessions (On air). Written only through voice_schedule() and the host functions.';

-- Who's on air: hosts (scheduled) and guests (brought on air by a host)
create table public.voice_people (
  session_id uuid not null references public.voice_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  added_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create table public.voice_hands (
  session_id uuid not null references public.voice_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  raised_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create table public.voice_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.voice_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 3 and 280),
  state text not null default 'open' check (state in ('open', 'next', 'answered', 'hidden')),
  created_at timestamptz not null default now()
);
create index voice_questions_session on public.voice_questions (session_id);
create table public.voice_votes (
  question_id uuid not null references public.voice_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (question_id, user_id)
);
create table public.voice_bans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  until timestamptz, -- null: for good
  by_user uuid references public.profiles (id) on delete set null,
  session_id uuid references public.voice_sessions (id) on delete set null,
  at timestamptz not null default now()
);
create table public.voice_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.voice_sessions (id) on delete set null,
  reporter uuid references public.profiles (id) on delete set null,
  reported uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('abuse', 'hate', 'sexual', 'scam', 'advice', 'spam', 'other')),
  note text check (note is null or char_length(note) <= 500),
  speaking text[] not null default '{}', -- the handles talking when the report was made (from LiveKit, in the app)
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
-- The audit log: joins, hands, questions, reports and every host or staff action
create table public.voice_log (
  id bigint generated always as identity primary key,
  session_id uuid references public.voice_sessions (id) on delete cascade,
  actor uuid references public.profiles (id) on delete set null,
  target uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('schedule', 'cancel', 'live', 'join', 'ask', 'hand', 'report', 'run', 'question',
    'mute', 'listen', 'speak', 'remove', 'ban', 'unban', 'end')),
  detail text,
  at timestamptz not null default now()
);
create index voice_log_at on public.voice_log (at);
create index voice_log_session on public.voice_log (session_id, actor);

alter table public.voice_sessions enable row level security;
alter table public.voice_people enable row level security;
alter table public.voice_hands enable row level security;
alter table public.voice_questions enable row level security;
alter table public.voice_votes enable row level security;
alter table public.voice_bans enable row level security;
alter table public.voice_reports enable row level security;
alter table public.voice_log enable row level security;
revoke all on table public.voice_sessions from anon, authenticated;
revoke all on table public.voice_people from anon, authenticated;
revoke all on table public.voice_hands from anon, authenticated;
revoke all on table public.voice_questions from anon, authenticated;
revoke all on table public.voice_votes from anon, authenticated;
revoke all on table public.voice_bans from anon, authenticated;
revoke all on table public.voice_reports from anon, authenticated;
revoke all on table public.voice_log from anon, authenticated;

-- =====================================================================================================================
-- 2. Small helpers (callable by the database's own functions only)
-- =====================================================================================================================
-- Where a session is now: scheduled, live, ended or cancelled. Fifteen minutes past its end it's over, whatever happened.
create or replace function public.voice_phase(p_status text, p_ends timestamptz)
returns text language sql stable set search_path = ''
as $$ select case when p_status in ('ended', 'cancelled') then p_status when now() > p_ends + interval '15 minutes' then 'ended' else p_status end $$;
revoke all on function public.voice_phase(text, timestamptz) from public, anon, authenticated;

-- General and the topic rooms are everyone's; a crew room's sessions are that crew's (and staff's)
create or replace function public.voice_can_see(p_room text, p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select p_room not in ('OLY', 'NITE', 'PIT') or public.is_staff(p_user) or exists (select 1 from public.crew_members c where c.user_id = p_user and c.crew = p_room) $$;
revoke all on function public.voice_can_see(text, uuid) from public, anon, authenticated;

create or replace function public.voice_banned(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.voice_bans b where b.user_id = p_user and (b.until is null or b.until > now())) $$;
revoke all on function public.voice_banned(uuid) from public, anon, authenticated;

-- A host of this session (not banned), or staff signed in with two-step sign-in
create or replace function public.voice_host_ok(p_session uuid, p_user uuid, p_aal2 boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (exists (select 1 from public.voice_people p where p.session_id = p_session and p.user_id = p_user and p.role = 'host')
          and not public.voice_banned(p_user))
      or (public.is_staff(p_user) and coalesce(p_aal2, false))
$$;
revoke all on function public.voice_host_ok(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.voice_note(p_session uuid, p_actor uuid, p_target uuid, p_action text, p_detail text default null)
returns void language sql security definer set search_path = ''
as $$ insert into public.voice_log (session_id, actor, target, action, detail) values (p_session, p_actor, p_target, p_action, p_detail) $$;
revoke all on function public.voice_note(uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- A session as the app shows it: never lk_room, never an id of a person
create or replace function public.voice_card(p_session uuid, p_me uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'room', s.room, 'title', s.title, 'blurb', s.blurb, 'run', s.run, 'run_at', s.run_at,
    'starts_at', s.starts_at, 'ends_at', s.ends_at, 'phase', public.voice_phase(s.status, s.ends_at), 'live_at', s.live_at,
    'my_role', (select p.role from public.voice_people p where p.session_id = s.id and p.user_id = p_me),
    'people', coalesce((select jsonb_agg(public.dm_who(p.user_id) || jsonb_build_object('role', p.role) order by p.role desc, p.added_at)
      from public.voice_people p where p.session_id = s.id), '[]'::jsonb))
  from public.voice_sessions s where s.id = p_session
$$;
revoke all on function public.voice_card(uuid, uuid) from public, anon, authenticated;

-- =====================================================================================================================
-- 3. What a trader calls
-- =====================================================================================================================
-- Sessions on now or in the next 7 days that you can see, and what you can do
create or replace function public.voice_sessions_now()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'me', jsonb_build_object('staff', public.is_staff(me), 'admin', exists (select 1 from public.admins a where a.user_id = me),
      'aal2', public.dm_aal2(), 'plan', public.has_access_for(me), 'banned', public.voice_banned(me)),
    'sessions', coalesce((select jsonb_agg(public.voice_card(s.id, me) order by s.starts_at) from public.voice_sessions s
      where public.voice_phase(s.status, s.ends_at) in ('scheduled', 'live') and s.starts_at < now() + interval '7 days'
        and public.voice_can_see(s.room, me)), '[]'::jsonb));
end $$;
revoke all on function public.voice_sessions_now() from public, anon;
grant execute on function public.voice_sessions_now() to authenticated;

-- One session: the card, the questions (yours and the room's, most wanted first), your hand, and for a host the hands
create or replace function public.voice_state(p_session uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); s public.voice_sessions; v_host boolean;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.rate_ok(me, 'voice_read', 240, interval '1 minute') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  select * into s from public.voice_sessions where id = p_session;
  if s.id is null or s.status = 'cancelled' or not public.voice_can_see(s.room, me) then
    raise exception 'This session isn''t open right now.' using errcode = 'P0001';
  end if;
  v_host := public.voice_host_ok(p_session, me, public.dm_aal2());
  return public.voice_card(p_session, me) || jsonb_build_object(
    'host', v_host,
    'questions', coalesce((select jsonb_agg(q.j order by q.rank, q.votes desc, q.at) from (
        select jsonb_build_object('id', x.id, 'body', x.body, 'state', x.state, 'at', x.created_at, 'from', public.dm_who(x.user_id),
          'mine', x.user_id = me, 'votes', (select count(*) from public.voice_votes v where v.question_id = x.id),
          'voted', exists (select 1 from public.voice_votes v where v.question_id = x.id and v.user_id = me)) as j,
          case x.state when 'next' then 0 when 'open' then 1 when 'answered' then 2 else 3 end as rank,
          (select count(*) from public.voice_votes v where v.question_id = x.id) as votes, x.created_at as at
        from public.voice_questions x
        where x.session_id = p_session and (x.state <> 'hidden' or x.user_id = me or v_host) and not public.dm_i_blocked(x.user_id)
        order by 2, 3 desc, 4 limit 60) q), '[]'::jsonb),
    'my_hand', exists (select 1 from public.voice_hands h where h.session_id = p_session and h.user_id = me),
    'hand_count', (select count(*) from public.voice_hands h where h.session_id = p_session),
    'hands', case when v_host then coalesce((select jsonb_agg(public.dm_who(h.user_id) || jsonb_build_object('at', h.raised_at) order by h.raised_at)
      from public.voice_hands h where h.session_id = p_session), '[]'::jsonb) end);
end $$;
revoke all on function public.voice_state(uuid) from public, anon;
grant execute on function public.voice_state(uuid) to authenticated;

-- A written question: from an hour before the start until the end, up to three open at once
create or replace function public.voice_ask(p_session uuid, p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); s public.voice_sessions; v_body text := btrim(coalesce(p_body, '')); v_id uuid;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.has_access_for(me) then raise exception 'Voice sessions are part of your plan.' using errcode = '42501'; end if;
  if public.voice_banned(me) then raise exception 'You can''t take part in voice sessions right now.' using errcode = 'P0001'; end if;
  select * into s from public.voice_sessions where id = p_session;
  if s.id is null or not public.voice_can_see(s.room, me) or public.voice_phase(s.status, s.ends_at) not in ('scheduled', 'live')
     or now() < s.starts_at - interval '1 hour' then
    raise exception 'This session isn''t open right now.' using errcode = 'P0001';
  end if;
  if char_length(v_body) < 3 or char_length(v_body) > 280 then raise exception 'A question is 3 to 280 characters.' using errcode = 'P0001'; end if;
  if public.dm_has_card_number(v_body) then raise exception 'Card numbers can''t be sent.' using errcode = 'P0001'; end if;
  if (select count(*) from public.voice_questions q where q.session_id = p_session and q.user_id = me and q.state in ('open', 'next')) >= 3 then
    raise exception 'You have three questions waiting. Give the host a moment.' using errcode = 'P0001';
  end if;
  if not public.rate_ok(me, 'voice_ask', 5, interval '10 minutes') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  insert into public.voice_questions (session_id, user_id, body) values (p_session, me, v_body) returning id into v_id;
  perform public.voice_note(p_session, me, null, 'ask');
  return v_id;
end $$;
revoke all on function public.voice_ask(uuid, text) from public, anon;
grant execute on function public.voice_ask(uuid, text) to authenticated;

-- Want a question answered (or not any more). Not your own.
create or replace function public.voice_vote(p_question uuid, p_on boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); q public.voice_questions; s public.voice_sessions;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.has_access_for(me) then raise exception 'Voice sessions are part of your plan.' using errcode = '42501'; end if;
  select * into q from public.voice_questions where id = p_question;
  select * into s from public.voice_sessions where id = q.session_id;
  if q.id is null or not public.voice_can_see(s.room, me) or public.voice_phase(s.status, s.ends_at) not in ('scheduled', 'live') or q.state = 'hidden' then
    raise exception 'This session isn''t open right now.' using errcode = 'P0001';
  end if;
  if q.user_id = me then raise exception 'You can''t vote for your own question.' using errcode = 'P0001'; end if;
  if not public.rate_ok(me, 'voice_vote', 120, interval '1 minute') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  if p_on then insert into public.voice_votes values (p_question, me) on conflict do nothing;
  else delete from public.voice_votes where question_id = p_question and user_id = me; end if;
end $$;
revoke all on function public.voice_vote(uuid, boolean) from public, anon;
grant execute on function public.voice_vote(uuid, boolean) to authenticated;

-- Ask to speak, or put your hand down. Only while it's live, and only if you're not already on air.
create or replace function public.voice_hand(p_session uuid, p_up boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); s public.voice_sessions;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not p_up then delete from public.voice_hands where session_id = p_session and user_id = me; return; end if;
  if not public.has_access_for(me) then raise exception 'Voice sessions are part of your plan.' using errcode = '42501'; end if;
  if public.voice_banned(me) then raise exception 'You can''t take part in voice sessions right now.' using errcode = 'P0001'; end if;
  select * into s from public.voice_sessions where id = p_session;
  if s.id is null or not public.voice_can_see(s.room, me) or public.voice_phase(s.status, s.ends_at) <> 'live' then
    raise exception 'This session isn''t on air right now.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.voice_people p where p.session_id = p_session and p.user_id = me) then
    raise exception 'You''re already on air.' using errcode = 'P0001';
  end if;
  if not public.rate_ok(me, 'voice_hand', 10, interval '10 minutes') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  insert into public.voice_hands (session_id, user_id) values (p_session, me) on conflict do nothing;
  perform public.voice_note(p_session, me, null, 'hand');
end $$;
revoke all on function public.voice_hand(uuid, boolean) from public, anon;
grant execute on function public.voice_hand(uuid, boolean) to authenticated;

-- Report someone in a session you joined. No plan needed. "speaking": who was talking at that moment, as the app saw it.
create or replace function public.voice_report(p_session uuid, p_handle text, p_reason text, p_note text default null, p_speaking text[] default '{}')
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v_them uuid := public.dm_user_by_handle(p_handle);
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.voice_log l where l.session_id = p_session and l.actor = me and l.action = 'join' and l.at > now() - interval '24 hours') then
    raise exception 'You can report people in a session you joined.' using errcode = 'P0001';
  end if;
  if v_them is null or v_them = me then raise exception 'No trader has that handle.' using errcode = 'P0001'; end if;
  if p_reason not in ('abuse', 'hate', 'sexual', 'scam', 'advice', 'spam', 'other') then raise exception 'Pick a reason.' using errcode = 'P0001'; end if;
  if not public.rate_ok(me, 'voice_report', 10, interval '1 hour') then raise exception 'Too many reports in the last hour.' using errcode = 'P0001'; end if;
  insert into public.voice_reports (session_id, reporter, reported, reason, note, speaking)
    values (p_session, me, v_them, p_reason, nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      coalesce((select array_agg(left(x, 30)) from unnest(p_speaking[1:6]) x), '{}'));
  perform public.voice_note(p_session, me, v_them, 'report', p_reason);
end $$;
revoke all on function public.voice_report(uuid, text, text, text, text[]) from public, anon;
grant execute on function public.voice_report(uuid, text, text, text, text[]) to authenticated;

-- =====================================================================================================================
-- 4. What a host calls from the app (on air, the run sheet, questions). Moderation goes through the voice function.
-- =====================================================================================================================
create or replace function public.voice_go_live(p_session uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); s public.voice_sessions;
begin
  select * into s from public.voice_sessions where id = p_session;
  if me is null or s.id is null or not public.voice_host_ok(p_session, me, public.dm_aal2()) then
    raise exception 'Only this session''s hosts can do that.' using errcode = '42501';
  end if;
  if public.voice_phase(s.status, s.ends_at) <> 'scheduled' then raise exception 'This session isn''t waiting to start.' using errcode = 'P0001'; end if;
  if now() < s.starts_at - interval '15 minutes' then raise exception 'You can go on air from 15 minutes before the start.' using errcode = 'P0001'; end if;
  update public.voice_sessions set status = 'live', live_at = now() where id = p_session;
  perform public.voice_note(p_session, me, null, 'live');
end $$;
revoke all on function public.voice_go_live(uuid) from public, anon;
grant execute on function public.voice_go_live(uuid) to authenticated;

create or replace function public.voice_run(p_session uuid, p_at integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); s public.voice_sessions;
begin
  select * into s from public.voice_sessions where id = p_session;
  if me is null or s.id is null or not public.voice_host_ok(p_session, me, public.dm_aal2()) then
    raise exception 'Only this session''s hosts can do that.' using errcode = '42501';
  end if;
  if p_at is null or p_at < 0 or p_at >= greatest(jsonb_array_length(s.run), 1) then raise exception 'That isn''t on the run sheet.' using errcode = 'P0001'; end if;
  if not public.rate_ok(me, 'voice_host', 120, interval '1 minute') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  update public.voice_sessions set run_at = p_at where id = p_session;
  perform public.voice_note(p_session, me, null, 'run', p_at::text);
end $$;
revoke all on function public.voice_run(uuid, integer) from public, anon;
grant execute on function public.voice_run(uuid, integer) to authenticated;

-- A question: up next (only one at a time), answered, hidden, or back to open
create or replace function public.voice_question_set(p_question uuid, p_state text)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); q public.voice_questions;
begin
  select * into q from public.voice_questions where id = p_question;
  if me is null or q.id is null or not public.voice_host_ok(q.session_id, me, public.dm_aal2()) then
    raise exception 'Only this session''s hosts can do that.' using errcode = '42501';
  end if;
  if p_state not in ('open', 'next', 'answered', 'hidden') then raise exception 'Pick open, next, answered or hidden.' using errcode = 'P0001'; end if;
  if not public.rate_ok(me, 'voice_host', 120, interval '1 minute') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  if p_state = 'next' then update public.voice_questions set state = 'open' where session_id = q.session_id and state = 'next'; end if;
  update public.voice_questions set state = p_state where id = p_question;
  perform public.voice_note(q.session_id, me, q.user_id, 'question', p_state);
end $$;
revoke all on function public.voice_question_set(uuid, text) from public, anon;
grant execute on function public.voice_question_set(uuid, text) to authenticated;

-- =====================================================================================================================
-- 5. The owner: schedule, cancel, reports, bans (an admin who is staff, signed in with two-step sign-in)
-- =====================================================================================================================
create or replace function public.voice_owner_ok()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() or not public.is_staff(auth.uid()) then raise exception 'Admins only' using errcode = '42501'; end if;
  if not public.dm_aal2() then raise exception 'That needs two-step sign-in. Verify your code first.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.voice_owner_ok() from public, anon, authenticated;

-- p_hosts: one to three handles. p_run: [{ at: 'HH:MM' or null, what }], up to 10 lines of up to 60 characters.
create or replace function public.voice_schedule(p_room text, p_title text, p_starts timestamptz, p_minutes integer,
  p_hosts text[], p_blurb text default null, p_run jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v_id uuid; v_end timestamptz; h text; v_user uuid; v_title text := btrim(coalesce(p_title, '')); l jsonb;
begin
  perform public.voice_owner_ok();
  if p_room is null or p_room not in ('general', 'futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help', 'OLY', 'NITE', 'PIT') then raise exception 'Pick General, a topic room or a crew''s room.' using errcode = 'P0001'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 60 then raise exception 'A title is 3 to 60 characters.' using errcode = 'P0001'; end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then raise exception 'A session runs 15 minutes to 4 hours.' using errcode = 'P0001'; end if;
  if p_starts is null or p_starts < now() - interval '5 minutes' or p_starts > now() + interval '60 days' then
    raise exception 'Pick a start in the next 60 days.' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_hosts), 0) not between 1 and 3 then raise exception 'A session has one to three hosts.' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_run, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_run, '[]'::jsonb)) > 10 then
    raise exception 'A run sheet is up to 10 lines.' using errcode = 'P0001';
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_run, '[]'::jsonb)) loop
    if jsonb_typeof(l) <> 'object' or char_length(btrim(coalesce(l->>'what', ''))) not between 1 and 60
       or (l->>'at' is not null and l->>'at' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
      raise exception 'Each run sheet line is up to 60 characters, with an optional HH:MM time.' using errcode = 'P0001';
    end if;
  end loop;
  v_end := p_starts + make_interval(mins => p_minutes);
  if (select count(*) from public.voice_sessions s where public.voice_phase(s.status, s.ends_at) in ('scheduled', 'live')
      and s.starts_at < v_end and s.ends_at > p_starts) >= 2 then
    raise exception 'Two sessions already run at that time.' using errcode = 'P0001';
  end if;
  insert into public.voice_sessions (room, title, blurb, run, starts_at, ends_at, created_by)
    values (p_room, v_title, nullif(left(btrim(coalesce(p_blurb, '')), 200), ''),
      coalesce((select jsonb_agg(jsonb_build_object('at', x->>'at', 'what', btrim(x->>'what'))) from jsonb_array_elements(p_run) x), '[]'::jsonb),
      p_starts, v_end, me)
    returning id into v_id;
  foreach h in array p_hosts loop
    v_user := public.dm_user_by_handle(h);
    if v_user is null then raise exception 'No trader has the handle %.', h using errcode = 'P0001'; end if;
    if public.voice_banned(v_user) then raise exception '% is banned from voice.', h using errcode = 'P0001'; end if;
    insert into public.voice_people (session_id, user_id, role) values (v_id, v_user, 'host') on conflict do nothing;
  end loop;
  perform public.voice_note(v_id, me, null, 'schedule');
  return v_id;
end $$;
revoke all on function public.voice_schedule(text, text, timestamptz, integer, text[], text, jsonb) from public, anon;
grant execute on function public.voice_schedule(text, text, timestamptz, integer, text[], text, jsonb) to authenticated;

-- Cancel a session that hasn't gone on air (a live one is ended by a host, which closes its LiveKit room too)
create or replace function public.voice_cancel(p_session uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.voice_owner_ok();
  update public.voice_sessions set status = 'cancelled' where id = p_session and status = 'scheduled';
  if not found then raise exception 'Only a session that hasn''t started can be cancelled.' using errcode = 'P0001'; end if;
  perform public.voice_note(p_session, auth.uid(), null, 'cancel');
end $$;
revoke all on function public.voice_cancel(uuid) from public, anon;
grant execute on function public.voice_cancel(uuid) to authenticated;

create or replace function public.voice_reports_open()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.voice_owner_ok();
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'note', r.note, 'speaking', r.speaking, 'at', r.created_at,
      'session', (select s.title from public.voice_sessions s where s.id = r.session_id),
      'from', public.dm_who(r.reporter), 'about', public.dm_who(r.reported),
      'banned', public.voice_banned(r.reported)) order by r.created_at)
    from public.voice_reports r where r.status = 'open'), '[]'::jsonb);
end $$;
revoke all on function public.voice_reports_open() from public, anon;
grant execute on function public.voice_reports_open() to authenticated;

create or replace function public.voice_report_resolve(p_report uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.voice_owner_ok();
  if p_status not in ('actioned', 'dismissed') then raise exception 'Pick actioned or dismissed.' using errcode = 'P0001'; end if;
  update public.voice_reports set status = p_status, resolved_at = now(), resolved_by = auth.uid() where id = p_report and status = 'open';
end $$;
revoke all on function public.voice_report_resolve(uuid, text) from public, anon;
grant execute on function public.voice_report_resolve(uuid, text) to authenticated;

create or replace function public.voice_unban(p_handle text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := public.dm_user_by_handle(p_handle);
begin
  perform public.voice_owner_ok();
  delete from public.voice_bans where user_id = v_user;
  if found then perform public.voice_note(null, auth.uid(), v_user, 'unban'); end if;
end $$;
revoke all on function public.voice_unban(text) from public, anon;
grant execute on function public.voice_unban(text) to authenticated;

-- =====================================================================================================================
-- 6. The voice edge function's two calls (service role only). p_aal2: the caller's token says two-step sign-in.
-- =====================================================================================================================
-- Tuning in: who you are on air ({ room, role, who }), or a refusal in plain words
create or replace function public.voice_join(p_user uuid, p_session uuid, p_aal2 boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s public.voice_sessions; v_role text; v_phase text;
begin
  select * into s from public.voice_sessions where id = p_session;
  if p_user is null or s.id is null or not public.voice_can_see(s.room, p_user) then
    raise exception 'This session isn''t open right now.' using errcode = 'P0001';
  end if;
  if public.voice_banned(p_user) then raise exception 'You can''t take part in voice sessions right now.' using errcode = 'P0001'; end if;
  if not public.has_access_for(p_user) then raise exception 'Voice sessions are part of your plan.' using errcode = '42501'; end if;
  v_role := case when public.is_staff(p_user) and coalesce(p_aal2, false) then 'host'
    else coalesce((select p.role from public.voice_people p where p.session_id = p_session and p.user_id = p_user), 'listener') end;
  v_phase := public.voice_phase(s.status, s.ends_at);
  -- Hosts can come in from 15 minutes before the start to get ready; everyone else once it's on air
  if not (v_phase = 'live' or (v_role = 'host' and v_phase = 'scheduled' and now() >= s.starts_at - interval '15 minutes')) then
    raise exception 'This session isn''t on air yet.' using errcode = 'P0001';
  end if;
  if not public.rate_ok(p_user, 'voice_join', 30, interval '1 hour') then raise exception 'Too many tries. Wait a few minutes.' using errcode = 'P0001'; end if;
  perform public.voice_note(p_session, p_user, null, 'join');
  return jsonb_build_object('room', s.lk_room, 'role', v_role, 'who', public.dm_who(p_user));
end $$;
revoke all on function public.voice_join(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.voice_join(uuid, uuid, boolean) to service_role;

-- A host's action on someone (or "end" on the session): checked, recorded, and returned for the function to carry out
-- in LiveKit. Hosts ban for 24 hours; staff for 1 or 7 days or for good (p_days null).
create or replace function public.voice_mod(p_user uuid, p_session uuid, p_handle text, p_action text, p_days integer, p_aal2 boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s public.voice_sessions; v_them uuid; v_staff boolean := public.is_staff(p_user) and coalesce(p_aal2, false);
begin
  select * into s from public.voice_sessions where id = p_session;
  if p_user is null or s.id is null or not public.voice_host_ok(p_session, p_user, p_aal2) then
    raise exception 'Only this session''s hosts can do that.' using errcode = '42501';
  end if;
  if p_action not in ('mute', 'listen', 'speak', 'remove', 'ban', 'end') then raise exception 'Unknown action.' using errcode = 'P0001'; end if;
  if not public.rate_ok(p_user, 'voice_mod', 60, interval '1 minute') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  if p_action = 'end' then
    update public.voice_sessions set status = 'ended', ended_at = now() where id = p_session and status in ('scheduled', 'live');
    delete from public.voice_hands where session_id = p_session;
    perform public.voice_note(p_session, p_user, null, 'end');
    return jsonb_build_object('room', s.lk_room);
  end if;
  v_them := public.dm_user_by_handle(p_handle);
  if v_them is null then raise exception 'No trader has that handle.' using errcode = 'P0001'; end if;
  if v_them = p_user then raise exception 'You can''t do that to yourself.' using errcode = 'P0001'; end if;
  if not v_staff and (public.is_staff(v_them) or exists (select 1 from public.voice_people p where p.session_id = p_session and p.user_id = v_them and p.role = 'host')) then
    raise exception 'Hosts can''t act on another host.' using errcode = '42501';
  end if;
  if p_action = 'speak' then
    if public.voice_banned(v_them) then raise exception 'They''re banned from voice.' using errcode = 'P0001'; end if;
    insert into public.voice_people (session_id, user_id, role) values (p_session, v_them, 'guest') on conflict do nothing;
  end if;
  if p_action in ('listen', 'remove', 'ban') then delete from public.voice_people where session_id = p_session and user_id = v_them and role = 'guest'; end if;
  if p_action in ('speak', 'remove', 'ban') then delete from public.voice_hands where session_id = p_session and user_id = v_them; end if;
  if p_action = 'ban' then
    if not v_staff and p_days is distinct from 1 then raise exception 'Hosts can ban for 24 hours. Ask Marble staff for longer.' using errcode = '42501'; end if;
    insert into public.voice_bans (user_id, until, by_user, session_id)
      values (v_them, case when p_days in (1, 7) then now() + make_interval(days => p_days) end, p_user, p_session)
      on conflict (user_id) do update set until = excluded.until, by_user = excluded.by_user, session_id = excluded.session_id, at = now();
  end if;
  perform public.voice_note(p_session, p_user, v_them, p_action, case when p_action = 'ban' then coalesce(p_days::text, 'for good') end);
  return jsonb_build_object('room', s.lk_room);
end $$;
revoke all on function public.voice_mod(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.voice_mod(uuid, uuid, text, text, integer, boolean) to service_role;

-- =====================================================================================================================
-- 7. Live: an {op} on a private channel per session when something changes. Never content.
-- =====================================================================================================================
create or replace function public.voice_broadcast()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r record; v_session uuid;
begin
  begin
    if tg_op = 'DELETE' then r := old; else r := new; end if;
    -- One statement per table: a record's fields are looked up when a statement runs, so each reads only its own
    if tg_table_name = 'voice_sessions' then v_session := r.id;
    elsif tg_table_name = 'voice_votes' then select q.session_id into v_session from public.voice_questions q where q.id = r.question_id;
    else v_session := r.session_id;
    end if;
    if v_session is not null then
      perform realtime.send(jsonb_build_object('op', tg_table_name), 'changed', 'voice:' || v_session::text, true);
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public.voice_broadcast() from public, anon, authenticated;
create trigger voice_broadcast after update on public.voice_sessions for each row execute function public.voice_broadcast();
create trigger voice_broadcast after insert or delete on public.voice_people for each row execute function public.voice_broadcast();
create trigger voice_broadcast after insert or delete on public.voice_hands for each row execute function public.voice_broadcast();
create trigger voice_broadcast after insert or update or delete on public.voice_questions for each row execute function public.voice_broadcast();
create trigger voice_broadcast after insert or delete on public.voice_votes for each row execute function public.voice_broadcast();

-- Who may listen: anyone who can see the session while it's scheduled or live, unless banned. Nobody can broadcast
-- into these topics (there's no insert policy), so every event comes from the database.
create or replace function public.voice_can_listen(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare me uuid := auth.uid(); s public.voice_sessions;
begin
  if me is null or p_topic is null or p_topic !~ '^voice:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  select * into s from public.voice_sessions where id = substr(p_topic, 7)::uuid;
  return s.id is not null and public.voice_phase(s.status, s.ends_at) in ('scheduled', 'live')
    and public.voice_can_see(s.room, me) and not public.voice_banned(me);
end $$;
revoke all on function public.voice_can_listen(text) from public, anon;
grant execute on function public.voice_can_listen(text) to authenticated;
create policy "voice: members listen" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select public.voice_can_listen(realtime.topic())));

-- =====================================================================================================================
-- 8. Retention, nightly
-- =====================================================================================================================
create or replace function public.voice_purge()
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer := 0; c integer;
begin
  update public.voice_sessions set status = 'ended', ended_at = coalesce(ended_at, ends_at)
    where status in ('scheduled', 'live') and ends_at < now() - interval '15 minutes';
  delete from public.voice_log where at < now() - interval '90 days'; get diagnostics c = row_count; n := n + c;
  delete from public.voice_questions q using public.voice_sessions s
    where s.id = q.session_id and s.status in ('ended', 'cancelled') and coalesce(s.ended_at, s.ends_at) < now() - interval '30 days'; get diagnostics c = row_count; n := n + c;
  delete from public.voice_hands h using public.voice_sessions s
    where s.id = h.session_id and s.status in ('ended', 'cancelled') and coalesce(s.ended_at, s.ends_at) < now() - interval '30 days';
  delete from public.voice_sessions where status in ('ended', 'cancelled') and coalesce(ended_at, ends_at) < now() - interval '12 months'; get diagnostics c = row_count; n := n + c;
  delete from public.voice_reports where status <> 'open' and resolved_at < now() - interval '12 months'; get diagnostics c = row_count; n := n + c;
  delete from public.voice_bans where until < now() - interval '30 days';
  return n;
end $$;
revoke all on function public.voice_purge() from public, anon, authenticated;

select cron.schedule('voice-purge', '47 3 * * *', 'select public.voice_purge()');

commit;
