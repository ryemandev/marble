-- Private messages (DMs) and sharing Study pages. NOT APPLIED. Written 30 October 2026 to the design and settings the
-- owner approved (.scratch/designs/dms-sharing/README.md, "Yes, use them"). Needs everything before it in this folder
-- (community parts 1-4, study, the security files 180000-180500), all live now.
-- Apply it, then deploy the dm-alerts function and the app build that uses it in the same sitting. The deploy note is
-- .scratch/dms-deploy.md; the undo is section 17 of ROLLBACK.md.
--
-- The approved rules, and where each one lives below:
--   * Messages live in Community → Chat. One conversation per pair of traders.
--   * Anyone can message, but a first message arrives as a REQUEST the other trader accepts or ignores. A request is
--     one message, text first: a card in it (a Study page) is held back until they accept. Ignored or unanswered
--     requests go after 30 days. Who may send me a request: everyone (default), only my crew, or nobody new.
--   * v1 is text, trade cards and Study page cards. No photos. Links are shown as text and never fetched.
--   * Kept 12 months, then deleted by the nightly dm_purge() (scheduled below with pg_cron).
--   * Bodies are ENCRYPTED AT REST: pgcrypto (pgp_sym_encrypt, AES-256) with a key made here and kept in Supabase
--     Vault ('dm_body_key'). dm_seal()/dm_open() are callable by nobody but the database's own functions, and the only
--     functions that call dm_open() check that the caller is one of the two people in the conversation (or, for a
--     report's copy, an admin with two-step sign-in). Not end-to-end: the server can still run the scam check and a
--     moderator can still read a reported message.
--   * No read receipts. last_read_at only drives your own unread counts and is never shown to anyone else.
--   * Block: two-way for messages and shared pages, quiet (the other trader isn't told), and it also hides that
--     person's named posts and chat messages from YOU. Never their anonymous posts: hiding those would tell you which
--     anonymous posts are theirs.
--   * Report: a copy of the reported message and up to 10 before it (exactly what the report sheet showed), sealed,
--     for the owner. The owner reads reported messages only: is_admin() appears nowhere in the read path of
--     conversations, and there is no "browse messages" function.
--   * Staff = public.staff, seeded with the owner's account (handle 'jules', an admin). Staff skip the request step, carry
--     the staff seal (the app draws it from this table, never from a name), and must be signed in with two-step
--     sign-in (aal2) to send, and to read or act on reports.
--   * The plan: starting a conversation, attaching a trade or a page, sharing and saving a copy need a plan or trial
--     (has_access). Reading, replying in text, accepting, ignoring, blocking and reporting keep working after a plan
--     lapses.
--   * Email alerts with no content ("You have a new message on Marble"), batched and rate-limited: dm_alert_batch()
--     for the dm-alerts edge function, run every 15 minutes by pg_cron with a Vault secret (the trial_emails_cron
--     pattern from 20261029130300). At most one email every 6 hours per trader, never for a muted conversation, and
--     off with one switch.
--   * Sharing Study notes: a page, or a whole notebook, with the community (a feed post carrying the page as a card)
--     or with chosen members (a page card in their messages; anyone new gets it as a request, held until they accept).
--     A whole notebook covers only the pages it had when it was shared (study_share_pages is the snapshot). Unsharing
--     closes it everywhere at once: the feed post keeps its text and loses its card. Viewers read through
--     share_view() only: lines, times, key lessons and the lesson, never the page's trade, photos, ids or other
--     pages. Saved copies are on by default and text only.
--   * Account deletion cascades: a deleted trader's messages, conversations (for both people), blocks, shares and
--     settings go with the account; report copies keep the text with the person's id removed.
--
-- Everything a trader does goes through SECURITY DEFINER functions with search_path = '': row security is ON for every
-- new table with no policies for the browser roles (a backstop), grants are revoked from anon and authenticated, the
-- server sets the sender, the time and every card, and each write is rate-limited through public.rate_ok().
-- Realtime: the database broadcasts {id} only on private channels 'dm:<conversation>' and 'inbox:<user>'; the app
-- fetches the message through dm_thread(), so blocks, held cards and retention apply to live messages too.

begin;

-- =====================================================================================================================
-- 1. The key, and sealing a body
-- =====================================================================================================================
-- A random 256-bit key, made once, inside the database. It never leaves Vault: no file, no app, no edge function has it.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'dm_body_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dm_body_key',
      'Encrypts private message bodies and report copies at rest (pgcrypto). Read only by dm_seal() and dm_open().');
  end if;
end $$;

-- Invoker functions on purpose: they can only read Vault when called from inside the database's own SECURITY DEFINER
-- functions. Nobody can call them directly, the service role included (the alert function never sees a message).
create or replace function public.dm_seal(p_text text)
returns bytea language sql volatile set search_path = ''
as $$
  select case when p_text is null then null else extensions.pgp_sym_encrypt(p_text,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'dm_body_key' limit 1), 'cipher-algo=aes256') end
$$;
create or replace function public.dm_open(p_sealed bytea)
returns text language sql stable set search_path = ''
as $$
  select case when p_sealed is null then null else extensions.pgp_sym_decrypt(p_sealed,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'dm_body_key' limit 1)) end
$$;
revoke all on function public.dm_seal(text) from public, anon, authenticated, service_role;
revoke all on function public.dm_open(bytea) from public, anon, authenticated, service_role;

-- =====================================================================================================================
-- 2. Marble staff: the seal
-- =====================================================================================================================
create table public.staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);
comment on table public.staff is 'Marble staff: the accounts that carry the staff seal and skip the request step. Written by the owner in SQL only.';
alter table public.staff enable row level security;
revoke all on table public.staff from anon, authenticated;
-- The owner's account: the admin (the only one). Seeded from admins, not a handle, so it doesn't depend on what the owner's handle is
insert into public.staff (user_id)
  select p.id from public.profiles p join public.admins a on a.user_id = p.id
  on conflict do nothing;

create or replace function public.is_staff(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.staff s where s.user_id = p_user) $$;
revoke all on function public.is_staff(uuid) from public, anon, authenticated;

-- Signed in with a second factor right now (Supabase MFA): the session's assurance level
create or replace function public.dm_aal2()
returns boolean language sql stable set search_path = ''
as $$ select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' $$;
revoke all on function public.dm_aal2() from public, anon, authenticated;

-- =====================================================================================================================
-- 3. Your settings: who may send you a request, and the email alert
-- =====================================================================================================================
alter table public.profile_private
  add column if not exists dm_from text not null default 'everyone' check (dm_from in ('everyone', 'crew', 'nobody')),
  add column if not exists dm_email boolean not null default true;
comment on column public.profile_private.dm_from is 'Who may send a message request: everyone, crew (only my crew) or nobody (no new requests). Staff can always reach a trader.';
comment on column public.profile_private.dm_email is 'Email alerts for new messages (never with what was written). Written through dm_settings().';

-- =====================================================================================================================
-- 4. The tables
-- =====================================================================================================================
create table public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  -- least(a, b) || ':' || greatest(a, b): one conversation per pair of traders
  pair text not null unique check (pair ~ '^[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  -- who asked first; not a foreign key: the conversation is deleted with either person's account anyway
  started_by uuid,
  status text not null default 'request' check (status in ('request', 'open')),
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
comment on table public.dm_threads is 'Private conversations, one per pair. status request until the other trader accepts. Read and written only through the dm_ functions.';
create index dm_threads_started on public.dm_threads (started_by, status);
create index dm_threads_request_age on public.dm_threads (created_at) where status = 'request';

create table public.dm_members (
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- the sender is active from the start; the other is request until they accept (active) or ignore (ignored);
  -- left = "delete conversation" for you only (a new message brings it back, without what came before)
  state text not null check (state in ('active', 'request', 'ignored', 'left')),
  last_read_at timestamptz,   -- your own unread count only; never shown to the other person (no read receipts)
  cleared_at timestamptz,     -- what you deleted: messages up to here are gone for you
  muted boolean not null default false,
  alerted_at timestamptz,     -- the last email alert that covered this conversation
  primary key (thread_id, user_id)
);
create index dm_members_user on public.dm_members (user_id, state);

create table public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sealed bytea,                       -- the body, encrypted (dm_seal); null for a card on its own
  card jsonb check (card is null or (jsonb_typeof(card) = 'object' and card ->> 'type' in ('trade', 'page'))),
  flags text[] not null default '{}', -- the scam check's findings: card, credentials, payment, staff_claim, link
  created_at timestamptz not null default now(),
  check (sealed is not null or card is not null)
);
comment on table public.dm_messages is 'Private messages. The body is encrypted at rest (pgcrypto, key in Vault). Kept 12 months. Cards are built by the server.';
create index dm_messages_thread on public.dm_messages (thread_id, created_at desc);
create index dm_messages_created on public.dm_messages (created_at);
create index dm_messages_user on public.dm_messages (user_id);

create table public.dm_blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index dm_blocks_blocked on public.dm_blocks (blocked);

create table public.dm_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid references public.profiles (id) on delete set null,
  reported uuid references public.profiles (id) on delete set null,
  message_id uuid,                    -- not a foreign key: the copy outlives an unsent message
  reason text not null check (reason in ('scam', 'staff', 'selling', 'abuse', 'other')),
  note text check (note is null or char_length(note) <= 500),
  -- the copy, sealed: [{id, from, at, body, card, flags, reported}], the reported message and up to 10 before it
  sealed bytea not null,
  from_request boolean not null default false,
  reported_profile jsonb not null default '{}'::jsonb,  -- handle, joined, requests in 7 days, times blocked, earlier reports
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  action text check (action is null or action in ('dismiss', 'hide', 'suspend')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.dm_reports is 'Reported private messages: a sealed copy for the owner. The only way staff ever read a DM.';
create index dm_reports_open on public.dm_reports (created_at) where status = 'open';
create index dm_reports_reported on public.dm_reports (reported);
create unique index dm_reports_once on public.dm_reports (reporter, message_id) where status = 'open';

-- "Suspend messaging for 7 days", from a report
create table public.dm_bans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  until timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Email alerts sent, so nobody gets more than one every few hours (kind: message, or report for the owner)
create table public.dm_alert_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('message', 'report')),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- ---------- Sharing Study pages ----------
create table public.study_shares (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  notebook_id uuid not null,
  page_id uuid references public.pages (id) on delete cascade,   -- null: the whole notebook (its pages at the time)
  audience text not null check (audience in ('community', 'members')),
  copies boolean not null default true,                          -- may readers save a copy (text only)
  post_id uuid references public.posts (id) on delete set null,  -- the feed post, for the community
  created_at timestamptz not null default now(),
  revoked_at timestamptz,                                        -- unshared: closed everywhere at once
  foreign key (notebook_id, owner) references public.notebooks (id, user_id) on delete cascade
);
comment on table public.study_shares is 'A Study page or notebook shared with the community or chosen members. Read through share_view() only.';
create unique index study_shares_live on public.study_shares (notebook_id, coalesce(page_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index study_shares_owner on public.study_shares (owner);
-- The snapshot: the pages a share covers, numbered in the notebook's order when it was shared
create table public.study_share_pages (
  share_id uuid not null references public.study_shares (id) on delete cascade,
  page_id uuid not null references public.pages (id) on delete cascade,
  n int not null check (n between 1 and 9999),
  primary key (share_id, page_id)
);
create table public.study_share_members (
  share_id uuid not null references public.study_shares (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (share_id, user_id)
);
create index study_share_members_user on public.study_share_members (user_id);
create table public.study_share_reads (       -- "41 reads": one row per reader
  share_id uuid not null references public.study_shares (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (share_id, user_id)
);
create table public.study_share_saves (       -- "6 saved copies", and "you saved a copy of page 6"
  share_id uuid references public.study_shares (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  page_id uuid references public.pages (id) on delete set null,          -- the page it was copied from
  copy_page_id uuid not null references public.pages (id) on delete cascade,
  n int,
  saved_at timestamptz not null default now(),
  primary key (user_id, copy_page_id)
);
create index study_share_saves_share on public.study_share_saves (share_id);

-- A feed post can carry a share: the page card, built when the feed is read
alter table public.posts add column if not exists share_id uuid references public.study_shares (id) on delete set null;
create index if not exists posts_share on public.posts (share_id) where share_id is not null;

-- =====================================================================================================================
-- 5. Row security: on, and no policies for the browser roles. Nobody reads or writes these tables directly.
-- =====================================================================================================================
alter table public.dm_threads enable row level security;
alter table public.dm_members enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_blocks enable row level security;
alter table public.dm_reports enable row level security;
alter table public.dm_bans enable row level security;
alter table public.dm_alert_log enable row level security;
alter table public.study_shares enable row level security;
alter table public.study_share_pages enable row level security;
alter table public.study_share_members enable row level security;
alter table public.study_share_reads enable row level security;
alter table public.study_share_saves enable row level security;
revoke all on table public.dm_threads, public.dm_members, public.dm_messages, public.dm_blocks, public.dm_reports,
  public.dm_bans, public.dm_alert_log, public.study_shares, public.study_share_pages, public.study_share_members,
  public.study_share_reads, public.study_share_saves from anon, authenticated;
-- The paywall, as a second lock: starting a conversation, sharing and saving a copy need a plan. The functions check
-- has_access themselves; these RESTRICTIVE policies keep it true if a grant is ever added by mistake.
create policy "paid: start a conversation" on public.dm_threads as restrictive for insert to authenticated with check ((select public.has_access()));
create policy "paid: share" on public.study_shares as restrictive for insert to authenticated with check ((select public.has_access()));
create policy "paid: save a copy" on public.study_share_saves as restrictive for insert to authenticated with check ((select public.has_access()));

-- =====================================================================================================================
-- 6. Small helpers (internal: no browser role can call them)
-- =====================================================================================================================
create or replace function public.blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.dm_blocks x
                  where (x.blocker = p_a and x.blocked = p_b) or (x.blocker = p_b and x.blocked = p_a))
$$;
revoke all on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- Have I blocked this trader? Only ever your own blocks. Used by the chat policy below, so it's callable by traders.
create or replace function public.dm_i_blocked(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.dm_blocks x where x.blocker = (select auth.uid()) and x.blocked = p_user)
$$;
revoke all on function public.dm_i_blocked(uuid) from public, anon;
grant execute on function public.dm_i_blocked(uuid) to authenticated;

-- A trader as the app shows them: handle, avatar, crew and the staff seal. Never an id or an email.
create or replace function public.dm_who(p_user uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('handle', pr.handle, 'avatar', coalesce(pr.avatar_url, pr.avatar_art),
    'crew', (select c.crew from public.crew_members c where c.user_id = pr.id), 'staff', public.is_staff(pr.id))
  from public.profiles pr where pr.id = p_user
$$;
revoke all on function public.dm_who(uuid) from public, anon, authenticated;

-- citext's own = (search_path is empty, so a bare = would compare as case-sensitive text: "Kenji" wouldn't find kenji)
create or replace function public.dm_user_by_handle(p_handle text)
returns uuid language sql stable security definer set search_path = ''
as $$ select pr.id from public.profiles pr where pr.handle operator(extensions.=) btrim(ltrim(btrim(coalesce(p_handle, '')), '@'))::extensions.citext $$;
revoke all on function public.dm_user_by_handle(text) from public, anon, authenticated;

-- ---------- The scam check (warns, never decides) ----------
-- Card numbers are refused outright: a Luhn-valid run of 13 to 19 digits (spaces and dashes allowed). The same rule is
-- in src/views/community/dms.js (hasCardNumber), and tests/dms.test.js keeps the two the same.
create or replace function public.dm_has_card_number(p_body text)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare r text[]; d text; s int; x int; i int;
begin
  for r in select regexp_matches(coalesce(p_body, ''), '(?:[0-9][ -]?){12,18}[0-9]', 'g') loop
    d := regexp_replace(r[1], '[^0-9]', '', 'g');
    s := 0;
    for i in 1..length(d) loop
      x := substr(d, length(d) - i + 1, 1)::int;
      if i % 2 = 0 then x := x * 2; if x > 9 then x := x - 9; end if; end if;
      s := s + x;
    end loop;
    if s % 10 = 0 then return true; end if;
  end loop;
  return false;
end $$;
revoke all on function public.dm_has_card_number(text) from public, anon, authenticated;

-- Flags only show, as a calm warning, on a message request. No account is ever actioned by this check: a person reads
-- every report. The patterns are the ones in src/views/community/dms.js (FLAG_RULES); the test checks each is here.
create or replace function public.dm_flags(p_body text, p_sender uuid)
returns text[] language plpgsql stable security definer set search_path = ''
as $$
declare f text[] := '{}'; b text := lower(coalesce(p_body, ''));
begin
  if b = '' then return f; end if;
  if b ~ '(card (details|number|no)|cvv|cvc|security code|expiry date|sort code|bank details|account number|iban)' then f := f || 'card'::text; end if;
  if b ~ '(password|passcode|one.time code|verification code|login code|2fa|seed phrase|recovery phrase|private key)' then f := f || 'credentials'::text; end if;
  if b ~ '(gift ?cards?|crypto wallet|wallet address|send (me )?(usdt|btc|eth|crypto)|processing fee|release fee|unlock fee|pay (a|the) fee|paypal\.me|cash ?app)' then f := f || 'payment'::text; end if;
  if not public.is_staff(p_sender) and b ~ '(\mjules\M|marble (team|staff|support|admin)|from marble|on behalf of marble)' then f := f || 'staff_claim'::text; end if;
  if b ~ '[a-z0-9-]+\.[a-z]{2,}(/|\M)' then f := f || 'link'::text; end if;
  return f;
end $$;
revoke all on function public.dm_flags(text, uuid) from public, anon, authenticated;

-- =====================================================================================================================
-- 7. Shared pages: who may read one, and the card it travels as
-- =====================================================================================================================
create or replace function public.can_view_share(p_share uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1 from public.study_shares s
     where s.id = p_share and s.revoked_at is null
       and (s.owner = p_viewer
            or (not public.blocked_between(s.owner, p_viewer)
                and (s.audience = 'community'
                     or exists (select 1 from public.study_share_members m where m.share_id = s.id and m.user_id = p_viewer)))))
$$;
revoke all on function public.can_view_share(uuid, uuid) from public, anon, authenticated;

-- A page's lines as a reader gets them: only { t, text, key }, tidied, whatever the owner's row holds (a page written
-- through the API with odd values can't break anyone else's feed)
create or replace function public.share_lines(p_lines jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      't', case when jsonb_typeof(e.x -> 't') = 'number' then least(greatest((e.x ->> 't')::numeric, 0), 86400)::int end,
      'text', left(e.x ->> 'text', 20000),
      'key', coalesce((e.x -> 'key') = 'true'::jsonb, false)) order by e.ord), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) with ordinality as e(x, ord)
  where jsonb_typeof(e.x) = 'object' and jsonb_typeof(e.x -> 'text') = 'string' and btrim(e.x ->> 'text') <> ''
$$;
revoke all on function public.share_lines(jsonb) from public, anon, authenticated;

-- The pages a share covers now: its snapshot, minus any the owner has since deleted, in order (i = 1, 2, …)
create or replace function public.share_pages_now(p_share uuid)
returns table (i bigint, page_id uuid, n int)
language sql stable security definer set search_path = ''
as $$
  select row_number() over (order by sp.n, sp.page_id), sp.page_id, sp.n
    from public.study_share_pages sp join public.pages p on p.id = sp.page_id
   where sp.share_id = p_share
$$;
revoke all on function public.share_pages_now(uuid) from public, anon, authenticated;

-- The card: built when it's read, so editing the page updates it and unsharing (or a block) empties it. Up to three
-- lines: the key lessons first, then the page's first lines, shown in page order (leafLines() in dms.js is the same).
create or replace function public.share_card(p_share uuid, p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare s public.study_shares; v_nb text; v_owner text; v_pid uuid; v_n int; v_of int; pg public.pages;
begin
  if p_share is null then return null; end if;
  select * into s from public.study_shares where id = p_share;
  if s.id is null then return jsonb_build_object('type', 'page', 'share', p_share, 'gone', true); end if;
  select nb.title into v_nb from public.notebooks nb where nb.id = s.notebook_id;
  select pr.handle::text into v_owner from public.profiles pr where pr.id = s.owner;
  if not public.can_view_share(p_share, p_viewer) then
    return jsonb_build_object('type', 'page', 'share', p_share, 'gone', true, 'owner', v_owner, 'notebook', v_nb, 'whole', s.page_id is null);
  end if;
  select count(*)::int into v_of from public.share_pages_now(p_share);
  select q.page_id, q.n into v_pid, v_n from public.share_pages_now(p_share) q order by q.i limit 1;
  if v_pid is null then
    return jsonb_build_object('type', 'page', 'share', p_share, 'gone', true, 'owner', v_owner, 'notebook', v_nb, 'whole', s.page_id is null);
  end if;
  select * into pg from public.pages where id = v_pid;
  return jsonb_build_object(
    'type', 'page', 'share', p_share, 'gone', false, 'owner', v_owner, 'notebook', v_nb, 'whole', s.page_id is null,
    'n', v_n, 'of', v_of, 'title', pg.title, 'lesson', pg.video_title, 'mine', s.owner = p_viewer,
    'lines', (select coalesce(jsonb_agg(jsonb_build_array(q.t, q.text, q.k) order by q.ord), '[]'::jsonb) from (
        select e.ord, (e.l ->> 't')::int as t, left(e.l ->> 'text', 140) as text, (e.l ->> 'key')::boolean as k
          from jsonb_array_elements(public.share_lines(pg.lines)) with ordinality as e(l, ord)
         order by k desc, e.ord limit 3) q),
    'count', jsonb_array_length(public.share_lines(pg.lines)),
    'keys', (select count(*) from jsonb_array_elements(public.share_lines(pg.lines)) e(l) where (e.l ->> 'key')::boolean));
exception when others then
  -- a card never breaks the feed or a conversation it sits in
  return jsonb_build_object('type', 'page', 'share', p_share, 'gone', true);
end $$;
revoke all on function public.share_card(uuid, uuid) from public, anon, authenticated;

-- What a message's card shows the person reading it
create or replace function public.dm_card_out(p_card jsonb, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when p_card is null then null
              when p_card ->> 'type' = 'page' then public.share_card((p_card ->> 'share')::uuid, p_viewer)
              else p_card end
$$;
revoke all on function public.dm_card_out(jsonb, uuid) from public, anon, authenticated;

-- =====================================================================================================================
-- 8. Starting and sending (internal steps; the traders' functions are in section 9)
-- =====================================================================================================================
-- The conversation between two traders: the one there is (writing back to a request accepts it; a conversation you
-- deleted comes back), or a new one under the request rules. Raises P0001 with words the app shows as they are.
create or replace function public.dm_thread_for(p_me uuid, p_to uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_pair text;
  v_t uuid;
  v_staff boolean := public.is_staff(p_me);
  v_from text;
  v_u auth.users;
  v_my_crew text;
  v_their_crew text;
begin
  if p_me is null or p_to is null or p_me = p_to then raise exception 'Choose someone to message.' using errcode = 'P0001'; end if;
  -- A block either way reads the same as "not taking new messages": the other trader is never told
  if public.blocked_between(p_me, p_to) then raise exception 'This trader isn''t taking new messages.' using errcode = 'P0001'; end if;
  v_pair := least(p_me, p_to)::text || ':' || greatest(p_me, p_to)::text;
  select t.id into v_t from public.dm_threads t where t.pair = v_pair for update;
  if v_t is not null then
    -- The one there is: dm_post() (always called next) brings you back into it, and writing back to a request accepts it
    return v_t;
  end if;

  -- A new conversation: a plan, a confirmed email, their setting, and the request limits
  if not public.has_access_for(p_me) then
    raise exception 'Starting a conversation is part of your Marble plan. Replies in your conversations still work.' using errcode = 'P0001';
  end if;
  select * into v_u from auth.users where id = p_me;
  if v_u.email_confirmed_at is null then raise exception 'Confirm your email first.' using errcode = 'P0001'; end if;
  if not v_staff then
    select pp.dm_from into v_from from public.profile_private pp where pp.id = p_to;
    v_my_crew := (select c.crew from public.crew_members c where c.user_id = p_me);
    v_their_crew := (select c.crew from public.crew_members c where c.user_id = p_to);
    if coalesce(v_from, 'everyone') = 'nobody'
       or (v_from = 'crew' and (v_their_crew is null or v_my_crew is distinct from v_their_crew)) then
      raise exception 'This trader isn''t taking new messages.' using errcode = 'P0001';
    end if;
    -- New accounts start slowly: 3 new conversations a day for the first 14 days, then 10
    if not public.rate_ok(p_me, 'dm_request', case when v_u.created_at > now() - interval '14 days' then 3 else 10 end, interval '1 day') then
      raise exception 'That''s today''s new conversations. Try again tomorrow.' using errcode = 'P0001';
    end if;
    -- And never more than 20 waiting for an answer at once
    if (select count(*) from public.dm_threads t where t.started_by = p_me and t.status = 'request') >= 20 then
      raise exception 'Wait for some of your requests to be answered first.' using errcode = 'P0001';
    end if;
  end if;
  -- Staff skip the request step
  insert into public.dm_threads (pair, started_by, status) values (v_pair, p_me, case when v_staff then 'open' else 'request' end)
    on conflict (pair) do nothing returning id into v_t;
  if v_t is null then  -- the other trader started one at the same moment
    select t.id into v_t from public.dm_threads t where t.pair = v_pair;
    return v_t;
  end if;
  insert into public.dm_members (thread_id, user_id, state) values
    (v_t, p_me, 'active'), (v_t, p_to, case when v_staff then 'active' else 'request' end);
  return v_t;
end $$;
revoke all on function public.dm_thread_for(uuid, uuid) from public, anon, authenticated;

-- One message into a conversation. The server sets the sender, the time, the card and the flags; the body is sealed.
create or replace function public.dm_post(p_me uuid, p_thread uuid, p_body text, p_card jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_state text;
  v_status text;
  v_starter uuid;
  v_other uuid;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_id uuid;
  v_at timestamptz;
begin
  select m.state into v_state from public.dm_members m where m.thread_id = p_thread and m.user_id = p_me;
  if v_state is null then raise exception 'This conversation isn''t open to you.' using errcode = 'P0001'; end if;
  select t.status, t.started_by into v_status, v_starter from public.dm_threads t where t.id = p_thread for update;
  select m.user_id into v_other from public.dm_members m where m.thread_id = p_thread and m.user_id <> p_me;
  if v_other is null then raise exception 'This conversation has ended.' using errcode = 'P0001'; end if;
  -- Writing in a conversation you deleted (or a request you ignored) brings it back. Writing back to a request accepts
  -- it, whatever you did with it first; only the person who asked can't (their side is the request rule below).
  if v_state <> 'active' then
    update public.dm_members set state = 'active' where thread_id = p_thread and user_id = p_me;
  end if;
  if v_status = 'request' and v_starter is distinct from p_me then
    update public.dm_threads set status = 'open' where id = p_thread;
    v_status := 'open';
  end if;
  if public.blocked_between(p_me, v_other) then raise exception 'This message couldn''t be sent.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.dm_bans b where b.user_id = p_me and b.until > now()) then
    raise exception 'Messaging is paused on your account for now. Email support@example.com if you think that''s wrong.' using errcode = 'P0001';
  end if;
  -- A stolen password alone can't speak as Marble
  if public.is_staff(p_me) and not public.dm_aal2() then
    raise exception 'Staff accounts send with two-step sign-in on. Verify your code in Admin first.' using errcode = 'P0001';
  end if;
  if v_body is null and p_card is null then raise exception 'Write a message first.' using errcode = 'P0001'; end if;
  if char_length(v_body) > 2000 then raise exception 'Messages can be up to 2,000 characters.' using errcode = 'P0001'; end if;
  if public.dm_has_card_number(v_body) then
    raise exception 'For your safety, card numbers can''t be sent in messages.' using errcode = 'P0001';
  end if;
  -- Text replies work without a plan; a trade or a page is sharing, which needs one
  if p_card is not null and not public.has_access_for(p_me) then
    raise exception 'Sharing a trade or a page is part of your Marble plan. Text replies still work.' using errcode = 'P0001';
  end if;
  -- A request is one message until they accept
  if v_status = 'request' and v_starter = p_me
     and exists (select 1 from public.dm_messages x where x.thread_id = p_thread and x.user_id = p_me) then
    raise exception 'You can send more once they accept.' using errcode = 'P0001';
  end if;
  if not public.rate_ok(p_me, 'dm', 20, interval '1 minute') or not public.rate_ok(p_me, 'dm_day', 1000, interval '1 day') then
    raise exception 'Slow down a little: too many messages at once.' using errcode = 'P0001';
  end if;
  insert into public.dm_messages (thread_id, user_id, sealed, card, flags)
    values (p_thread, p_me, public.dm_seal(v_body), p_card, public.dm_flags(v_body, p_me))
    returning id, created_at into v_id, v_at;
  update public.dm_threads set last_at = v_at where id = p_thread;
  -- If they'd deleted it, it comes back to them: as a request while it still is one (never straight into their
  -- conversations, where a card isn't held and the scam warning doesn't show)
  update public.dm_members set state = case when v_status = 'request' then 'request' else 'active' end
   where thread_id = p_thread and user_id = v_other and state = 'left';
  update public.dm_members set last_read_at = v_at where thread_id = p_thread and user_id = p_me;
  return jsonb_build_object('id', v_id, 'thread', p_thread, 'mine', true, 'body', v_body,
    'card', public.dm_card_out(p_card, p_me), 'held', null, 'flags', '[]'::jsonb, 'at', v_at);
end $$;
revoke all on function public.dm_post(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.dm_block_user(p_me uuid, p_other uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_me is null or p_other is null or p_me = p_other then return; end if;
  insert into public.dm_blocks (blocker, blocked) values (p_me, p_other) on conflict do nothing;
  -- The conversation leaves the blocker's list
  update public.dm_members m set state = 'left'
    from public.dm_threads t
   where t.id = m.thread_id and m.user_id = p_me and t.pair = least(p_me, p_other)::text || ':' || greatest(p_me, p_other)::text;
  -- Pages shared between the two close (community shares close too: can_view_share checks blocks both ways)
  delete from public.study_share_members sm using public.study_shares s
   where s.id = sm.share_id and ((s.owner = p_me and sm.user_id = p_other) or (s.owner = p_other and sm.user_id = p_me));
end $$;
revoke all on function public.dm_block_user(uuid, uuid) from public, anon, authenticated;

-- =====================================================================================================================
-- 9. What traders call
-- =====================================================================================================================

-- ---------- The inbox: your conversations and your requests ----------
create or replace function public.dm_inbox()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v jsonb;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.rate_ok(me, 'dm_inbox', 120, interval '1 minute') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  with mine as (
    select m.thread_id, m.state, m.muted, m.last_read_at, m.cleared_at, t.status, t.started_by, t.last_at, o.user_id as other,
           greatest(coalesce(m.cleared_at, '-infinity'::timestamptz), now() - interval '12 months') as floor_at
      from public.dm_members m
      join public.dm_threads t on t.id = m.thread_id
      join public.dm_members o on o.thread_id = m.thread_id and o.user_id <> me
     where m.user_id = me and m.state in ('active', 'request')
       and not public.blocked_between(me, o.user_id)
     order by t.last_at desc
     limit 200
  ), listed as (
    select x.*,
      -- the newest line (a request's one message in full, for the Requests screen; links in it never open)
      (select jsonb_build_object('id', l.id, 'body', left(public.dm_open(l.sealed), case when x.state = 'request' then 2000 else 160 end),
                'mine', l.user_id = me, 'at', l.created_at, 'card', l.card ->> 'type')
         from public.dm_messages l where l.thread_id = x.thread_id and l.created_at > x.floor_at
        order by l.created_at desc limit 1) as last,
      (select count(*) from public.dm_messages u where u.thread_id = x.thread_id and u.user_id <> me
          and u.created_at > greatest(x.floor_at, coalesce(x.last_read_at, '-infinity'::timestamptz))) as unread,
      (select coalesce(array_agg(distinct f), '{}'::text[]) from public.dm_messages u, unnest(u.flags) as f
        where u.thread_id = x.thread_id and u.user_id <> me) as flags,
      exists (select 1 from public.dm_messages u where u.thread_id = x.thread_id and u.user_id <> me and u.card is not null) as has_card
    from mine x
  )
  select jsonb_build_object(
    'me', jsonb_build_object('staff', public.is_staff(me), 'aal2', public.dm_aal2(), 'plan', public.has_access_for(me),
       'from', coalesce((select pp.dm_from from public.profile_private pp where pp.id = me), 'everyone'),
       'email', coalesce((select pp.dm_email from public.profile_private pp where pp.id = me), true)),
    'threads', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.thread_id, 'status', r.status, 'state', r.state, 'muted', r.muted,
        'waiting', r.status = 'request' and r.started_by = me,
        'with', public.dm_who(r.other) || jsonb_build_object('since', (select date_trunc('day', u.created_at) from auth.users u where u.id = r.other)),
        'last', r.last, 'unread', r.unread,
        -- the scam check's warning and the held card show on a request only
        'flags', case when r.state = 'request' then to_jsonb(r.flags) else '[]'::jsonb end,
        'held', r.state = 'request' and r.has_card,
        'at', r.last_at) order by r.last_at desc)
      from listed r where r.last is not null), '[]'::jsonb))
  into v;
  return v;
end $$;
revoke all on function public.dm_inbox() from public, anon;
grant execute on function public.dm_inbox() to authenticated;

-- The count beside Community and Chat: unread messages in conversations you haven't muted, and requests waiting
create or replace function public.dm_unread()
returns integer language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then return 0; end if;
  if not public.rate_ok(me, 'dm_poll', 120, interval '1 minute') then return 0; end if;
  select coalesce(sum(case when m.state = 'request' then 1 else (
           select count(*) from public.dm_messages u where u.thread_id = m.thread_id and u.user_id <> me
              and u.created_at > greatest(coalesce(m.last_read_at, '-infinity'::timestamptz), coalesce(m.cleared_at, '-infinity'::timestamptz), now() - interval '12 months')) end), 0)::int
    into n
    from public.dm_members m join public.dm_members o on o.thread_id = m.thread_id and o.user_id <> me
   where m.user_id = me and (m.state = 'request' or (m.state = 'active' and not m.muted))
     and not public.blocked_between(me, o.user_id)
     and exists (select 1 from public.dm_messages x where x.thread_id = m.thread_id and x.created_at > now() - interval '12 months');
  return n;
end $$;
revoke all on function public.dm_unread() from public, anon;
grant execute on function public.dm_unread() to authenticated;

-- ---------- One conversation: the only way a message is read ----------
-- p_before: older messages (scrolling up). p_after: newer ones (a live message, or coming back to the tab).
-- While YOU are looking at a request: text only, the card held back, links shown as text by the app. is_admin() is
-- deliberately not checked anywhere here: staff can't read a conversation they aren't in.
create or replace function public.dm_thread(p_thread uuid, p_before timestamptz default null, p_after timestamptz default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  m public.dm_members;
  t public.dm_threads;
  v_other uuid;
  v_req boolean;
  v_floor timestamptz;
  v_msgs jsonb;
  v_oldest timestamptz;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.rate_ok(me, 'dm_read', 240, interval '1 minute') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  select * into m from public.dm_members where thread_id = p_thread and user_id = me;
  if m.thread_id is null or m.state not in ('active', 'request') then
    raise exception 'This conversation isn''t open to you.' using errcode = 'P0001';
  end if;
  select * into t from public.dm_threads where id = p_thread;
  select x.user_id into v_other from public.dm_members x where x.thread_id = p_thread and x.user_id <> me;
  v_req := m.state = 'request';
  v_floor := greatest(coalesce(m.cleared_at, '-infinity'::timestamptz), now() - interval '12 months');
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'mine', p.user_id = me, 'body', public.dm_open(p.sealed),
           'card', case when v_req and p.user_id <> me then null else public.dm_card_out(p.card, me) end,
           'held', case when v_req and p.user_id <> me and p.card is not null then p.card ->> 'type' end,
           'flags', case when t.status = 'request' and p.user_id <> me then to_jsonb(p.flags) else '[]'::jsonb end,
           'at', p.created_at) order by p.created_at), '[]'::jsonb),
         min(p.created_at)
    into v_msgs, v_oldest
    from (select x.* from public.dm_messages x
           where x.thread_id = p_thread and x.created_at > v_floor
             and (p_before is null or x.created_at < p_before)
             and (p_after is null or x.created_at > p_after)
           order by x.created_at desc limit 60) p;
  -- Opening the newest messages reads them (for your own counts only)
  if p_before is null then update public.dm_members set last_read_at = now() where thread_id = p_thread and user_id = me; end if;
  return jsonb_build_object(
    'thread', jsonb_build_object('id', t.id, 'status', t.status, 'state', m.state, 'muted', m.muted,
      'waiting', t.status = 'request' and t.started_by = me, 'since', t.created_at,
      'with', public.dm_who(v_other) || jsonb_build_object('since', (select date_trunc('day', u.created_at) from auth.users u where u.id = v_other))),
    'messages', v_msgs,
    'more', p_after is null and v_oldest is not null and exists (
      select 1 from public.dm_messages x where x.thread_id = p_thread and x.created_at > v_floor and x.created_at < v_oldest));
end $$;
revoke all on function public.dm_thread(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.dm_thread(uuid, timestamptz, timestamptz) to authenticated;

-- ---------- A trader's card (tap a name): where a conversation starts ----------
create or replace function public.dm_profile(p_handle text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v_id uuid; v_t uuid; v_state text; v_status text; v_from text; v_open boolean; pr public.profiles;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.rate_ok(me, 'dm_lookup', 120, interval '1 hour') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  v_id := public.dm_user_by_handle(p_handle);
  if v_id is null then raise exception 'No trader has that handle.' using errcode = 'P0001'; end if;
  select * into pr from public.profiles where id = v_id;
  select t.id, t.status into v_t, v_status from public.dm_threads t where t.pair = least(me, v_id)::text || ':' || greatest(me, v_id)::text;
  select x.state into v_state from public.dm_members x where x.thread_id = v_t and x.user_id = me;
  select pp.dm_from into v_from from public.profile_private pp where pp.id = v_id;
  v_open := v_id <> me and not public.blocked_between(me, v_id) and (public.is_staff(me)
    or coalesce(v_from, 'everyone') = 'everyone'
    or (v_from = 'crew' and (select c.crew from public.crew_members c where c.user_id = v_id) is not null
        and (select c.crew from public.crew_members c where c.user_id = v_id) is not distinct from (select c.crew from public.crew_members c where c.user_id = me)));
  return public.dm_who(v_id) || jsonb_build_object(
    'bio', left(coalesce(pr.bio, ''), 200), 'cover', pr.cover, 'mine', v_id = me,
    'since', (select date_trunc('month', u.created_at) from auth.users u where u.id = v_id),
    'thread', case when v_state in ('active', 'request', 'left') then v_t end, 'state', v_state, 'status', v_status,
    'open', v_open or (v_t is not null and v_state is not null and not public.blocked_between(me, v_id)),
    'blocked', public.dm_i_blocked(v_id));
end $$;
revoke all on function public.dm_profile(text) from public, anon;
grant execute on function public.dm_profile(text) to authenticated;

-- ---------- Starting, sending ----------
create or replace function public.dm_start(p_handle text, p_body text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v_to uuid; v_t uuid;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.rate_ok(me, 'dm_lookup', 120, interval '1 hour') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  v_to := public.dm_user_by_handle(p_handle);
  if v_to is null then raise exception 'No trader has that handle.' using errcode = 'P0001'; end if;
  v_t := public.dm_thread_for(me, v_to);
  return jsonb_build_object('thread', v_t, 'message', public.dm_post(me, v_t, p_body, null));
end $$;
revoke all on function public.dm_start(text, text) from public, anon;
grant execute on function public.dm_start(text, text) to authenticated;

-- p_trade: one of your trades, as the server's card (R and rules kept, never dollars). p_share: one of your live shares
-- that the other trader can read, as a page card.
create or replace function public.dm_send(p_thread uuid, p_body text, p_trade uuid default null, p_share uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v_other uuid; v_card jsonb;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select x.user_id into v_other from public.dm_members x where x.thread_id = p_thread and x.user_id <> me;
  if p_trade is not null then
    v_card := public.trade_card(me, jsonb_build_object('id', p_trade));
    if v_card is null then raise exception 'That trade isn''t in your journal.' using errcode = 'P0001'; end if;
    v_card := jsonb_build_object('type', 'trade') || v_card;
  elsif p_share is not null then
    if not exists (select 1 from public.study_shares s where s.id = p_share and s.owner = me and s.revoked_at is null
                    and (s.audience = 'community' or exists (select 1 from public.study_share_members x where x.share_id = s.id and x.user_id = v_other))) then
      raise exception 'Share the page with them first.' using errcode = 'P0001';
    end if;
    v_card := jsonb_build_object('type', 'page', 'share', p_share);
  end if;
  return public.dm_post(me, p_thread, p_body, v_card);
end $$;
revoke all on function public.dm_send(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.dm_send(uuid, text, uuid, uuid) to authenticated;

-- ---------- Requests, deleting, muting, unsending ----------
create or replace function public.dm_accept(p_thread uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.dm_members set state = 'active', last_read_at = now()
   where thread_id = p_thread and user_id = me and state in ('request', 'ignored');
  if found then update public.dm_threads set status = 'open' where id = p_thread; end if;
end $$;

-- Ignoring is silent: the sender isn't told, and the request is deleted after 30 days
create or replace function public.dm_ignore(p_thread uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.dm_members set state = 'ignored' where thread_id = p_thread and user_id = me and state = 'request';
end $$;

-- "Delete conversation": for you only. When both people have deleted it, it's gone.
create or replace function public.dm_leave(p_thread uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.dm_members set state = 'left', cleared_at = now() where thread_id = p_thread and user_id = me;
  -- (only your own conversation: never someone else's that both of them have left)
  if found and not exists (select 1 from public.dm_members x where x.thread_id = p_thread and x.state <> 'left') then
    delete from public.dm_threads where id = p_thread;
  end if;
end $$;

create or replace function public.dm_mute(p_thread uuid, p_on boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.dm_members set muted = coalesce(p_on, false) where thread_id = p_thread and user_id = me;
end $$;

-- Unsend your own message, any time. A report already made keeps its copy.
create or replace function public.dm_unsend(p_message uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v_t uuid;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  delete from public.dm_messages where id = p_message and user_id = me returning thread_id into v_t;
  if v_t is not null then
    -- Unsending a request's one message withdraws the request. Asking again is a new request, counted against the
    -- day's limit, so unsend-and-resend can't ping someone over and over.
    delete from public.dm_threads t where t.id = v_t and t.status = 'request' and t.started_by = me
      and not exists (select 1 from public.dm_messages x where x.thread_id = t.id);
    begin
      perform realtime.send(jsonb_build_object('id', p_message, 'op', 'delete'), 'message', 'dm:' || v_t::text, true);
    exception when others then null;
    end;
  end if;
end $$;
revoke all on function public.dm_accept(uuid), public.dm_ignore(uuid), public.dm_leave(uuid), public.dm_mute(uuid, boolean),
  public.dm_unsend(uuid) from public, anon;
grant execute on function public.dm_accept(uuid), public.dm_ignore(uuid), public.dm_leave(uuid), public.dm_mute(uuid, boolean),
  public.dm_unsend(uuid) to authenticated;

-- ---------- Blocks ----------
create or replace function public.dm_block(p_handle text)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v_id uuid;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.rate_ok(me, 'dm_block', 30, interval '1 hour') then raise exception 'Too many blocks in the last hour.' using errcode = 'P0001'; end if;
  v_id := public.dm_user_by_handle(p_handle);
  if v_id is null or v_id = me then raise exception 'No trader has that handle.' using errcode = 'P0001'; end if;
  perform public.dm_block_user(me, v_id);
end $$;
create or replace function public.dm_unblock(p_handle text)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  delete from public.dm_blocks where blocker = me and blocked = public.dm_user_by_handle(p_handle);
end $$;
create or replace function public.dm_blocked()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(public.dm_who(b.blocked) || jsonb_build_object('at', b.created_at) order by b.created_at desc), '[]'::jsonb)
    from public.dm_blocks b where b.blocker = (select auth.uid())
$$;
revoke all on function public.dm_block(text), public.dm_unblock(text), public.dm_blocked() from public, anon;
grant execute on function public.dm_block(text), public.dm_unblock(text), public.dm_blocked() to authenticated;

-- ---------- Reporting: a sealed copy for the owner, and nothing else ----------
create or replace function public.dm_report(p_message uuid, p_reason text, p_note text default null, p_block boolean default true)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  m public.dm_messages;
  mm public.dm_members;
  v_copy jsonb;
  v_r uuid;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('scam', 'staff', 'selling', 'abuse', 'other') then
    raise exception 'Choose what''s wrong.' using errcode = 'P0001';
  end if;
  select * into m from public.dm_messages where id = p_message;
  select * into mm from public.dm_members where thread_id = m.thread_id and user_id = me;
  -- Only a message you can see: in your conversation, from them, not deleted by you, not past 12 months
  if m.id is null or mm.thread_id is null or m.user_id = me
     or m.created_at <= greatest(coalesce(mm.cleared_at, '-infinity'::timestamptz), now() - interval '12 months') then
    raise exception 'You can only report messages sent to you.' using errcode = 'P0001';
  end if;
  if not public.rate_ok(me, 'dm_report', 20, interval '1 hour') then
    raise exception 'Too many reports in the last hour. Try again later.' using errcode = 'P0001';
  end if;
  select r.id into v_r from public.dm_reports r where r.reporter = me and r.message_id = p_message and r.status = 'open';
  if v_r is null then
    -- Exactly what the report sheet showed: the reported message and up to 10 before it, as the reporter could see them
    select jsonb_agg(jsonb_build_object('id', x.id, 'from', pr.handle, 'at', x.created_at, 'body', public.dm_open(x.sealed),
             'card', x.card ->> 'type', 'flags', to_jsonb(x.flags), 'reported', x.id = m.id) order by x.created_at)
      into v_copy
      from (select y.* from public.dm_messages y
             where y.thread_id = m.thread_id and y.created_at <= m.created_at and y.created_at > coalesce(mm.cleared_at, '-infinity'::timestamptz)
             order by y.created_at desc limit 11) x
      left join public.profiles pr on pr.id = x.user_id;
    insert into public.dm_reports (reporter, reported, message_id, reason, note, sealed, from_request, reported_profile)
    values (me, m.user_id, m.id, p_reason, left(nullif(btrim(coalesce(p_note, '')), ''), 500), public.dm_seal(v_copy::text),
      coalesce((select t.status = 'request' from public.dm_threads t where t.id = m.thread_id), false),
      jsonb_build_object(
        'handle', (select pr.handle from public.profiles pr where pr.id = m.user_id),
        'joined', (select u.created_at from auth.users u where u.id = m.user_id),
        'requests_7d', (select count(*) from public.dm_threads t where t.started_by = m.user_id and t.created_at > now() - interval '7 days'),
        'blocked_by', (select count(*) from public.dm_blocks b where b.blocked = m.user_id),
        'reports_before', (select count(*) from public.dm_reports r where r.reported = m.user_id)))
    returning id into v_r;
  end if;
  if coalesce(p_block, true) then perform public.dm_block_user(me, m.user_id); end if;
  return v_r;
end $$;
revoke all on function public.dm_report(uuid, text, text, boolean) from public, anon;
grant execute on function public.dm_report(uuid, text, text, boolean) to authenticated;

-- ---------- Your settings ----------
create or replace function public.dm_settings(p_from text default null, p_email boolean default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); v public.profile_private;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_from is not null or p_email is not null then
    if not public.rate_ok(me, 'dm_settings', 30, interval '1 hour') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
    if p_from is not null and p_from not in ('everyone', 'crew', 'nobody') then raise exception 'Choose who can message you.' using errcode = 'P0001'; end if;
    update public.profile_private set dm_from = coalesce(p_from, dm_from), dm_email = coalesce(p_email, dm_email) where id = me;
  end if;
  select * into v from public.profile_private where id = me;
  return jsonb_build_object('from', coalesce(v.dm_from, 'everyone'), 'email', coalesce(v.dm_email, true));
end $$;
revoke all on function public.dm_settings(text, boolean) from public, anon;
grant execute on function public.dm_settings(text, boolean) to authenticated;

-- ---------- "Your data": your conversations, blocks, reports, shares and saved copies ----------
create or replace function public.dm_export()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.rate_ok(me, 'dm_export', 10, interval '1 hour') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'conversations', coalesce((select jsonb_agg(jsonb_build_object(
        'with', (select pr.handle from public.profiles pr where pr.id = o.user_id), 'started', t.created_at, 'status', t.status, 'your_state', m.state,
        'messages', (select coalesce(jsonb_agg(jsonb_build_object(
            'from', case when x.user_id = me then 'you' else (select pr.handle::text from public.profiles pr where pr.id = x.user_id) end,
            'at', x.created_at, 'body', public.dm_open(x.sealed),
            -- a request's card is held back here too, as it is in dm_thread()
            'card', case when m.state = 'request' and x.user_id <> me then null else public.dm_card_out(x.card, me) end) order by x.created_at), '[]'::jsonb)
          -- what you can still see: not what you deleted, nothing past 12 months
          from public.dm_messages x where x.thread_id = t.id
           and x.created_at > greatest(coalesce(m.cleared_at, '-infinity'::timestamptz), now() - interval '12 months'))) order by t.created_at)
      from public.dm_members m join public.dm_threads t on t.id = m.thread_id
      join public.dm_members o on o.thread_id = t.id and o.user_id <> me
     where m.user_id = me), '[]'::jsonb),
    'blocked', public.dm_blocked(),
    'reports_you_made', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'at', r.created_at, 'status', r.status) order by r.created_at)
      from public.dm_reports r where r.reporter = me), '[]'::jsonb),
    'settings', public.dm_settings(),
    'shares', coalesce((select jsonb_agg(jsonb_build_object('notebook', s.notebook_id, 'page', s.page_id, 'audience', s.audience,
        'copies', s.copies, 'since', s.created_at, 'stopped', s.revoked_at) order by s.created_at)
      from public.study_shares s where s.owner = me), '[]'::jsonb),
    'saved_copies', coalesce((select jsonb_agg(jsonb_build_object('page', sv.copy_page_id, 'from_page_number', sv.n, 'at', sv.saved_at) order by sv.saved_at)
      from public.study_share_saves sv where sv.user_id = me), '[]'::jsonb));
end $$;
revoke all on function public.dm_export() from public, anon;
grant execute on function public.dm_export() to authenticated;

-- =====================================================================================================================
-- 10. Sharing Study notes
-- =====================================================================================================================
-- p_page null shares the whole notebook: the pages it has now (pages written later aren't shared). p_audience
-- 'community' posts it to the feed (caption = the post's words); 'members' sends each person a page card in their
-- messages (anyone new gets it as a request, held until they accept). Members asked for again on a live share are added
-- to it. Returns who it reached and who it couldn't (a block reads the same as "not taking new messages").
create or replace function public.share_page(p_notebook uuid, p_page uuid, p_audience text, p_members text[] default '{}',
  p_caption text default null, p_copies boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_share public.study_shares;
  v_post uuid;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_handle text;
  v_to uuid;
  v_t uuid;
  v_card jsonb;
  v_sent text[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  v_fresh boolean := false;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.has_access_for(me) then raise exception 'Sharing is part of your Marble plan.' using errcode = 'P0001'; end if;
  if p_audience is null or p_audience not in ('community', 'members') then raise exception 'Choose who can read it.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.notebooks nb where nb.id = p_notebook and nb.user_id = me) then
    raise exception 'That notebook isn''t yours.' using errcode = 'P0001';
  end if;
  if p_page is not null and not exists (select 1 from public.pages p where p.id = p_page and p.notebook_id = p_notebook and p.user_id = me) then
    raise exception 'That page isn''t in this notebook.' using errcode = 'P0001';
  end if;
  if p_page is null and not exists (select 1 from public.pages p where p.notebook_id = p_notebook and p.user_id = me) then
    raise exception 'Write a page first, then share it.' using errcode = 'P0001';
  end if;
  if p_audience = 'members' and coalesce(cardinality(p_members), 0) = 0 then raise exception 'Choose who to send it to.' using errcode = 'P0001'; end if;
  if coalesce(cardinality(p_members), 0) > 20 then raise exception 'Up to 20 people at a time.' using errcode = 'P0001'; end if;
  if char_length(v_caption) > 1000 then raise exception 'Keep the words under 1,000 characters.' using errcode = 'P0001'; end if;
  if not public.rate_ok(me, 'share', 30, interval '1 day') then raise exception 'That''s a lot of sharing for one day. Try again tomorrow.' using errcode = 'P0001'; end if;

  select * into v_share from public.study_shares s
   where s.notebook_id = p_notebook and s.page_id is not distinct from p_page and s.owner = me and s.revoked_at is null for update;
  if v_share.id is not null then
    if p_audience = 'community' and v_share.audience = 'community' then raise exception 'This is already in the feed.' using errcode = 'P0001'; end if;
    if p_audience = 'community' then
      raise exception 'This is shared with chosen members. Stop sharing first, then share it with the community.' using errcode = 'P0001';
    end if;
  else
    v_fresh := true;
    insert into public.study_shares (owner, notebook_id, page_id, audience, copies)
      values (me, p_notebook, p_page, p_audience, coalesce(p_copies, true)) returning * into v_share;
    -- The snapshot: the page, or every page the notebook has right now, numbered in the notebook's order
    insert into public.study_share_pages (share_id, page_id, n)
      select v_share.id, x.id, x.i from (
        select p.id, row_number() over (order by p.n, p.created_at, p.id)::int as i
          from public.pages p where p.notebook_id = p_notebook and p.user_id = me) x
       where p_page is null or x.id = p_page;
    if p_audience = 'community' then
      insert into public.posts (user_id, kind, body, anonymous, share_id)
        values (me, 'lesson', coalesce(v_caption, 'A page from my Study notebook.'), false, v_share.id) returning id into v_post;
      update public.study_shares set post_id = v_post where id = v_share.id;
    end if;
  end if;

  if p_audience = 'members' then
    v_card := jsonb_build_object('type', 'page', 'share', v_share.id);
    foreach v_handle in array p_members loop
      v_to := public.dm_user_by_handle(v_handle);
      if v_to is null then raise exception 'No trader has the handle %.', left(v_handle, 40) using errcode = 'P0001'; end if;
      continue when v_to = me;
      begin
        v_t := public.dm_thread_for(me, v_to);
        if v_share.audience = 'members' then
          insert into public.study_share_members (share_id, user_id) values (v_share.id, v_to) on conflict do nothing;
        end if;
        perform public.dm_post(me, v_t, v_caption, v_card);
        v_sent := v_sent || (select pr.handle::text from public.profiles pr where pr.id = v_to);
      exception when sqlstate 'P0001' then
        -- that person isn't added: the member row and any new conversation roll back with the message
        v_skipped := v_skipped || jsonb_build_object('handle', (select pr.handle::text from public.profiles pr where pr.id = v_to), 'why', sqlerrm);
      end;
    end loop;
    if cardinality(v_sent) = 0 then
      raise exception '%', coalesce(v_skipped -> 0 ->> 'why', 'That didn''t reach anyone.') using errcode = 'P0001';
    end if;
  end if;
  return jsonb_build_object('share', v_share.id, 'post', v_post, 'fresh', v_fresh, 'sent', to_jsonb(v_sent), 'skipped', v_skipped);
end $$;
revoke all on function public.share_page(uuid, uuid, text, text[], text, boolean) from public, anon;
grant execute on function public.share_page(uuid, uuid, text, text[], text, boolean) to authenticated;

-- Stop sharing: closes it everywhere at once. The feed post keeps its words and loses its card; page cards in messages
-- say it stopped. Copies people saved are theirs.
create or replace function public.share_stop(p_share uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.study_shares set revoked_at = now() where id = p_share and owner = me and revoked_at is null;
  if not found then raise exception 'That isn''t one of your live shares.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.share_stop(uuid) from public, anon;
grant execute on function public.share_stop(uuid) to authenticated;

-- Your live shares in a notebook (the Shared marks, reads and saved copies)
create or replace function public.share_list(p_notebook uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('share', s.id, 'page', s.page_id, 'audience', s.audience, 'copies', s.copies,
      'since', s.created_at, 'post', s.post_id,
      'pages', (select coalesce(jsonb_agg(sp.page_id), '[]'::jsonb) from public.study_share_pages sp where sp.share_id = s.id),
      'members', (select coalesce(jsonb_agg(pr.handle order by pr.handle), '[]'::jsonb) from public.study_share_members m
                    join public.profiles pr on pr.id = m.user_id where m.share_id = s.id),
      'reads', (select count(*) from public.study_share_reads r where r.share_id = s.id),
      'saves', (select count(*) from public.study_share_saves sv where sv.share_id = s.id)) order by s.created_at), '[]'::jsonb)
    from public.study_shares s
   where s.owner = (select auth.uid()) and s.notebook_id = p_notebook and s.revoked_at is null
$$;
revoke all on function public.share_list(uuid) from public, anon;
grant execute on function public.share_list(uuid) to authenticated;

-- Reading a shared page: one page at a time (p_n = 1.. of a notebook share). Only what the page shows: never the
-- page's id, its trade, its photos or the owner's other pages.
create or replace function public.share_view(p_share uuid, p_n integer default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.study_shares;
  nb public.notebooks;
  pg public.pages;
  v_of int;
  v_i int;
  v_pid uuid;
  v_n int;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.rate_ok(me, 'share_read', 240, interval '1 hour') then raise exception 'Slow down a little.' using errcode = 'P0001'; end if;
  select * into s from public.study_shares where id = p_share;
  if s.id is null or not (s.owner = me or s.audience = 'community'
       or exists (select 1 from public.study_share_members x where x.share_id = s.id and x.user_id = me)
       or exists (select 1 from public.study_share_saves sv where sv.share_id = s.id and sv.user_id = me)) then
    raise exception 'This page isn''t shared with you.' using errcode = 'P0001';
  end if;
  select * into nb from public.notebooks where id = s.notebook_id;
  select count(*)::int into v_of from public.share_pages_now(p_share);
  if not public.can_view_share(p_share, me) or v_of = 0 then
    -- Stopped (or closed by a block, which reads the same): the copies you saved are still yours
    return jsonb_build_object('share', p_share, 'gone', true, 'owner', public.dm_who(s.owner), 'whole', s.page_id is null,
      'notebook', jsonb_build_object('title', nb.title),
      'saved', (select coalesce(jsonb_agg(jsonb_build_object('n', sv.n, 'notebook', cn.title, 'notebook_id', cn.id, 'page', sv.copy_page_id, 'at', sv.saved_at)
                 order by sv.saved_at), '[]'::jsonb)
                  from public.study_share_saves sv join public.pages cp on cp.id = sv.copy_page_id join public.notebooks cn on cn.id = cp.notebook_id
                 where sv.share_id = p_share and sv.user_id = me));
  end if;
  v_i := least(greatest(coalesce(p_n, 1), 1), v_of);
  select q.page_id, q.n into v_pid, v_n from public.share_pages_now(p_share) q where q.i = v_i;
  select * into pg from public.pages where id = v_pid;
  if s.owner <> me then insert into public.study_share_reads (share_id, user_id) values (p_share, me) on conflict do nothing; end if;
  return jsonb_build_object(
    'share', p_share, 'gone', false, 'mine', s.owner = me, 'audience', s.audience, 'copies', s.copies, 'since', s.created_at,
    'owner', public.dm_who(s.owner), 'notebook', jsonb_build_object('title', nb.title, 'cover', nb.cover), 'whole', s.page_id is null,
    'i', v_i, 'of', v_of, 'n', v_n,
    'page', jsonb_build_object('title', pg.title, 'date', pg.created_at,
      'video', case when pg.video_id is null then null else jsonb_build_object('id', pg.video_id, 'title', pg.video_title, 'channel', pg.video_channel, 'len', pg.video_len) end,
      'lines', public.share_lines(pg.lines)),
    'saved', exists (select 1 from public.study_share_saves sv where sv.share_id = p_share and sv.user_id = me and sv.page_id = v_pid),
    'reads', case when s.owner = me then (select count(*) from public.study_share_reads r where r.share_id = p_share) end,
    'saves', case when s.owner = me then (select count(*) from public.study_share_saves sv where sv.share_id = p_share) end);
end $$;
revoke all on function public.share_view(uuid, integer) from public, anon;
grant execute on function public.share_view(uuid, integer) to authenticated;

-- Save a copy (text only) into one of your notebooks, or a new one named "<notebook>, from <handle>". The copy keeps the
-- title, the lines with their times and key lessons, and the lesson; never photos, never the trade. It's yours from then on.
create or replace function public.share_save(p_share uuid, p_n integer, p_notebook uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.study_shares;
  pg public.pages;
  v_of int;
  v_i int;
  v_pid uuid;
  v_n int;
  v_nb uuid;
  v_owner text;
  v_src text;
  v_count int;
  v_new uuid;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.has_access_for(me) then raise exception 'Saving a copy is part of your Marble plan.' using errcode = 'P0001'; end if;
  if not public.rate_ok(me, 'share_save', 60, interval '1 day') then raise exception 'That''s a lot of copies for one day. Try again tomorrow.' using errcode = 'P0001'; end if;
  select * into s from public.study_shares where id = p_share;
  if s.id is null or not public.can_view_share(p_share, me) then raise exception 'This page isn''t shared any more.' using errcode = 'P0001'; end if;
  if s.owner = me then raise exception 'It''s already in your notebooks.' using errcode = 'P0001'; end if;
  if not s.copies then raise exception 'Saving copies is off for this page.' using errcode = 'P0001'; end if;
  select count(*)::int into v_of from public.share_pages_now(p_share);
  if v_of = 0 then raise exception 'This page isn''t shared any more.' using errcode = 'P0001'; end if;
  v_i := least(greatest(coalesce(p_n, 1), 1), v_of);
  select q.page_id, q.n into v_pid, v_n from public.share_pages_now(p_share) q where q.i = v_i;
  if exists (select 1 from public.study_share_saves sv where sv.user_id = me and sv.page_id = v_pid) then
    raise exception 'You already saved a copy of this page.' using errcode = 'P0001';
  end if;
  select * into pg from public.pages where id = v_pid;
  select pr.handle::text into v_owner from public.profiles pr where pr.id = s.owner;
  select nb.title into v_src from public.notebooks nb where nb.id = s.notebook_id;
  if p_notebook is not null then
    select nb.id into v_nb from public.notebooks nb where nb.id = p_notebook and nb.user_id = me;
    if v_nb is null then raise exception 'Choose one of your notebooks.' using errcode = 'P0001'; end if;
  else
    -- More pages from the same share go into the notebook the first one went to, if it's still there
    select cp.notebook_id into v_nb from public.study_share_saves sv join public.pages cp on cp.id = sv.copy_page_id
     where sv.share_id = p_share and sv.user_id = me order by sv.saved_at limit 1;
    if v_nb is null then
      select count(*)::int into v_count from public.notebooks nb where nb.user_id = me;
      insert into public.notebooks (user_id, title, cover, position, last_page)
        values (me, left(coalesce(v_src, 'Notebook') || ', from ' || coalesce(v_owner, 'a trader'), 60),
          (array['gods/apollo-light', 'gods/david-curls', 'gods/headband-hero', 'gods/hercules-dark',
                 'gods/muse-dark', 'gods/goddess-shadow', 'gods/crowned-queen', 'gods/flower-crown'])[1 + v_count % 8],
          coalesce((select max(nb.position) + 1 from public.notebooks nb where nb.user_id = me), 0), 1)
        returning id into v_nb;
    end if;
  end if;
  insert into public.pages (notebook_id, user_id, n, title, video_id, video_title, video_channel, video_len, lines, attachments)
    values (v_nb, me, coalesce((select max(p.n) from public.pages p where p.notebook_id = v_nb), 0) + 1, left(coalesce(pg.title, ''), 120),
      pg.video_id, pg.video_title, pg.video_channel, pg.video_len, public.share_lines(pg.lines), '[]'::jsonb)
    returning id into v_new;
  insert into public.study_share_saves (share_id, user_id, page_id, copy_page_id, n) values (p_share, me, v_pid, v_new, v_n);
  return jsonb_build_object('page', v_new, 'notebook', v_nb, 'title', (select nb.title from public.notebooks nb where nb.id = v_nb));
end $$;
revoke all on function public.share_save(uuid, integer, uuid) from public, anon;
grant execute on function public.share_save(uuid, integer, uuid) to authenticated;

-- A post can only carry its own author's live community share, never on a reply or an anonymous post, and a post's
-- share can only ever be taken away (by unsharing's 12-month clean-up), never swapped
create or replace function public.posts_share_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.share_id is not null and (new.anonymous or new.parent_id is not null or not exists (
         select 1 from public.study_shares s where s.id = new.share_id and s.owner = new.user_id and s.audience = 'community'
            and s.revoked_at is null and s.post_id is null)) then
      raise exception 'That page can''t be attached here.' using errcode = 'P0001';
    end if;
  else
    if new.share_id is not null then new.share_id := old.share_id; end if;
    if new.anonymous and not old.anonymous and old.share_id is not null then
      raise exception 'A post with a shared page can''t be made anonymous.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.posts_share_guard() from public, anon, authenticated;
create trigger posts_share_guard before insert or update on public.posts for each row execute function public.posts_share_guard();

-- =====================================================================================================================
-- 11. The feed: page cards, and blocked traders' named posts hidden from the person who blocked them
-- =====================================================================================================================
-- Replaces part 1's feed() (same arguments, one more column, share). Everything else is as it was.
drop function if exists public.feed(text, text, timestamptz, integer, boolean, uuid);
create function public.feed(p_crew text default null, p_kind text default null, p_before timestamptz default now(),
  p_limit integer default 30, p_anonymous boolean default null, p_parent uuid default null)
returns table (id uuid, kind text, crew text, parent_id uuid, body text, trade jsonb, image_url text, created_at timestamptz,
  author_handle extensions.citext, author_name text, author_avatar text, anonymous boolean, mine boolean, replies bigint,
  likes bigint, liked boolean, share jsonb)
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
         exists (select 1 from public.post_reactions r where r.post_id = p.id and r.user_id = (select auth.uid())),
         -- Unsharing (or a block) takes the card away; the post keeps its words
         case when p.share_id is not null then
           (select case when (c ->> 'gone')::boolean then null else c end from (select public.share_card(p.share_id, (select auth.uid())) as c) sc) end
  from public.posts p join public.profiles pr on pr.id = p.user_id
  where not p.hidden and (select auth.uid()) is not null
    and (case when p_parent is null then p.parent_id is null and p.kind <> 'reply' else p.parent_id = p_parent end)
    -- Replies to a post the moderators hid are hidden with it (security audit 2)
    and (p_parent is null or not exists (select 1 from public.posts h where h.id = p_parent and h.hidden))
    -- Someone you blocked: their named posts and replies are hidden from you. Anonymous ones never are, or a block
    -- would tell you which anonymous posts were theirs.
    and (p.anonymous or not exists (select 1 from public.dm_blocks b where b.blocker = (select auth.uid()) and b.blocked = p.user_id))
    and (p_kind is null or p.kind = p_kind)
    and (p_crew is null or (p.crew = p_crew and not p.anonymous))
    and (p_anonymous is null or p.anonymous = p_anonymous)
    and p.created_at < p_before
  order by case when p_parent is null then p.created_at end desc, p.created_at asc
  limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.feed(text, text, timestamptz, integer, boolean, uuid) from public, anon;
grant execute on function public.feed(text, text, timestamptz, integer, boolean, uuid) to authenticated;

-- Chat rooms: messages from someone you blocked don't reach you, live or loaded (Realtime checks row security too)
create policy "chat: not from people you blocked" on public.chat_messages as restrictive for select to authenticated
  using (not (select public.dm_i_blocked(chat_messages.user_id)));

-- =====================================================================================================================
-- 12. Live: broadcast from the database on private channels, carrying ids only
-- =====================================================================================================================
create or replace function public.dm_broadcast()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  -- A failure to broadcast never stops a message being sent: the app also reads again when it comes back to the tab
  begin
    perform realtime.send(jsonb_build_object('id', new.id, 'op', 'insert'), 'message', 'dm:' || new.thread_id::text, true);
    for r in select m.user_id from public.dm_members m where m.thread_id = new.thread_id and m.state in ('active', 'request') loop
      perform realtime.send(jsonb_build_object('thread', new.thread_id), 'inbox', 'inbox:' || r.user_id::text, true);
    end loop;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public.dm_broadcast() from public, anon, authenticated;
create trigger dm_broadcast after insert on public.dm_messages for each row execute function public.dm_broadcast();

-- Who may listen: the two people in a conversation, and you on your own inbox. Nobody can broadcast into these topics
-- (there's no insert policy for them), so every event comes from the database.
create or replace function public.dm_can_listen(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null or p_topic is null then return false; end if;
  if p_topic = 'inbox:' || me::text then return true; end if;
  if p_topic !~ '^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists (select 1 from public.dm_members m where m.thread_id = substr(p_topic, 4)::uuid and m.user_id = me and m.state in ('active', 'request'));
end $$;
revoke all on function public.dm_can_listen(text) from public, anon;
grant execute on function public.dm_can_listen(text) to authenticated;
create policy "dm: members listen" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select public.dm_can_listen(realtime.topic())));

-- When an account is deleted its member rows go with it, and so does each conversation it was in (for both people)
create or replace function public.dm_member_gone()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.dm_threads t where t.id = old.thread_id;
  return null;
end $$;
revoke all on function public.dm_member_gone() from public, anon, authenticated;
create trigger dm_member_gone after delete on public.dm_members for each row execute function public.dm_member_gone();

-- =====================================================================================================================
-- 13. The owner: reported messages only, with two-step sign-in
-- =====================================================================================================================
-- Staff only: the admin account in public.staff (the owner, handle jules), signed in with a second factor. Another admin
-- account, if one is ever added, can't open them.
create or replace function public.dm_reports_open()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v jsonb;
begin
  if not public.is_admin() or not public.is_staff(auth.uid()) then raise exception 'Admins only' using errcode = '42501'; end if;
  if not public.dm_aal2() then raise exception 'Reading reported messages needs two-step sign-in. Verify your code first.' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'note', r.note, 'at', r.created_at, 'from_request', r.from_request,
      'reporter', (select pr.handle from public.profiles pr where pr.id = r.reporter), 'reported', r.reported_profile,
      'messages', public.dm_open(r.sealed)::jsonb) order by r.created_at), '[]'::jsonb)
    into v from public.dm_reports r where r.status = 'open';
  return v;
end $$;

-- dismiss: nothing happens. hide: deletes the reported trader's messages that are in this report's copy, and no others.
-- suspend: no messages from them for 7 days.
create or replace function public.dm_report_resolve(p_report uuid, p_action text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.dm_reports; me uuid := auth.uid();
begin
  if not public.is_admin() or not public.is_staff(me) then raise exception 'Admins only' using errcode = '42501'; end if;
  if not public.dm_aal2() then raise exception 'Acting on reports needs two-step sign-in. Verify your code first.' using errcode = 'P0001'; end if;
  if p_action is null or p_action not in ('dismiss', 'hide', 'suspend') then raise exception 'Choose what to do.' using errcode = 'P0001'; end if;
  select * into r from public.dm_reports where id = p_report for update;
  if r.id is null or r.status <> 'open' then raise exception 'That report has already been dealt with.' using errcode = 'P0001'; end if;
  if p_action = 'hide' and r.reported is not null then
    delete from public.dm_messages
     where user_id = r.reported
       and id in (select (e ->> 'id')::uuid from jsonb_array_elements(public.dm_open(r.sealed)::jsonb) e);
  elsif p_action = 'suspend' and r.reported is not null then
    insert into public.dm_bans (user_id, until, reason) values (r.reported, now() + interval '7 days', r.reason)
    on conflict (user_id) do update set until = greatest(public.dm_bans.until, excluded.until), reason = excluded.reason;
  end if;
  update public.dm_reports set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
    action = p_action, resolved_by = me, resolved_at = now() where id = p_report;
end $$;
revoke all on function public.dm_reports_open(), public.dm_report_resolve(uuid, text) from public, anon;
grant execute on function public.dm_reports_open(), public.dm_report_resolve(uuid, text) to authenticated;

-- =====================================================================================================================
-- 14. Email alerts: for the dm-alerts edge function, every 15 minutes
-- =====================================================================================================================
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'dm_alerts_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dm_alerts_cron', 'Shared secret: the pg_cron job to the dm-alerts edge function');
  end if;
end $$;

create or replace function public.dm_alerts_cron_ok(p_secret text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(length(p_secret) = 64 and p_secret = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'dm_alerts_cron' limit 1), false)
$$;
revoke all on function public.dm_alerts_cron_ok(text) from public, anon, authenticated;
grant execute on function public.dm_alerts_cron_ok(text) to service_role;

-- Who gets an alert this run, claimed as it's read (so two runs can't both send): an address and a count, never a word
-- of any message. Batched: a message counts once it has sat unread for 10 minutes (someone chatting live isn't emailed)
-- and if it's under 3 days old. At most one email every 6 hours per trader; never for a muted conversation or with
-- alerts switched off. The owner gets "a message was reported" at most once an hour while reports wait.
create or replace function public.dm_alert_batch()
returns table (email text, kind text, n integer)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  -- One run at a time
  if not pg_try_advisory_xact_lock(hashtext('dm_alert_batch')) then return; end if;
  return query
  with due as (
    select m.user_id, count(distinct m.thread_id)::int as threads
      from public.dm_members m
      join public.dm_messages x on x.thread_id = m.thread_id and x.user_id <> m.user_id
      join public.profile_private pp on pp.id = m.user_id
     where m.state in ('active', 'request') and not m.muted and pp.dm_email
       and x.created_at > greatest(coalesce(m.last_read_at, '-infinity'::timestamptz), coalesce(m.alerted_at, '-infinity'::timestamptz),
                                   coalesce(m.cleared_at, '-infinity'::timestamptz))
       and x.created_at < now() - interval '10 minutes'
       and x.created_at > now() - interval '3 days'
       and not exists (select 1 from public.dm_alert_log l where l.user_id = m.user_id and l.kind = 'message' and l.sent_at > now() - interval '6 hours')
     group by m.user_id
     order by m.user_id
     limit 200
  ), logged as (
    insert into public.dm_alert_log (user_id, kind, sent_at) select d.user_id, 'message', now() from due d
    on conflict (user_id, kind) do update set sent_at = excluded.sent_at
    returning user_id
  ), marked as (
    update public.dm_members m set alerted_at = now() from due d where m.user_id = d.user_id and m.state in ('active', 'request')
    returning m.user_id
  )
  select u.email::text, 'message'::text, d.threads from due d join auth.users u on u.id = d.user_id where u.email is not null;

  -- The owner: reports waiting since the last notice
  if exists (select 1 from public.dm_reports r where r.status = 'open'
               and r.created_at > coalesce((select max(l.sent_at) from public.dm_alert_log l where l.kind = 'report'), '-infinity'::timestamptz))
     and not exists (select 1 from public.dm_alert_log l where l.kind = 'report' and l.sent_at > now() - interval '1 hour') then
    -- the staff admin only: the one account that can open reports
    insert into public.dm_alert_log (user_id, kind, sent_at)
      select a.user_id, 'report', now() from public.admins a join public.staff s on s.user_id = a.user_id
      on conflict (user_id, kind) do update set sent_at = excluded.sent_at;
    return query select u.email::text, 'report'::text, (select count(*)::int from public.dm_reports r where r.status = 'open')
      from public.admins a join public.staff s on s.user_id = a.user_id join auth.users u on u.id = a.user_id where u.email is not null;
  end if;
end $$;
revoke all on function public.dm_alert_batch() from public, anon, authenticated;
grant execute on function public.dm_alert_batch() to service_role;

-- =====================================================================================================================
-- 15. Retention: the nightly clean-up
-- =====================================================================================================================
--   messages             12 months
--   requests             30 days unanswered or ignored
--   conversations        when both people have deleted them, or nothing in them is under 12 months old
--   report copies        12 months after they're dealt with; 24 months if the account was suspended
--   stopped shares       12 months after they stopped (their cards were already empty)
--   suspensions, alerts  a month after they end
create or replace function public.dm_purge()
returns integer language plpgsql security definer set search_path = ''
as $$
declare n int := 0; c int;
begin
  delete from public.dm_messages where created_at < now() - interval '12 months'; get diagnostics c = row_count; n := n + c;
  delete from public.dm_threads t where t.status = 'request' and t.created_at < now() - interval '30 days'; get diagnostics c = row_count; n := n + c;
  delete from public.dm_threads t where not exists (select 1 from public.dm_members m where m.thread_id = t.id and m.state <> 'left'); get diagnostics c = row_count; n := n + c;
  delete from public.dm_threads t where t.last_at < now() - interval '12 months' and not exists (select 1 from public.dm_messages x where x.thread_id = t.id); get diagnostics c = row_count; n := n + c;
  delete from public.dm_reports where status <> 'open'
     and resolved_at < now() - case when action = 'suspend' then interval '24 months' else interval '12 months' end; get diagnostics c = row_count; n := n + c;
  delete from public.study_shares where revoked_at < now() - interval '12 months'; get diagnostics c = row_count; n := n + c;
  delete from public.dm_bans where until < now() - interval '30 days';
  delete from public.dm_alert_log where sent_at < now() - interval '30 days';
  return n;
end $$;
revoke all on function public.dm_purge() from public, anon, authenticated;

-- =====================================================================================================================
-- 16. The schedule (pg_cron and pg_net are live). Scheduling under the same name again replaces the job.
-- =====================================================================================================================
select cron.schedule('dm-purge', '37 3 * * *', 'select public.dm_purge()');
select cron.schedule(
  'dm-alerts',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/dm-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'dm_alerts_cron' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

commit;
