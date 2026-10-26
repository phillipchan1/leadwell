import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { hasMod } from "@/lib/keys";

/**
 * Selecting cards on the planner the way you would in Notion or Finder:
 * ⌘/Ctrl-click toggles one, Shift-click takes everything from the last one you
 * touched, and dragging a box on the empty board sweeps up whatever it crosses.
 *
 * Cards are found in the DOM by `[data-drag-item]` — the same hook the drag
 * and drop already uses — rather than through a registry, so a card that
 * mounts, unmounts or moves between the tray and a week needs no bookkeeping.
 * Selection holds ids only, which is also why a selected card survives being
 * moved to another column.
 */

const CARD = "[data-drag-item]";
/** Presses that belong to something else: a card (it drags), a control, a section label. */
const NOT_A_MARQUEE =
  'button, a, input, select, textarea, label, [role="checkbox"], [draggable="true"], [data-no-marquee]';
/** Travel before a press on the board becomes a box rather than a click. */
const SLOP = 4;
const EDGE_PX = 40;
const EDGE_SPEED = 16;

const EMPTY: ReadonlySet<string> = new Set();

type Box = { left: number; top: number; right: number; bottom: number };

/**
 * The part of a card you can actually see — scrollers clip what has been
 * scrolled out of them.
 *
 * The week strip's horizontal clip is the one exception, and only for what
 * scrolled past *during this drag*: `pannedLeft`/`pannedRight` push its edges
 * out by that much. A box swept across eight weeks has to keep the weeks it
 * went through even though they are no longer on screen; but weeks that were
 * already scrolled out before the press are not under the box, whatever sits
 * where they would be.
 */
function visibleBox(
  el: HTMLElement,
  root: HTMLElement,
  strip: HTMLElement | null,
  pannedLeft: number,
  pannedRight: number
): Box | null {
  const r = el.getBoundingClientRect();
  let { left, top, right, bottom } = r;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    const clipX = cs.overflowX !== "visible";
    const clipY = cs.overflowY !== "visible";
    if (clipX || clipY) {
      const pr = p.getBoundingClientRect();
      if (clipX) {
        const widen = p === strip;
        left = Math.max(left, pr.left - (widen ? pannedLeft : 0));
        right = Math.min(right, pr.right + (widen ? pannedRight : 0));
      }
      if (clipY) {
        top = Math.max(top, pr.top);
        bottom = Math.min(bottom, pr.bottom);
      }
    }
    if (p === root) break;
  }
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

export function useBoardSelection({
  rootRef,
  enabled = true,
}: {
  rootRef: RefObject<HTMLElement | null>;
  /** Off while something sits over the board (the open idea), so its backdrop isn't a marquee. */
  enabled?: boolean;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  /** The last card picked by hand: where a Shift-click's range starts from. */
  const anchor = useRef<string | null>(null);
  /** The box is drawn by hand, not through state — it moves every frame. */
  const marqueeRef = useRef<HTMLDivElement | null>(null);

  const clear = useCallback(() => {
    anchor.current = null;
    setSelected((prev) => (prev.size ? EMPTY : prev));
  }, []);

  /** Replace the selection — the right-click on a card that isn't in it. */
  const only = useCallback((ids: string[]) => {
    anchor.current = ids[ids.length - 1] ?? null;
    setSelected(new Set(ids));
  }, []);

  /**
   * Every card on screen, in the order the eye reads the board: the tray top to
   * bottom, then each week left to right, top to bottom within it. A week is one
   * meeting's running order, so a range down a week is what Shift-click should
   * mean — not a sweep across the same section of every week.
   */
  const readingOrder = useCallback((): string[] => {
    const root = rootRef.current;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>(CARD)]
      .map((el) => {
        const r = el.getBoundingClientRect();
        // Cards in one column share a left edge; bucket it so a pixel of
        // rounding doesn't split a column in two.
        return { id: el.dataset.dragItem!, col: Math.round(r.left / 16), top: r.top };
      })
      .sort((a, b) => a.col - b.col || a.top - b.top)
      .map((c) => c.id);
  }, [rootRef]);

  /** What is selected, in reading order — the order a group lands in when it moves. */
  const ordered = useCallback(
    () => readingOrder().filter((id) => selectedRef.current.has(id)),
    [readingOrder]
  );

  /** ⌘-click toggles; Shift-click takes the range from the anchor (⌘⇧ adds it). */
  const pick = useCallback(
    (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      const additive = hasMod(e);
      if (e.shiftKey) {
        const order = readingOrder();
        const to = order.indexOf(id);
        const from = anchor.current ? order.indexOf(anchor.current) : -1;
        if (to !== -1) {
          const range =
            from === -1 ? [id] : order.slice(Math.min(from, to), Math.max(from, to) + 1);
          if (from === -1) anchor.current = id;
          setSelected((prev) => new Set(additive ? [...prev, ...range] : range));
          return;
        }
      }
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    },
    [readingOrder]
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    const root = rootRef.current;
    const target = e.target as HTMLElement;
    if (!enabled || !root || e.button !== 0 || e.pointerType !== "mouse") return;
    // React bubbles through portals: a press on the menu is not a press on the board.
    if (!root.contains(target) || target.closest(NOT_A_MARQUEE) || target.closest(CARD)) return;

    const additive = e.shiftKey || hasMod(e);
    const base = additive ? new Set(selectedRef.current) : new Set<string>();
    const scroller = root.querySelector<HTMLElement>("[data-board-scroller]");
    const startsInStrip = Boolean(scroller?.contains(target));
    const start = { x: e.clientX, y: e.clientY, scroll: scroller?.scrollLeft ?? 0 };
    const pointer = { x: e.clientX, y: e.clientY };
    let live = false;
    let frame = 0;

    // A drag across the board would otherwise paint a text selection over every title.
    document.documentElement.classList.add("board-marquee");

    // The box is anchored to the content, not the screen: when the strip pans
    // under a held pointer, the corner that started in it goes with it.
    const anchorX = () =>
      start.x - (startsInStrip && scroller ? scroller.scrollLeft - start.scroll : 0);

    const sweep = () => {
      const x0 = anchorX();
      const box: Box = {
        left: Math.min(x0, pointer.x),
        top: Math.min(start.y, pointer.y),
        right: Math.max(x0, pointer.x),
        bottom: Math.max(start.y, pointer.y),
      };
      const el = marqueeRef.current;
      if (el) {
        el.hidden = false;
        el.style.left = `${box.left}px`;
        el.style.top = `${box.top}px`;
        el.style.width = `${box.right - box.left}px`;
        el.style.height = `${box.bottom - box.top}px`;
      }
      const hits = new Set(base);
      const panned = scroller ? scroller.scrollLeft - start.scroll : 0;
      for (const card of root.querySelectorAll<HTMLElement>(CARD)) {
        const v = visibleBox(card, root, scroller, Math.max(0, panned), Math.max(0, -panned));
        if (!v) continue;
        if (v.right < box.left || v.left > box.right || v.bottom < box.top || v.top > box.bottom)
          continue;
        hits.add(card.dataset.dragItem!);
      }
      setSelected((prev) =>
        prev.size === hits.size && [...hits].every((id) => prev.has(id)) ? prev : hits
      );
    };

    // Eight weeks don't fit on one screen; a box that can't reach the far ones
    // would make you let go and start again.
    const tick = () => {
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const before = scroller.scrollLeft;
        if (pointer.x > r.right - EDGE_PX) scroller.scrollLeft += EDGE_SPEED;
        else if (pointer.x >= r.left && pointer.x < r.left + EDGE_PX) scroller.scrollLeft -= EDGE_SPEED;
        if (scroller.scrollLeft !== before) {
          // The grid puts the strip back where its last scroll event left it
          // on every render, and that event is asynchronous: the render this
          // sweep causes would snap the strip back before it arrived.
          scroller.dispatchEvent(new Event("scroll"));
          sweep();
        }
      }
      frame = requestAnimationFrame(tick);
    };

    const onMove = (ev: PointerEvent) => {
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      if (!live) {
        if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < SLOP) return;
        live = true;
        window.getSelection()?.removeAllRanges();
        frame = requestAnimationFrame(tick);
      }
      sweep();
    };

    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("board-marquee");
      if (marqueeRef.current) marqueeRef.current.hidden = true;
      // A press that never became a box was a click on nothing: let go of everything.
      if (!live && !additive) clear();
      else anchor.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  // A click anywhere off the board lets go, as it does in Notion.
  useEffect(() => {
    if (selected.size === 0) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (rootRef.current?.contains(t)) return;
      if (t?.closest?.('[role="menu"]')) return;
      clear();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selected.size, rootRef, clear]);

  // A selection can only hold what is on screen. Cards leave the board — done,
  // parked behind the fold, filtered out of the tray — and a selection that
  // outlives them is one Delete away from removing something nobody can see.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || selectedRef.current.size === 0) return;
    const present = new Set(
      [...root.querySelectorAll<HTMLElement>(CARD)].map((el) => el.dataset.dragItem!)
    );
    const kept = [...selectedRef.current].filter((id) => present.has(id));
    if (kept.length !== selectedRef.current.size) setSelected(new Set(kept));
  });

  return {
    selected,
    marqueeRef,
    clear,
    only,
    pick,
    ordered,
    /** Spread on the board's root. */
    rootProps: { onPointerDown },
  };
}
