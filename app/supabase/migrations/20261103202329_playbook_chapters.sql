-- The playbook as a field manual: each strategy is a chapter with the trader's own words, why it works (thesis)
-- and when they run it (run_when). Row level security already limits each trader to their own rows; this adds the
-- two columns to the column grants, and puts a size on the rules and the name.

alter table public.strategies
  add column thesis text not null default ''
    constraint strategies_thesis_check check (char_length(thesis) <= 280),
  add column run_when text[] not null default '{}'
    constraint strategies_run_when_check check (cardinality(run_when) <= 4 and char_length(array_to_string(run_when, '')) <= 160),
  add constraint strategies_name_check check (char_length(name) <= 60),
  add constraint strategies_rules_size_check check (char_length(array_to_string(rules, '')) <= 1440);

comment on column public.strategies.thesis is 'Why the setup works, in the trader''s words (src/lib/playbook.js, cleanThesis: one paragraph, 280 at most).';
comment on column public.strategies.run_when is 'When the trader runs it: up to four short lines of 40 characters (src/lib/playbook.js, cleanWhen).';

grant select (thesis, run_when), insert (thesis, run_when), update (thesis, run_when) on public.strategies to authenticated;;
