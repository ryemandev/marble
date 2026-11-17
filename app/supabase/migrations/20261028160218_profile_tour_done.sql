-- When the trader finished (or skipped) the first-run walkthrough of the example desk. Null means a new trader
-- with no trades still sees the example desk; once set, it never comes back unless they choose "Replay the tour".
alter table public.profile_private add column if not exists tour_done_at timestamptz;;
