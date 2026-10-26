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

const LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8787",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8787",
  "http://[::1]:5173",
  "http://[::1]:8787",
];

/** Cookie Domain must be a multi-label hostname, not a URL or a TLD. */
const COOKIE_DOMAIN_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function parseTrustedOrigins(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const s = part.trim();
    if (!s) continue;
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      throw new Error(`TRUSTED_ORIGINS entry "${s}" is not a valid origin`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`TRUSTED_ORIGINS entry "${s}" must be http(s)`);
    }
    if (url.username || url.password) {
      throw new Error(`TRUSTED_ORIGINS entry "${s}" must not include credentials`);
    }
    out.push(url.origin);
  }
  return out;
}

/**
 * Better Auth + credentialed CORS allowlist.
 * Always includes `BETTER_AUTH_URL`. Extra entries come from `TRUSTED_ORIGINS`.
 * Loopback baseURL also trusts the local Vite / wrangler ports.
 */
export function resolveTrustedOrigins(
  env: Pick<Env, "BETTER_AUTH_URL" | "TRUSTED_ORIGINS" | "ENVIRONMENT">,
): string[] {
  const base = resolveAuthBaseURL(env);
  const extra = parseTrustedOrigins(env.TRUSTED_ORIGINS);
  const local = isLocalAuthHost(base) ? LOCAL_DEV_ORIGINS : [];
  return [...new Set([base, ...extra, ...local])];
}

/**
 * Cookie `Domain` from `AUTH_COOKIE_DOMAIN`. Empty = host-only cookies.
 * Ignored on loopback so a copied prod value does not break local sign-in.
 * Must be a suffix of the `BETTER_AUTH_URL` host.
 */
export function resolveAuthCookieDomain(
  env: Pick<Env, "AUTH_COOKIE_DOMAIN" | "BETTER_AUTH_URL" | "ENVIRONMENT">,
): string | undefined {
  const raw = env.AUTH_COOKIE_DOMAIN?.trim();
  if (!raw) return undefined;
  const domain = raw.replace(/^\./, "").toLowerCase();
  if (!COOKIE_DOMAIN_HOST.test(domain)) {
    throw new Error("AUTH_COOKIE_DOMAIN must be a hostname like polarch.day");
  }
  const host = canonicalizeHostname(new URL(resolveAuthBaseURL(env)).hostname);
  if (isLoopbackHostname(host)) return undefined;
  if (host !== domain && !host.endsWith(`.${domain}`)) {
    throw new Error("AUTH_COOKIE_DOMAIN must be a suffix of the BETTER_AUTH_URL host");
  }
  return domain;
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
