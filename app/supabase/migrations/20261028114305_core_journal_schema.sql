-- Marble: each trader's own journal. Every table is private to its owner by row level security.

create extension if not exists citext;

-- Profiles: one per signed-in user, created by trigger on sign-up
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle citext unique not null check (handle ~ '^[a-z0-9._]{2,24}$'),
  name text not null default '' check (char_length(name) <= 60),
  bio text not null default '' check (char_length(bio) <= 280),
  avatar_url text,
  avatar_art text,
  cover text not null default 'gods/apollo-light',
  markets text[] not null default '{Futures}',
  style text not null default 'Day trader',
  show_as text not null default 'dollars' check (show_as in ('dollars', 'r', 'percent')),
  desk_account uuid,
  currency text not null default 'GBP' check (currency in ('GBP', 'USD', 'JPY')),
  marketing_opt_in boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trading accounts (prop evaluations, funded, live)
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'Live',
  status text not null default 'live' check (status in ('eval', 'funded', 'live', 'paper')),
  balance numeric(14, 2) not null default 0,
  color text not null default '#c8cacf',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_desk_account_fk foreign key (desk_account) references public.accounts (id) on delete set null;

-- Strategies (the playbook): setup name and its rules
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  setup text not null check (char_length(setup) between 1 and 60),
  name text not null default '',
  god text,
  img text,
  rules text[] not null default '{}' check (cardinality(rules) <= 12),
  created_at timestamptz not null default now(),
  unique (user_id, setup)
);

-- Trades: the journal
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  account_id uuid references public.accounts (id) on delete set null,
  traded_at timestamptz not null default now(),
  symbol text not null check (char_length(symbol) between 1 and 16),
  side text not null check (side in ('long', 'short')),
  setup text,
  entry numeric(18, 6),
  stop numeric(18, 6),
  exit numeric(18, 6),
  size numeric(14, 4),
  r numeric(8, 2),
  pnl numeric(14, 2) not null default 0,
  grade text check (grade in ('A+', 'A', 'B', 'C')),
  emotion text,
  followed_plan boolean not null default true,
  kept boolean[] not null default '{}',
  note text not null default '' check (char_length(note) <= 4000),
  screenshots text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trades_user_time on public.trades (user_id, traded_at desc);

-- Study notes
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 120),
  folder text not null default 'Lessons',
  body text not null default '' check (char_length(body) <= 20000),
  video_at text,
  trade_id uuid references public.trades (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The daily plan: one per trader per day
create table public.daily_plans (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  day date not null default current_date,
  bias text not null default '',
  levels text[] not null default '{}',
  news text not null default '',
  risk text not null default '',
  checklist boolean[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Keep updated_at honest
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trades_touch before update on public.trades for each row execute function public.touch_updated_at();
create trigger plans_touch before update on public.daily_plans for each row execute function public.touch_updated_at();

-- A profile for every new user: a handle from the email (made unique), the name if the provider gave one
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'trader'), '[^a-z0-9._]', '', 'gi'));
  candidate text;
  n int := 0;
begin
  if char_length(base) < 2 then base := 'trader'; end if;
  base := left(base, 20);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop
    n := n + 1;
    candidate := left(base, 20) || n::text;
  end loop;
  insert into public.profiles (id, handle, name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Row level security: owners only
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.strategies enable row level security;
alter table public.trades enable row level security;
alter table public.notes enable row level security;
alter table public.daily_plans enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own accounts" on public.accounts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own strategies" on public.strategies for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own trades" on public.trades for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own notes" on public.notes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own plans" on public.daily_plans for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index accounts_user on public.accounts (user_id);
create index strategies_user on public.strategies (user_id);
create index notes_user on public.notes (user_id);
create index trades_account on public.trades (account_id);
create index notes_trade on public.notes (trade_id);
create index profiles_desk on public.profiles (desk_account);
;
