import type { ReactNode } from "react";

/**
 * Sortable table header cell. Sorting is exposed as a real button inside the
 * cell so keyboards and screen readers get the interaction the bare
 * clickable <th> never offered; `aria-sort` comes from the `sorted` prop.
 */
export function Th({
  children,
  onClick,
  sorted,
  className = "",
}: {
  children: ReactNode;
  /** Present = sortable. */
  onClick?: () => void;
  /** Current direction when this column drives the sort. */
  sorted?: "asc" | "desc";
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2.5 font-medium ${className}`}
      aria-sort={
        sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined
      }
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          /* The wide tables only appear from `sm` up, but "up" includes a
             tablet — where the header is still pressed with a thumb and the
             cell's own padding leaves the button 20px tall. The negative
             margin keeps the header row from growing by the difference. */
          className="inline-flex cursor-pointer items-center gap-0.5 font-medium select-none touch:-my-2.5 touch:min-h-11 hover:text-stone-600 dark:hover:text-stone-400 dark:text-stone-500"
        >
          {children}
          {sorted && <span aria-hidden>{sorted === "asc" ? "↑" : "↓"}</span>}
        </button>
      ) : (
        children
      )}
    </th>
  );
}
