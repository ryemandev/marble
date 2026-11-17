-- Crash alerts, first-party. NOT APPLIED. Written 29 October 2026 for review.
-- Apply it before deploying the crash-report edge function (verify_jwt off) and the app build that sends to it
-- (src/live/crash-alerts.js). Until both are live, the app's sends fail quietly and nothing is kept.
--
-- What it makes:
--   vault secrets          'crash_pepper': the key the two hashes below are made with, so no account id or IP is ever
--                          stored; 'crash_digest_cron': the daily job's shared secret. Both random, made here, never
--                          written anywhere else.
--   crash_reports          one row per crash the app sent, trimmed to what helps fix it: the kind (a screen, the whole
--                          app, an error or a promise nothing caught), the message (emails and tokens blanked, at most
--                          300 characters), up to 6 places in the code as file path and line (800 characters), the
--                          screen, the page's path, the build, phone, tablet or desktop, the browser family
--                          ("Chrome 131"), a keyed hash of the signed-in trader (null when signed out) and the
--                          fingerprint that groups the same crash. Kept 30 days.
--   crash_report_hits      the rate limit: a keyed hash of the sender (the trader, or the IP when signed out), kept one day
--   crash_report_save()    for the edge function (service role) only: checks the limits, trims every field again,
--                          hashes, keeps the crash
--   crash_cron_ok()        checks the daily job's secret, for the edge function
--   crash_digest()         the last 24 hours grouped by fingerprint, and the owner's address, for the daily email
--   crash_reports_purge()  the 30 days and the one day, nightly
--   the jobs               'crash-digest' at 08:00 UTC, 'crash-reports-purge' at 03:47 UTC
--
-- Access: row level security on with NO policies, every grant to anon and authenticated taken away, and every function
-- revoked from them too. Only the service role reaches any of it. Read the crashes in the SQL editor:
--   select fingerprint, kind, message, count(*), count(distinct user_hash) as traders, max(received_at) from public.crash_reports
--   where received_at > now() - interval '7 days' group by 1, 2, 3 order by 4 desc;
-- To send the digest by hand, run the job's select net.http_post(...) below; add "dry": true to its body to get the
-- email back in the function's reply without sending it. To stop it: select cron.unschedule('crash-digest');

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'crash_pepper') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'crash_pepper', 'Hash key: the trader and sender hashes kept with crash reports');
  end if;
  if not exists (select 1 from vault.secrets where name = 'crash_digest_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'crash_digest_cron', 'Shared secret: the daily pg_cron job to the crash-report edge function');
  end if;
end $$;

create table public.crash_reports (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  kind text not null check (kind in ('view', 'app', 'window', 'promise')),
  message text not null check (char_length(message) between 1 and 300),
  stack text check (stack is null or char_length(stack) <= 800),
  view text check (view is null or view ~ '^[a-z]{1,20}$'),
  path text check (path is null or path ~ '^/[A-Za-z0-9._~%/-]{0,119}$'),
  build text check (build is null or build ~ '^[A-Za-z0-9 .:_-]{1,24}$'),
  device text check (device is null or device in ('phone', 'tablet', 'desktop')),
  browser text check (browser is null or char_length(browser) <= 30),
  user_hash text check (user_hash is null or user_hash ~ '^[0-9a-f]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{16}$')
);
comment on table public.crash_reports is 'Crashes the app reported, trimmed (no IPs, emails, account ids, user agents or query strings; the trader as a keyed hash only). Written only by the crash-report edge function; kept 30 days.';
create index crash_reports_received_at on public.crash_reports (received_at);
create index crash_reports_fingerprint on public.crash_reports (fingerprint, received_at desc);

create table public.crash_report_hits (
  id bigint generated always as identity primary key,
  sender_hash text not null check (sender_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz not null default now()
);
comment on table public.crash_report_hits is 'Rate limit for crash-report: keyed hashes of the sender only, never an id or IP. Kept one day.';
create index crash_report_hits_lookup on public.crash_report_hits (sender_hash, at desc);
create index crash_report_hits_at on public.crash_report_hits (at);

alter table public.crash_reports enable row level security;
alter table public.crash_report_hits enable row level security;
-- (No policies on purpose. Supabase grants new tables to anon and authenticated by default; take that away too.)
revoke all on table public.crash_reports from anon, authenticated;
revoke all on table public.crash_report_hits from anon, authenticated;

-- One field as the table keeps it: control and direction characters out, emails and long tokens blanked, clipped
create or replace function public.crash_clean(p_text text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
    '[[:cntrl:]\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]+', ' ', 'g'),
    '[A-Za-z0-9_.+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+', '[email]', 'g'),
    '(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{32,})', '[token]', 'g')), p_max), '')
$$;
revoke all on function public.crash_clean(text, integer) from public, anon, authenticated;

-- One crash. p_sender: the signed-in trader's id, or the IP Cloudflare saw; p_user: the trader's id, checked by the
-- edge function with Supabase Auth, or null. Both are hashed here with the Vault key and never kept as they came.
-- At most 10 a sender in 10 minutes and 50 a day, and 300 an hour from everyone together (a flood can't fill the
-- table). Returns how many were kept: 1, or 0 when limited or not a crash.
create or replace function public.crash_report_save(p_sender text, p_user uuid, p_report jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pepper text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'crash_pepper' limit 1);
  v_sender text;
  v_mine_10m int;
  v_mine_day int;
  v_all_1h int;
  v_kind text := p_report->>'kind';
  v_message text;
  v_stack text;
  v_path text := p_report->>'path';
begin
  if v_pepper is null or coalesce(p_sender, '') = '' or p_report is null or jsonb_typeof(p_report) <> 'object'
     or v_kind is null or v_kind not in ('view', 'app', 'window', 'promise') then
    return 0;
  end if;
  v_sender := encode(extensions.hmac('crash:sender:' || left(p_sender, 100), v_pepper, 'sha256'), 'hex');
  -- One at a time, so two requests at the same moment can't both slip under a limit
  perform pg_advisory_xact_lock(hashtextextended('crash_report_save', 0));
  delete from public.crash_report_hits where at < now() - interval '1 day';
  select count(*) filter (where sender_hash = v_sender and at > now() - interval '10 minutes'),
         count(*) filter (where sender_hash = v_sender),
         count(*) filter (where at > now() - interval '1 hour')
    into v_mine_10m, v_mine_day, v_all_1h
    from public.crash_report_hits;
  if v_mine_10m >= 10 or v_mine_day >= 50 or v_all_1h >= 300 then
    return 0;
  end if;
  insert into public.crash_report_hits (sender_hash) values (v_sender);

  -- The edge function trims every field already; trimmed again here so nothing else can land whatever calls this
  v_message := coalesce(public.crash_clean(p_report->>'message', 300), '(no message)');
  select left(string_agg(f, E'\n' order by n), 800) into v_stack
    from (select f, n from (select public.crash_clean(l, 240) as f, n
                              from regexp_split_to_table(left(coalesce(p_report->>'stack', ''), 4000), E'\n') with ordinality as t(l, n)) y
           where f is not null order by n limit 6) x;
  insert into public.crash_reports (kind, message, stack, view, path, build, device, browser, user_hash, fingerprint)
  values (
    v_kind,
    v_message,
    v_stack,
    case when p_report->>'view' ~ '^[a-z]{1,20}$' then p_report->>'view' end,
    case when v_path ~ '^/[A-Za-z0-9._~%/-]{0,119}$' and v_path !~ '[A-Za-z0-9_-]{32}|eyJ[A-Za-z0-9_-]*\.' then v_path end,
    case when p_report->>'build' ~ '^[A-Za-z0-9 .:_-]{1,24}$' then p_report->>'build' end,
    case when p_report->>'device' in ('phone', 'tablet', 'desktop') then p_report->>'device' end,
    public.crash_clean(p_report->>'browser', 30),
    case when p_user is not null then encode(extensions.hmac('crash:user:' || p_user::text, v_pepper, 'sha256'), 'hex') end,
    -- The same crash: its kind, its message and the first place in the code
    left(encode(sha256(convert_to(v_kind || E'\n' || v_message || E'\n' || coalesce(split_part(v_stack, E'\n', 1), ''), 'UTF8')), 'hex'), 16)
  );

  -- Kept 30 days (also nightly, crash_reports_purge)
  delete from public.crash_reports where received_at < now() - interval '30 days';
  return 1;
end;
$$;
revoke all on function public.crash_report_save(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crash_report_save(text, uuid, jsonb) to service_role;

create or replace function public.crash_cron_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_secret) = 64 and p_secret = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'crash_digest_cron' limit 1), false)
$$;
revoke all on function public.crash_cron_ok(text) from public, anon, authenticated;
grant execute on function public.crash_cron_ok(text) to service_role;

-- The daily email's contents: every crash seen in the last 24 hours, grouped by fingerprint, most first (how many
-- times, how many signed-in traders, the screens, builds, browsers and devices, first seen in the 30 days kept, last
-- seen, and the latest example of where), and the owner's address: the staff admin, as dm_alert_batch finds them.
create or replace function public.crash_digest()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'owners', coalesce((select jsonb_agg(distinct u.email::text)
                          from public.admins a join public.staff s on s.user_id = a.user_id join auth.users u on u.id = a.user_id
                         where u.email is not null), '[]'::jsonb),
    'crashes', coalesce((select jsonb_agg(to_jsonb(g) order by g.times desc, g.last_seen desc) from (
      select r.fingerprint,
             min(r.kind) as kind,
             min(r.message) as message,
             (count(*) filter (where r.received_at > now() - interval '24 hours'))::int as times,
             (count(distinct r.user_hash) filter (where r.received_at > now() - interval '24 hours'))::int as users,
             coalesce(array_agg(distinct r.view) filter (where r.view is not null and r.received_at > now() - interval '24 hours'), '{}') as views,
             coalesce(array_agg(distinct r.build) filter (where r.build is not null and r.received_at > now() - interval '24 hours'), '{}') as builds,
             coalesce(array_agg(distinct r.browser) filter (where r.browser is not null and r.received_at > now() - interval '24 hours'), '{}') as browsers,
             coalesce(array_agg(distinct r.device) filter (where r.device is not null and r.received_at > now() - interval '24 hours'), '{}') as devices,
             min(r.received_at) as first_seen,
             max(r.received_at) as last_seen,
             (array_agg(r.stack order by r.received_at desc) filter (where r.stack is not null))[1] as stack
        from public.crash_reports r
       group by r.fingerprint
      having count(*) filter (where r.received_at > now() - interval '24 hours') > 0
       order by times desc
       limit 200) g), '[]'::jsonb)
  )
$$;
revoke all on function public.crash_digest() from public, anon, authenticated;
grant execute on function public.crash_digest() to service_role;

create or replace function public.crash_reports_purge()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.crash_reports where received_at < now() - interval '30 days';
  delete from public.crash_report_hits where at < now() - interval '1 day';
$$;
revoke all on function public.crash_reports_purge() from public, anon, authenticated;
grant execute on function public.crash_reports_purge() to service_role;

-- Scheduling under the same name again replaces the job, so this file is safe to apply twice
select cron.schedule('crash-reports-purge', '47 3 * * *', 'select public.crash_reports_purge()');
select cron.schedule(
  'crash-digest',
  '0 8 * * *',
  $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/crash-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'crash_digest_cron' limit 1)
    ),
    body := '{"digest": true}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

commit;
