import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, RefObject } from "react";

/**
 * Board drag-and-drop with an insertion point.
 *
 * `useCardDrag` answers "which column is the pointer over" and nothing else,
 * which was fine for a board whose columns were unordered piles. It isn't
 * enough once a week column is a stack of curriculum bands and the order of
 * cards inside a band is the running order of the meeting: a drop has to
 * resolve to a *zone plus an index*.
 *
 * Zones register their element; items are found by querying `[data-drag-item]`
 * inside the zone at hit-test time rather than through a second registry, so a
 * list can re-render freely without bookkeeping going stale.
 *
 * Pointer events throughout — HTML5 drag-and-drop never fires from a touch
 * screen, and a week strip you can't drag on a phone is decorative.
 */

/** Distance before a pointer press counts as a drag rather than a tap. */
export const DRAG_SLOP = 8;
/** Hold time before a touch turns into a drag instead of a scroll. */
export const LONG_PRESS_MS = 300;
/** How close to the edge of the strip before it scrolls itself. */
const EDGE_PX = 72;
const EDGE_SPEED = 18;

export type BoardDragState = {
  id: string;
  /** Viewport coordinates of the pointer, for the floating card. */
  x: number;
  y: number;
  /** Grab offset inside the card, so it doesn't jump under the finger. */
  dx: number;
  dy: number;
  width: number;
  /** Zone the card was picked up from — a drop can then read as a move. */
  from: string;
  /** Zone the pointer is over, and where the card would land inside it. */
  over: string | null;
  index: number;
};

export type BoardDnD = {
  drag: BoardDragState | null;
  /** Register a droppable zone. */
  zoneRef: (key: string) => (el: HTMLElement | null) => void;
  /** Register the horizontally scrolling strip so drags near the edge pan it. */
  scrollerRef: (el: HTMLElement | null) => void;
  /**
   * Bind to the grab handle — never the card itself, which may hold an input
   * that a press would fight for the caret.
   */
  handleProps: (
    id: string,
    zone: string,
    card: RefObject<HTMLElement | null>
  ) => {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onContextMenu: (e: MouseEvent) => void;
  };
};

export function useBoardDnD(
  onDrop: (id: string, zone: string, index: number, from: string) => void
): BoardDnD {
  const [drag, setDrag] = useState<BoardDragState | null>(null);

  const zones = useRef(new Map<string, HTMLElement | null>());
  const scroller = useRef<HTMLElement | null>(null);
  const dragRef = useRef<BoardDragState | null>(null);
  dragRef.current = drag;

  const pending = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    x: number;
    y: number;
    started: boolean;
  } | null>(null);

  const zoneRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) zones.current.set(key, el);
      else zones.current.delete(key);
    },
    []
  );

  const scrollerRef = useCallback((el: HTMLElement | null) => {
    scroller.current = el;
  }, []);

  /** Smallest zone under the pointer — sections nest inside columns. */
  const zoneAt = useCallback((x: number, y: number): string | null => {
    let best: { key: string; area: number } | null = null;
    for (const [key, el] of zones.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const area = r.width * r.height;
        if (!best || area < best.area) best = { key, area };
      }
    }
    return best?.key ?? null;
  }, []);

  /** Cards whose midpoint sits above the pointer come before the drop. */
  const indexIn = useCallback(
    (zone: string, y: number, draggedId: string): number => {
      const el = zones.current.get(zone);
      if (!el) return 0;
      const items = [
        ...el.querySelectorAll<HTMLElement>("[data-drag-item]"),
      ].filter((node) => node.dataset.dragItem !== draggedId);
      let index = 0;
      for (const node of items) {
        const r = node.getBoundingClientRect();
        if (y > r.top + r.height / 2) index += 1;
      }
      return index;
    },
    []
  );

  // Edge panning: a strip eight columns wide is unreachable if you have to let
  // go of the card to scroll it.
  useEffect(() => {
    if (!drag) return;
    let frame = 0;
    const step = () => {
      const el = scroller.current;
      const d = dragRef.current;
      if (el && d) {
        const r = el.getBoundingClientRect();
        if (d.x > r.right - EDGE_PX) el.scrollLeft += EDGE_SPEED;
        else if (d.x < r.left + EDGE_PX) el.scrollLeft -= EDGE_SPEED;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [drag]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: globalThis.PointerEvent) => {
      const zone = zoneAt(e.clientX, e.clientY);
      setDrag((d) =>
        d
          ? {
              ...d,
              x: e.clientX,
              y: e.clientY,
              over: zone,
              index: zone ? indexIn(zone, e.clientY, d.id) : 0,
            }
          : d
      );
    };
    const onUp = () => {
      const current = dragRef.current;
      if (current?.over)
        onDrop(current.id, current.over, current.index, current.from);
      setDrag(null);
    };
    // Once a drag is live the browser must stop trying to scroll the page.
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
  }, [drag, zoneAt, indexIn, onDrop]);

  const clearPending = useCallback(() => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  /*
   * A press that ends anywhere but on the element it started on never fires
   * that element's pointerup — leaving `pending` armed, so the next hover
   * crossed the slop threshold and started a drag with no button held. Watch
   * for the release globally instead of trusting it to come back to us.
   */
  useEffect(() => {
    const release = () => clearPending();
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      clearPending();
    };
  }, [clearPending]);

  const handleProps = useCallback(
    (id: string, zone: string, card: RefObject<HTMLElement | null>) => {
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
          from: zone,
          over: zone,
          index: indexIn(zone, clientY, id),
        });
      };

      return {
        onPointerDown: (e: PointerEvent) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          const { clientX, clientY, pointerType } = e;
          pending.current = { timer: null, x: clientX, y: clientY, started: false };
          if (pointerType === "mouse") return; // mouse drags start on movement
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
          // Nothing is held down — this is a hover over stale state.
          if (e.pointerType === "mouse" && e.buttons === 0) {
            clearPending();
            return;
          }
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
    [clearPending, indexIn]
  );

  return { drag, zoneRef, scrollerRef, handleProps };
}
