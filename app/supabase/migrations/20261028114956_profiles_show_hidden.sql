-- The app lets a trader hide their result entirely ("Hidden"), which the first constraint didn't allow
alter table public.profiles drop constraint profiles_show_as_check;
alter table public.profiles add constraint profiles_show_as_check check (show_as in ('dollars', 'r', 'percent', 'hidden'));
;
