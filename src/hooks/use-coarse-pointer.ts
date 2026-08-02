import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * True when the primary input is a finger.
 *
 * Use for behaviour and copy that CSS can't express — suppressing autofocus so
 * a modal doesn't raise the keyboard, or writing "Tap" instead of "Click".
 * Pure styling should use the `touch:` Tailwind variant instead.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
