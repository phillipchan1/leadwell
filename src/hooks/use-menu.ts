import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function items(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * The full keyboard contract for a hand-rolled dropdown: focus moves in on
 * open, ↑/↓ and Home/End walk the items, Escape closes, and focus lands back on
 * the trigger — not on `<body>`, which is where a naive `setOpen(false)` leaves
 * it and is why a keyboard user has to Tab from the top of the page again.
 *
 * The app's *modals* get all of this from React Aria (see `ui.tsx`). These are
 * the small anchored menus that don't warrant an overlay, and they were the
 * ones missing it.
 *
 * Returns props to spread on the trigger and on the menu container.
 */
export function useMenu(open: boolean, onOpenChange: (open: boolean) => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Set when we close deliberately, so focus returns only then. */
  const restoreRef = useRef(false);

  const close = useCallback(
    (restoreFocus = true) => {
      restoreRef.current = restoreFocus;
      onOpenChange(false);
    },
    [onOpenChange]
  );

  // Move focus into the menu on open, and back to the trigger on close.
  useEffect(() => {
    if (open) {
      // A frame late: the menu is not in the DOM until after this render.
      const raf = requestAnimationFrame(() => items(menuRef.current)[0]?.focus());
      return () => cancelAnimationFrame(raf);
    }
    if (restoreRef.current) {
      restoreRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  // Dismissal: pointer outside, Escape anywhere, or focus leaving the menu
  // entirely (Tab past the last item should close it, not strand it open).
  useEffect(() => {
    if (!open) return;
    const inside = (node: Node | null) =>
      Boolean(
        menuRef.current?.contains(node as Node) ||
          triggerRef.current?.contains(node as Node)
      );

    const onDown = (e: PointerEvent) => {
      if (!inside(e.target as Node)) close(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!inside(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, close]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const list = items(menuRef.current);
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = (at + step + list.length) % list.length;
      list[next]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // Let Tab move on, but don't leave an orphaned open menu behind it.
      close(false);
    }
  };

  return {
    triggerRef,
    menuRef,
    close,
    /** Spread on the trigger `<button>`. */
    triggerProps: {
      ref: triggerRef,
      "aria-expanded": open,
      "aria-haspopup": "menu" as const,
      onKeyDown: (e: React.KeyboardEvent) => {
        // ↓ on the trigger opens and lands on the first item — the standard
        // menu-button behaviour, and the reason this is discoverable at all.
        if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          onOpenChange(true);
        }
      },
    },
    /** Spread on the menu container `<div role="menu">`. */
    menuProps: {
      ref: menuRef,
      role: "menu" as const,
      onKeyDown: onMenuKeyDown,
      "data-keyboard-owner": "true" as const,
    },
  };
}
