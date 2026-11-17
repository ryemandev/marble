-- The playbook as a field manual: each strategy is a chapter with the trader's own words, why it works (thesis)
-- and when they run it (run_when: a few short lines such as "10:00–13:00 NY"). APPLIED live on 3 November 2026
-- with the owner's OK ("Yes, apply it"), as 20261103202329, after a rolled-back run on live. Before that the app
-- kept those words on the trader's own device and never sent them (src/live/sync.js asks the server whether these
-- columns exist), so nothing failed either way; a device's words go up on its first load after.
--
-- No new table and no new policy: strategies already has row level security that lets a trader read and change
-- only their own rows, and column-level grants decide which columns they may write; this adds the two new columns
-- to those grants. It also puts a size on the rules and the name, which until now only had a count and nothing,
-- so one row can't be stuffed with text. Every row live today passes (5 rows; longest rules 111 characters in
-- all, longest name 20).

begin;

alter table public.strategies
  add column thesis text not null default ''
    constraint strategies_thesis_check check (char_length(thesis) <= 280),
  add column run_when text[] not null default '{}'
    constraint strategies_run_when_check check (cardinality(run_when) <= 4 and char_length(array_to_string(run_when, '')) <= 160),
  add constraint strategies_name_check check (char_length(name) <= 60),
  add constraint strategies_rules_size_check check (char_length(array_to_string(rules, '')) <= 1440);

comment on column public.strategies.thesis is 'Why the setup works, in the trader''s words (src/lib/playbook.js, cleanThesis: one paragraph, 280 at most).';
comment on column public.strategies.run_when is 'When the trader runs it: up to four short lines of 40 characters (src/lib/playbook.js, cleanWhen).';

grant select (thesis, run_when), insert (thesis, run_when), update (thesis, run_when) on public.strategies to authenticated;

commit;
