import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { Check, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import type { BoardDnD } from "@/hooks/use-board-dnd";
import { tagChipClass, tagDotClass } from "./TagChip";
import type { Tag, Topic } from "@/types";
import { todayISO } from "@/lib/readiness";

function shortDate(iso?: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One idea on the Ideas board.
 *
 * The title is the only thing at full contrast. Everything else — tags, the
 * meeting, how often it slipped, why it came back — sits underneath, quieter,
 * because a card that shouts six things at once reads as noise and the eye
 * stops scanning. A card that came back says so first: it is the one thing
 * here you have already made a decision about once.
 */
export function TopicCard({
  topic,
  zone,
  tags,
  meetingLabel,
  showMeeting,
  hideTagIds,
  isDragging,
  handleProps,
  onDelete,
  onOpen,
  onPromote,
  onPark,
  onUnpark,
  selected,
  selecting,
  onToggleSelect,
}: {
  topic: Topic;
  zone: string;
  tags: Tag[];
  meetingLabel?: string;
  showMeeting?: boolean;
  /** Tags the column already states — a Training column needn't say Training. */
  hideTagIds?: string[];
  isDragging?: boolean;
  handleProps: BoardDnD["handleProps"];
  onDelete?: () => void;
  onOpen?: () => void;
  /** Turn a topic that keeps slipping into an action item. Needs a meeting. */
  onPromote?: () => void;
  onPark?: () => void;
  onUnpark?: () => void;
  selected?: boolean;
  /** Something on the board is selected, so every card shows its box. */
  selecting?: boolean;
  onToggleSelect?: (shift: boolean) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const grab = handleProps(topic.id, zone, ref as RefObject<HTMLElement | null>);
  /*
   * The whole card is the drag area. Controls opt out so a tick stays a tick;
   * the drag only begins past the slop threshold anyway, so the two never
   * compete.
   */
  const down = useRef<{ x: number; y: number } | null>(null);
  const controls = 'input, select, textarea, a, label, [role="checkbox"], button';
  const cardGrab = {
    ...grab,
    onPointerDown: (e: ReactPointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
      if ((e.target as HTMLElement | null)?.closest(controls)) return;
      grab.onPointerDown(e);
    },
    // A press that never travelled is a click, and a click opens the idea.
    onClick: (e: ReactMouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest(controls)) return;
      const start = down.current;
      down.current = null;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      if (selecting && onToggleSelect) {
        onToggleSelect(e.shiftKey);
        return;
      }
      onOpen?.();
    },
  };

  const tagById = new Map(tags.map((t) => [t.id, t]));
  const covered = topic.status !== "open";
  const aging = topic.carried >= 3 && !covered && topic.lane !== "parked";
  const hidden = new Set(hideTagIds ?? []);
  const shownTags = (topic.tagIds ?? [])
    .filter((id) => !hidden.has(id))
    .map((id) => tagById.get(id))
    .filter((t): t is Tag => Boolean(t));
  const cameBack = Boolean(topic.returnedOn) && !covered;
  const points = topic.points ?? [];
  const late = topic.dueDate && topic.dueDate < todayISO();

  const meta: React.ReactNode[] = [];
  for (const tag of shownTags) {
    meta.push(
      <span
        key={tag.id}
        className={cx(
          "inline-flex h-[21px] items-center gap-1.5 rounded-[6px] px-1.5 font-sans text-[11px] font-medium normal-case",
          tagChipClass(tag)
        )}
      >
        <i aria-hidden className={cx("size-[7px] rounded-[2px]", tagDotClass(tag))} />
        {tag.label}
      </span>
    );
  }
  if (topic.carried > 1 && !covered) {
    meta.push(
      <span key="pushed" className="text-cond-watch-ink">
        Pushed {topic.carried}×
      </span>
    );
  }
  if (topic.dueDate && !covered) {
    meta.push(
      <span key="due" className={late ? "text-cond-critical-ink" : undefined}>
        Due {shortDate(topic.dueDate)}
      </span>
    );
  }
  if (points.length > 0) {
    meta.push(
      <span key="pts">
        {points.filter((pt) => pt.done).length}/{points.length} points
      </span>
    );
  }
  if (topic.detail?.trim()) meta.push(<span key="notes">Notes</span>);
  if (showMeeting && meetingLabel) {
    meta.push(
      <span key="mtg" className="font-serif text-[12.5px] tracking-normal text-tertiary normal-case">
        {meetingLabel}
      </span>
    );
  }

  return (
    <li
      ref={ref}
      data-topic-id={topic.id}
      data-drag-item={topic.id}
      className={cx(
        "group/card relative list-none rounded-[11px] border bg-primary transition-[border-color,box-shadow]",
        selected
          ? "border-transparent shadow-[0_0_0_1.5px_var(--color-teal-600)]"
          : cameBack
            ? "border-cond-watch shadow-[inset_3px_0_0_var(--color-cond-watch)]"
            : "border-secondary shadow-[0_1px_1.5px_rgba(10,34,37,0.05)] hover:border-primary hover:shadow-[0_2px_6px_-2px_rgba(10,34,37,0.14)]",
        isDragging && "opacity-35"
      )}
    >
      <div
        {...cardGrab}
        className="flex cursor-grab items-start gap-2.5 px-3 py-2.5 active:cursor-grabbing"
      >
        {onToggleSelect && (
          <button
            type="button"
            role="checkbox"
            aria-checked={Boolean(selected)}
            aria-label={`Select “${topic.text}”`}
            onClick={(e) => onToggleSelect(e.shiftKey)}
            className={cx(
              "mt-px flex size-4 shrink-0 items-center justify-center rounded-full border transition",
              selected
                ? "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500 dark:text-stone-950"
                : "border-primary hover:border-teal-500",
              !selected && !selecting && "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100",
              // Bulk editing is a desk job; on a phone a tap opens the idea.
              "touch:hidden"
            )}
          >
            {selected && <Check className="size-2.5" />}
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {cameBack && (
            <span className="font-mono text-[10px] tracking-[0.04em] text-cond-watch-ink uppercase">
              Came back
              {topic.returnedFromDate ? ` · not covered ${shortDate(topic.returnedFromDate)}` : ""}
            </span>
          )}
          <p
            className={cx(
              "text-[13.5px] leading-[19px] break-words",
              covered ? "text-quaternary line-through" : "text-primary"
            )}
          >
            {topic.urgent && !covered && (
              <span className="mr-1 font-semibold text-cond-critical-ink" aria-label="Urgent">
                !
              </span>
            )}
            {topic.text}
          </p>

          {meta.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] tracking-[0.02em] text-quaternary uppercase">
              {meta}
            </div>
          )}

          {/* Only surfaces once a topic has slipped enough to be a pattern. */}
          {(aging || onUnpark) && (
            <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[12px] font-semibold">
              {onUnpark ? (
                <button type="button" onClick={onUnpark} className="text-teal-700 hover:underline dark:text-teal-400">
                  Bring it back
                </button>
              ) : (
                <>
                  <button type="button" onClick={onPark} className="text-tertiary hover:underline">
                    Park it
                  </button>
                  {onPromote && (
                    <button type="button" onClick={onPromote} className="text-cond-watch-ink hover:underline">
                      Make it an action item
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {onDelete && (
          <button
            type="button"
            aria-label={`Delete “${topic.text}”`}
            title="Delete"
            onClick={onDelete}
            className="-mt-0.5 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-quaternary opacity-0 transition hover:bg-secondary hover:text-secondary group-hover/card:opacity-100 focus-visible:opacity-100 touch:hidden"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
