/** Better Auth client: Google + optional email/password (dev test user). */
import { createAuthClient } from "better-auth/client";

/** Boot scripts read this — Better Auth cookies are httpOnly. */
export const SESSION_STORAGE_KEY = "lw-session";

export type AuthUser = { id: string; email?: string | null };
export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "INITIAL_SESSION";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});

const listeners = new Set<(event: AuthEvent) => void>();

export function onAuthChange(fn: (event: AuthEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(event: AuthEvent): void {
  for (const fn of listeners) fn(event);
}

export function rememberSession(user: AuthUser | null): void {
  try {
    if (!user?.id) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ id: user.id, email: user.email ?? "" }),
    );
  } catch {
    /* private mode / blocked storage */
  }
}

function userFromSession(data: { user?: { id?: string; email?: string | null } | null } | null): AuthUser | null {
  const user = data?.user;
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? null };
}

export async function getSession(): Promise<AuthUser | null> {
  const { data } = await authClient.getSession();
  const user = userFromSession(data);
  rememberSession(user);
  return user;
}

let hydrated = false;

/** First session read. Emits INITIAL_SESSION so the store can bootstrap. */
export async function hydrateAuth(): Promise<AuthUser | null> {
  const user = await getSession();
  if (!hydrated) {
    hydrated = true;
    emit("INITIAL_SESSION");
  }
  return user;
}

/** Kick off the Google OAuth redirect. Returns to the current origin. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: window.location.origin,
  });
  if (error) throw new Error(error.message || "Google sign-in failed");
}

/**
 * Dev-only email/password test account. Credentials live in gitignored
 * `.env.local`. `import.meta.env.DEV` is statically false in production, so
 * Vite drops this path from the bundle.
 */
export const devTestUserConfigured =
  import.meta.env.DEV &&
  Boolean(import.meta.env.VITE_DEV_TEST_EMAIL && import.meta.env.VITE_DEV_TEST_PASSWORD);

export async function signInAsTestUser(): Promise<void> {
  if (!devTestUserConfigured) {
    throw new Error(
      "No dev test user configured. Set VITE_DEV_TEST_EMAIL and " +
        "VITE_DEV_TEST_PASSWORD in .env.local (see RUNBOOK.md).",
    );
  }
  const { error } = await authClient.signIn.email({
    email: import.meta.env.VITE_DEV_TEST_EMAIL!,
    password: import.meta.env.VITE_DEV_TEST_PASSWORD!,
  });
  if (error) throw new Error(error.message || "Test sign-in failed");
  await getSession();
  emit("SIGNED_IN");
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
  rememberSession(null);
  emit("SIGNED_OUT");
}

/** Same-origin Worker. Vite proxies `/api` in `npm run dev`. */
export const backendConfigured = true;
