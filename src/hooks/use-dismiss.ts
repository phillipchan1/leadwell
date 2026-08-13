import { useEffect, useRef } from "react";

/**
 * One Escape key, one stack.
 *
 * Escape used to be implemented per component. `PersonProfile`, `TeamProfile`
 * and `ManagerProfile` each carried the same ~25-line effect and the same
 * hand-maintained guard list:
 *
 *     if (modal || askAIOpen || settingsOpen || editingAssessments ||
 *         editingPerson || fillingProfile) return;
 *
 * That had three costs. `MeProfile` and `MeetingProfile` never got one, so
 * Escape closed a person panel but not those. Any new overlay had to be added
 * to three separate lists or Escape would close the surface *behind* it. And
 * there was no defined ordering — it was emergent, and the guard list was the
 * thing keeping it from being wrong.
 *
 * A stack removes the question. Overlays register on mount and unregister on
 * unmount, so the registration order *is* the nesting order: an editor opened
 * inside a panel mounts second, sits on top, and gets the Escape first. Nothing
 * has to know what else exists.
 *
 * React Aria's overlays (`ui.tsx`'s `Modal`, and `ConfirmDialog` through it)
 * keep their own focus trap and restore — this is only about ordering, so they
 * register here too rather than reimplementing any of that.
 */
type DismissHandler = () => void;

const stack: DismissHandler[] = [];

function onWindowKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  top();
}

export function useDismiss(onDismiss: DismissHandler, enabled = true): void {
  // Kept in a ref so a new closure each render doesn't re-order the stack —
  // re-registering would move this overlay above one that opened after it.
  const latest = useRef(onDismiss);
  latest.current = onDismiss;

  useEffect(() => {
    if (!enabled) return;
    const handler = () => latest.current();
    if (stack.length === 0) {
      window.addEventListener("keydown", onWindowKeyDown);
    }
    stack.push(handler);
    return () => {
      const i = stack.lastIndexOf(handler);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) {
        window.removeEventListener("keydown", onWindowKeyDown);
      }
    };
  }, [enabled]);
}
