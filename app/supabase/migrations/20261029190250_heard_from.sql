-- "How did you hear about Marble?" (optional, setup screen)
alter table public.profile_private
  add column heard_from text
    constraint profile_private_heard_from_check check (
      heard_from is null
      or heard_from in ('x', 'youtube', 'tiktok', 'instagram', 'reddit', 'discord', 'google', 'friend', 'other')
      or (heard_from like 'other: %' and char_length(heard_from) <= 87 and heard_from !~ '[[:cntrl:]]')
    );
comment on column public.profile_private.heard_from is 'Setup question "How did you hear about Marble?" (optional): x, youtube, tiktok, instagram, reddit, discord, google, friend, other, or "other: <up to 80 characters>".';
grant select (heard_from), insert (heard_from), update (heard_from) on public.profile_private to authenticated;;
