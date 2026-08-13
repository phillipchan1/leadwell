import { useCallback, useRef } from "react";

/**
 * Arrow-key navigation for a row of related controls — the mode bar, the domain
 * filters, the scan chips.
 *
 * A group of ten filter chips that each take a Tab stop costs ten presses to
 * step past. The pattern every native toolbar uses instead is a *roving*
 * tabindex: the group is one Tab stop, and ←/→ move between the controls inside
 * it. That's what this does, and it is also what makes `role="tablist"` honest —
 * a tablist that only answers to Tab is telling assistive tech about a keyboard
 * model it doesn't implement.
 *
 * The group is marked `data-keyboard-owner`, so the global sibling pager leaves
 * its arrow keys alone.
 */
export function useRovingFocus(orientation: "horizontal" | "vertical" = "horizontal") {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const [prev, next] =
        orientation === "horizontal"
          ? ["ArrowLeft", "ArrowRight"]
          : ["ArrowUp", "ArrowDown"];
      if (![prev, next, "Home", "End"].includes(e.key)) return;

      const list = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          '[data-roving]:not([disabled])'
        ) ?? []),
      ];
      if (list.length === 0) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (at === -1) return;

      e.preventDefault();
      // Wrapping, because a toolbar is a ring: from the last chip, → returns
      // to the first rather than dead-ending.
      const to =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? list.length - 1
            : (at + (e.key === next ? 1 : -1) + list.length) % list.length;
      list[to]?.focus();
    },
    [orientation]
  );

  /**
   * Spread on each control in the group. Only the active one is in the tab
   * order; the rest are reachable by arrow key from it.
   */
  const itemProps = useCallback(
    (active: boolean) => ({
      "data-roving": "true",
      tabIndex: active ? 0 : -1,
    }),
    []
  );

  return {
    groupProps: {
      ref,
      onKeyDown,
      "data-keyboard-owner": "true" as const,
    },
    itemProps,
  };
}
