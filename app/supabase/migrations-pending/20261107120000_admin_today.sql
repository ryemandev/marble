-- The admin area gets uses again. Written 7 November 2026 (owner: "we need to work on the admin area its very bare and
-- really no function or uses", and "whatever u reccoemend for everything we go with that").
--
-- Read-only for everything but one: an idea's status. Every function opens with admin_gate(), so an admin with two-step only.
--   admin_today()             how far each new trader got: signed up, logged a trade, closed a day, came back on a later day.
--                             Steps only, never what they traded or the money. Plus running costs a month and crashes.
--   admin_floor()             the pinned posts, the latest posts and every idea with its votes.
--   admin_idea_status(id, s)  Under review, Planned, In progress or Shipped, written to the admin log.
--   admin_crashes()           crash reports for 30 days, the same crash counted once.
--   admin_costs()             the running costs (admin_cost_save and admin_cost_delete already exist).
-- admin_overview also counts crashes in the last 24 hours and ideas waiting for a status.

create or replace function public.admin_today()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'at', now(),
    'funnel', (select jsonb_build_object(
        'accounts', count(*),
        'traded', count(*) filter (where exists (select 1 from public.trades t where t.user_id = p.id)),
        'closed', count(*) filter (where exists (select 1 from public.closes c where c.user_id = p.id)),
        'back', count(*) filter (where exists (select 1 from public.active_days a where a.user_id = p.id and a.day > (p.created_at at time zone 'utc')::date)))
      from public.profiles p),
    'recent', coalesce((select jsonb_agg(x order by x.joined desc) from (
        select p.id, p.handle, coalesce(p.avatar_url, p.avatar_art) as avatar, p.created_at as joined,
               (select pp.heard_from from public.profile_private pp where pp.id = p.id) as heard,
               exists (select 1 from public.trades t where t.user_id = p.id) as traded,
               exists (select 1 from public.closes c where c.user_id = p.id) as closed,
               exists (select 1 from public.active_days a where a.user_id = p.id and a.day > (p.created_at at time zone 'utc')::date) as back,
               (select max(a.day) from public.active_days a where a.user_id = p.id) as last_active,
               exists (select 1 from public.admins ad where ad.user_id = p.id) as admin
        from public.profiles p order by p.created_at desc limit 30) x), '[]'::jsonb),
    'costs', jsonb_build_object(
        'month_pence', coalesce((select sum(case when c.every = 'year' then round(c.pence / 12.0) else c.pence end)
                                 from public.admin_costs c where c.since <= v_today and (c.until is null or c.until >= v_today)), 0),
        'items', (select count(*) from public.admin_costs c where c.until is null or c.until >= v_today)),
    'emails', jsonb_build_object(
        'welcome_7d', (select count(*) from public.email_events e where e.kind = 'welcome' and e.created_at > now() - interval '7 days'),
        'signups_7d', (select count(*) from public.profiles p where p.created_at > now() - interval '7 days')),
    'crashes', jsonb_build_object(
        'day', (select count(distinct c.fingerprint) from public.crash_reports c where c.received_at > now() - interval '24 hours'),
        'week', (select count(distinct c.fingerprint) from public.crash_reports c where c.received_at > now() - interval '7 days'))
  );
end $$;

create or replace function public.admin_floor()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'posts', coalesce((select jsonb_agg(x order by x.pinned_at desc nulls last, x.created_at desc) from (
        select p.id, p.kind, left(p.body, 600) as body, p.created_at, p.pinned_at, p.hidden, p.anonymous,
               case when p.anonymous then null else pr.handle end as handle,
               (select count(*) from public.posts c where c.parent_id = p.id) as replies,
               (select count(*) from public.post_reactions r where r.post_id = p.id) as likes
        from public.posts p join public.profiles pr on pr.id = p.user_id
        where p.parent_id is null and p.kind <> 'reply' and (p.pinned_at is not null or p.created_at > now() - interval '30 days')
        order by p.pinned_at desc nulls last, p.created_at desc limit 40) x), '[]'::jsonb),
    'ideas', coalesce((select jsonb_agg(x order by x.votes desc, x.created_at desc) from (
        select i.id, i.title, left(i.body, 600) as body, i.area, i.status, i.created_at, pr.handle,
               (select count(*) from public.idea_votes v where v.idea_id = i.id) as votes
        from public.ideas i join public.profiles pr on pr.id = i.user_id) x), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_idea_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_title text;
  v_was text;
begin
  perform public.admin_gate();
  if p_status not in ('Under review', 'Planned', 'In progress', 'Shipped') then
    raise exception 'Under review, Planned, In progress or Shipped' using errcode = '22023';
  end if;
  select title, status into v_title, v_was from public.ideas where id = p_id;
  if not found then raise exception 'That idea is gone' using errcode = 'P0001'; end if;
  update public.ideas set status = p_status where id = p_id;
  perform public.admin_note('idea.status', 'idea', p_id::text, jsonb_build_object('title', left(v_title, 120), 'from', v_was, 'to', p_status));
end $$;

create or replace function public.admin_crashes()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return coalesce((select jsonb_agg(x order by x.last desc) from (
    select c.fingerprint, count(*) as n, count(distinct c.user_hash) as people, min(c.received_at) as first, max(c.received_at) as last,
           (array_agg(c.message order by c.received_at desc))[1] as message,
           (array_agg(c.kind order by c.received_at desc))[1] as kind,
           (array_agg(c.view order by c.received_at desc))[1] as view,
           (array_agg(c.path order by c.received_at desc))[1] as path,
           (array_agg(c.stack order by c.received_at desc))[1] as stack,
           array_agg(distinct c.build) filter (where c.build is not null) as builds,
           array_agg(distinct c.device) filter (where c.device is not null) as devices,
           array_agg(distinct c.browser) filter (where c.browser is not null) as browsers
    from public.crash_reports c where c.received_at > now() - interval '30 days'
    group by c.fingerprint order by max(c.received_at) desc limit 50) x), '[]'::jsonb);
end $$;

create or replace function public.admin_costs()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return coalesce((select jsonb_agg(to_jsonb(c) order by (c.until is not null and c.until < current_date), c.pence desc, c.name)
                   from public.admin_costs c), '[]'::jsonb);
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_weeks jsonb;
begin
  perform public.admin_gate();
  select jsonb_agg(w.n order by w.k desc) into v_weeks from (
    select k, (select count(*) from public.profiles p
                where p.created_at > now() - make_interval(days => 7 * (k + 1)) and p.created_at <= now() - make_interval(days => 7 * k))::int as n
    from generate_series(0, 12) k) w;
  return jsonb_build_object(
    'at', now(),
    'traders', (select count(*) from public.profiles),
    'signups', jsonb_build_object(
      'week', (select count(*) from public.profiles p where p.created_at > now() - interval '7 days'),
      'prev', (select count(*) from public.profiles p where p.created_at > now() - interval '14 days' and p.created_at <= now() - interval '7 days'),
      'weeks', coalesce(v_weeks, '[]'::jsonb)),
    'needs', jsonb_build_object(
      'reports', (select count(distinct coalesce(r.post_id, r.message_id, r.idea_id)) from public.reports r where r.resolved_at is null),
      'dm_reports', (select count(*) from public.dm_reports d where d.status = 'open'),
      'bugs', (select count(*) from public.bug_reports b where b.status = 'new'),
      'syncs', (select count(*) from public.connections c where c.status <> 'ok'),
      'cron_failed', (select count(distinct d.jobid) from cron.job_run_details d where d.status = 'failed' and d.start_time > now() - interval '24 hours'),
      'csp_day', (select count(*) from public.csp_reports c where c.received_at > now() - interval '24 hours'),
      'crashes', (select count(distinct c.fingerprint) from public.crash_reports c where c.received_at > now() - interval '24 hours'),
      'ideas', (select count(*) from public.ideas i where i.status = 'Under review'))
  );
end $function$;

revoke all on function public.admin_today() from public, anon;
grant execute on function public.admin_today() to authenticated;
revoke all on function public.admin_floor() from public, anon;
grant execute on function public.admin_floor() to authenticated;
revoke all on function public.admin_idea_status(uuid, text) from public, anon;
grant execute on function public.admin_idea_status(uuid, text) to authenticated;
revoke all on function public.admin_crashes() from public, anon;
grant execute on function public.admin_crashes() to authenticated;
revoke all on function public.admin_costs() from public, anon;
grant execute on function public.admin_costs() to authenticated;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
