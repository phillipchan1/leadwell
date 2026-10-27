/** Better Auth client: magic link + Google (when the Worker has the secrets). */
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";

/** Boot scripts read this — Better Auth cookies are httpOnly. */
export const SESSION_STORAGE_KEY = "lw-session";

export type AuthUser = { id: string; email?: string | null };
export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "INITIAL_SESSION";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  plugins: [magicLinkClient()],
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

function userFromSession(
  data: { user?: { id?: string; email?: string | null } | null } | null,
): AuthUser | null {
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

/** Send a magic-link email. Returns to the current origin after verify. */
export async function signInWithMagicLink(email: string): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("Email is required");
  const { error } = await authClient.signIn.magicLink({
    email: trimmed,
    callbackURL: `${window.location.origin}/signin`,
  });
  if (error) throw new Error(error.message || "Could not send the sign-in link");
}

/** True when the Worker has GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET. */
export async function googleSignInAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth-providers", { credentials: "include" });
    if (!res.ok) return false;
    const body = (await res.json()) as { google?: unknown };
    return body.google === true;
  } catch {
    return false;
  }
}

/** Google OAuth redirect. Lands back on /signin (errors arrive as ?error=). */
export async function signInWithGoogle(): Promise<void> {
  const origin = window.location.origin;
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: `${origin}/signin`,
    errorCallbackURL: `${origin}/signin`,
  });
  if (error) throw new Error(error.message || "Google sign-in failed");
}

/** Friendly text for a Better Auth OAuth `?error=` code. */
export function googleErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return "Google sign-in didn't work for this account. Use the email link instead.";
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
  rememberSession(null);
  emit("SIGNED_OUT");
}

/** Same-origin Worker. Vite proxies `/api` in `npm run dev`. */
export const backendConfigured = true;
