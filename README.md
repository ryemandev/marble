# Marble

Marble is a free trading journal for prop-firm and personal accounts. You log or import trades, see your money by day, week and month, keep daily rules, and share trades with a community of other traders.

This repository holds the whole product: the website, the web app, the admin area and the Supabase backend.

## What's in here

| Folder | What it is |
|---|---|
| `app/src` | The React app: the journal, stats, community, admin area and the marketing site |
| `app/supabase/functions` | Supabase Edge Functions (Deno): email, push, voice rooms, broker imports, admin actions |
| `app/supabase/migrations-pending` | SQL migrations, with `ROLLBACK.md` describing how to undo each one |
| `app/web` | Cloudflare Worker and `wrangler.jsonc` for hosting the built site |
| `app/scripts` | Build, SEO, image and key-generation scripts |
| `app/tests` | Node test suite (`npm test`) |
| `art`, `brand` | Source images and brand assets (see **Images and logos** below) |

## Getting started

You need Node.js 20 or later, a [Supabase](https://supabase.com) project and, to deploy, a Cloudflare account.

```bash
cd app
npm install
cp .env.example .env
npm run dev
```

Then fill in `app/.env` with your own Supabase URL and publishable key.

### Your own keys and settings

This repository contains **no keys**. Everything that pointed at the original deployment has been replaced with a placeholder. Search for these and fill in your own values:

| Placeholder | Where | What to put |
|---|---|---|
| `your-project-ref` | SQL migrations (cron job URLs), `scripts/build-web.mjs`, `public/unsubscribe.js`, `supabase/functions/_shared/email-link.js`, `web/wrangler.jsonc` | Your Supabase project ref |
| `YOUR_SUPABASE_PUBLISHABLE_KEY` | `web/wrangler.jsonc`, `app/.env` | Your Supabase publishable (anon) key |
| `your-domain.example` | `web/wrangler.jsonc` | Your domain |
| `YOUR_INDEXNOW_KEY` | `scripts/seo/indexnow.json` | Optional: an [IndexNow](https://www.indexnow.org) key; also serve it at `public/<key>.txt` |
| `support@example.com` | Emails, error messages, `security.txt` | Your support address |
| `[Your full legal name]`, `[Your business address]` | `src/site/legal/owner.js`, `scripts/seo/site-data.mjs` | Shown in the legal pages |
| `jules` / "Jules" | Founder story, sample data, reserved handles | Your own name and handle (see below) |

Server secrets for the Edge Functions are listed in `app/supabase/functions/.env.example`. Set them with `supabase secrets set`, never in the repo. Scheduled jobs read their shared secrets from Supabase Vault; the list of Vault secret names is at the bottom of that file.

**The owner's handle.** `jules` is a placeholder for the person who runs the site. It is reserved so nobody else can claim it, and messages that claim to come from it are flagged. To use your own, change it in `supabase/functions/_shared/handles.js` and `supabase/migrations-pending/20261029180200_handle_lookalikes.sql` (the two lists must match; `tests/handles.test.js` checks this), and in the `staff_claim` pattern in `src/views/community/dms.js` and `supabase/migrations-pending/20261030100000_dms_and_sharing.sql`.

**Legal pages.** `src/site/legal/` is written for a sole trader in the UK. Have it reviewed and rewritten for your own business and country before you go live.

### Database

The migrations in `app/supabase/migrations-pending` build on a base schema (profiles, accounts, trades, admins and more) that is not in this repository yet, so they will not apply to an empty project on their own. Admin rights come from the `public.admins` table through `public.is_admin()`, and every admin action is checked on the server, never in the browser.

## Tests

```bash
cd app
npm test
```

The broker-import tests in `tests/import.test.js` and `tests/crypto-import.test.js` read sample export files from `app/.scratch/fixtures/`, which aren't in this repository, so those 16 tests fail until you add your own sample files there.

## Deploying

```bash
cd app
npm run build:web
npx wrangler deploy --config web/wrangler.jsonc
```

## Security

Never commit `.env` files, Supabase service role keys, or any other secret: `.gitignore` already excludes them. If you find a security issue, please report it privately rather than in a public issue.

## License

The code is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version of Marble as a service, you must make your changes available to its users under the same license.

### Images and logos

The license covers the code only. Photographs, artwork and images in `art/`, `brand/`, `app/public/art/` and `app/public/site/`, and third-party logos (prop firms, brokers and exchanges) belong to their respective owners and are **not** licensed under the AGPL. Check the rights to any image before you use it, or replace them with your own.
