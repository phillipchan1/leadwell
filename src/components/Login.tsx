import { FormEvent, useState } from "react";
import {
  backendConfigured,
  devTestUserConfigured,
  signInAsTestUser,
  signInWithMagicLink,
} from "../lib/auth";
import { Button } from "@/components/base/buttons/button";
import { Mark, Wordmark } from "./brand/glyphs";

/** Full-screen sign-in gate shown when there's no authenticated session. */
export function Login() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

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

  const onTestSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInAsTestUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test sign-in failed.");
      setBusy(false);
    }
  };

  return (
    <div className="pad-safe-top pad-safe-bottom flex h-full items-center justify-center bg-leather px-6 text-leather-fg">
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
            Backend not configured. Start the Worker (<code>npm run cf:dev</code>) or Vite with
            the <code>/api</code> proxy. See <code>RUNBOOK.md</code>.
          </p>
        ) : sent ? (
          <p className="w-full rounded-xl bg-leather-hi p-4 text-[15px] leading-relaxed text-leather-ink">
            Check your email for a sign-in link. It expires in a few minutes.
          </p>
        ) : (
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
              className="h-12 w-full rounded-xl border border-leather-line bg-leather-hi px-4 text-[15px] text-leather-fg outline-none placeholder:text-leather-ink/70 focus:border-gilt"
            />
            <Button
              type="submit"
              size="lg"
              color="secondary"
              isDisabled={busy}
              isLoading={busy}
              showTextWhileLoading
              className="w-full"
            >
              {busy ? "Sending…" : "Email me a sign-in link"}
            </Button>
          </form>
        )}

        {backendConfigured && devTestUserConfigured && !sent && (
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

        {error && <p className="text-[13px] text-teal-400">{error}</p>}
      </div>
    </div>
  );
}
