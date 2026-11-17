-- The website's two forms: Partners and Careers. Only the partner-apply and career-interest edge functions write here.
create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('creator', 'firm', 'platform')),
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) between 6 and 254 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  link text not null check (char_length(link) between 10 and 300 and link ~ '^https?://'),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'replied', 'accepted', 'declined', 'spam')),
  notes text check (notes is null or char_length(notes) <= 4000)
);
comment on table public.partner_applications is 'Applications from trademarble.app/partners. Written only by the partner-apply edge function; kept 24 months (forms_purge).';
create index partner_applications_created_at on public.partner_applications (created_at desc);
create index partner_applications_email on public.partner_applications (email, created_at desc);

create table public.career_interest (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) between 6 and 254 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  area text not null check (area in ('cofounder', 'marketing', 'content', 'community', 'support', 'engineering', 'design', 'panel', 'crew', 'other')),
  link text check (link is null or (char_length(link) between 10 and 300 and link ~ '^https?://')),
  message text check (message is null or char_length(message) <= 600),
  status text not null default 'new' check (status in ('new', 'replied', 'archived')),
  unique (email, area)
);
comment on table public.career_interest is 'Register-interest entries from trademarble.app/careers. Written only by the career-interest edge function (insert, duplicates ignored: never overwritten); kept 24 months after the last update (forms_purge).';
create index career_interest_updated_at on public.career_interest (updated_at desc);

create table public.form_rate_hits (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('partner:ip', 'partner:email', 'partner:all', 'partner:verified',
                                     'career:ip', 'career:email', 'career:all', 'career:verified')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz not null default now()
);
comment on table public.form_rate_hits is 'Rate limit for the website forms: HMAC hashes only, never an IP or email. Rows older than two days are deleted.';
create index form_rate_hits_lookup on public.form_rate_hits (kind, key_hash, at desc);
create index form_rate_hits_at on public.form_rate_hits (at);

alter table public.partner_applications enable row level security;
alter table public.career_interest enable row level security;
alter table public.form_rate_hits enable row level security;
revoke all on table public.partner_applications from anon, authenticated;
revoke all on table public.career_interest from anon, authenticated;
revoke all on table public.form_rate_hits from anon, authenticated;

create or replace function public.form_rate_ok(p_kind text, p_key text, p_per_hour int, p_per_day int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hour_n int;
  day_n int;
begin
  perform pg_advisory_xact_lock(hashtextextended('form_rate:' || p_kind || ':' || p_key, 0));
  delete from public.form_rate_hits where at < now() - interval '2 days';
  select count(*) filter (where at > now() - interval '1 hour'), count(*)
    into hour_n, day_n
    from public.form_rate_hits
   where kind = p_kind and key_hash = p_key and at > now() - interval '1 day';
  if hour_n >= p_per_hour or day_n >= p_per_day then
    return false;
  end if;
  insert into public.form_rate_hits (kind, key_hash) values (p_kind, p_key);
  return true;
end;
$$;
revoke all on function public.form_rate_ok(text, text, int, int) from public, anon, authenticated;
grant execute on function public.form_rate_ok(text, text, int, int) to service_role;

create or replace function public.forms_purge()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.partner_applications where created_at < now() - interval '24 months';
  delete from public.career_interest where updated_at < now() - interval '24 months';
  delete from public.form_rate_hits where at < now() - interval '2 days';
$$;
revoke all on function public.forms_purge() from public, anon, authenticated;
grant execute on function public.forms_purge() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('forms-purge', '17 3 * * *', 'select public.forms_purge()');
  end if;
end;
$$;;
