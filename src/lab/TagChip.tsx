import { cx } from "@/utils/cx";
import type { LabTag } from "./types";

const CHIP = [
  "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-400",
  "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-400",
  "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400",
  "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-400",
  "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400",
  "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-400",
] as const;

const DOT = [
  "bg-teal-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-rose-500",
  "bg-orange-500",
] as const;

export function tagChipClass(tag: LabTag | undefined): string {
  if (!tag) return "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
  return CHIP[tag.color % CHIP.length];
}

export function tagDotClass(tag: LabTag | undefined): string {
  if (!tag) return "bg-stone-400";
  return DOT[tag.color % DOT.length];
}

/**
 * Two weights, and the quiet one is the default on cards.
 *
 * Six saturated pills stacked on a card turned every board into a rainbow, and
 * a tag is metadata — it should never out-shout the thing it describes. The
 * filled chip survives only where a tag *is* the subject: a filter pill, a
 * column header, a bulk-action target.
 */
export function TagChip({
  tag,
  ghost,
  solid,
}: {
  tag: LabTag;
  ghost?: boolean;
  solid?: boolean;
}) {
  if (!solid) {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-quaternary">
        <span
          className={cx("size-1.5 shrink-0 rounded-full", tagDotClass(tag))}
          aria-hidden
        />
        <span className={cx(ghost && "italic opacity-70")}>{tag.label}</span>
      </span>
    );
  }
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-px text-caption font-medium",
        tagChipClass(tag),
        ghost && "opacity-60 ring-1 ring-dashed ring-current"
      )}
    >
      <span className={cx("size-1.5 rounded-full", tagDotClass(tag))} aria-hidden />
      {tag.label}
    </span>
  );
}
