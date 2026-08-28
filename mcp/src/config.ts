function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`LeadWell MCP: missing ${name}`);
  }
  return value;
}

export function mcpConfig() {
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

export function readToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
