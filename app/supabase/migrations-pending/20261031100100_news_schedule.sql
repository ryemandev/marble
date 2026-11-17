-- Runs the three news functions on a schedule. NOT APPLIED. Apply LAST: after 20261031100000_news_dashboard.sql and
-- after news-calendar, news-wire and news-actuals are deployed (each with verify_jwt off: they check the secret
-- below themselves, through news_sync_cron_ok). Sources whose key isn't set yet are skipped and say so in the
-- function's reply and logs; nothing fails.
--
-- What it makes:
--   pg_cron and pg_net        already on if the trial-emails schedule was applied; made here if not
--   vault secret              'news_sync_cron': a random shared secret, made here and never written anywhere else
--   'news-calendar'           every 6 hours: the official calendars into econ_events
--   'news-wire'               every 10 minutes: official press releases (and mediastack, once MEDIASTACK_KEY is set)
--   'news-actuals'            every 2 minutes, 06:00 to 21:59 UTC on weekdays: previous and actual figures for
--                             releases due soon or just out. It returns at once when nothing is due.
--
-- To run one by hand once deployed: run its select net.http_post(...) below in the SQL editor.
-- To stop them: select cron.unschedule('news-calendar'); select cron.unschedule('news-wire'); select cron.unschedule('news-actuals');

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'news_sync_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'news_sync_cron', 'Shared secret: the pg_cron jobs to the news edge functions');
  end if;
end $$;

-- Scheduling under the same name again replaces the job, so this file is safe to apply twice
select cron.schedule('news-calendar', '17 */6 * * *', $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/news-calendar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'news_sync_cron' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);

select cron.schedule('news-wire', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/news-wire',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'news_sync_cron' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);

select cron.schedule('news-actuals', '*/2 6-21 * * 1-5', $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/news-actuals',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'news_sync_cron' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);

commit;
