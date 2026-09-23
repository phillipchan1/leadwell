/**
 * The app's binding of `persist.ts`: the browser Supabase client, plus the
 * sync baseline this device keeps.
 *
 * The zustand store keeps working entirely in memory with optimistic updates —
 * exactly as it did against localStorage. This module is the seam that turns
 * that in-memory `PersistedData` into rows across the normalized tables (and
 * back). It exposes three things the store needs:
 *
 *   loadAll(userId)      → read every table into a PersistedData (or null for a
 *                          brand-new user who has no profile row yet)
 *   writeAll(userId,d)   → insert a full PersistedData (seeding / first import)
 *   syncData(userId,d)   → persist only the rows that changed since the last
 *                          baseline (called, debounced, on every store change)
 *
 * The mappers and the row diff live in `persist.ts`, shared with the MCP
 * server so an agent's write lands in exactly the rows the app would write.
 */
import { supabase } from "./supabase";
import * as persist from "./persist";
import type { PersistedData } from "./persist";

export type { NodePosition, PersistedData } from "./persist";
export { emptyMe, meFromRow } from "./persist";

// --- baseline tracking for incremental sync ---------------------------------
let baseline: PersistedData | null = null;

/** Record the current data as the "already persisted" reference. */
export function setBaseline(data: PersistedData): void {
  baseline = data;
}

/** Forget the baseline (on sign-out) so nothing syncs until the next load. */
export function clearBaseline(): void {
  baseline = null;
}

/** True once a baseline exists (i.e. we've loaded or seeded). */
export function hasBaseline(): boolean {
  return baseline !== null;
}

/** The document the server is believed to hold, as of the last load or write. */
export function getBaseline(): PersistedData | null {
  return baseline;
}

// --- public API -------------------------------------------------------------

/**
 * Read the whole org for a user. Returns null when the user has no profile row
 * yet (a brand-new account that still needs seeding).
 */
export function loadAll(userId: string): Promise<PersistedData | null> {
  return persist.loadAll(supabase, userId);
}

/** Insert a full document for a user (first-time seed or import). */
export async function writeAll(userId: string, d: PersistedData): Promise<void> {
  await persist.writeAll(supabase, userId, d);
  setBaseline(d);
}

/**
 * Persist what this device changed since the last baseline — row by row.
 *
 * With no baseline (a cached document holding offline edits, whose server
 * state is unknown) every row is upserted and nothing is deleted: resurrecting
 * a row is recoverable, deleting one is not.
 */
export async function syncData(userId: string, d: PersistedData): Promise<void> {
  await persist.syncChanges(supabase, userId, baseline, d);
  setBaseline(d);
}

/** Delete every row this user owns (used by the cloud "reset to seed"). */
export async function wipeUser(userId: string): Promise<void> {
  await persist.wipeUser(supabase, userId);
  baseline = null;
}
