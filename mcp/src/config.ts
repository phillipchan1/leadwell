/**
 * Server-side settings. Never `VITE_`-prefixed: these must not reach the
 * browser bundle — the service role key bypasses row-level security.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`LeadWell MCP: missing ${name}`);
  return value;
}

export type McpConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  token: string;
};

export function mcpConfig(): McpConfig {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("LeadWell MCP: missing SUPABASE_URL (or VITE_SUPABASE_URL)");
  }
  return {
    supabaseUrl,
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    userId: required("LEADWELL_USER_ID"),
    token: required("LEADWELL_MCP_TOKEN"),
  };
}

/**
 * "Today" is a calendar date in the owner's time zone, not the server's. The
 * app computes it from the browser clock; on a UTC server a Friday-evening
 * call in Pasadena would already be Saturday, and Friday's meeting would read
 * as past. Node re-reads `TZ` whenever it is assigned, so set it before any
 * date is taken.
 */
export function applyTimeZone(): string {
  const tz = process.env.LEADWELL_TZ?.trim() || "America/Los_Angeles";
  process.env.TZ = tz;
  return tz;
}

export function readBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Claude's custom connectors take a URL and nothing else, so the token can
 * also ride as the last path segment: `/mcp/<token>`. Treat that URL as the
 * secret it is.
 */
export function readPathToken(pathname: string): string | null {
  const match = /\/mcp\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Constant-time compare, so the token can't be guessed a byte at a time. */
export function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
