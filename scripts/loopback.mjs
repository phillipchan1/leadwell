/**
 * Loopback-only guard for any script that connects to a database.
 * Same allowlist as worker/src/refuseTestUrl.ts.
 */
import parsePgConnectionString from "pg-connection-string";

const REDIRECT_QUERY_PARAMS = new Set(["host", "hostaddr", "service"]);

function parseConnectionString(url) {
  const parse =
    typeof parsePgConnectionString === "function"
      ? parsePgConnectionString
      : parsePgConnectionString.parse;
  return parse(url);
}

function allowedTestHost(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function hostList(raw) {
  const parts = [];
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

function refuseEnvHost(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return;
  const hosts = hostList(raw);
  if (hosts.length > 1) {
    throw new Error(`${name} is a multi-host list — refusing to connect`);
  }
  const host = hosts[0] ?? raw;
  if (!allowedTestHost(host)) {
    throw new Error(`${name} host "${host}" is not loopback — refusing to connect`);
  }
}

export function refuseUnsafeTestUrl(url, label = "LEADWELL_TEST_DATABASE_URL") {
  refuseEnvHost("PGHOST");
  refuseEnvHost("PGHOSTADDR");

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }

  for (const key of parsed.searchParams.keys()) {
    if (REDIRECT_QUERY_PARAMS.has(key.toLowerCase())) {
      throw new Error(
        `${label} query param "${key}" can redirect the connection — refusing to connect`,
      );
    }
  }

  if (parsed.hostname.includes(",")) {
    throw new Error(`${label} is a multi-host list — refusing to connect`);
  }

  let config;
  try {
    config = parseConnectionString(url);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }

  const resolved = [];
  if (config.host) resolved.push(...hostList(String(config.host)));
  if (config.hostaddr != null && String(config.hostaddr).trim()) {
    resolved.push(...hostList(String(config.hostaddr)));
  }

  if (resolved.length > 1) {
    throw new Error(`${label} is a multi-host list — refusing to connect`);
  }

  const host = resolved[0];
  if (!host) {
    throw new Error(`${label} host is missing — refusing to connect`);
  }
  if (!allowedTestHost(host)) {
    throw new Error(`${label} host "${host}" is not loopback — refusing to connect`);
  }
}

/** Guard a URL that a prove/test script will query. No-op when empty. */
export function assertLoopbackDatabaseUrl(url, label) {
  if (!url) {
    throw new Error(`${label || "database URL"} is required and must be loopback`);
  }
  refuseUnsafeTestUrl(url, label);
}
