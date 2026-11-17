-- The handle field asks the same question the database will: free, not reserved, not held for someone else
create or replace function public.handle_available(p_handle text)
returns boolean language sql stable security definer set search_path to '' as $$
  select (select auth.uid()) is not null
    and lower(coalesce(p_handle, '')) ~ '^[a-z0-9._]{2,20}$'
    and (not public.handle_reserved(p_handle) or public.is_admin()
         or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.handle = p_handle))
    and public.handle_free_for(lower(p_handle), (select auth.uid()))
$$;
revoke all on function public.handle_available(text) from public, anon;
grant execute on function public.handle_available(text) to authenticated;;
