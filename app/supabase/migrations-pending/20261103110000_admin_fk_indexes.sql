-- After the admin rework (20261103100000): three of its tables point at the account (user_id, on delete cascade) with
-- no index to find an account's rows, so deleting an account read the whole of owner_alerts, referral_aliases and
-- referral_claims, and an account's own codes and claims were found the same way. Flagged by the database advisor
-- (unindexed foreign keys) on 2 November 2026; the owner said "Yes add them now".
-- The tables are a few rows each, so the moment's lock a plain create index takes is nothing.
-- APPLIED live on 2 November 2026 with the owner's OK, after a rolled-back run on live.

begin;

create index owner_alerts_user on public.owner_alerts (user_id);
create index referral_aliases_user on public.referral_aliases (user_id);
create index referral_claims_user on public.referral_claims (user_id);

commit;
