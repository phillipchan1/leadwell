import { useCallback, useRef } from "react";
import { useShortcut } from "./use-shortcut";

/**
 * `/` puts the caret in this view's search box.
 *
 * Every list surface in the app has a filter field, and reaching it meant
 * Tabbing in from the top of the page — past the header, the tabs and the
 * toolbar — every time. `/` is the near-universal binding for it, and it stands
 * down while you're typing, so a slash inside a search term stays a slash.
 *
 * Returns a ref to put on the input.
 */
export function useSearchShortcut(label = "Jump to this view's search box") {
  const ref = useRef<HTMLInputElement>(null);

  const focus = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Landing on an existing query with the caret at the start makes the field
    // look unresponsive; selecting means the next keystroke replaces it.
    el.select();
  }, []);

  useShortcut(focus, { chord: "/", label, group: "Global" });

  return ref;
}
