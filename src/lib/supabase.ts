import { createClient } from "@supabase/supabase-js";

/**
 * Single Supabase client for the whole app. Reads the project URL and the
 * public anon key from Vite env vars (safe to expose — row-level security is
 * what actually protects the data).
 *
 * Set these in `.env.local` (see `.env.example`):
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGci...
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  // Surface loudly — the app can't do anything useful without a backend.
  console.error(
    "LeadWell: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill them in (see SETUP.md)."
  );
}

export const SUPABASE_URL = url ?? "";
export const SUPABASE_ANON_KEY = anonKey ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
