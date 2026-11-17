-- Connections to trading platforms that sync trades automatically (first: TopstepX, by username + API key).
-- The key itself lives encrypted in Supabase Vault; this table only holds the vault id, which traders can't read.
-- Only the server (service role) writes here and reads the key, through the functions below.

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  platform text not null check (platform in ('topstepx')),
  username text not null check (char_length(username) between 1 and 120),
  secret_id uuid,
  -- [{ id: external account id, name, account_id: Marble account or null, last_synced_at }]
  accounts jsonb not null default '[]'::jsonb,
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);
alter table public.connections enable row level security;

-- Traders see and remove their own connections; adding and changing them goes through the server
create policy "own connections: read" on public.connections for select to authenticated using (user_id = (select auth.uid()));
create policy "own connections: remove" on public.connections for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.connections from anon, authenticated;
grant select (id, user_id, platform, username, accounts, status, last_error, last_synced_at, created_at, updated_at) on public.connections to authenticated;
grant delete on public.connections to authenticated;

-- Removing a connection (by the trader, the server, or account deletion's cascade) removes its key from the vault
create or replace function public.connections_drop_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.secret_id is not null then
    delete from vault.secrets where id = old.secret_id;
  end if;
  return old;
end $$;
revoke all on function public.connections_drop_secret() from public, anon, authenticated;
create trigger connections_drop_secret after delete on public.connections for each row execute function public.connections_drop_secret();

-- Save a connection and its key (server only). A new key replaces the old one in place.
create or replace function public.connection_save(p_user uuid, p_platform text, p_username text, p_key text, p_accounts jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.connections; sid uuid;
begin
  if p_key is null or char_length(p_key) < 8 or char_length(p_key) > 400 then raise exception 'bad key'; end if;
  select * into c from public.connections where user_id = p_user and platform = p_platform;
  if c.id is null then
    sid := vault.create_secret(p_key, 'conn:' || p_platform || ':' || p_user::text || ':' || gen_random_uuid()::text, 'Marble platform connection key');
    insert into public.connections (user_id, platform, username, secret_id, accounts, status, last_error)
      values (p_user, p_platform, p_username, sid, coalesce(p_accounts, '[]'::jsonb), 'ok', null) returning id into c.id;
  else
    if c.secret_id is null then
      sid := vault.create_secret(p_key, 'conn:' || p_platform || ':' || p_user::text || ':' || gen_random_uuid()::text, 'Marble platform connection key');
    else
      perform vault.update_secret(c.secret_id, p_key);
      sid := c.secret_id;
    end if;
    update public.connections set username = p_username, secret_id = sid, accounts = coalesce(p_accounts, accounts),
      status = 'ok', last_error = null, updated_at = now() where id = c.id;
  end if;
  return c.id;
end $$;

-- The decrypted key, for the server's call to the platform (server only)
create or replace function public.connection_key(p_user uuid, p_platform text)
returns text language sql security definer set search_path = '' stable as $$
  select s.decrypted_secret from public.connections c join vault.decrypted_secrets s on s.id = c.secret_id
  where c.user_id = p_user and c.platform = p_platform;
$$;

revoke all on function public.connection_save(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.connection_key(uuid, text) from public, anon, authenticated;
grant execute on function public.connection_save(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.connection_key(uuid, text) to service_role;
grant select, insert, update, delete on public.connections to service_role;

create index connections_user_idx on public.connections (user_id);;
