-- Pinned posts on the Floor. Written 7 November 2026 (owner: "also pin the post right at the top").
alter table public.posts add column if not exists pinned_at timestamptz;
create index if not exists posts_pinned on public.posts (pinned_at desc) where pinned_at is not null;

create or replace function public.feed_pinned()
returns table(id uuid, kind text, crew text, parent_id uuid, body text, trade jsonb, image_url text, created_at timestamptz,
  author_handle extensions.citext, author_name text, author_avatar text, anonymous boolean, mine boolean, replies bigint, likes bigint,
  liked boolean, share jsonb, card jsonb)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.kind, p.crew, p.parent_id, p.body, p.trade, p.image_url, p.created_at,
         pr.handle, pr.name, coalesce(pr.avatar_url, pr.avatar_art),
         false, p.user_id = (select auth.uid()),
         (select count(*) from public.posts c where c.parent_id = p.id and not c.hidden),
         (select count(*) from public.post_reactions r where r.post_id = p.id),
         exists (select 1 from public.post_reactions r where r.post_id = p.id and r.user_id = (select auth.uid())),
         case when p.share_id is not null then
           (select case when (c ->> 'gone')::boolean then null else c end from (select public.share_card(p.share_id, (select auth.uid())) as c) sc) end,
         p.card
  from public.posts p join public.profiles pr on pr.id = p.user_id
  where p.pinned_at is not null and not p.hidden and not p.anonymous and p.parent_id is null and p.kind <> 'reply'
    and (select auth.uid()) is not null
    and not exists (select 1 from public.dm_blocks b where b.blocker = (select auth.uid()) and b.blocked = p.user_id)
  order by p.pinned_at desc
  limit 3
$$;
revoke all on function public.feed_pinned() from public, anon;
grant execute on function public.feed_pinned() to authenticated;

create or replace function public.pin_post(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_post public.posts;
begin
  perform public.admin_gate();
  select * into v_post from public.posts where id = p_id;
  if not found then raise exception 'That post is gone' using errcode = 'P0001'; end if;
  if p_on then
    if v_post.parent_id is not null or v_post.kind = 'reply' then raise exception 'Only a post can be pinned, not a reply' using errcode = 'P0001'; end if;
    if v_post.anonymous then raise exception 'An anonymous post can''t be pinned' using errcode = 'P0001'; end if;
    if v_post.hidden then raise exception 'A hidden post can''t be pinned' using errcode = 'P0001'; end if;
    if (select count(*) from public.posts where pinned_at is not null and id <> p_id) >= 3 then
      raise exception 'Three posts are pinned already. Unpin one first.' using errcode = 'P0001';
    end if;
  end if;
  update public.posts set pinned_at = case when p_on then now() end where id = p_id;
  perform public.admin_note(case when p_on then 'post.pin' else 'post.unpin' end, 'post', p_id::text,
    jsonb_build_object('author', v_post.user_id, 'excerpt', left(v_post.body, 200)));
end $$;
revoke all on function public.pin_post(uuid, boolean) from public, anon;
grant execute on function public.pin_post(uuid, boolean) to authenticated;;
