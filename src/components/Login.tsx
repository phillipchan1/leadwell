import { useState } from "react";
import {
  devTestUserConfigured,
  signInAsTestUser,
  signInWithGoogle,
} from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";
import { Button } from "@/components/base/buttons/button";
import { Mark, Wordmark } from "./brand/glyphs";

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

  // The first thing anyone sees, so it is the brand at its plainest: leather,
  // the mark, and one sentence about what this is for.
  return (
    <div className="pad-safe-top pad-safe-bottom flex h-full items-center justify-center bg-leather px-6 text-leather-fg">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-8 text-center">
        <div className="flex items-center gap-3.5 text-[34px]">
          <Mark size={52} />
          <Wordmark />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="font-serif text-[30px] leading-[36px] font-normal text-balance">
            A quiet instrument for leading people well.
          </h1>
          <p className="text-[15px] leading-[23px] text-leather-ink">
            At work, at church and at home. Sign in to reach your people, your meetings and your
            prayer list from anywhere.
          </p>
        </div>

        {!supabaseConfigured ? (
          <p className="w-full rounded-xl bg-leather-hi p-4 text-left text-[13px] leading-relaxed text-leather-ink">
            Backend not configured. Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> and restart the dev
            server. See <code>SETUP.md</code>.
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
            className="w-full"
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
            className="-mt-4 w-full"
          >
            {busy ? "Signing in…" : "Continue as test user (dev)"}
          </Button>
        )}

        {error && <p className="text-[13px] text-gilt">{error}</p>}
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
