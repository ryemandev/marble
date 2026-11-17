-- Runs the trial-emails edge function every hour (it checks a Vault shared secret), and schedules the nightly purges.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'trial_emails_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'trial_emails_cron', 'Shared secret: the hourly pg_cron job to the trial-emails edge function');
  end if;
end $$;

create or replace function public.trial_emails_cron_ok(p_secret text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(length(p_secret) = 64 and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'trial_emails_cron' limit 1), false)
$function$;

revoke all on function public.trial_emails_cron_ok(text) from public, anon, authenticated;
grant execute on function public.trial_emails_cron_ok(text) to service_role;

select cron.schedule(
  'trial-emails',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/trial-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'trial_emails_cron' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

select cron.schedule('forms-purge', '17 3 * * *', 'select public.forms_purge()');
select cron.schedule('chat-purge', '27 3 * * *', 'select public.chat_purge()');
select cron.schedule('csp-reports-purge', '29 3 * * *', 'select public.csp_reports_purge()');

-- 20261029180400's L9: pg_net is for the database's own jobs (net didn't exist when that file was applied)
revoke usage on schema net from anon, authenticated;
revoke all on all functions in schema net from anon, authenticated;
revoke all on all tables in schema net from anon, authenticated;;
