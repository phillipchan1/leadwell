import { storage } from "./storage";

/**
 * What you opened last, so the palette can answer before you've typed.
 *
 * The single most common search is a repeat of the last one. Notion's palette
 * opens on your recent pages for exactly this reason, and a leader's version of
 * it is narrower still: the same six or seven people, the week's meetings, the
 * one team in trouble. Showing that list on an empty query turns "pull up
 * Meghan" into ⌘K and one arrow key.
 *
 * It also feeds ranking. A doc you've opened recently gets a frecency boost, so
 * "m" puts *your* Meghan above the three other M-names you've never opened.
 *
 * Scoped by user id, for the same reason `docCache` is: two accounts on one
 * browser must not be able to read each other's history. A shared office
 * machine shouldn't tell the next person who the pastor has been meeting with.
 */

const KEY_PREFIX = "recents:";

/** Enough to cover a working week without the list becoming its own haystack. */
const CAP = 40;

/** Ids only. Titles change, and a stale copy of one is worse than a lookup. */
type Stored = { v: 1; ids: string[] };

const VERSION = 1;

function keyFor(userId: string): string {
  return KEY_PREFIX + userId;
}

/** Most recently opened first. */
export function loadRecents(userId: string | null): string[] {
  if (!userId) return [];
  const stored = storage.load<Stored>(keyFor(userId));
  if (!stored || stored.v !== VERSION || !Array.isArray(stored.ids)) return [];
  return stored.ids.filter((id) => typeof id === "string");
}

/** Move `docId` to the front, and return the new list. */
export function recordRecent(userId: string | null, docId: string): string[] {
  const next = [docId, ...loadRecents(userId).filter((id) => id !== docId)].slice(
    0,
    CAP
  );
  // A dropped write costs nothing here — the list is a convenience, and the
  // next open rewrites it anyway.
  if (userId) storage.save<Stored>(keyFor(userId), { v: VERSION, ids: next });
  return next;
}

export function clearRecents(userId: string | null): void {
  if (userId) storage.remove(keyFor(userId));
}

/** Doc id → position, for the frecency term in `search`. */
export function recentRank(ids: string[]): Map<string, number> {
  return new Map(ids.map((id, i) => [id, i]));
}
