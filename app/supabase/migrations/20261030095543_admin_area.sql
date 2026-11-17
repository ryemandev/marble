alter table public.reports add column resolved_at timestamptz;
alter table public.reports add column resolution text check (resolution is null or resolution in ('kept', 'hidden', 'deleted'));
alter table public.reports add column resolved_by uuid;
create index reports_unresolved on public.reports (created_at) where resolved_at is null;

create or replace function public.reports_new_open()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.resolved_at := null; new.resolution := null; new.resolved_by := null;
  return new;
end $$;
revoke all on function public.reports_new_open() from public, anon, authenticated;
create trigger reports_new_open before insert on public.reports for each row execute function public.reports_new_open();

alter table public.career_interest add column notes text check (notes is null or char_length(notes) <= 4000);

drop policy "competitions: admin manages" on public.competitions;
drop policy "competition entries: admin manages" on public.competition_entries;
drop policy "competition results: admin manages" on public.competition_results;
drop policy "giveaways: admin manages" on public.giveaways;
drop policy "giveaway entries: admin marks invalid" on public.giveaway_entries;
drop policy "giveaway winners: admin manages" on public.giveaway_winners;
revoke insert, update, delete on table public.competitions, public.competition_results, public.giveaways from authenticated;
revoke update on table public.competition_entries, public.giveaway_entries, public.giveaway_winners from authenticated;
revoke execute on function public.competition_finalise(uuid) from authenticated;
revoke execute on function public.giveaway_seal(uuid) from authenticated;
revoke execute on function public.giveaway_draw(uuid, integer) from authenticated;

create or replace function public.admin_plan_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with s as (select * from public.subscriptions x where x.user_id = p_user order by x.updated_at desc limit 1),
       g as (select bool_or(x.until is null) as life, max(x.until) as until from public.access_grants x
              where x.user_id = p_user and x.revoked_at is null and x.starts_at <= now() and (x.until is null or x.until > now())),
       l as (select x.seat from public.lifetime_purchases x where x.user_id = p_user and not x.refunded)
  select case
    when exists (select 1 from public.admins a where a.user_id = p_user) then jsonb_build_object('kind', 'admin')
    when exists (select 1 from public.payment_disputes d where d.user_id = p_user and d.status in ('open', 'lost'))
      then jsonb_build_object('kind', 'disputed')
    when exists (select 1 from l) then jsonb_build_object('kind', 'lifetime', 'seat', (select l.seat from l))
    when coalesce((select g.life from g), false) then jsonb_build_object('kind', 'gift_lifetime')
    when exists (select 1 from s where s.status = 'trialing' and coalesce(s.trial_end, s.current_period_end) > now())
      then (select jsonb_build_object('kind', 'trial', 'until', coalesce(s.trial_end, s.current_period_end), 'cancels', s.cancel_at_period_end) from s)
    when exists (select 1 from s where s.status in ('active', 'past_due'))
      then (select jsonb_build_object('kind', s.plan, 'status', s.status, 'until', s.current_period_end, 'cancels', s.cancel_at_period_end) from s)
    when (select g.until from g) is not null then jsonb_build_object('kind', 'gift', 'until', (select g.until from g))
    when exists (select 1 from s where s.status = 'canceled' and s.current_period_end > now())
      then (select jsonb_build_object('kind', s.plan, 'status', 'canceled', 'until', s.current_period_end, 'cancels', true) from s)
    when exists (select 1 from s) then (select jsonb_build_object('kind', 'lapsed', 'until', coalesce(s.current_period_end, s.trial_end)) from s)
    else jsonb_build_object('kind', 'none')
  end
$$;
revoke all on function public.admin_plan_of(uuid) from public, anon, authenticated;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_weeks jsonb;
  v_mrr jsonb;
begin
  perform public.admin_gate();
  select jsonb_agg(w.n order by w.k desc) into v_weeks from (
    select k, (select count(*) from public.profiles p
                where p.created_at > now() - make_interval(days => 7 * (k + 1)) and p.created_at <= now() - make_interval(days => 7 * k))::int as n
    from generate_series(0, 12) k) w;
  select jsonb_build_object(
      'pence', coalesce(round(sum((case when s.plan = 'yearly' then s.amount / 12.0 else s.amount end)
                 * case lower(s.currency) when 'gbp' then 1 when 'usd' then 10.0 / 13 when 'jpy' then 0.5 when 'eur' then 0.86 else 0 end)), 0)::bigint,
      'subs', count(*),
      'by_currency', coalesce((select jsonb_object_agg(x.cur, x.n) from (select lower(y.currency) as cur, count(*) as n
                       from public.subscriptions y where y.status in ('active', 'past_due') group by 1) x), '{}'::jsonb))
    into v_mrr
    from public.subscriptions s where s.status in ('active', 'past_due');
  return jsonb_build_object(
    'at', now(),
    'traders', (select count(*) from public.profiles),
    'signups', jsonb_build_object(
      'week', (select count(*) from public.profiles p where p.created_at > now() - interval '7 days'),
      'prev', (select count(*) from public.profiles p where p.created_at > now() - interval '14 days' and p.created_at <= now() - interval '7 days'),
      'weeks', coalesce(v_weeks, '[]'::jsonb)),
    'trials', jsonb_build_object(
      'now', (select count(*) from public.subscriptions s where s.status = 'trialing' and coalesce(s.trial_end, s.current_period_end) > now()),
      'week', (select count(*) from public.subscriptions s where s.trial_end is not null and s.created_at > now() - interval '7 days'),
      'cancelling', (select count(*) from public.subscriptions s where s.status = 'trialing' and s.cancel_at_period_end and coalesce(s.trial_end, s.current_period_end) > now())),
    'paying', jsonb_build_object(
      'monthly', (select count(*) from public.subscriptions s where s.plan = 'monthly' and s.status in ('active', 'past_due')),
      'yearly', (select count(*) from public.subscriptions s where s.plan = 'yearly' and s.status in ('active', 'past_due')),
      'lifetime', (select count(*) from public.lifetime_purchases l where not l.refunded),
      'past_due', (select count(*) from public.subscriptions s where s.status = 'past_due'),
      'cancelling', (select count(*) from public.subscriptions s where s.status in ('active', 'past_due') and s.cancel_at_period_end)),
    'gifts', jsonb_build_object(
      'active', (select count(distinct g.user_id) from public.access_grants g where g.revoked_at is null and g.starts_at <= now() and (g.until is null or g.until > now())),
      'lifetime', (select count(distinct g.user_id) from public.access_grants g where g.revoked_at is null and g.until is null),
      'unused', (select count(*) from public.gift_codes c where c.redeemed_at is null and c.revoked_at is null and (c.redeem_by is null or c.redeem_by > now()))),
    'seats', jsonb_build_object(
      'cap', 500,
      'taken', public.founders_seats_taken(),
      'week', (select count(*) from public.lifetime_purchases l where not l.refunded and l.seat is not null and l.created_at > now() - interval '7 days')),
    'mrr', v_mrr,
    'needs', jsonb_build_object(
      'reports', (select count(distinct coalesce(r.post_id, r.message_id, r.idea_id)) from public.reports r where r.resolved_at is null),
      'dm_reports', (select count(*) from public.dm_reports d where d.status = 'open'),
      'applications', (select count(*) from public.partner_applications a where a.status = 'new') + (select count(*) from public.career_interest c where c.status = 'new'),
      'bugs', (select count(*) from public.bug_reports b where b.status = 'new'),
      'disputes', (select count(*) from public.payment_disputes d where d.status = 'open'),
      'syncs', (select count(*) from public.connections c where c.status <> 'ok'),
      'cron_failed', (select count(distinct d.jobid) from cron.job_run_details d where d.status = 'failed' and d.start_time > now() - interval '24 hours'),
      'csp_day', (select count(*) from public.csp_reports c where c.received_at > now() - interval '24 hours')),
    'stripe_last', (select max(e.processed_at) from public.stripe_events e)
  );
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_traders(p_query text default '')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := left(regexp_replace(btrim(coalesce(p_query, '')), '^@', ''), 80);
  v_like text;
begin
  perform public.admin_gate();
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object(
    'total', (select count(*) from public.profiles),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'handle', x.handle, 'name', x.name, 'email', x.email,
               'joined', x.created_at, 'last_seen', x.last_sign_in_at, 'avatar', x.avatar_url, 'plan', public.admin_plan_of(x.id))
               order by x.exact desc, x.created_at desc)
      from (select p.id, p.handle, p.name, p.created_at, p.avatar_url, u.email, u.last_sign_in_at,
                   (lower(p.handle::text) = lower(v_q) or lower(coalesce(u.email, '')) = lower(v_q)) as exact
            from public.profiles p left join auth.users u on u.id = p.id
            where v_q = '' or p.handle::text ilike v_like or u.email ilike v_like or p.name ilike v_like
            order by exact desc, p.created_at desc limit 50) x), '[]'::jsonb));
end $$;
revoke all on function public.admin_traders(text) from public, anon;
grant execute on function public.admin_traders(text) to authenticated;

create or replace function public.admin_trader(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_p public.profiles;
  v_u auth.users;
begin
  perform public.admin_gate();
  select * into v_p from public.profiles where id = p_user;
  if not found then raise exception 'No such trader' using errcode = 'P0001'; end if;
  select * into v_u from auth.users where id = p_user;
  return jsonb_build_object(
    'id', v_p.id, 'handle', v_p.handle, 'name', v_p.name, 'avatar', v_p.avatar_url, 'joined', v_p.created_at,
    'email', v_u.email, 'email_confirmed', v_u.email_confirmed_at is not null, 'last_seen', v_u.last_sign_in_at,
    'providers', coalesce(v_u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'heard_from', (select pp.heard_from from public.profile_private pp where pp.id = p_user),
    'currency', (select pp.currency from public.profile_private pp where pp.id = p_user),
    'news', (select pp.marketing_opt_in from public.profile_private pp where pp.id = p_user),
    'referred_by', (select pp.referred_by from public.profile_private pp where pp.id = p_user),
    'crew', (select c.crew from public.crew_members c where c.user_id = p_user),
    'staff', public.is_staff(p_user),
    'admin', exists (select 1 from public.admins a where a.user_id = p_user),
    'access', public.has_access_for(p_user),
    'plan', public.admin_plan_of(p_user),
    'subscription', (select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_end', s.trial_end, 'period_end', s.current_period_end,
                       'cancels', s.cancel_at_period_end, 'amount', s.amount, 'currency', s.currency, 'since', s.created_at)
                     from public.subscriptions s where s.user_id = p_user order by s.updated_at desc limit 1),
    'lifetime', (select jsonb_build_object('seat', l.seat, 'since', l.created_at, 'amount', l.amount, 'currency', l.currency,
                   'refunded', l.refunded) from public.lifetime_purchases l where l.user_id = p_user),
    'gifts', coalesce((select jsonb_agg(jsonb_build_object('until', g.until, 'since', g.created_at, 'revoked', g.revoked_at,
                 'label', c.label, 'code', c.code) order by g.created_at desc)
               from public.access_grants g left join public.gift_codes c on c.id = g.code_id where g.user_id = p_user), '[]'::jsonb),
    'disputes', (select count(*) from public.payment_disputes d where d.user_id = p_user and d.status in ('open', 'lost')),
    'stripe_customer', (select c.stripe_customer_id from public.customers c where c.user_id = p_user),
    'journal', jsonb_build_object(
      'trades', (select count(*) from public.trades t where t.user_id = p_user),
      'synced', (select count(*) from public.trades t where t.user_id = p_user and t.source = 'sync'),
      'accounts', (select count(*) from public.accounts a where a.user_id = p_user and not a.archived),
      'imports', (select count(*) from public.imports i where i.user_id = p_user and i.undone_at is null)),
    'connections', coalesce((select jsonb_agg(jsonb_build_object('platform', c.platform, 'status', c.status,
                       'last_synced', c.last_synced_at, 'error', left(c.last_error, 200)) order by c.platform)
                     from public.connections c where c.user_id = p_user), '[]'::jsonb),
    'community', jsonb_build_object(
      'posts', (select count(*) from public.posts p where p.user_id = p_user),
      'hidden', (select count(*) from public.posts p where p.user_id = p_user and p.hidden),
      'chat_30d', (select count(*) from public.chat_messages m where m.user_id = p_user and m.created_at > now() - interval '30 days'),
      'reported', (select count(*) from public.reports r where r.post_id in (select p.id from public.posts p where p.user_id = p_user)
                     or r.message_id in (select m.id from public.chat_messages m where m.user_id = p_user)),
      'reports_made', (select count(*) from public.reports r where r.user_id = p_user),
      'dm_paused_until', (select max(b.until) from public.dm_bans b where b.user_id = p_user and b.until > now())),
    'referrals', jsonb_build_object(
      'referred', (select count(*) from public.referrals r where r.referrer_id = p_user),
      'pence', coalesce((select jsonb_object_agg(x.status, x.pence) from (select c.status, sum(c.amount_pence) as pence
                 from public.commissions c where c.referrer_id = p_user group by c.status) x), '{}'::jsonb)),
    'events', jsonb_build_object(
      'competitions', (select count(*) from public.competition_entries e where e.user_id = p_user),
      'giveaways', (select count(*) from public.giveaway_entries e where e.user_id = p_user))
  );
end $$;
revoke all on function public.admin_trader(uuid) from public, anon;
grant execute on function public.admin_trader(uuid) to authenticated;

create or replace function public.admin_events()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'competitions', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'entrants', (select count(*) from public.competition_entries e where e.competition_id = c.id and e.status = 'entered'),
        'disqualified', (select count(*) from public.competition_entries e where e.competition_id = c.id and e.status = 'disqualified'),
        'codes', (select count(*) from public.gift_codes g where g.competition_id = c.id))
      order by c.starts_on desc, c.created_at desc) from public.competitions c), '[]'::jsonb),
    'giveaways', coalesce((select jsonb_agg(to_jsonb(g) || jsonb_build_object(
        'entries', (select count(*) from public.giveaway_entries e where e.giveaway_id = g.id),
        'valid', (select count(*) from public.giveaway_entries e where e.giveaway_id = g.id and e.valid),
        'winners', (select count(*) from public.giveaway_winners w where w.giveaway_id = g.id),
        'draws', (select count(*) from public.giveaway_draws d where d.giveaway_id = g.id),
        'codes', (select count(*) from public.gift_codes x where x.giveaway_id = g.id))
      order by g.opens_at desc, g.created_at desc) from public.giveaways g), '[]'::jsonb));
end $$;
revoke all on function public.admin_events() from public, anon;
grant execute on function public.admin_events() to authenticated;

create or replace function public.admin_competition_save(p_id uuid, p jsonb)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_old public.competitions;
  v_new public.competitions;
  v_keys constant text[] := array['slug', 'title', 'tagline', 'blurb', 'art', 'starts_on', 'ends_on', 'entry_closes_at',
    'limits', 'scoring', 'prizes', 'summary', 'rules', 'rules_version', 'checks'];
  v_rule_keys constant text[] := array['rules', 'summary', 'limits', 'scoring', 'starts_on', 'ends_on'];
  v_allowed text[];
  v_changed text[];
  v_in jsonb;
begin
  perform public.admin_gate();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Nothing to save' using errcode = '22023'; end if;
  select coalesce(jsonb_object_agg(k, p -> k), '{}'::jsonb) into v_in from jsonb_object_keys(p) k where k = any(v_keys);
  if p_id is null then
    v_new := jsonb_populate_record(null::public.competitions, v_in);
    insert into public.competitions (slug, title, tagline, blurb, art, starts_on, ends_on, entry_closes_at, limits, scoring,
      prizes, summary, rules, rules_version, checks)
    values (v_new.slug, btrim(v_new.title), nullif(btrim(v_new.tagline), ''), nullif(btrim(v_new.blurb), ''), nullif(btrim(v_new.art), ''),
      v_new.starts_on, v_new.ends_on, v_new.entry_closes_at, coalesce(v_new.limits, '{}'::jsonb),
      coalesce(v_new.scoring, '{"broken_day_r": 2, "min_days": 10}'::jsonb), coalesce(v_new.prizes, '[]'::jsonb),
      coalesce(v_new.summary, '[]'::jsonb), coalesce(v_new.rules, '[]'::jsonb), coalesce(nullif(btrim(v_new.rules_version), ''), '1.0'),
      coalesce(v_new.checks, '[]'::jsonb))
    returning * into v_new;
    perform public.admin_note('competition.create', 'competition', v_new.id::text, jsonb_build_object('slug', v_new.slug, 'title', v_new.title));
    return v_new.id;
  end if;

  select * into v_old from public.competitions where id = p_id for update;
  if not found then raise exception 'No such competition' using errcode = 'P0001'; end if;
  v_new := jsonb_populate_record(v_old, v_in);
  v_new.title := btrim(v_new.title);
  v_new.tagline := nullif(btrim(v_new.tagline), ''); v_new.blurb := nullif(btrim(v_new.blurb), ''); v_new.art := nullif(btrim(v_new.art), '');
  select coalesce(array_agg(k), '{}') into v_changed from unnest(v_keys) k where to_jsonb(v_new) -> k is distinct from to_jsonb(v_old) -> k;
  if cardinality(v_changed) = 0 then return p_id; end if;
  v_allowed := case v_old.status
    when 'draft' then v_keys
    when 'open' then v_keys
    when 'live' then array['tagline', 'blurb', 'art', 'prizes', 'checks']
    when 'review' then array['tagline', 'blurb', 'art', 'prizes', 'checks']
    when 'final' then array['tagline', 'blurb', 'art', 'checks']
    else '{}'::text[] end;
  if not (v_changed <@ v_allowed) then
    raise exception 'Once a competition is %, % can''t change', v_old.status, array_to_string(array(select unnest(v_changed) except select unnest(v_allowed)), ', ')
      using errcode = 'P0001';
  end if;
  if v_old.status = 'open' and v_changed && v_rule_keys then
    if v_new.rules_version is not distinct from v_old.rules_version then
      raise exception 'Entries are open, so new rules need a new rules version (entrants accept it again)' using errcode = 'P0001';
    end if;
    v_new.rules_published_at := now();
  end if;
  update public.competitions set slug = v_new.slug, title = v_new.title, tagline = v_new.tagline, blurb = v_new.blurb, art = v_new.art,
    starts_on = v_new.starts_on, ends_on = v_new.ends_on, entry_closes_at = v_new.entry_closes_at, limits = v_new.limits,
    scoring = v_new.scoring, prizes = v_new.prizes, summary = v_new.summary, rules = v_new.rules, rules_version = v_new.rules_version,
    checks = v_new.checks, rules_published_at = v_new.rules_published_at
  where id = p_id;
  perform public.admin_note('competition.edit', 'competition', p_id::text, jsonb_build_object('changed', to_jsonb(v_changed),
    'before', (select coalesce(jsonb_object_agg(k, to_jsonb(v_old) -> k), '{}'::jsonb) from unnest(v_changed) k where k not in ('rules', 'summary', 'checks', 'prizes')),
    'after', (select coalesce(jsonb_object_agg(k, to_jsonb(v_new) -> k), '{}'::jsonb) from unnest(v_changed) k where k not in ('rules', 'summary', 'checks', 'prizes'))));
  return p_id;
end $$;
revoke all on function public.admin_competition_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_competition_save(uuid, jsonb) to authenticated;

create or replace function public.admin_competition_status(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_c public.competitions;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  perform public.admin_gate();
  select * into v_c from public.competitions where id = p_id for update;
  if not found then raise exception 'No such competition' using errcode = 'P0001'; end if;
  if p_status = v_c.status then return; end if;
  if p_status = 'open' and v_c.status = 'draft' then
    if jsonb_array_length(v_c.rules) = 0 or jsonb_array_length(v_c.summary) = 0 then
      raise exception 'Write the rules and the short version before publishing' using errcode = 'P0001';
    end if;
    if v_c.entry_closes_at <= now() then raise exception 'Entries would already be closed: move the closing time first' using errcode = 'P0001'; end if;
    update public.competitions set status = 'open', rules_published_at = coalesce(rules_published_at, now()) where id = p_id;
  elsif p_status = 'draft' and v_c.status = 'open' then
    if exists (select 1 from public.competition_entries e where e.competition_id = p_id) then
      raise exception 'Traders have entered, so it can''t go back to a draft. Cancel it instead.' using errcode = 'P0001';
    end if;
    update public.competitions set status = 'draft' where id = p_id;
  elsif p_status = 'live' and v_c.status = 'open' then
    if v_today < v_c.starts_on then raise exception 'It goes live on its first day, %', v_c.starts_on using errcode = 'P0001'; end if;
    update public.competitions set status = 'live' where id = p_id;
  elsif p_status = 'review' and v_c.status = 'live' then
    if v_today <= v_c.ends_on then raise exception 'The check starts after its last day, %', v_c.ends_on using errcode = 'P0001'; end if;
    update public.competitions set status = 'review' where id = p_id;
  elsif p_status = 'cancelled' and v_c.status in ('open', 'live', 'review') then
    if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
      raise exception 'Say why it''s cancelled (3 to 300 characters)' using errcode = '22023';
    end if;
    update public.competitions set status = 'cancelled' where id = p_id;
  else
    raise exception 'A competition can''t go from % to %', v_c.status, coalesce(p_status, 'nothing') using errcode = 'P0001';
  end if;
  perform public.admin_note('competition.status', 'competition', p_id::text,
    jsonb_build_object('from', v_c.status, 'to', p_status, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;
revoke all on function public.admin_competition_status(uuid, text, text) from public, anon;
grant execute on function public.admin_competition_status(uuid, text, text) to authenticated;

create or replace function public.admin_competition_delete(p_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_c public.competitions;
begin
  perform public.admin_gate();
  select * into v_c from public.competitions where id = p_id for update;
  if not found then raise exception 'No such competition' using errcode = 'P0001'; end if;
  if v_c.status <> 'draft' or exists (select 1 from public.competition_entries e where e.competition_id = p_id) then
    raise exception 'Only a draft can be deleted. Cancel it instead.' using errcode = 'P0001';
  end if;
  delete from public.competitions where id = p_id;
  perform public.admin_note('competition.delete', 'competition', p_id::text, jsonb_build_object('slug', v_c.slug, 'title', v_c.title));
end $$;
revoke all on function public.admin_competition_delete(uuid) from public, anon;
grant execute on function public.admin_competition_delete(uuid) to authenticated;

create or replace function public.admin_competition_finalise(p_id uuid)
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare v_n int;
begin
  perform public.admin_gate();
  if not exists (select 1 from public.competitions where id = p_id and status = 'review') then
    raise exception 'Finalise after the check: move it to review first' using errcode = 'P0001';
  end if;
  v_n := public.competition_finalise(p_id);
  perform public.admin_note('competition.finalise', 'competition', p_id::text, jsonb_build_object('rows', v_n));
  return v_n;
end $$;
revoke all on function public.admin_competition_finalise(uuid) from public, anon;
grant execute on function public.admin_competition_finalise(uuid) to authenticated;

create or replace function public.admin_competition_entries(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_c public.competitions;
begin
  perform public.admin_gate();
  select * into v_c from public.competitions where id = p_id;
  if not found then raise exception 'No such competition' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'entries', coalesce((select jsonb_agg(jsonb_build_object('user_id', e.user_id, 'handle', p.handle, 'email', u.email,
        'status', e.status, 'dq_reason', e.dq_reason, 'account_size', e.account_size, 'broker', e.broker_platform,
        'rules_version', e.rules_version, 'accepted_at', e.accepted_at) order by e.accepted_at)
      from public.competition_entries e join public.profiles p on p.id = e.user_id left join auth.users u on u.id = e.user_id
      where e.competition_id = p_id), '[]'::jsonb),
    'rows', case
      when v_c.status = 'final' then coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'rank', r.rank, 'handle', r.handle,
          'traded', r.traded, 'kept', r.kept, 'trades', r.trades, 'kept_r', r.kept_r, 'score', r.score, 'prize', r.prize,
          'prize_status', r.prize_status) order by r.rank nulls last, r.handle) from public.competition_results r where r.competition_id = p_id), '[]'::jsonb)
      when v_c.status in ('live', 'review') then coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'rank', x.rank,
          'handle', x.handle, 'traded', x.traded, 'kept', x.kept, 'trades', x.trades, 'kept_r', x.kept_r, 'score', x.score)
          order by x.rank nulls last, x.handle) from public.competition_rows(p_id) x), '[]'::jsonb)
      else '[]'::jsonb end);
end $$;
revoke all on function public.admin_competition_entries(uuid) from public, anon;
grant execute on function public.admin_competition_entries(uuid) to authenticated;

create or replace function public.admin_competition_entry(p_id uuid, p_user uuid, p_action text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_status text;
begin
  perform public.admin_gate();
  select c.status into v_status from public.competitions c where c.id = p_id;
  if v_status is null then raise exception 'No such competition' using errcode = 'P0001'; end if;
  if v_status in ('final', 'cancelled') then raise exception 'The results are fixed now' using errcode = 'P0001'; end if;
  if p_action = 'disqualify' then
    if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
      raise exception 'Say why (3 to 500 characters): the trader is told' using errcode = '22023';
    end if;
    update public.competition_entries set status = 'disqualified', dq_reason = btrim(p_reason)
     where competition_id = p_id and user_id = p_user and status <> 'disqualified';
  elsif p_action = 'reinstate' then
    update public.competition_entries set status = 'entered', dq_reason = null
     where competition_id = p_id and user_id = p_user and status = 'disqualified';
  else
    raise exception 'Disqualify or reinstate' using errcode = '22023';
  end if;
  if not found then raise exception 'Nothing to change for that entrant' using errcode = 'P0001'; end if;
  perform public.admin_note('competition.' || p_action, 'competition', p_id::text,
    jsonb_build_object('user_id', p_user, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;
revoke all on function public.admin_competition_entry(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_competition_entry(uuid, uuid, text, text) to authenticated;

create or replace function public.admin_competition_prize(p_id uuid, p_user uuid, p_prize text, p_status text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  if not exists (select 1 from public.competitions where id = p_id and status = 'final') then
    raise exception 'Prizes are marked once the results are final' using errcode = 'P0001';
  end if;
  if p_status is not null and p_status not in ('pending', 'sent', 'declined') then raise exception 'Pending, sent or declined' using errcode = '22023'; end if;
  if char_length(coalesce(p_prize, '')) > 120 then raise exception 'Keep the prize to 120 characters' using errcode = '22023'; end if;
  update public.competition_results set prize = nullif(btrim(coalesce(p_prize, '')), ''), prize_status = p_status
   where competition_id = p_id and user_id = p_user;
  if not found then raise exception 'That trader isn''t in the final table' using errcode = 'P0001'; end if;
  perform public.admin_note('competition.prize', 'competition', p_id::text,
    jsonb_build_object('user_id', p_user, 'prize', nullif(btrim(coalesce(p_prize, '')), ''), 'status', p_status));
end $$;
revoke all on function public.admin_competition_prize(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_competition_prize(uuid, uuid, text, text) to authenticated;

create or replace function public.admin_giveaway_save(p_id uuid, p jsonb)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_old public.giveaways;
  v_new public.giveaways;
  v_keys constant text[] := array['slug', 'title', 'tagline', 'blurb', 'art', 'opens_at', 'closes_at', 'draw_at', 'claim_days',
    'winners_count', 'prize', 'summary', 'rules', 'rules_version'];
  v_allowed text[];
  v_changed text[];
  v_in jsonb;
begin
  perform public.admin_gate();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Nothing to save' using errcode = '22023'; end if;
  select coalesce(jsonb_object_agg(k, p -> k), '{}'::jsonb) into v_in from jsonb_object_keys(p) k where k = any(v_keys);
  if p_id is null then
    v_new := jsonb_populate_record(null::public.giveaways, v_in);
    insert into public.giveaways (slug, title, tagline, blurb, art, opens_at, closes_at, draw_at, claim_days, winners_count, prize,
      summary, rules, rules_version)
    values (v_new.slug, btrim(v_new.title), nullif(btrim(v_new.tagline), ''), nullif(btrim(v_new.blurb), ''), nullif(btrim(v_new.art), ''),
      v_new.opens_at, v_new.closes_at, v_new.draw_at, coalesce(v_new.claim_days, 14), v_new.winners_count, coalesce(v_new.prize, '[]'::jsonb),
      coalesce(v_new.summary, '[]'::jsonb), coalesce(v_new.rules, '[]'::jsonb), coalesce(nullif(btrim(v_new.rules_version), ''), '1.0'))
    returning * into v_new;
    perform public.admin_note('giveaway.create', 'giveaway', v_new.id::text, jsonb_build_object('slug', v_new.slug, 'title', v_new.title));
    return v_new.id;
  end if;

  select * into v_old from public.giveaways where id = p_id for update;
  if not found then raise exception 'No such giveaway' using errcode = 'P0001'; end if;
  v_new := jsonb_populate_record(v_old, v_in);
  v_new.title := btrim(v_new.title);
  v_new.tagline := nullif(btrim(v_new.tagline), ''); v_new.blurb := nullif(btrim(v_new.blurb), ''); v_new.art := nullif(btrim(v_new.art), '');
  select coalesce(array_agg(k), '{}') into v_changed from unnest(v_keys) k where to_jsonb(v_new) -> k is distinct from to_jsonb(v_old) -> k;
  if cardinality(v_changed) = 0 then return p_id; end if;
  v_allowed := case when v_old.status = 'draft' then v_keys
                    when v_old.status in ('open', 'closed', 'drawn') then array['tagline', 'blurb', 'art']
                    else '{}'::text[] end;
  if not (v_changed <@ v_allowed) then
    raise exception 'Once a giveaway is %, % can''t change', v_old.status, array_to_string(array(select unnest(v_changed) except select unnest(v_allowed)), ', ')
      using errcode = 'P0001';
  end if;
  update public.giveaways set slug = v_new.slug, title = v_new.title, tagline = v_new.tagline, blurb = v_new.blurb, art = v_new.art,
    opens_at = v_new.opens_at, closes_at = v_new.closes_at, draw_at = v_new.draw_at, claim_days = v_new.claim_days,
    winners_count = v_new.winners_count, prize = v_new.prize, summary = v_new.summary, rules = v_new.rules, rules_version = v_new.rules_version
  where id = p_id;
  perform public.admin_note('giveaway.edit', 'giveaway', p_id::text, jsonb_build_object('changed', to_jsonb(v_changed),
    'before', (select coalesce(jsonb_object_agg(k, to_jsonb(v_old) -> k), '{}'::jsonb) from unnest(v_changed) k where k not in ('rules', 'summary', 'prize')),
    'after', (select coalesce(jsonb_object_agg(k, to_jsonb(v_new) -> k), '{}'::jsonb) from unnest(v_changed) k where k not in ('rules', 'summary', 'prize'))));
  return p_id;
end $$;
revoke all on function public.admin_giveaway_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_giveaway_save(uuid, jsonb) to authenticated;

create or replace function public.admin_giveaway_seal(p_id uuid)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare v_hash text;
begin
  perform public.admin_gate();
  v_hash := public.giveaway_seal(p_id);
  perform public.admin_note('giveaway.seal', 'giveaway', p_id::text, jsonb_build_object('seed_hash', v_hash));
  return v_hash;
end $$;
revoke all on function public.admin_giveaway_seal(uuid) from public, anon;
grant execute on function public.admin_giveaway_seal(uuid) to authenticated;

create or replace function public.admin_giveaway_status(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_g public.giveaways;
begin
  perform public.admin_gate();
  select * into v_g from public.giveaways where id = p_id for update;
  if not found then raise exception 'No such giveaway' using errcode = 'P0001'; end if;
  if p_status = v_g.status then return; end if;
  if p_status = 'open' and v_g.status = 'draft' then
    if v_g.seed_hash is null then raise exception 'Seal it first: the sealed code is published before anyone enters' using errcode = 'P0001'; end if;
    if jsonb_array_length(v_g.rules) = 0 or jsonb_array_length(v_g.summary) = 0 then
      raise exception 'Write the rules and the short version before publishing' using errcode = 'P0001';
    end if;
    if v_g.closes_at <= now() then raise exception 'Entries would already be closed: move the closing time first' using errcode = 'P0001'; end if;
    update public.giveaways set status = 'open', rules_published_at = coalesce(rules_published_at, now()) where id = p_id;
  elsif p_status = 'draft' and v_g.status = 'open' then
    if exists (select 1 from public.giveaway_entries e where e.giveaway_id = p_id) then
      raise exception 'People have entered, so it can''t go back to a draft. Cancel it instead.' using errcode = 'P0001';
    end if;
    update public.giveaways set status = 'draft' where id = p_id;
  elsif p_status = 'closed' and v_g.status = 'open' then
    if now() < v_g.closes_at then raise exception 'Entries close at the time it says, not before' using errcode = 'P0001'; end if;
    update public.giveaways set status = 'closed' where id = p_id;
  elsif p_status = 'cancelled' and v_g.status in ('open', 'closed') then
    if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
      raise exception 'Say why it''s cancelled (3 to 300 characters)' using errcode = '22023';
    end if;
    update public.giveaways set status = 'cancelled' where id = p_id;
  else
    raise exception 'A giveaway can''t go from % to %', v_g.status, coalesce(p_status, 'nothing') using errcode = 'P0001';
  end if;
  perform public.admin_note('giveaway.status', 'giveaway', p_id::text,
    jsonb_build_object('from', v_g.status, 'to', p_status, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;
revoke all on function public.admin_giveaway_status(uuid, text, text) from public, anon;
grant execute on function public.admin_giveaway_status(uuid, text, text) to authenticated;

create or replace function public.admin_giveaway_delete(p_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_g public.giveaways;
begin
  perform public.admin_gate();
  select * into v_g from public.giveaways where id = p_id for update;
  if not found then raise exception 'No such giveaway' using errcode = 'P0001'; end if;
  if v_g.status <> 'draft' or exists (select 1 from public.giveaway_entries e where e.giveaway_id = p_id) then
    raise exception 'Only a draft can be deleted. Cancel it instead.' using errcode = 'P0001';
  end if;
  delete from public.giveaways where id = p_id;
  perform public.admin_note('giveaway.delete', 'giveaway', p_id::text, jsonb_build_object('slug', v_g.slug, 'title', v_g.title));
end $$;
revoke all on function public.admin_giveaway_delete(uuid) from public, anon;
grant execute on function public.admin_giveaway_delete(uuid) to authenticated;

create or replace function public.admin_giveaway_entries(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  if not exists (select 1 from public.giveaways where id = p_id) then raise exception 'No such giveaway' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'entries', coalesce((select jsonb_agg(jsonb_build_object('entry_no', e.entry_no, 'route', e.route, 'user_id', e.user_id,
        'handle', p.handle, 'accepted_at', e.accepted_at, 'valid', e.valid, 'invalid_reason', e.invalid_reason) order by e.entry_no)
      from public.giveaway_entries e left join public.profiles p on p.id = e.user_id where e.giveaway_id = p_id), '[]'::jsonb),
    'winners', coalesce((select jsonb_agg(jsonb_build_object('entry_no', w.entry_no, 'round', w.round, 'user_id', w.user_id,
        'handle', p.handle, 'email', u.email, 'claim_status', w.claim_status, 'claim_by', w.claim_by, 'claimed_at', w.claimed_at,
        'reason', w.reason, 'show_handle', w.show_handle) order by w.round, w.entry_no)
      from public.giveaway_winners w left join public.profiles p on p.id = w.user_id left join auth.users u on u.id = w.user_id
      where w.giveaway_id = p_id), '[]'::jsonb),
    'draws', coalesce((select jsonb_agg(jsonb_build_object('round', d.round, 'drawn_at', d.drawn_at, 'count', cardinality(d.entries),
        'list_hash', d.list_hash, 'picks', d.picks) order by d.round) from public.giveaway_draws d where d.giveaway_id = p_id), '[]'::jsonb));
end $$;
revoke all on function public.admin_giveaway_entries(uuid) from public, anon;
grant execute on function public.admin_giveaway_entries(uuid) to authenticated;

create or replace function public.admin_giveaway_entry(p_id uuid, p_entry_no integer, p_valid boolean, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  if p_valid is null then raise exception 'Valid or not' using errcode = '22023'; end if;
  if not p_valid and char_length(btrim(coalesce(p_reason, ''))) not between 3 and 200 then
    raise exception 'Say why it''s invalid (3 to 200 characters): it''s published with the draw' using errcode = '22023';
  end if;
  update public.giveaway_entries set valid = p_valid, invalid_reason = case when p_valid then null else btrim(p_reason) end
   where giveaway_id = p_id and entry_no = p_entry_no;
  if not found then raise exception 'No such entry' using errcode = 'P0001'; end if;
  perform public.admin_note(case when p_valid then 'giveaway.entry_valid' else 'giveaway.entry_invalid' end, 'giveaway', p_id::text,
    jsonb_build_object('entry_no', p_entry_no, 'reason', case when p_valid then null else btrim(p_reason) end));
end $$;
revoke all on function public.admin_giveaway_entry(uuid, integer, boolean, text) from public, anon;
grant execute on function public.admin_giveaway_entry(uuid, integer, boolean, text) to authenticated;

create or replace function public.admin_giveaway_draw(p_id uuid, p_count integer default null)
returns integer[] language plpgsql volatile security definer set search_path = ''
as $$
declare v_picks int[];
begin
  perform public.admin_gate();
  v_picks := public.giveaway_draw(p_id, p_count);
  perform public.admin_note('giveaway.draw', 'giveaway', p_id::text, jsonb_build_object('count', p_count, 'picks', to_jsonb(v_picks)));
  return v_picks;
end $$;
revoke all on function public.admin_giveaway_draw(uuid, integer) from public, anon;
grant execute on function public.admin_giveaway_draw(uuid, integer) to authenticated;

create or replace function public.admin_giveaway_winner(p_id uuid, p_entry_no integer, p_status text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  if p_status is null or p_status not in ('open', 'claimed', 'expired', 'disqualified') then
    raise exception 'Open, claimed, expired or disqualified' using errcode = '22023';
  end if;
  if p_status = 'disqualified' and char_length(btrim(coalesce(p_reason, ''))) not between 3 and 200 then
    raise exception 'Say why (3 to 200 characters): it''s shown with the result' using errcode = '22023';
  end if;
  update public.giveaway_winners set claim_status = p_status,
         claimed_at = case when p_status = 'claimed' then coalesce(claimed_at, now()) else null end,
         reason = case when p_status = 'disqualified' then btrim(p_reason) else null end
   where giveaway_id = p_id and entry_no = p_entry_no;
  if not found then raise exception 'That entry didn''t win' using errcode = 'P0001'; end if;
  perform public.admin_note('giveaway.winner', 'giveaway', p_id::text,
    jsonb_build_object('entry_no', p_entry_no, 'status', p_status, 'reason', case when p_status = 'disqualified' then btrim(p_reason) end));
end $$;
revoke all on function public.admin_giveaway_winner(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_giveaway_winner(uuid, integer, text, text) to authenticated;

create or replace function public.admin_applications()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'partners', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (select * from public.partner_applications order by created_at desc limit 300) a), '[]'::jsonb),
    'careers', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc)
      from (select * from public.career_interest order by created_at desc limit 300) c), '[]'::jsonb));
end $$;
revoke all on function public.admin_applications() from public, anon;
grant execute on function public.admin_applications() to authenticated;

create or replace function public.admin_application_update(p_kind text, p_id uuid, p_status text default null, p_notes text default null)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_was text;
begin
  perform public.admin_gate();
  if p_notes is not null and char_length(p_notes) > 4000 then raise exception 'Notes are up to 4,000 characters' using errcode = '22023'; end if;
  if p_kind = 'partner' then
    if p_status is not null and p_status not in ('new', 'replied', 'accepted', 'declined', 'spam') then raise exception 'Not a status' using errcode = '22023'; end if;
    select status into v_was from public.partner_applications where id = p_id for update;
    if not found then raise exception 'No such application' using errcode = 'P0001'; end if;
    update public.partner_applications set status = coalesce(p_status, status),
           notes = case when p_notes is null then notes else nullif(btrim(p_notes), '') end where id = p_id;
  elsif p_kind = 'career' then
    if p_status is not null and p_status not in ('new', 'replied', 'archived') then raise exception 'Not a status' using errcode = '22023'; end if;
    select status into v_was from public.career_interest where id = p_id for update;
    if not found then raise exception 'No such entry' using errcode = 'P0001'; end if;
    update public.career_interest set status = coalesce(p_status, status),
           notes = case when p_notes is null then notes else nullif(btrim(p_notes), '') end, updated_at = now() where id = p_id;
  else
    raise exception 'Partner or career' using errcode = '22023';
  end if;
  perform public.admin_note('application.update', p_kind, p_id::text,
    jsonb_build_object('from', v_was, 'to', coalesce(p_status, v_was), 'notes_changed', p_notes is not null));
end $$;
revoke all on function public.admin_application_update(text, uuid, text, text) from public, anon;
grant execute on function public.admin_application_update(text, uuid, text, text) to authenticated;

create or replace function public.admin_reports(p_open boolean default true)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return coalesce((select jsonb_agg(t.card order by t.n desc, t.last desc) from (
    select count(*) as n, max(r.created_at) as last,
      jsonb_build_object(
        'kind', case when r.post_id is not null then 'post' when r.message_id is not null then 'chat' else 'idea' end,
        'id', coalesce(r.post_id, r.message_id, r.idea_id),
        'count', count(*), 'first', min(r.created_at), 'last', max(r.created_at),
        'resolved_at', max(r.resolved_at), 'resolution', max(r.resolution),
        'reports', jsonb_agg(jsonb_build_object('reason', r.reason, 'at', r.created_at,
                     'by', (select p.handle from public.profiles p where p.id = r.user_id)) order by r.created_at),
        'post', (select jsonb_build_object('body', x.body, 'kind', x.kind, 'anonymous', x.anonymous, 'hidden', x.hidden, 'at', x.created_at,
                   'crew', x.crew, 'reply', x.parent_id is not null, 'image', x.image_url is not null, 'trade', x.trade is not null,
                   'author', (select jsonb_build_object('id', p.id, 'handle', p.handle, 'joined', p.created_at) from public.profiles p where p.id = x.user_id))
                 from public.posts x where x.id = r.post_id),
        'chat', (select jsonb_build_object('body', x.body, 'room', x.room, 'hidden', x.hidden, 'at', x.created_at,
                   'author', (select jsonb_build_object('id', p.id, 'handle', p.handle, 'joined', p.created_at) from public.profiles p where p.id = x.user_id))
                 from public.chat_messages x where x.id = r.message_id),
        'idea', (select jsonb_build_object('title', x.title, 'body', x.body, 'area', x.area, 'status', x.status, 'at', x.created_at,
                   'author', (select jsonb_build_object('id', p.id, 'handle', p.handle, 'joined', p.created_at) from public.profiles p where p.id = x.user_id))
                 from public.ideas x where x.id = r.idea_id)) as card
    from public.reports r
    where case when p_open then r.resolved_at is null else r.resolved_at > now() - interval '90 days' end
    group by r.post_id, r.message_id, r.idea_id
    order by count(*) desc, max(r.created_at) desc
    limit 200) t), '[]'::jsonb);
end $$;
revoke all on function public.admin_reports(boolean) from public, anon;
grant execute on function public.admin_reports(boolean) to authenticated;

create or replace function public.admin_report_resolve(p_kind text, p_id uuid, p_action text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin uuid := public.admin_gate();
  v_author uuid;
  v_text text;
begin
  if p_kind not in ('post', 'chat', 'idea') then raise exception 'Post, chat or idea' using errcode = '22023'; end if;
  if p_action not in ('keep', 'hide', 'unhide', 'delete') then raise exception 'Keep, hide, unhide or delete' using errcode = '22023'; end if;
  if p_kind = 'idea' and p_action in ('hide', 'unhide') then raise exception 'Ideas can be kept or deleted' using errcode = '22023'; end if;
  if p_kind = 'post' then select user_id, body into v_author, v_text from public.posts where id = p_id;
  elsif p_kind = 'chat' then select user_id, body into v_author, v_text from public.chat_messages where id = p_id;
  else select user_id, title || ': ' || body into v_author, v_text from public.ideas where id = p_id;
  end if;
  if not found then raise exception 'It''s already gone' using errcode = 'P0001'; end if;

  if p_action = 'delete' then
    if p_kind = 'post' then delete from public.posts where id = p_id;
    elsif p_kind = 'chat' then delete from public.chat_messages where id = p_id;
    else delete from public.ideas where id = p_id;
    end if;
  else
    if p_action in ('hide', 'unhide') then
      if p_kind = 'post' then update public.posts set hidden = (p_action = 'hide') where id = p_id;
      else update public.chat_messages set hidden = (p_action = 'hide') where id = p_id;
      end if;
    end if;
    if p_action in ('keep', 'hide') then
      update public.reports set resolved_at = now(), resolution = case when p_action = 'keep' then 'kept' else 'hidden' end, resolved_by = v_admin
       where resolved_at is null and case p_kind when 'post' then post_id = p_id when 'chat' then message_id = p_id else idea_id = p_id end;
    end if;
  end if;
  perform public.admin_note('report.' || p_action, p_kind, p_id::text, jsonb_build_object('author', v_author,
    'excerpt', case when p_action = 'delete' then left(v_text, 200) end));
end $$;
revoke all on function public.admin_report_resolve(text, uuid, text) from public, anon;
grant execute on function public.admin_report_resolve(text, uuid, text) to authenticated;

create or replace function public.admin_health()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'at', now(),
    'csp', jsonb_build_object(
      'day', (select count(*) from public.csp_reports c where c.received_at > now() - interval '24 hours'),
      'week', (select count(*) from public.csp_reports c where c.received_at > now() - interval '7 days'),
      'top', coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc, x.last desc) from (
          select coalesce(c.effective_directive, c.violated_directive) as directive, c.blocked_uri as blocked, count(*) as n,
                 max(c.received_at) as last, (array_agg(c.document_uri order by c.received_at desc))[1] as page,
                 (array_agg(c.source_file order by c.received_at desc))[1] as source,
                 (array_agg(c.sample order by c.received_at desc))[1] as sample,
                 (array_agg(c.disposition order by c.received_at desc))[1] as disposition
          from public.csp_reports c where c.received_at > now() - interval '7 days'
          group by 1, 2 order by count(*) desc limit 25) x), '[]'::jsonb)),
    'cron', coalesce((select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_status', l.status, 'last_start', l.start_time, 'last_end', l.end_time, 'last_message', left(l.return_message, 200),
        'runs_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
        'failed_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours'))
      order by j.jobname)
      from cron.job j left join lateral (select d.status, d.start_time, d.end_time, d.return_message from cron.job_run_details d
                                          where d.jobid = j.jobid order by d.start_time desc limit 1) l on true), '[]'::jsonb),
    'stripe', jsonb_build_object('last', (select max(e.processed_at) from public.stripe_events e),
      'week', (select count(*) from public.stripe_events e where e.processed_at > now() - interval '7 days')),
    'syncs', coalesce((select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'handle', p.handle, 'platform', c.platform,
        'status', c.status, 'error', left(c.last_error, 200), 'last_synced', c.last_synced_at, 'since', c.updated_at) order by c.updated_at desc)
      from public.connections c join public.profiles p on p.id = c.user_id where c.status <> 'ok'), '[]'::jsonb),
    'bugs', jsonb_build_object('new', (select count(*) from public.bug_reports b where b.status = 'new'),
      'seen', (select count(*) from public.bug_reports b where b.status = 'seen'),
      'week', (select count(*) from public.bug_reports b where b.created_at > now() - interval '7 days')));
end $$;
revoke all on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated;

create or replace function public.admin_bugs(p_all boolean default false)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'user_id', b.user_id, 'handle', p.handle, 'message', b.message,
      'steps', b.steps, 'context', b.context, 'screenshot_path', b.screenshot_path, 'status', b.status, 'created_at', b.created_at)
      order by b.created_at desc)
    from (select * from public.bug_reports x where p_all or x.status <> 'fixed' order by x.created_at desc limit 200) b
    left join public.profiles p on p.id = b.user_id), '[]'::jsonb);
end $$;
revoke all on function public.admin_bugs(boolean) from public, anon;
grant execute on function public.admin_bugs(boolean) to authenticated;

create or replace function public.admin_bug_status(p_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_was text;
begin
  perform public.admin_gate();
  if p_status is null or p_status not in ('new', 'seen', 'fixed') then raise exception 'New, seen or fixed' using errcode = '22023'; end if;
  select status into v_was from public.bug_reports where id = p_id for update;
  if not found then raise exception 'No such report' using errcode = 'P0001'; end if;
  if v_was = p_status then return; end if;
  update public.bug_reports set status = p_status where id = p_id;
  perform public.admin_note('bug.status', 'bug_report', p_id::text, jsonb_build_object('from', v_was, 'to', p_status));
end $$;
revoke all on function public.admin_bug_status(uuid, text) from public, anon;
grant execute on function public.admin_bug_status(uuid, text) to authenticated;

create or replace function public.admin_log_list(p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_gate();
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'action', l.action, 'target_type', l.target_type,
      'target_id', l.target_id, 'detail', l.detail, 'by', (select p.handle from public.profiles p where p.id = l.admin_id)) order by l.id desc)
    from (select * from public.admin_log x where p_before is null or x.id < p_before order by x.id desc limit 100) l), '[]'::jsonb);
end $$;
revoke all on function public.admin_log_list(bigint) from public, anon;
grant execute on function public.admin_log_list(bigint) to authenticated;;
