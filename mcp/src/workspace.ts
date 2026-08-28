import type { PersistedData } from "../../src/lib/persist";
import { loadAll, upsertMapped, type CollKey } from "../../src/lib/persist";
import { ownerUserId, serviceClient } from "./db";

export async function loadWorkspace(): Promise<PersistedData> {
  const data = await loadAll(serviceClient(), ownerUserId());
  if (!data) {
    throw new Error("LeadWell workspace is empty — no profile row for this user.");
  }
  return data;
}

type ArrayColl = Exclude<
  CollKey,
  never
>;

export async function saveCollections(
  patch: Partial<Pick<PersistedData, ArrayColl>>
): Promise<void> {
  const client = serviceClient();
  const userId = ownerUserId();
  const jobs: Promise<void>[] = [];
  for (const key of Object.keys(patch) as ArrayColl[]) {
    const items = patch[key];
    if (!items) continue;
    jobs.push(
      upsertMapped(
        client,
        userId,
        key,
        items as Parameters<typeof upsertMapped>[3]
      )
    );
  }
  await Promise.all(jobs);
}
