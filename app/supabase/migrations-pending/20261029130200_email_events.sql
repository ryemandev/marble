-- Trial emails: what was sent to whom, and who unsubscribed. NOT APPLIED. Written 29 October 2026 for review; apply it
-- before deploying the trial-emails and email-unsubscribe edge functions (supabase/functions/), the only things that
-- read or write here.
--
-- What it makes:
--   email_events               one row per trader and kind: each trial email sent (so it's sent once, ever), and
--                              'unsubscribed' when they've opted out of the non-essential ones (days 1, 2, 3 and 6)
--   trial_email_candidates()   the traders whose 5-day trial is current or just ended, with what the emails need
--
-- Access: row level security is on with NO policies, and nothing is granted to anon or authenticated, so no browser
-- can read or write any of it. Only the service role (the two edge functions) reaches it. Rows go when the account is
-- deleted (on delete cascade), like the rest of a trader's personal data.

begin;

create table public.email_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'trial_welcome',   -- day 0, service: welcome, set your limits
    'trial_grading',   -- day 1: your first journalled day, how grading works
    'trial_limits',    -- day 2: what your limits would have saved
    'trial_founder',   -- day 3: the founder's story and the Founders' Lifetime
    'trial_ending',    -- day 4, service: your trial ends tomorrow
    'trial_question',  -- day 6, only if they didn't stay: what stopped you?
    'unsubscribed'     -- opted out of the non-essential ones (email-unsubscribe)
  )),
  created_at timestamptz not null default now(),
  -- Resend's id for a sent email, for looking it up in Resend's dashboard
  provider_id text check (provider_id is null or char_length(provider_id) <= 100),
  unique (user_id, kind)
);
comment on table public.email_events is 'Trial emails sent (once per trader and kind) and unsubscribes. Written only by the trial-emails and email-unsubscribe edge functions.';
create index email_events_created_at on public.email_events (created_at desc);

alter table public.email_events enable row level security;
revoke all on table public.email_events from anon, authenticated;

-- The traders the trial emails are for: a subscription that has (or had) a free trial ending between 3 days ago and
-- 8 days from now, one row per trader (their latest such subscription), with everything the emails need. The edge
-- function decides which email, if any, each one gets today.
create or replace function public.trial_email_candidates()
 returns table (
   user_id uuid, email text, name text, currency text,
   trial_end timestamptz, sub_created timestamptz, status text, cancel_at_period_end boolean,
   plan text, amount integer, sub_currency text,
   has_access boolean, marketing_opt_in boolean,
   daily_loss_limit numeric, max_trades integer, stop_after_losses integer,
   events jsonb
 )
 language sql
 stable security definer
 set search_path to ''
as $function$
  select distinct on (s.user_id)
    s.user_id, u.email::text, coalesce(p.name, ''), coalesce(pp.currency, 'GBP'),
    s.trial_end, s.created_at, s.status, s.cancel_at_period_end,
    s.plan, s.amount, s.currency,
    public.has_access_for(s.user_id), coalesce(pp.marketing_opt_in, false),
    pp.daily_loss_limit, pp.max_trades, pp.stop_after_losses,
    coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at)) from public.email_events e where e.user_id = s.user_id), '[]'::jsonb)
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join public.profile_private pp on pp.id = s.user_id
  where s.trial_end is not null
    and s.trial_end > now() - interval '3 days'
    and s.trial_end < now() + interval '8 days'
    and u.email is not null
  order by s.user_id, s.created_at desc
$function$;

revoke all on function public.trial_email_candidates() from public, anon, authenticated;
grant execute on function public.trial_email_candidates() to service_role;

commit;
