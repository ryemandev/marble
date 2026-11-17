-- Trial emails: what was sent to whom, and who unsubscribed. Only the trial-emails and email-unsubscribe functions reach it.
create table public.email_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'trial_welcome', 'trial_grading', 'trial_limits', 'trial_founder', 'trial_ending', 'trial_question', 'unsubscribed'
  )),
  created_at timestamptz not null default now(),
  provider_id text check (provider_id is null or char_length(provider_id) <= 100),
  unique (user_id, kind)
);
comment on table public.email_events is 'Trial emails sent (once per trader and kind) and unsubscribes. Written only by the trial-emails and email-unsubscribe edge functions.';
create index email_events_created_at on public.email_events (created_at desc);

alter table public.email_events enable row level security;
revoke all on table public.email_events from anon, authenticated;

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
grant execute on function public.trial_email_candidates() to service_role;;
