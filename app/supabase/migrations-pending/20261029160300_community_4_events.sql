-- Community rework, part 4 of 4: events. Skill-based competitions on discipline, and free-to-enter giveaways with a
-- sealed-code draw. NOT APPLIED. Written 29 October 2026 for review. Needs part 3 (discipline_days).
--
-- Nothing shows in the app until an admin creates an event and moves it out of 'draft': until then the Events tab
-- says what's coming. Events are made from the admin area (to be built): it needs the admin policies and functions
-- here, and a solicitor-checked rules text for each event before the first prize (see the design README).
--
-- Competitions
--   competitions          the event: dates, status, the cup's rules (limits), scoring, prizes, rules text and version
--   competition_entries   one per trader, with one account, its size when they entered, and the rules version accepted
--   competition_results   the final table, frozen by competition_finalise() after the 48-hour check
--   enter_competition()   free to enter (no plan needed); the account must be the trader's own, linked to a Topstep or
--                         IBKR connection, and carry synced trades; its size is the broker's balance (or the cup's
--                         own limits.account_size when the broker doesn't report one), never the app's own balance;
--                         the rules version must be the current one
--   trades_competition_hold  a synced trade that counts in a competition you're in can't be deleted until it's final
--   withdraw_competition() until the first day
--   competition_board()   the live table (or the final one), your own row, and today against the cup's rules for you
--   competition_finalise() admin: freeze the results and mark it final
-- Giveaways (free prize draws: no purchase necessary)
--   giveaways             the event, its prize, dates, winners count, rules, and the sealed code (seed_hash)
--   giveaway_secrets      the secret behind the sealed code. No one can read it from the browser, admins included,
--                         until the draw publishes it
--   giveaway_entries      numbered entries (app members, and later a free web form for anyone: email_hash, route 'web')
--   giveaway_draws        the public record of each draw: the entry list, its fingerprint, the secret and the picks
--   giveaway_winners      who won (shown by entry number; a handle only if the winner agrees)
--   giveaway_seal()       admin: makes the secret on the server and publishes its fingerprint (before opening)
--   enter_giveaway()      one entry per person: a confirmed email, an account at least 7 days old, one entry per
--                         normalised email (Gmail dots and +tags removed) across both routes, and a rate limit
--   giveaway_enter_web()  service role: the free web route ("no purchase necessary"), the same one-per-email rule
--   giveaway_draw()       admin: the draw (and redraws for unclaimed prizes), anyone can check it afterwards
--   giveaway_result()     the record, the winners and your own entry
--   giveaway_show_handle() a winner agrees (or not) to their handle being shown
--
-- The draw: entries = the valid entry numbers, ascending. list_hash = sha256 of them joined by ','. For n = 1, 2, ...:
-- h = sha256(secret || ':' || list_hash || ':' || n) as hex; the pick is entries[(first 13 hex digits of h) mod count],
-- skipping numbers already picked (this round or an earlier one). The same check runs in the browser
-- (src/views/community/draw.js, unit tested). Entries marked invalid (with a reason) are listed in each draw's record,
-- and an entry's validity can't change once entries close, so the published draw stays checkable.
--
-- Security audit 2 (H1, M3): competitions count synced trades only (the database refuses synced trades from the
-- browser: 20261029180000), R comes from the cup's fixed risk unit, and the account size from the broker. Giveaway
-- entries need public.email_norm_hash() from 20261029180100_signup_profiles_and_names.sql (same batch; only
-- called when someone enters, never while applying).

begin;

-- ---------- Competitions ----------
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null check (char_length(title) between 3 and 80),
  tagline text check (tagline is null or char_length(tagline) <= 80),
  blurb text check (blurb is null or char_length(blurb) <= 240),
  art text check (art is null or art ~ '^[a-z0-9/_-]{1,80}$'),
  status text not null default 'draft' check (status in ('draft', 'open', 'live', 'review', 'final', 'cancelled')),
  starts_on date not null,
  ends_on date not null,
  entry_closes_at timestamptz not null,
  results_at timestamptz,
  -- The cup's own rules, the same for everyone: {"max_trade_loss_pct": 1, "daily_loss_pct": 2, "max_trades": 4, "stop_after": 2}
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  -- {"broken_day_r": 2, "min_days": 10}. Each trade's R is always capped at +3R.
  scoring jsonb not null default '{"broken_day_r": 2, "min_days": 10}'::jsonb check (jsonb_typeof(scoring) = 'object'),
  prizes jsonb not null default '[]'::jsonb check (jsonb_typeof(prizes) = 'array'),   -- [{"place": "1st", "title": "...", "detail": "..."}]
  summary jsonb not null default '[]'::jsonb check (jsonb_typeof(summary) = 'array'), -- the rules in short: ["...", ...]
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),     -- the full rules: [["Heading", "Text"], ...]
  rules_version text not null default '1.0' check (char_length(rules_version) between 1 and 12),
  rules_published_at timestamptz,
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array'),   -- how the result was checked: [["Heading", "Text"]]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (status = 'draft' or rules_published_at is not null)
);
comment on table public.competitions is 'Skill competitions on discipline, made in the admin area. Hidden while draft.';
create trigger competitions_touch before update on public.competitions for each row execute function public.touch_updated_at();

create table public.competition_entries (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  account_size numeric not null check (account_size > 0),
  -- The broker account the entry is tied to (connections.accounts), fixed for the competition
  broker_platform text check (broker_platform is null or broker_platform in ('topstepx', 'ibkr')),
  broker_account text check (broker_account is null or char_length(broker_account) <= 80),
  rules_version text not null,
  accepted_at timestamptz not null default now(),
  status text not null default 'entered' check (status in ('entered', 'withdrawn', 'disqualified')),
  withdrawn_at timestamptz,
  dq_reason text check (dq_reason is null or char_length(dq_reason) <= 500),
  primary key (competition_id, user_id)
);
comment on table public.competition_entries is 'One entry per trader per competition, with one account. Written only through enter_competition() and withdraw_competition() (and admins).';
create index competition_entries_user on public.competition_entries (user_id);

create table public.competition_results (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank integer,
  handle extensions.citext not null,
  crew text,
  traded integer not null, kept integer not null, trades integer not null,
  kept_r numeric not null, score numeric not null,
  prize text,
  prize_status text check (prize_status is null or prize_status in ('pending', 'sent', 'declined')),
  primary key (competition_id, user_id)
);
comment on table public.competition_results is 'The final table, frozen by competition_finalise(). Entrants agreed to their handle and scores being shown.';

alter table public.competitions enable row level security;
alter table public.competition_entries enable row level security;
alter table public.competition_results enable row level security;
revoke all on table public.competitions, public.competition_entries, public.competition_results from anon, authenticated;
grant select, insert, update, delete on table public.competitions to authenticated;
grant select, update on table public.competition_entries to authenticated;
grant select, insert, update, delete on table public.competition_results to authenticated;
create policy "competitions: read when published" on public.competitions for select to authenticated
  using (status <> 'draft' or (select public.is_admin()));
create policy "competitions: admin manages" on public.competitions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "competition entries: read own" on public.competition_entries for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "competition entries: admin manages" on public.competition_entries for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "competition results: read when final" on public.competition_results for select to authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id and c.status = 'final') or (select public.is_admin()));
create policy "competition results: admin manages" on public.competition_results for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.enter_competition(p_competition uuid, p_account uuid, p_rules_version text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.competitions;
  v_size numeric;
  v_platform text;
  v_broker text;
begin
  if v_me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into v_c from public.competitions where id = p_competition;
  if not found or v_c.status <> 'open' or now() >= v_c.entry_closes_at then
    raise exception 'Entries for this competition are closed' using errcode = 'P0001';
  end if;
  if p_rules_version is distinct from v_c.rules_version then
    raise exception 'The rules have changed. Read the new version, then enter.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_account and a.user_id = v_me and not a.archived) then
    raise exception 'Choose one of your own accounts' using errcode = 'P0001';
  end if;
  -- The size comes from the broker (written by Marble's server on each sync), never from the app's own balance
  select c.platform, a->>'id', case when jsonb_typeof(a->'balance') = 'number' then (a->>'balance')::numeric end
    into v_platform, v_broker, v_size
    from public.connections c, jsonb_array_elements(c.accounts) a
   where c.user_id = v_me and c.platform in ('topstepx', 'ibkr') and a->>'linked' = p_account::text
   order by c.platform limit 1;
  if v_platform is null then
    raise exception 'Only synced trades count: connect this account to Topstep or Interactive Brokers first' using errcode = 'P0001';
  end if;
  v_size := coalesce(nullif(v_size, 0), nullif((v_c.limits->>'account_size')::numeric, 0));
  if v_size is null or v_size <= 0 then
    raise exception 'This competition needs the account''s size from the broker. Sync it once, then enter.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.trades t where t.user_id = v_me and t.account_id = p_account and t.source = 'sync') then
    raise exception 'Only synced trades count: sync this account first' using errcode = 'P0001';
  end if;
  insert into public.competition_entries (competition_id, user_id, account_id, account_size, broker_platform, broker_account, rules_version)
  values (p_competition, v_me, p_account, v_size, v_platform, v_broker, v_c.rules_version)
  on conflict (competition_id, user_id) do update
    set account_id = excluded.account_id, account_size = excluded.account_size, broker_platform = excluded.broker_platform,
        broker_account = excluded.broker_account, rules_version = excluded.rules_version,
        accepted_at = now(), status = 'entered', withdrawn_at = null
    where public.competition_entries.status <> 'disqualified';
  return jsonb_build_object('competition_id', p_competition, 'account_id', p_account, 'rules_version', v_c.rules_version);
end $$;
revoke all on function public.enter_competition(uuid, uuid, text) from public, anon;
grant execute on function public.enter_competition(uuid, uuid, text) to authenticated;

create or replace function public.withdraw_competition(p_competition uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.competition_entries e set status = 'withdrawn', withdrawn_at = now()
  from public.competitions c
  where c.id = e.competition_id and e.competition_id = p_competition and e.user_id = auth.uid() and e.status = 'entered'
    and (now() at time zone 'America/New_York')::date < c.starts_on;
  if not found then raise exception 'You can withdraw until the first day' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.withdraw_competition(uuid) from public, anon;
grant execute on function public.withdraw_competition(uuid) to authenticated;

-- The entrants' rules for discipline_days: the cup's limits, in each entrant's own money from their account size.
-- Synced trades only; R = P&L / the cup's risk unit (max_trade_loss_pct of the size, 1% if the cup sets none).
create or replace function public.competition_who(p_competition uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', e.user_id, 'account_id', e.account_id,
    'loss_limit', e.account_size * (c.limits->>'daily_loss_pct')::numeric / 100,
    'max_trade_loss', e.account_size * (c.limits->>'max_trade_loss_pct')::numeric / 100,
    'max_trades', (c.limits->>'max_trades')::int,
    'stop_after', (c.limits->>'stop_after')::int,
    'sync_only', true,
    'risk_unit', e.account_size * coalesce((c.limits->>'max_trade_loss_pct')::numeric, 1) / 100)), '[]'::jsonb)
  from public.competition_entries e join public.competitions c on c.id = e.competition_id
  where e.competition_id = p_competition and e.status = 'entered' and e.account_id is not null
$$;
revoke all on function public.competition_who(uuid) from public, anon, authenticated;

-- The table, worked out now. Internal: competition_board() and competition_finalise() read it.
create or replace function public.competition_rows(p_competition uuid)
returns table (user_id uuid, rank integer, handle extensions.citext, avatar text, crew text, traded integer, kept integer,
  trades integer, kept_r numeric, score numeric, strip text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_c public.competitions;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_who jsonb; v_cut numeric; v_min int;
begin
  select * into v_c from public.competitions where id = p_competition;
  if not found then return; end if;
  v_who := public.competition_who(p_competition);
  v_cut := coalesce((v_c.scoring->>'broken_day_r')::numeric, 2);
  v_min := coalesce((v_c.scoring->>'min_days')::int, 10);
  return query
  with d as (select * from public.discipline_days(v_who, v_c.starts_on, least(v_c.ends_on, v_today))),
  agg as (
    select d.user_id, count(*)::int as traded, count(*) filter (where cardinality(d.broke) = 0)::int as kept, sum(d.trades)::int as trades,
           round(coalesce(sum(d.r) filter (where cardinality(d.broke) = 0), 0), 2) as kept_r
    from d group by d.user_id
  ),
  scored as (
    select a.*, a.kept_r - v_cut * (a.traded - a.kept) as score, pr.handle, coalesce(pr.avatar_url, pr.avatar_art) as avatar, cm.crew
    from agg a join public.profiles pr on pr.id = a.user_id left join public.crew_members cm on cm.user_id = a.user_id
  ),
  days as (
    select g::date as k from generate_series(v_c.starts_on, v_c.ends_on, interval '1 day') g where extract(isodow from g) < 6
  )
  select s.user_id,
         (case when s.traded >= v_min then row_number() over (order by (s.traded >= v_min) desc, s.score desc, s.kept desc, s.trades asc, s.handle asc) end)::int,
         s.handle, s.avatar, s.crew, s.traded, s.kept, s.trades, s.kept_r, s.score,
         (select string_agg(case when dd.user_id is null then case when dy.k > v_today then '.' else '-' end
                                 when cardinality(dd.broke) = 0 then 'k' else 'b' end, '' order by dy.k)
          from days dy left join d dd on dd.user_id = s.user_id and dd.day = dy.k)
  from scored s;
end $$;
revoke all on function public.competition_rows(uuid) from public, anon, authenticated;

create or replace function public.competition_board(p_competition uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.competitions;
  v_e public.competition_entries;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_rows jsonb; v_today_checks jsonb := null;
begin
  if v_me is null then return null; end if;
  -- Each call works out every opted-in trader's days, so a script can't loop it (security audit 2, L10)
  if not public.rate_ok(v_me, 'board', 60, interval '1 minute') then
    raise exception 'Give it a minute, then look again' using errcode = 'P0001';
  end if;
  select * into v_c from public.competitions where id = p_competition and status <> 'draft';
  if not found then return null; end if;
  select * into v_e from public.competition_entries where competition_id = p_competition and user_id = v_me;

  if v_c.status = 'final' then
    select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'handle', r.handle, 'crew', r.crew, 'mine', r.user_id = v_me,
             'traded', r.traded, 'kept', r.kept, 'trades', r.trades, 'kept_r', r.kept_r, 'score', r.score, 'prize', r.prize)
             order by r.rank nulls last), '[]'::jsonb)
      into v_rows from public.competition_results r
      where r.competition_id = p_competition and (r.rank <= 50 or r.user_id = v_me);
  elsif v_c.status in ('live', 'review') then
    select coalesce(jsonb_agg(jsonb_build_object('rank', x.rank, 'handle', x.handle, 'avatar', x.avatar, 'crew', x.crew, 'mine', x.user_id = v_me,
             'traded', x.traded, 'kept', x.kept, 'trades', x.trades, 'kept_r', x.kept_r, 'score', x.score, 'strip', x.strip)
             order by x.rank nulls last), '[]'::jsonb)
      into v_rows from public.competition_rows(p_competition) x where x.rank <= 50 or x.user_id = v_me;
  else
    v_rows := '[]'::jsonb;
  end if;

  -- Today against the cup's rules, for you: the worst trade and the day so far as a share of your account, trades
  -- taken, and the losses in a row you're on
  if v_e.status = 'entered' and v_c.status = 'live' then
    with t as (
      select tr.pnl, tr.traded_at, tr.id from public.trades tr
      where tr.user_id = v_me and tr.account_id = v_e.account_id and tr.source = 'sync'
        and (tr.traded_at at time zone 'America/New_York')::date = v_today
    ),
    tail as (
      select count(*) as n from t where t.pnl < 0 and t.traded_at > coalesce((select max(t2.traded_at) from t t2 where t2.pnl >= 0), '-infinity'::timestamptz)
    )
    select jsonb_build_object('day', v_today,
      'worst_pct', round(coalesce(greatest(0, -min(t.pnl)), 0) / v_e.account_size * 100, 2),
      'day_pct', round(coalesce(sum(t.pnl), 0) / v_e.account_size * 100, 2),
      'trades', count(t.*), 'losses_in_a_row', (select n from tail))
    into v_today_checks from t;
  end if;

  return jsonb_build_object(
    'competition', p_competition, 'status', v_c.status, 'today', v_today,
    'entrants', (select count(*) from public.competition_entries e where e.competition_id = p_competition and e.status = 'entered'),
    'entry', case when v_e.user_id is null then null else jsonb_build_object('status', v_e.status, 'account_id', v_e.account_id,
               'rules_version', v_e.rules_version, 'accepted_at', v_e.accepted_at) end,
    'rows', v_rows, 'today_checks', v_today_checks);
end $$;
revoke all on function public.competition_board(uuid) from public, anon;
grant execute on function public.competition_board(uuid) to authenticated;

create or replace function public.competition_finalise(p_competition uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  delete from public.competition_results where competition_id = p_competition;
  insert into public.competition_results (competition_id, user_id, rank, handle, crew, traded, kept, trades, kept_r, score)
  select p_competition, x.user_id, x.rank, x.handle, x.crew, x.traded, x.kept, x.trades, x.kept_r, x.score
  from public.competition_rows(p_competition) x;
  get diagnostics v_n = row_count;
  update public.competitions set status = 'final', results_at = now() where id = p_competition;
  return v_n;
end $$;
revoke all on function public.competition_finalise(uuid) from public, anon;
grant execute on function public.competition_finalise(uuid) to authenticated;

-- A synced trade that counts in a competition the trader is in stays until the results are final (deleting a losing
-- day would otherwise change the table). Runs as the caller, so it sees only their own entries.
create or replace function public.trades_competition_hold()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or old.source is distinct from 'sync' then return old; end if;
  if exists (select 1 from public.competition_entries e join public.competitions c on c.id = e.competition_id
              where e.user_id = old.user_id and e.account_id = old.account_id and e.status = 'entered'
                and c.status in ('open', 'live', 'review')
                and (old.traded_at at time zone 'America/New_York')::date between c.starts_on and c.ends_on) then
    raise exception 'This trade counts in a competition you entered, so it stays until the results are final' using errcode = '42501';
  end if;
  return old;
end $$;
revoke all on function public.trades_competition_hold() from public, anon, authenticated;
create trigger trades_competition_hold before delete on public.trades
  for each row execute function public.trades_competition_hold();

-- ---------- Giveaways ----------
create table public.giveaways (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null check (char_length(title) between 3 and 80),
  tagline text check (tagline is null or char_length(tagline) <= 80),
  blurb text check (blurb is null or char_length(blurb) <= 240),
  art text check (art is null or art ~ '^[a-z0-9/_-]{1,80}$'),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'drawn', 'cancelled')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  draw_at timestamptz not null,
  claim_days integer not null default 14 check (claim_days between 1 and 90),
  winners_count integer not null check (winners_count between 1 and 100),
  prize jsonb not null default '[]'::jsonb check (jsonb_typeof(prize) = 'array'),     -- [{"title": "...", "detail": "..."}]
  summary jsonb not null default '[]'::jsonb check (jsonb_typeof(summary) = 'array'),
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  rules_version text not null default '1.0' check (char_length(rules_version) between 1 and 12),
  rules_published_at timestamptz,
  -- The sealed code: sha256 (hex) of the secret, published before entries open (giveaway_seal makes both)
  seed_hash text check (seed_hash is null or seed_hash ~ '^[0-9a-f]{64}$'),
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at and draw_at >= closes_at),
  check (status = 'draft' or (seed_hash is not null and rules_published_at is not null))
);
comment on table public.giveaways is 'Free prize draws (no purchase necessary), made in the admin area. Hidden while draft; sealed before opening.';
create trigger giveaways_touch before update on public.giveaways for each row execute function public.touch_updated_at();

create table public.giveaway_secrets (
  giveaway_id uuid primary key references public.giveaways(id) on delete cascade,
  seed text not null check (char_length(seed) between 32 and 128),
  created_at timestamptz not null default now()
);
comment on table public.giveaway_secrets is 'The secret behind a giveaway''s sealed code. Never readable from the browser; published in giveaway_draws at the draw.';

create table public.giveaway_entries (
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  entry_no integer not null check (entry_no > 0),
  -- An app member's entry; null if they later delete their account (the number stays, so the draw can still be checked)
  user_id uuid references public.profiles(id) on delete set null,
  -- The free web route, for people without Marble: a salted hash of their email, never the address itself
  email_hash text check (email_hash is null or email_hash ~ '^[0-9a-f]{64}$'),
  route text not null default 'app' check (route in ('app', 'web')),
  rules_version text not null,
  accepted_at timestamptz not null default now(),
  valid boolean not null default true,
  -- Why an entry was marked invalid (published with the draw); set before entries close
  invalid_reason text check (invalid_reason is null or char_length(invalid_reason) <= 200),
  primary key (giveaway_id, entry_no),
  unique (giveaway_id, user_id),
  unique (giveaway_id, email_hash)
);
comment on table public.giveaway_entries is 'Numbered giveaway entries, one per person across both routes. Written through enter_giveaway() (app) or the web form''s server function.';

create table public.giveaway_draws (
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  round integer not null check (round > 0),
  drawn_at timestamptz not null default now(),
  entries integer[] not null,
  list_hash text not null check (list_hash ~ '^[0-9a-f]{64}$'),
  seed text not null,
  picks integer[] not null,
  -- Entries left out as invalid, and why: [{"entry_no": 12, "reason": "..."}]
  invalid jsonb not null default '[]'::jsonb check (jsonb_typeof(invalid) = 'array'),
  primary key (giveaway_id, round)
);
comment on table public.giveaway_draws is 'The public record of each draw and redraw, so anyone can check the winning numbers.';

create table public.giveaway_winners (
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  entry_no integer not null,
  round integer not null,
  user_id uuid references public.profiles(id) on delete set null,
  show_handle boolean not null default false,
  claim_status text not null default 'open' check (claim_status in ('open', 'claimed', 'expired', 'disqualified')),
  claim_by timestamptz not null,
  claimed_at timestamptz,
  -- Why a winner was disqualified at the hand check (one person, one entry), shown with the result
  reason text check (reason is null or char_length(reason) <= 200),
  primary key (giveaway_id, entry_no)
);
comment on table public.giveaway_winners is 'Giveaway winners by entry number. A handle is shown only if the winner agrees (show_handle). Postal addresses are never kept here.';

alter table public.giveaways enable row level security;
alter table public.giveaway_secrets enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.giveaway_draws enable row level security;
alter table public.giveaway_winners enable row level security;
revoke all on table public.giveaways, public.giveaway_secrets, public.giveaway_entries, public.giveaway_draws, public.giveaway_winners from anon, authenticated;
grant select, insert, update, delete on table public.giveaways to authenticated;
grant select, update on table public.giveaway_entries to authenticated;
grant select on table public.giveaway_draws to authenticated;
grant select, update on table public.giveaway_winners to authenticated;
-- giveaway_secrets: no grants and no policies at all

create policy "giveaways: read when published" on public.giveaways for select to authenticated
  using (status <> 'draft' or (select public.is_admin()));
create policy "giveaways: admin manages" on public.giveaways for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "giveaway entries: read own" on public.giveaway_entries for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "giveaway entries: admin marks invalid" on public.giveaway_entries for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- An entry's validity is decided before entries close, with a reason, and only that can change
create or replace function public.giveaway_entries_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.giveaway_id, new.entry_no, new.user_id, new.email_hash, new.route, new.rules_version, new.accepted_at)
     is distinct from (old.giveaway_id, old.entry_no, old.user_id, old.email_hash, old.route, old.rules_version, old.accepted_at)
     and current_user in ('authenticated', 'anon') then
    raise exception 'Only an entry''s validity can change' using errcode = '42501';
  end if;
  if (new.valid, new.invalid_reason) is distinct from (old.valid, old.invalid_reason) then
    if now() >= (select g.closes_at from public.giveaways g where g.id = new.giveaway_id) then
      raise exception 'Entries have closed, so validity is fixed' using errcode = 'P0001';
    end if;
    if not new.valid and coalesce(btrim(new.invalid_reason), '') = '' then
      raise exception 'Say why the entry is invalid' using errcode = 'P0001';
    end if;
    if new.valid then new.invalid_reason := null; end if;
  end if;
  return new;
end $$;
revoke all on function public.giveaway_entries_guard() from public, anon, authenticated;
create trigger giveaway_entries_guard before update on public.giveaway_entries
  for each row execute function public.giveaway_entries_guard();
create policy "giveaway draws: public record" on public.giveaway_draws for select to authenticated using (true);
create policy "giveaway winners: read own" on public.giveaway_winners for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "giveaway winners: admin manages" on public.giveaway_winners for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Admin: make the secret on the server (nobody chooses it) and publish its fingerprint. Only while still a draft.
create or replace function public.giveaway_seal(p_giveaway uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_seed text := encode(extensions.gen_random_bytes(24), 'hex'); v_hash text;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if not exists (select 1 from public.giveaways where id = p_giveaway and status = 'draft' and seed_hash is null) then
    raise exception 'Only an unsealed draft can be sealed' using errcode = 'P0001';
  end if;
  v_hash := encode(extensions.digest(v_seed, 'sha256'), 'hex');
  insert into public.giveaway_secrets (giveaway_id, seed) values (p_giveaway, v_seed);
  update public.giveaways set seed_hash = v_hash, sealed_at = now() where id = p_giveaway;
  return v_hash;
end $$;
revoke all on function public.giveaway_seal(uuid) from public, anon;
grant execute on function public.giveaway_seal(uuid) to authenticated;

-- One entry per person. Free: no plan or purchase needed. Entering again returns the same number. A person is a
-- confirmed email on an account at least 7 days old, one entry per normalised email across both routes.
create or replace function public.enter_giveaway(p_giveaway uuid, p_rules_version text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_g public.giveaways;
  v_no int;
  v_user auth.users;
  v_hash text;
begin
  if v_me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into v_user from auth.users where id = v_me;
  if v_user.email is null or v_user.email_confirmed_at is null then
    raise exception 'Confirm your email first' using errcode = 'P0001';
  end if;
  if v_user.created_at > now() - interval '7 days' then
    raise exception 'Draws are open to accounts at least 7 days old' using errcode = 'P0001';
  end if;
  if not public.rate_ok(v_me, 'giveaway', 10, interval '1 hour') then
    raise exception 'That''s a lot of tries. Try again in an hour.' using errcode = 'P0001';
  end if;
  select * into v_g from public.giveaways where id = p_giveaway;
  if not found or v_g.status <> 'open' or now() < v_g.opens_at or now() >= v_g.closes_at then
    raise exception 'This draw isn''t open for entries' using errcode = 'P0001';
  end if;
  if p_rules_version is distinct from v_g.rules_version then
    raise exception 'The rules have changed. Read the new version, then enter.' using errcode = 'P0001';
  end if;
  select entry_no into v_no from public.giveaway_entries where giveaway_id = p_giveaway and user_id = v_me;
  if v_no is not null then return v_no; end if;
  -- Numbers are handed out one at a time
  perform pg_advisory_xact_lock(hashtext('giveaway:' || p_giveaway::text));
  v_hash := public.email_norm_hash(v_user.email);
  if exists (select 1 from public.giveaway_entries where giveaway_id = p_giveaway and email_hash = v_hash) then
    raise exception 'This email has already entered this draw' using errcode = 'P0001';
  end if;
  select coalesce(max(entry_no), 0) + 1 into v_no from public.giveaway_entries where giveaway_id = p_giveaway;
  insert into public.giveaway_entries (giveaway_id, entry_no, user_id, email_hash, route, rules_version)
  values (p_giveaway, v_no, v_me, v_hash, 'app', v_g.rules_version);
  return v_no;
end $$;
revoke all on function public.enter_giveaway(uuid, text) from public, anon;
grant execute on function public.enter_giveaway(uuid, text) to authenticated;

-- The free web route, for people without Marble ("no purchase necessary"). Service role only: the web form's server
-- function (to be built) checks Turnstile and confirms the address by email before calling this. One entry per
-- normalised email across both routes; the address itself is never kept, only its hash.
create or replace function public.giveaway_enter_web(p_giveaway uuid, p_email text, p_rules_version text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_g public.giveaways;
  v_no int;
  v_hash text;
begin
  if coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right' using errcode = '22023'; end if;
  select * into v_g from public.giveaways where id = p_giveaway;
  if not found or v_g.status <> 'open' or now() < v_g.opens_at or now() >= v_g.closes_at then
    raise exception 'This draw isn''t open for entries' using errcode = 'P0001';
  end if;
  if p_rules_version is distinct from v_g.rules_version then
    raise exception 'The rules have changed. Read the new version, then enter.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('giveaway:' || p_giveaway::text));
  v_hash := public.email_norm_hash(p_email);
  select entry_no into v_no from public.giveaway_entries where giveaway_id = p_giveaway and email_hash = v_hash;
  if v_no is not null then return v_no; end if;
  select coalesce(max(entry_no), 0) + 1 into v_no from public.giveaway_entries where giveaway_id = p_giveaway;
  insert into public.giveaway_entries (giveaway_id, entry_no, email_hash, route, rules_version)
  values (p_giveaway, v_no, v_hash, 'web', v_g.rules_version);
  return v_no;
end $$;
revoke all on function public.giveaway_enter_web(uuid, text, text) from public, anon, authenticated;
grant execute on function public.giveaway_enter_web(uuid, text, text) to service_role;

-- Admin: the draw. Round 1 picks winners_count; a later round (a redraw for unclaimed prizes) picks p_count more,
-- never an entry already picked.
create or replace function public.giveaway_draw(p_giveaway uuid, p_count integer default null)
returns integer[] language plpgsql security definer set search_path = ''
as $$
declare
  v_g public.giveaways;
  v_seed text; v_entries int[]; v_list_hash text; v_round int; v_exclude int[]; v_count int;
  v_picks int[] := '{}'; v_n int := 0; v_h text; v_idx bigint; v_e int;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  -- A redraw picks at least one (pre-deploy review M2)
  if p_count is not null and p_count < 1 then raise exception 'Pick at least one' using errcode = '22023'; end if;
  select * into v_g from public.giveaways where id = p_giveaway for update;
  if not found or v_g.status not in ('open', 'closed', 'drawn') or now() < v_g.closes_at then
    raise exception 'The draw can only run after entries close' using errcode = 'P0001';
  end if;
  select seed into v_seed from public.giveaway_secrets where giveaway_id = p_giveaway;
  if v_seed is null or encode(extensions.digest(v_seed, 'sha256'), 'hex') <> v_g.seed_hash then
    raise exception 'The secret doesn''t match the sealed code' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(entry_no order by entry_no), '{}') into v_entries from public.giveaway_entries where giveaway_id = p_giveaway and valid;
  if cardinality(v_entries) = 0 then raise exception 'No entries' using errcode = 'P0001'; end if;
  v_list_hash := encode(extensions.digest(array_to_string(v_entries, ','), 'sha256'), 'hex');
  -- Earlier picks, gathered without NULLs: one NULL in v_exclude would make every "not = any" unknown (M2)
  select coalesce(max(d.round), 0) + 1 into v_round from public.giveaway_draws d where d.giveaway_id = p_giveaway;
  select coalesce(array_agg(p) filter (where p is not null), '{}') into v_exclude
    from public.giveaway_draws d cross join lateral unnest(d.picks) p where d.giveaway_id = p_giveaway;
  v_count := least(case when v_round = 1 then v_g.winners_count else coalesce(p_count, 1) end,
                   cardinality(v_entries) - (select count(*) from unnest(v_entries) x where x = any(v_exclude)));
  while coalesce(cardinality(v_picks), 0) < v_count and v_n < 100000 loop
    v_n := v_n + 1;
    v_h := encode(extensions.digest(v_seed || ':' || v_list_hash || ':' || v_n::text, 'sha256'), 'hex');
    v_idx := ('x' || lpad(substr(v_h, 1, 13), 16, '0'))::bit(64)::bigint % cardinality(v_entries);
    v_e := v_entries[(v_idx + 1)::int];
    if not (v_e = any(v_picks)) and not (v_e = any(v_exclude)) then v_picks := v_picks || v_e; end if;
  end loop;
  insert into public.giveaway_draws (giveaway_id, round, entries, list_hash, seed, picks, invalid)
  values (p_giveaway, v_round, v_entries, v_list_hash, v_seed, v_picks,
          coalesce((select jsonb_agg(jsonb_build_object('entry_no', e.entry_no, 'reason', e.invalid_reason) order by e.entry_no)
                    from public.giveaway_entries e where e.giveaway_id = p_giveaway and not e.valid), '[]'::jsonb));
  insert into public.giveaway_winners (giveaway_id, entry_no, round, user_id, claim_by)
  select p_giveaway, e.entry_no, v_round, e.user_id, now() + make_interval(days => v_g.claim_days)
  from public.giveaway_entries e where e.giveaway_id = p_giveaway and e.entry_no = any(v_picks);
  update public.giveaways set status = 'drawn' where id = p_giveaway;
  return v_picks;
end $$;
revoke all on function public.giveaway_draw(uuid, integer) from public, anon;
grant execute on function public.giveaway_draw(uuid, integer) to authenticated;

create or replace function public.giveaway_result(p_giveaway uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when (select auth.uid()) is null or not exists (select 1 from public.giveaways g where g.id = p_giveaway and g.status <> 'draft')
    then null else jsonb_build_object(
    'entries', (select count(*) from public.giveaway_entries e where e.giveaway_id = p_giveaway and e.valid),
    'mine', (select e.entry_no from public.giveaway_entries e where e.giveaway_id = p_giveaway and e.user_id = (select auth.uid())),
    'draws', coalesce((select jsonb_agg(jsonb_build_object('round', d.round, 'drawn_at', d.drawn_at, 'entries', d.entries,
               'list_hash', d.list_hash, 'seed', d.seed, 'picks', d.picks, 'invalid', d.invalid) order by d.round)
               from public.giveaway_draws d where d.giveaway_id = p_giveaway), '[]'::jsonb),
    'winners', coalesce((select jsonb_agg(jsonb_build_object('entry_no', w.entry_no, 'round', w.round,
               'handle', case when w.show_handle then pr.handle end, 'claim_status', w.claim_status, 'claim_by', w.claim_by,
               'reason', case when w.claim_status = 'disqualified' then w.reason end,
               'mine', w.user_id = (select auth.uid())) order by w.round, w.entry_no)
               from public.giveaway_winners w left join public.profiles pr on pr.id = w.user_id where w.giveaway_id = p_giveaway), '[]'::jsonb))
  end
$$;
revoke all on function public.giveaway_result(uuid) from public, anon;
grant execute on function public.giveaway_result(uuid) to authenticated;

create or replace function public.giveaway_show_handle(p_giveaway uuid, p_show boolean)
returns void language sql security definer set search_path = ''
as $$
  update public.giveaway_winners set show_handle = coalesce(p_show, false)
  where giveaway_id = p_giveaway and user_id = (select auth.uid())
$$;
revoke all on function public.giveaway_show_handle(uuid, boolean) from public, anon;
grant execute on function public.giveaway_show_handle(uuid, boolean) to authenticated;

commit;
