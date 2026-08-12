import { useCallback, useMemo, useRef, useState } from "react";
import type { Topic, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { useCardDrag } from "@/hooks/use-card-drag";
import {
  boardColumns,
  looseTopics,
  nextSlotAfter,
  parseColumnKey,
  plannedSlots,
  slotKey,
  type BoardColumn,
  type Slot,
} from "../lib/topics";
import { MEETING_LABEL, todayISO } from "../lib/readiness";
import { sessionSummary } from "../lib/session";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { DotsGrid, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * The planner: a running list of topics on the left, the next few occurrences
 * of this meeting as columns, and somewhere for what's covered.
 *
 * ── Why the columns are dates ─────────────────────────────────────────────
 * The board this replaces had one queue column, "This 1:1", which could only
 * mean *the next one*. That lets you queue but not plan. Making each column an
 * occurrence is what turns it into a scaffold: budget on the 17th, hiring on
 * the 24th, and you can see the shape of the next month.
 *
 * ── Why covered is a column and not a drawer ──────────────────────────────
 * Dragging a card into "Covered" is how you say you talked about it. The
 * gesture only exists if the target does, and a topic that can be finished is
 * the difference between this and a list that only grows.
 *
 * ── The amber ─────────────────────────────────────────────────────────────
 * A column whose date has passed keeps anything still open in it, in amber,
 * with the two buttons that resolve it. That's the failure mode this feature
 * exists to catch: a topic assigned to a meeting and quietly never finished.
 */

/** Copy differs by direction: leading up you raise asks, not observations. */
export type BoardDirection = "down" | "up";

const ADD_PLACEHOLDER: Record<BoardDirection, string> = {
  down: "Talk about…",
  up: "Ask, escalate, flag…",
};

export function TopicBoard({
  meeting,
  direction = "down",
  selectedSlotKey,
  onSelectWeek,
}: {
  meeting: TrackedMeeting;
  direction?: BoardDirection;
  selectedSlotKey?: string | null;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
}) {
  const {
    sessions,
    topics,
    addTopic,
    updateTopic,
    placeTopic,
    coverTopic,
    rollTopic,
    deleteTopic,
    addSession,
  } = useStore();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [allCovered, setAllCovered] = useState(false);
  const today = todayISO();

  const columns = useMemo(
    () => boardColumns(meeting, sessions, topics, today, { allCovered }),
    [meeting, sessions, topics, today, allCovered]
  );
  const loose = useMemo(
    () => looseTopics(topics, sessions, meeting.id, today),
    [topics, sessions, meeting.id, today]
  );

  /**
   * Put a topic in a column. Dropping on a projected date is what makes the
   * occurrence real — planning into it is the booking.
   */
  const place = useCallback(
    (topicId: string, key: string) => {
      const target = parseColumnKey(key);
      switch (target.kind) {
        case "covered":
          coverTopic(topicId);
          return;
        case "lane":
          placeTopic(topicId, { lane: target.lane });
          return;
        case "session":
          placeTopic(topicId, { sessionId: target.sessionId });
          return;
        case "projected": {
          const sessionId = addSession({
            meetingId: meeting.id,
            date: target.date,
          });
          placeTopic(topicId, { sessionId });
          return;
        }
      }
    },
    [addSession, coverTopic, meeting.id, placeTopic]
  );

  const { drag, columnRef, handleProps } = useCardDrag(place);
  const dragged = drag ? topics.find((t) => t.id === drag.id) : null;

  /** Push a topic into the next occurrence, materializing it if it's a guess. */
  const roll = useCallback(
    (topic: Topic) => {
      const slots = plannedSlots(meeting, sessions, topics, today);
      const next = nextSlotAfter(slots, topic.sessionId);
      if (!next) {
        // Nothing ahead to push into — back to the running list, still counted.
        rollTopic(topic.id, undefined);
        return;
      }
      const sessionId =
        next.sessionId ??
        addSession({ meetingId: meeting.id, date: next.date });
      rollTopic(topic.id, sessionId);
    },
    [addSession, meeting, rollTopic, sessions, today, topics]
  );

  const submit = (column: BoardColumn) => {
    const text = drafts[column.key]?.trim();
    if (!text) return;
    const target = parseColumnKey(column.key);
    if (target.kind === "projected") {
      const sessionId = addSession({
        meetingId: meeting.id,
        date: target.date,
      });
      addTopic(meeting.id, text, { sessionId });
    } else if (target.kind === "session") {
      addTopic(meeting.id, text, { sessionId: target.sessionId });
    } else if (target.kind === "lane") {
      addTopic(meeting.id, text, { lane: target.lane });
    }
    setDrafts((d) => ({ ...d, [column.key]: "" }));
  };

  const moveOptions = columns.map((c) => ({ key: c.key, label: c.label }));

  const sessionForColumn = (col: BoardColumn) => {
    if (!col.slot?.sessionId) return null;
    return sessions.find((s) => s.id === col.slot!.sessionId) ?? null;
  };

  return (
    <div className="space-y-2">
      {loose.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="min-w-0 flex-1 text-xs text-amber-900 dark:text-amber-400">
            {loose.length} topic{loose.length === 1 ? " was" : "s were"} planned
            for a {MEETING_LABEL[meeting.subjectKind]} that's already been and
            gone.
          </p>
          <Button
            size="sm"
            color="secondary"
            className="shrink-0"
            onClick={() => loose.forEach(roll)}
          >
            Roll forward
          </Button>
        </div>
      )}

      <div
        className={cx(
          "scroll-contain flex gap-2 overflow-x-auto pb-1",
          // One column nearly fills a phone, and the strip snaps to it so a
          // horizontal flick lands somewhere sensible.
          "snap-x snap-mandatory [overscroll-behavior-x:contain]"
        )}
      >
        {columns.map((col) => {
          const past = Boolean(col.slot?.past);
          const canAdd = !col.covered;
          const isWeek = Boolean(col.slot);
          const isActive = col.slot
            ? selectedSlotKey === slotKey(col.slot)
            : false;
          const session = sessionForColumn(col);
          const notesPreview = session ? sessionSummary(session) : "";
          return (
            <div
              key={col.key}
              ref={columnRef(col.key)}
              className={cx(
                // The panel it lives in is now the wide half of the split, so
                // a column can hold a phrase on one line instead of four.
                "flex w-[78vw] max-w-[15rem] shrink-0 snap-start flex-col rounded-xl border bg-stone-50/60 sm:w-[14rem] sm:max-w-none dark:bg-stone-950/40",
                drag?.over === col.key
                  ? "border-teal-400 bg-teal-50/70 dark:border-teal-600 dark:bg-teal-950/30"
                  : isActive
                    ? "border-teal-500 ring-2 ring-teal-500/30 dark:border-teal-600"
                    : past
                      ? "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                      : "border-stone-200 dark:border-stone-800"
              )}
            >
              {isWeek ? (
                <button
                  type="button"
                  onClick={() => col.slot && onSelectWeek?.(col.key, col.slot)}
                  aria-expanded={isActive}
                  className="px-2.5 pt-2 pb-1 text-left transition-colors hover:bg-white/50 dark:hover:bg-stone-900/40"
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span
                      className={cx(
                        "truncate text-[11px] font-semibold tracking-wide uppercase",
                        past
                          ? "text-amber-700 dark:text-amber-500"
                          : "text-stone-500 dark:text-stone-400"
                      )}
                    >
                      {col.label}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
                      {col.topics.length}
                    </span>
                  </div>
                  {col.hint && (
                    <div
                      className={cx(
                        "truncate text-[10px]",
                        past
                          ? "text-amber-700 dark:text-amber-500"
                          : "text-stone-400 dark:text-stone-500"
                      )}
                    >
                      {col.hint}
                    </div>
                  )}
                  {notesPreview && (
                    <div className="mt-0.5 truncate text-[10px] text-teal-700 dark:text-teal-400">
                      {notesPreview}
                    </div>
                  )}
                </button>
              ) : (
                <div className="px-2.5 pt-2 pb-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                      {col.label}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
                      {col.topics.length}
                    </span>
                  </div>
                  {col.hint && (
                    <div className="truncate text-[10px] text-stone-400 dark:text-stone-500">
                      {col.hint}
                    </div>
                  )}
                </div>
              )}

              <ul className="flex min-h-[4rem] flex-1 flex-col gap-1.5 px-2 pb-2">
                {col.topics.map((t) => (
                  <TopicCard
                    key={t.id}
                    topic={t}
                    columnKey={col.key}
                    past={past}
                    inSlot={Boolean(col.slot?.sessionId)}
                    covered={t.status !== "open"}
                    isDragging={drag?.id === t.id}
                    moveOptions={moveOptions}
                    handleProps={handleProps}
                    onText={(text) => updateTopic(t.id, { text })}
                    onMove={(key) => place(t.id, key)}
                    onCover={(covered) => coverTopic(t.id, covered)}
                    onRoll={() => roll(t)}
                    onBacklog={() => placeTopic(t.id, { lane: "backlog" })}
                    onDelete={() => deleteTopic(t.id)}
                  />
                ))}
              </ul>

              {canAdd && (
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
                    aria-label={`Add to ${col.label}`}
                    value={drafts[col.key] ?? ""}
                    onChange={(value) =>
                      setDrafts((d) => ({ ...d, [col.key]: value }))
                    }
                  />
                </form>
              )}

              {col.covered && !allCovered && col.topics.length > 0 && (
                <div className="border-t border-stone-200 p-2 dark:border-stone-800">
                  <Button
                    size="sm"
                    color="link-gray"
                    onClick={() => setAllCovered(true)}
                  >
                    Show all
                  </Button>
                </div>
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
    </div>
  );
}

function TopicCard({
  topic,
  columnKey,
  past,
  inSlot,
  covered,
  isDragging,
  moveOptions,
  handleProps,
  onText,
  onMove,
  onCover,
  onRoll,
  onBacklog,
  onDelete,
}: {
  topic: Topic;
  columnKey: string;
  past: boolean;
  /** Slotted into a booked occurrence — gets a covered checkbox. */
  inSlot: boolean;
  covered: boolean;
  isDragging: boolean;
  moveOptions: { key: string; label: string }[];
  handleProps: ReturnType<typeof useCardDrag>["handleProps"];
  onText: (text: string) => void;
  onMove: (key: string) => void;
  onCover: (covered: boolean) => void;
  onRoll: () => void;
  onBacklog: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);

  return (
    <li
      ref={ref}
      className={cx(
        "group relative rounded-lg border bg-white dark:bg-stone-900",
        past
          ? "border-amber-300 dark:border-amber-800"
          : "border-stone-200 dark:border-stone-700",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start gap-1 px-2 py-1.5 touch:gap-2">
        {inSlot ? (
          <Checkbox
            size="sm"
            aria-label={`Covered "${topic.text || "topic"}"`}
            isSelected={covered}
            onChange={onCover}
            className="mt-1 shrink-0"
          />
        ) : (
          /* An explicit handle: the card also holds an editable textarea, and a
             press anywhere would fight text selection and the caret.
             `select-none` and the callout suppression matter because the touch
             drag starts on a 300ms hold — the same gesture iOS uses to raise
             the selection handles and the copy/lookup callout. */
          <button
            type="button"
            aria-label={`Move "${topic.text || "topic"}"`}
            className="-ml-0.5 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-stone-400 select-none touch:-my-1.5 touch:size-11 [-webkit-touch-callout:none] active:cursor-grabbing hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400"
            {...handleProps(topic.id, columnKey, ref)}
          >
            <DotsGrid className="size-4" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <textarea
            className={cx(
              "w-full resize-none border-0 bg-transparent p-0 text-xs leading-snug outline-none touch:text-md",
              covered
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
            value={topic.text}
            onChange={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
              onText(e.target.value);
            }}
          />
          {topic.carried > 1 && !covered && (
            <span
              className="mt-0.5 inline-block rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-500"
              title="Pushed to a later meeting this many times"
            >
              pushed {topic.carried}×
            </span>
          )}
        </div>

        {inSlot ? (
          <button
            type="button"
            aria-label={`Move "${topic.text || "topic"}"`}
            className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-stone-400 opacity-0 active:cursor-grabbing group-hover:opacity-100 hover:text-stone-500 touch:opacity-100 dark:text-stone-600 dark:hover:text-stone-400"
            {...handleProps(topic.id, columnKey, ref)}
          >
            <DotsGrid className="size-3.5" />
          </button>
        ) : null}

        <ButtonUtility
          size="xs"
          color="tertiary"
          icon={X}
          tooltip="Delete topic"
          className="shrink-0 opacity-0 touch:opacity-100 group-hover:opacity-100"
          onClick={onDelete}
        />
      </div>

      {/* Past weeks: quick outs for what didn't get covered. Both are routing
          choices rather than opposites, so they take the 8px peer spacing. */}
      {past && !covered && (
        <div className="flex flex-wrap items-center gap-1 border-t border-amber-200 px-2 py-1 touch:gap-2 dark:border-amber-900/70">
          <Button size="sm" color="link-gray" onClick={onRoll}>
            → Next week
          </Button>
          <Button size="sm" color="link-gray" onClick={onBacklog}>
            Backlog
          </Button>
        </div>
      )}

      {/* The guaranteed path. Dragging is a nicety; this always works — with a
          keyboard, with a screen reader, and with a thumb. */}
      <label className="flex items-center gap-1 border-t border-stone-100 px-2 py-1 dark:border-stone-800">
        <span className="sr-only">Move "{topic.text || "topic"}" to</span>
        <select
          value={columnKey}
          onChange={(e) => onMove(e.target.value)}
          className="min-h-8 w-full cursor-pointer touch:min-h-11 rounded border-0 bg-transparent py-0 text-[11px] text-stone-500 outline-none touch:text-md dark:text-stone-400"
        >
          {moveOptions.map((o) => (
            <option key={o.key} value={o.key}>
              Move to {o.label}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
