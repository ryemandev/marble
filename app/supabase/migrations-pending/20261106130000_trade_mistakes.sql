-- One-tap review: the mistakes a trader tags on a trade (owner, 6 Nov 2026: go with every recommendation; audit item P3).
-- Written and applied 6 November 2026. The app only ever sends names from its own short list; the size check stops
-- anything bigger reaching the row. On a synced trade these stay the trader's to change, like the rest of the review:
-- trades_guard() only names the broker's numbers.

alter table public.trades add column if not exists mistakes text[] not null default '{}';

alter table public.trades drop constraint if exists trades_mistakes_size;
alter table public.trades add constraint trades_mistakes_size check (cardinality(mistakes) <= 12 and pg_column_size(mistakes) <= 1024);
