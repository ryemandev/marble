create or replace function public.anon_card(p_card jsonb) returns jsonb
language sql immutable set search_path to '' as $function$
  select case when p_card is null then null else p_card || jsonb_build_object('setup', null, 'pnl', null,
    'r', case when p_card->>'r' is null then null else round(round((p_card->>'r')::numeric * 2) / 2, 1) end) end
$function$;
create or replace function public.trade_card(p_user uuid, p_trade jsonb, p_anonymous boolean default false) returns jsonb
language sql stable security definer set search_path to '' as $function$
  select case when p_anonymous then public.anon_card(c) else c end from (
    select jsonb_build_object(
      'sym', t.symbol, 'side', t.side, 'setup', t.setup,
      'r', case when t.r is null then null else round(t.r, 2) end,
      'kept', (select count(*) from unnest(t.kept) k where k), 'of', cardinality(t.kept),
      'plan', t.followed_plan, 'src', t.source, 'via', i.platform,
      'pnl', case when t.pnl is null then null else round(t.pnl, 2) end,
      'stage', case when a.id is null then null
        when lower(coalesce(nullif(a.status, ''), a.kind, '')) like 'eval%' then 'eval'
        when lower(coalesce(nullif(a.status, ''), a.kind, '')) like 'fund%' then 'funded'
        when lower(coalesce(nullif(a.status, ''), a.kind, '')) like 'paper%' then 'paper'
        else 'live' end) c
    from public.trades t left join public.imports i on i.id = t.import_id left join public.accounts a on a.id = t.account_id
    where p_trade is not null and jsonb_typeof(p_trade) = 'object'
      and (p_trade->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and t.id = (p_trade->>'id')::uuid and t.user_id = p_user
  ) x
$function$;
alter table public.posts add column card jsonb;
alter table public.posts add constraint posts_card_ok check (card is null or (jsonb_typeof(card) = 'object' and pg_column_size(card) <= 16384));
grant select (card), insert (card) on public.posts to authenticated;
create or replace function public.posts_before_write() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() and not public.rate_ok(new.user_id, 'post', 20, interval '1 hour') then
      raise exception 'That''s a lot of posts in an hour. Try again a little later.' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.crew := case when new.anonymous then null else (select c.crew from public.crew_members c where c.user_id = new.user_id) end;
    if new.parent_id is not null then new.kind := 'reply'; end if;
    new.trade := public.trade_card(new.user_id, new.trade, new.anonymous);
    if new.card is not null then
      if new.anonymous or new.parent_id is not null or jsonb_typeof(new.card) <> 'object' or jsonb_typeof(new.card->'card') <> 'object' then
        new.card := null;
      else
        new.card := jsonb_build_object(
          'card', (new.card->'card') - 'verified' - 'subject',
          'finish', case
            when new.card->>'finish' = 'carbon' and (select count(*) from public.closes c where c.user_id = new.user_id) >= 60 then 'carbon'
            when new.card->>'finish' in ('white', 'black') then new.card->>'finish' else 'black' end,
          'picture', case when new.card->>'picture' ~ '^[a-z0-9-]{1,40}/[a-z0-9-]{1,80}$' then new.card->>'picture' end);
        if new.trade is not null and new.card->'card'->>'kind' = 'trade' then
          new.card := jsonb_set(new.card, '{card,money}', coalesce(new.trade->'pnl', 'null'::jsonb));
        end if;
      end if;
    end if;
  elsif new.trade is distinct from old.trade then
    new.trade := public.trade_card(old.user_id, new.trade, new.anonymous);
  elsif new.anonymous and not old.anonymous then
    new.trade := public.anon_card(old.trade);
  end if;
  if tg_op = 'UPDATE' then
    new.crew := old.crew;
    new.card := case when new.anonymous then null else old.card end;
  end if;
  return new;
end $function$;
drop function public.feed(text, text, timestamptz, integer, boolean, uuid);
create function public.feed(p_crew text default null, p_kind text default null, p_before timestamptz default now(), p_limit integer default 30, p_anonymous boolean default null, p_parent uuid default null)
returns table (id uuid, kind text, crew text, parent_id uuid, body text, trade jsonb, image_url text, created_at timestamptz, author_handle extensions.citext, author_name text, author_avatar text, anonymous boolean, mine boolean, replies bigint, likes bigint, liked boolean, share jsonb, card jsonb)
language sql stable security definer set search_path to '' as $function$
  select p.id, p.kind,
         case when p.anonymous then null else p.crew end,
         p.parent_id, p.body, p.trade,
         case when p.anonymous then null else p.image_url end,
         p.created_at,
         case when p.anonymous then null else pr.handle end,
         case when p.anonymous then null else pr.name end,
         case when p.anonymous then null else coalesce(pr.avatar_url, pr.avatar_art) end,
         p.anonymous, p.user_id = (select auth.uid()),
         (select count(*) from public.posts c where c.parent_id = p.id and not c.hidden),
         (select count(*) from public.post_reactions r where r.post_id = p.id),
         exists (select 1 from public.post_reactions r where r.post_id = p.id and r.user_id = (select auth.uid())),
         case when p.share_id is not null then
           (select case when (c ->> 'gone')::boolean then null else c end from (select public.share_card(p.share_id, (select auth.uid())) as c) sc) end,
         case when p.anonymous then null else p.card end
  from public.posts p join public.profiles pr on pr.id = p.user_id
  where not p.hidden and (select auth.uid()) is not null
    and (case when p_parent is null then p.parent_id is null and p.kind <> 'reply' else p.parent_id = p_parent end)
    and (p_parent is null or not exists (select 1 from public.posts h where h.id = p_parent and h.hidden))
    and (p.anonymous or not exists (select 1 from public.dm_blocks b where b.blocker = (select auth.uid()) and b.blocked = p.user_id))
    and (p_kind is null or p.kind = p_kind)
    and (p_crew is null or (p.crew = p_crew and not p.anonymous))
    and (p_anonymous is null or p.anonymous = p_anonymous)
    and p.created_at < p_before
  order by case when p_parent is null then p.created_at end desc, p.created_at asc
  limit least(greatest(p_limit, 1), 100)
$function$;
revoke execute on function public.feed(text, text, timestamptz, integer, boolean, uuid) from public, anon;
grant execute on function public.feed(text, text, timestamptz, integer, boolean, uuid) to authenticated, service_role;
notify pgrst, 'reload schema';;
