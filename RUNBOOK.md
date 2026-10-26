# LeadWell cutover: Vercel/Supabase → Cloudflare/Neon

Phil is the only user. Vercel and the Supabase project **LeadWell** stay
intact. This runbook is the cutover, not a delete.

Realtime publication is on in Supabase. The app never calls
`supabase.channel` / `.subscribe()`, so realtime is dropped. No Worker
equivalent is shipped.

There are no crons, storage buckets, or payments. The public host will
be **polarch.day** (product rename comes later; Worker/repo stay LeadWell).

Auth is a magic-link email (Resend). There is no Google OAuth client.
Sign-in and sign-up are allowlist-only (`ALLOWED_EMAILS`).

---

## Env vars and secrets (names only)

Never put values here.

### Worker / wrangler secrets

| Name | Where | Notes |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | wrangler secret | Session signing. Generate a long random string. |
| `BETTER_AUTH_URL` | wrangler var | Public Worker origin (`https`, with a scheme). Required in preview/prod. Unset is allowed only when `ENVIRONMENT=local`. Loopback may use `http`. After the custom domain is attached, set this to that origin. |
| `TRUSTED_ORIGINS` | wrangler var | Optional comma-separated extra origins for CORS and Better Auth. `BETTER_AUTH_URL` is always included. Use for `www` or a leftover `*.workers.dev` host. Hosts must not contain `*`. |
| `AUTH_COOKIE_DOMAIN` | wrangler var | Optional cookie `Domain`. Must equal or be a parent of the `BETTER_AUTH_URL` host and must not be a public suffix (`workers.dev`, `pages.dev`, `co.uk`, …). Omit on `*.workers.dev` / `*.pages.dev` and local. |
| `ENVIRONMENT` | `.dev.vars` only | Set to `local` on your laptop. Omit in preview/prod. |
| `RESEND_API_KEY` | wrangler secret | Resend sending key. Worker sends magic-link mail. |
| `AUTH_EMAIL_FROM` | wrangler var | Verified Resend from-address (e.g. `login@polarch.day`). |
| `OPENAI_API_KEY` | wrangler secret | Server-side OpenAI key. The client must never send it. |
| `OPENAI_MODEL` | wrangler var | Optional. Must be in the Worker allowlist (`gpt-5-mini`, `gpt-5`). Defaults to `gpt-5-mini`. |
| `ALLOWED_EMAILS` | wrangler var | Comma-separated allowlist for sign-up and sign-in. Set to Phil's email. Empty admits nobody. Non-allowlisted magic-link requests still return `{status:true}` and do not send mail. |
| `DATABASE_URL` | wrangler secret | Neon connection string. Used when Hyperdrive is unset (preview / local). |
| `HYPERDRIVE` | wrangler binding | Workers Paid. Replace the placeholder id in `wrangler.jsonc` before production deploy. Local uses `localConnectionString`. |

### Client (Vite)

| Name | Where | Notes |
| --- | --- | --- |
| `VITE_DEMO` | build env | `1` for the offline sample-org build. |
| `LEADWELL_WORKER_ORIGIN` | `.env.local` | Optional Vite proxy target. Defaults to `http://127.0.0.1:8787`. |

### Migration script (laptop, once)

| Name | Notes |
| --- | --- |
| `SUPABASE_DB_URL` | Read-only Postgres URI for the LeadWell project (`migration_reader`). The script `pg_dump`s `public` (never `auth`) and `COPY`s auth rows from `migration_tmp.auth_users()` / `migration_tmp.auth_identities()`. |
| `NEON_DB_URL` | Empty Neon database. The script writes here. |
| `LEADWELL_MIGRATE_TEST` | Set to `1` in prove/CI so both URLs must be loopback. Do **not** set this for the live Phil cutover or the Actions cutover workflow. |
| `PG_BIN` | Optional directory containing `pg_dump` / `pg_restore` matching the source major. |

### GitHub Actions cutover (`cutover-migrate.yml`)

Repo secrets. Never put values here or in the workflow file.

| Name | Notes |
| --- | --- |
| `SOURCE_DATABASE_URL` | Read-only Supabase **session-pooler** URI (`sslmode=require`). `migration_reader` — no `USAGE` on `auth`; auth rows are read through `migration_tmp.auth_users()` / `migration_tmp.auth_identities()`. Same role the laptop script calls `SUPABASE_DB_URL`. |
| `NEON_DATABASE_URL` | Empty Neon database. Used only when `dry_run=false`. |

`checks.yml` still uses loopback prove URLs only. These two secrets belong on the
manual cutover workflow, not in the PR checks job.

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

Apply `worker/schema/001_leadwell.sql`, `002_better_auth.sql`,
`003_rate_limit.sql`, then `004_rate_limit_window_start.sql` to a local
Postgres or Neon branch before signing in. `004` is a `BEGIN`/`COMMIT`
transaction. To undo just that column (same statement as
`worker/schema/rollback/004_rate_limit_window_start.sql`):

```sql
ALTER TABLE rate_limit DROP COLUMN IF EXISTS window_start;
```

---

## Data migration (source is read-only)

Dry-run with no URLs (prints the contract, writes nothing):

```sh
node scripts/migrate-supabase-to-neon.mjs --dry-run
```

Expected output:

```
dry-run: would pg_dump public (exclude auth) and COPY migration_tmp.auth_users() / migration_tmp.auth_identities() from SUPABASE_DB_URL (read-only)
dry-run: would abort before any Neon write if an email is blank or lower(email) is duplicated
dry-run: would refuse a non-empty target (any user table/function/enum/type in public or auth)
dry-run: would CREATE EXTENSION IF NOT EXISTS pgcrypto, then stub auth.users + auth.uid() and Supabase roles (anon, authenticated, service_role, plus dump TO/GRANT) on NEON_DB_URL
dry-run: would pg_restore --exit-on-error with EXTENSION entries filtered out
dry-run: would insert auth.users into Better Auth "user" (same ids); magic-link uses that email (Google identities are not mapped)
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

### GitHub Actions (`cutover-migrate.yml`)

Manual only (`workflow_dispatch`). Default input `dry_run=true`. It is not
on push or pull_request. Do not add the secret values to the repo; set them
once in the GitHub UI (Settings → Secrets and variables → Actions).

1. Actions → **cutover-migrate** → Run workflow.
2. Leave **dry_run** checked for a rehearsal. The job:
   - masks `SOURCE_DATABASE_URL` / `NEON_DATABASE_URL` (`::add-mask::`) and
     never `set -x`
   - `pg_dump`s `public` from Supabase (custom format, matching client major,
     `sslmode=require`, `--exclude-schema=auth`) into `$RUNNER_TEMP`. The
     dump is **never** uploaded as an artifact. Auth rows are **not** in
     the dump. An `always()` step deletes `*.dump` and auth COPY CSVs
   - runs `scripts/migrate-supabase-to-neon.mjs` against an ephemeral
     Postgres 17 service container — **not** Neon. Before restore it
     creates `NOLOGIN` stubs for `anon` / `authenticated` / `service_role`
     (and any other dump `TO`/`GRANT` roles) so RLS policies can restore.
     That script `COPY`s the narrow TABLE columns from
     `migration_tmp.auth_users()` / `migration_tmp.auth_identities()`
     (id/name/email/verified/timestamps and user_id/provider/provider_id
     — no password hashes or tokens)
   - writes per-table `COUNT(*)` + content md5 hashes (source vs scratch
     target, including auth users via the function vs Better Auth `"user"`)
     to the step summary and a 7-day artifact. That artifact is counts and
     hashes only — no row data, emails, or password hashes
   - confirms Phil's auth user (via `migration_tmp.auth_users()`) landed
     in Better Auth `"user"` with the same id and email, and prints
     **the id only**
   - fails if any checksum table mismatches or the user did not carry over
3. Uncheck **dry_run** only when Neon is empty and you intend to load it.
   Same dump + migrate script + checksums; the target is `NEON_DATABASE_URL`.

The job does **not** set `LEADWELL_MIGRATE_TEST`. That flag is prove/CI
loopback only and would refuse the real session-pooler URL. The loopback
guards in `scripts/loopback.mjs` stay as they are.

The script:

1. `pg_dump`s `public` (no-owner, no-acl, `--exclude-schema=auth`) from Supabase.
2. `COPY`s `migration_tmp.auth_users()` (and `migration_tmp.auth_identities()`, unused). The functions `RETURNS TABLE` only the columns Better Auth needs. Never `SELECT`s `auth.users` / `auth.identities` — the source role cannot get `USAGE` on `auth`.
3. Aborts on blank or case-insensitive-duplicate emails.
4. Refuses a non-empty Neon target.
5. Creates `pgcrypto`, stub `auth.users` / `auth.uid()`, and stub **only**
   `anon`, `authenticated`, and `service_role` as `NOLOGIN` (tagged
   `DO $leadwell_stub_roles$`, `IF NOT EXISTS`). The dump is scanned for
   `CREATE POLICY … TO` and privilege `GRANT … ON … TO` only — not
   function bodies and not membership `GRANT role TO role`. Any other
   role in those clauses is a hard error. Then restores public. The same
   stubs run on the Actions scratch target (`dry_run=true`) and on Neon
   (`dry_run=false`). Without them, `pg_restore` fails with
   `role "authenticated" does not exist` on
   `CREATE POLICY actions_owner … TO authenticated`.
6. Inserts Better Auth `"user"` rows with the **same UUIDs** and emails.
7. Does **not** map Google identities.
8. Compares per-table `COUNT(*)` and `md5` of every public row (`ORDER BY … COLLATE "C"`, so collation differences cannot cause a false mismatch), plus auth-user count/md5 via the function vs `"user"`. Aborts on mismatch.
9. On failure, drops only objects this run created on Neon. Supabase is never
   modified. Role stubs are cluster-level and are left in place (NOLOGIN).

### Restored RLS vs how the Worker enforces access

Supabase policies are `TO authenticated` and `user_id = auth.uid()`. After
cutover the Worker is the access path, not PostgREST:

- The Worker connects with `DATABASE_URL` / Hyperdrive as the Neon owner
  (or that role via Hyperdrive). It never `SET ROLE authenticated` /
  `anon` / `service_role`.
- `pg_restore --no-owner` makes that connecting role the table owner.
  Table owners **bypass RLS** unless `FORCE ROW LEVEL SECURITY` is set.
  We do **not** FORCE RLS — that would hide every row from the Worker
  (`auth.uid()` is the NULL stub).
- Access is enforced in `worker/src/store.ts`: every load / upsert /
  delete is scoped `WHERE user_id = $1` for the Better Auth session user.
  That is the same `user_id` as the migrated Supabase auth UUID.

The `NOLOGIN` stubs exist so `CREATE POLICY` can restore. Nothing can log
in as those roles. Policies stay attached to `authenticated` and still
call stub `auth.uid()`, so a future `SET ROLE authenticated` session
would see the RLS expression. That is dump fidelity, not the Worker
path. Do not grant `LOGIN` on the stubs and do not point Hyperdrive at
`authenticated`.

### `pg_dump` and RLS on the source

`pg_dump` (default, no `--enable-row-security`) sets `row_security=off`
and then `COPY`s each table. That is **not** the same as `GRANT SELECT`.
A non-owner without `BYPASSRLS` gets:

```
ERROR: query would be affected by row-level security policy for table "actions"
```

`--enable-row-security` would only dump rows a policy allows. The LeadWell
policies are `TO authenticated` + `auth.uid()`. `migration_reader` is
neither `authenticated` nor the table owner, so it would dump **empty**
tables. Do not use that flag.

**Prod finding (do not guess attributes):** cutover
[40377053881](https://github.com/phillipchan1/leadwell/actions/runs/40377053881)
dumped `public` from real Supabase as `migration_reader` and then failed
later on `CREATE POLICY … TO authenticated`. So the prod dump role
**already can** `COPY` RLS-protected tables under `row_security=off`.
This environment cannot `SELECT rolbypassrls` on that role (no source
URI). If a later dump hits the error above, grant `BYPASSRLS` to
`migration_reader` (or dump as the table owner / a superuser). Confirm
as a privileged role, never print row values:

```sql
-- expect t if this is how the role dumps (or rolsuper / table owner)
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = 'migration_reader';
```

The loopback prove dumps as `migration_reader` after `ALTER ROLE …
BYPASSRLS` so CI matches that `row_security=off` COPY, not the owner
session that created the tables.

Loopback prove that a restore with role-scoped policies succeeds:

```sh
LEADWELL_PROVE_SOURCE_URL=postgresql://postgres:postgres@127.0.0.1:5432/leadwell_src \
LEADWELL_PROVE_TARGET_URL=postgresql://postgres:postgres@127.0.0.1:5432/leadwell_dst \
  npm run test:migrate
```

`scripts/prove-migrate.mjs` seeds `CREATE POLICY actions_owner … TO authenticated`
(the clause that failed in cutover dry-run 40377053881), then asserts the
target has the NOLOGIN stubs, the policy is restored, and the table owner
can still read rows (the Worker path). The `authenticated` stub has no
`USAGE` on `public` — the Worker never `SET ROLE` those stubs. Dump-SQL
scanning of `TO`/`GRANT` is also unit-tested without a database.

Email/password hashes from GoTrue are not portable. Phil's login path is a
**magic-link** to the migrated `"user"` row (same UUID + email). The first
sign-in with that email lands on that row; it does not create a second user.
The wrappers therefore do **not** return `encrypted_password`, recovery
tokens, or confirmation tokens. If a later change needs a secret column,
justify it in the PR — do not widen `RETURNS TABLE` by default.

### Apply / verify `migration_tmp` (prod, once)

Apply the SQL from the PR description (same text as
`MIGRATION_TMP_PROD_APPLY_SQL` in `scripts/migrate-users.lib.mjs`) on
LeadWell prod as a privileged role (`postgres`), **not**
`migration_reader`. Run it as one transaction:

```sh
psql -1 -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f apply-migration-tmp.sql
```

`CREATE OR REPLACE` cannot change `SETOF auth.users` to `RETURNS TABLE`,
so the script `DROP`s the old functions first. Do not grant `USAGE` on
`auth`.

Pre-check dependents (expect 0 rows; abort if anything depends on the
current wrappers):

```sql
SELECT
  pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent,
  pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced
FROM pg_catalog.pg_depend d
JOIN pg_catalog.pg_proc p ON p.oid = d.refobjid
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'migration_tmp'
  AND p.proname IN ('auth_users', 'auth_identities')
  AND d.deptype = 'n'
ORDER BY 1, 2;
```

The apply script wraps `CREATE` / `REVOKE` / `GRANT` in `BEGIN`/`COMMIT`
and includes an optional `ALTER FUNCTION … OWNER TO postgres` (needed
only when the creating role is not already `postgres`). After a failed
apply or an aborted data migration, roll back with:

```sql
DROP SCHEMA migration_tmp CASCADE;
```

Then verify (still as a privileged role; never print row values):

```sql
-- expect f
SELECT has_schema_privilege('migration_reader', 'auth', 'USAGE');

-- expect t
SELECT has_function_privilege('migration_reader', 'migration_tmp.auth_users()', 'EXECUTE');
SELECT has_function_privilege('migration_reader', 'migration_tmp.auth_identities()', 'EXECUTE');

-- expect f
SELECT has_function_privilege('anon', 'migration_tmp.auth_users()', 'EXECUTE');
SELECT has_function_privilege('anon', 'migration_tmp.auth_identities()', 'EXECUTE');
SELECT has_function_privilege('authenticated', 'migration_tmp.auth_users()', 'EXECUTE');
SELECT has_function_privilege('authenticated', 'migration_tmp.auth_identities()', 'EXECUTE');
SELECT has_function_privilege('service_role', 'migration_tmp.auth_users()', 'EXECUTE');
SELECT has_function_privilege('service_role', 'migration_tmp.auth_identities()', 'EXECUTE');

-- expect TABLE (...), not SETOF auth.users / auth.identities
-- expect no encrypted_password / recovery_token / confirmation_token / identity_data
SELECT p.proname, pg_get_function_result(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'migration_tmp'
  AND p.proname IN ('auth_users', 'auth_identities')
ORDER BY 1;

-- expect search_path = ''
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'migration_tmp'
  AND p.proname IN ('auth_users', 'auth_identities');
```

As `migration_reader` (session-pooler URI), confirm:

```sql
-- expect permission denied
SELECT 1 FROM auth.users LIMIT 1;

-- expect column does not exist (function is TABLE, not SETOF auth.users)
SELECT encrypted_password FROM migration_tmp.auth_users();

-- expect one row; print the id only
SELECT id FROM migration_tmp.auth_users() LIMIT 1;
```

### After cutover

Once Neon is loaded and magic-link sign-in works, drop the temporary
schema so the wrappers cannot be reused. Do **not** drop `auth` or
`public`. Supabase stays intact. Same statement as the abort rollback:

```sql
DROP SCHEMA migration_tmp CASCADE;
```

---

## Cutover

1. Create a Neon project (free tier). Leave it empty.
2. Create a Cloudflare Worker (`leadwell`) with Workers static assets.
   Hyperdrive is Workers Paid; preview can use `DATABASE_URL` instead.
3. Set the Worker secrets (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`,
   `OPENAI_API_KEY`, `DATABASE_URL`) and `ALLOWED_EMAILS` to Phil's email.
   Preview can use `BETTER_AUTH_URL` = the `*.workers.dev` origin. Production
   uses the custom domain (next step).
4. Attach **polarch.day** as the Worker custom domain (dashboard: Workers →
   leadwell → Settings → Domains & Routes → Add, or
   `npx wrangler domains add polarch.day`). Then set:
   - `BETTER_AUTH_URL` = `https://polarch.day`
   - `AUTH_COOKIE_DOMAIN` = `polarch.day` (no leading dot)
   - `AUTH_EMAIL_FROM` = `login@polarch.day` (verify the domain in Resend)
   - `TRUSTED_ORIGINS` only if you still serve `www` or `*.workers.dev`
   Do not rename the Worker, package, or repo.
5. In Resend, verify **polarch.day** and send from `login@polarch.day`.
   No Google OAuth client. No Google redirect URI.
6. Run the migrate script against the empty Neon database (laptop, above) or
   the **cutover-migrate** workflow with `dry_run=false`.
7. `npm run build && wrangler deploy` (or `--env preview` first).
8. Open `https://polarch.day`. Request a magic-link to Phil's email. Data
   should be Phil's existing org (same `user.id` as the Supabase auth UUID).
9. Smoke-test. The shared URL is `https://polarch.day`.

Vercel stays deployed. Supabase stays live. Nothing is deleted.

---

## Smoke tests

- `GET /api/health` → `{ ok: true, service: "leadwell", realtime: false }`
- Signed-out `https://polarch.day/` still shows the marketing landing.
- Magic-link sign-in returns to the app; the org loads (people, meetings, prayer).
- An edit syncs (chrome leaves "saving"); reload keeps it.
- `POST /api/openai` with a signed-in session and no client API key.
  Without `OPENAI_API_KEY` the Worker returns 501; with it, OpenAI answers.
- Magic-link send is 3/minute per IP and per allowlisted email+IP. An hourly
  cap (10/hour) is keyed on email + IP prefix (IPv4 /24, IPv6 /48). Unparseable
  IPs share one `invalid` prefix bucket. A silent 200/hour per-email soft cap
  still returns 200 with the same timing but skips the send and logs once.
  That soft cap is email-only — see below. Verify is 10/minute per IP. Prod
  keys IP on `CF-Connecting-IP` only. Extra hard-limit requests return 429.
  Mail (or the first-skip console log) is dispatched in `waitUntil` so timing
  does not leak the allowlist or the cap. Soft-cap DB work (email + log keys)
  is awaited on the request; background send failures log kind/status only
  (no email, token, or IP).
- Confirm the Supabase dashboard still has the original rows (source untouched).

---

## Magic-link soft cap (email-only lockout)

The 200/hour silent cap is keyed on the allowlisted email alone
(`email-soft|/sign-in/magic-link|<lowercased-email>`). Hard limits are 10/hour
per email+prefix, so about **20 distinct /24 (or IPv6 /48) prefixes** can
burn the soft cap and **silently lock the victim out**: further requests
still return `200 {status:true}` and skip Resend. The victim sees a successful
sign-in request and never gets mail.

### How to spot it

- One Worker log line per window: `magic-link send skipped` with
  `{ kind: "soft_cap" }`. The log has no email, token, or IP.
- In Postgres, look for a `rate_limit` row whose `key` starts with
  `email-soft|/sign-in/magic-link|` and `count >= 200`. The suffix after
  the last `|` is the lowercased address — read it in a SQL client; do
  not copy it into app logs.

### How to clear a key

Replace the placeholder with the lowercased address. Do not log the
statement or the key.

```sql
DELETE FROM rate_limit
 WHERE key IN (
   'email-soft|/sign-in/magic-link|<lowercased-email>',
   'email-soft-log|/sign-in/magic-link|<lowercased-email>'
 );
```

After delete, the next allowlisted request starts a new fixed hour window
and can send again. Prefix hard-limit rows (`email-prefix|…`) are separate;
clear those only if the same flood also 429s a prefix.

---

## Rollback

`vercel.json` has `"ignoreCommand": "exit 0"`. Merging this branch to
`master` does **not** ship a new Vercel build. Production on Vercel stays
the current deployment (`a147830`). That is the fallback.

1. Point the shared URL / bookmark back at that Vercel deployment. Do not
   delete the Worker.
2. Google still works against Supabase — its redirect URI was never removed.
3. Neon and the Worker can stay; they are unused until you cut over again.
4. **Writes made on Neon after cutover do not exist on Supabase.** Rolling
   back returns Phil to the last Supabase snapshot. Do not write back from
   Neon to Supabase.
5. Re-migrate later only into a **new empty** Neon database (the script
   refuses a dirty target).
6. If you applied `004_rate_limit_window_start.sql` and need to drop the
   fixed-window column without a full cutover rollback:

   ```sql
   ALTER TABLE rate_limit DROP COLUMN IF EXISTS window_start;
   ```

---

## What is not here

- No Cloudflare cron.
- No R2 / storage.
- No payments.
- No Google OAuth client.
- No Anthropic / Claude proxy.
- No Supabase realtime replacement (unused).
- No rename of the Worker, package, or repo (polarch.day is a host only).
- No deletion of the Vercel project or the LeadWell Supabase project.
