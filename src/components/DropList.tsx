import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { InlineComposer } from "./InlineComposer";
import type { BoardDnD } from "@/hooks/use-board-dnd";
import type { Topic } from "@/types";

/**
 * One droppable stack of cards.
 *
 * The insertion line is rendered *between* cards at the live drop index rather
 * than highlighting the whole zone, because in a templatized column the answer
 * to "where will this land" is an order, not a container.
 */
export function DropList({
  zone,
  topics,
  dnd,
  renderCard,
  onAdd,
  addPlaceholder,
  addLabel,
  empty,
  className,
  compact = true,
}: {
  zone: string;
  topics: Topic[];
  dnd: BoardDnD;
  renderCard: (topic: Topic) => ReactNode;
  onAdd?: (raw: string) => void;
  addPlaceholder?: string;
  /** What the closed composer says: "Add for Sarah". */
  addLabel?: string;
  empty?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const active = dnd.drag?.over === zone;
  // A board of permanently dashed empty boxes is 30 rectangles of chrome for a
  // hint you only need mid-drag. Targets reveal themselves when they matter.
  const dragging = Boolean(dnd.drag);
  const index = active ? dnd.drag!.index : -1;

  const line = (
    <li
      key="drop-line"
      aria-hidden
      className="h-0.5 list-none rounded-full bg-teal-600"
    />
  );

  const items: ReactNode[] = [];
  topics.forEach((topic, i) => {
    if (active && index === i) items.push(line);
    items.push(renderCard(topic));
  });
  if (active && index >= topics.length) items.push(line);

  return (
    <div
      ref={dnd.zoneRef(zone)}
      className={cx(
        "rounded-[12px] transition-colors",
        dragging && !active && "outline-[1.5px] outline-[var(--color-border-primary)] outline-dashed -outline-offset-2",
        active &&
          "bg-teal-50/80 outline-[1.5px] outline-teal-600 outline-dashed -outline-offset-2 dark:bg-teal-950/40",
        className
      )}
    >
      <ul className={cx("flex flex-col", compact ? "gap-1" : "gap-1.5")}>{items}</ul>
      {topics.length === 0 && !active && empty}
      {onAdd && !dragging && (
        <div className="mt-1 opacity-60 transition-opacity focus-within:opacity-100 group-hover/col:opacity-100 touch:opacity-100">
          <InlineComposer
            onAdd={onAdd}
            compact={compact}
            label={addLabel}
            placeholder={addPlaceholder ?? "Add a topic…  #tag !"}
          />
        </div>
      )}
    </div>
  );
}
