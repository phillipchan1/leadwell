import type { Env } from "./env.ts";

const LOCAL_FALLBACK = "http://localhost:8787";

/**
 * http is a special URL scheme, so this expands short IPv4 and strips
 * leading zeros (`0127.0.0.1` → `87.0.0.1`, `127` → `0.0.0.127`,
 * `127.1` → `127.0.0.1`). `postgres://` does not.
 */
export function canonicalizeHostname(hostname: string): string {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (!host) return "";
  if (host.includes(":")) return host.toLowerCase();
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return host.toLowerCase();
  }
}

function isIpv4Loopback(host: string): boolean {
  const canonical = canonicalizeHostname(host);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(canonical)) return false;
  const parts = canonical.split(".").map(Number);
  return parts[0] === 127 && parts.every((n) => n <= 255);
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  return isIpv4Loopback(host);
}

export function isLocalAuthHost(url: string): boolean {
  try {
    return isLoopbackHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Hostname only — never a substring of user, db name, or query. */
export function connectionHostname(connectionString: string): string | null {
  try {
    const host = new URL(connectionString).hostname;
    return host || null;
  } catch {
    return null;
  }
}

/** Unset BETTER_AUTH_URL may fall back only when ENVIRONMENT=local. */
export function isLocalAuthRuntime(env: Pick<Env, "ENVIRONMENT">): boolean {
  return env.ENVIRONMENT?.trim().toLowerCase() === "local";
}

/** Secure cookies unless the auth origin is loopback. */
export function authCookieSecure(baseURL: string): boolean {
  return !isLocalAuthHost(baseURL);
}

/**
 * Public Better Auth origin.
 * Unset is allowed only when ENVIRONMENT=local.
 * Production must set BETTER_AUTH_URL — no silent localhost fallback,
 * including when the DB host looks like loopback (postgres:// does not
 * normalize IPv4, so 0127.0.0.1 / 127 must not count).
 */
export function resolveAuthBaseURL(
  env: Pick<Env, "BETTER_AUTH_URL" | "DATABASE_URL" | "HYPERDRIVE" | "ENVIRONMENT">,
): string {
  const configured = env.BETTER_AUTH_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (isLocalAuthRuntime(env)) return LOCAL_FALLBACK;
  throw new Error("BETTER_AUTH_URL must be set to the public Worker origin");
}
