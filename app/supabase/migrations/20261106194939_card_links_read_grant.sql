-- Traders read their own links, and the storage rules read this table as the trader. The policy alone isn't enough: new tables here start with no grant.
grant select on public.card_links to authenticated;;
