-- A public link for a card (owner, 6 Nov 2026: "Public page for card link yes"; audit item D7).
-- Written and applied 6 November 2026 (owner: "Yes, deploy").
--
-- A trader asks for a link from the card studio. trademarble.app/c/<id> then shows the card and what the journal says
-- about it: where the numbers came from, whether the trades have changed since and how many days the trader has closed.
-- The figures are read here on the server from the trader's own trades. The browser sends trade ids, never an amount.
-- Marble doesn't check a number against a broker or who owns an account, and the page says so.
--
-- What it makes:
--   card_links          a row per link. Traders read their own. Nothing else reaches it except the functions below.
--   card_link_print()   a fingerprint of the trades' numbers. A note added later doesn't change it. Called only from here.
--   card_link_make()    makes a link, at most 30 a day per trader
--   card_link_remove()  takes a trader's own link down
--   card_link_read()    what the public page shows, one link at a time. Nothing can list links.
--   bucket "cards"      public pictures named <id>.jpg, so an address never carries a trader's id. Only the owner of a
--                       live link can add its one picture, and it can only be deleted once the link is down.

create table if not exists public.card_links (
  id text primary key check (id ~ '^[A-Za-z0-9]{10}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('trade', 'day')),
  format text not null check (format in ('wide', 'post', 'story')),
  trades uuid[] not null check (cardinality(trades) between 1 and 500),
  print text not null,
  total numeric not null,
  show_money boolean not null default true,
  sign text not null default '$' check (sign in ('$', '¥', '€', '£')),
  made_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists card_links_mine on public.card_links (user_id, made_at desc);
alter table public.card_links enable row level security;

drop policy if exists "card links: read your own" on public.card_links;
create policy "card links: read your own" on public.card_links for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "two-step: code passed" on public.card_links;
create policy "two-step: code passed" on public.card_links as restrictive for all to authenticated
  using ((select public.two_step_ok())) with check ((select public.two_step_ok()));
revoke insert, update, delete on public.card_links from anon, authenticated;
revoke select on public.card_links from anon;
-- New tables here start with no grant, and the storage rules read this table as the trader
grant select on public.card_links to authenticated;

-- The numbers of a set of one trader's trades, and only the numbers
create or replace function public.card_link_print(p_user uuid, p_trades uuid[])
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(md5(string_agg(concat_ws('|', t.id, t.pnl, t.symbol, t.side, extract(epoch from t.traded_at)), ',' order by t.id)), '')
  from public.trades t where t.user_id = p_user and t.id = any (p_trades);
$$;
revoke all on function public.card_link_print(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.card_link_make(p_id text, p_kind text, p_format text, p_trades uuid[], p_money boolean, p_sign text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  mine uuid[];
  sum_of numeric;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not public.two_step_ok() then raise exception 'Two-step needed'; end if;
  if (select count(*) from public.card_links l where l.user_id = me and l.made_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many links today';
  end if;
  select array_agg(t.id), sum(t.pnl) into mine, sum_of from public.trades t where t.user_id = me and t.id = any (p_trades);
  if mine is null then raise exception 'Those trades are not saved yet'; end if;
  insert into public.card_links (id, user_id, kind, format, trades, print, total, show_money, sign)
    values (p_id, me, p_kind, p_format, mine, public.card_link_print(me, mine), sum_of, p_money, p_sign);
end $$;
revoke all on function public.card_link_make(text, text, text, uuid[], boolean, text) from public, anon;
grant execute on function public.card_link_make(text, text, text, uuid[], boolean, text) to authenticated;

create or replace function public.card_link_remove(p_id text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.two_step_ok() then raise exception 'Two-step needed'; end if;
  update public.card_links set removed_at = now() where id = p_id and user_id = auth.uid() and removed_at is null;
end $$;
revoke all on function public.card_link_remove(text) from public, anon;
grant execute on function public.card_link_remove(text) to authenticated;

-- Null for an address that has no card. A link taken down says only that, and when.
create or replace function public.card_link_read(p_id text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  l public.card_links;
  left_now int;
  from_file int;
  typed int;
  other int;
  sim boolean;
  days int;
begin
  select * into l from public.card_links c where c.id = p_id;
  if not found then return null; end if;
  if l.removed_at is not null then return jsonb_build_object('state', 'down', 'removed_at', l.removed_at); end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'cards' and o.name = p_id || '.jpg') then return null; end if;
  select count(*), count(*) filter (where t.source = 'import'), count(*) filter (where t.source = 'manual'), count(*) filter (where t.source not in ('import', 'manual')),
         coalesce(bool_or(lower(a.status) like 'eval%' or lower(a.status) like 'paper%'), false)
    into left_now, from_file, typed, other, sim
    from public.trades t left join public.accounts a on a.id = t.account_id
    where t.user_id = l.user_id and t.id = any (l.trades);
  select count(*) into days from public.closes c where c.user_id = l.user_id;
  return jsonb_build_object(
    'state', 'live', 'kind', l.kind, 'format', l.format, 'made_at', l.made_at,
    'money', case when l.show_money then l.total end, 'sign', l.sign, 'simulated', l.show_money and sim,
    'file', from_file, 'typed', typed, 'other', other, 'gone', cardinality(l.trades) - left_now,
    'same', public.card_link_print(l.user_id, l.trades) = l.print, 'days', days
  );
end $$;
revoke all on function public.card_link_read(text) from public;
grant execute on function public.card_link_read(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('cards', 'cards', true, 3145728, array['image/jpeg'])
  on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

drop policy if exists "cards: add your link's picture" on storage.objects;
create policy "cards: add your link's picture" on storage.objects for insert to authenticated with check (
  bucket_id = 'cards' and exists (select 1 from public.card_links l where l.user_id = (select auth.uid()) and l.removed_at is null and name = l.id || '.jpg')
);
drop policy if exists "cards: see your own" on storage.objects;
create policy "cards: see your own" on storage.objects for select to authenticated using (bucket_id = 'cards' and owner_id = (select auth.uid())::text);
drop policy if exists "cards: delete once the link is down" on storage.objects;
create policy "cards: delete once the link is down" on storage.objects for delete to authenticated using (
  bucket_id = 'cards' and owner_id = (select auth.uid())::text
  and exists (select 1 from public.card_links l where l.user_id = (select auth.uid()) and l.removed_at is not null and name = l.id || '.jpg')
);
