# LeadWell cutover: Vercel/Supabase → Cloudflare/Neon

Phil is the only user. Vercel and the Supabase project **LeadWell** stay
intact. This runbook is the cutover, not a delete.

Realtime publication is on in Supabase. The app never calls
`supabase.channel` / `.subscribe()`, so realtime is dropped. No Worker
equivalent is shipped.

There are no crons, storage buckets, payments, or a custom domain.

---

## Env vars and secrets (names only)

Never put values here.

### Worker / wrangler secrets

| Name | Where | Notes |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | wrangler secret | Session signing. Generate a long random string. |
| `BETTER_AUTH_URL` | wrangler var | Public Worker origin. Required in preview/prod. Unset is allowed only when `ENVIRONMENT=local`. |
| `ENVIRONMENT` | `.dev.vars` only | Set to `local` on your laptop. Omit in preview/prod. |
| `GOOGLE_CLIENT_ID` | wrangler secret | Same Google OAuth web client, new redirect URI. |
| `GOOGLE_CLIENT_SECRET` | wrangler secret | Same Google client. |
| `ANTHROPIC_API_KEY` | wrangler secret | Server-side Claude key. The client must never send it. |
| `ANTHROPIC_MODEL` | wrangler var | Optional. Defaults to `claude-sonnet-4-20250514`. |
| `DATABASE_URL` | wrangler secret | Neon connection string. Used when Hyperdrive is unset (preview / local). |
| `HYPERDRIVE` | wrangler binding | Workers Paid. Replace the placeholder id in `wrangler.jsonc` before production deploy. Local uses `localConnectionString`. |

### Client (Vite)

| Name | Where | Notes |
| --- | --- | --- |
| `VITE_DEV_TEST_EMAIL` | `.env.local` | Dev-only email/password button. Compiled out of production. |
| `VITE_DEV_TEST_PASSWORD` | `.env.local` | Same. |
| `VITE_DEMO` | build env | `1` for the offline sample-org build. |
| `LEADWELL_WORKER_ORIGIN` | `.env.local` | Optional Vite proxy target. Defaults to `http://127.0.0.1:8787`. |

### Migration script (laptop, once)

| Name | Notes |
| --- | --- |
| `SUPABASE_DB_URL` | Read-only Postgres URI for the LeadWell project. The script only `pg_dump`s / `COPY`s. |
| `NEON_DB_URL` | Empty Neon database. The script writes here. |
| `LEADWELL_MIGRATE_TEST` | Set to `1` in prove/CI so both URLs must be loopback. Do **not** set this for the live Phil cutover. |
| `PG_BIN` | Optional directory containing `pg_dump` / `pg_restore` matching the source major. |

Do not put `SUPABASE_DB_URL` or `NEON_DB_URL` in CI except the loopback prove URLs.

---

## Local

```sh
cp .env.example .env.local
cp .dev.vars.example .dev.vars
# fill names from the tables above
npm install
# terminal 1
npx wrangler dev
# terminal 2
npm run dev
```

Or `npm run cf:dev` after a Vite build (Worker serves `dist` + `/api`).

Apply `worker/schema/001_leadwell.sql` then `002_better_auth.sql` to a local
Postgres or Neon branch before signing in.

---

## Data migration (source is read-only)

Dry-run with no URLs (prints the contract, writes nothing):

```sh
node scripts/migrate-supabase-to-neon.mjs --dry-run
```

Expected output:

```
dry-run: would pg_dump public + auth.users + auth.identities from SUPABASE_DB_URL (read-only)
dry-run: would abort before any Neon write if an email is blank or lower(email) is duplicated
dry-run: would refuse a non-empty target (any user table/function/enum/type in public or auth)
dry-run: would CREATE EXTENSION IF NOT EXISTS pgcrypto, then stub auth.users + auth.uid() on NEON_DB_URL
dry-run: would pg_restore --exit-on-error with EXTENSION entries filtered out
dry-run: would insert auth.users into Better Auth "user" (same ids) and Google identities into account
dry-run: would compare per-table row counts and content hashes and abort on mismatch
tools required: pg_dump, pg_restore, psql
```

Live cutover (Phil, by hand — not a test, so loopback is not required):

```sh
SUPABASE_DB_URL=postgres://… NEON_DB_URL=postgres://… \
  node scripts/migrate-supabase-to-neon.mjs
```

`--dry-run` with both URLs set still dumps from Supabase (read-only) and
prints row counts; it does not write to Neon.

The script:

1. `pg_dump`s `public` (no-owner, no-acl) from Supabase.
2. `COPY`s `auth.users` and `auth.identities`.
3. Aborts on blank or case-insensitive-duplicate emails.
4. Refuses a non-empty Neon target.
5. Creates `pgcrypto`, stub `auth.users` / `auth.uid()`, restores public.
6. Inserts Better Auth `"user"` rows with the **same UUIDs**.
7. Maps Google identities → `account` (`provider_id = google`).
8. Compares per-table `COUNT(*)` and `md5` of every row. Aborts on mismatch.
9. On failure, drops only objects this run created on Neon. Supabase is never
   modified.

Email/password hashes from GoTrue are not portable. Phil's login path is
**Google**, linked by the mapped UUID + Google `account` row. Email/password
remains available for a new test user or a password reset after cutover.

---

## Cutover

1. Create a Neon project (free tier). Leave it empty.
2. Create a Cloudflare Worker (`leadwell`) with Workers static assets.
   Hyperdrive is Workers Paid; preview can use `DATABASE_URL` instead.
3. Set the Worker secrets and `BETTER_AUTH_URL` to the `*.workers.dev` origin.
4. In Google Cloud, add the Better Auth callback to the existing OAuth client:
   `{BETTER_AUTH_URL}/api/auth/callback/google`
   Do not remove the Supabase callback until rollback is no longer needed.
5. Run the migrate script against the empty Neon database.
6. `npm run build && wrangler deploy` (or `--env preview` first).
7. Open the Worker URL. Sign in with Google. Data should be Phil's existing
   org (same `user.id` as the Supabase auth UUID).
8. Smoke-test, then point whatever URL you share at the Worker. There is no
   custom domain today — flipping the shared URL is the cutover.

Vercel stays deployed. Supabase stays live. Nothing is deleted.

---

## Smoke tests

- `GET /api/health` → `{ ok: true, service: "leadwell", realtime: false }`
- Signed-out `/` still shows the marketing landing.
- Google sign-in returns to the app; the org loads (people, meetings, prayer).
- An edit syncs (chrome leaves "saving"); reload keeps it.
- Dev-only: email/password test user if `VITE_DEV_*` is set.
- `POST /api/anthropic` with a signed-in session and no client API key.
  Without `ANTHROPIC_API_KEY` the Worker returns 501; with it, Claude answers.
- Confirm the Supabase dashboard still has the original rows (source untouched).

---

## Rollback

1. Share the Vercel URL again (or restore the previous bookmark). Do not
   delete the Worker.
2. Google still works against Supabase — its redirect URI was never removed.
3. Neon and the Worker can stay; they are unused until you cut over again.
4. Re-migrate later only into a **new empty** Neon database (the script
   refuses a dirty target). Do not write back from Neon to Supabase.

---

## What is not here

- No Cloudflare cron.
- No R2 / storage.
- No payments.
- No custom domain.
- No Supabase realtime replacement (unused).
- No deletion of the Vercel project or the LeadWell Supabase project.
