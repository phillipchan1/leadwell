import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import type { CurriculumSlot, Topic, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { useBoardDnD } from "@/hooks/use-board-dnd";
import { InlineComposer } from "./InlineComposer";
import { TopicDetail } from "./TopicDetail";
import {
  boardLayout,
  curriculumBalance,
  curriculumOf,
  looseTopics,
  nextSlotAfter,
  parseColumnKey,
  plannedSlots,
  slotChipClass,
  slotDotClass,
  slotKey,
  type BucketGroup,
  type Slot,
  type WeekCell,
  type WeekColumn,
} from "../lib/topics";
import { MEETING_LABEL, todayISO } from "../lib/readiness";
import { sessionSummary } from "../lib/session";
import { deleteWithUndo } from "../lib/undo";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { DotsGrid } from "@untitledui/icons";
import {
  useReorderableRow,
  type MoveResult,
} from "@/hooks/use-reorderable-row";
import { announce } from "@/lib/announce";
import { MOD_LABEL } from "@/lib/keys";
import { cx } from "@/utils/cx";

/**
 * Curriculum scaffolder — ideas on top, schedule below. Both stay mounted so
 * drag-and-drop works without switching views.
 */

export type BoardDirection = "down" | "up";

const HANDLE_LABEL = (name: string) =>
  `Move “${name}” — Alt with up or down arrow to reorder, Delete to remove`;
const HANDLE_TITLE = "Drag, or ⌥↑ / ⌥↓ to reorder · Delete to remove";

const CAPTURE_PLACEHOLDER: Record<BoardDirection, string> = {
  down: "Something to raise…",
  up: "Ask, escalate, flag…",
};

type MoveGroup = { label: string; options: { key: string; label: string }[] };

type CardHandlers = {
  curriculum: CurriculumSlot[];
  moveGroups: MoveGroup[];
  handleProps: ReturnType<typeof useBoardDnD>["handleProps"];
  onText: (id: string, text: string) => void;
  onMove: (id: string, key: string) => void;
  onReorder: (id: string, direction: -1 | 1) => MoveResult;
  onCover: (id: string, covered: boolean) => void;
  onTag: (id: string, slotId?: string) => void;
  onAddTag?: (label: string) => string | undefined;
  onRoll: (topic: Topic) => void;
  onBacklog: (id: string) => void;
  onDelete: (topic: Topic) => void;
  /** Capture straight into a cell, with the `#tag !` grammar. */
  onAddHere?: (raw: string, key: string) => void;
  /** Open the full idea — sub-points, notes, placement. */
  onOpen?: (id: string) => void;
};

export function TopicBoard({
  meeting,
  direction = "down",
  selectedSlotKey,
  onSelectWeek,
  ahead,
}: {
  meeting: TrackedMeeting;
  direction?: BoardDirection;
  selectedSlotKey?: string | null;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
  ahead?: number;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const updateTopic = useStore((s) => s.updateTopic);
  const placeTopic = useStore((s) => s.placeTopic);
  const placeTopicAt = useStore((s) => s.placeTopicAt);
  const captureTopics = useStore((s) => s.captureTopics);
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);
  const coverTopic = useStore((s) => s.coverTopic);
  const rollTopic = useStore((s) => s.rollTopic);
  const deleteTopic = useStore((s) => s.deleteTopic);
  const restoreTopic = useStore((s) => s.restoreTopic);
  const moveTopic = useStore((s) => s.moveTopic);
  const addSession = useStore((s) => s.addSession);
  const addMeetingRow = useStore((s) => s.addMeetingRow);
  const setCurriculum = useStore((s) => s.setCurriculum);

  const removeTopic = useCallback(
    (topic: Topic) => {
      deleteWithUndo(
        "Topic deleted.",
        () => deleteTopic(topic.id),
        () => restoreTopic(topic)
      );
      announce(
        `Deleted “${topic.text || "topic"}”. Press ${MOD_LABEL} Z to undo.`
      );
    },
    [deleteTopic, restoreTopic]
  );

  const today = todayISO();
  const curriculum = curriculumOf(meeting);

  const layout = useMemo(
    () => boardLayout(meeting, sessions, topics, today, { ahead }),
    [meeting, sessions, topics, today, ahead]
  );
  const loose = useMemo(
    () => looseTopics(topics, sessions, meeting.id, today),
    [topics, sessions, meeting.id, today]
  );
  const balance = useMemo(
    () =>
      curriculum.length ? curriculumBalance(layout.weeks, curriculum) : [],
    [curriculum, layout.weeks]
  );

  const place = useCallback(
    (topicId: string, key: string) => {
      const target = parseColumnKey(key);
      switch (target.kind) {
        case "lane":
          placeTopic(topicId, { lane: target.lane, slotId: target.slotId });
          return;
        case "session":
          placeTopic(topicId, {
            sessionId: target.sessionId,
            slotId: target.slotId,
          });
          return;
        case "projected": {
          const sessionId = addSession({
            meetingId: meeting.id,
            date: target.date,
          });
          placeTopic(topicId, { sessionId, slotId: target.slotId });
          return;
        }
      }
    },
    [addSession, meeting.id, placeTopic]
  );

  /*
   * A drop resolves to a cell *and a position in it*. `place` still answers the
   * first half for the keyboard "Move to…" path, where there is no pointer to
   * read an index from and appending is the honest default.
   */
  const placeAt = useCallback(
    (topicId: string, key: string, index: number) => {
      placeTopicAt(topicId, { ...parseColumnKey(key), meetingId: meeting.id }, index);
    },
    [placeTopicAt, meeting.id]
  );

  const { drag, zoneRef: columnRef, handleProps } = useBoardDnD(placeAt);
  const dragged = drag ? topics.find((t) => t.id === drag.id) : null;

  const roll = useCallback(
    (topic: Topic) => {
      const slots = plannedSlots(meeting, sessions, topics, today, ahead);
      const next = nextSlotAfter(slots, topic.sessionId);
      if (!next) {
        rollTopic(topic.id, undefined);
        return;
      }
      const sessionId =
        next.sessionId ??
        addSession({ meetingId: meeting.id, date: next.date });
      rollTopic(topic.id, sessionId);
    },
    [addSession, ahead, meeting, rollTopic, sessions, today, topics]
  );

  const moveGroups: MoveGroup[] = [
    {
      label: "Ideas",
      options: layout.bucket.map((g) => ({ key: g.key, label: g.label })),
    },
    ...layout.weeks.map((week) => ({
      label: week.label,
      options: week.cells.map((c) => ({
        key: c.key,
        label: c.label ? `${week.label} · ${c.label}` : week.label,
      })),
    })),
  ];

  const cardProps: CardHandlers = {
    curriculum,
    moveGroups,
    handleProps,
    onText: (id, text) => updateTopic(id, { text }),
    onAddHere: (raw, key) =>
      captureTopics(raw, { ...parseColumnKey(key), meetingId: meeting.id }),
    onOpen: setOpenTopicId,
    onMove: place,
    onReorder: (id, dir) => moveTopic(id, dir),
    onCover: (id, covered) => coverTopic(id, covered),
    onTag: (id, slotId) => updateTopic(id, { slotId }),
    onAddTag: (label) => addMeetingRow(meeting.id, label),
    onRoll: roll,
    onBacklog: (id) => placeTopic(id, { lane: "backlog" }),
    onDelete: removeTopic,
  };

  const parked = layout.bucket[layout.bucket.length - 1];
  const ideaGroups = layout.bucket.slice(0, -1);
  const ideaCount = ideaGroups.reduce((n, g) => n + g.topics.length, 0);

  return (
    <div className="@container space-y-3">
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

      <div className="grid items-start gap-6 @4xl:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="@4xl:sticky @4xl:top-2">
      <IdeasPanel
        direction={direction}
        curriculum={curriculum}
        groups={ideaGroups}
        parked={parked}
        ideaCount={ideaCount}
        drag={drag}
        columnRef={columnRef}
        cardProps={cardProps}
        onCapture={(raw, slotId) =>
          captureTopics(raw, {
            kind: "lane",
            lane: "backlog",
            slotId,
            meetingId: meeting.id,
          })
        }
      />

      </div>

      <ScheduleGrid
        weeks={layout.weeks}
        balance={balance}
        onReorderRows={(ids) => {
          const byId = new Map(curriculum.map((c) => [c.id, c]));
          setCurriculum(
            meeting.id,
            ids.map((id) => byId.get(id)!).filter(Boolean)
          );
        }}
        curriculum={curriculum}
        selectedSlotKey={selectedSlotKey}
        drag={drag}
        columnRef={columnRef}
        cardProps={cardProps}
        onSelectWeek={onSelectWeek}
        onAddRow={(label) => addMeetingRow(meeting.id, label)}
      />
      </div>

      {drag && dragged && (
        <li
          aria-hidden
          className="pointer-events-none fixed z-50 list-none rounded-lg border border-teal-400 bg-primary px-2 py-1.5 text-xs leading-snug shadow-lg dark:border-teal-600"
          style={{
            left: drag.x - drag.dx,
            top: drag.y - drag.dy,
            width: drag.width,
          }}
        >
          {dragged.text}
        </li>
      )}
      {/*
        The full idea, opened from any card on the board. A card stays a
        one-liner because it has to survive being one of forty; the thinking
        behind it needs somewhere to live that isn't a separate doc.
      */}
      {openTopicId && (
        <TopicDetail
          topicId={openTopicId}
          onClose={() => setOpenTopicId(null)}
        />
      )}
    </div>
  );
}

function ScheduleGrid({
  weeks,
  curriculum,
  selectedSlotKey,
  drag,
  columnRef,
  cardProps,
  onSelectWeek,
  onAddRow,
  balance,
  onReorderRows,
}: {
  balance: ReturnType<typeof curriculumBalance>;
  onReorderRows: (ids: string[]) => void;
  weeks: WeekColumn[];
  curriculum: CurriculumSlot[];
  selectedSlotKey?: string | null;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
  onAddRow: (label: string) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggingRow, setDraggingRow] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);
  const dropRow = (targetId: string) => {
    if (!draggingRow || draggingRow === targetId) return;
    const ids = curriculum.map((c) => c.id).filter((id) => id !== draggingRow);
    const at = ids.indexOf(targetId);
    const from = curriculum.findIndex((c) => c.id === draggingRow);
    const to = curriculum.findIndex((c) => c.id === targetId);
    ids.splice(from < to ? at + 1 : at, 0, draggingRow);
    onReorderRows(ids);
    announce("Row moved.");
  };
  const scrollLeftRef = useRef(0);

  const weekCount = Math.max(weeks.length, 1);
  const colWidth = "13rem";
  const gridCols = curriculum.length
    ? `8rem repeat(${weekCount}, ${colWidth})`
    : `repeat(${weekCount}, ${colWidth})`;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = scrollLeftRef.current;
  });

  const onScroll = () => {
    scrollLeftRef.current = scrollRef.current?.scrollLeft ?? 0;
  };

  const sessionForWeek = (week: WeekColumn) => {
    if (!week.slot.sessionId) return null;
    return sessions.find((s) => s.id === week.slot.sessionId) ?? null;
  };

  const cellFor = (week: WeekColumn, slotId?: string) =>
    week.cells.find((c) => c.slotId === slotId) ??
    week.cells.find((c) => !c.slotId && !slotId);

  const weekIsActive = (week: WeekColumn): boolean => {
    if (!selectedSlotKey) return false;
    const occ = slotKey(week.slot);
    if (selectedSlotKey === occ) return true;
    return Boolean(
      week.slot.sessionId && selectedSlotKey === `s:${week.slot.sessionId}`
    );
  };

  if (!curriculum.length) {
    return (
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-contain overflow-x-auto pb-1"
      >
        <div
          className="inline-grid gap-x-3"
          style={{ gridTemplateColumns: gridCols }}
        >
          {weeks.map((week) => {
            const past = week.slot.past;
            const isActive = weekIsActive(week);
            const cell = week.cells[0];
            return (
              <div key={week.slot.date} className="flex flex-col">
                <WeekHeader
                  week={week}
                  isActive={isActive}
                  notesPreview={
                    sessionForWeek(week)
                      ? sessionSummary(sessionForWeek(week)!)
                      : ""
                  }
                  onSelect={() => onSelectWeek?.(slotKey(week.slot), week.slot)}
                />
                {cell && (
                  <GridCell
                    cell={cell}
                    past={past}
                    inSlot={Boolean(week.slot.sessionId)}
                    drag={drag}
                    columnRef={columnRef}
                    cardProps={cardProps}
                    compact
                  />
                )}
              </div>
            );
          })}
        </div>
        <AddRow onAdd={onAddRow} first />
      </div>
    );
  }

  const rows: { id: string; label: string; slotId?: string }[] = [
    ...curriculum.map((s) => ({ id: s.id, label: s.label, slotId: s.id })),
    { id: "untagged", label: "Untagged" },
  ];

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="scroll-contain overflow-x-auto pb-1"
    >
      {/*
        No hairline grid. The skeleton is mostly empty by design — eight weeks
        of four rows is thirty-two cells holding maybe six topics — and drawing
        a box around every one of them made the emptiness the loudest thing on
        the page. Rows are carried by the labels and one faint rule; columns by
        their headers and the gap.
      */}
      <div
        className="inline-grid gap-x-3"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="sticky left-0 z-20 bg-primary" />

        {weeks.map((week) => {
          const isActive = weekIsActive(week);
          return (
            <WeekHeader
              key={week.slot.date}
              week={week}
              isActive={isActive}
              notesPreview={
                sessionForWeek(week)
                  ? sessionSummary(sessionForWeek(week)!)
                  : ""
              }
              onSelect={() => onSelectWeek?.(slotKey(week.slot), week.slot)}
              grid
            />
          );
        })}

        {rows.map((row) => (
          <Fragment key={row.id}>
            <div
              draggable={Boolean(row.slotId)}
              onDragStart={(e) => {
                if (!row.slotId) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", row.slotId);
                setDraggingRow(row.slotId);
              }}
              onDragEnd={() => {
                setDraggingRow(null);
                setOverRow(null);
              }}
              onDragOver={(e) => {
                if (!draggingRow || !row.slotId) return;
                e.preventDefault();
                setOverRow(row.slotId);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (row.slotId) dropRow(row.slotId);
                setDraggingRow(null);
                setOverRow(null);
              }}
              title={row.slotId ? "Drag to reorder rows" : undefined}
              className={cx(
                "group/row sticky left-0 z-10 flex items-start gap-1.5 border-t border-stone-100 bg-primary py-3 pr-3 dark:border-stone-900",
                row.slotId && "cursor-grab active:cursor-grabbing",
                draggingRow === row.slotId && "opacity-50",
                overRow === row.slotId && draggingRow !== row.slotId && "shadow-[inset_0_2px_0_0_var(--color-teal-500)]"
              )}
            >
              {row.slotId ? (
                <DotsGrid aria-hidden className="mt-0.5 size-3 shrink-0 text-quaternary" />
              ) : (
                <span aria-hidden className="size-3 shrink-0" />
              )}
              <span className="min-w-0">
                <span
                  className={cx(
                    "flex items-center gap-1.5 text-xs leading-snug font-semibold break-words",
                    row.slotId ? "text-secondary" : "text-quaternary"
                  )}
                >
                  {row.slotId && (
                    <span
                      aria-hidden
                      className={cx("size-1.5 shrink-0 rounded-full", slotDotClass(curriculum, row.slotId))}
                    />
                  )}
                  {row.label}
                </span>
                {row.slotId && (() => {
                  const b = balance.find((x) => x.slot.id === row.slotId);
                  if (!b) return null;
                  return (
                    <span
                      className="mt-0.5 block text-caption text-quaternary tabular-nums"
                      title={`Planned in ${b.filled} of the next ${b.total} weeks`}
                    >
                      {b.filled}/{b.total} weeks
                    </span>
                  );
                })()}
              </span>
            </div>
            {weeks.map((week) => {
              const cell = row.slotId
                ? cellFor(week, row.slotId)
                : week.cells.find((c) => !c.slotId);
              if (!cell) {
                return (
                  <div
                    key={`${row.id}-${week.slot.date}`}
                    className="min-h-12 border-t border-stone-100 dark:border-stone-900"
                  />
                );
              }
              return (
                <GridCell
                  key={cell.key}
                  cell={cell}
                  past={week.slot.past}
                  inSlot={Boolean(week.slot.sessionId)}
                  drag={drag}
                  columnRef={columnRef}
                  cardProps={cardProps}
                  compact
                  ruled
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <AddRow onAdd={onAddRow} />
    </div>
  );
}

/** "+ Add row", on the board itself — where the need for one is noticed. */
function AddRow({ onAdd, first }: { onAdd: (label: string) => void; first?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  if (!open) {
    return (
      <Button
        size="sm"
        color="link-gray"
        className="mt-2"
        onClick={() => setOpen(true)}
      >
        {first ? "+ Split weeks into rows by tag" : "+ Add row"}
      </Button>
    );
  }
  return (
    <form
      className="mt-2 flex max-w-sm items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onAdd(draft);
        setDraft("");
      }}
    >
      <Input
        size="sm"
        autoFocus
        placeholder="Prayer, Training…"
        aria-label="New row"
        value={draft}
        onChange={setDraft}
        className="min-w-0 flex-1"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <Button size="sm" color="secondary" type="submit" isDisabled={!draft.trim()}>
        Add
      </Button>
      <Button size="sm" color="tertiary" onClick={() => setOpen(false)}>
        Done
      </Button>
    </form>
  );
}

function WeekHeader({
  week,
  isActive,
  notesPreview,
  onSelect,
  grid,
}: {
  week: WeekColumn;
  isActive: boolean;
  notesPreview: string;
  onSelect: () => void;
  grid?: boolean;
}) {
  const past = week.slot.past;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={isActive}
      className={cx(
        "rounded-lg border-b-2 px-2 py-2 text-left transition-colors",
        isActive
          ? "border-teal-500 dark:border-teal-600"
          : "border-stone-200 hover:bg-tertiary dark:border-stone-800",
        !grid && "rounded-b-none"
      )}
    >
      <div
        className={cx(
          "truncate text-sm font-semibold tracking-tight tabular-nums",
          past ? "text-quaternary" : "text-primary"
        )}
      >
        {week.label}
      </div>
      {week.exception && (
        <div className="truncate text-xs font-medium text-brand-secondary">
          {week.exception}
        </div>
      )}
      {week.hint && (
        <div
          className={cx(
            "truncate text-xs",
            past && week.hint.includes("not covered")
              ? "text-amber-700 dark:text-amber-500"
              : "text-quaternary"
          )}
        >
          {week.hint}
        </div>
      )}
      {notesPreview && (
        <div className="mt-0.5 truncate text-caption text-teal-700 dark:text-teal-400">
          {notesPreview}
        </div>
      )}
    </button>
  );
}

function GridCell({
  cell,
  past,
  inSlot,
  drag,
  columnRef,
  cardProps,
  compact,
  ruled,
}: {
  cell: WeekCell;
  past: boolean;
  inSlot: boolean;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  compact?: boolean;
  /** Carries the row divider in the skeleton grid. */
  ruled?: boolean;
}) {
  const active = drag?.over === cell.key;
  // Where it would land, not just where it would go. In a cell that is a
  // running order, the position *is* the decision.
  const at = active ? drag!.index : -1;
  const line = (
    <li
      key="drop-line"
      aria-hidden
      className="h-0.5 list-none rounded-full bg-teal-500"
    />
  );

  const rows: ReactNode[] = [];
  cell.topics.forEach((t, i) => {
    if (active && at === i) rows.push(line);
    rows.push(
      <TopicCard
        key={t.id}
        topic={t}
        columnKey={cell.key}
        past={past}
        inSlot={inSlot}
        covered={t.status !== "open"}
        isDragging={drag?.id === t.id}
        compact={compact}
        showTag={false}
        showMove
        {...cardProps}
      />
    );
  });
  if (active && at >= cell.topics.length) rows.push(line);

  return (
    <div
      ref={columnRef(cell.key)}
      className={cx(
        "group/cell min-h-12 py-1.5",
        ruled && "border-t border-stone-100 dark:border-stone-900",
        active &&
          "rounded-lg bg-teal-50/80 ring-2 ring-inset ring-teal-400 dark:bg-teal-950/40 dark:ring-teal-600"
      )}
    >
      <ul className="flex flex-col gap-1">{rows}</ul>
      {/* Capture where it belongs. Hidden until the column is hovered, or the
          board becomes thirty identical Add buttons. */}
      {cardProps.onAddHere && (
        <div className="opacity-0 transition focus-within:opacity-100 group-hover/cell:opacity-100">
          <InlineComposer
            compact
            placeholder="Add a topic…  #tag !"
            onAdd={(raw) => cardProps.onAddHere?.(raw, cell.key)}
          />
        </div>
      )}
    </div>
  );
}

function IdeasPanel({
  direction,
  curriculum,
  groups,
  parked,
  ideaCount,
  drag,
  columnRef,
  cardProps,
  onCapture,
}: {
  direction: BoardDirection;
  curriculum: CurriculumSlot[];
  groups: BucketGroup[];
  parked?: BucketGroup;
  ideaCount: number;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  onCapture: (text: string, slotId?: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [parkedOpen, setParkedOpen] = useState(false);

  const capture = () => {
    const text = draft.trim();
    if (!text) return;
    const slotId = tag || undefined;
    onCapture(text, slotId);
    setDraft("");
    // Never let a capture vanish behind the active filter.
    const landsIn = text.includes("#") ? "all" : (slotId ?? "untagged");
    if (filter !== "all" && filter !== landsIn) setFilter(landsIn);
  };

  const dropActive = (key: string) =>
    drag?.over === key || (key === "backlog" && drag?.over?.startsWith("backlog"));

  const visible = groups.flatMap((g) => {
    if (filter === "all") return g.topics.length ? [{ group: g, topics: g.topics }] : [];
    if (filter === "untagged" && g.key === "backlog")
      return g.topics.length ? [{ group: g, topics: g.topics }] : [];
    if (g.slotId === filter)
      return g.topics.length ? [{ group: g, topics: g.topics }] : [];
    return [];
  });

  const listGroups = drag
    ? groups.map((g) => ({ group: g, topics: g.topics }))
    : visible;

  const filters: { id: string; label: string; count: number }[] = [
    { id: "all", label: "All", count: ideaCount },
  ];
  if (groups.some((g) => g.key === "backlog" && g.topics.length))
    filters.push({
      id: "untagged",
      label: "Untagged",
      count: groups.find((g) => g.key === "backlog")?.topics.length ?? 0,
    });
  for (const s of curriculum) {
    const n =
      groups.find((g) => g.slotId === s.id)?.topics.length ?? 0;
    if (n > 0) filters.push({ id: s.id, label: s.label, count: n });
  }

  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-secondary px-4 py-2.5">
        <h4 className="text-sm font-semibold text-primary">
          Ideas
          <span className="ml-1.5 font-normal text-quaternary tabular-nums">
            {ideaCount}
          </span>
        </h4>
        {filters.length > 1 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter ideas">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => {
                  setFilter(f.id);
                  // Filtering to a row means adding into it, too.
                  if (f.id === "untagged") setTag("");
                  else if (f.id !== "all") setTag(f.id);
                }}
                className={cx(
                  "h-6 rounded-md px-2 text-xs font-medium transition",
                  filter === f.id
                    ? "bg-tertiary text-primary"
                    : "text-quaternary hover:text-secondary"
                )}
              >
                {f.label}
                <span className="ml-1 tabular-nums opacity-60">{f.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            capture();
          }}
        >
          <Input
            size="sm"
            placeholder={`${CAPTURE_PLACEHOLDER[direction]}  #tag`}
            aria-label="Add an idea"
            value={draft}
            onChange={setDraft}
            className="min-w-0 flex-1 @4xl:basis-full"
            enterKeyHint="done"
          />
          {curriculum.length > 0 && (
            <NativeSelect
              size="sm"
              className="w-auto shrink-0 @4xl:flex-1"
              aria-label="Row"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              options={[
                { label: "Untagged", value: "" },
                ...curriculum.map((s) => ({ label: s.label, value: s.id })),
              ]}
            />
          )}
          <Button size="sm" color="secondary" type="submit" isDisabled={!draft.trim()}>
            Add
          </Button>
        </form>

        <div
          ref={columnRef("backlog")}
          className={cx(
            "max-h-[min(22rem,45vh)] space-y-3 overflow-y-auto rounded-lg @4xl:max-h-[60vh]",
            drag && "min-h-[4rem]",
            dropActive("backlog") &&
              "ring-2 ring-teal-400 dark:ring-teal-600"
          )}
        >
        {listGroups.length === 0 && (
          <p className="py-6 text-center text-sm text-quaternary">
            {ideaCount === 0
              ? drag
                ? "Drop here to return to ideas."
                : "Nothing in the bucket yet — capture something above."
              : "No ideas match this filter."}
          </p>
        )}
        {listGroups.map(({ group, topics: list }) => (
          <div
            key={group.key}
            ref={columnRef(group.key)}
            className={cx(
              "rounded-md px-1",
              dropActive(group.key) &&
                "bg-teal-50/80 ring-2 ring-inset ring-teal-400 dark:bg-teal-950/40 dark:ring-teal-600"
            )}
          >
            {filter === "all" && group.label !== "Ideas" && (
              <p className="mb-1.5 px-1 text-xs font-medium text-quaternary">
                {group.label}
              </p>
            )}
            {(drag || list.length > 0) && (
            <ul className="space-y-1.5">
              {list.map((t) => (
                <TopicCard
                  key={t.id}
                  topic={t}
                  columnKey={group.key}
                  past={false}
                  inSlot={false}
                  covered={false}
                  isDragging={drag?.id === t.id}
                  showTag={false}
                  showMove
                  {...cardProps}
                />
              ))}
            </ul>
            )}
            {drag && list.length === 0 && (
              <p className="py-2 text-center text-caption text-quaternary">
                Drop in {group.label.toLowerCase()}
              </p>
            )}
          </div>
        ))}
      </div>

      {parked && (
        <div
          ref={columnRef(parked.key)}
          className={cx(
            "border-t border-secondary pt-2",
            drag?.over === parked.key && "rounded-lg ring-2 ring-teal-400"
          )}
        >
          <button
            type="button"
            className="flex w-full items-baseline justify-between py-1 text-left"
            onClick={() => setParkedOpen((v) => !v)}
            aria-expanded={parkedOpen}
          >
            <span className="text-xs font-medium text-quaternary">
              Parked
            </span>
            <span className="text-xs tabular-nums text-quaternary">
              {parked.topics.length}
            </span>
          </button>
          {parkedOpen && parked.topics.length > 0 && (
            <ul className="mt-1.5 space-y-1.5">
              {parked.topics.map((t) => (
                <TopicCard
                  key={t.id}
                  topic={t}
                  columnKey={parked.key}
                  past={false}
                  inSlot={false}
                  covered={false}
                  isDragging={drag?.id === t.id}
                  showTag={false}
                  showMove
                  {...cardProps}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
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
  compact,
  showTag = true,
  showMove = true,
  curriculum,
  moveGroups,
  handleProps,
  onText,
  onMove,
  onReorder,
  onCover,
  onTag,
  onAddTag,
  onRoll,
  onBacklog,
  onDelete,
  onOpen,
}: {
  topic: Topic;
  columnKey: string;
  past: boolean;
  inSlot: boolean;
  covered: boolean;
  isDragging: boolean;
  compact?: boolean;
  showTag?: boolean;
  showMove?: boolean;
} & CardHandlers) {
  const ref = useRef<HTMLLIElement>(null);
  const name = topic.text || "topic";
  const down = useRef<{ x: number; y: number } | null>(null);
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState("");
  const { rowProps, handleProps: keyHandleProps } = useReorderableRow({
    label: `“${name}”`,
    onMove: (dir) => onReorder(topic.id, dir),
    onDelete: () => onDelete(topic),
  });

  const grab = handleProps(topic.id, columnKey, ref);
  /*
   * Drag from anywhere on the card. A 24px dot is a target you have to aim for,
   * and this board asks you to move things constantly. Controls opt out by tag
   * so a checkbox tick stays a tick; a drag only begins past the slop threshold
   * anyway, so the two never compete.
   */
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
     * A press that never travelled is a click, and a click opens the idea —
     * except on the textarea, which owns the title and edits in place. The
     * distance check keeps "drag it to next week" from also opening a panel
     * every time you let go.
     */
    onClick: (e: ReactMouseEvent) => {
      if (!onOpen) return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(
          'textarea, input, select, a, label, [role="checkbox"], button'
        )
      ) {
        return;
      }
      const start = down.current;
      down.current = null;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      onOpen(topic.id);
    },
  };

  return (
    <li
      ref={ref}
      data-drag-item={topic.id}
      {...rowProps}
      className={cx(
        "group relative rounded-lg border bg-primary",
        // Amber means "this slipped". A topic you ticked off didn't.
        covered
          ? "border-secondary"
          : past
            ? "border-amber-300 dark:border-amber-800"
            : "border-secondary shadow-xs",
        isDragging && "opacity-40",
        compact && "text-xs"
      )}
    >
      <div
        {...cardGrab}
        className={cx(
          "flex cursor-grab items-start gap-1 touch:gap-2 active:cursor-grabbing",
          compact ? "px-1.5 py-1.5" : "px-2 py-2"
        )}
      >
        <button
          type="button"
          aria-label={HANDLE_LABEL(name)}
          title={HANDLE_TITLE}
          className={cx(
            "flex shrink-0 cursor-grab touch-none items-center justify-center rounded text-stone-400 select-none active:cursor-grabbing hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400",
            compact ? "size-5 -ml-0.5" : "size-6 -ml-0.5 touch:size-11"
          )}
          {...keyHandleProps}
          {...handleProps(topic.id, columnKey, ref)}
        >
          <DotsGrid className={compact ? "size-3" : "size-4"} />
        </button>

        {/*
          In a meeting week a topic is a to-do, so the tick leads, where every
          checklist puts it. It used to trail the title, in the same corner the
          hover-revealed Delete sat on top of — reaching to tick it off landed
          on delete instead.
        */}
        {inSlot && (
          <Checkbox
            size="sm"
            aria-label={`Covered "${name}"`}
            isSelected={covered}
            onChange={(selected) => onCover(topic.id, selected)}
            className={cx("shrink-0", compact ? "mt-0.5" : "mt-1")}
          />
        )}

        <div className="min-w-0 flex-1">
          <textarea
            className={cx(
              "w-full resize-none border-0 bg-transparent p-0 leading-snug outline-none",
              compact ? "text-xs" : "text-sm touch:text-md",
              covered ? "text-quaternary line-through" : "text-primary"
            )}
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
              onText(topic.id, e.target.value);
            }}
          />
          {/*
            One muted line, in priority order. A card that came back has to say
            why without becoming the loudest thing in the column.
          */}
          {(topic.returnedOn || topic.points?.length || topic.detail?.trim()) &&
            !covered && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-quaternary">
                {topic.returnedOn && (
                  <span className="text-amber-700 dark:text-amber-500">
                    not covered{" "}
                    {topic.returnedFromDate
                      ? new Date(
                          `${topic.returnedFromDate}T00:00:00Z`
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })
                      : "last time"}
                  </span>
                )}
                {topic.points?.length ? (
                  <span className="tabular-nums">
                    {topic.points.filter((pt) => pt.done).length}/
                    {topic.points.length} points
                  </span>
                ) : null}
                {topic.detail?.trim() ? (
                  <span className="opacity-70">notes</span>
                ) : null}
              </div>
            )}

          {!compact && showTag && curriculum.length > 0 && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {newTagOpen ? (
                <form
                  className="inline-flex min-w-0 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const id = onAddTag?.(newTagLabel);
                    if (!id) return;
                    onTag(topic.id, id);
                    setNewTagLabel("");
                    setNewTagOpen(false);
                  }}
                >
                  <Input
                    size="sm"
                    placeholder="New tag…"
                    aria-label={`New tag for “${name}”`}
                    value={newTagLabel}
                    onChange={setNewTagLabel}
                    className="min-w-[5rem]"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    color="secondary"
                    type="submit"
                    isDisabled={!newTagLabel.trim()}
                  >
                    Add
                  </Button>
                </form>
              ) : (
                <label className="inline-flex min-w-0">
                  <span className="sr-only">Tag for “{name}”</span>
                  <select
                    value={topic.slotId ?? ""}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setNewTagOpen(true);
                        return;
                      }
                      onTag(topic.id, e.target.value || undefined);
                    }}
                    className={cx(
                      "max-w-full cursor-pointer truncate rounded px-1 py-px text-caption font-medium outline-none",
                      topic.slotId
                        ? slotChipClass(curriculum, topic.slotId)
                        : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                    )}
                  >
                    <option value="">Untagged</option>
                    {curriculum.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                    {onAddTag && <option value="__new__">+ New tag…</option>}
                  </select>
                </label>
              )}
              {topic.carried > 1 && !covered && (
                <span className="text-caption text-amber-700 dark:text-amber-500">
                  pushed {topic.carried}×
                </span>
              )}
            </div>
          )}
        </div>

        {/*
          No Delete on the card. Removing a topic is rare and destructive; it
          lives in the topic's own panel (click the card) and on the handle's
          Delete key, not one hover away from the checkbox.
        */}
      </div>

      {past && !covered && !compact && (
        <div className="flex flex-wrap items-center gap-1 border-t border-amber-200 px-2 py-1 touch:gap-2 dark:border-amber-900/70">
          <Button size="sm" color="link-gray" onClick={() => onRoll(topic)}>
            → Next week
          </Button>
          <Button size="sm" color="link-gray" onClick={() => onBacklog(topic.id)}>
            Ideas
          </Button>
        </div>
      )}

      {/*
        "Move to…" is the keyboard and screen-reader path, so it cannot simply
        be hidden — a display:none control leaves the tab order. It collapses
        to nothing instead, and opens on hover, on focus, or on touch, where
        there is no hover to rely on.
      */}
      {showMove && (
        <label className="flex max-h-0 items-center gap-1 overflow-hidden border-secondary px-2 opacity-0 transition-all duration-150 touch:max-h-12 touch:border-t touch:py-1 touch:opacity-100 has-focus-visible:max-h-12 has-focus-visible:border-t has-focus-visible:py-1 has-focus-visible:opacity-100">
          <span className="sr-only">Move "{topic.text || "topic"}" to</span>
          <select
            value={columnKey}
            onChange={(e) => onMove(topic.id, e.target.value)}
            className={cx(
              "w-full cursor-pointer touch:min-h-11 rounded border-0 bg-transparent py-0 text-quaternary outline-none",
              compact ? "min-h-7 text-caption" : "min-h-8 text-caption touch:text-md"
            )}
          >
            {moveGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
    </li>
  );
}
