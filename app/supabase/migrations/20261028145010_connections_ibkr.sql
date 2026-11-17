-- Interactive Brokers joins Topstep as a connection. Its Flex token is the secret (in Vault, like Topstep's key);
-- the Flex Query ID isn't secret and lives in settings, which the trader may read.
alter table public.connections drop constraint if exists connections_platform_check;
alter table public.connections add constraint connections_platform_check check (platform in ('topstepx', 'ibkr'));
alter table public.connections add column if not exists settings jsonb not null default '{}'::jsonb;
grant select (settings) on public.connections to authenticated;;
