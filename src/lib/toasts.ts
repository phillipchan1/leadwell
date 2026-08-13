import { UNSTABLE_ToastQueue as AriaToastQueue } from "react-aria-components";
import { dropUndo, pushUndo } from "./undo";

/**
 * The app's transient feedback channel — the counterpart to `confirmAction`
 * for things that don't need an answer: "Saved", "Couldn't save — retrying",
 * "Deleted · Undo".
 *
 * The queue lives here rather than beside `<ToastHost />` so the persistence
 * and sync layers can report to the user without a lib → component import.
 * `Toast.tsx` renders this queue; nothing else needs to know it's React Aria
 * underneath.
 *
 * They ship under `UNSTABLE_` names in react-aria-components 1.20; the API is
 * the one that shipped stable upstream, so the rename is the only thing that
 * changes when we take a newer version.
 */
export type ToastTone = "neutral" | "error";

export type ToastRequest = {
  message: string;
  /** `error` persists until dismissed and reads amber. Defaults to neutral. */
  tone?: ToastTone;
  /** A single follow-up — almost always Undo. Dismisses the toast when taken. */
  action?: { label: string; onAction: () => void };
};

export type ToastPayload = Required<Pick<ToastRequest, "message" | "tone">> &
  Pick<ToastRequest, "action">;

/**
 * Three at once is already more than anyone reads; beyond that the newest one
 * is what matters, so the queue holds the rest back rather than stacking a
 * column that covers the screen it's reporting on.
 */
export const toastQueue = new AriaToastQueue<ToastPayload>({
  maxVisibleToasts: 3,
});

/**
 * Neutral toasts are a receipt, not a message — long enough to catch, short
 * enough to ignore. Errors have no timeout: an unsaved edit is not news that
 * should expire on its own.
 */
const NEUTRAL_TIMEOUT = 4000;

export function toast({
  message,
  tone = "neutral",
  action,
}: ToastRequest): string {
  return toastQueue.add(
    { message, tone, action },
    { timeout: tone === "error" ? undefined : NEUTRAL_TIMEOUT }
  );
}

export function dismissToast(key: string): void {
  toastQueue.close(key);
}

/**
 * Delete now, and keep the way back within reach.
 *
 * For records that are cheap to recreate and expensive to interrupt for — a
 * one-line topic, an action item, a goal title. Stopping a leader mid-thought
 * with a modal to confirm deleting a line of text is its own kind of failure,
 * so these don't ask; they do it, and say so with a way out. Prose gets a
 * confirmation instead (`confirmAction`) — losing four sentences about a hard
 * conversation is not the same event as losing a to-do.
 *
 * `restore` closes over the record itself, so Undo puts it back exactly: same
 * id, same position, same links.
 */
export function deleteWithUndo(
  message: string,
  remove: () => void,
  restore: () => void
): void {
  remove();
  /* The toast catches it while you're looking; the undo stack catches it after
     the toast has gone. Both run the same `restore`, and taking the toast's
     Undo drops the entry so ⌘Z doesn't restore the same record twice. */
  const entry = { label: message, undo: restore };
  pushUndo(entry);
  toast({
    message,
    action: {
      label: "Undo",
      onAction: () => {
        dropUndo(entry);
        restore();
      },
    },
  });
}
