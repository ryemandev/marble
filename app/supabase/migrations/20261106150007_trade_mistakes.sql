alter table public.trades add column if not exists mistakes text[] not null default '{}';
alter table public.trades drop constraint if exists trades_mistakes_size;
alter table public.trades add constraint trades_mistakes_size check (cardinality(mistakes) <= 12 and pg_column_size(mistakes) <= 1024);;
