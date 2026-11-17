create table public.funnel_counts (
  day date not null,
  step text not null constraint funnel_counts_step_check check (step in ('visit', 'setup_done', 'plan_seen', 'checkout_started')),
  n bigint not null default 0 check (n >= 0),
  primary key (day, step)
);
comment on table public.funnel_counts is 'Trial funnel: anonymous daily tallies of the four steps the browser sees (UTC day, step, count). Nothing about who.';

alter table public.funnel_counts enable row level security;
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
  if p_step is null or p_step not in ('visit', 'setup_done', 'plan_seen', 'checkout_started') then return; end if;
  insert into public.funnel_counts as f (day, step, n)
  values ((now() at time zone 'utc')::date, p_step, 1)
  on conflict (day, step) do update set n = f.n + 1
   where f.n < public.funnel_cap(p_step);
end;
$$;
revoke all on function public.funnel_step(text) from public, anon, authenticated;
grant execute on function public.funnel_step(text) to anon, authenticated;

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
      select r.step, r.ord, sum(r.n)::bigint as total, jsonb_agg(r.n order by r.day) as series,
             coalesce(bool_or(r.n >= public.funnel_cap(r.step)), false) as capped
        from grid r
       group by r.step, r.ord
    ) g;
  return v_out;
end;
$$;
revoke all on function public.funnel_report(integer) from public, anon, authenticated;
grant execute on function public.funnel_report(integer) to authenticated;;
