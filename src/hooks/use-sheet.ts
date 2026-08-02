import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Makes the Android hardware/gesture Back close an overlay instead of
 * navigating away from the app.
 *
 * The pushed entry keeps the current URL, so react-router's location never
 * changes and no route work happens on either push or pop. When the overlay is
 * dismissed some other way (button, Escape, backdrop) the entry is consumed so
 * Back doesn't need a wasted press.
 */
export function useHistoryDismiss(onClose: () => void, enabled = true) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const markerRef = useRef<string | null>(null);
  /**
   * Set while we are popping our *own* entry after the overlay was dismissed
   * some other way. Without it, that programmatic `back()` looks identical to
   * the user pressing Back and would re-fire onClose — which under StrictMode's
   * double-invoked effects closed the overlay the instant it opened.
   */
  const selfPopRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    if (!markerRef.current) {
      const marker = `sheet-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2)}`;
      markerRef.current = marker;
      window.history.pushState(
        { ...window.history.state, __sheet: marker },
        "",
        window.location.href
      );
    }

    const onPop = () => {
      if (selfPopRef.current) {
        selfPopRef.current = false;
        return;
      }
      // The user went Back: our entry is already gone, so don't consume it.
      markerRef.current = null;
      onCloseRef.current();
    };

    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Dismissed by button, Escape or backdrop — drop the entry we added so
      // Back doesn't need a wasted press.
      if (
        markerRef.current &&
        window.history.state?.__sheet === markerRef.current
      ) {
        markerRef.current = null;
        selfPopRef.current = true;
        window.history.back();
      }
    };
  }, [enabled]);
}

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.5; // px per ms

/**
 * Swipe-down-to-dismiss for the bottom-sheet presentation. Returns the handle's
 * pointer bindings plus the sheet's current drag offset, so the sheet's
 * appearance and its available gestures agree.
 */
export function useSwipeDismiss(onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Mouse users have the close button; this is a touch affordance.
    if (e.pointerType === "mouse") return;
    start.current = { y: e.clientY, t: e.timeStamp };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    // Downward only — an upward drag should not lift the sheet off its anchor.
    setOffset(Math.max(0, e.clientY - start.current.y));
  }, []);

  const end = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      const distance = e.clientY - start.current.y;
      const elapsed = Math.max(1, e.timeStamp - start.current.t);
      const flung = distance / elapsed > DISMISS_VELOCITY && distance > 24;

      start.current = null;
      setDragging(false);

      if (distance > DISMISS_DISTANCE || flung) {
        onClose();
      } else {
        setOffset(0);
      }
    },
    [onClose]
  );

  return {
    offset,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
    },
  };
}

/** Horizontal travel before a swipe counts as a page turn. */
const PAGE_DISTANCE = 64;
/** Beyond this much vertical travel it was a scroll, not a page turn. */
const PAGE_SLOPE = 0.6;
/** iOS owns the left edge for its interactive back gesture. */
const EDGE_EXCLUSION = 24;

/**
 * Swipe left/right to page between sibling entities — the touch equivalent of
 * the ←/→ shortcuts, which have no counterpart on a phone beyond the pager
 * buttons.
 *
 * Deliberately inert when the gesture starts inside a horizontal scroller (the
 * topic board, the wide tables) or within the iOS edge-back zone.
 */
export function useSwipePager({
  onPrev,
  onNext,
}: {
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    if (e.clientX <= EDGE_EXCLUSION) return;

    // Walk up from the target: if anything between here and the surface scrolls
    // sideways, that element owns the gesture.
    let node = e.target as HTMLElement | null;
    while (node && node !== e.currentTarget) {
      if (node.scrollWidth > node.clientWidth + 4) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return;
      }
      node = node.parentElement;
    }

    start.current = { x: e.clientX, y: e.clientY };
  }, []);

  const finish = useCallback(
    (e: React.PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;

      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.abs(dx) < PAGE_DISTANCE) return;
      if (Math.abs(dy) > Math.abs(dx) * PAGE_SLOPE) return;

      if (dx < 0) onNext?.();
      else onPrev?.();
    },
    [onPrev, onNext]
  );

  return {
    onPointerDown,
    onPointerUp: finish,
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
