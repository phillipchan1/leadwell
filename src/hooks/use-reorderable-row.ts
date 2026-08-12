import { useCallback } from "react";
import { announce, positionLabel } from "@/lib/announce";
import { isTypingTarget } from "@/lib/keys";

export type MoveResult = { index: number; total: number } | null;

/**
 * Keyboard reordering and removal for a row in an ordered list.
 *
 * Dragging a card is the only way to reorder anything in Leadwell today, which
 * means reordering does not exist for a keyboard at all. This is the equivalent:
 * ⌥↑ / ⌥↓ move the focused row, and the new position is spoken through the live
 * region — a silent move is indistinguishable from a move that didn't happen.
 *
 * **Alt, not Ctrl/⌘.** ⌘↑/⌘↓ is "jump to start/end of document" on macOS and
 * ⌘↵ is already taken by peek↔focus, so Alt is the modifier that's free on both
 * platforms for this. It's the same chord Notion and Linear use for the same
 * gesture, which is worth more here than internal consistency with ⌘.
 *
 * Delete is deliberately narrower: it fires only when the row's own handle has
 * focus, never from inside the row's text field, where Backspace has to keep
 * meaning Backspace. Removal is paired with the undo the caller supplies —
 * a shortcut that destroys a row with no way back is worse than no shortcut.
 */
export function useReorderableRow({
  label,
  onMove,
  onDelete,
}: {
  /** What the row is, for the announcement: `"Budget review"`. */
  label: string;
  onMove: (direction: -1 | 1) => MoveResult;
  /** Omit to leave Delete unbound for this row. */
  onDelete?: () => void;
}) {
  const move = useCallback(
    (direction: -1 | 1) => {
      const at = onMove(direction);
      announce(
        at
          ? `Moved ${label} to ${positionLabel(at.index, at.total)}.`
          : `${label} is already ${direction < 0 ? "first" : "last"}.`
      );
    },
    [label, onMove]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        // In a textarea macOS binds ⌥↑/⌥↓ to "move by paragraph". Someone
        // mid-sentence means the caret, not the row.
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        move(e.key === "ArrowUp" ? -1 : 1);
        return;
      }

      if (!onDelete) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Only from the handle. Anywhere else in the row, these keys belong to
      // whatever has focus.
      if (!(e.target as HTMLElement).closest?.("[data-row-handle]")) return;
      e.preventDefault();
      e.stopPropagation();
      onDelete();
    },
    [move, onDelete]
  );

  return {
    /** Spread on the row element (`<li>`, `<tr>`, the card wrapper). */
    rowProps: { onKeyDown },
    /**
     * Spread on the row's grab handle — the button that already exists for the
     * mouse. It becomes the keyboard's anchor for the row's own actions.
     */
    handleProps: {
      "data-row-handle": "true",
      "aria-keyshortcuts": onDelete
        ? "Alt+ArrowUp Alt+ArrowDown Delete"
        : "Alt+ArrowUp Alt+ArrowDown",
    },
  };
}
