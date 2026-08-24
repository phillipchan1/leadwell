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
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { DotsGrid, X } from "@untitledui/icons";
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

const newSlotId = () => Math.random().toString(36).slice(2, 10);

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
  const addTopic = useStore((s) => s.addTopic);
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
    onAddTag: (label) => {
      const text = label.trim();
      if (!text) return undefined;
      const id = newSlotId();
      setCurriculum(meeting.id, [...curriculum, { id, label: text }]);
      return id;
    },
    onRoll: roll,
    onBacklog: (id) => placeTopic(id, { lane: "backlog" }),
    onDelete: removeTopic,
  };

  const parked = layout.bucket[layout.bucket.length - 1];
  const ideaGroups = layout.bucket.slice(0, -1);
  const ideaCount = ideaGroups.reduce((n, g) => n + g.topics.length, 0);

  return (
    <div className="space-y-3">
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

      <IdeasPanel
        direction={direction}
        curriculum={curriculum}
        groups={ideaGroups}
        parked={parked}
        ideaCount={ideaCount}
        drag={drag}
        columnRef={columnRef}
        cardProps={cardProps}
        onCapture={(text, slotId) =>
          addTopic(meeting.id, text, { lane: "backlog", slotId })
        }
        onAddTag={(label) => {
          const text = label.trim();
          if (!text) return undefined;
          const id = newSlotId();
          setCurriculum(meeting.id, [...curriculum, { id, label: text }]);
          return id;
        }}
      />

      {balance.length > 0 && (
        <BalanceStrip balance={balance} curriculum={curriculum} />
      )}

      <ScheduleGrid
        weeks={layout.weeks}
        curriculum={curriculum}
        selectedSlotKey={selectedSlotKey}
        drag={drag}
        columnRef={columnRef}
        cardProps={cardProps}
        onSelectWeek={onSelectWeek}
      />

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

function BalanceStrip({
  balance,
  curriculum,
}: {
  balance: ReturnType<typeof curriculumBalance>;
  curriculum: CurriculumSlot[];
}) {
  /*
   * One line, not a row of tiles.
   *
   * Coverage is a background check — "am I training this team often enough" —
   * and as four bordered cards it took as much vertical space and colour as the
   * plan it was commenting on. It should be glanceable and then ignorable.
   */
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5">
      <span className="text-caption font-medium tracking-wide text-quaternary uppercase">
        Coverage
      </span>
      {balance.map((b) => {
        const low = b.filled === 0 || (b.total > 0 && b.filled <= Math.floor(b.total / 3));
        return (
          <span
            key={b.slot.id}
            className="inline-flex items-center gap-1.5 text-caption"
            title={`${b.slot.label}: ${b.filled} of the next ${b.total} weeks`}
          >
            <span
              className={cx(
                "size-1.5 shrink-0 rounded-full",
                slotDotClass(curriculum, b.slot.id)
              )}
              aria-hidden
            />
            <span className="text-quaternary">{b.slot.label}</span>
            <span
              className={cx(
                "tabular-nums",
                low
                  ? "font-medium text-amber-700 dark:text-amber-500"
                  : "text-quaternary opacity-70"
              )}
            >
              {b.filled}/{b.total}
            </span>
          </span>
        );
      })}
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
}: {
  weeks: WeekColumn[];
  curriculum: CurriculumSlot[];
  selectedSlotKey?: string | null;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollLeftRef = useRef(0);

  const weekCount = Math.max(weeks.length, 1);
  const colWidth = "9.25rem";
  const gridCols = curriculum.length
    ? `6.5rem repeat(${weekCount}, ${colWidth})`
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
          className="inline-grid gap-px rounded-xl border border-secondary bg-stone-200 dark:bg-stone-800"
          style={{ gridTemplateColumns: gridCols }}
        >
          {weeks.map((week) => {
            const past = week.slot.past;
            const isActive = weekIsActive(week);
            const cell = week.cells[0];
            return (
              <div key={week.slot.date} className="flex flex-col bg-primary">
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
      </div>
    );
  }

  const rows: { id: string; label: string; slotId?: string }[] = [
    ...curriculum.map((s) => ({ id: s.id, label: s.label, slotId: s.id })),
  ];
  const hasOther = weeks.some((w) =>
    w.cells.some((c) => !c.slotId && c.topics.length > 0)
  );
  if (hasOther) rows.push({ id: "other", label: "Other" });

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="scroll-contain overflow-x-auto pb-1"
    >
      <div
        className="inline-grid gap-px rounded-xl border border-secondary bg-stone-200 dark:bg-stone-800"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="sticky left-0 z-20 bg-stone-100/95 px-2 py-2 dark:bg-stone-900/95" />

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
            <div className="sticky left-0 z-10 flex items-start bg-stone-100/95 px-2 py-2 dark:bg-stone-900/95">
              <span
                className={cx(
                  "text-caption font-semibold leading-snug",
                  row.slotId
                    ? slotChipClass(curriculum, row.slotId)
                    : "text-quaternary",
                  "rounded px-1.5 py-0.5"
                )}
              >
                {row.label}
              </span>
            </div>
            {weeks.map((week) => {
              const cell = row.slotId
                ? cellFor(week, row.slotId)
                : week.cells.find((c) => c.label === "Other");
              if (!cell) {
                return (
                  <div
                    key={`${row.id}-${week.slot.date}`}
                    className="min-h-[2.75rem] border-l border-stone-200/80 bg-primary dark:border-stone-800/80"
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
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
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
        "px-2 py-2 text-left transition-colors",
        grid ? "bg-primary" : "border-b border-secondary",
        isActive && "ring-2 ring-inset ring-teal-500 dark:ring-teal-600",
        !isActive && "hover:bg-stone-50 dark:hover:bg-stone-900/40",
        past && "bg-amber-50/80 dark:bg-amber-950/25"
      )}
    >
      <div
        className={cx(
          "truncate text-caption font-semibold uppercase",
          past ? "text-amber-700 dark:text-amber-500" : "text-quaternary"
        )}
      >
        {week.label}
      </div>
      {week.hint && (
        <div
          className={cx(
            "truncate text-caption",
            past
              ? "text-amber-700 dark:text-amber-500"
              : "text-stone-400 dark:text-stone-500"
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
}: {
  cell: WeekCell;
  past: boolean;
  inSlot: boolean;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  compact?: boolean;
}) {
  const empty = cell.topics.length === 0;
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
        "group/cell min-h-[2.75rem] border-l border-stone-200/80 bg-primary px-1 py-1 dark:border-stone-800/80",
        empty && !active && "bg-stone-50/50 dark:bg-stone-950/20",
        active &&
          "bg-teal-50/80 ring-2 ring-inset ring-teal-400 dark:bg-teal-950/40 dark:ring-teal-600"
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
  onAddTag,
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
  onAddTag: (label: string) => string | undefined;
}) {
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [parkedOpen, setParkedOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  const capture = () => {
    const text = draft.trim();
    if (!text) return;
    onCapture(text, tag || undefined);
    setDraft("");
  };

  const submitTag = () => {
    const label = tagDraft.trim();
    const id = onAddTag(label);
    if (!id) return;
    setTag(id);
    setTagDraft("");
    setAddingTag(false);
    announce(`Added tag “${label}”.`);
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
    <div className="rounded-xl border border-secondary bg-stone-50/40 dark:bg-stone-950/30">
      <div className="flex items-baseline justify-between gap-2 border-b border-secondary px-3 py-2">
        <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
          Ideas
        </span>
        <span className="text-caption tabular-nums text-quaternary">
          {ideaCount} unscheduled
        </span>
      </div>

      <div className="space-y-2 p-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            capture();
          }}
        >
          <Input
            size="sm"
            placeholder={CAPTURE_PLACEHOLDER[direction]}
            aria-label="Add an idea"
            value={draft}
            onChange={setDraft}
            className="min-w-[10rem] flex-1"
            enterKeyHint="done"
          />
          {curriculum.length > 0 && (
            <label className="shrink-0">
              <span className="sr-only">Tag</span>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="min-h-9 rounded-lg border-0 bg-primary px-2 text-sm shadow-xs ring-1 ring-primary ring-inset"
              >
                <option value="">Untagged</option>
                {curriculum.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button size="sm" color="secondary" type="submit" isDisabled={!draft.trim()}>
            Add
          </Button>
        </form>

        {filters.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cx(
                  "rounded-full px-2.5 py-0.5 text-caption font-medium transition",
                  filter === f.id
                    ? "bg-teal-600 text-white dark:bg-teal-700"
                    : "bg-tertiary text-quaternary hover:text-stone-700 dark:hover:text-stone-200"
                )}
              >
                {f.label}
                <span className="ml-1 tabular-nums opacity-80">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {addingTag ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                submitTag();
              }}
            >
              <Input
                size="sm"
                placeholder="Tag name…"
                aria-label="New tag name"
                value={tagDraft}
                onChange={setTagDraft}
                className="min-w-[6rem] flex-1"
                autoFocus
              />
              <Button
                size="sm"
                color="secondary"
                type="submit"
                isDisabled={!tagDraft.trim()}
              >
                Add
              </Button>
              <Button
                size="sm"
                color="tertiary"
                type="button"
                onClick={() => {
                  setAddingTag(false);
                  setTagDraft("");
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingTag(true)}
              className="rounded-full bg-tertiary px-2.5 py-0.5 text-caption font-medium text-quaternary transition hover:text-stone-700 dark:hover:text-stone-200"
            >
              + Tag
            </button>
          )}
        </div>

        <div
          ref={columnRef("backlog")}
          className={cx(
            "max-h-[min(11rem,28vh)] space-y-2 overflow-y-auto rounded-lg",
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
              <p className="mb-1.5 text-caption font-semibold tracking-wide text-quaternary uppercase">
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
                  showTag
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
            <span className="text-caption font-semibold tracking-wide text-quaternary uppercase">
              Parked
            </span>
            <span className="text-caption tabular-nums text-quaternary">
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
                  showTag
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
        past
          ? "border-amber-300 dark:border-amber-800"
          : "border-stone-200 dark:border-stone-700",
        isDragging && "opacity-40",
        compact && "text-xs"
      )}
    >
      <div
        {...cardGrab}
        className={cx(
          "flex cursor-grab items-start gap-1 touch:gap-2 active:cursor-grabbing",
          compact ? "px-1.5 py-1" : "px-2 py-1.5"
        )}
      >
        <button
          type="button"
          aria-label={HANDLE_LABEL(name)}
          title={HANDLE_TITLE}
          className={cx(
            "flex shrink-0 cursor-grab touch-none items-center justify-center rounded text-stone-400 select-none active:cursor-grabbing hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400",
            compact ? "size-6 -ml-0.5" : "size-8 -ml-0.5 touch:size-11"
          )}
          {...keyHandleProps}
          {...handleProps(topic.id, columnKey, ref)}
        >
          <DotsGrid className={compact ? "size-3" : "size-4"} />
        </button>

        <div className="min-w-0 flex-1">
          <textarea
            className={cx(
              "w-full resize-none border-0 bg-transparent p-0 leading-snug outline-none",
              compact ? "text-xs" : "text-xs touch:text-md",
              covered
                ? "text-quaternary line-through"
                : "text-stone-700 dark:text-stone-200"
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

        {inSlot ? (
          <Checkbox
            size="sm"
            aria-label={`Covered "${name}"`}
            isSelected={covered}
            onChange={(selected) => onCover(topic.id, selected)}
            className="mt-0.5 shrink-0"
          />
        ) : null}

        <ButtonUtility
          size="xs"
          color="tertiary"
          icon={X}
          tooltip="Delete topic"
          className="absolute top-0.5 right-0.5 z-10 rounded-md bg-primary opacity-0 shadow-xs touch:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
          onClick={() => onDelete(topic)}
        />
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
        <label className="flex max-h-0 items-center gap-1 overflow-hidden border-stone-100 px-2 opacity-0 transition-all duration-150 touch:max-h-12 touch:border-t touch:py-1 touch:opacity-100 group-focus-within:max-h-12 group-focus-within:border-t group-focus-within:py-1 group-focus-within:opacity-100 group-hover:max-h-12 group-hover:border-t group-hover:py-1 group-hover:opacity-100 dark:border-stone-800">
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
