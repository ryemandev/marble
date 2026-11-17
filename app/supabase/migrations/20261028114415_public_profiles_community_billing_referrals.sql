-- 1. Split private settings out of profiles, so profiles can be public to other traders
create table public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  desk_account uuid references public.accounts (id) on delete set null,
  currency text not null default 'GBP' check (currency in ('GBP', 'USD', 'JPY')),
  marketing_opt_in boolean not null default false,
  terms_accepted_at timestamptz,
  referred_by citext
);
insert into public.profile_private (id, desk_account, currency, marketing_opt_in, terms_accepted_at)
  select id, desk_account, currency, marketing_opt_in, terms_accepted_at from public.profiles;
alter table public.profiles drop column desk_account, drop column currency, drop column marketing_opt_in, drop column terms_accepted_at;
drop index if exists public.profiles_desk;
create index profile_private_desk on public.profile_private (desk_account);

alter table public.profile_private enable row level security;
create policy "own private: read" on public.profile_private for select to authenticated using (id = (select auth.uid()));
create policy "own private: update" on public.profile_private for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Profiles are visible to every signed-in trader (handle, name, bio, avatar, cover, markets, style)
drop policy "own profile: read" on public.profiles;
create policy "profiles: signed-in traders read" on public.profiles for select to authenticated using (true);

-- New users get both rows; the referral handle (if any) comes in the sign-up metadata
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'trader'), '[^a-z0-9._]', '', 'gi'));
  candidate text;
  n int := 0;
  ref text := lower(nullif(new.raw_user_meta_data ->> 'ref', ''));
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
  insert into public.profile_private (id, referred_by)
  values (new.id, case when ref is not null and exists (select 1 from public.profiles where handle = ref) then ref end);
  -- A referral, when the link's owner exists and isn't the new user
  if ref is not null then
    insert into public.referrals (referrer_id, referred_id)
    select p.id, new.id from public.profiles p where p.handle = ref and p.id <> new.id
    on conflict do nothing;
  end if;
  return new;
end $$;

-- 2. Admins (the owner): moderation and payouts
create table public.admins (user_id uuid primary key references auth.users (id) on delete cascade);
alter table public.admins enable row level security;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;

-- 3. Community: ideas and votes, polls and votes, posts (with an anonymous board)
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 3 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  area text not null default 'Other',
  status text not null default 'Under review' check (status in ('Under review', 'Planned', 'In progress', 'Shipped')),
  created_at timestamptz not null default now()
);
create table public.idea_votes (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  primary key (idea_id, user_id)
);
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  question text not null check (char_length(question) between 3 and 140),
  options text[] not null check (cardinality(options) between 2 and 4),
  ends_at timestamptz not null default now() + interval '3 days',
  created_at timestamptz not null default now()
);
create table public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  option smallint not null check (option between 0 and 3),
  primary key (poll_id, user_id)
);
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null default 'post' check (kind in ('post', 'win', 'loss', 'thread', 'reply')),
  crew text,
  parent_id uuid references public.posts (id) on delete cascade,
  anonymous boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  trade jsonb,
  image_url text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index posts_feed on public.posts (crew, created_at desc);
create index posts_parent on public.posts (parent_id);
create index posts_user on public.posts (user_id);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  post_id uuid references public.posts (id) on delete cascade,
  idea_id uuid references public.ideas (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);
create index reports_post on public.reports (post_id);
create index reports_idea on public.reports (idea_id);
create index reports_user on public.reports (user_id);
create index ideas_user on public.ideas (user_id);
create index idea_votes_user on public.idea_votes (user_id);
create index polls_user on public.polls (user_id);
create index poll_votes_user on public.poll_votes (user_id);

alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.posts enable row level security;
alter table public.reports enable row level security;

create policy "ideas: read" on public.ideas for select to authenticated using (true);
create policy "ideas: add own" on public.ideas for insert to authenticated with check (user_id = (select auth.uid()) and status = 'Under review');
create policy "ideas: delete own or admin" on public.ideas for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "ideas: admin sets status" on public.ideas for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "idea votes: read" on public.idea_votes for select to authenticated using (true);
create policy "idea votes: own" on public.idea_votes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "idea votes: unvote own" on public.idea_votes for delete to authenticated using (user_id = (select auth.uid()));

create policy "polls: read" on public.polls for select to authenticated using (true);
create policy "polls: add own" on public.polls for insert to authenticated with check (user_id = (select auth.uid()));
create policy "polls: delete own or admin" on public.polls for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "poll votes: read" on public.poll_votes for select to authenticated using (true);
create policy "poll votes: own, while open" on public.poll_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.polls p where p.id = poll_id and p.ends_at > now()));
create policy "poll votes: change own" on public.poll_votes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Posts are read through feed() so an anonymous author is never exposed; direct reads see only your own
create policy "posts: read own or admin" on public.posts for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "posts: add own" on public.posts for insert to authenticated with check (user_id = (select auth.uid()) and hidden = false);
create policy "posts: delete own or admin" on public.posts for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "posts: admin hides" on public.posts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "reports: add own" on public.reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reports: admin reads" on public.reports for select to authenticated using ((select public.is_admin()));

create or replace function public.feed(p_crew text default null, p_kind text default null, p_before timestamptz default now(), p_limit int default 30)
returns table (id uuid, kind text, crew text, parent_id uuid, body text, trade jsonb, image_url text, created_at timestamptz,
               author_handle citext, author_name text, author_avatar text, anonymous boolean, mine boolean, replies bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.crew, p.parent_id, p.body, p.trade, p.image_url, p.created_at,
         case when p.anonymous then null else pr.handle end,
         case when p.anonymous then null else pr.name end,
         case when p.anonymous then null else coalesce(pr.avatar_url, pr.avatar_art) end,
         p.anonymous, p.user_id = (select auth.uid()),
         (select count(*) from public.posts c where c.parent_id = p.id and not c.hidden)
  from public.posts p join public.profiles pr on pr.id = p.user_id
  where not p.hidden and (select auth.uid()) is not null
    and (p_crew is null or p.crew = p_crew) and (p_kind is null or p.kind = p_kind)
    and p.created_at < p_before
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;
revoke execute on function public.feed from public, anon;
grant execute on function public.feed to authenticated;

-- 4. Billing (written only by the Stripe webhook with the service role; owners can read their own)
create table public.customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique not null
);
create table public.subscriptions (
  id text primary key, -- Stripe subscription id
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null, -- trialing, active, past_due, canceled, unpaid, incomplete…
  plan text not null check (plan in ('monthly', 'yearly')),
  currency text not null,
  amount integer not null, -- minor units per period
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user on public.subscriptions (user_id);
create table public.lifetime_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  stripe_payment_intent text unique not null,
  seat integer unique not null check (seat between 1 and 500),
  currency text not null,
  amount integer not null,
  refunded boolean not null default false,
  created_at timestamptz not null default now()
);
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();

alter table public.customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.lifetime_purchases enable row level security;
create policy "own customer" on public.customers for select to authenticated using (user_id = (select auth.uid()));
create policy "own subscriptions" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "own lifetime" on public.lifetime_purchases for select to authenticated using (user_id = (select auth.uid()));

-- Whether a trader has the plan right now: a trial, an active (or cancelled-but-paid-up) subscription, or lifetime
create or replace function public.has_access(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and (
    exists (select 1 from public.lifetime_purchases l where l.user_id = uid and not l.refunded)
    or exists (select 1 from public.subscriptions s where s.user_id = uid
               and (s.status in ('trialing', 'active') or (s.status in ('past_due', 'canceled') and s.current_period_end > now())))
  )
$$;
revoke execute on function public.has_access from public, anon;
grant execute on function public.has_access to authenticated;

-- Founders' Lifetime seats taken (refunded seats come back); 500 then it closes
create or replace function public.founders_seats_taken() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.lifetime_purchases where not refunded
$$;
revoke execute on function public.founders_seats_taken from public, anon, authenticated;

-- 5. Refer and earn: referrals (made at sign-up), commissions (from the webhook), payout details and payouts
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  referred_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);
create index referrals_referrer on public.referrals (referrer_id);
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  referrer_id uuid not null references auth.users (id) on delete cascade,
  stripe_payment_ref text unique not null, -- invoice or payment intent
  paid_amount integer not null, -- what the referred trader paid, minor units
  paid_currency text not null,
  amount_pence integer not null check (amount_pence >= 0), -- 15%, in GBP pence
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'reversed')),
  payout_id uuid,
  created_at timestamptz not null default now()
);
create index commissions_referrer on public.commissions (referrer_id, created_at desc);
create index commissions_referral on public.commissions (referral_id);
create table public.payout_settings (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  method text not null check (method in ('PayPal', 'Wise', 'Bank transfer')),
  destination text not null check (char_length(destination) between 3 and 200),
  updated_at timestamptz not null default now()
);
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_pence integer not null check (amount_pence > 0),
  method text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index payouts_user on public.payouts (user_id);
alter table public.commissions add constraint commissions_payout_fk foreign key (payout_id) references public.payouts (id) on delete set null;
create index commissions_payout on public.commissions (payout_id);

alter table public.referrals enable row level security;
alter table public.commissions enable row level security;
alter table public.payout_settings enable row level security;
alter table public.payouts enable row level security;
create policy "referrals: referrer reads" on public.referrals for select to authenticated using (referrer_id = (select auth.uid()) or (select public.is_admin()));
create policy "commissions: referrer reads" on public.commissions for select to authenticated using (referrer_id = (select auth.uid()) or (select public.is_admin()));
create policy "payout settings: own" on public.payout_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "payouts: own" on public.payouts for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "payouts: admin" on public.payouts for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "commissions: admin" on public.commissions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
;
