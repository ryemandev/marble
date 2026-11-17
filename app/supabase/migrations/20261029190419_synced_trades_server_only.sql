-- Security audit 2, H1: synced trades are written by Marble's server only.
create policy "trades: sync rows come from the server" on public.trades as restrictive for insert to authenticated
  with check (source is distinct from 'sync');

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
      new.symbol, new.side, new.entry, new.exit, new.size, new.pnl, new.commission, new.fills)
    is distinct from (old.user_id, old.account_id, old.import_id, old.external_id, old.traded_at, old.closed_at,
      old.symbol, old.side, old.entry, old.exit, old.size, old.pnl, old.commission, old.fills) then
    raise exception 'A synced trade''s numbers come from the broker and can''t be edited' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.trades_guard() from public, anon, authenticated;
create trigger trades_guard before insert or update on public.trades
  for each row execute function public.trades_guard();

create or replace function public.imports_guard()
returns trigger language plpgsql set search_path = ''
as $$
declare v_sync boolean := coalesce((case when tg_op = 'INSERT' then new.platform else old.platform end) like '%-sync', false);
begin
  if current_user not in ('authenticated', 'anon') then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'INSERT' then
    if new.platform like '%-sync' then raise exception 'Syncs are recorded by Marble''s server' using errcode = '42501'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if v_sync then raise exception 'A sync''s record stays: undo it instead' using errcode = '42501'; end if;
    return old;
  end if;
  if new.platform is distinct from old.platform and (v_sync or new.platform like '%-sync') then
    raise exception 'A sync''s record can''t be changed' using errcode = '42501';
  end if;
  if v_sync and (new.user_id, new.account_id, new.file_name, new.added, new.duplicates, new.open_positions, new.open_fills, new.created_at)
    is distinct from (old.user_id, old.account_id, old.file_name, old.added, old.duplicates, old.open_positions, old.open_fills, old.created_at) then
    raise exception 'A sync''s record can''t be changed, only undone' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.imports_guard() from public, anon, authenticated;
create trigger imports_guard before insert or update or delete on public.imports
  for each row execute function public.imports_guard();

create or replace function public.sync_context(p_user uuid, p_account uuid, p_platform text, p_keys text[] default null,
  p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'owned', exists (select 1 from public.accounts a where a.id = p_account and a.user_id = p_user),
    'carried', coalesce((select i.open_fills from public.imports i
                         where i.user_id = p_user and i.account_id = p_account and i.platform = p_platform
                         order by i.created_at desc limit 1), '[]'::jsonb),
    'existing', coalesce((select jsonb_agg(t.external_id) from public.trades t
                          where t.user_id = p_user and t.account_id = p_account and t.source = 'sync'
                            and t.external_id = any (coalesce(p_keys, '{}'::text[]))), '[]'::jsonb),
    'logged', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'symbol', t.symbol, 'side', t.side,
                          'traded_at', t.traded_at, 'source', t.source) order by t.traded_at, t.id)
                        from public.trades t
                        where t.user_id = p_user and t.account_id = p_account and t.source <> 'sync'
                          and p_from is not null and p_to is not null and t.traded_at between p_from and p_to), '[]'::jsonb),
    'risk', (select pp.default_risk from public.profile_private pp where pp.id = p_user))
$$;
revoke all on function public.sync_context(uuid, uuid, text, text[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_context(uuid, uuid, text, text[], timestamptz, timestamptz) to service_role;

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
  if p_platform not in ('topstepx-sync', 'ibkr-sync') then raise exception 'Not a sync' using errcode = '22023'; end if;
  if not exists (select 1 from public.accounts a where a.id = p_account and a.user_id = p_user) then
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
           pnl = coalesce(u.pnl, 0), commission = u.commission, fills = u.fills, import_id = v_import
      from jsonb_to_recordset(coalesce(p_upgrades, '[]'::jsonb)) as u(id uuid, external_id text, traded_at timestamptz,
           closed_at timestamptz, symbol text, side text, entry numeric, exit numeric, size numeric, pnl numeric,
           commission numeric, fills jsonb)
     where t.id = u.id and t.user_id = p_user and t.account_id = p_account and t.source <> 'sync' and u.external_id is not null
       and not exists (select 1 from public.trades s where s.user_id = p_user and s.account_id = p_account
                         and s.source = 'sync' and s.external_id = left(u.external_id, 200))
    returning t.id)
  select count(*) into v_upgraded from up;

  with ins as (
    insert into public.trades (id, user_id, account_id, import_id, source, external_id, needs_review, traded_at, closed_at,
      symbol, side, entry, exit, size, stop, pnl, commission, r, grade, setup, emotion, followed_plan, kept, note, fills)
    select coalesce(r.id, gen_random_uuid()), p_user, p_account, v_import, 'sync', left(r.external_id, 200), true,
           r.traded_at, r.closed_at, left(r.symbol, 16), r.side, r.entry, r.exit, r.size, r.stop, coalesce(r.pnl, 0),
           r.commission, r.r, null, null, null, null, '{}'::boolean[], '', r.fills
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid, external_id text, traded_at timestamptz,
           closed_at timestamptz, symbol text, side text, entry numeric, exit numeric, size numeric, stop numeric,
           pnl numeric, commission numeric, r numeric, fills jsonb)
     where r.external_id is not null and r.traded_at is not null
    on conflict (user_id, account_id, source, external_id) where external_id is not null do nothing
    returning id)
  select count(*) into v_added from ins;

  update public.imports set added = v_added + v_upgraded, duplicates = coalesce(p_duplicates, 0) + (v_offered - v_added - v_upgraded)
   where id = v_import;
  return jsonb_build_object('import_id', v_import, 'added', v_added, 'upgraded', v_upgraded);
end $$;
revoke all on function public.sync_commit(uuid, uuid, text, text, jsonb, jsonb, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.sync_commit(uuid, uuid, text, text, jsonb, jsonb, integer, integer, jsonb) to service_role;;
