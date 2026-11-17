-- Community rework, part 3 of 4: the discipline leaderboards, crew standings and the house cup.
-- NOT APPLIED. Written 29 October 2026 for review. Needs part 1 (crew_members).
--
-- The scoring is the same as the app's src/views/community/scoring.js (unit tested in tests/community.test.js);
-- change one and you must change the other.
--   A trading day is a New York date with at least one trade from an import or a sync (hand-typed trades never count).
--   Boards are self-reported: an import is a file the trader made, and the rules are the trader's own (capped below).
--   Competitions count synced trades only (written by Marble's server, never the browser; security audit 2, H1),
--   work out R from the cup's fixed risk unit, never the trader's own stop, and ignore the self-marked 'plan'.
--   A day keeps every rule unless: its running P&L went below minus the daily loss limit ('loss'), it had more trades
--   than the limit ('trades'), a trade was taken after the losses-in-a-row limit was reached ('streak'), or a trade was
--   marked as not following the plan ('plan'). Competitions add a most-a-trade-may-lose rule ('size').
--   R: each trade's R, capped at +3R (a trade with no R counts 0). Losses aren't capped. In a competition a trade's R
--   is its P&L over the cup's risk unit (max_trade_loss_pct of the account size the broker reported at entry).
--   Board rules are capped so a rule can't be set loose enough never to break: at most 20 trades a day, at most 5
--   losses in a row, and a loss limit of at most 5% of the largest balance the trader's Topstep connection reports.
--   Disciplined R (the score) = R on days that kept every rule, minus 2R for each day that broke one.
--   Leaderboards rank on rules kept % (kept days / traded days), then disciplined R, then fewer trades.
--   Crew standings rank on rules kept %, then R. Both need a minimum number of trading days: week 2, month 5, season 10.
--   House cup: each crew's average rules kept %, across its members on the boards who traded 5+ days that month,
--   shown once at least 3 qualify.
--   Periods (New York dates): week = Monday to Friday of this week; month = this calendar month; season = this month and
--   the two before it.
--
-- What it makes or changes:
--   profile_private.show_on_boards   the opt-in, off by default (the trader can change it)
--   discipline_rules                 each trader's daily rules as they stood at the start of a month, written the first
--                                    time they change them that month, so loosening rules mid-month doesn't help
--   discipline_days(who, from, to)   internal: every trading day's verdict for a set of traders (also used by part 4)
--   board_period(period, today)      internal: a period's first and last day
--   leaderboard(period, crew, order) aggregates for opted-in traders only: rank, handle, crew, days kept of days traded,
--                                    R, disciplined R, streak, the day-by-day strip and the move since yesterday. Never
--                                    trades, never dollars, never a win rate.
--   house_cup(period)                each crew's average and place, and the caller's own crew and next change date

begin;

-- ---------- The opt-in ----------
alter table public.profile_private add column show_on_boards boolean not null default false;
grant update (show_on_boards) on table public.profile_private to authenticated;
grant insert (show_on_boards) on table public.profile_private to authenticated;

-- ---------- Rules locked at the start of each month ----------
create table public.discipline_rules (
  user_id uuid not null references public.profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  daily_loss_limit numeric,
  max_trades integer,
  stop_after_losses integer,
  locked_at timestamptz not null default now(),
  primary key (user_id, month)
);
comment on table public.discipline_rules is 'A trader''s daily rules as they stood at the start of a month (written the first time they change that month). The boards judge a period on these.';
alter table public.discipline_rules enable row level security;
revoke all on table public.discipline_rules from anon, authenticated;
grant select on table public.discipline_rules to authenticated;
create policy "discipline rules: read own" on public.discipline_rules for select to authenticated using (user_id = (select auth.uid()));

-- The first change of the month keeps the rules as they were. A trader setting rules for the first time isn't locked.
create or replace function public.discipline_rules_lock()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.daily_loss_limit is distinct from old.daily_loss_limit or new.max_trades is distinct from old.max_trades
      or new.stop_after_losses is distinct from old.stop_after_losses)
     and num_nonnulls(old.daily_loss_limit, old.max_trades, old.stop_after_losses) > 0 then
    insert into public.discipline_rules (user_id, month, daily_loss_limit, max_trades, stop_after_losses)
    values (old.id, date_trunc('month', now() at time zone 'America/New_York')::date, old.daily_loss_limit, old.max_trades, old.stop_after_losses)
    on conflict (user_id, month) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.discipline_rules_lock() from public, anon, authenticated;
create trigger discipline_rules_lock before update on public.profile_private
  for each row execute function public.discipline_rules_lock();

-- ---------- Periods ----------
create or replace function public.board_period(p_period text, p_today date)
returns table (f date, t date) language sql immutable set search_path = ''
as $$
  select case p_period
           when 'week' then p_today - (extract(isodow from p_today)::int - 1)
           when 'season' then (date_trunc('month', p_today) - interval '2 months')::date
           else date_trunc('month', p_today)::date end,
         case p_period
           when 'week' then p_today - (extract(isodow from p_today)::int - 1) + 4
           else (date_trunc('month', p_today) + interval '1 month' - interval '1 day')::date end
$$;

-- ---------- Every trading day's verdict ----------
-- p_who: [{user_id, account_id?, loss_limit?, max_trades?, stop_after?, max_trade_loss?, sync_only?, risk_unit?}]
-- (account_id limits it to one account, for a competition; sync_only counts synced trades only and ignores the
-- self-marked plan; risk_unit, in money, makes R = P&L / risk_unit). Returns one row per trader per trading day:
-- trades, R (capped) and the rules broken.
create or replace function public.discipline_days(p_who jsonb, p_from date, p_to date)
returns table (user_id uuid, day date, trades integer, r numeric, broke text[])
language sql stable security definer set search_path = ''
as $$
  with who as (
    select * from jsonb_to_recordset(coalesce(p_who, '[]'::jsonb))
      as w(user_id uuid, account_id uuid, loss_limit numeric, max_trades integer, stop_after integer, max_trade_loss numeric,
           sync_only boolean, risk_unit numeric)
  ),
  t as (
    select w.user_id, w.loss_limit, w.max_trades, w.stop_after, w.max_trade_loss,
           (tr.traded_at at time zone 'America/New_York')::date as day, tr.traded_at, tr.id, tr.pnl,
           case when w.risk_unit > 0 then least(round(tr.pnl / w.risk_unit, 4), 3) else least(coalesce(tr.r, 0), 3) end as rc,
           case when coalesce(w.sync_only, false) then null else tr.followed_plan end as followed_plan
    from who w join public.trades tr on tr.user_id = w.user_id and (w.account_id is null or tr.account_id = w.account_id)
    where (tr.source = 'sync' or (tr.source = 'import' and not coalesce(w.sync_only, false)))
      and tr.traded_at >= (p_from::timestamp at time zone 'America/New_York')
      and tr.traded_at < ((p_to + 1)::timestamp at time zone 'America/New_York')
  ),
  s1 as (
    select t.*,
           sum(t.pnl) over w1 as running,
           -- each trade that isn't a loss starts a new run, so a run's losses are in a row
           sum(case when t.pnl < 0 then 0 else 1 end) over w1 as run_id
    from t window w1 as (partition by t.user_id, t.day order by t.traded_at, t.id rows between unbounded preceding and current row)
  ),
  s2 as (
    select s1.*,
           case when s1.pnl < 0 then count(*) filter (where s1.pnl < 0) over (partition by s1.user_id, s1.day, s1.run_id
             order by s1.traded_at, s1.id rows between unbounded preceding and current row) else 0 end as loss_run
    from s1
  ),
  s3 as (
    select s2.*, coalesce(lag(s2.loss_run) over (partition by s2.user_id, s2.day order by s2.traded_at, s2.id), 0) as losses_before
    from s2
  )
  select s3.user_id, s3.day, count(*)::int, round(sum(s3.rc), 2),
         array_remove(array[
           case when bool_or(s3.loss_limit is not null and s3.running < -s3.loss_limit) then 'loss' end,
           case when max(s3.max_trades) is not null and count(*) > max(s3.max_trades) then 'trades' end,
           case when bool_or(s3.stop_after is not null and s3.losses_before >= s3.stop_after) then 'streak' end,
           case when bool_or(s3.followed_plan = false) then 'plan' end,
           case when bool_or(s3.max_trade_loss is not null and s3.pnl < -s3.max_trade_loss) then 'size' end
         ], null)
  from s3 group by s3.user_id, s3.day
$$;
revoke all on function public.discipline_days(jsonb, date, date) from public, anon, authenticated;

-- The traders on the boards (optionally one crew), with their rules as they stood when the period began, capped
-- (20 trades a day, 5 losses in a row, a loss limit of 5% of the largest Topstep balance their connection reports)
create or replace function public.board_who(p_from date, p_crew text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', x.id,
           'loss_limit', case when x.size > 0 then least(x.l, x.size * 0.05) else x.l end,
           'max_trades', least(x.m, 20), 'stop_after', least(x.s, 5))), '[]'::jsonb)
  from (
    select pp.id,
           (select max((a->>'balance')::numeric) from public.connections c, jsonb_array_elements(c.accounts) a
             where c.user_id = pp.id and c.platform = 'topstepx' and jsonb_typeof(a->'balance') = 'number') as size,
           case when dr.user_id is not null then dr.daily_loss_limit else pp.daily_loss_limit end as l,
           case when dr.user_id is not null then dr.max_trades else pp.max_trades end as m,
           case when dr.user_id is not null then dr.stop_after_losses else pp.stop_after_losses end as s
    from public.profile_private pp
    left join public.crew_members cm on cm.user_id = pp.id
    left join lateral (select d.* from public.discipline_rules d where d.user_id = pp.id and d.month >= date_trunc('month', p_from)::date
                       order by d.month limit 1) dr on true
    where pp.show_on_boards and (p_crew is null or cm.crew = p_crew)
  ) x
  -- Ranked on your own rules, so you need at least one
  where num_nonnulls(x.l, x.m, x.s) > 0
$$;
revoke all on function public.board_who(date, text) from public, anon, authenticated;

-- ---------- The leaderboard ----------
-- p_period: week | month | season. p_crew: null for everyone, or OLY / NITE / PIT. p_order: 'board' (rules kept %, then
-- disciplined R) or 'crew' (rules kept %, then R). Returns the top 50 and the caller's own row.
create or replace function public.leaderboard(p_period text default 'month', p_crew text default null, p_order text default 'board')
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_today date := (now() at time zone 'America/New_York')::date;
  v_from date; v_to date; v_min int; v_who jsonb; v_out jsonb; v_in boolean;
begin
  if v_me is null then return null; end if;
  -- Each call works out every opted-in trader's days, so a script can't loop it (security audit 2, L10)
  if not public.rate_ok(v_me, 'board', 60, interval '1 minute') then
    raise exception 'Give it a minute, then look again' using errcode = 'P0001';
  end if;
  if p_period not in ('week', 'month', 'season') then p_period := 'month'; end if;
  if p_crew is not null and p_crew not in ('OLY', 'NITE', 'PIT') then p_crew := null; end if;
  select f, t into v_from, v_to from public.board_period(p_period, v_today);
  v_min := case p_period when 'week' then 2 when 'season' then 10 else 5 end;
  v_who := public.board_who(v_from, p_crew);
  select coalesce(show_on_boards, false) into v_in from public.profile_private where id = v_me;

  with d as (
    select * from public.discipline_days(v_who, v_from, least(v_to, v_today))
  ),
  agg as (
    select d.user_id,
           count(*)::int as traded, count(*) filter (where cardinality(d.broke) = 0)::int as kept,
           sum(d.trades)::int as trades, round(sum(d.r), 2) as r,
           round(coalesce(sum(d.r) filter (where cardinality(d.broke) = 0), 0), 2) as kept_r,
           count(*) filter (where d.day < v_today)::int as traded_y,
           count(*) filter (where d.day < v_today and cardinality(d.broke) = 0)::int as kept_y,
           coalesce(sum(d.trades) filter (where d.day < v_today), 0)::int as trades_y,
           round(coalesce(sum(d.r) filter (where d.day < v_today), 0), 2) as r_y,
           round(coalesce(sum(d.r) filter (where d.day < v_today and cardinality(d.broke) = 0), 0), 2) as kept_r_y
    from d group by d.user_id
  ),
  scored as (
    select a.*, a.kept_r - 2 * (a.traded - a.kept) as score, a.kept_r_y - 2 * (a.traded_y - a.kept_y) as score_y,
           pr.handle, coalesce(pr.avatar_url, pr.avatar_art) as avatar, pr.cover, cm.crew,
           (select count(*) from d d2 where d2.user_id = a.user_id and cardinality(d2.broke) = 0
              and d2.day > coalesce((select max(d3.day) from d d3 where d3.user_id = a.user_id and cardinality(d3.broke) > 0), '-infinity'::date))::int as streak
    from agg a join public.profiles pr on pr.id = a.user_id left join public.crew_members cm on cm.user_id = a.user_id
  ),
  ranked as (
    select s.*,
      case when s.traded >= v_min then row_number() over (
        order by (s.traded >= v_min) desc, s.kept::numeric / s.traded desc,
                 case when p_order = 'crew' then s.r else s.score end desc, s.trades asc, s.handle asc) end as rank,
      case when s.traded_y >= v_min then row_number() over (
        order by (s.traded_y >= v_min) desc, s.kept_y::numeric / nullif(s.traded_y, 0) desc nulls last,
                 case when p_order = 'crew' then s.r_y else s.score_y end desc, s.trades_y asc, s.handle asc) end as rank_y
    from scored s
  ),
  strip_days as (
    select k from (
      select g::date as k from generate_series(v_from, v_to, interval '1 day') g where extract(isodow from g) < 6
    ) a
    where p_period <> 'season' or k <= v_today
    order by k desc limit 23
  ),
  shown as (
    select r.* from ranked r where (r.rank is not null and r.rank <= 50) or r.user_id = v_me
  )
  select jsonb_build_object(
    'period', p_period, 'from', v_from, 'to', v_to, 'today', v_today, 'min_days', v_min, 'opted_in', v_in,
    'total', (select count(*) from ranked where rank is not null),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'rank', s.rank, 'move', case when s.rank is not null and s.rank_y is not null then s.rank_y - s.rank end,
        'handle', s.handle, 'avatar', s.avatar, 'cover', nullif(s.cover, ''), 'crew', s.crew, 'mine', s.user_id = v_me,
        'traded', s.traded, 'kept', s.kept, 'trades', s.trades, 'r', s.r, 'kept_r', s.kept_r, 'score', s.score, 'streak', s.streak,
        'strip', (select string_agg(case when dd.user_id is null then case when sd.k > v_today then '.' else '-' end
                                         when cardinality(dd.broke) = 0 then 'k' else 'b' end, '' order by sd.k)
                  from strip_days sd left join d dd on dd.user_id = s.user_id and dd.day = sd.k))
      order by s.rank nulls last) from shown s), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.leaderboard(text, text, text) from public, anon;
grant execute on function public.leaderboard(text, text, text) to authenticated;

-- ---------- The house cup ----------
create or replace function public.house_cup(p_period text default 'month')
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_today date := (now() at time zone 'America/New_York')::date;
  v_from date; v_to date; v_who jsonb; v_out jsonb;
begin
  if v_me is null then return null; end if;
  -- Each call works out every opted-in trader's days, so a script can't loop it (security audit 2, L10)
  if not public.rate_ok(v_me, 'board', 60, interval '1 minute') then
    raise exception 'Give it a minute, then look again' using errcode = 'P0001';
  end if;
  select f, t into v_from, v_to from public.board_period(coalesce(p_period, 'month'), v_today);
  select coalesce(jsonb_agg(w || jsonb_build_object('crew', cm.crew)), '[]'::jsonb) into v_who
  from jsonb_array_elements(public.board_who(v_from, null)) w join public.crew_members cm on cm.user_id = (w->>'user_id')::uuid
  where cm.crew is not null;

  with d as (select * from public.discipline_days(v_who, v_from, least(v_to, v_today))),
  per as (
    select (w->>'crew') as crew, d.user_id, count(*) as traded, count(*) filter (where cardinality(d.broke) = 0) as kept
    from d join jsonb_array_elements(v_who) w on (w->>'user_id')::uuid = d.user_id
    group by 1, 2
  ),
  crews as (
    select c.crew,
           (select count(*) from public.crew_members m where m.crew = c.crew)::int as members,
           (select count(*) from per p where p.crew = c.crew and p.traded >= 5)::int as qualifying,
           (select round(avg(p.kept::numeric / p.traded) * 100, 1) from per p where p.crew = c.crew and p.traded >= 5) as pct
    from (values ('OLY'), ('NITE'), ('PIT')) c(crew)
  ),
  -- A crew's figure shows once at least 3 of its members qualify
  placed as (
    select c.*, case when c.qualifying >= 3 then c.pct end as shown_pct,
           case when c.qualifying >= 3 then rank() over (order by case when c.qualifying >= 3 then c.pct end desc nulls last) end as place
    from crews c
  )
  select jsonb_build_object(
    'period', coalesce(p_period, 'month'), 'from', v_from, 'to', v_to,
    'crews', (select jsonb_agg(jsonb_build_object('crew', c.crew, 'members', c.members, 'qualifying', c.qualifying,
                'pct', c.shown_pct, 'place', c.place) order by c.crew)
              from placed c),
    'mine', (select jsonb_build_object('crew', m.crew, 'changed_at', m.changed_at, 'next_change', m.changed_at + interval '30 days')
             from public.crew_members m where m.user_id = v_me)
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.house_cup(text) from public, anon;
grant execute on function public.house_cup(text) to authenticated;

commit;
