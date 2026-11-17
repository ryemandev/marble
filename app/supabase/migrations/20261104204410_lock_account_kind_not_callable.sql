-- A trigger's function, so nobody needs to call it directly.
revoke execute on function public.lock_account_kind() from public, anon, authenticated;
;
