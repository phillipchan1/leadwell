import { toast } from "./toasts";

/**
 * One step back, from anywhere.
 *
 * Phase 1 gave individual deletes their own Undo toast, which covers the moment
 * you notice — but only for as long as the toast is up, and only for the action
 * that raised it. This is the same idea with a memory: the last few undoable
 * actions are kept, and ⌘Z takes the top one whether or not you saw the toast.
 *
 * ── Why it operates on the store, not the network ────────────────────────
 * Writes sync 600ms after a change, so by the time anyone reaches for ⌘Z the
 * delete is already on the server. Undo therefore *re-applies* state — it puts
 * the record back through the same `restore*` actions the toast uses — and the
 * next debounced sync carries that forward. There is no rollback to attempt and
 * nothing to reconcile.
 *
 * ── Why it's shallow ──────────────────────────────────────────────────────
 * Six entries, not unbounded. This exists to catch the mis-tap you just made,
 * not to be a document history — and an undo stack that outlives your memory of
 * what was in it is its own hazard, because the thing that comes back is a
 * surprise.
 */
export type UndoEntry = {
  /** Named in the past tense, as the toast reads it: "Topic deleted." */
  label: string;
  undo: () => void;
};

const MAX_DEPTH = 6;

const stack: UndoEntry[] = [];
const listeners = new Set<() => void>();

function changed() {
  for (const fn of listeners) fn();
}

export function subscribeUndo(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function undoDepth(): number {
  return stack.length;
}

/** Record something that can be taken back. */
export function pushUndo(entry: UndoEntry): void {
  stack.push(entry);
  if (stack.length > MAX_DEPTH) stack.shift();
  changed();
}

/**
 * Take back the most recent action. Returns false when there is nothing to
 * take back, so the caller can say so rather than failing silently — a ⌘Z that
 * appears to do nothing is indistinguishable from one that did the wrong thing.
 */
export function undoLast(): boolean {
  const entry = stack.pop();
  changed();
  if (!entry) {
    toast({ message: "Nothing to undo." });
    return false;
  }
  entry.undo();
  toast({ message: `Undid: ${entry.label.replace(/\.$/, "")}.` });
  return true;
}

/** Remove a specific entry — the toast's own Undo already ran it. */
export function dropUndo(entry: UndoEntry): void {
  const i = stack.lastIndexOf(entry);
  if (i !== -1) {
    stack.splice(i, 1);
    changed();
  }
}

/** Sign-out and account switches must not leave another user's actions behind. */
export function clearUndo(): void {
  stack.length = 0;
  changed();
}
