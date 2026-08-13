import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import {
  listShortcuts,
  pushOverlay,
  registerShortcut,
  subscribeShortcuts,
  type Shortcut,
} from "@/lib/shortcuts";

type Options = Omit<Shortcut, "id" | "run"> & {
  /** Skip registration entirely — for bindings that only apply in one mode. */
  enabled?: boolean;
};

/**
 * Bind a chord for as long as the component is mounted.
 *
 * The handler is held in a ref, so a binding declared with an inline arrow
 * function doesn't re-register on every render — which would otherwise churn
 * the registry (and the help panel that reads it) sixty times a second.
 */
export function useShortcut(
  handler: (e: KeyboardEvent) => void,
  { enabled = true, ...meta }: Options
): void {
  const id = useId();
  const ref = useRef(handler);
  ref.current = handler;

  const {
    chord,
    keysLabel,
    label,
    group,
    overlay,
    allowInInput,
    hidden,
    available,
  } = meta;
  const availableRef = useRef(available);
  availableRef.current = available;

  // A `chord` array written inline is a new array every render; the joined
  // string is what actually changed.
  const chordKey = Array.isArray(chord) ? chord.join("|") : chord;

  useEffect(() => {
    if (!enabled) return;
    return registerShortcut({
      id,
      chord: chordKey.includes("|") ? chordKey.split("|") : chordKey,
      keysLabel,
      label,
      group,
      overlay,
      allowInInput,
      hidden,
      available: available ? () => availableRef.current?.() ?? true : undefined,
      run: (e) => ref.current(e),
    });
    // `available` is read through a ref; only its presence matters here.
  }, [
    id,
    enabled,
    chordKey,
    keysLabel,
    label,
    group,
    overlay,
    allowInInput,
    hidden,
    Boolean(available),
  ]);
}

/** The live registry, for the help panel and the palette. */
export function useShortcutList(): Shortcut[] {
  return useSyncExternalStore(subscribeShortcuts, listShortcuts, listShortcuts);
}

/**
 * Marks an overlay as open for as long as the component is mounted, so page
 * bindings stand down while a dialog has the screen.
 */
export function useOverlayGuard(active = true): void {
  useEffect(() => {
    if (!active) return;
    return pushOverlay();
  }, [active]);
}
