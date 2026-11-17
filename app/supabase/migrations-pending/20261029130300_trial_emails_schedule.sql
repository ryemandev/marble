-- Runs the trial-emails edge function every hour (the welcome lands within the hour; the rest wait for UK daytime). NOT APPLIED.
-- Apply it LAST: after 20261029130200_email_events.sql, and after the trial-emails function is deployed (with
-- verify_jwt off: it checks the secret below itself). Until the owner adds the RESEND_API_KEY secret, each daily run
-- does nothing at all and says so in the function's logs.
--
-- What it makes:
--   pg_cron and pg_net        Supabase's job scheduler and its HTTP client (both offered on every plan)
--   vault secret              'trial_emails_cron': a random shared secret, made here, never written anywhere else. The
--                             job sends it; the function asks the database (trial_emails_cron_ok) whether it matches,
--                             so nobody can trigger the emails by calling the function's address
--   trial_emails_cron_ok()    for the edge function only (service role)
--   the job 'trial-emails'    on the hour, every hour. The function sends the welcome straight away and holds the
--                             other emails for 07:00-21:00 UK time (owner's call, 29 Oct 2026: hourly, not daily)
--
-- To run it by hand once deployed (for example after adding the Resend key), run the job's select net.http_post(...)
-- below in the SQL editor; add "dry": true to its body to see what it would send without sending anything.
-- To stop it: select cron.unschedule('trial-emails');

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'trial_emails_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'trial_emails_cron', 'Shared secret: the daily pg_cron job to the trial-emails edge function');
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

-- Scheduling under the same name again replaces the job, so this file is safe to apply twice
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

-- The nightly purges the privacy policy promises. Their own migrations only schedule them when pg_cron is already on,
-- and it first arrives here, so schedule them here too (cron.schedule doesn't need the function to exist yet)
select cron.schedule('forms-purge', '17 3 * * *', 'select public.forms_purge()');
select cron.schedule('chat-purge', '27 3 * * *', 'select public.chat_purge()');
select cron.schedule('csp-reports-purge', '29 3 * * *', 'select public.csp_reports_purge()');

commit;
