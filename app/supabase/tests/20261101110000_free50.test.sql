-- First 50 free (20261101110000_free50.sql): a test that changes nothing. Run it in the SQL editor after applying
-- the migration. It makes throwaway accounts, claims seats, fills all 50, takes one back and claims again, then
-- raises its results as an error, so the transaction rolls back and nothing it made is kept. Success looks like:
--   ERROR:  RESULTS 18 checks passed:
--   ...one line per check...
-- Any other error is a failed check, named in the message.
--
-- Safe with real claims already in the table: it fills only the seats still free, inside the rolled-back transaction.

begin;

do $$
declare
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  v_ok text[] := '{}';
  v_r jsonb;
  v_live int := (select count(*) from public.free50_claims where revoked_at is null);
  -- Accounts: a (Gmail with dots), b (the same Gmail without dots, at googlemail.com: the same person), c (another
  -- address, used for the shared-connection check), d (email not confirmed), e (a throwaway domain), f (already has
  -- Marble for good), g (claims after the cap), h (claims the seat freed by taking one back), admin (takes it back)
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  e uuid := gen_random_uuid(); f uuid := gen_random_uuid(); g uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  v_seat_a int;
  v_claim uuid;
  v_grant uuid;
  v_n int;
  v_fill uuid;
begin
  if v_live >= 49 then raise exception 'This test needs at least 2 free seats (% are live)', v_live; end if;

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, x.confirmed,
         '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now()
    from (values
      (a, format('free50.test.%s@gmail.com', v_tag), now()),
      (b, format('free50test%s+again@googlemail.com', v_tag), now()),
      (c, format('free50-c-%s@example.com', v_tag), now()),
      (d, format('free50-d-%s@example.com', v_tag), null::timestamptz),
      (e, format('free50-e-%s@mailinator.com', v_tag), now()),
      (f, format('free50-f-%s@example.com', v_tag), now()),
      (g, format('free50-g-%s@example.com', v_tag), now()),
      (h, format('free50-h-%s@example.com', v_tag), now()),
      (adm, format('free50-admin-%s@example.com', v_tag), now())
    ) as x(id, email, confirmed);

  -- 1. Who may call what
  if not has_function_privilege('anon', 'public.free50_status()', 'execute') then raise exception 'FAIL 1: anon can''t read the count'; end if;
  if has_function_privilege('anon', 'public.free50_claim(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.free50_claim(uuid, text)', 'execute') then raise exception 'FAIL 1: free50_claim is callable from the browser'; end if;
  if has_table_privilege('anon', 'public.free50_claims', 'select') or has_table_privilege('authenticated', 'public.free50_claims', 'select')
     or has_table_privilege('authenticated', 'public.free50_claims', 'insert') then raise exception 'FAIL 1: free50_claims is readable or writable from the browser'; end if;
  v_ok := v_ok || 'the count is public; claiming and the table are server-only'::text;

  -- 2. The count says nothing personal
  v_r := public.free50_status();
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) k) <> array['cap', 'claimed', 'open'] then raise exception 'FAIL 2: status keys %', v_r; end if;
  if (v_r ->> 'claimed')::int <> v_live or (v_r ->> 'cap')::int <> 50 or not (v_r ->> 'open')::boolean then raise exception 'FAIL 2: status %', v_r; end if;
  v_ok := v_ok || format('the count is {claimed, cap, open} only (%s live before the test)', v_live);

  -- 3. A first claim: a seat, and a grant for good
  v_r := public.free50_claim(a, encode(sha256(convert_to('ip-a-' || v_tag, 'UTF8')), 'hex'));
  if not coalesce((v_r ->> 'ok')::boolean, false) then raise exception 'FAIL 3: first claim refused: %', v_r; end if;
  v_seat_a := (v_r ->> 'seat')::int;
  select id, grant_id into v_claim, v_grant from public.free50_claims where user_id = a;
  if not exists (select 1 from public.access_grants where id = v_grant and user_id = a and source = 'free50' and until is null and revoked_at is null) then
    raise exception 'FAIL 3: no grant for good'; end if;
  if not public.has_access_for(a) then raise exception 'FAIL 3: the claim gives no access'; end if;
  v_ok := v_ok || format('a first claim takes seat %s and a grant for good, and has_access_for() lets them in', v_seat_a);

  -- 4. The same account again: nothing new
  v_r := public.free50_claim(a, encode(sha256(convert_to('ip-a2-' || v_tag, 'UTF8')), 'hex'));
  if not (v_r ->> 'ok')::boolean or not coalesce((v_r ->> 'already')::boolean, false) or (v_r ->> 'seat')::int <> v_seat_a then raise exception 'FAIL 4: %', v_r; end if;
  if (select count(*) from public.free50_claims where user_id = a) <> 1 or (select count(*) from public.access_grants where user_id = a and source = 'free50') <> 1 then
    raise exception 'FAIL 4: a second claim or grant was made'; end if;
  v_ok := v_ok || 'the same account again gets its own seat back, and nothing new is made'::text;

  -- 5. The same email written another way (no dots, +tag, googlemail.com)
  v_r := public.free50_claim(b, encode(sha256(convert_to('ip-b-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' <> 'A free seat has already been claimed with this email address.' then raise exception 'FAIL 5: %', v_r; end if;
  v_ok := v_ok || 'the same Gmail without dots, with a +tag, at googlemail.com: refused'::text;

  -- 6. The same connection, another person
  v_r := public.free50_claim(c, encode(sha256(convert_to('ip-a-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' <> 'Someone on this connection has already claimed a free seat.' then raise exception 'FAIL 6: %', v_r; end if;
  v_ok := v_ok || 'another account on the same connection: refused'::text;

  -- 7. Email not confirmed
  v_r := public.free50_claim(d, encode(sha256(convert_to('ip-d-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' <> 'Confirm your email first, then claim your seat.' then raise exception 'FAIL 7: %', v_r; end if;
  v_ok := v_ok || 'an unconfirmed email: refused'::text;

  -- 8. A throwaway domain
  v_r := public.free50_claim(e, encode(sha256(convert_to('ip-e-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' not like 'Free seats need an email address you keep.%' then raise exception 'FAIL 8: %', v_r; end if;
  if not public.free50_throwaway('eu.Mailinator.com') or public.free50_throwaway('notmailinator.com') then raise exception 'FAIL 8: subdomain matching'; end if;
  v_ok := v_ok || 'a throwaway domain (and its subdomains): refused'::text;

  -- 9. Already has Marble for good (a lifetime gift)
  insert into public.access_grants (user_id, until, source) values (f, null, 'code');
  v_r := public.free50_claim(f, encode(sha256(convert_to('ip-f-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' <> 'You already have Marble for good, so there''s nothing to add.' then raise exception 'FAIL 9: %', v_r; end if;
  v_ok := v_ok || 'an account that already has Marble for good: nothing to add'::text;

  -- 10. Bad arguments are a server error, not a refusal
  begin
    perform public.free50_claim(c, 'not-a-hash');
    raise exception 'FAIL 10: a bad hash was accepted';
  exception when sqlstate '22023' then null;
  end;
  v_ok := v_ok || 'a connection hash that isn''t 64 hex characters is refused outright'::text;

  -- 11. Fill every seat still free, each from its own account, email and connection
  v_n := (select count(*) from public.free50_claims where revoked_at is null);
  while v_n < 50 loop
    v_fill := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_fill, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('free50-fill-%s-%s@example.com', v_n, v_tag), now(),
            '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now());
    v_r := public.free50_claim(v_fill, encode(sha256(convert_to(format('ip-fill-%s-%s', v_n, v_tag), 'UTF8')), 'hex'));
    if not (v_r ->> 'ok')::boolean then raise exception 'FAIL 11: filling seat % refused: %', v_n + 1, v_r; end if;
    v_n := v_n + 1;
  end loop;
  if (select count(distinct seat) from public.free50_claims where revoked_at is null) <> 50 then raise exception 'FAIL 11: seats aren''t 1 to 50'; end if;
  v_ok := v_ok || 'all 50 seats fill, numbered 1 to 50 with none twice'::text;

  -- 12. The cap
  v_r := public.free50_claim(g, encode(sha256(convert_to('ip-g-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' not like 'All 50 free seats have been claimed.%' then raise exception 'FAIL 12: %', v_r; end if;
  v_r := public.free50_status();
  if (v_r ->> 'claimed')::int <> 50 or (v_r ->> 'open')::boolean then raise exception 'FAIL 12: status at the cap %', v_r; end if;
  v_ok := v_ok || 'the 51st claim is refused and the count says 50 of 50, closed'::text;

  -- 13. Taking one back needs an admin with two-step
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin
    perform public.admin_free50_revoke(v_claim, 'Test: not an admin');
    raise exception 'FAIL 13: a trader took a seat back';
  exception when sqlstate '42501' then null;
  end;
  v_ok := v_ok || 'a trader can''t take a seat back'::text;

  -- 14. An admin takes account a's seat back: the claim and its grant end, and the count frees a place
  insert into public.admins (user_id) values (adm);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.admin_free50_revoke(v_claim, 'Test: two accounts from one person');
  if not exists (select 1 from public.free50_claims where id = v_claim and revoked_at is not null and revoke_reason = 'Test: two accounts from one person') then raise exception 'FAIL 14: claim not taken back'; end if;
  if not exists (select 1 from public.access_grants where id = v_grant and revoked_at is not null) then raise exception 'FAIL 14: grant still on'; end if;
  if public.has_access_for(a) then raise exception 'FAIL 14: still has access'; end if;
  if not exists (select 1 from public.admin_log where action = 'free_seat.revoke' and target_type = 'free_seat' and target_id = v_claim::text) then raise exception 'FAIL 14: not logged'; end if;
  v_r := public.free50_status();
  if (v_r ->> 'claimed')::int <> 49 or not (v_r ->> 'open')::boolean then raise exception 'FAIL 14: status after taking back %', v_r; end if;
  v_ok := v_ok || 'taking a seat back ends its grant, is logged, and the count goes back to 49, open'::text;

  -- 15. The admin list names the account and when
  v_r := public.admin_free50_claims();
  if (v_r ->> 'claimed')::int <> 49 or not exists (select 1 from jsonb_array_elements(v_r -> 'claims') x
       where (x ->> 'id')::uuid = v_claim and x ->> 'revoked_at' is not null and x -> 'user' is not null and x ->> 'claimed_at' is not null) then
    raise exception 'FAIL 15: %', left(v_r::text, 400); end if;
  v_ok := v_ok || 'the admin list shows each claim with its account, when, and whether it was taken back'::text;

  -- 16. The account, email and connection of a seat taken back can't claim again
  v_r := public.free50_claim(a, encode(sha256(convert_to('ip-a3-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' not like 'This account''s free seat was taken back%' then raise exception 'FAIL 16: account %', v_r; end if;
  v_r := public.free50_claim(b, encode(sha256(convert_to('ip-b-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' <> 'A free seat has already been claimed with this email address.' then raise exception 'FAIL 16: email %', v_r; end if;
  v_r := public.free50_claim(c, encode(sha256(convert_to('ip-a-' || v_tag, 'UTF8')), 'hex'));
  if coalesce((v_r ->> 'ok')::boolean, true) or v_r ->> 'error' <> 'Someone on this connection has already claimed a free seat.' then raise exception 'FAIL 16: connection %', v_r; end if;
  v_ok := v_ok || 'the account, email and connection of a seat taken back stay refused'::text;

  -- 17. Someone new gets the freed seat, and the cap closes again
  v_r := public.free50_claim(h, encode(sha256(convert_to('ip-h-' || v_tag, 'UTF8')), 'hex'));
  if not coalesce((v_r ->> 'ok')::boolean, false) or (v_r ->> 'seat')::int <> v_seat_a then raise exception 'FAIL 17: %', v_r; end if;
  if (public.free50_status() ->> 'open')::boolean then raise exception 'FAIL 17: still open at 50'; end if;
  v_ok := v_ok || format('someone new takes the freed seat (%s) and the count is back to 50, closed', v_seat_a);

  -- 18. The paid Founders' seats are untouched
  if exists (select 1 from public.lifetime_purchases l where l.user_id in (a, h)) then raise exception 'FAIL 18: a founders'' seat was made'; end if;
  v_ok := v_ok || 'no Founders'' Lifetime row is made, so founders_seats_taken() never counts a free seat'::text;

  raise exception 'RESULTS % checks passed:%', cardinality(v_ok), E'\n  ' || array_to_string(v_ok, E'\n  ');
end $$;

rollback;
