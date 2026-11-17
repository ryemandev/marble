-- A trade only counts as "followed the plan" when the trader says so: no default
alter table public.trades alter column followed_plan drop default;;
