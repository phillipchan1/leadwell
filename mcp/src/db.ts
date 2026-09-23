import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mcpConfig } from "./config.js";

let cached: SupabaseClient | null = null;

/** Tests hand in an in-memory stand-in. */
export function setServiceClient(client: SupabaseClient | null): void {
  cached = client;
}

/** Service-role client. Bypasses RLS; every query still filters by the owner's id. */
export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  const { supabaseUrl, serviceRoleKey } = mcpConfig();
  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function ownerId(): string {
  return mcpConfig().userId;
}
