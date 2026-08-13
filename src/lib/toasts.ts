import { UNSTABLE_ToastQueue as AriaToastQueue } from "react-aria-components";

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
