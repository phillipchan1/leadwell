import { loadAll, syncChanges, type PersistedData } from "../../src/lib/persist.js";
import { ownerId, serviceClient } from "./db.js";

export async function loadWorkspace(): Promise<PersistedData> {
  const data = await loadAll(serviceClient(), ownerId());
  if (!data) {
    throw new Error(
      "LeadWell workspace is empty — no profile row for LEADWELL_USER_ID. Sign in to the app once first."
    );
  }
  return data;
}

/**
 * Write exactly the rows that differ between what was loaded and what the
 * tool produced — the same row diff the app syncs with. An open browser tab
 * picks these up on its next refresh, and can only overwrite a row it edits
 * itself afterwards.
 */
export async function commitWorkspace(
  before: PersistedData,
  after: PersistedData
): Promise<void> {
  await syncChanges(serviceClient(), ownerId(), before, after);
}
