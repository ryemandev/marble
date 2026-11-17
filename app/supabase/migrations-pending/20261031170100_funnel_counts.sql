-- The trial funnel: first-party, no cookies, nothing that identifies anyone. NOT APPLIED. Written 29 October 2026 for
-- review. Apply it with the app and website build that counts steps (src/live/funnel.js). Before it's applied, that
-- build's counts go nowhere (each call fails quietly) and the Admin page says the funnel isn't set up yet.
--
-- The nine steps, in order. Four are anonymous daily tallies the browser adds one to; five are worked out when the
-- report is read, from records Marble already keeps, and only ever leave this file's functions as counts. Days are UTC.
--   visit              tally    a page of the website loaded (the home page or a section page), once per page load
--   signup_started     derived  auth.users.created_at: a new sign-in account. An email asking for its first link makes
--                               one before it's confirmed; Google or Discord make one as they sign in. The sign-in
--                               screen is one button for signing in and signing up, so only the database can tell which.
--   account_confirmed  derived  profiles.created_at: the profile is made at the first real sign-in (the email
--                               confirmed, or Google or Discord), never at sign-up (20261029180100)
--   setup_done         tally    the first-time setup was saved (Gate.jsx, Onboarding)
--   first_trade        derived  per trader, the earliest of their trades (trades.created_at, when the row was written:
--                               typed, imported or synced) and their imports that added trades (imports.created_at, kept
--                               after an undo). The example desk never reaches the database, so it can't count.
--   plan_seen          tally    the plan screen was shown to a signed-in trader without access (Gate.jsx, Plan)
--   checkout_started   tally    Stripe Checkout was about to open, for any plan (billing.js, checkout())
--   trial_started      derived  per trader, their first trial plan's subscriptions.created_at. A trial plan is one with
--                               trial_end more than an hour after it was made: Stripe ends a trial at once when the card
--                               has had one before (supabase/functions/_shared/webhook.js), and that plan paid from day one.
--   trial_converted    derived  per trader, once, on the earliest of:
--                               - a trial plan's trial_end (when the first payment fell due), if that was over 2 hours
--                                 ago (Stripe collects about an hour after) and the plan is now active (paid), or is
--                                 past_due, unpaid or canceled with current_period_end at least 28 days after trial_end.
--                                 The webhook only moves current_period_end a period past the trial once that period
--                                 is paid: a failed first payment leaves it at trial_end, a plan cancelled in its trial
--                                 ends by trial_end, and Stripe's retries cancel an unpaid one within about 2 weeks.
--                               - lifetime bought instead: a lifetime_purchases row, not refunded, made at or after the
--                                 trader's first trial began (buying lifetime ends the trial)
--   An account deleted since drops out of the derived counts (its rows go with it); the tallies keep their numbers.
--
-- What it makes:
--   funnel_counts        one row per UTC day and browser step: the day, the step's name and a number. Nothing else:
--                        no user, no IP, no device or browser, no referrer, no time of day.
--   funnel_cap(step)     the most one step can count in a day: far above anything real, so a script can't run a
--                        number up for ever (a day that reaches it is flagged in the report)
--   funnel_step(step)    the browser's call, for anyone (sent without the trader's sign-in): adds one to today's row
--                        for one of the four browser steps, up to the cap. Anything else is ignored. Returns nothing.
--   funnel_report(days)  admins only: each step's total for the last 7, 30 or 90 days, with a series per day
--
-- Access: row level security on funnel_counts with NO policies, and every grant to anon and authenticated taken away:
-- nobody reads or writes the table directly. funnel_step is the only way in and funnel_report the only way out.
-- Read the tallies in the SQL editor:
--   select day, step, n from public.funnel_counts order by day desc, step;
-- Undo:
--   drop function if exists public.funnel_report(integer), public.funnel_step(text), public.funnel_cap(text);
--   drop table if exists public.funnel_counts;

begin;

create table public.funnel_counts (
  day date not null,
  step text not null constraint funnel_counts_step_check check (step in ('visit', 'setup_done', 'plan_seen', 'checkout_started')),
  n bigint not null default 0 check (n >= 0),
  primary key (day, step)
);
comment on table public.funnel_counts is 'Trial funnel: anonymous daily tallies of the four steps the browser sees (UTC day, step, count). Nothing about who.';

alter table public.funnel_counts enable row level security;
-- (No policies on purpose. Supabase grants new tables to anon and authenticated by default; take that away too.)
revoke all on table public.funnel_counts from anon, authenticated;

create or replace function public.funnel_cap(p_step text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_step
    when 'visit' then 100000
    when 'plan_seen' then 20000
    when 'setup_done' then 5000
    when 'checkout_started' then 5000
  end::bigint
$$;
revoke all on function public.funnel_cap(text) from public, anon, authenticated;

create or replace function public.funnel_step(p_step text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the steps a browser sees. The rest are worked out from Marble's own records, so nothing here can add to them.
  if p_step is null or p_step not in ('visit', 'setup_done', 'plan_seen', 'checkout_started') then return; end if;
  insert into public.funnel_counts as f (day, step, n)
  values ((now() at time zone 'utc')::date, p_step, 1)
  on conflict (day, step) do update set n = f.n + 1
   where f.n < public.funnel_cap(p_step);
end;
$$;
revoke all on function public.funnel_step(text) from public, anon, authenticated;
grant execute on function public.funnel_step(text) to anon, authenticated;

-- { days, from, to, steps: [{ step, total, series (one number a day, oldest first), capped }] }, in funnel order.
-- People's rows are only ever counted in here; sums are all that leave.
create or replace function public.funnel_report(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_to date := (now() at time zone 'utc')::date;
  v_from date;
  v_since timestamptz;
  v_out jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  v_from := v_to - (v_days - 1);
  v_since := v_from::timestamp at time zone 'utc';

  with
  -- A trial plan: it began with free days (not one Stripe ended at once because the card had had a trial)
  trials as (
    select s.user_id, s.created_at, s.trial_end, s.status, s.current_period_end
      from public.subscriptions s
     where s.trial_end is not null and s.trial_end > s.created_at + interval '1 hour'
  ),
  first_trial as (select t.user_id, min(t.created_at) as at from trials t group by t.user_id),
  converted as (
    select c.user_id, min(c.at) as at from (
      select t.user_id, t.trial_end as at from trials t
       where t.trial_end < now() - interval '2 hours'
         and (t.status = 'active'
              or (t.status in ('past_due', 'unpaid', 'canceled') and t.current_period_end >= t.trial_end + interval '28 days'))
      union all
      select l.user_id, l.created_at from public.lifetime_purchases l
        join first_trial f on f.user_id = l.user_id
       where not l.refunded and l.created_at >= f.at
    ) c group by c.user_id
  ),
  first_trade as (
    select x.user_id, min(x.at) as at from (
      select t.user_id, t.created_at as at from public.trades t
      union all
      select i.user_id, i.created_at from public.imports i where i.added > 0
    ) x group by x.user_id
  ),
  -- Every step as (step, UTC day, how many)
  events (step, day, n) as (
    select f.step, f.day, f.n from public.funnel_counts f where f.day between v_from and v_to
    union all
    select 'signup_started', (u.created_at at time zone 'utc')::date, 1 from auth.users u where u.created_at >= v_since
    union all
    select 'account_confirmed', (p.created_at at time zone 'utc')::date, 1 from public.profiles p where p.created_at >= v_since
    union all
    select 'first_trade', (x.at at time zone 'utc')::date, 1 from first_trade x where x.at >= v_since
    union all
    select 'trial_started', (x.at at time zone 'utc')::date, 1 from first_trial x where x.at >= v_since
    union all
    select 'trial_converted', (x.at at time zone 'utc')::date, 1 from converted x where x.at >= v_since
  ),
  steps (step, ord) as (
    values ('visit', 1), ('signup_started', 2), ('account_confirmed', 3), ('setup_done', 4), ('first_trade', 5),
           ('plan_seen', 6), ('checkout_started', 7), ('trial_started', 8), ('trial_converted', 9)
  ),
  days (day) as (select v_from + i from generate_series(0, v_days - 1) i),
  grid as (
    select s.step, s.ord, d.day, coalesce(sum(e.n), 0)::bigint as n
      from steps s
     cross join days d
      left join events e on e.step = s.step and e.day = d.day
     group by s.step, s.ord, d.day
  )
  select jsonb_build_object(
           'days', v_days, 'from', v_from, 'to', v_to,
           'steps', jsonb_agg(jsonb_build_object('step', g.step, 'total', g.total, 'series', g.series, 'capped', g.capped) order by g.ord))
    into v_out
    from (
      -- A tally that reached its cap on any day is flagged: part of that day may be a script (the cap is null for
      -- the derived steps, so they never are)
      select r.step, r.ord, sum(r.n)::bigint as total, jsonb_agg(r.n order by r.day) as series,
             coalesce(bool_or(r.n >= public.funnel_cap(r.step)), false) as capped
        from grid r
       group by r.step, r.ord
    ) g;
  return v_out;
end;
$$;
revoke all on function public.funnel_report(integer) from public, anon, authenticated;
grant execute on function public.funnel_report(integer) to authenticated;

commit;
