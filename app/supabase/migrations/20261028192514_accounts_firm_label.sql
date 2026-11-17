-- Which firm or broker an account is with (a slug from Marble's firm list, so the app can show its logo), and the
-- trader's own label for it ("50K", "Eval 2"). Both optional: a typed name still works on its own.
alter table public.accounts
  add column if not exists firm text check (firm is null or firm ~ '^[a-z0-9-]{1,40}$'),
  add column if not exists label text check (label is null or char_length(label) <= 40);;
