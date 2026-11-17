-- The audit of 2 November 2026: the admin functions that still let an admin in on a password (or an email code) alone
-- now need two-step sign-in as well, like every other admin screen (admin_gate): the payouts due, with each
-- referrer's payout details (admin_payouts_due), marking a payout paid (admin_mark_paid) and the trial funnel
-- (funnel_report). And the feed never hands out an anonymous post's picture: its address carries the author's id.

create or replace function public.admin_payouts_due()
 returns table(user_id uuid, handle citext, name text, method text, destination text, amount_pence bigint, lines bigint, oldest timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform public.admin_gate();
  perform public.approve_due_commissions();
  return query
    select c.referrer_id, p.handle, p.name, s.method, s.destination, sum(c.amount_pence)::bigint, count(*), min(c.created_at)
    from public.commissions c
    join public.profiles p on p.id = c.referrer_id
    left join public.payout_settings s on s.user_id = c.referrer_id
    where c.status = 'approved'
    group by c.referrer_id, p.handle, p.name, s.method, s.destination
    having sum(c.amount_pence) >= 5000
    order by sum(c.amount_pence) desc;
end $function$;

create or replace function public.admin_mark_paid(p_user uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  total bigint;
  how text;
  pid uuid;
begin
  perform public.admin_gate();
  perform pg_advisory_xact_lock(hashtext('marble_payout:' || p_user::text));
  perform 1 from public.commissions where referrer_id = p_user and status = 'approved' for update;
  select coalesce(sum(amount_pence), 0) into total from public.commissions where referrer_id = p_user and status = 'approved';
  if total < 5000 then raise exception 'Under the £50 minimum'; end if;
  select method into how from public.payout_settings where user_id = p_user;
  if how is null then raise exception 'No payout details on file'; end if;
  insert into public.payouts (user_id, amount_pence, method, status, paid_at) values (p_user, total, how, 'sent', now()) returning id into pid;
  update public.commissions set status = 'paid', payout_id = pid where referrer_id = p_user and status = 'approved';
  return pid;
end $function$;

create or replace function public.funnel_report(p_days integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_days int := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_to date := (now() at time zone 'utc')::date;
  v_from date;
  v_since timestamptz;
  v_out jsonb;
begin
  perform public.admin_gate();
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
$function$;

create or replace function public.feed(p_crew text default null::text, p_kind text default null::text, p_before timestamp with time zone default now(), p_limit integer default 30, p_anonymous boolean default null::boolean, p_parent uuid default null::uuid)
 returns table(id uuid, kind text, crew text, parent_id uuid, body text, trade jsonb, image_url text, created_at timestamp with time zone, author_handle citext, author_name text, author_avatar text, anonymous boolean, mine boolean, replies bigint, likes bigint, liked boolean, share jsonb)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.id, p.kind,
         case when p.anonymous then null else p.crew end,
         p.parent_id, p.body, p.trade,
         case when p.anonymous then null else p.image_url end,
         p.created_at,
         case when p.anonymous then null else pr.handle end,
         case when p.anonymous then null else pr.name end,
         case when p.anonymous then null else coalesce(pr.avatar_url, pr.avatar_art) end,
         p.anonymous, p.user_id = (select auth.uid()),
         (select count(*) from public.posts c where c.parent_id = p.id and not c.hidden),
         (select count(*) from public.post_reactions r where r.post_id = p.id),
         exists (select 1 from public.post_reactions r where r.post_id = p.id and r.user_id = (select auth.uid())),
         case when p.share_id is not null then
           (select case when (c ->> 'gone')::boolean then null else c end from (select public.share_card(p.share_id, (select auth.uid())) as c) sc) end
  from public.posts p join public.profiles pr on pr.id = p.user_id
  where not p.hidden and (select auth.uid()) is not null
    and (case when p_parent is null then p.parent_id is null and p.kind <> 'reply' else p.parent_id = p_parent end)
    and (p_parent is null or not exists (select 1 from public.posts h where h.id = p_parent and h.hidden))
    and (p.anonymous or not exists (select 1 from public.dm_blocks b where b.blocker = (select auth.uid()) and b.blocked = p.user_id))
    and (p_kind is null or p.kind = p_kind)
    and (p_crew is null or (p.crew = p_crew and not p.anonymous))
    and (p_anonymous is null or p.anonymous = p_anonymous)
    and p.created_at < p_before
  order by case when p_parent is null then p.created_at end desc, p.created_at asc
  limit least(greatest(p_limit, 1), 100)
$function$;;
