/**
 * Test-only (excluded from the Worker tsconfig).
 * Refuse wipe/test URLs that are not a single loopback host.
 */
import parsePgConnectionString from "pg-connection-string";

const REDIRECT_QUERY_PARAMS = new Set(["host", "hostaddr", "service"]);

/** libpq env vars that can pick a different host than the URL. */
export const LIBPQ_REDIRECT_ENV = [
  "PGHOST",
  "PGHOSTADDR",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSYSCONFDIR",
] as const;

/** Copy env without libpq host-redirect vars. Use for psql/pg_dump/pg_restore. */
export function libpqCleanEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of LIBPQ_REDIRECT_ENV) delete next[key];
  return next;
}

function parseConnectionString(url: string) {
  const parse =
    typeof parsePgConnectionString === "function"
      ? parsePgConnectionString
      : parsePgConnectionString.parse;
  return parse(url);
}

/** Strict test-wipe allowlist — not the broader 127.0.0.0/8 auth helper. */
function allowedTestHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function hostList(raw: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of raw) {
    if (ch === "[") depth++;
    if (ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) parts.push(buf);
  return parts
    .map((part) => {
      const s = part.trim();
      if (!s) return "";
      if (s.startsWith("[")) {
        const end = s.indexOf("]");
        return end >= 0 ? s.slice(1, end) : s;
      }
      if (/^[^:]+:\d+$/.test(s)) return s.replace(/:\d+$/, "");
      return s;
    })
    .filter(Boolean);
}

function refuseEnvHost(name: "PGHOST" | "PGHOSTADDR"): void {
  const raw = process.env[name]?.trim();
  if (!raw) return;
  const hosts = hostList(raw);
  if (hosts.length > 1) {
    throw new Error(`${name} is a multi-host list — refusing to wipe`);
  }
  const host = hosts[0] ?? raw;
  if (!allowedTestHost(host)) {
    throw new Error(`${name} host "${host}" is not loopback — refusing to wipe`);
  }
}

function refuseRedirectEnv(name: "PGSERVICE" | "PGSERVICEFILE" | "PGSYSCONFDIR"): void {
  const raw = process.env[name]?.trim();
  if (!raw) return;
  throw new Error(`${name} can redirect the connection — refusing to wipe`);
}

/** Throw before any connect/query when a wipe/test URL is not loopback. */
export function refuseUnsafeTestUrl(
  url: string,
  label = "LEADWELL_TEST_DATABASE_URL",
): void {
  refuseEnvHost("PGHOST");
  refuseEnvHost("PGHOSTADDR");
  refuseRedirectEnv("PGSERVICE");
  refuseRedirectEnv("PGSERVICEFILE");
  refuseRedirectEnv("PGSYSCONFDIR");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }

  for (const key of parsed.searchParams.keys()) {
    if (REDIRECT_QUERY_PARAMS.has(key.toLowerCase())) {
      throw new Error(
        `${label} query param "${key}" can redirect the connection — refusing to wipe`,
      );
    }
  }

  if (parsed.hostname.includes(",")) {
    throw new Error(`${label} is a multi-host list — refusing to wipe`);
  }

  let config: { host?: string | null; hostaddr?: unknown };
  try {
    config = parseConnectionString(url);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }

  const resolved: string[] = [];
  if (config.host) resolved.push(...hostList(String(config.host)));
  if (config.hostaddr != null && String(config.hostaddr).trim()) {
    resolved.push(...hostList(String(config.hostaddr)));
  }

  if (resolved.length > 1) {
    throw new Error(`${label} is a multi-host list — refusing to wipe`);
  }

  const host = resolved[0];
  if (!host) {
    throw new Error(`${label} host is missing — refusing to wipe`);
  }
  if (!allowedTestHost(host)) {
    throw new Error(`${label} host "${host}" is not loopback — refusing to wipe`);
  }
}
