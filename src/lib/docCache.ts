import type { PersistedData } from "./repo";
import { storage } from "./storage";
import { toast } from "./toasts";

/**
 * A local copy of the signed-in user's document, so opening the app is not a
 * network round-trip.
 *
 * Before this, `repo.loadAll` ran 19 queries behind a full-screen skeleton on
 * every cold open, and an edit made without signal lived only in memory. The
 * document was read from localStorage exactly once ever — in the legacy
 * migration — and never written back.
 *
 * Everything here goes through `lib/storage.ts`, which stays the only module
 * that touches localStorage.
 *
 * The cache is keyed by user id. Two accounts on one browser (a pastor and
 * their own coaching account, a shared office machine) must not be able to
 * read each other's people, so a cache written by one user id is simply not
 * found by another rather than being filtered after the fact.
 */
const DOC_KEY_PREFIX = "doc:";

/** Bumped whenever the shape below stops being readable by an older build. */
type CachedDoc = {
  v: 1;
  userId: string;
  /** When this snapshot was taken, for debugging a stale-looking app. */
  savedAt: string;
  /**
   * True when this snapshot holds edits the server has not accepted — written
   * in a basement with no signal, or by a tab that got backgrounded before its
   * write landed. It is the difference between a cache that can be refreshed
   * from the server and one that has to be pushed *to* it, and getting it
   * wrong looks exactly like losing someone's notes.
   */
  pendingWrite: boolean;
  doc: PersistedData;
};

const CACHE_VERSION = 1;

export type CacheEntry = { doc: PersistedData; pendingWrite: boolean };

function keyFor(userId: string): string {
  return DOC_KEY_PREFIX + userId;
}

/**
 * Quota is a one-way door for this feature — once the document doesn't fit
 * (the usual cause is a photo from `PhotoPicker`), it won't fit on the next
 * write either. Say it once and stop, rather than toasting on every keystroke's
 * debounce.
 */
let quotaReported = false;

export function loadDoc(userId: string): CacheEntry | null {
  const cached = storage.load<CachedDoc>(keyFor(userId));
  if (!cached || cached.v !== CACHE_VERSION || !cached.doc) return null;
  // Belt and braces: the key already scopes by user, so a mismatch here means
  // something rewrote the entry. Don't show one account another's data.
  if (cached.userId !== userId) return null;
  return { doc: cached.doc, pendingWrite: cached.pendingWrite === true };
}

/**
 * Write the snapshot. Synchronous on purpose — `pagehide` calls this, and an
 * async write is the thing a backgrounded tab is free to abandon.
 *
 * Returns false when the write was dropped. A failed cache write is never
 * allowed to fail the cloud sync it rode in on: the server copy is the one
 * that matters, and this is an optimization on top of it.
 */
export function saveDoc(
  userId: string,
  doc: PersistedData,
  opts: { pendingWrite: boolean }
): boolean {
  const ok = storage.save<CachedDoc>(keyFor(userId), {
    v: CACHE_VERSION,
    userId,
    savedAt: new Date().toISOString(),
    pendingWrite: opts.pendingWrite,
    doc,
  });
  if (ok) return true;

  // A half-written or stale entry is worse than none: it would hydrate the
  // app with an old document at the next cold open and look like data loss.
  clearDoc(userId);
  if (!quotaReported) {
    quotaReported = true;
    toast({
      message: "No room to keep an offline copy — you'll need a connection.",
      tone: "error",
    });
  }
  return false;
}

export function clearDoc(userId: string): void {
  storage.remove(keyFor(userId));
}
