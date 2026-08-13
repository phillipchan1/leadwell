import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Makes a non-button element behave like one.
 *
 * The app has several rows and cards that open an entity when clicked and are
 * structurally not buttons — a `<tr>`, a React Flow node's card, a row that
 * contains its own controls (a `<button>` inside a `<button>` is invalid HTML
 * and browsers un-nest it, which breaks the inner control).
 *
 * Where a real `<button>` fits, use one. This is for the cases where it
 * doesn't, and it gives them the full contract rather than half of it: reachable
 * by Tab, activated by both Enter *and* Space, announced with a role and a
 * name, and — critically — Space is prevented from scrolling the page, which is
 * the bug every hand-rolled version of this ships with.
 */
type Options = {
  /** Accessible name. Required — a row's text alone is rarely the answer. */
  label: string;
  /** Renders `aria-current` for the row the app considers open. */
  selected?: boolean;
  disabled?: boolean;
};

function activation(onActivate: () => void, { disabled }: Options) {
  return {
    tabIndex: disabled ? -1 : 0,
    onClick: disabled ? undefined : onActivate,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (disabled) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      // Only when the row itself has focus — Enter inside a nested input or
      // button belongs to that control, not to opening the row.
      if (e.target !== e.currentTarget) return;
      // Space scrolls the page by default, which is never what activating a
      // row should also do.
      e.preventDefault();
      onActivate();
    },
  };
}

/** For a clickable card or `<div>` that is not inside a table. */
export function rowActivationProps(onActivate: () => void, options: Options) {
  return {
    ...activation(onActivate, options),
    role: "button" as const,
    "aria-label": options.label,
    "aria-current": options.selected ? ("true" as const) : undefined,
    "aria-disabled": options.disabled || undefined,
  };
}

/**
 * The same contract for a `<tr>`, minus the role.
 *
 * A `role="button"` on a table row replaces its `row` role, which costs a
 * screen-reader user the table entirely — no row/column announcements, no
 * navigation by cell. A focusable row that answers Enter is the pattern every
 * real data table uses, and it keeps the markup honest: this *is* a row, it
 * just also opens.
 */
export function tableRowActivationProps(
  onActivate: () => void,
  options: Options
) {
  return {
    ...activation(onActivate, options),
    "aria-label": options.label,
    "aria-current": options.selected ? ("true" as const) : undefined,
  };
}
