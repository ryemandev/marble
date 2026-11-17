-- Crypto, phase 1: two worlds in one journal. NOT APPLIED. Written 31 October 2026.
-- Not part of the Coming soon release: until CRYPTO_LIVE is set in src/crypto/worlds.js the app never reads or writes
-- anything this file makes, and Crypto shows Coming soon with a preview on sample data.
-- When crypto goes live: apply it after 20261031140000_chat_topic_rooms.sql (it shares nothing with the admin or firm
-- plan files), deploy the hyperliquid function, then the app build with CRYPTO_LIVE = true (that build reads and
-- writes the new columns; an older build keeps working, everything it writes stays in Markets).
--
-- Every existing row stays in Markets (world defaults to 'markets'), so nobody's journal changes.
--
-- What it makes or changes:
--   accounts.world        'markets' | 'crypto', set when the account is made and fixed after (accounts_world_fixed)
--   accounts.quote_ccy    USDT | USDC | USD for a crypto account (shown, never converted)
--   trades.world          copied from the trade's account by trades_by_account_world (a trade with no account keeps
--                         the world it was logged in). Indexed with (user_id, world, traded_at).
--   trades.leverage, funding, fee_maker, fee_taker, liq_price
--                         a crypto trade's numbers: funding is signed (+ received, - paid), the two fees add up to
--                         commission when the venue says which fills were maker and which taker, liq_price is the
--                         liquidation price at entry when the venue gives it
--   trades_guard()        a synced trade's world and crypto numbers can't be edited from the browser either
--   daily_plans           keyed (user_id, world, day): each world has its own plan and checklist ticks. Markets days
--                         are New York days, crypto days are UTC days (the app picks the day).
--   crypto_settings       the crypto world's own checklist, risk rules (daily loss, trades, losses in a row, a
--                         leverage cap, a minimum distance to liquidation) and desk account. Markets keeps its rules
--                         on profile_private, where the discipline boards read them.
--   connections           'hyperliquid' joins topstepx and ibkr: public wallet addresses only, never a key
--   sync_commit()         takes 'hyperliquid-sync' and writes the crypto numbers
--   crypto_public()       ONE switch: whether crypto trades show where others can see them (true: the owner's call,
--                         30 Oct 2026). To hide them again, replace it with `select false` (and set CRYPTO_PUBLIC to
--                         false in src/crypto/public.js). The three functions below read it.
--   discipline_days()     the boards and competitions count crypto trades too while crypto_public() is true
--   enter_competition()   a crypto account can enter (through a Hyperliquid wallet's balance) while it's true
--   trade_card()          a crypto trade makes a card (marked world 'crypto', which the app shows with the risk
--                         wording) while it's true

begin;

-- ---------- Accounts ----------
alter table public.accounts add column world text not null default 'markets';
alter table public.accounts add constraint accounts_world_check check (world in ('markets', 'crypto'));
alter table public.accounts add column quote_ccy text;
alter table public.accounts add constraint accounts_quote_ccy_check check (quote_ccy is null or quote_ccy in ('USDT', 'USDC', 'USD'));

create or replace function public.accounts_world_fixed()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.world is distinct from old.world then
    raise exception 'An account stays in the world it was made in' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.accounts_world_fixed() from public, anon, authenticated;
create trigger accounts_world_fixed before update on public.accounts
  for each row execute function public.accounts_world_fixed();

-- ---------- Trades ----------
alter table public.trades add column world text not null default 'markets';
alter table public.trades add constraint trades_world_check check (world in ('markets', 'crypto'));
alter table public.trades add column leverage numeric;
alter table public.trades add constraint trades_leverage_check check (leverage is null or (leverage > 0 and leverage <= 1000));
alter table public.trades add column funding numeric;
alter table public.trades add column fee_maker numeric;
alter table public.trades add column fee_taker numeric;
alter table public.trades add column liq_price numeric;
alter table public.trades add constraint trades_liq_price_check check (liq_price is null or liq_price >= 0);
create index trades_user_world_time on public.trades (user_id, world, traded_at desc);

-- A trade belongs to its account's world. Runs as the caller, so an account that isn't theirs reads as no account
-- and the insert fails (world can't be null). Named to run before trades_guard (triggers run in name order).
create or replace function public.trades_by_account_world()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.account_id is not null then
    select a.world into new.world from public.accounts a where a.id = new.account_id;
  end if;
  return new;
end $$;
revoke all on function public.trades_by_account_world() from public, anon, authenticated;
create trigger trades_by_account_world before insert or update on public.trades
  for each row execute function public.trades_by_account_world();

-- The browser can't edit a synced trade's numbers: now the crypto ones too
create or replace function public.trades_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.source = 'sync' then
      raise exception 'Synced trades come from Marble''s server' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.source is distinct from old.source then
    raise exception 'Where a trade came from can''t be changed' using errcode = '42501';
  end if;
  if old.source = 'sync' and (new.user_id, new.account_id, new.import_id, new.external_id, new.traded_at, new.closed_at,
      new.symbol, new.side, new.entry, new.exit, new.size, new.pnl, new.commission, new.fills,
      new.world, new.leverage, new.funding, new.fee_maker, new.fee_taker, new.liq_price)
    is distinct from (old.user_id, old.account_id, old.import_id, old.external_id, old.traded_at, old.closed_at,
      old.symbol, old.side, old.entry, old.exit, old.size, old.pnl, old.commission, old.fills,
      old.world, old.leverage, old.funding, old.fee_maker, old.fee_taker, old.liq_price) then
    raise exception 'A synced trade''s numbers come from the broker and can''t be edited' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.trades_guard() from public, anon, authenticated;

-- ---------- Plans: one per world per day ----------
alter table public.daily_plans add column world text not null default 'markets';
alter table public.daily_plans add constraint daily_plans_world_check check (world in ('markets', 'crypto'));
alter table public.daily_plans drop constraint daily_plans_pkey;
alter table public.daily_plans add constraint daily_plans_pkey primary key (user_id, world, day);

-- ---------- The crypto world's own rules ----------
create table public.crypto_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  checklist text[] not null default '{}',
  daily_loss_limit numeric,
  max_trades integer,
  stop_after_losses integer,
  max_leverage numeric,
  min_liq_distance numeric,
  desk_account uuid references public.accounts (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint crypto_settings_checklist_size check (cardinality(checklist) <= 12 and char_length(array_to_string(checklist, '')) <= 2400),
  constraint crypto_settings_loss_limit_pos check (daily_loss_limit is null or daily_loss_limit > 0),
  constraint crypto_settings_max_trades_range check (max_trades is null or max_trades between 1 and 100),
  constraint crypto_settings_stop_losses_range check (stop_after_losses is null or stop_after_losses between 1 and 20),
  constraint crypto_settings_leverage_range check (max_leverage is null or (max_leverage > 0 and max_leverage <= 1000)),
  constraint crypto_settings_liq_range check (min_liq_distance is null or (min_liq_distance > 0 and min_liq_distance < 100))
);
comment on table public.crypto_settings is 'The crypto world''s checklist, risk rules and desk account, one row per trader. Markets keeps its own on profile_private.';
create trigger crypto_settings_touch before update on public.crypto_settings
  for each row execute function public.touch_updated_at();
alter table public.crypto_settings enable row level security;
revoke all on table public.crypto_settings from anon, authenticated;
grant select, insert, update, delete on table public.crypto_settings to authenticated;
create policy "own crypto settings" on public.crypto_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (desk_account is null or exists (select 1 from public.accounts a
          where a.id = desk_account and a.user_id = (select auth.uid()) and a.world = 'crypto')));
create policy "paid: add" on public.crypto_settings as restrictive for insert to authenticated
  with check ((select public.has_access()));
create policy "paid: change" on public.crypto_settings as restrictive for update to authenticated
  using ((select public.has_access())) with check ((select public.has_access()));

-- ---------- Hyperliquid: a public wallet address, no key ----------
alter table public.connections drop constraint connections_platform_check;
alter table public.connections add constraint connections_platform_check
  check (platform = any (array['topstepx', 'ibkr', 'hyperliquid']));

-- ---------- One sync, saved in one go (service role): now Hyperliquid and the crypto numbers too ----------
create or replace function public.sync_commit(p_user uuid, p_account uuid, p_platform text, p_file_name text,
  p_rows jsonb, p_upgrades jsonb, p_duplicates integer, p_open integer, p_open_fills jsonb)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  v_import uuid;
  v_added int := 0;
  v_upgraded int := 0;
  v_offered int := jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) + jsonb_array_length(coalesce(p_upgrades, '[]'::jsonb));
begin
  if p_platform not in ('topstepx-sync', 'ibkr-sync', 'hyperliquid-sync') then raise exception 'Not a sync' using errcode = '22023'; end if;
  if not exists (select 1 from public.accounts a where a.id = p_account and a.user_id = p_user
                   and a.world = case when p_platform = 'hyperliquid-sync' then 'crypto' else 'markets' end) then
    raise exception 'Not this trader''s account' using errcode = '42501';
  end if;
  insert into public.imports (user_id, account_id, platform, file_name, added, duplicates, open_positions, open_fills)
  values (p_user, p_account, p_platform, left(coalesce(p_file_name, ''), 200), 0, coalesce(p_duplicates, 0),
          coalesce(p_open, 0), coalesce(p_open_fills, '[]'::jsonb))
  returning id into v_import;

  with up as (
    update public.trades t
       set source = 'sync', external_id = left(u.external_id, 200), traded_at = u.traded_at, closed_at = u.closed_at,
           symbol = left(u.symbol, 16), side = u.side, entry = u.entry, exit = u.exit, size = u.size,
           pnl = coalesce(u.pnl, 0), commission = u.commission, fills = u.fills, import_id = v_import,
           leverage = u.leverage, funding = u.funding, fee_maker = u.fee_maker, fee_taker = u.fee_taker, liq_price = u.liq_price
      from jsonb_to_recordset(coalesce(p_upgrades, '[]'::jsonb)) as u(id uuid, external_id text, traded_at timestamptz,
           closed_at timestamptz, symbol text, side text, entry numeric, exit numeric, size numeric, pnl numeric,
           commission numeric, fills jsonb, leverage numeric, funding numeric, fee_maker numeric, fee_taker numeric,
           liq_price numeric)
     where t.id = u.id and t.user_id = p_user and t.account_id = p_account and t.source <> 'sync' and u.external_id is not null
       and not exists (select 1 from public.trades s where s.user_id = p_user and s.account_id = p_account
                         and s.source = 'sync' and s.external_id = left(u.external_id, 200))
    returning t.id)
  select count(*) into v_upgraded from up;

  with ins as (
    insert into public.trades (id, user_id, account_id, import_id, source, external_id, needs_review, traded_at, closed_at,
      symbol, side, entry, exit, size, stop, pnl, commission, r, grade, setup, emotion, followed_plan, kept, note, fills,
      leverage, funding, fee_maker, fee_taker, liq_price)
    select coalesce(r.id, gen_random_uuid()), p_user, p_account, v_import, 'sync', left(r.external_id, 200), true,
           r.traded_at, r.closed_at, left(r.symbol, 16), r.side, r.entry, r.exit, r.size, r.stop, coalesce(r.pnl, 0),
           r.commission, r.r, null, null, null, null, '{}'::boolean[], '', r.fills,
           r.leverage, r.funding, r.fee_maker, r.fee_taker, r.liq_price
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid, external_id text, traded_at timestamptz,
           closed_at timestamptz, symbol text, side text, entry numeric, exit numeric, size numeric, stop numeric,
           pnl numeric, commission numeric, r numeric, fills jsonb, leverage numeric, funding numeric, fee_maker numeric,
           fee_taker numeric, liq_price numeric)
     where r.external_id is not null and r.traded_at is not null
    on conflict (user_id, account_id, source, external_id) where external_id is not null do nothing
    returning id)
  select count(*) into v_added from ins;

  update public.imports set added = v_added + v_upgraded, duplicates = coalesce(p_duplicates, 0) + (v_offered - v_added - v_upgraded)
   where id = v_import;
  return jsonb_build_object('import_id', v_import, 'added', v_added, 'upgraded', v_upgraded);
end $$;
revoke all on function public.sync_commit(uuid, uuid, text, text, jsonb, jsonb, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.sync_commit(uuid, uuid, text, text, jsonb, jsonb, integer, integer, jsonb) to service_role;

-- ---------- Whether crypto trades show publicly: one switch ----------
create or replace function public.crypto_public()
returns boolean language sql stable set search_path = ''
as $$ select true $$;
revoke all on function public.crypto_public() from public, anon, authenticated;

-- ---------- Boards and competitions ----------
-- As 20261029160200, with one line added (crypto trades count while crypto_public() is true)
create or replace function public.discipline_days(p_who jsonb, p_from date, p_to date)
returns table (user_id uuid, day date, trades integer, r numeric, broke text[])
language sql stable security definer set search_path = ''
as $$
  with who as (
    select * from jsonb_to_recordset(coalesce(p_who, '[]'::jsonb))
      as w(user_id uuid, account_id uuid, loss_limit numeric, max_trades integer, stop_after integer, max_trade_loss numeric,
           sync_only boolean, risk_unit numeric)
  ),
  t as (
    select w.user_id, w.loss_limit, w.max_trades, w.stop_after, w.max_trade_loss,
           (tr.traded_at at time zone 'America/New_York')::date as day, tr.traded_at, tr.id, tr.pnl,
           case when w.risk_unit > 0 then least(round(tr.pnl / w.risk_unit, 4), 3) else least(coalesce(tr.r, 0), 3) end as rc,
           case when coalesce(w.sync_only, false) then null else tr.followed_plan end as followed_plan
    from who w join public.trades tr on tr.user_id = w.user_id and (w.account_id is null or tr.account_id = w.account_id)
    where (tr.source = 'sync' or (tr.source = 'import' and not coalesce(w.sync_only, false)))
      and (public.crypto_public() or tr.world = 'markets')
      and tr.traded_at >= (p_from::timestamp at time zone 'America/New_York')
      and tr.traded_at < ((p_to + 1)::timestamp at time zone 'America/New_York')
  ),
  s1 as (
    select t.*,
           sum(t.pnl) over w1 as running,
           -- each trade that isn't a loss starts a new run, so a run's losses are in a row
           sum(case when t.pnl < 0 then 0 else 1 end) over w1 as run_id
    from t window w1 as (partition by t.user_id, t.day order by t.traded_at, t.id rows between unbounded preceding and current row)
  ),
  s2 as (
    select s1.*,
           case when s1.pnl < 0 then count(*) filter (where s1.pnl < 0) over (partition by s1.user_id, s1.day, s1.run_id
             order by s1.traded_at, s1.id rows between unbounded preceding and current row) else 0 end as loss_run
    from s1
  ),
  s3 as (
    select s2.*, coalesce(lag(s2.loss_run) over (partition by s2.user_id, s2.day order by s2.traded_at, s2.id), 0) as losses_before
    from s2
  )
  select s3.user_id, s3.day, count(*)::int, round(sum(s3.rc), 2),
         array_remove(array[
           case when bool_or(s3.loss_limit is not null and s3.running < -s3.loss_limit) then 'loss' end,
           case when max(s3.max_trades) is not null and count(*) > max(s3.max_trades) then 'trades' end,
           case when bool_or(s3.stop_after is not null and s3.losses_before >= s3.stop_after) then 'streak' end,
           case when bool_or(s3.followed_plan = false) then 'plan' end,
           case when bool_or(s3.max_trade_loss is not null and s3.pnl < -s3.max_trade_loss) then 'size' end
         ], null)
  from s3 group by s3.user_id, s3.day
$$;
revoke all on function public.discipline_days(jsonb, date, date) from public, anon, authenticated;

-- As 20261029160300, with a Hyperliquid wallet as a broker too (its balance is the account's size), and crypto
-- accounts turned away if crypto_public() is ever false
create or replace function public.enter_competition(p_competition uuid, p_account uuid, p_rules_version text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.competitions;
  v_size numeric;
  v_platform text;
  v_broker text;
begin
  if v_me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into v_c from public.competitions where id = p_competition;
  if not found or v_c.status <> 'open' or now() >= v_c.entry_closes_at then
    raise exception 'Entries for this competition are closed' using errcode = 'P0001';
  end if;
  if p_rules_version is distinct from v_c.rules_version then
    raise exception 'The rules have changed. Read the new version, then enter.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_account and a.user_id = v_me and not a.archived) then
    raise exception 'Choose one of your own accounts' using errcode = 'P0001';
  end if;
  if not public.crypto_public() and exists (select 1 from public.accounts a where a.id = p_account and a.world <> 'markets') then
    raise exception 'Competitions are for Markets accounts only' using errcode = 'P0001';
  end if;
  -- The size comes from the broker (written by Marble's server on each sync), never from the app's own balance
  select c.platform, a->>'id', case when jsonb_typeof(a->'balance') = 'number' then (a->>'balance')::numeric end
    into v_platform, v_broker, v_size
    from public.connections c, jsonb_array_elements(c.accounts) a
   where c.user_id = v_me and c.platform in ('topstepx', 'ibkr', 'hyperliquid') and a->>'linked' = p_account::text
   order by c.platform limit 1;
  if v_platform is null then
    raise exception 'Only synced trades count: connect this account to Topstep, Interactive Brokers or a Hyperliquid wallet first' using errcode = 'P0001';
  end if;
  v_size := coalesce(nullif(v_size, 0), nullif((v_c.limits->>'account_size')::numeric, 0));
  if v_size is null or v_size <= 0 then
    raise exception 'This competition needs the account''s size from the broker. Sync it once, then enter.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.trades t where t.user_id = v_me and t.account_id = p_account and t.source = 'sync') then
    raise exception 'Only synced trades count: sync this account first' using errcode = 'P0001';
  end if;
  insert into public.competition_entries (competition_id, user_id, account_id, account_size, broker_platform, broker_account, rules_version)
  values (p_competition, v_me, p_account, v_size, v_platform, v_broker, v_c.rules_version)
  on conflict (competition_id, user_id) do update
    set account_id = excluded.account_id, account_size = excluded.account_size, broker_platform = excluded.broker_platform,
        broker_account = excluded.broker_account, rules_version = excluded.rules_version,
        accepted_at = now(), status = 'entered', withdrawn_at = null
    where public.competition_entries.status <> 'disqualified';
  return jsonb_build_object('competition_id', p_competition, 'account_id', p_account, 'rules_version', v_c.rules_version);
end $$;
revoke all on function public.enter_competition(uuid, uuid, text) from public, anon;
grant execute on function public.enter_competition(uuid, uuid, text) to authenticated;

-- ---------- Trade cards ----------
-- As 20261029160000, with the trade's world on the card (the app adds the risk wording to a crypto one), and no card
-- for a crypto trade if crypto_public() is ever false.
create or replace function public.trade_card(p_user uuid, p_trade jsonb, p_anonymous boolean default false)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when p_anonymous then public.anon_card(c) else c end from (
    select jsonb_build_object(
      'sym', t.symbol, 'side', t.side, 'setup', t.setup,
      'r', case when t.r is null then null else round(t.r, 2) end,
      'kept', (select count(*) from unnest(t.kept) k where k), 'of', cardinality(t.kept),
      'plan', t.followed_plan, 'src', t.source, 'via', i.platform, 'world', t.world) c
    from public.trades t left join public.imports i on i.id = t.import_id
    where p_trade is not null and jsonb_typeof(p_trade) = 'object'
      and (p_trade->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and t.id = (p_trade->>'id')::uuid and t.user_id = p_user and (public.crypto_public() or t.world = 'markets')
  ) x
$$;
revoke all on function public.trade_card(uuid, jsonb, boolean) from public, anon, authenticated;

commit;
