-- Every import of a broker or platform file, so it can be listed and undone
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  platform text not null check (char_length(platform) between 1 and 60),
  file_name text check (char_length(file_name) <= 200),
  added int not null default 0,
  duplicates int not null default 0,
  open_positions int not null default 0,
  -- fills of positions still open at the end of the file, carried into the next import to the same account
  open_fills jsonb not null default '[]'::jsonb,
  status text not null default 'done' check (status in ('done', 'undone')),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
alter table public.imports enable row level security;
create policy "own imports" on public.imports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index imports_user_idx on public.imports (user_id, created_at desc);
create index imports_account_idx on public.imports (account_id);

-- Where a trade came from, and what the file said about it
alter table public.trades
  add column source text not null default 'manual' check (source in ('manual', 'import', 'sync')),
  add column external_id text check (char_length(external_id) <= 200),
  add column fills jsonb,
  add column commission numeric,
  add column import_id uuid references public.imports(id) on delete set null,
  add column closed_at timestamptz,
  add column needs_review boolean not null default false;
-- An imported trade hasn't been checked against the plan yet: unknown, not kept or broken
alter table public.trades alter column followed_plan drop not null;

-- The same trade from the same place lands once per account
create unique index trades_external_unique on public.trades (user_id, account_id, source, external_id) nulls not distinct
  where external_id is not null;
create index trades_import_idx on public.trades (import_id) where import_id is not null;
create index trades_review_idx on public.trades (user_id) where needs_review;

-- Column mappings remembered per platform, and the dollar risk that turns P&L into R for imported trades
alter table public.profile_private
  add column import_mappings jsonb not null default '{}'::jsonb,
  add column default_risk numeric check (default_risk is null or default_risk > 0);
;
