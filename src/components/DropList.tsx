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
      className="h-0.5 list-none rounded-full bg-teal-500"
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
        "rounded-lg transition",
        dragging &&
          !active &&
          "border border-dashed border-stone-300 dark:border-stone-700",
        active &&
          "border border-teal-400 bg-teal-50/60 dark:bg-teal-950/30 dark:border-teal-600",
        !dragging && "border border-transparent",
        className
      )}
    >
      <ul className={cx(compact ? "space-y-1" : "space-y-1.5")}>{items}</ul>
      {topics.length === 0 && !active && empty}
      {onAdd && (
        <div className="opacity-0 transition focus-within:opacity-100 group-hover/col:opacity-100">
          <InlineComposer
            onAdd={onAdd}
            compact={compact}
            placeholder={addPlaceholder ?? "Add a topic…  #tag !"}
          />
        </div>
      )}
    </div>
  );
}
