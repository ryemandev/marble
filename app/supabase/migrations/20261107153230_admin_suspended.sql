-- The admin area shows whether an account is suspended. 7 November 2026 (owner: "i need to be able to delete accounts and all of that too from the admin", "Yes, deploy").
create or replace function public.admin_trader(p_user uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_p public.profiles;
  v_u auth.users;
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_gate();
  select * into v_p from public.profiles where id = p_user;
  if not found then raise exception 'No such trader' using errcode = 'P0001'; end if;
  select * into v_u from auth.users where id = p_user;
  return jsonb_build_object(
    'id', v_p.id, 'handle', v_p.handle, 'name', v_p.name, 'avatar', v_p.avatar_url, 'joined', v_p.created_at,
    'no', (select m.no from public.members m where m.user_id = p_user), 'show_number', v_p.show_number,
    'email', v_u.email, 'email_confirmed', v_u.email_confirmed_at is not null, 'last_seen', v_u.last_sign_in_at,
    'suspended_until', case when v_u.banned_until > now() then v_u.banned_until end,
    'last_active', (select max(a.day) from public.active_days a where a.user_id = p_user),
    'active_30', (select count(*) from public.active_days a where a.user_id = p_user and a.day > v_today - 30),
    'providers', coalesce(v_u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'heard_from', (select pp.heard_from from public.profile_private pp where pp.id = p_user),
    'news', (select pp.marketing_opt_in from public.profile_private pp where pp.id = p_user),
    'crew', (select c.crew from public.crew_members c where c.user_id = p_user),
    'staff', public.is_staff(p_user),
    'admin', exists (select 1 from public.admins a where a.user_id = p_user),
    'journal', jsonb_build_object(
      'trades', (select count(*) from public.trades t where t.user_id = p_user),
      'synced', (select count(*) from public.trades t where t.user_id = p_user and t.source = 'sync'),
      'accounts', (select count(*) from public.accounts a where a.user_id = p_user and not a.archived),
      'imports', (select count(*) from public.imports i where i.user_id = p_user and i.undone_at is null)),
    'connections', coalesce((select jsonb_agg(jsonb_build_object('platform', c.platform, 'status', c.status,
                       'last_synced', c.last_synced_at, 'error', left(c.last_error, 200)) order by c.platform)
                     from public.connections c where c.user_id = p_user), '[]'::jsonb),
    'community', jsonb_build_object(
      'posts', (select count(*) from public.posts p where p.user_id = p_user),
      'hidden', (select count(*) from public.posts p where p.user_id = p_user and p.hidden),
      'chat_30d', (select count(*) from public.chat_messages m where m.user_id = p_user and m.created_at > now() - interval '30 days'),
      'reported', (select count(*) from public.reports r where r.post_id in (select p.id from public.posts p where p.user_id = p_user)
                     or r.message_id in (select m.id from public.chat_messages m where m.user_id = p_user)),
      'reports_made', (select count(*) from public.reports r where r.user_id = p_user),
      'dm_paused_until', (select max(b.until) from public.dm_bans b where b.user_id = p_user and b.until > now())),
    'events', jsonb_build_object(
      'competitions', (select count(*) from public.competition_entries e where e.user_id = p_user),
      'giveaways', (select count(*) from public.giveaway_entries e where e.user_id = p_user))
  );
end $function$;;
