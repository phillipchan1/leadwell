export interface HyperdriveBinding {
  connectionString: string;
}

export interface Env {
  ASSETS?: Fetcher;
  HYPERDRIVE?: HyperdriveBinding;
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  /**
   * Optional comma-separated extra origins for CORS + Better Auth.
   * `BETTER_AUTH_URL` is always trusted. Example: `https://www.polarch.day`.
   */
  TRUSTED_ORIGINS?: string;
  /**
   * Optional cookie `Domain`. Set to the registrable host when a custom
   * domain is attached (e.g. `polarch.day`). Omit on workers.dev and local.
   */
  AUTH_COOKIE_DOMAIN?: string;
  /** wrangler / `.dev.vars` only: `local` allows a localhost auth fallback. */
  ENVIRONMENT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  /** Comma-separated allowlist. Empty = no new users. Set to Phil's email. */
  ALLOWED_EMAILS?: string;
}

const PLACEHOLDER_HYPERDRIVE = "00000000000000000000000000000000";

export function databaseUrl(env: Env): string | null {
  const bound = env.HYPERDRIVE?.connectionString;
  const fromHyperdrive = bound?.trim() ?? "";
  // Return the exact binding string so TLS can identity-match it.
  if (bound && fromHyperdrive && !fromHyperdrive.includes(PLACEHOLDER_HYPERDRIVE)) {
    return bound;
  }
  const fallback = env.DATABASE_URL?.trim() ?? "";
  return fallback || fromHyperdrive || null;
}

export function anthropicModel(env: Env): string {
  return env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";
}
