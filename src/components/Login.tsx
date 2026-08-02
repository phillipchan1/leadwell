import { useState } from "react";
import {
  devTestUserConfigured,
  signInAsTestUser,
  signInWithGoogle,
} from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";
import { Button } from "@/components/base/buttons/button";

/** Full-screen sign-in gate shown when there's no authenticated session. */
export function Login() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      // Redirects away; nothing else runs on success.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setBusy(false);
    }
  };

  const onTestSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInAsTestUser();
      // onAuthStateChange runs bootstrap; the gate unmounts on its own.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test sign-in failed.");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-stone-50 p-6 dark:bg-stone-950">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-2xl font-bold tracking-tight">
          Lead<span className="text-teal-600">Well</span>
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Sign in to reach your teams, people, and coaching notes from anywhere.
        </p>

        {!supabaseConfigured ? (
          <p className="mt-6 rounded-lg bg-amber-50 p-3 text-left text-xs leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Backend not configured. Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> and
            restart the dev server. See <code>SETUP.md</code>.
          </p>
        ) : (
          <Button
            size="lg"
            color="secondary"
            iconLeading={<GoogleMark />}
            onClick={onSignIn}
            isDisabled={busy}
            isLoading={busy}
            showTextWhileLoading
            className="mt-6 w-full"
          >
            {busy ? "Redirecting…" : "Continue with Google"}
          </Button>
        )}

        {/* Dev only — compiled out of production builds. Lets an agent drive
            the real signed-in app without touching the Google account. */}
        {supabaseConfigured && devTestUserConfigured && (
          <Button
            size="md"
            color="secondary"
            onClick={onTestSignIn}
            isDisabled={busy}
            isLoading={busy}
            showTextWhileLoading
            data-testid="dev-test-signin"
            className="mt-3 w-full"
          >
            {busy ? "Signing in…" : "Continue as test user (dev)"}
          </Button>
        )}

        {error && <p className="mt-4 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
