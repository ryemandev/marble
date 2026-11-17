-- The one welcome email, in place of the trial emails. NOT APPLIED. Written 4 November 2026 for review.
-- Marble is free, so there are no trials to write about: a new trader gets one note from Jules after they sign up.
--
-- Deploy the welcome-email function first, with verify_jwt off (it checks the secret below itself). It uses the
-- RESEND_API_KEY and EMAIL_LINK_SECRET secrets that trial-emails used. Then apply this file. Needs
-- 20261029130200_email_events.sql and 20261029130300_trial_emails_schedule.sql.
--
-- What it does:
--   email_events               allows the new kind 'welcome'. The trial kinds stay allowed: rows already saved use them
--   vault secret               'welcome_email_cron': a random shared secret, made here, never written anywhere else. The
--                              job sends it; the function asks the database whether it matches, so nobody can trigger
--                              the email by calling the function's address
--   welcome_email_cron_ok()    for the edge function only (service role)
--   welcome_email_candidates() replaces trial_email_candidates(): who the welcome email is due for
--   the job 'welcome-email'    replaces the job 'trial-emails', on the hour, every hour, as it was
--
-- Works whether or not the job 'trial-emails' still exists, so it's safe to apply twice and in any order against
-- 20261104140000_always_free_step_one.sql. That file's own cron.unschedule('trial-emails') is not: it fails if the job
-- has already gone, so apply it first or change that line.
--
-- To run it by hand once deployed, run the job's select net.http_post(...) below in the SQL editor. Add "dry": true to
-- its body to see how many are due without sending anything.
-- To stop it: select cron.unschedule('welcome-email');
--
-- To undo it (it isn't in ROLLBACK.md yet):
--   select cron.unschedule(jobname) from cron.job where jobname = 'welcome-email';
--   drop function if exists public.welcome_email_candidates();
--   drop function if exists public.welcome_email_cron_ok(text);
--   delete from public.email_events where kind = 'welcome';
--   alter table public.email_events drop constraint email_events_kind_check;
--   then add the constraint back without 'welcome', and re-apply the two files above to bring the trial job back.
--
-- Left in the Vault on purpose: the old secret 'trial_emails_cron', so undoing this needs nothing new. Nothing reads it
-- once this is on. To remove it afterwards: delete from vault.secrets where name = 'trial_emails_cron';

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.email_events drop constraint if exists email_events_kind_check;
alter table public.email_events add constraint email_events_kind_check check (kind in (
  'welcome',         -- the one welcome email, sent once, ever
  'unsubscribed',    -- opted out of notes from Marble (email-unsubscribe)
  'trial_welcome', 'trial_grading', 'trial_limits', 'trial_founder', 'trial_ending', 'trial_question'  -- past sends, kept as the record
));
comment on table public.email_events is 'The welcome email sent (once per trader), past trial emails, and unsubscribes. Written only by the welcome-email and email-unsubscribe edge functions.';

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'welcome_email_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'welcome_email_cron', 'Shared secret: the hourly pg_cron job to the welcome-email edge function');
  end if;
end $$;

create or replace function public.welcome_email_cron_ok(p_secret text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(length(p_secret) = 64 and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'welcome_email_cron' limit 1), false)
$function$;

revoke all on function public.welcome_email_cron_ok(text) from public, anon, authenticated;
grant execute on function public.welcome_email_cron_ok(text) to service_role;

-- Traders who signed up in the last 3 days and confirmed their email. Not anyone who's had it, or the trial welcome
-- it replaces, or who has unsubscribed. The function claims each one in email_events before it sends.
create or replace function public.welcome_email_candidates()
 returns table (user_id uuid, email text, name text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select u.id, u.email::text, coalesce(p.name, '')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email is not null
    and u.email_confirmed_at is not null
    and u.created_at > now() - interval '3 days'
    and not exists (
      select 1 from public.email_events e
      where e.user_id = u.id and e.kind in ('welcome', 'trial_welcome', 'unsubscribed')
    )
  order by u.created_at
$function$;

revoke all on function public.welcome_email_candidates() from public, anon, authenticated;
grant execute on function public.welcome_email_candidates() to service_role;

-- The swap. Reading cron.job first means no error if the old job has already gone
select cron.unschedule(jobname) from cron.job where jobname = 'trial-emails';

-- Scheduling under the same name again replaces the job, so this file is safe to apply twice
select cron.schedule(
  'welcome-email',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-marble-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'welcome_email_cron' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

drop function if exists public.trial_email_candidates();
drop function if exists public.trial_emails_cron_ok(text);

commit;
