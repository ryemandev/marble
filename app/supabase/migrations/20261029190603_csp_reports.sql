-- Content-Security-Policy reports (security audit 2, M4). Only the csp-report edge function reaches these.
create table public.csp_reports (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  document_uri text check (document_uri is null or char_length(document_uri) <= 200),
  violated_directive text check (violated_directive is null or violated_directive ~ '^[a-z-]{1,40}$'),
  effective_directive text check (effective_directive is null or effective_directive ~ '^[a-z-]{1,40}$'),
  blocked_uri text check (blocked_uri is null or char_length(blocked_uri) <= 120),
  source_file text check (source_file is null or char_length(source_file) <= 200),
  line_number integer check (line_number is null or line_number between 0 and 10000000),
  column_number integer check (column_number is null or column_number between 0 and 10000000),
  disposition text check (disposition is null or disposition in ('enforce', 'report')),
  status_code integer check (status_code is null or status_code between 0 and 999),
  sample text check (sample is null or char_length(sample) <= 80),
  browser text check (browser is null or char_length(browser) <= 30)
);
comment on table public.csp_reports is 'Content-Security-Policy violation reports, trimmed (no query strings, no IPs). Written only by the csp-report edge function; kept 30 days.';
create index csp_reports_received_at on public.csp_reports (received_at);

create table public.csp_report_hits (
  id bigint generated always as identity primary key,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz not null default now()
);
comment on table public.csp_report_hits is 'Rate limit for csp-report: HMAC hashes of the sender''s IP only, never the IP. Kept one day.';
create index csp_report_hits_lookup on public.csp_report_hits (key_hash, at desc);
create index csp_report_hits_at on public.csp_report_hits (at);

alter table public.csp_reports enable row level security;
alter table public.csp_report_hits enable row level security;
revoke all on table public.csp_reports from anon, authenticated;
revoke all on table public.csp_report_hits from anon, authenticated;

create or replace function public.csp_report_save(p_key text, p_reports jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mine_10m int;
  v_mine_day int;
  v_all_1m int;
  v_kept int := 0;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' or p_reports is null or jsonb_typeof(p_reports) <> 'array' then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('csp_report_save', 0));
  delete from public.csp_report_hits where at < now() - interval '1 day';
  select count(*) filter (where key_hash = p_key and at > now() - interval '10 minutes'),
         count(*) filter (where key_hash = p_key),
         count(*) filter (where at > now() - interval '1 minute')
    into v_mine_10m, v_mine_day, v_all_1m
    from public.csp_report_hits;
  if v_mine_10m >= 20 or v_mine_day >= 200 or v_all_1m >= 120 then
    return 0;
  end if;
  insert into public.csp_report_hits (key_hash) values (p_key);

  insert into public.csp_reports (document_uri, violated_directive, effective_directive, blocked_uri, source_file,
                                  line_number, column_number, disposition, status_code, sample, browser)
  select left(r->>'document_uri', 200),
         case when r->>'violated_directive' ~ '^[a-z-]{1,40}$' then r->>'violated_directive' end,
         case when r->>'effective_directive' ~ '^[a-z-]{1,40}$' then r->>'effective_directive' end,
         left(r->>'blocked_uri', 120),
         left(r->>'source_file', 200),
         case when r->>'line_number' ~ '^[0-9]{1,8}$' then least((r->>'line_number')::int, 10000000) end,
         case when r->>'column_number' ~ '^[0-9]{1,8}$' then least((r->>'column_number')::int, 10000000) end,
         case when r->>'disposition' in ('enforce', 'report') then r->>'disposition' end,
         case when r->>'status_code' ~ '^[0-9]{1,3}$' then (r->>'status_code')::int end,
         left(r->>'sample', 80),
         left(r->>'browser', 30)
    from (select value as r from jsonb_array_elements(p_reports) limit 10) x
   where jsonb_typeof(r) = 'object';
  get diagnostics v_kept = row_count;

  delete from public.csp_reports where received_at < now() - interval '30 days';
  return v_kept;
end;
$$;
revoke all on function public.csp_report_save(text, jsonb) from public, anon, authenticated;
grant execute on function public.csp_report_save(text, jsonb) to service_role;

create or replace function public.csp_reports_purge()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.csp_reports where received_at < now() - interval '30 days';
  delete from public.csp_report_hits where at < now() - interval '1 day';
$$;
revoke all on function public.csp_reports_purge() from public, anon, authenticated;
grant execute on function public.csp_reports_purge() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('csp-reports-purge', '29 3 * * *', 'select public.csp_reports_purge()');
  end if;
end;
$$;;
