import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, ActionColumn } from "../types";
import { useStore } from "../store/useStore";
import { Input } from "@/components/base/input/input";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { DotsGrid, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const COLUMNS: ActionColumn[] = ["backlog", "this_1on1", "parking", "done"];

/**
 * Which way the board points. Same columns and same stored values — a topic
 * for my boss is still `this_1on1` on disk — but the copy differs because the
 * job does: leading down I raise things *about them*, leading up I raise asks,
 * escalations and decisions I need *from them*.
 */
export type BoardDirection = "down" | "up";

const COLUMN_LABEL: Record<BoardDirection, Record<ActionColumn, string>> = {
  down: {
    backlog: "Backlog",
    this_1on1: "This 1:1",
    parking: "Parking",
    done: "Done",
  },
  up: {
    backlog: "Backlog",
    this_1on1: "This check-in",
    parking: "Parking",
    done: "Done",
  },
};

const ADD_PLACEHOLDER: Record<BoardDirection, string> = {
  down: "Talk about…",
  up: "Ask, escalate, flag…",
};

/** Distance before a pointer press counts as a drag rather than a tap. */
const DRAG_SLOP = 8;
/** Hold time before a touch turns into a drag instead of a scroll. */
const LONG_PRESS_MS = 300;

type DragState = {
  id: string;
  /** Viewport coordinates of the pointer, for the floating card. */
  x: number;
  y: number;
  /** Grab offset inside the card, so it doesn't jump under the finger. */
  dx: number;
  dy: number;
  width: number;
  over: ActionColumn | null;
};

export function TopicKanban({
  personId,
  direction = "down",
}: {
  personId: string;
  direction?: BoardDirection;
}) {
  const { actions, addAction, updateAction, setActionColumn, deleteAction } =
    useStore();
  const mine = actions.filter((a) => a.personId === personId);
  const [drafts, setDrafts] = useState<Partial<Record<ActionColumn, string>>>(
    {}
  );
  const [drag, setDrag] = useState<DragState | null>(null);

  // Column geometry is read on every move to decide the drop target.
  const columnRefs = useRef(new Map<ActionColumn, HTMLDivElement | null>());
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const byColumn = (col: ActionColumn) =>
    mine.filter((a) => (a.column ?? (a.done ? "done" : "backlog")) === col);

  const submit = (column: ActionColumn) => {
    const text = drafts[column]?.trim();
    if (!text) return;
    addAction(personId, text, undefined, column);
    setDrafts((d) => ({ ...d, [column]: "" }));
  };

  const columnAt = useCallback((x: number, y: number): ActionColumn | null => {
    for (const [col, el] of columnRefs.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return col;
    }
    return null;
  }, []);

  /**
   * HTML5 drag-and-drop never fires from a touch screen, which left the board
   * decorative on phones. This is a pointer-events drag: one implementation
   * for mouse, pen and finger.
   */
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      setDrag((d) =>
        d
          ? { ...d, x: e.clientX, y: e.clientY, over: columnAt(e.clientX, e.clientY) }
          : d
      );
    };
    const onUp = () => {
      const current = dragRef.current;
      if (current?.over) setActionColumn(current.id, current.over);
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
  }, [drag, columnAt, setActionColumn]);

  const dragged = drag ? mine.find((a) => a.id === drag.id) : null;

  return (
    <>
      <div
        className={cx(
          "scroll-contain flex gap-2 overflow-x-auto pb-1",
          // One column nearly fills a phone, and the strip snaps to it so a
          // horizontal flick lands somewhere sensible.
          "snap-x snap-mandatory [overscroll-behavior-x:contain]"
        )}
      >
        {COLUMNS.map((col) => {
          const items = byColumn(col);
          const canQuickAdd = col === "backlog" || col === "this_1on1";
          return (
            <div
              key={col}
              ref={(el) => {
                columnRefs.current.set(col, el);
              }}
              className={cx(
                "flex w-[78vw] max-w-[15rem] shrink-0 snap-start flex-col rounded-xl border bg-stone-50/60 sm:w-[11.5rem] dark:bg-stone-950/40",
                drag?.over === col
                  ? "border-teal-400 bg-teal-50/70 dark:border-teal-600 dark:bg-teal-950/30"
                  : "border-stone-200 dark:border-stone-800"
              )}
            >
              <div className="flex items-baseline justify-between px-2.5 pt-2 pb-1">
                <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                  {COLUMN_LABEL[direction][col]}
                </span>
                <span className="text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
                  {items.length}
                </span>
              </div>
              <ul className="flex min-h-[4rem] flex-1 flex-col gap-1.5 px-2 pb-2">
                {items.map((a) => (
                  <TopicCard
                    key={a.id}
                    action={a}
                    column={col}
                    direction={direction}
                    isDragging={drag?.id === a.id}
                    onDragStart={(state) => setDrag(state)}
                    onText={(text) => updateAction(a.id, { text })}
                    onMove={(next) => setActionColumn(a.id, next)}
                    onDelete={() => deleteAction(a.id)}
                  />
                ))}
              </ul>
              {canQuickAdd && (
                <form
                  className="border-t border-stone-200 p-2 dark:border-stone-800"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(col);
                  }}
                >
                  <Input
                    size="sm"
                    placeholder={ADD_PLACEHOLDER[direction]}
                    aria-label={`Add to ${COLUMN_LABEL[direction][col]}`}
                    value={drafts[col] ?? ""}
                    onChange={(value) =>
                      setDrafts((d) => ({ ...d, [col]: value }))
                    }
                  />
                </form>
              )}
            </div>
          );
        })}
      </div>

      {/* The card under the pointer, lifted out of the strip so it can cross
          column boundaries and the scroll container's clipping. */}
      {drag && dragged && (
        <li
          aria-hidden
          className="pointer-events-none fixed z-50 list-none rounded-lg border border-teal-400 bg-white px-2 py-1.5 text-xs leading-snug shadow-lg dark:border-teal-600 dark:bg-stone-900"
          style={{
            left: drag.x - drag.dx,
            top: drag.y - drag.dy,
            width: drag.width,
          }}
        >
          {dragged.text}
        </li>
      )}
    </>
  );
}

function TopicCard({
  action,
  column,
  direction,
  isDragging,
  onDragStart,
  onText,
  onMove,
  onDelete,
}: {
  action: Action;
  column: ActionColumn;
  direction: BoardDirection;
  isDragging: boolean;
  onDragStart: (state: DragState) => void;
  onText: (text: string) => void;
  onMove: (column: ActionColumn) => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const pending = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    x: number;
    y: number;
    started: boolean;
  } | null>(null);

  const begin = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onDragStart({
      id: action.id,
      x: clientX,
      y: clientY,
      dx: clientX - rect.left,
      dy: clientY - rect.top,
      width: rect.width,
      over: column,
    });
  };

  const clearPending = () => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  };

  useEffect(() => clearPending, []);

  return (
    <li
      ref={ref}
      className={cx(
        "group relative rounded-lg border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start gap-1 px-2 py-1.5">
        {/* An explicit handle: the card also holds an editable textarea, and a
            press anywhere would fight text selection and the caret. */}
        <button
          type="button"
          aria-label={`Move "${action.text || "topic"}"`}
          className="-ml-0.5 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-stone-400 active:cursor-grabbing hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400"
          onPointerDown={(e) => {
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
          }}
          onPointerMove={(e) => {
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
          }}
          onPointerUp={clearPending}
          onPointerCancel={clearPending}
          onContextMenu={(e) => e.preventDefault()}
        >
          <DotsGrid className="size-4" />
        </button>

        <textarea
          className={cx(
            "w-full resize-none border-0 bg-transparent p-0 text-xs leading-snug outline-none touch:text-md",
            action.done
              ? "text-stone-500 line-through dark:text-stone-400"
              : "text-stone-700 dark:text-stone-200"
          )}
          // Auto-grows instead of clipping at two lines.
          rows={1}
          ref={(el) => {
            if (!el) return;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          value={action.text}
          onChange={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
            onText(e.target.value);
          }}
        />

        <ButtonUtility
          size="xs"
          color="tertiary"
          icon={X}
          tooltip="Delete topic"
          className="shrink-0 opacity-0 touch:opacity-100 group-hover:opacity-100"
          onClick={onDelete}
        />
      </div>

      {/* The guaranteed path. Dragging is a nicety; this always works — with a
          keyboard, with a screen reader, and with a thumb. */}
      <label className="flex items-center gap-1 border-t border-stone-100 px-2 py-1 dark:border-stone-800">
        <span className="sr-only">Move "{action.text || "topic"}" to</span>
        <select
          value={column}
          onChange={(e) => onMove(e.target.value as ActionColumn)}
          className="min-h-8 w-full cursor-pointer touch:min-h-11 rounded border-0 bg-transparent py-0 text-[11px] text-stone-500 outline-none touch:text-md dark:text-stone-400"
        >
          {COLUMNS.map((c) => (
            <option key={c} value={c}>
              Move to {COLUMN_LABEL[direction][c]}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
