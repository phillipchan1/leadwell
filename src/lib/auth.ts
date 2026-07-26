/** Thin wrappers around Supabase Auth for Google OAuth sign-in / sign-out. */
import { supabase } from "./supabase";

/** Kick off the Google OAuth redirect flow. Returns to the current origin. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

/**
 * Dev-only email/password test account, for automated/agent-driven testing of
 * the real signed-in app (auth, RLS, cloud sync, server AI) without anyone
 * handling the Google account. Credentials live in gitignored `.env.local` and
 * are only read here — see SETUP.md for creating the user.
 *
 * `import.meta.env.DEV` is statically false in a production build, so Vite
 * drops this whole path from the bundle.
 */
export const devTestUserConfigured =
  import.meta.env.DEV &&
  Boolean(
    import.meta.env.VITE_DEV_TEST_EMAIL &&
      import.meta.env.VITE_DEV_TEST_PASSWORD
  );

/** Sign in as the dev test user. Throws if not configured or rejected. */
export async function signInAsTestUser(): Promise<void> {
  if (!devTestUserConfigured) {
    throw new Error(
      "No dev test user configured. Set VITE_DEV_TEST_EMAIL and " +
        "VITE_DEV_TEST_PASSWORD in .env.local (see SETUP.md)."
    );
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: import.meta.env.VITE_DEV_TEST_EMAIL!,
    password: import.meta.env.VITE_DEV_TEST_PASSWORD!,
  });
  if (error) throw error;
  // onAuthStateChange picks up SIGNED_IN and runs bootstrap.
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
