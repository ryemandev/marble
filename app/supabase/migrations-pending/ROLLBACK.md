# Pending migrations: apply order and how to undo each

Written 29 October 2026 with the security audit 2 fixes. Nothing here has been applied.

## Before applying anything

1. **Back up first** (the free plan has no backups or point-in-time recovery). Do one of these:
   - `supabase db dump --linked -f backup-2026-10-29.sql` and `supabase db dump --linked --data-only -f data-2026-10-29.sql`
   - Dashboard → Database → Backups → download.
2. **Snapshot** what the batch replaces, so any step can be put back exactly:
   - `pg_get_functiondef` for every function named under "replaces" below;
   - `pg_policies` for `public.trades`, `public.imports`, `public.profiles`, `storage.objects` and `realtime.messages`;
   - the grants on the tables under 20261029180400;
   - row counts of `trades`, `imports`, `profiles`, `profile_private`, `trial_uses`, `referrals`, `commissions`.
3. **Apply in this order, each inside a transaction.** Every file has its own `begin; … commit;`.
4. **Deploy the code that goes with each file in the same sitting.** The "Deploy with it" lines below say which.

## Apply order

| # | File | Deploy with it |
|---|---|---|
| 1 | 20261029120000_partner_and_career_forms.sql | partner-apply, career-interest (and set FORMS_HASH_SALT first) |
| 2 | 20261029130000_lifetime_after_founders.sql | stripe-webhook, create-checkout |
| 3 | 20261029130100_heard_from.sql | app build |
| 4 | 20261029130200_email_events.sql | trial-emails, email-unsubscribe (set EMAIL_LINK_SECRET first) |
| 5 | 20261029130300_trial_emails_schedule.sql | trial-emails (the file makes its own Vault secret `trial_emails_cron`) |
| 6 | 20261029160000_community_1_crews_and_feed.sql | app build |
| 7 | 20261029160100_community_2_chat.sql | app build (private chat channels) |
| 8 | 20261029160200_community_3_discipline_boards.sql | app build |
| 9 | 20261029160300_community_4_events.sql | app build, topstepx, ibkr |
| 10 | 20261029170000_study_notebooks_and_pages.sql | app build (Study is another session's work: check its own notes) |
| 11 | 20261029180000_synced_trades_server_only.sql | topstepx, ibkr, app build (same sitting: old apps can't sync after this) |
| 12 | 20261029180100_signup_profiles_and_names.sql | app build (calls ensure_profile) |
| 13 | 20261029180200_handle_lookalikes.sql | none |
| 14 | 20261029180300_trial_and_referral_variants.sql | stripe-webhook |
| 15 | 20261029180400_hardening.sql | avatar-upload, app build (avatars go through the function) |
| 16 | 20261029180500_csp_reports.sql | csp-report, site build |
| 17 | 20261030100000_dms_and_sharing.sql | dm-alerts (verify_jwt off), app build (see `.scratch/dms-deploy.md`) |
| 18 | 20261031100000_news_dashboard.sql | app build, then news-calendar, news-wire, news-actuals (all verify_jwt off) |
| 19 | 20261031100100_news_schedule.sql | last: the three news functions must be deployed first (the file makes its own Vault secret `news_sync_cron`) |
| 20 | 20261031100200_prop_money.sql | app build with the Fees & payouts screen (branch `money-tracker`) |
| 21 | 20261031140000_chat_topic_rooms.sql | app build (topic rooms in Chat) |
| 22 | 20261031120000_push_notifications.sql | push-send (verify_jwt off) with _shared/webpush.js; VAPID secrets first, then app build |
| 23 | 20261031100300_voice_sessions.sql | after 17 (DMs). voice (verify_jwt on) once the owner has added LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET; then app build |
| 24 | 20261031150000_admin_gifts.sql | nothing on its own (the admin door, the admin log, gift codes; replaces `has_access_for` and `my_billing`) |
| 25 | 20261031150100_admin_area.sql | right after 24; then the site build (`/admin/`, and the gift-code voucher on the plan screen and plan card) |
| 26 | 20261031160000_crypto_world.sql | **not in the Coming soon release.** Applied only when crypto goes live: hyperliquid (verify_jwt on), topstepx and ibkr (same sitting: they share `_shared/import` and sync-save), then the app build with `CRYPTO_LIVE = true` |
| 28 | 20261031180000_account_firm_plan.sql | before the app build with the firm rules tracker (branch `claude/firm-rules-af7366`): its account form saves a firm plan into these columns |
| 27 | 20261031170000_crash_reports.sql | then deploy crash-report (verify_jwt off); makes Vault secrets crash_pepper and crash_digest_cron and two cron jobs |
| 29 | 20261031170100_funnel_counts.sql | with the app build (trial funnel counts) |
| 30 | 20261031170200_search_posts.sql | with the app build (search box: Community posts) |
| 31 | 20261101100000_showcase_look.sql | any time; the app build that reads it is already safe without it (the look stays on each device until then). **Applied 30 Oct 2026.** |
| 32 | 20261101110000_free50.sql | after 24 (gift grants) and 1 (form_rate_ok). Then deploy free50 (verify_jwt **on**; it uses FORMS_HASH_SALT, already set for the forms), run `supabase/tests/20261101110000_free50.test.sql`, then the site build. Nothing shows until `FREE50_LIVE = true` in src/mode.js (or `?free50=1` to preview) |
| 33 | 20261102100000_backdrop.sql | any time; the app build that reads it is already safe without it (the choice stays on each device and "Your own photo" isn't offered until then). Then deploy delete-account (it empties the new `backdrops` bucket too). **Applied 2 Nov 2026**; delete-account redeployed the same day (v20, with `backdrops`) |
| 34 | 20261102120000_admin_two_step.sql | any time; the app build that reloads Payouts and the funnel after two-step (main 0cc1d67) is already live. **Applied 2 Nov 2026**; delete-account (v21), avatar-upload (v10) and stripe-setup (v16, CORS no longer "*") redeployed from the repo the same day |
| 35 | 20261103100000_admin_rework.sql | after 34. First a rolled-back run on live. Then deploy admin-stripe (verify_jwt **on**), create-checkout (discount codes), owner-alerts (verify_jwt **off**: pg_cron calls it with the owner_alerts_cron vault secret; needs RESEND_API_KEY, already set for the crash digest), then the site build. **Applied 2 Nov 2026** (as 20261102231232) after a rolled-back run that caught two faults, fixed in the file first; create-checkout v18, admin-stripe v1 and owner-alerts v2 deployed and the site built the same night |
| 36 | 20261103110000_admin_fk_indexes.sql | after 35, any time. **Applied 2 Nov 2026** (as 20261102235745) after a rolled-back run on live |
| 37 | 20261103120000_playbook_chapters.sql | any time; the app build that reads it is already safe without it (chapter words stay on each device until then, and go up on the first load after). **Applied 3 Nov 2026** (as 20261103202329) after a rolled-back run on live: 5 rows pass, 4 of 4 over-limit writes refused |

---

## 1. 20261029120000_partner_and_career_forms.sql (new tables; edited by the audit-2 fixes)

- **Makes:**
  - the tables `partner_applications`, `career_interest` and `form_rate_hits`;
  - the functions `form_rate_ok` and `forms_purge`;
  - a cron job `forms-purge`.
- **Audit-2 edit:**
  - a careers entry is inserted and duplicates are ignored, never overwritten;
  - rate-limit kinds now include `*:verified`.
- **Undo** (this deletes any applications received, so export them first):
  ```sql
  select cron.unschedule('forms-purge') where exists (select 1 from cron.job where jobname = 'forms-purge');
  drop function if exists public.forms_purge();
  drop function if exists public.form_rate_ok(text, text, int, int);
  drop table if exists public.form_rate_hits, public.career_interest, public.partner_applications;
  ```

## 2. 20261029130000_lifetime_after_founders.sql

- **Replaces:**
  - `stripe_lifetime_paid(uuid, text, text, integer)`, which becomes a 5-argument version;
  - `founders_seats_taken()`.
- **Undo:**
  ```sql
  drop function if exists public.stripe_lifetime_paid(uuid, text, text, integer, boolean);
  ```
  Then restore both functions from the snapshot.
- **Deploy order on undo:** redeploy the old stripe-webhook before undoing. The new webhook passes `p_standard`.

## 3. 20261029130100_heard_from.sql

- **Undo:**
  ```sql
  alter table public.profile_private drop column if exists heard_from;
  ```
  This loses the answers.

## 4. 20261029130200_email_events.sql

- **Undo:**
  ```sql
  drop function if exists public.trial_email_candidates();
  drop table if exists public.email_events;
  ```
  This loses the unsubscribe records. Export them first and honour them by hand.

## 5. 20261029130300_trial_emails_schedule.sql

- **Undo:**
  ```sql
  select cron.unschedule(jobname) from cron.job where jobname like 'trial-emails%';
  drop function if exists public.trial_emails_cron_ok(text);
  ```
- **Leave in place:** the pg_cron and pg_net extensions. Other jobs (forms-purge, csp-reports-purge) use them.

## 6–9. Community parts 1–4 (new feature; edited by the audit-2 fixes)

**Audit-2 edits:**
- **Part 1:** replies to a hidden post are hidden with it.
- **Part 2:**
  - private Realtime presence policies on `realtime.messages`;
  - after deploy, turn off Realtime → "Allow public access".
- **Part 3:**
  - competitions count synced trades only;
  - their R comes from the cup's risk unit;
  - the self-marked plan is ignored in competitions;
  - board rules are capped;
  - board RPCs are rate-limited (60 a minute).
- **Part 4:**
  - entry needs a broker link, and the size comes from the broker;
  - synced trades inside a running cup can't be deleted;
  - giveaways need a confirmed email and an account at least 7 days old, allow one entry per normalised email, and are rate-limited;
  - the web route `giveaway_enter_web()` is service only;
  - invalid entries are recorded in the draw;
  - validity is fixed once entries close;
  - winners can be disqualified with a reason.

**Undo, newest first (part 4, then 3, 2, 1).** Each part only adds objects, except for the replaced `feed()` and the `posts` kind check:

- **Part 4:**
  ```sql
  drop trigger if exists trades_competition_hold on public.trades;
  drop function if exists public.trades_competition_hold();
  drop table if exists public.giveaway_winners, public.giveaway_draws, public.giveaway_entries, public.giveaway_secrets, public.giveaways,
    public.competition_results, public.competition_entries, public.competitions cascade;
  ```
  Then drop its functions: `enter_competition`, `withdraw_competition`, `competition_who`, `competition_rows`, `competition_board`, `competition_finalise`, `giveaway_seal`, `enter_giveaway`, `giveaway_enter_web`, `giveaway_draw`, `giveaway_result`, `giveaway_show_handle` and `giveaway_entries_guard`.
- **Part 3:**
  ```sql
  drop trigger if exists discipline_rules_lock on public.profile_private;
  drop table if exists public.discipline_rules;
  alter table public.profile_private drop column if exists show_on_boards;
  ```
  Then drop `board_period`, `discipline_days`, `board_who`, `leaderboard` and `house_cup`.
- **Part 2:**
  ```sql
  drop policy if exists "chat rooms: join your rooms" on realtime.messages;
  drop policy if exists "chat rooms: say you're here" on realtime.messages;
  alter publication supabase_realtime drop table public.chat_messages;
  drop trigger if exists reports_rate_limit on public.reports;
  alter table public.reports drop constraint if exists reports_one_target, drop column if exists message_id;
  drop table if exists public.chat_messages;
  ```
  Then drop `chat_before_insert`, `chat_purge` and `reports_rate_limit`.
- **Part 1:**
  ```sql
  drop trigger if exists posts_before_write on public.posts;
  drop table if exists public.post_reactions, public.crew_members cascade;
  drop function if exists public.feed(text, text, timestamptz, integer, boolean, uuid);
  ```
  - Restore the old `feed(text, text, timestamptz, integer)` and the old `posts_kind_check` from the snapshot.
  - Drop `my_crew`, `set_crew`, `crew_counts`, `trade_card(uuid, jsonb, boolean)`, `anon_card` and `posts_before_write`.
  - Rows with the new post kinds (lesson, question, reply) must be changed or deleted before the old check goes back.

## 10. 20261029170000_study_notebooks_and_pages.sql

- **Owner:** another session. Its undo is in its own notes.
- **What it adds:**
  - the tables `notebooks` and `pages`;
  - the `study` bucket and its storage policies;
  - `study_photos_ok` and `study_touch_updated_at`;
  - a one-time move of note data.
- **Undo:** drop those objects. Restore the moved notes from the backup only if the move needs undoing.

## 11. 20261029180000_synced_trades_server_only.sql (audit 2, H1)

- **Makes:**
  - the RESTRICTIVE policy `trades: sync rows come from the server`;
  - `trades_guard()` and its trigger;
  - `imports_guard()` and its trigger;
  - `sync_context()` and `sync_commit()`, both service role only.
- **Data:** none changed. Existing synced trades stay as they are.
- **Undo:**
  ```sql
  drop trigger if exists trades_guard on public.trades;
  drop function if exists public.trades_guard();
  drop trigger if exists imports_guard on public.imports;
  drop function if exists public.imports_guard();
  drop policy if exists "trades: sync rows come from the server" on public.trades;
  drop function if exists public.sync_commit(uuid, uuid, text, text, jsonb, jsonb, integer, integer, jsonb);
  drop function if exists public.sync_context(uuid, uuid, text, text[], timestamptz, timestamptz);
  ```
- **Deploy order on undo:** redeploy the previous topstepx and ibkr functions and app build first. The new ones call `sync_commit`.

## 12. 20261029180100_signup_profiles_and_names.sql (audit 2, M1, M7, part of L5)

- **Makes:**
  - the column `profile_private.full_name`;
  - `email_norm`, `email_norm_hash`, `same_person`, `create_profile_for`, `handle_user_confirmed` and `ensure_profile`;
  - the trigger `on_auth_user_confirmed`.
- **Replaces:** `handle_new_user()`.
- **Data:**
  - unconfirmed email sign-ups that never signed in lose their profile (0 such accounts on 29 Oct);
  - each trader's current `profiles.name` is copied into `full_name`;
  - a name that is still exactly the provider's full name is cut to its first word.
  - Keep the snapshot of `profiles (id, name)` to undo this.
- **Undo:**
  ```sql
  drop trigger if exists on_auth_user_confirmed on auth.users;
  drop function if exists public.ensure_profile(), public.handle_user_confirmed(), public.create_profile_for(uuid);
  -- restore handle_new_user() from the snapshot (it built the profile from full_name at sign-up)
  update public.profiles p set name = s.name from snapshot_profiles s where s.id = p.id;   -- the names as they were
  alter table public.profile_private drop column if exists full_name;
  ```
- **Keep** `email_norm`, `email_norm_hash` and `same_person` if part 4 or file 14 stays: both use them.
- **Deploy order:** the app build's `ensure_profile` call is harmless without this file (the RPC answers 404 and the app goes on), so the app can be rolled back separately.

## 13. 20261029180200_handle_lookalikes.sql (audit 2, M2)

- **Makes:** `handle_fold()`.
- **Replaces:** `handle_reserved()`.
- **Data:** none. Existing handles are never checked again.
- **Undo:** restore `handle_reserved()` from the snapshot, then:
  ```sql
  drop function if exists public.handle_fold(text, boolean);
  ```

## 14. 20261029180300_trial_and_referral_variants.sql (audit 2, L5)

- **Makes:**
  - the column `trial_uses.kind`;
  - `card_hash()`;
  - `trial_card_seen()` (service role).
- **Replaces:**
  - `record_trial(uuid, text)`, which becomes 3 arguments;
  - `trial_eligible_for()`;
  - `claim_referral()`;
  - `stripe_record_commission(… 7 args)`, which becomes 8.
- **Data:** adds a normalised-email row to `trial_uses` for each past trial whose account still exists.
- **Undo:**
  1. Redeploy the previous stripe-webhook first.
  2. Run:
     ```sql
     drop function if exists public.record_trial(uuid, text, text);
     drop function if exists public.trial_card_seen(text, text);
     drop function if exists public.stripe_record_commission(uuid, text, text, integer, text, integer, timestamptz, text);
     ```
  3. Restore `record_trial(uuid, text)`, `trial_eligible_for`, `claim_referral` and `stripe_record_commission(… 7 args)` from the snapshot.
  4. Grant execute on the two `stripe_*`/`record_trial` functions to service_role again.
  5. Run:
     ```sql
     delete from public.trial_uses where kind <> 'email';
     alter table public.trial_uses drop column if exists kind;
     drop function if exists public.card_hash(text);
     ```

## 15. 20261029180400_hardening.sql (audit 2, L1, L2, L4, M6, L9)

- **Changes:**
  - the constraint `profiles_avatar_url_ours` is tightened;
  - two RESTRICTIVE storage policies are added ("plain file names", "plain file names: changes");
  - the avatars write and update policies are dropped, because uploads now go through avatar-upload;
  - writes to the money and admin tables are revoked;
  - the trigger `ideas_polls_rate_limit` is added to `ideas` and `polls`;
  - pg_net usage is revoked from anon and authenticated.
- **Undo:**
  ```sql
  alter table public.profiles drop constraint profiles_avatar_url_ours, add constraint profiles_avatar_url_ours check (avatar_url is null
    or left(avatar_url, char_length('https://your-project-ref.supabase.co/storage/v1/object/public/avatars/' || id::text || '/'))
       = 'https://your-project-ref.supabase.co/storage/v1/object/public/avatars/' || id::text || '/');
  drop policy if exists "plain file names" on storage.objects;
  drop policy if exists "plain file names: changes" on storage.objects;
  create policy "avatars: owner writes" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy "avatars: owner updates" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  grant insert, update, delete on table public.admins, public.customers, public.subscriptions, public.lifetime_purchases,
    public.referrals, public.trial_uses, public.payment_disputes, public.stripe_events, public.server_settings,
    public.rate_events, public.handle_holds, public.commissions, public.payouts to authenticated;
  drop trigger if exists ideas_rate_limit on public.ideas;
  drop trigger if exists polls_rate_limit on public.polls;
  drop function if exists public.ideas_polls_rate_limit();
  ```
  - The pg_net revoke can stay: nothing in the browser uses it.
  - Roll the app back to direct avatar uploads too. The old build uploads straight to storage, so it needs the two avatars policies back.

## 16. 20261029180500_csp_reports.sql (audit 2, M4)

- **Undo:**
  ```sql
  select cron.unschedule('csp-reports-purge') where exists (select 1 from cron.job where jobname = 'csp-reports-purge');
  drop function if exists public.csp_report_save(text, jsonb);
  drop function if exists public.csp_reports_purge();
  drop table if exists public.csp_report_hits;
  drop table if exists public.csp_reports;
  ```
- **The site can keep** its report-uri and report-to lines. The policy is Report-Only, and reports to a missing endpoint fail quietly.

## 17. 20261030100000_dms_and_sharing.sql (private messages and sharing Study notes)

- **Before applying:** snapshot `pg_get_functiondef('public.feed(text, text, timestamptz, integer, boolean, uuid)'::regprocedure)`
  (this file replaces it) and the policies on `public.chat_messages` and `realtime.messages`.
- **Makes:**
  - the tables `staff`, `dm_threads`, `dm_members`, `dm_messages`, `dm_blocks`, `dm_reports`, `dm_bans`, `dm_alert_log`,
    `study_shares`, `study_share_pages`, `study_share_members`, `study_share_reads` and `study_share_saves`;
  - the columns `profile_private.dm_from`, `profile_private.dm_email` and `posts.share_id`;
  - two Vault secrets, `dm_body_key` (the key message bodies are encrypted with) and `dm_alerts_cron`;
  - the cron jobs `dm-purge` and `dm-alerts`;
  - the triggers `posts_share_guard` (posts), `dm_broadcast` (dm_messages), `dm_member_gone` (dm_members);
  - the policies `chat: not from people you blocked` (chat_messages) and `dm: members listen` (realtime.messages).
- **Replaces:** `feed(text, text, timestamptz, integer, boolean, uuid)`: same arguments, one more column (`share`), and
  blocked traders' named posts hidden from the person who blocked them.
- **Undo** (this deletes every private message, report, block and share; export what must be kept first):
  ```sql
  select cron.unschedule(jobname) from cron.job where jobname in ('dm-purge', 'dm-alerts');
  drop policy if exists "dm: members listen" on realtime.messages;
  drop policy if exists "chat: not from people you blocked" on public.chat_messages;
  drop trigger if exists posts_share_guard on public.posts;
  drop trigger if exists dm_broadcast on public.dm_messages;
  drop trigger if exists dm_member_gone on public.dm_members;
  alter table public.posts drop column if exists share_id;
  drop table if exists public.study_share_saves, public.study_share_reads, public.study_share_members, public.study_share_pages,
    public.study_shares, public.dm_alert_log, public.dm_bans, public.dm_reports, public.dm_blocks, public.dm_messages,
    public.dm_members, public.dm_threads, public.staff cascade;
  alter table public.profile_private drop column if exists dm_from, drop column if exists dm_email;
  drop function if exists public.dm_seal(text), public.dm_open(bytea), public.is_staff(uuid), public.dm_aal2(),
    public.blocked_between(uuid, uuid), public.dm_i_blocked(uuid), public.dm_who(uuid), public.dm_user_by_handle(text),
    public.dm_has_card_number(text), public.dm_flags(text, uuid), public.can_view_share(uuid, uuid), public.share_lines(jsonb),
    public.share_pages_now(uuid), public.share_card(uuid, uuid), public.dm_card_out(jsonb, uuid), public.dm_thread_for(uuid, uuid),
    public.dm_post(uuid, uuid, text, jsonb), public.dm_block_user(uuid, uuid), public.dm_inbox(), public.dm_unread(),
    public.dm_thread(uuid, timestamptz, timestamptz), public.dm_profile(text), public.dm_start(text, text),
    public.dm_send(uuid, text, uuid, uuid), public.dm_accept(uuid), public.dm_ignore(uuid), public.dm_leave(uuid),
    public.dm_mute(uuid, boolean), public.dm_unsend(uuid), public.dm_block(text), public.dm_unblock(text), public.dm_blocked(),
    public.dm_report(uuid, text, text, boolean), public.dm_settings(text, boolean), public.dm_export(),
    public.share_page(uuid, uuid, text, text[], text, boolean), public.share_stop(uuid), public.share_list(uuid),
    public.share_view(uuid, integer), public.share_save(uuid, integer, uuid), public.posts_share_guard(),
    public.dm_broadcast(), public.dm_can_listen(text), public.dm_member_gone(), public.dm_reports_open(),
    public.dm_report_resolve(uuid, text), public.dm_alerts_cron_ok(text), public.dm_alert_batch(), public.dm_purge();
  delete from vault.secrets where name in ('dm_body_key', 'dm_alerts_cron');
  ```
  Then restore `feed(...)` from the snapshot. Dropping the new `feed()` first is needed (its return type differs):
  `drop function if exists public.feed(text, text, timestamptz, integer, boolean, uuid);`
- **Never** delete or change the `dm_body_key` secret while the tables exist: every message body and report copy would
  become unreadable.
- **Deploy order on undo:** put the previous app build back first (the new one calls these functions; without them
  Messages shows "Couldn't load your messages" and Share fails, but nothing else breaks), then delete the dm-alerts
  function, then run the SQL. Saved copies people made are ordinary Study pages and stay.

## 18. 20261031100000_news_dashboard.sql (News: calendar, wire, hands-off window)

- **Makes:**
  - `econ_events` and `news_items`: row security on with no policies, so they're read through `news_feed()` and
    written by the service role.
  - `news_rules`: each trader's own row.
  - `news_feed(integer)` and `news_sync_cron_ok(text)`.
  - `trades.news_event`, with the trigger `trades_news_window` (`tag_news_window()`).
  - It replaces nothing.
- **Before it's applied** the app already copes: News shows its empty states, and the hands-off rule is kept on the
  device.
- **Applying it** changes no existing row. `news_event` starts empty; only new or re-timed trades get one.
- **Undo** (in a transaction). To take the News tab away too, put the previous app build back first.
  ```sql
  drop trigger if exists trades_news_window on public.trades;
  drop function if exists public.tag_news_window();
  alter table public.trades drop column if exists news_event;
  drop function if exists public.news_feed(integer);
  drop function if exists public.news_sync_cron_ok(text);
  drop table if exists public.news_rules, public.news_items, public.econ_events;
  ```

## 19. 20261031100100_news_schedule.sql (the news jobs)

- **Makes:** the Vault secret `news_sync_cron` and three pg_cron jobs:
  - `news-calendar`: every 6 hours.
  - `news-wire`: every 10 minutes.
  - `news-actuals`: every 2 minutes, 06:00 to 21:59 UTC on weekdays.
- **Undo:**
  ```sql
  select cron.unschedule('news-calendar'); select cron.unschedule('news-wire'); select cron.unschedule('news-actuals');
  delete from vault.secrets where name = 'news_sync_cron';
  ```

## 20. 20261031100200_prop_money.sql (Fees & payouts: the receipt)

- **Makes:**
  - the table `prop_money` (a trader's own prop firm fees and payouts), its indexes `prop_money_user` and
    `prop_money_account`, and its policies (own rows, the account must be your own, `paid: add` and `paid: change`);
  - the function and trigger `prop_money_touch` (keeps `updated_at`).
- **Replaces:** nothing. Depends on `public.accounts` and `public.has_access()`, which already exist.
- **Check after applying:** as a signed-in trader with a plan, add a fee in the app, reload, and see it on the receipt;
  "Export my data" has a `prop_money` list.
- **Undo** (this deletes every fee and payout traders have entered; export them first):
  ```sql
  drop table if exists public.prop_money;
  drop function if exists public.prop_money_touch();
  ```
- **Deploy order on undo:** put the previous app build back first. The new build still loads without the table (the
  screen says it didn't load, and nothing can be added), so the order only matters for entries typed in between.

## 21. 20261031140000_chat_topic_rooms.sql (topic rooms in Chat)

- **Before applying:** nothing to snapshot. The four policies it replaces are written out in full below, exactly as
  20261029160100 made them (checked against the live database on 31 October 2026).
- **Changes:** the `chat_messages_room_check` constraint (seven more rooms) and four policies: `chat: read your rooms`,
  `chat: write in your rooms` (chat_messages), `chat rooms: join your rooms` and `chat rooms: say you're here`
  (realtime.messages). Nothing is added and no function changes.
- **Deploy with it:** the app build with the topic rooms. An older build only ever opens General and the crew rooms, so
  it keeps working after this file; the new build opens topic rooms that fail to load without it.
- **Undo** (this deletes every message in a topic room, and the reports on them; export what must be kept first):
  ```sql
  begin;
  delete from public.chat_messages where room in ('futures', 'forex', 'stocks', 'props', 'psych', 'wins', 'help');
  alter table public.chat_messages drop constraint chat_messages_room_check;
  alter table public.chat_messages add constraint chat_messages_room_check check (room in ('general', 'OLY', 'NITE', 'PIT'));
  comment on table public.chat_messages is 'In-app chat: General and one room per crew. Kept 90 days. Written by the trader, cards and crew set by the server.';
  drop policy "chat: read your rooms" on public.chat_messages;
  create policy "chat: read your rooms" on public.chat_messages for select to authenticated using (
    (select public.is_admin())
    or (not hidden and created_at > now() - interval '90 days' and (room = 'general' or room = (select public.my_crew()))));
  drop policy "chat: write in your rooms" on public.chat_messages;
  create policy "chat: write in your rooms" on public.chat_messages for insert to authenticated with check (
    user_id = (select auth.uid()) and not hidden and (room = 'general' or room = (select public.my_crew())));
  drop policy "chat rooms: join your rooms" on realtime.messages;
  create policy "chat rooms: join your rooms" on realtime.messages for select to authenticated
    using (realtime.topic() = 'chat:general' or realtime.topic() = 'chat:' || coalesce((select public.my_crew()), '-'));
  drop policy "chat rooms: say you're here" on realtime.messages;
  create policy "chat rooms: say you're here" on realtime.messages for insert to authenticated
    with check (realtime.messages.extension = 'presence'
      and (realtime.topic() = 'chat:general' or realtime.topic() = 'chat:' || coalesce((select public.my_crew()), '-')));
  commit;
  ```
- **Deploy order on undo:** put the previous app build back first, then run the SQL.

## 22. 20261031120000_push_notifications.sql (push notifications for Marble on the home screen)

- **What it adds:** `push_subscriptions` (devices with alerts on), `push_outbox` (the queue), three switches on
  `profile_private` (`push_limits`, `push_dms`, `push_mentions`), triggers on `trades`, `dm_messages` and
  `chat_messages`, the Vault secret `push_cron`, and the pg_cron job `push-send` (every 30 seconds, only when something
  waits).
- **To stop pushes at once without undoing anything:** `select cron.unschedule('push-send');` (the queue stops being
  sent; nothing else changes), or delete the VAPID secrets (the function then sends nothing).
- **Full undo:**
  ```sql
  select cron.unschedule(jobname) from cron.job where jobname = 'push-send';
  drop trigger if exists trades_push_limits on public.trades;
  drop trigger if exists dm_messages_push on public.dm_messages;
  drop trigger if exists chat_messages_push on public.chat_messages;
  drop table if exists public.push_outbox, public.push_subscriptions cascade;
  alter table public.profile_private drop column if exists push_limits, drop column if exists push_dms,
    drop column if exists push_mentions;
  drop function if exists public.push_endpoint_ok(text), public.push_subscribe(text, text, text, text),
    public.push_unsubscribe(text), public.push_settings(boolean, boolean, boolean),
    public.push_queue(uuid, text, text, text, text, text, text, boolean), public.push_limits_check(), public.push_dm(),
    public.push_mention(), public.push_cron_ok(text), public.push_batch(), public.push_gone(text[]);
  delete from vault.secrets where name = 'push_cron';
  ```
- **Deploy order on undo:** put the previous app build back first (the Notifications card calls `push_settings`; without
  it the card shows an error and nothing else breaks), then delete the push-send function, then run the SQL. Devices
  keep their browser subscription until the app or the browser ends it; nothing is sent to them.

## 23. 20261031100300_voice_sessions.sql (voice sessions, "On air")

- **Before applying:** nothing to snapshot. It replaces no function, and adds one policy on `realtime.messages`
  ("voice: members listen") beside the DMs one.
- **Makes:**
  - the tables `voice_sessions`, `voice_people`, `voice_hands`, `voice_questions`, `voice_votes`, `voice_bans`,
    `voice_reports` and `voice_log`;
  - the functions listed in the SQL below, five triggers named `voice_broadcast`, and the pg_cron job `voice-purge`.
- **Undo (SQL):**
  ```sql
  select cron.unschedule('voice-purge');
  drop policy if exists "voice: members listen" on realtime.messages;
  drop table if exists public.voice_log, public.voice_reports, public.voice_bans, public.voice_votes, public.voice_questions,
    public.voice_hands, public.voice_people, public.voice_sessions cascade;
  drop function if exists public.voice_phase(text, timestamptz), public.voice_can_see(text, uuid), public.voice_banned(uuid),
    public.voice_host_ok(uuid, uuid, boolean), public.voice_note(uuid, uuid, uuid, text, text), public.voice_card(uuid, uuid),
    public.voice_sessions_now(), public.voice_state(uuid), public.voice_ask(uuid, text), public.voice_vote(uuid, boolean),
    public.voice_hand(uuid, boolean), public.voice_report(uuid, text, text, text, text[]), public.voice_go_live(uuid),
    public.voice_run(uuid, integer), public.voice_question_set(uuid, text), public.voice_owner_ok(),
    public.voice_schedule(text, text, timestamptz, integer, text[], text, jsonb), public.voice_cancel(uuid),
    public.voice_reports_open(), public.voice_report_resolve(uuid, text), public.voice_unban(text),
    public.voice_join(uuid, uuid, boolean), public.voice_mod(uuid, uuid, text, text, integer, boolean),
    public.voice_broadcast(), public.voice_can_listen(text), public.voice_purge();
  ```
- **Deploy order on undo:** put the previous app build back first. The new one calls these functions; without them a
  room simply shows no voice session, and nothing else breaks. Then delete the `voice` edge function, then run the
  SQL. Nothing is lost that wasn't meant to go: sessions are never recorded. The LiveKit project can stay or be
  deleted in LiveKit's dashboard; it holds no Marble data.

## 24. 20261031150000_admin_gifts.sql (the admin door, the admin log, gift codes)

- **Before applying:** snapshot `pg_get_functiondef('public.has_access_for(uuid)'::regprocedure)` and
  `pg_get_functiondef('public.my_billing()'::regprocedure)` (this file replaces both). On 31 Oct 2026 they were exactly
  the two definitions in the undo SQL below.
- **Makes:**
  - the tables `admin_log` (append-only: triggers refuse update, delete and truncate), `gift_codes` and `access_grants`;
  - the functions `admin_gate`, `admin_log_append_only`, `admin_note`, `gift_code_new`, `redeem_gift_code`,
    `admin_gift_codes_make`, `admin_gift_codes` and `admin_gift_code_revoke`.
- **Replaces:** `has_access_for` (the same rules, plus an active gift grant inside the dispute rule) and `my_billing`
  (the same keys, plus `gift`).
- **Undo (SQL).** Undo 25 first: its functions call `admin_gate` and `admin_note`. This ends every gift's free access
  at once and deletes the admin log, so export `gift_codes`, `access_grants` and `admin_log` first.
  ```sql
  create or replace function public.has_access_for(p_user uuid)
  returns boolean language sql stable security definer set search_path = ''
  as $$
    select p_user is not null and (
      exists (select 1 from public.admins a where a.user_id = p_user)
      or (
        not exists (select 1 from public.payment_disputes d where d.user_id = p_user and d.status in ('open', 'lost'))
        and (
          exists (select 1 from public.lifetime_purchases l where l.user_id = p_user and not l.refunded)
          or exists (select 1 from public.subscriptions s where s.user_id = p_user and (
               (s.status = 'trialing' and coalesce(s.trial_end, s.current_period_end) > now())
            or (s.status in ('active', 'past_due') and (s.current_period_end is null or s.current_period_end + interval '3 days' > now()))
            or (s.status = 'canceled' and s.current_period_end > now())
          ))
        )
      )
    )
  $$;
  create or replace function public.my_billing()
  returns jsonb language sql stable security definer set search_path = ''
  as $$
    select jsonb_build_object(
      'access', public.has_access(),
      'lifetime', (select jsonb_build_object('seat', l.seat, 'since', l.created_at) from public.lifetime_purchases l where l.user_id = (select auth.uid()) and not l.refunded),
      'subscription', (select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_end', s.trial_end, 'period_end', s.current_period_end,
                         'cancel_at_period_end', s.cancel_at_period_end, 'currency', s.currency, 'amount', s.amount)
                       from public.subscriptions s where s.user_id = (select auth.uid()) order by s.updated_at desc limit 1),
      'customer', exists (select 1 from public.customers c where c.user_id = (select auth.uid())),
      'seats_left', greatest(0, 500 - public.founders_seats_taken()),
      'trial_eligible', public.trial_eligible_for((select auth.uid()))
    )
  $$;
  drop function if exists public.redeem_gift_code(text), public.admin_gift_codes_make(integer, integer, text, uuid, uuid, timestamptz),
    public.admin_gift_codes(), public.admin_gift_code_revoke(uuid), public.gift_code_new(), public.admin_note(text, text, text, jsonb),
    public.admin_gate();
  drop table if exists public.access_grants, public.gift_codes, public.admin_log cascade;
  drop function if exists public.admin_log_append_only();
  ```
- **Deploy order on undo:** put the previous site build back first. The plan screen's voucher calls
  `redeem_gift_code`; without it a redeem says "That didn't work" and nothing else breaks. The plan card reads `gift`
  from `my_billing` and shows nothing for it when it's missing.

## 25. 20261031150100_admin_area.sql (the admin area's functions)

- **Before applying:** snapshot `pg_policies` and the table grants for `competitions`, `competition_entries`,
  `competition_results`, `giveaways`, `giveaway_entries` and `giveaway_winners`. This file drops six "admin manages"
  policies (from 20261029160300) and the browser's write grants, and revokes `competition_finalise`, `giveaway_seal`
  and `giveaway_draw` from `authenticated`. After it, admin writes to events go only through the `admin_` functions:
  two-step, and logged.
- **Makes:**
  - on `reports`: the columns `resolved_at`, `resolution` and `resolved_by`, the index `reports_unresolved`, and the
    trigger and function `reports_new_open`;
  - on `career_interest`: the column `notes`;
  - the function `admin_plan_of` and the 28 `admin_` functions listed in the SQL below.
- **Undo (SQL).** The `reports` resolutions and the careers notes go with their columns, so export them first if wanted.
  ```sql
  drop function if exists public.admin_plan_of(uuid), public.admin_overview(), public.admin_traders(text), public.admin_trader(uuid),
    public.admin_events(), public.admin_competition_save(uuid, jsonb), public.admin_competition_status(uuid, text, text),
    public.admin_competition_delete(uuid), public.admin_competition_finalise(uuid), public.admin_competition_entries(uuid),
    public.admin_competition_entry(uuid, uuid, text, text), public.admin_competition_prize(uuid, uuid, text, text),
    public.admin_giveaway_save(uuid, jsonb), public.admin_giveaway_seal(uuid), public.admin_giveaway_status(uuid, text, text),
    public.admin_giveaway_delete(uuid), public.admin_giveaway_entries(uuid), public.admin_giveaway_entry(uuid, integer, boolean, text),
    public.admin_giveaway_draw(uuid, integer), public.admin_giveaway_winner(uuid, integer, text, text), public.admin_applications(),
    public.admin_application_update(text, uuid, text, text), public.admin_reports(boolean), public.admin_report_resolve(text, uuid, text),
    public.admin_health(), public.admin_bugs(boolean), public.admin_bug_status(uuid, text), public.admin_log_list(bigint);
  drop trigger if exists reports_new_open on public.reports;
  drop function if exists public.reports_new_open();
  drop index if exists public.reports_unresolved;
  alter table public.reports drop column if exists resolved_at, drop column if exists resolution, drop column if exists resolved_by;
  alter table public.career_interest drop column if exists notes;
  -- The events tables as 20261029160300 left them
  grant insert, update, delete on table public.competitions, public.competition_results, public.giveaways to authenticated;
  grant update on table public.competition_entries, public.giveaway_entries, public.giveaway_winners to authenticated;
  grant execute on function public.competition_finalise(uuid), public.giveaway_seal(uuid), public.giveaway_draw(uuid, integer) to authenticated;
  create policy "competitions: admin manages" on public.competitions for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
  create policy "competition entries: admin manages" on public.competition_entries for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
  create policy "competition results: admin manages" on public.competition_results for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
  create policy "giveaways: admin manages" on public.giveaways for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
  create policy "giveaway entries: admin marks invalid" on public.giveaway_entries for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
  create policy "giveaway winners: admin manages" on public.giveaway_winners for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
  ```
- **Deploy order on undo:** put the previous site build back first. `/admin` calls these functions; without them each
  section says it couldn't load, and nothing traders use changes. Then run this SQL, then 24's.

## 26. 20261031160000_crypto_world.sql (the crypto world, phase 1)

- **Not in the Coming soon release.** That build shows Crypto as Coming soon and touches nothing below; this file is
  applied only on the day crypto goes live (with `CRYPTO_LIVE = true` in `src/crypto/worlds.js`).
- **Makes:**
  - columns `accounts.world` (default `markets`) and `accounts.quote_ccy`; `trades.world` (default `markets`),
    `trades.leverage`, `trades.funding`, `trades.fee_maker`, `trades.fee_taker` and `trades.liq_price`;
    `daily_plans.world` (default `markets`), with the key changed to `(user_id, world, day)`;
  - the index `trades_user_world_time`;
  - the table `crypto_settings` (own rows; paid add and change, like daily_plans);
  - the triggers `accounts_world_fixed` (accounts) and `trades_by_account_world` (trades);
  - `hyperliquid` added to `connections_platform_check`;
  - the function `crypto_public()`: the one switch for whether crypto trades show on the boards, in competitions
    and on trade cards (true). To hide crypto there without undoing anything, replace it with `select false` and
    set `CRYPTO_PUBLIC = false` in `src/crypto/public.js`.
- **Replaces** (snapshot each with `pg_get_functiondef` first): `trades_guard()`, `sync_commit(...)`,
  `discipline_days(jsonb, date, date)`, `enter_competition(uuid, uuid, text)` and `trade_card(uuid, jsonb, boolean)`.
  Each is the live version (checked 31 Oct 2026: unchanged since 20261029160000 to 20261029180000) with only the
  crypto lines added: `discipline_days` and `trade_card` read `crypto_public()`, `enter_competition` also takes a
  Hyperliquid wallet as the broker, and `trade_card` puts the trade's world on the card.
- **Existing rows:** every account, trade and plan becomes `markets` through the defaults. Nothing else changes.
- **Undo** (this deletes the crypto world: crypto plans and rules, the crypto numbers on trades, and which accounts are
  crypto; export crypto trades first if there are any):
  ```sql
  drop trigger if exists accounts_world_fixed on public.accounts;
  drop trigger if exists trades_by_account_world on public.trades;
  drop function if exists public.accounts_world_fixed(), public.trades_by_account_world();
  drop table if exists public.crypto_settings;
  delete from public.connections where platform = 'hyperliquid';
  alter table public.connections drop constraint connections_platform_check;
  alter table public.connections add constraint connections_platform_check check (platform = any (array['topstepx', 'ibkr']));
  delete from public.daily_plans where world <> 'markets';
  alter table public.daily_plans drop constraint daily_plans_pkey;
  alter table public.daily_plans add constraint daily_plans_pkey primary key (user_id, day);
  alter table public.daily_plans drop column world;
  drop index if exists public.trades_user_world_time;
  alter table public.trades drop column world, drop column leverage, drop column funding, drop column fee_maker,
    drop column fee_taker, drop column liq_price;
  alter table public.accounts drop column world, drop column quote_ccy;
  ```
  Then restore the five replaced functions from the snapshot, in the same transaction (`trades_guard` and
  `sync_commit` name the dropped columns), and only then `drop function if exists public.crypto_public();`.
  Competition entries made with a Hyperliquid wallet keep `broker_platform = 'hyperliquid'`: withdraw or finish
  those competitions first.
- **Deploy order on undo:** put the previous app build and the previous topstepx and ibkr functions back first, delete
  the hyperliquid function, then run the SQL. The previous build never reads the new columns.

## 28. 20261031180000_account_firm_plan.sql (prop firm rules per account)

- **Before applying:** nothing to snapshot. It adds two nullable columns to `public.accounts` with their checks;
  the existing row level security ("own accounts") and table grants cover them.
- **Makes:** `accounts.firm_plan` (the firm rule set, e.g. `topstep.trading-combine.50k`) and `accounts.firm_phase`
  (its stage, e.g. `evaluation`, `funded:consistency`), and the checks `accounts_firm_plan_check` and
  `accounts_firm_phase_check`.
- **Undo (SQL):**
  ```sql
  alter table public.accounts drop column if exists firm_phase, drop column if exists firm_plan;
  ```
- **Deploy order on undo:** put the previous app build back first; the new one sends `firm_plan` from the account form
  once a trader picks a plan, which fails without the column. Then run the SQL. Only the traders' picked plans are
  lost; the rules themselves ship with the app.

## 27. 20261031170000_crash_reports.sql (crash alerts, first-party)

- **Undo:**
  ```sql
  select cron.unschedule(j) from unnest(array['crash-digest', 'crash-reports-purge']) as j where exists (select 1 from cron.job where jobname = j);
  drop function if exists public.crash_report_save(text, uuid, jsonb), public.crash_cron_ok(text), public.crash_digest(),
    public.crash_reports_purge(), public.crash_clean(text, integer);
  drop table if exists public.crash_report_hits;
  drop table if exists public.crash_reports;
  delete from vault.secrets where name in ('crash_pepper', 'crash_digest_cron');
  ```
- **Deploy order on undo:** delete the crash-report function first. The app can stay: its sends fail quietly.

## 29. 20261031170100_funnel_counts.sql (trial funnel, first-party)

- **Undo:**
  ```sql
  drop function if exists public.funnel_report(integer), public.funnel_step(text), public.funnel_cap(text);
  drop table if exists public.funnel_counts;
  ```
- **The site and app can stay:** their counts fail quietly, and Admin's funnel says it isn't set up.

## 30. 20261031170200_search_posts.sql (the search box: Community posts)

- **Undo:** `drop function if exists public.search_posts(text, integer);`
- **The app can stay:** the search box just shows no posts. Trades, Study and messages are searched on the device.

## 31. 20261101100000_showcase_look.sql (the Showcase's look, with the private profile)

- **Undo:**
  ```sql
  alter table public.profile_private drop column if exists showcase;
  ```
  This loses the looks saved there; each device still has its own copy.
- **The app can stay:** with no column it keeps every look on the device and sends nothing.

## 32. 20261101110000_free50.sql (first 50 free)

- **Before applying:** snapshot `pg_get_constraintdef` for the checks on `public.access_grants` (source) and
  `public.form_rate_hits` (kind); this file replaces both. On 31 Oct 2026 they were `check (source in ('code'))` and
  the eight forms kinds listed in the undo SQL below.
- **Makes:**
  - the table `free50_claims` (RLS on, no policies, no grants), its index `free50_claims_live_seat` and `free50_claims_at`;
  - the functions `free50_throwaway`, `free50_status` (anon may call it), `free50_claim` (service role only),
    `my_free50`, `admin_free50_claims` and `admin_free50_revoke`.
- **Replaces:** the source check on `access_grants` (now `'code'` or `'free50'`) and the kind check on
  `form_rate_hits` (one more kind, `'free50:ip'`). `has_access_for`, `my_billing` and `founders_seats_taken` are not touched:
  a free seat is an ordinary grant for good, and never a founders' seat.
- **Test (rolled back, changes nothing):** run `supabase/tests/20261101110000_free50.test.sql` in the SQL editor. It ends
  with `ERROR: RESULTS 18 checks passed:` and one line per check; any other error names the check that failed.
- **Undo (SQL).** Taking the free seats away ends those traders' free access, so export `free50_claims` and the
  `free50` grants first. To undo but **keep** their access, run the `update` line and skip the `delete`.
  ```sql
  drop function if exists public.admin_free50_revoke(uuid, text), public.admin_free50_claims(), public.my_free50(),
    public.free50_claim(uuid, text), public.free50_status(), public.free50_throwaway(text);
  drop table if exists public.free50_claims;
  -- Either keep the 50 traders' access as gift-code lifetime:
  -- update public.access_grants set source = 'code' where source = 'free50';
  -- or end it:
  delete from public.access_grants where source = 'free50';
  alter table public.access_grants drop constraint if exists access_grants_source_check;
  alter table public.access_grants add constraint access_grants_source_check check (source in ('code'));
  comment on table public.access_grants is 'Free access from a redeemed gift code: until a date, or for good (until null). Read by has_access_for().';
  delete from public.form_rate_hits where kind = 'free50:ip';
  alter table public.form_rate_hits drop constraint if exists form_rate_hits_kind_check;
  alter table public.form_rate_hits add constraint form_rate_hits_kind_check
    check (kind in ('partner:ip', 'partner:email', 'partner:all', 'partner:verified',
                    'career:ip', 'career:email', 'career:all', 'career:verified'));
  ```
- **Deploy order on undo:** set `FREE50_LIVE = false` and put that site build up first (the chain, the tag, the plan
  screen's card, the terms line and the FAQ answer all go), delete the free50 function, then run the SQL. A build with
  the switch on but no `free50_status` shows nothing either: the count can't be read, so the offer stays hidden.

## 33. 20261102100000_backdrop.sql (the background behind the light theme, and a trader's own photo)

- **Makes:** the column `profile_private.backdrop` (jsonb, at most 1 KB) with its column grants; the private bucket
  `backdrops` (3 MB, JPEG only); the storage policies "backdrops: owner reads", "backdrops: owner writes" (own folder,
  a plain `<uid>/<name>.jpg`, at most four files), "backdrops: owner deletes" and the restrictive "backdrops: paid uploads".
- **Replaces:** nothing.
- **Undo (SQL).** Empty the bucket first (Dashboard → Storage → backdrops, or delete-account's way), since a bucket with
  files in it can't be deleted:
  ```sql
  drop policy if exists "backdrops: owner reads" on storage.objects;
  drop policy if exists "backdrops: owner writes" on storage.objects;
  drop policy if exists "backdrops: owner deletes" on storage.objects;
  drop policy if exists "backdrops: paid uploads" on storage.objects;
  delete from storage.buckets where id = 'backdrops';
  alter table public.profile_private drop column if exists backdrop;
  ```
  This loses the choices saved there; each device still has its own copy.
- **The app can stay:** with no column it keeps the choice on the device, sends nothing, and doesn't offer "Your own photo".
  delete-account can stay too: listing a bucket that isn't there just finds no files.

## 34. 20261102120000_admin_two_step.sql (admin money and funnel need two-step sign-in; no picture on anonymous posts)

- **Makes:** nothing new.
- **Replaces:** `admin_payouts_due()`, `admin_mark_paid(uuid)` and `funnel_report(integer)`, whose first line was
  `if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;` and is now
  `perform public.admin_gate();` (admin and two-step, the same gate as every other admin screen); and `feed(...)`, whose
  picture column was `p.image_url` and is now `case when p.anonymous then null else p.image_url end`. Nothing else in
  the four bodies changes (checked against the live definitions on 2 November 2026).
- **Undo (SQL).** Run the migration file again with those four lines put back: each `perform public.admin_gate();`
  replaced by the `is_admin()` line above, and the feed's `case when p.anonymous then null else p.image_url end`
  replaced by `p.image_url`.
- **The app can stay:** Payouts and the funnel reload after two-step either way, and with the old functions they
  simply don't need it.

## 35. 20261103100000_admin_rework.sql (the admin area reworked: referral tracking, partner deals, users, money)

- **Makes:** the tables `referral_aliases`, `ref_clicks`, `referral_claims`, `referral_terms`, `active_days` and
  `admin_costs`; the column `access_grants.note`; the function and trigger `referral_alias_hold` (an earlier code
  that's deleted is held 90 days in `handle_holds`); the functions `referrer_of`, `ref_click`, `my_referral_terms`,
  `my_ref_clicks`, `seen`, `admin_whoami`, `admin_stripe_note`, `admin_users`, `admin_activity`, `admin_grant_access`,
  `admin_grant_revoke`, `admin_paying`, `admin_referrals`, `admin_referrer`, `admin_referral_claims`,
  `admin_ref_lookup`, `admin_referral_code_set`, `admin_referral_terms_set`, `admin_commission_review`,
  `admin_payouts`, `admin_finance`, `admin_cost_save`, `admin_cost_delete` and `admin_purge`; the cron job `admin-purge`.
  Member numbers: the table `members`, the sequence `member_no_seq`, the columns `profiles.member_no` and
  `profiles.show_number`, the function and trigger `profiles_number`. Owner emails: the table `owner_alerts`, the
  functions `owner_alert`, `owner_alert_profile`, `owner_alert_subscription`, `owner_alert_lifetime`,
  `owner_alerts_cron_ok`, `owner_alerts_due` and `owner_alerts_done`, a trigger `owner_alert` on each of `profiles`,
  `subscriptions` and `lifetime_purchases`, the vault secret `owner_alerts_cron` and the cron job `owner-alerts`.
- **Replaces:** `claim_referral(text)` and `stripe_record_commission(...)` (both last set by 20261029180300; the new
  ones read custom codes and a partner's own rate and months, and claim_referral logs every try), `admin_trader(uuid)`
  (20261031150100; it gains last active, the referrer, the code and deal, and each gift's id and note), and the
  `access_grants_source_check` constraint, which was `check (source in ('code', 'free50'))` (20261101110000). Also
  `profiles_guard()`, `handle_free_for(text, uuid)` and `create_profile_for(uuid)`, whose bodies before this are below
  (copied from the live database on 2 Nov 2026; profiles_guard and handle_free_for aren't in any file here).
- **Undo (SQL).** This also deletes free access given in the admin area (the old constraint has no 'admin'), so those
  traders lose it; give them a gift code first if they should keep it:
  ```sql
  select cron.unschedule('admin-purge');
  select cron.unschedule('owner-alerts');
  drop trigger if exists owner_alert on public.profiles;
  drop trigger if exists owner_alert on public.subscriptions;
  drop trigger if exists owner_alert on public.lifetime_purchases;
  drop trigger if exists profiles_number on public.profiles;
  drop function if exists public.owner_alerts_done(bigint[], bigint[]), public.owner_alerts_due(), public.owner_alerts_cron_ok(text),
    public.owner_alert_lifetime(), public.owner_alert_subscription(), public.owner_alert_profile(),
    public.owner_alert(text, text, uuid), public.profiles_number();
  drop table if exists public.owner_alerts;
  delete from vault.secrets where name = 'owner_alerts_cron';
  drop function if exists public.admin_purge(), public.admin_cost_delete(uuid), public.admin_cost_save(uuid, jsonb),
    public.admin_finance(), public.admin_payouts(), public.admin_commission_review(uuid, text),
    public.admin_referral_terms_set(uuid, numeric, integer, boolean, text), public.admin_referral_code_set(uuid, text),
    public.admin_ref_lookup(text), public.admin_referral_claims(boolean), public.admin_referrer(uuid),
    public.admin_referrals(), public.admin_paying(jsonb), public.admin_grant_revoke(uuid),
    public.admin_grant_access(uuid, integer, text), public.admin_activity(), public.admin_users(text, text, text, integer),
    public.admin_stripe_note(text, text, jsonb), public.admin_whoami(), public.seen(), public.my_ref_clicks(),
    public.my_referral_terms(), public.ref_click(text);
  ```
  Then the three functions as they were:
  ```sql
  create or replace function public.profiles_guard()
  returns trigger language plpgsql security definer set search_path = ''
  as $$
  begin
    if tg_op = 'UPDATE' then
      if new.handle is distinct from old.handle then
        if (public.handle_reserved(new.handle) and not public.is_admin()) or not public.handle_free_for(new.handle, new.id) then
          raise exception 'That handle isn''t available' using errcode = '23505';
        end if;
        insert into public.handle_holds (handle, user_id, released_at) values (old.handle, old.id, now())
          on conflict (handle) do update set user_id = excluded.user_id, released_at = excluded.released_at;
      end if;
      new.referral_code := coalesce(old.referral_code, new.handle);
      new.id := old.id;
      new.created_at := old.created_at;
      return new;
    end if;
    -- An account that's gone: its handle and code are held, so nobody inherits its old links
    insert into public.handle_holds (handle, user_id, released_at) values (old.handle, old.id, now())
      on conflict (handle) do update set released_at = excluded.released_at;
    if old.referral_code is not null and old.referral_code <> old.handle then
      insert into public.handle_holds (handle, user_id, released_at) values (old.referral_code, old.id, now())
        on conflict (handle) do update set released_at = excluded.released_at;
    end if;
    return old;
  end $$;

  create or replace function public.handle_free_for(h text, p_user uuid)
  returns boolean language sql stable security definer set search_path = ''
  as $$
    select h is not null
      and not exists (select 1 from public.profiles p where (p.handle = h or p.referral_code = h) and p.id is distinct from p_user)
      and not exists (select 1 from public.handle_holds x where x.handle = h and x.user_id is distinct from p_user and x.released_at > now() - interval '90 days')
  $$;
  ```
  and the `create_profile_for` block of 20261029180100 again (the live body matched it on 2 Nov 2026). Then:
  ```sql
  alter table public.profiles drop column if exists member_no, drop column if exists show_number;
  drop table if exists public.members;  -- takes member_no_seq with it
  ```
  Then run the `claim_referral` and `stripe_record_commission` blocks of 20261029180300 and the `admin_trader` block of
  20261031150100 again (their old bodies), and only then:
  ```sql
  drop function if exists public.referrer_of(text);
  drop table if exists public.admin_costs, public.active_days, public.referral_terms, public.referral_claims,
    public.ref_clicks, public.referral_aliases;  -- drops the referral_alias_hold trigger; holds it made stay (90 days)
  drop function if exists public.referral_alias_hold();
  delete from public.access_grants where source = 'admin';
  alter table public.access_grants drop constraint access_grants_source_check;
  alter table public.access_grants add constraint access_grants_source_check check (source in ('code', 'free50'));
  alter table public.access_grants drop column if exists note;
  ```
  Undoing loses: link clicks, the claims record, active days, partner deals (everyone goes back to 30% for 12 months),
  costs and member numbers (a later redo numbers accounts again by join date, so they come back the same). A partner given a custom code keeps it; their earlier codes stop working.
- **The app can stay a while:** `ref_click` and `seen` failing are caught and ignored, and Refer and earn falls back to
  the standard terms. The admin area's new screens show their error box until the site is rolled back too.

## 36. 20261103110000_admin_fk_indexes.sql (an index on each account link the admin rework added)

- **Makes:** the indexes `owner_alerts_user`, `referral_aliases_user` and `referral_claims_user` (each on `user_id`).
- **Replaces:** nothing.
- **Undo (SQL):**
  ```sql
  drop index if exists public.owner_alerts_user, public.referral_aliases_user, public.referral_claims_user;
  ```
- **The app can stay:** nothing names them; without them, deleting an account just reads those three tables in full.

## 37. 20261103120000_playbook_chapters.sql (the playbook's chapters: why it works, when it's run)

- **Makes:** the columns `strategies.thesis` and `strategies.run_when` with their checks, the grants on them, and
  two size checks on what was there: `strategies_name_check` and `strategies_rules_size_check`.
- **Replaces:** nothing.
- **Undo (SQL):**
  ```sql
  alter table public.strategies
    drop constraint if exists strategies_rules_size_check,
    drop constraint if exists strategies_name_check,
    drop column if exists run_when,
    drop column if exists thesis;
  ```
- **The app can stay:** it asks whether the columns exist on every load; without them, each trader's chapter words
  stay on their own device, as before the migration.

## 38. 20261104100000_drip_closes_cards_stage.sql (daily closes, stage lock, where a payout came from)

- **Makes:** the table `public.closes` and its two policies, the trigger and function `lock_account_kind`, the column
  `prop_money.source`.
- **Replaces:** nothing.
- **Undo (SQL):** the table holds traders' closes, so copy it first if anyone has used it.
  ```sql
  drop trigger if exists accounts_lock_kind on public.accounts;
  drop function if exists public.lock_account_kind();
  alter table public.prop_money drop column if exists source;
  alter table public.closes set schema retired;
  ```
- **The app can stay:** closes also live on the device, so a trader only loses them across phones.

`20261104100500_drip_verified_cards_held.sql` is held back on purpose: nothing calls it while `MONEY_CARDS` is off.

## 39. 20261104130000_welcome_email.sql (one welcome email in place of the trial emails)

- **Makes:** `welcome_email_cron_ok`, `welcome_email_candidates`, the vault secret `welcome_email_cron`, the job
  `welcome-email`, and the kind `welcome` on `email_events`.
- **Replaces:** the job `trial-emails`, `trial_email_candidates`, `trial_emails_cron_ok`. Their definitions are in
  `retired.before_free`.
- **Undo (SQL):** the steps are in the header of that file.
- **The app can stay:** nothing in it calls these.

## 40. 20261104140000_always_free_step_one.sql (every signed-in user has everything)

- **Makes:** the schema `retired` and the table `retired.before_free`, which holds a copy of every public function and
  every public and storage policy as they were on 4 November 2026.
- **Replaces:** `has_access_for`, now true for anyone signed in. Drops every RESTRICTIVE policy that named it.
- **Undo:** put `has_access_for` back from `retired.before_free`, then recreate each policy from the same table (the
  row's `definition` is a JSON note of its roles, command, using and check). There is no reason to undo this with the
  paid code gone from the app.

## 41. 20261104150000_always_free_step_two.sql (the paid code comes off the server)

Apply only once the new app is live: the old app calls what this removes.

- **Makes:** nothing in `public`.
- **Replaces:** the plan checks in voice, DMs, crews, share pages and the admin functions, as listed in the file.
- **Moves:** 18 tables to `retired`, with their rows: `subscriptions`, `customers`, `lifetime_purchases`, `trial_uses`,
  `commissions`, `payouts`, `payout_settings`, `referrals`, `referral_aliases`, `referral_claims`, `referral_terms`,
  `ref_clicks`, `free50_claims`, `access_grants`, `gift_codes`, `payment_disputes`, `stripe_events`, `funnel_counts`.
- **Copies then drops:** `profiles.referral_code` and `profile_private.referred_by`, kept in `retired.profile_referrals`.
- **Removes:** about 55 paid functions, all saved in `retired.before_free`. `has_access_for` stays, always true for anyone
  signed in, because the deployed `topstepx` and `ibkr` functions still ask it. It can go when those two are next deployed.
- **Undo a table (SQL):** `alter table retired.<name> set schema public;`
- **Undo a function:** run its `definition` from `retired.before_free`:
  ```sql
  select definition from retired.before_free where kind = 'function' and name like 'public.%<name>%';
  ```
- **Nothing is destroyed.** The file is one transaction, and its last check stops the lot if any public function still
  mentions a paid thing.

## 42. Functions retired on 4 November 2026

`create-checkout`, `stripe-webhook`, `customer-portal`, `stripe-setup`, `admin-stripe`, `free50`, `trial-emails`,
`partner-apply` and `career-interest` now answer 410 Gone. There is no delete tool, so they can be deleted from the
dashboard. The earlier code for each is in git history before this commit. `partner-apply` and `career-interest` keep
their source in the repo for the rework.

## 43. 20261105200000_security_batch.sql (applied 5 November 2026)

Owner: "Yes, apply it". Nothing in it reads or changes a trade.

- **Makes:** cron job `cron-history-purge`; checks `trades_sizes`, `profiles_sizes`, `plans_sizes`, `private_sizes`,
  `imports_sizes`, `trades_numbers_real`, `accounts_balance_real`, `accounts_kind_ok` (all not valid, so old rows are left
  alone); functions `storage_room`, `admin_aal2`, `closes_stamp`, `retired.referral_forget`; storage policies
  "files: 200MB each" and "study: plain paths"; a foreign key and trigger on `retired.profile_referrals`; trigger
  `closes_stamp`; indexes `rate_events_at` and `posts_feed_top`.
- **Changes:** 21 policies in `public` and `storage` now ask `admin_aal2()` where they asked `is_admin()`. Public names
  that matched the private full name became the handle (5 profiles, 4 changed). New tables and functions made by
  `postgres` start with no grants: write them out.
- **Did nothing:** the three `net` revokes. Those grants belong to `supabase_admin`. Check that `net` isn't in the API's
  exposed schemas (dashboard, API settings).
- **Undo (SQL):**
  ```sql
  select cron.unschedule('cron-history-purge');
  alter table public.trades drop constraint trades_sizes, drop constraint trades_numbers_real;
  alter table public.profiles drop constraint profiles_sizes;
  alter table public.daily_plans drop constraint plans_sizes;
  alter table public.profile_private drop constraint private_sizes;
  alter table public.imports drop constraint imports_sizes;
  alter table public.accounts drop constraint accounts_balance_real, drop constraint accounts_kind_ok;
  drop policy "files: 200MB each" on storage.objects; drop policy "study: plain paths" on storage.objects;
  drop trigger closes_stamp on public.closes; drop function public.closes_stamp();
  drop trigger referral_forget on retired.profile_referrals; drop function retired.referral_forget();
  alter table retired.profile_referrals drop constraint profile_referrals_user;
  drop index public.rate_events_at; drop index public.posts_feed_top;
  ```
  Policies: run the same loop with `replace(qual, 'admin_aal2()', 'public.is_admin()')`, then drop `admin_aal2` and
  `storage_room`. Names: `update public.profiles p set name = pp.full_name from public.profile_private pp where pp.id = p.id
  and p.name = p.handle::text;` (only if the owner asks: it puts real names back in public).

## 44. 20261105210000_post_money_and_cards.sql (applied 5 November 2026)

- **Makes:** column `posts.card` with check `posts_card_ok`, and select and insert grants on it.
- **Replaces:** `trade_card` (adds `pnl` and `stage`), `anon_card` (nulls `pnl`), `posts_before_write` (cleans a card),
  `feed` (dropped and made again with a `card` column; its grants are written out).
- **Order:** before the app build with `POST_MONEY = true`. The older app ignores the new fields.
- **Undo:** set `POST_MONEY = !LIVE` in `src/mode.js`, put `onPost` back behind `LIVE` in `src/drip/floor/Cards.jsx` and
  deploy. Then, if wanted, restore the four functions from `20261029160000_community_1_crews_and_feed.sql` and
  `20261030100000_dms_and_sharing.sql` and `alter table public.posts drop column card;` (that removes posted cards).
- **Crypto:** `20261031160000_crypto_world.sql` redefines `trade_card`. Carry `pnl` and `stage` across before applying it.

## 45. 20261106120000_floor_days.sql (applied 6 November 2026)

- **Makes:** function `floor_days(text[])`, signed-in traders only, a count of closed days per handle. `closes` and its policies don't change.
- **Order:** before the app build that calls it. The older app ignores it, and the app shows names alone if it's missing.
- **Undo:** `drop function public.floor_days(text[]);` The rail falls back to names alone with no deploy.

## 47. 20261106140000_two_step_for_traders.sql (applied 6 November 2026)

- **Makes:** function `two_step_ok()` and a restrictive policy "two-step: code passed" on 15 private tables.
- **Order:** after the app build with the code screen is live. An older app would show a trader with a code app an empty journal.
- **Undo:** for each table, `drop policy "two-step: code passed" on public.<table>;`, then `drop function public.two_step_ok();` No deploy needed.

## 46. 20261106130000_trade_mistakes.sql (applied 6 November 2026)

- **Makes:** column `trades.mistakes` (text array, empty by default) and constraint `trades_mistakes_size`.
- **Order:** before the app build that sends `mistakes`. The older app ignores the column.
- **Undo:** deploy an app without `mistakes` in `tradeOut` first, then `alter table public.trades drop column mistakes;` (that removes the tags).

## 48. 20261107100000_pinned_posts.sql (applied 7 November 2026)

- **Makes:** column `posts.pinned_at` and index `posts_pinned`, function `feed_pinned()` (signed-in traders) and function
  `pin_post(uuid, boolean)` (admins with two-step, written to the admin log). `feed` and the post policies don't change.
- **Order:** either way round. The app treats a missing `feed_pinned` as no pinned posts, and the pin only shows to an admin.
- **Tried:** 7 November 2026 on production in a rolled-back transaction: an admin with two-step pinned a post, a trader saw it,
  a reply couldn't be pinned, a trader couldn't pin or set the column, and an admin without two-step was refused.
- **Undo:** `drop function public.pin_post(uuid, boolean); drop function public.feed_pinned(); alter table public.posts drop column pinned_at;`
  (that removes the pins, not the posts).

## 49. 20261107110000_admin_suspended.sql and function `admin-account` (applied and deployed 7 November 2026, function v1)

- **Makes:** `admin_trader` returns `suspended_until` too (from `auth.users.banned_until`); nothing else in it changes. The new
  function `admin-account` (verify_jwt on) suspends, lifts a suspension or deletes another trader's account, for an admin with
  two-step only, never their own or another admin's, with the handle typed back to delete. It writes `user.suspend`,
  `user.unsuspend` or `user.delete` to `admin_log` before acting. The deleting steps are in `_shared/wipe-account.ts`, the same
  as `delete-account`, which is unchanged.
- **Order:** the migration and the function before the app build with the buttons. The older admin ignores the new key.
- **Tried:** 7 November 2026 on production in a rolled-back transaction: the key is null for an account that can sign in, set for a
  suspended one, and a trader calling `admin_trader` is refused.
- **Undo:** deploy an admin without the buttons, delete the `admin-account` function, and run the same `admin_trader` without the
  `suspended_until` line (the live one before this is in `20261104150000_always_free_step_two.sql`). A suspension already made stays until lifted: in the dashboard, or
  `update auth.users set banned_until = null where id = '<id>';`. A deleted account can't be brought back.

## 50. 20261107120000_admin_today.sql (applied 7 November 2026)

- **Makes:** five read functions and one write for the admin area, each opening with `admin_gate()` (an admin with two-step):
  `admin_today()` (how far traders get: signed up, logged a trade, closed a day, came back; the newest 30; running costs a month;
  welcome emails; crashes), `admin_floor()` (pinned and recent posts, every idea with its votes), `admin_crashes()` (30 days of
  crash reports, one row per crash), `admin_costs()` (the running costs list) and `admin_idea_status(id, status)`, which sets an
  idea to Under review, Planned, In progress or Shipped and writes `idea.status` to `admin_log`. `admin_overview()` also counts
  crashes in the last 24 hours and ideas waiting for a status. Steps only: nothing reads what anyone traded or made.
- **Order:** the migration before the admin build with Today, Floor and Crashes. The admin live now doesn't call any of these.
- **Tried:** 7 November 2026 on production in a rolled-back transaction: the funnel and newest list come back, crashes group,
  a status change works and is logged, and a trader calling them is refused.
- **Undo:** deploy the admin build before this one, then
  `drop function public.admin_today(), public.admin_floor(), public.admin_crashes(), public.admin_costs(), public.admin_idea_status(uuid, text);`
  and run `admin_overview` as it is in `20261104150000_always_free_step_two.sql`. Idea statuses already changed stay as set.

## 51. 20261107130000_admin_log_server_insert.sql (applied 7 November 2026)

- **Makes:** the server key can add rows to `admin_log`, so `admin-account` can log a suspend, lift or delete before doing it.
  It still can't read, change or remove a row.
- **Why:** before this, every Suspend and Delete in the admin failed at the log step (`admin log 403`) and nothing was changed.
- **Tried:** 7 November 2026 on production in a rolled-back transaction: as `service_role` an insert works and an update is refused.
- **Undo:** `revoke insert on table public.admin_log from service_role;` (Suspend and Delete stop working again).

## 52. Data change, no migration file: @jules is member #1 (done 7 November 2026)

- **Did:** `members.no` for @jules from 3 to 1, then refreshed the profile's copy (`member_no`) through the guard with
  `profiles_touch` off, so their "last updated" time didn't move. #1 and #2 had belonged to test accounts since deleted.
  The sequence is untouched: new accounts still get 8 and up, and 3 is now free and never given again.
- **Tried:** the same steps on production in a rolled-back transaction first.
- **Undo:** `update public.members set no = 3 where user_id = (select id from public.profiles where handle = 'jules');` then the
  same profile refresh (owner, 7 Nov 2026: "can u give me the #1 as mine for some reason is 3").
