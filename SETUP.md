# LeadWell cloud setup

LeadWell now runs on **Supabase** (Postgres + Auth) with **Google sign-in**, so
your data lives in the cloud and syncs across every device. The AI coach runs
through a **Supabase Edge Function** that keeps the Anthropic key server-side.

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

## 4. Deploy the AI Edge Function

The AI coach calls [`supabase/functions/anthropic`](supabase/functions/anthropic/index.ts),
which holds the Anthropic key server-side and streams Claude's replies back.
Supabase verifies the user's login before the function runs.

```sh
supabase functions deploy anthropic
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

`supabase/config.toml` sets `verify_jwt = false` for this function so browser
CORS preflight works; the function still requires a signed-in user JWT before
calling Anthropic.

Get a key at <https://console.anthropic.com>. If you skip this step the app
works fully — only the AI coach / 1:1 structuring will show an error until it's
deployed.

---

## 5. Run it

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

## Deploying to the web

Build with `npm run build` and host the `dist/` folder anywhere static (Vercel,
Netlify, Cloudflare Pages, Supabase Hosting…). Then:

- Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as build env vars there.
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
| AI coach errors | Edge Function not deployed or `ANTHROPIC_API_KEY` secret not set (step 4). |
