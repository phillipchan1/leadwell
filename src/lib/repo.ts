/**
 * Browser persistence seam. The store talks to this module; the mapping and
 * sync live in `persist.ts` so the MCP can reuse them with a service-role
 * client.
 */
import { supabase } from "./supabase";
import * as persist from "./persist";
import type { PersistedData } from "./persist";

export type { NodePosition, PersistedData } from "./persist";
export { emptyMe, meFromRow } from "./persist";

export function setBaseline(data: PersistedData): void {
  persist.setBaseline(data);
}

export function clearBaseline(): void {
  persist.clearBaseline();
}

export function hasBaseline(): boolean {
  return persist.hasBaseline();
}

export function loadAll(userId: string) {
  return persist.loadAll(supabase, userId);
}

export function writeAll(userId: string, d: PersistedData) {
  return persist.writeAll(supabase, userId, d);
}

export function syncData(userId: string, d: PersistedData) {
  return persist.syncData(supabase, userId, d);
}

export function wipeUser(userId: string) {
  return persist.wipeUser(supabase, userId);
}
