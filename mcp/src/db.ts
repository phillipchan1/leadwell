import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mcpConfig } from "./config";

let cached: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS; every query still filters by Phil's user id. */
export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  const { supabaseUrl, serviceRoleKey } = mcpConfig();
  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function ownerUserId(): string {
  return mcpConfig().userId;
}
