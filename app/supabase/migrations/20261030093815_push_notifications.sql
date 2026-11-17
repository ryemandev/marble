alter table public.profile_private
  add column if not exists push_limits boolean not null default true,
  add column if not exists push_dms boolean not null default true,
  add column if not exists push_mentions boolean not null default true;
comment on column public.profile_private.push_limits is 'Push when a daily limit is reached or close. Written through push_settings().';
comment on column public.profile_private.push_dms is 'Push "New message on Marble" (never what was written). Written through push_settings().';
comment on column public.profile_private.push_mentions is 'Push when someone in your crew''s room writes your @handle. Written through push_settings().';

create or replace function public.push_endpoint_ok(p_endpoint text)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(char_length(p_endpoint) <= 1024 and p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[!-~]+$', false)
$$;
revoke all on function public.push_endpoint_ok(text) from public, anon, authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (public.push_endpoint_ok(endpoint)),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{86,88}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22,24}={0,2}$'),
  device text check (char_length(device) <= 40),
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
comment on table public.push_subscriptions is 'Devices with push turned on. Written through push_subscribe()/push_unsubscribe(); read by push-send.';
create index push_subscriptions_user on public.push_subscriptions (user_id, seen_at desc);

create table public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('limit', 'dm', 'mention')),
  dedupe text,
  title text not null check (char_length(title) <= 80),
  body text not null check (char_length(body) <= 200),
  url text not null default '/desk/' check (url ~ '^/desk/(#[a-z]+)?$'),
  tag text check (tag ~ '^[a-z0-9-]{1,32}$'),
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, dedupe)
);
comment on table public.push_outbox is 'Pushes waiting to go, and those sent in the last 2 days (for the rate rules). Never what anyone wrote.';
create index push_outbox_waiting on public.push_outbox (id) where sent_at is null;
create index push_outbox_recent on public.push_outbox (user_id, kind, created_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
revoke all on table public.push_subscriptions, public.push_outbox from anon, authenticated;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_device text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'P0001'; end if;
  if not public.push_endpoint_ok(p_endpoint) then
    raise exception 'This browser''s alerts can''t be reached by Marble. Try Chrome, Edge, Firefox or Safari.' using errcode = 'P0001';
  end if;
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{86,88}={0,2}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{22,24}={0,2}$' then
    raise exception 'This browser sent an alert key Marble can''t use.' using errcode = 'P0001';
  end if;
  if not public.rate_ok(me, 'push_subscribe', 30, interval '1 hour') then
    raise exception 'Slow down a little: try again in a while.' using errcode = 'P0001';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (me, p_endpoint, p_p256dh, p_auth, left(nullif(btrim(coalesce(p_device, '')), ''), 40))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, seen_at = now();
  delete from public.push_subscriptions s
   where s.id in (select x.id from public.push_subscriptions x where x.user_id = me order by x.seen_at desc offset 10);
end $$;
revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path = ''
as $$ delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid()) $$;
revoke all on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_unsubscribe(text) to authenticated;

create or replace function public.push_settings(p_limits boolean default null, p_dms boolean default null, p_mentions boolean default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v record;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'P0001'; end if;
  if num_nonnulls(p_limits, p_dms, p_mentions) > 0 then
    update public.profile_private
       set push_limits = coalesce(p_limits, push_limits), push_dms = coalesce(p_dms, push_dms), push_mentions = coalesce(p_mentions, push_mentions)
     where id = me;
  end if;
  select pp.push_limits, pp.push_dms, pp.push_mentions into v from public.profile_private pp where pp.id = me;
  return jsonb_build_object(
    'limits', coalesce(v.push_limits, true), 'dms', coalesce(v.push_dms, true), 'mentions', coalesce(v.push_mentions, true),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', coalesce(s.device, 'A device'), 'since', s.created_at) order by s.created_at), '[]'::jsonb)
                  from public.push_subscriptions s where s.user_id = me));
end $$;
revoke all on function public.push_settings(boolean, boolean, boolean) from public, anon;
grant execute on function public.push_settings(boolean, boolean, boolean) to authenticated;

create or replace function public.push_queue(p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_tag text,
  p_dedupe text default null, p_urgent boolean default false)
returns void language sql security definer set search_path = ''
as $$
  insert into public.push_outbox (user_id, kind, title, body, url, tag, dedupe, urgent)
  select p_user, p_kind, left(p_title, 80), left(p_body, 200), p_url, p_tag, p_dedupe, p_urgent
   where exists (select 1 from public.push_subscriptions s where s.user_id = p_user)
  on conflict (user_id, dedupe) do nothing
$$;
revoke all on function public.push_queue(uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;

create or replace function public.push_limits_check()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_from timestamptz := (date_trunc('day', now() at time zone 'America/New_York')) at time zone 'America/New_York';
  v_day text := to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD');
  v_n int;
  v_pnl numeric;
  v_run int;
  v_used numeric;
  v_key text;
begin
  if new.pnl is null or new.traded_at < greatest(v_from, now() - interval '3 hours') or new.traded_at > now() + interval '5 minutes' then
    return null;
  end if;
  select pp.daily_loss_limit, pp.max_trades, pp.stop_after_losses, pp.push_limits into r from public.profile_private pp where pp.id = new.user_id;
  if not found or not r.push_limits or (coalesce(r.daily_loss_limit, 0) <= 0 and coalesce(r.max_trades, 0) <= 0 and coalesce(r.stop_after_losses, 0) <= 0)
     or not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then
    return null;
  end if;
  select count(*), coalesce(sum(t.pnl), 0) into v_n, v_pnl
    from public.trades t where t.user_id = new.user_id and t.traded_at >= v_from and t.traded_at < v_from + interval '1 day';
  select count(*) into v_run from (
    select t.pnl, count(*) filter (where t.pnl > 0) over (order by t.traded_at desc, t.id rows between unbounded preceding and current row) as wins
      from public.trades t where t.user_id = new.user_id and t.traded_at >= v_from and t.traded_at < v_from + interval '1 day'
  ) x where x.wins = 0 and x.pnl < 0;
  v_used := greatest(0, -v_pnl);
  v_key := 'limit:' || v_day || ':';

  if coalesce(r.daily_loss_limit, 0) > 0 then
    if v_used >= r.daily_loss_limit then
      perform public.push_queue(new.user_id, 'limit', 'Daily loss limit reached', 'That''s your limit for today. Your rule says stop here.',
        '/desk/#dashboard', 'limit-loss', v_key || 'loss:hit', true);
    elsif v_used >= r.daily_loss_limit * 0.8 and not exists (select 1 from public.push_outbox o where o.user_id = new.user_id and o.dedupe = v_key || 'loss:hit') then
      perform public.push_queue(new.user_id, 'limit', 'Close to your daily loss limit',
        'You''ve used ' || floor(v_used / r.daily_loss_limit * 100)::int || '% of it today. One more loss could end the day.',
        '/desk/#dashboard', 'limit-loss', v_key || 'loss:near');
    end if;
  end if;

  if coalesce(r.max_trades, 0) > 0 then
    if v_n >= r.max_trades then
      perform public.push_queue(new.user_id, 'limit', 'Trade limit reached',
        'That''s ' || v_n || ' trades today, your most for a day. Your rule says you''re done.', '/desk/#dashboard', 'limit-trades', v_key || 'trades:hit', true);
    elsif r.max_trades >= 2 and v_n = r.max_trades - 1 then
      perform public.push_queue(new.user_id, 'limit', 'One trade left today',
        'You''ve taken ' || v_n || ' of your ' || r.max_trades || ' for today.', '/desk/#dashboard', 'limit-trades', v_key || 'trades:near');
    end if;
  end if;

  if coalesce(r.stop_after_losses, 0) > 0 and new.pnl < 0 then
    if v_run >= r.stop_after_losses then
      perform public.push_queue(new.user_id, 'limit', v_run || ' losses in a row',
        'Your rule says stop after ' || r.stop_after_losses || '. Step away for today.', '/desk/#dashboard', 'limit-streak', v_key || 'streak:hit', true);
    elsif r.stop_after_losses >= 2 and v_run = r.stop_after_losses - 1 then
      perform public.push_queue(new.user_id, 'limit', 'One loss from your stop',
        case when v_run = 1 then 'One more loss and your rule says stop for today.'
             else 'That''s ' || v_run || ' in a row. One more and your rule says stop for today.' end,
        '/desk/#dashboard', 'limit-streak', v_key || 'streak:near');
    end if;
  end if;
  return null;
end $$;
revoke all on function public.push_limits_check() from public, anon, authenticated;
create trigger trades_push_limits after insert or update of pnl, traded_at on public.trades
  for each row execute function public.push_limits_check();

create or replace function public.push_dm()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.push_queue(m.user_id, 'dm', 'Marble', 'New message on Marble', '/desk/#community', 'dm')
     from public.dm_members m join public.profile_private pp on pp.id = m.user_id
    where m.thread_id = new.thread_id and m.user_id <> new.user_id
      and m.state in ('active', 'request', 'left') and not m.muted and pp.push_dms
      and (m.last_read_at is null or m.last_read_at < now() - interval '2 minutes')
      and not exists (select 1 from public.push_outbox o where o.user_id = m.user_id and o.kind = 'dm'
                         and o.created_at > greatest(now() - interval '10 minutes', coalesce(m.last_read_at, '-infinity'::timestamptz)));
  return null;
end $$;
revoke all on function public.push_dm() from public, anon, authenticated;
create trigger dm_messages_push after insert on public.dm_messages for each row execute function public.push_dm();

create or replace function public.push_mention()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_by text;
  v_room text;
  v_to uuid;
  h text;
begin
  if new.room = 'general' or new.hidden or position('@' in new.body) = 0 then return null; end if;
  select pr.handle::text into v_by from public.profiles pr where pr.id = new.user_id;
  v_room := case new.room when 'OLY' then 'Olympians' when 'NITE' then 'Night Shift' when 'PIT' then 'Pit Lane' else new.room end;
  for h in
    select distinct rtrim((m)[1], '.') from regexp_matches(lower(new.body), '(?:^|[^a-z0-9._@])@([a-z0-9._]{2,20})', 'g') as m limit 5
  loop
    v_to := public.dm_user_by_handle(h);
    continue when v_to is null or v_to = new.user_id;
    continue when not exists (select 1 from public.crew_members c where c.user_id = v_to and c.crew = new.room);
    continue when public.blocked_between(v_to, new.user_id);
    continue when not coalesce((select pp.push_mentions from public.profile_private pp where pp.id = v_to), true);
    continue when exists (select 1 from public.push_outbox o where o.user_id = v_to and o.kind = 'mention'
                            and o.tag = 'mention-' || lower(new.room) and o.created_at > now() - interval '5 minutes');
    perform public.push_queue(v_to, 'mention', v_room || ' chat', '@' || coalesce(v_by, 'someone') || ' mentioned you',
      '/desk/#community', 'mention-' || lower(new.room));
  end loop;
  return null;
end $$;
revoke all on function public.push_mention() from public, anon, authenticated;
create trigger chat_messages_push after insert on public.chat_messages for each row execute function public.push_mention();

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_cron', 'Shared secret: the pg_cron job to the push-send edge function');
  end if;
end $$;

create or replace function public.push_cron_ok(p_secret text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(length(p_secret) = 64 and p_secret = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_cron' limit 1), false)
$$;
revoke all on function public.push_cron_ok(text) from public, anon, authenticated;
grant execute on function public.push_cron_ok(text) to service_role;

create or replace function public.push_batch()
returns table (id bigint, endpoint text, p256dh text, auth text, payload jsonb, urgent boolean)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not pg_try_advisory_xact_lock(hashtext('push_batch')) then return; end if;
  delete from public.push_outbox where created_at < now() - interval '2 days';
  delete from public.push_subscriptions where seen_at < now() - interval '6 months';
  return query
  with due as (
    update public.push_outbox o set sent_at = now()
     where o.id in (select x.id from public.push_outbox x where x.sent_at is null order by x.id limit 300)
    returning o.id, o.user_id, o.title, o.body, o.url, o.tag, o.urgent, o.created_at
  )
  select d.id, s.endpoint, s.p256dh, s.auth, jsonb_build_object('title', d.title, 'body', d.body, 'url', d.url, 'tag', d.tag), d.urgent
    from due d join public.push_subscriptions s on s.user_id = d.user_id
   where d.created_at > now() - interval '30 minutes';
end $$;
revoke all on function public.push_batch() from public, anon, authenticated;
grant execute on function public.push_batch() to service_role;

create or replace function public.push_gone(p_endpoints text[])
returns void language sql security definer set search_path = ''
as $$ delete from public.push_subscriptions where endpoint = any(p_endpoints) $$;
revoke all on function public.push_gone(text[]) from public, anon, authenticated;
grant execute on function public.push_gone(text[]) to service_role;

select cron.schedule(
  'push-send',
  '30 seconds',
  $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from public.push_outbox where sent_at is null);
  $job$
);;
