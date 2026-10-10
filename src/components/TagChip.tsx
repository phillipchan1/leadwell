import { cx } from "@/utils/cx";
import type { Tag } from "@/types";

const CHIP = [
  "bg-tag1-soft text-tag1-ink",
  "bg-tag2-soft text-tag2-ink",
  "bg-tag3-soft text-tag3-ink",
  "bg-tag4-soft text-tag4-ink",
  "bg-tag5-soft text-tag5-ink",
  "bg-tag6-soft text-tag6-ink",
] as const;

const DOT = [
  "bg-tag1",
  "bg-tag2",
  "bg-tag3",
  "bg-tag4",
  "bg-tag5",
  "bg-tag6",
] as const;

export function tagChipClass(tag: Tag | undefined): string {
  if (!tag) return "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
  return CHIP[tag.color % CHIP.length];
}

export function tagDotClass(tag: Tag | undefined): string {
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
  tag: Tag;
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
