import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, RefObject } from "react";

/**
 * Dragging a card between columns, with one implementation for mouse, pen and
 * finger.
 *
 * HTML5 drag-and-drop never fires from a touch screen, which left the original
 * topic board decorative on phones. This is pointer events instead: a mouse
 * drag starts on movement, a touch drag starts on a hold, and anything that
 * moves before the hold completes was a scroll.
 *
 * Extracted from `TopicKanban` when the planner needed a second board whose
 * columns are meeting occurrences rather than four fixed lanes — hence the
 * plain `string` column key.
 *
 * Callers still owe the accessible path. Dragging is a nicety; every card also
 * needs a "Move to…" control that works with a keyboard, a screen reader and a
 * thumb.
 */

/** Distance before a pointer press counts as a drag rather than a tap. */
export const DRAG_SLOP = 8;
/** Hold time before a touch turns into a drag instead of a scroll. */
export const LONG_PRESS_MS = 300;

export type DragState = {
  id: string;
  /** Viewport coordinates of the pointer, for the floating card. */
  x: number;
  y: number;
  /** Grab offset inside the card, so it doesn't jump under the finger. */
  dx: number;
  dy: number;
  width: number;
  over: string | null;
};

export type CardDrag = {
  drag: DragState | null;
  /** Register a column's element so drops can be hit-tested against it. */
  columnRef: (key: string) => (el: HTMLElement | null) => void;
  /**
   * Bind to the grab handle — never the card itself, which holds an editable
   * textarea a press would fight for the caret.
   *
   * Takes the card's ref rather than its element: this is called during render,
   * when `ref.current` is still null on the first pass, so the rect has to be
   * read when the drag actually begins.
   */
  handleProps: (
    id: string,
    column: string,
    card: RefObject<HTMLElement | null>
  ) => {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onContextMenu: (e: MouseEvent) => void;
  };
};

export function useCardDrag(onDrop: (id: string, column: string) => void): CardDrag {
  const [drag, setDrag] = useState<DragState | null>(null);

  // Column geometry is read on every move to decide the drop target.
  const columns = useRef(new Map<string, HTMLElement | null>());
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const pending = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    x: number;
    y: number;
    started: boolean;
  } | null>(null);

  const columnRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      columns.current.set(key, el);
    },
    []
  );

  const columnAt = useCallback((x: number, y: number): string | null => {
    let best: { key: string; area: number } | null = null;
    for (const [key, el] of columns.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const area = r.width * r.height;
        if (!best || area < best.area) best = { key, area };
      }
    }
    return best?.key ?? null;
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: globalThis.PointerEvent) => {
      setDrag((d) =>
        d
          ? { ...d, x: e.clientX, y: e.clientY, over: columnAt(e.clientX, e.clientY) }
          : d
      );
    };
    const onUp = () => {
      const current = dragRef.current;
      if (current?.over) onDrop(current.id, current.over);
      setDrag(null);
    };
    // Once a drag is live the browser must stop trying to scroll the strip.
    const block = (e: TouchEvent) => e.preventDefault();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("touchmove", block, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("touchmove", block);
    };
  }, [drag, columnAt, onDrop]);

  const clearPending = useCallback(() => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  useEffect(() => clearPending, [clearPending]);

  const handleProps = useCallback(
    (id: string, column: string, card: RefObject<HTMLElement | null>) => {
      const begin = (clientX: number, clientY: number) => {
        const rect = card.current?.getBoundingClientRect();
        if (!rect) return;
        setDrag({
          id,
          x: clientX,
          y: clientY,
          dx: clientX - rect.left,
          dy: clientY - rect.top,
          width: rect.width,
          over: column,
        });
      };

      return {
        onPointerDown: (e: PointerEvent) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          const { clientX, clientY, pointerType } = e;
          pending.current = { timer: null, x: clientX, y: clientY, started: false };
          if (pointerType === "mouse") {
            // Mouse drags start on movement, as they always have.
            return;
          }
          // A finger needs to distinguish "drag this card" from "scroll the
          // strip", so touch waits for a hold.
          pending.current.timer = setTimeout(() => {
            if (!pending.current) return;
            pending.current.started = true;
            begin(clientX, clientY);
          }, LONG_PRESS_MS);
        },
        onPointerMove: (e: PointerEvent) => {
          const p = pending.current;
          if (!p || p.started) return;
          const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
          if (moved < DRAG_SLOP) return;
          if (e.pointerType === "mouse") {
            p.started = true;
            begin(e.clientX, e.clientY);
          } else {
            // Moved before the hold completed — that was a scroll.
            clearPending();
          }
        },
        onPointerUp: clearPending,
        onPointerCancel: clearPending,
        onContextMenu: (e: MouseEvent) => e.preventDefault(),
      };
    },
    [clearPending]
  );

  return { drag, columnRef, handleProps };
}
