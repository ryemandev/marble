-- The admin-account function (suspend, lift, delete) writes each action to the admin log before it acts, with the server
-- key. The log was closed to the server key entirely (20261031150000_admin_gifts.sql), so every suspend and delete stopped
-- at that first step and nothing happened (owner, 7 Nov 2026: "when i try and delete and account it says it cant be deleted?").
-- Adding rows only: no reading, and the append-only triggers still refuse any change or removal.
grant insert on table public.admin_log to service_role;;
