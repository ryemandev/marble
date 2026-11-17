create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'news_sync_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'news_sync_cron', 'Shared secret: the pg_cron jobs to the news edge functions');
  end if;
end $$;

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
$job$);;
