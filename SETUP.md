# LeadWell cloud setup

LeadWell now runs on **Supabase** (Postgres + Auth) with **Google sign-in**, so
your data lives in the cloud and syncs across every device.

You do this once. It takes ~15 minutes.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> → **New project**. Pick a name and a strong
   database password (save it).
2. When it finishes provisioning, open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
3. In the repo, copy the example env file and paste those in:

   ```sh
   cp .env.example .env.local
   # then edit .env.local
   ```

   The anon key is safe to expose in the browser — **row-level security** (set
   up by the migration below) is what actually protects each user's data.

---

## 2. Create the database schema

The schema lives in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
It creates one table per entity, all scoped to the signed-in user with RLS.

**Easiest way (dashboard):**

1. Supabase dashboard → **SQL Editor → New query**.
2. Paste the entire contents of `supabase/migrations/0001_init.sql`.
3. **Run**. You should see it create the tables and policies with no errors.
4. Then run each later migration in `supabase/migrations/` in order (`0002…`
   through `0011…`) the same way. They're additive `alter table` statements and
   are safe to re-run.

**Or with the CLI** (if you use it):

```sh
npm install -g supabase          # if you don't have it
supabase link --project-ref <your-project-ref>
supabase db push
```

---

## 3. Turn on Google sign-in

You need a Google OAuth client, then paste its credentials into Supabase.

**a. Google Cloud Console** — <https://console.cloud.google.com>

1. Create (or pick) a project → **APIs & Services → Credentials**.
2. Configure the **OAuth consent screen** (External is fine; add yourself as a
   test user, or publish it).
3. **Create credentials → OAuth client ID → Web application**.
4. Under **Authorized redirect URIs**, add exactly:

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

   (Find `<your-project-ref>` in your Supabase Project URL.)
5. Copy the **Client ID** and **Client secret**.

**b. Supabase dashboard** — **Authentication → Providers → Google**

1. Enable it and paste the **Client ID** and **Client secret**. Save.
2. Go to **Authentication → URL Configuration** and set:
   - **Site URL**: `http://localhost:5173` for local dev (change to your
     deployed URL later).
   - **Redirect URLs**: add `http://localhost:5173` (and your production URL
     when you deploy).

Anyone who signs in with Google gets their own private workspace, seeded with
starter data on first login.

---

## 4. Run it

```sh
npm install
npm run dev
```

Open <http://localhost:5173>, click **Continue with Google**, and you're in.

### Migrating your existing local data

If you used the old localStorage version **in the same browser**, your teams and
people are imported automatically the first time you sign in — nothing is lost.
(The import runs only for a brand-new account with no cloud data yet.)

---

## Optional: a dev test account

Google sign-in can't be automated, and nobody should be handing your Google
credentials to a script or a coding agent. So dev builds can offer a second,
password-based sign-in for a throwaway account. It exercises the real thing —
auth, row-level security, and cloud sync — while your own account stays
untouched.

**1. Create the user.** Supabase dashboard → **Authentication → Users → Add
user → Create new user**. Use an address you control (e.g.
`you+leadwell-test@gmail.com`), a generated password, and tick **Auto Confirm
User** so there's no email round-trip.

**2. Point `.env.local` at it:**

```sh
VITE_DEV_TEST_EMAIL=you+leadwell-test@gmail.com
VITE_DEV_TEST_PASSWORD=the-generated-password
```

**3. Restart `npm run dev`.** The sign-in screen now shows a dashed
**Continue as test user (dev)** button. First sign-in seeds that account with
the sample org, so there's data to look at immediately.

Notes:

- `.env.local` is gitignored — the password never enters the repo. The button is
  gated on `import.meta.env.DEV`, which is statically `false` in a production
  build, so Vite drops the code path from `dist/` entirely.
- The test user lives in your production project but gets its own `user_id`, and
  RLS scopes every table by `user_id` — it cannot see or touch your real data.
- Use a *distinct* password, not one you use anywhere else, and rotate it in the
  dashboard if `.env.local` is ever exposed.
- `npm run dev` also exposes `window.useStore` for inspecting or driving store
  state from the console.

---

## Deploying to the web

Build with `npm run build` and host the `dist/` folder anywhere static (Vercel,
Netlify, Cloudflare Pages, Supabase Hosting…). Then:

- Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as build env vars there.
- To expose the LeadWell MCP to Cursor/Claude, also set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEADWELL_USER_ID`, and `LEADWELL_MCP_TOKEN`. See [docs/mcp.md](docs/mcp.md).
- Add your production URL to **Google** authorized redirect URIs is *not*
  needed (Google only points at Supabase), but **do** add it to Supabase
  **Authentication → URL Configuration** (Site URL + Redirect URLs).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App stuck on "Backend not configured" | `.env.local` missing/typo'd; restart `npm run dev` after editing. |
| Google sign-in loops or 400s | Redirect URI in Google must be the Supabase `/auth/v1/callback` URL; your app URL must be in Supabase → Auth → URL Configuration. |
| Signed in but no data / permission errors | The SQL migration didn't run (RLS/tables missing). Re-run step 2. |
