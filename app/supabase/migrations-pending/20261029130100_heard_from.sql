-- "How did you hear about Marble?": the optional question on the setup screen after sign-up. NOT APPLIED.
-- Written 29 October 2026 for review; apply it before deploying the app build that asks the question (src/live/Gate.jsx).
-- Until it's applied, that build simply doesn't save the answer: setup itself never fails because of it.
--
-- heard_from holds one of the fixed answers below, or "other" with the trader's own few words ("other: a podcast").
-- profile_private already has row level security that lets a trader read and update only their own row ("own private:
-- read" / "own private: update"), and column-level grants decide which columns they may write. This adds the new
-- column to those grants, so a signed-in trader can set or read their own answer and nobody else's.

begin;

alter table public.profile_private
  add column heard_from text
    constraint profile_private_heard_from_check check (
      heard_from is null
      or heard_from in ('x', 'youtube', 'tiktok', 'instagram', 'reddit', 'discord', 'google', 'friend', 'other')
      or (heard_from like 'other: %' and char_length(heard_from) <= 87 and heard_from !~ '[[:cntrl:]]')
    );

comment on column public.profile_private.heard_from is 'Setup question "How did you hear about Marble?" (optional): x, youtube, tiktok, instagram, reddit, discord, google, friend, other, or "other: <up to 80 characters>".';

grant select (heard_from), insert (heard_from), update (heard_from) on public.profile_private to authenticated;

commit;
