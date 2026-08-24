import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Check, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import type { BoardDnD } from "@/hooks/use-board-dnd";
import { TagChip } from "./TagChip";
import type { Tag, Topic } from "@/types";

function shortDate(iso?: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One topic.
 *
 * The title is the only thing at full contrast. Everything else — tags, meeting,
 * push count, why it came back — is one muted line underneath, because a card
 * that shouts six things at once reads as noise and the eye stops scanning. The
 * hover toolbar is gone: dragging works anywhere on the card and `a` opens the
 * move palette, so a button that duplicated both was pure decoration sitting on
 * top of the content.
 */
export function TopicCard({
  topic,
  zone,
  tags,
  meetingLabel,
  compact,
  showCheckbox,
  showMeeting,
  hideTagIds,
  isDragging,
  handleProps,
  onCover,
  onDelete,
  onOpen,
  onPromote,
  onPark,
  selected,
  onToggleSelect,
  focused,
}: {
  topic: Topic;
  zone: string;
  tags: Tag[];
  meetingLabel?: string;
  compact?: boolean;
  showCheckbox?: boolean;
  showMeeting?: boolean;
  /** Tags the container already states — a Training band needn't say Training. */
  hideTagIds?: string[];
  isDragging?: boolean;
  handleProps: BoardDnD["handleProps"];
  onCover?: (covered: boolean) => void;
  onDelete?: () => void;
  onOpen?: () => void;
  onPromote?: () => void;
  onPark?: () => void;
  selected?: boolean;
  onToggleSelect?: (shift: boolean) => void;
  focused?: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const grab = handleProps(topic.id, zone, ref as RefObject<HTMLElement | null>);
  /*
   * The whole card is the drag area — a 20px dot is a target you have to aim
   * for, and this board asks you to move things constantly. Controls opt out by
   * tag so a checkbox tick stays a tick; the drag only begins past the slop
   * threshold anyway, so the two never compete.
   */
  const down = useRef<{ x: number; y: number } | null>(null);
  const cardGrab = {
    ...grab,
    onPointerDown: (e: ReactPointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(
          'input, select, textarea, a, label, [role="checkbox"], button'
        )
      ) {
        return;
      }
      grab.onPointerDown(e);
    },
    /*
     * A press that never travelled is a click, and a click opens the idea. The
     * distance check is what keeps "drag to the next week" from also opening a
     * panel every time you let go.
     */
    onClick: (e: ReactMouseEvent) => {
      if (!onOpen) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, select, textarea, a, label, [role="checkbox"], button')) {
        return;
      }
      const start = down.current;
      down.current = null;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      onOpen();
    },
  };

  const tagById = new Map(tags.map((t) => [t.id, t]));
  const covered = topic.status !== "open";
  const aging = topic.carried >= 3;
  const hidden = new Set(hideTagIds ?? []);
  const shownTags = (topic.tagIds ?? [])
    .filter((id) => !hidden.has(id))
    .map((id) => tagById.get(id))
    .filter((t): t is Tag => Boolean(t));


  // One muted line, assembled in priority order.
  const meta: React.ReactNode[] = [];
  if (topic.returnedOn && !covered) {
    meta.push(
      <span key="ret" className="text-amber-700 dark:text-amber-500">
        not covered {shortDate(topic.returnedFromDate)}
        {topic.carried > 1 ? ` · ${topic.carried}×` : ""}
      </span>
    );
  } else if (topic.carried > 0 && !covered) {
    meta.push(
      <span key="pushed" className="text-amber-700 dark:text-amber-500">
        pushed {topic.carried}×
      </span>
    );
  }
  const points = topic.points ?? [];
  if (points.length > 0) {
    const done = points.filter((pt) => pt.done).length;
    meta.push(
      <span key="pts" className="tabular-nums">
        {done}/{points.length} points
      </span>
    );
  }
  if (topic.detail?.trim()) {
    meta.push(
      <span key="notes" className="opacity-70">
        notes
      </span>
    );
  }
  for (const tag of shownTags) meta.push(<TagChip key={tag.id} tag={tag} />);
  if (showMeeting && meetingLabel) {
    meta.push(<span key="mtg">{meetingLabel}</span>);
  }

  return (
    <li
      ref={ref}
      data-topic-id={topic.id}
      data-drag-item={topic.id}
      tabIndex={0}
      className={cx(
        "group relative list-none rounded-lg border bg-primary outline-none transition",
        aging && !covered
          ? "border-amber-300 dark:border-amber-800/70"
          : "border-stone-200 dark:border-stone-800",
        isDragging && "opacity-40",
        selected && "border-teal-500 ring-1 ring-teal-500",
        focused && !selected && "ring-1 ring-teal-400"
      )}
    >
      <div
        {...cardGrab}
        className={cx(
          "flex cursor-grab items-start active:cursor-grabbing",
          compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-2.5 py-2"
        )}
      >
        {onToggleSelect && (
          <button
            type="button"
            role="checkbox"
            aria-checked={Boolean(selected)}
            aria-label={`Select “${topic.text}”`}
            onClick={(e) => onToggleSelect(e.shiftKey)}
            className={cx(
              "mt-px flex size-3.5 shrink-0 items-center justify-center rounded border transition",
              selected
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-stone-300 hover:border-teal-500 dark:border-stone-600"
            )}
          >
            {selected && <Check className="size-2.5" />}
          </button>
        )}

        {showCheckbox && onCover && (
          <Checkbox
            size="sm"
            aria-label={`Covered “${topic.text}”`}
            isSelected={covered}
            onChange={onCover}
            className="mt-px shrink-0"
          />
        )}

        <div className="min-w-0 flex-1">
          {/* The hero. Nothing else on the card competes with it. */}
          <div
            className={cx(
              "text-xs leading-snug",
              covered
                ? "text-quaternary line-through"
                : "text-stone-800 dark:text-stone-100",
              topic.urgent && !covered && "font-semibold"
            )}
          >
            {topic.urgent && !covered && (
              <span className="mr-1 text-rose-600" aria-label="Urgent">
                !
              </span>
            )}
            {topic.text}
          </div>

          {meta.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-quaternary">
              {meta}
            </div>
          )}

          {/* Only surfaces once a topic has been pushed enough to be a problem. */}
          {aging && !covered && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-caption">
              <button
                type="button"
                onClick={onPark}
                className="text-quaternary hover:underline"
              >
                park
              </button>
              <button
                type="button"
                onClick={onPromote}
                className="font-medium text-amber-700 hover:underline dark:text-amber-500"
              >
                make it an action item
              </button>
            </div>
          )}
        </div>

        {onDelete && (
          <ButtonUtility
            size="xs"
            color="tertiary"
            icon={X}
            tooltip="Delete"
            className="shrink-0 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-60 hover:!opacity-100"
            onClick={onDelete}
          />
        )}
      </div>
    </li>
  );
}
