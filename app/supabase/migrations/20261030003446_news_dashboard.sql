create table if not exists public.econ_events (
  id text primary key check (length(id) <= 120),
  source text not null check (source in ('BLS', 'BEA', 'ONS', 'Fed', 'BoE', 'ECB')),
  country text not null check (country in ('US', 'GB', 'EU')),
  title text not null check (length(title) <= 200),
  short text not null check (length(short) <= 60),
  impact text not null check (impact in ('high', 'med', 'low')),
  at timestamptz not null,
  period text check (length(period) <= 60),
  status text not null default 'scheduled' check (status in ('scheduled', 'postponed', 'cancelled')),
  prev text check (length(prev) <= 60),
  fcst text check (length(fcst) <= 60),
  actual text check (length(actual) <= 60),
  actual_at timestamptz,
  data_period text check (length(data_period) <= 10),
  updated_at timestamptz not null default now()
);
create index if not exists econ_events_at on public.econ_events (at);
alter table public.econ_events enable row level security;
-- No policies: the table is read through news_feed() and written by the service role

create table if not exists public.news_items (
  id text primary key check (length(id) <= 40),
  kind text not null check (kind in ('official', 'market')),
  source text not null check (length(source) <= 60),
  title text not null check (length(title) <= 300),
  url text not null check (url ~ '^https://' and length(url) <= 1000),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index if not exists news_items_published on public.news_items (published_at desc);
alter table public.news_items enable row level security;

create table if not exists public.news_rules (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  before_min smallint not null default 5 check (before_min between 0 and 60),
  after_min smallint not null default 5 check (after_min between 0 and 60),
  medium boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.news_rules enable row level security;
create policy "news_rules: own" on public.news_rules for select to authenticated using (user_id = (select auth.uid()));
create policy "news_rules: add own" on public.news_rules for insert to authenticated with check (user_id = (select auth.uid()));
create policy "news_rules: change own" on public.news_rules for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.news_rules to authenticated;

-- ---------- What the app reads ----------
create or replace function public.news_feed(p_days integer default 14)
returns jsonb
language sql stable security definer set search_path to ''
as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'access', public.has_access(),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'source', e.source, 'country', e.country, 'title', e.title, 'short', e.short,
        'impact', e.impact, 'at', e.at, 'period', e.period, 'status', e.status, 'prev', e.prev, 'fcst', e.fcst, 'actual', e.actual) order by e.at)
      from public.econ_events e
      where e.at >= now() - interval '7 days' and e.at < now() + make_interval(days => least(greatest(coalesce(p_days, 14), 1), 60))
    ), '[]'::jsonb),
    'items', case when public.has_access() then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'source', i.source, 'title', i.title, 'url', i.url, 'at', i.published_at) order by i.published_at desc)
      from (select * from public.news_items order by published_at desc limit 60) i
    ), '[]'::jsonb) else '[]'::jsonb end,
    'rule', (select jsonb_build_object('enabled', r.enabled, 'before', r.before_min, 'after', r.after_min, 'medium', r.medium)
      from public.news_rules r where r.user_id = (select auth.uid()))
  ) end
$$;
revoke all on function public.news_feed(integer) from public, anon;
grant execute on function public.news_feed(integer) to authenticated;

-- ---------- Tagging trades made inside the window ----------
alter table public.trades add column if not exists news_event text check (length(news_event) <= 60);

create or replace function public.tag_news_window()
returns trigger language plpgsql security definer set search_path to ''
as $$
declare
  r record;
begin
  if tg_op = 'UPDATE' and new.traded_at is not distinct from old.traded_at then
    new.news_event := old.news_event; -- only Marble sets it
    return new;
  end if;
  select coalesce(n.enabled, true) as enabled, coalesce(n.before_min, 5) as b, coalesce(n.after_min, 5) as a, coalesce(n.medium, false) as medium
    into r from (select 1) one left join public.news_rules n on n.user_id = new.user_id;
  new.news_event := null;
  if r.enabled and new.traded_at is not null then
    select e.short into new.news_event from public.econ_events e
     where e.status = 'scheduled' and (e.impact = 'high' or (r.medium and e.impact = 'med'))
       and new.traded_at >= e.at - make_interval(mins => r.b) and new.traded_at < e.at + make_interval(mins => r.a)
     order by abs(extract(epoch from new.traded_at - e.at)) limit 1;
  end if;
  return new;
end
$$;
revoke all on function public.tag_news_window() from public, anon, authenticated;
drop trigger if exists trades_news_window on public.trades;
create trigger trades_news_window before insert or update of traded_at, news_event on public.trades
  for each row execute function public.tag_news_window();

-- ---------- The cron jobs' secret (the Vault secret itself is made by the schedule file) ----------
create or replace function public.news_sync_cron_ok(p_secret text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(length(p_secret) = 64 and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'news_sync_cron' limit 1), false)
$function$;
revoke all on function public.news_sync_cron_ok(text) from public, anon, authenticated;
grant execute on function public.news_sync_cron_ok(text) to service_role;;
