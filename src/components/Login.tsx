import { FormEvent, useEffect, useState } from "react";
import {
  backendConfigured,
  googleErrorMessage,
  googleSignInAvailable,
  signInWithGoogle,
  signInWithMagicLink,
} from "../lib/auth";
import { Button } from "@/components/base/buttons/button";
import { Mark, Wordmark } from "./brand/glyphs";

/** Full-screen sign-in gate shown when there's no authenticated session. */
export function Login() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(() =>
    googleErrorMessage(new URLSearchParams(window.location.search).get("error")),
  );
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);
  const [sent, setSent] = useState(false);

  // Shown only when the Worker has the Google secrets. Magic link always.
  useEffect(() => {
    if (!backendConfigured) return;
    let live = true;
    void googleSignInAvailable().then((on) => {
      if (live) setGoogleOn(on);
    });
    return () => {
      live = false;
    };
  }, []);

  const onGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
      // Redirects to Google; nothing else runs on success.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setGoogleBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pad-safe-top pad-safe-bottom flex h-full min-h-0 w-full flex-1 items-center justify-center bg-leather px-6 text-leather-fg">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-8 text-center">
        <div className="flex items-center gap-3.5 text-[34px]">
          <Mark size={52} />
          <Wordmark />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[30px] leading-[36px] font-bold tracking-[-0.015em] text-balance">
            A quiet instrument for leading people well.
          </h1>
          <p className="text-[15px] leading-[23px] text-leather-ink">
            At work, at church and at home. Sign in to reach your people, your meetings and your
            prayer list from anywhere.
          </p>
        </div>

        {!backendConfigured ? (
          <p className="w-full rounded-xl bg-leather-hi p-4 text-left text-[13px] leading-relaxed text-leather-ink">
            Backend not configured. Start the Worker (<code>npm run cf:dev</code>) or Vite with the{" "}
            <code>/api</code> proxy. See <code>RUNBOOK.md</code>.
          </p>
        ) : sent ? (
          <p className="w-full rounded-xl bg-leather-hi p-4 text-[15px] leading-relaxed text-leather-ink">
            Check your email for a sign-in link. It expires in a few minutes.
          </p>
        ) : (
          <div className="flex w-full flex-col gap-3">
            {googleOn && (
              <>
                <Button
                  size="lg"
                  color="secondary"
                  iconLeading={<GoogleMark />}
                  onClick={onGoogle}
                  isDisabled={busy || googleBusy}
                  isLoading={googleBusy}
                  showTextWhileLoading
                  className="w-full bg-leather-hi text-leather-fg ring-leather-line hover:bg-leather-line hover:text-leather-fg before:hidden"
                >
                  {googleBusy ? "Redirecting…" : "Continue with Google"}
                </Button>
                <div
                  className="flex items-center gap-3 text-[13px] text-leather-ink"
                  aria-hidden="true"
                >
                  <span className="h-px flex-1 bg-leather-line" />
                  or
                  <span className="h-px flex-1 bg-leather-line" />
                </div>
              </>
            )}
            <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
              <label className="sr-only" htmlFor="signin-email">
                Email
              </label>
              <input
                id="signin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border-2 border-leather-mute bg-leather-hi px-4 text-[15px] text-leather-fg outline-none placeholder:text-leather-ink/70 focus:border-leather-mute"
              />
              <Button
                type="submit"
                size="lg"
                color="primary"
                isDisabled={busy || googleBusy}
                isLoading={busy}
                showTextWhileLoading
                className="w-full bg-[#ec7c58] text-[#181615] hover:bg-[#d4623e] before:hidden"
              >
                {busy ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
          </div>
        )}

        {error && <p className="text-[13px] text-gilt-ink">{error}</p>}
      </div>
    </div>
  );
}

/** Google "G" mark (brand colors), per Google's sign-in button guidance. */
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
