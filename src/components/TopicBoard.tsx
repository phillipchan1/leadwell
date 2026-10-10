import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import type { CurriculumSlot, Session, Tag, Topic, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { useBoardDnD } from "@/hooks/use-board-dnd";
import { InlineComposer } from "./InlineComposer";
import { TopicDetail } from "./TopicDetail";
import {
  boardLayout,
  curriculumOf,
  looseTopics,
  nextSlotAfter,
  parseColumnKey,
  plannedSlots,
  slotDotClass,
  slotKey,
  type BucketGroup,
  type Slot,
  type WeekCell,
  type WeekColumn,
} from "../lib/topics";
import { MEETING_LABEL, daysBetween, todayISO } from "../lib/readiness";
import { sessionSummary } from "../lib/session";
import { deleteWithUndo, doWithUndo } from "../lib/undo";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { ArrowRight, ChevronRight, DotsGrid, Plus } from "@untitledui/icons";
import {
  useReorderableRow,
  type MoveResult,
} from "@/hooks/use-reorderable-row";
import { announce } from "@/lib/announce";
import { MOD_LABEL } from "@/lib/keys";
import { IdeasIcon } from "./shell/places";
import { cx } from "@/utils/cx";

/**
 * The planner: this meeting's ideas in a tray on the left, its weeks laid out
 * to the right as sheets, one row per section of the standing agenda.
 *
 * Both halves stay mounted so a card can be dragged from the tray onto a week
 * and back without switching views. The grid is the point of the page — it
 * shows at a glance which weeks are planned and which sections keep getting
 * skipped, which is the thing no calendar shows you.
 */

export type BoardDirection = "down" | "up";

const HANDLE_LABEL = (name: string) =>
  `Move “${name}” — Alt with up or down arrow to reorder, Delete to remove`;

const CAPTURE_PLACEHOLDER: Record<BoardDirection, string> = {
  down: "Something to raise…",
  up: "Ask, escalate, flag…",
};

type MoveGroup = { label: string; options: { key: string; label: string }[] };

type CardHandlers = {
  moveGroups: MoveGroup[];
  handleProps: ReturnType<typeof useBoardDnD>["handleProps"];
  onMove: (id: string, key: string) => void;
  onReorder: (id: string, direction: -1 | 1) => MoveResult;
  onCover: (id: string, covered: boolean) => void;
  onRoll: (topic: Topic) => void;
  onBacklog: (id: string) => void;
  onDelete: (topic: Topic) => void;
  /** Capture straight into a cell, with the `#tag @meeting !` grammar. */
  onAddHere?: (raw: string, key: string) => void;
  /** Open the full idea — title, sub-points, notes, placement. */
  onOpen?: (id: string) => void;
};

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

/** "Mon, Aug 17" — the week's name everywhere a list has to say it. */
export function weekName(iso: string): string {
  return fmtDay(iso, { weekday: "short", month: "short", day: "numeric" });
}

export function TopicBoard({
  meeting,
  direction = "down",
  selectedSlotKey,
  onSelectWeek,
  ahead,
  narrow = false,
}: {
  meeting: TrackedMeeting;
  direction?: BoardDirection;
  selectedSlotKey?: string | null;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
  ahead?: number;
  /** A side panel, not a page: the tray starts folded so the weeks get the room. */
  narrow?: boolean;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const tags = useStore((s) => s.tags);
  const placeTopic = useStore((s) => s.placeTopic);
  const placeTopicAt = useStore((s) => s.placeTopicAt);
  const captureTopics = useStore((s) => s.captureTopics);
  const coverTopic = useStore((s) => s.coverTopic);
  const rollTopic = useStore((s) => s.rollTopic);
  const deleteTopic = useStore((s) => s.deleteTopic);
  const restoreTopic = useStore((s) => s.restoreTopic);
  const moveTopic = useStore((s) => s.moveTopic);
  const addSession = useStore((s) => s.addSession);
  const addMeetingRow = useStore((s) => s.addMeetingRow);
  const setCurriculum = useStore((s) => s.setCurriculum);
  const setTab = useStore((s) => s.setTab);
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  /*
   * With a week open beside the board there isn't room for the tray as well,
   * so it folds to a rail. Opening it from the rail holds until the week
   * closes.
   */
  const [trayWhileOpen, setTrayWhileOpen] = useState(false);
  useEffect(() => {
    if (!selectedSlotKey && !narrow) setTrayWhileOpen(false);
  }, [selectedSlotKey, narrow]);
  const trayFolded = (narrow || Boolean(selectedSlotKey)) && !trayWhileOpen;

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

  /*
   * An idea that isn't on a week has no meeting to be covered in, so ticking it
   * is done and it leaves the tray. A tick is an easy slip, so it gets the
   * same Undo a delete does rather than vanishing silently.
   */
  const completeIdea = useCallback(
    (topic: Topic) => {
      doWithUndo(
        "Idea marked done.",
        () => coverTopic(topic.id, true),
        () => coverTopic(topic.id, false)
      );
      announce(
        `Marked “${topic.text || "topic"}” done. Press ${MOD_LABEL} Z to undo.`
      );
    },
    [coverTopic]
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

  const dnd = useBoardDnD(placeAt);
  const { drag, zoneRef: columnRef, handleProps } = dnd;
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
      options: layout.bucket.map((g) => ({
        key: g.key,
        label: g.label === "Ideas" ? "Ideas" : `Ideas · ${g.label}`,
      })),
    },
    ...layout.weeks.map((week) => ({
      label: weekName(week.slot.date),
      options: week.cells.map((c) => ({
        key: c.key,
        label: c.label ? `${weekName(week.slot.date)} · ${c.label}` : weekName(week.slot.date),
      })),
    })),
  ];

  const cardProps: CardHandlers = {
    moveGroups,
    handleProps,
    onAddHere: (raw, key) =>
      captureTopics(raw, { ...parseColumnKey(key), meetingId: meeting.id }),
    onOpen: setOpenTopicId,
    onMove: place,
    onReorder: (id, dir) => moveTopic(id, dir),
    // An idea off the week completes. A topic on a week is covered and stays put.
    onCover: (id, covered) => {
      const topic = topics.find((t) => t.id === id);
      if (covered && topic && !topic.sessionId) completeIdea(topic);
      else coverTopic(id, covered);
    },
    onRoll: roll,
    onBacklog: (id) => placeTopic(id, { lane: "backlog" }),
    onDelete: removeTopic,
  };

  const parked = layout.bucket[layout.bucket.length - 1];
  const ideaGroups = layout.bucket.slice(0, -1);
  const ideaCount = ideaGroups.reduce((n, g) => n + g.topics.length, 0);

  return (
    <div className="@container flex flex-col gap-4">
      {loose.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] bg-cond-watch-soft px-4 py-3">
          <p className="min-w-0 flex-1 text-[13.5px] leading-5 text-cond-watch-ink">
            <b className="font-semibold">
              {loose.length} topic{loose.length === 1 ? "" : "s"}
            </b>{" "}
            {loose.length === 1 ? "was" : "were"} planned for a{" "}
            {MEETING_LABEL[meeting.subjectKind]} that's been and gone, and never
            ticked off.
          </p>
          <button
            type="button"
            onClick={() => loose.forEach(roll)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-primary shadow-xs touch:min-h-11"
          >
            Carry to the next one
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}

      <div
        className={cx(
          "flex gap-5",
          trayFolded ? "items-start" : "flex-col @3xl:flex-row @3xl:items-start"
        )}
      >
        {trayFolded ? (
          <TrayRail count={ideaCount} onOpen={() => setTrayWhileOpen(true)} />
        ) : (
          <div className="@3xl:sticky @3xl:top-16 @3xl:w-[18rem] @3xl:shrink-0">
            <IdeasTray
              direction={direction}
              curriculum={curriculum}
              tags={tags}
              groups={ideaGroups}
              parked={parked}
              ideaCount={ideaCount}
              drag={drag}
              columnRef={columnRef}
              cardProps={cardProps}
              onFold={selectedSlotKey || narrow ? () => setTrayWhileOpen(false) : undefined}
              onAllIdeas={() => setTab("ideas")}
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
        )}

        <ScheduleGrid
          meetingId={meeting.id}
          weeks={layout.weeks}
          curriculum={curriculum}
          tags={tags}
          today={today}
          selectedSlotKey={selectedSlotKey}
          drag={drag}
          columnRef={columnRef}
          scrollerRef={dnd.scrollerRef}
          cardProps={cardProps}
          onSelectWeek={onSelectWeek}
          onAddRow={(label) => addMeetingRow(meeting.id, label)}
          onReorderRows={(ids) => {
            const byId = new Map(curriculum.map((c) => [c.id, c]));
            setCurriculum(
              meeting.id,
              ids.map((id) => byId.get(id)!).filter(Boolean)
            );
          }}
        />
      </div>

      {drag && dragged && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -rotate-2 rounded-[10px] border border-teal-200 bg-primary px-2.5 py-2 text-[13px] leading-[18px] text-primary shadow-[0_14px_32px_-10px_rgba(10,34,37,0.35),0_2px_6px_rgba(10,34,37,0.12)] dark:border-teal-800"
          style={{
            left: drag.x - drag.dx,
            top: drag.y - drag.dy,
            width: drag.width,
          }}
        >
          {dragged.text}
        </div>
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

// ── The grid ───────────────────────────────────────────────────────────────

type GridRow = { id: string; label: string; slotId?: string; minutes?: number };

function ScheduleGrid({
  meetingId,
  weeks,
  curriculum,
  tags,
  today,
  selectedSlotKey,
  drag,
  columnRef,
  scrollerRef,
  cardProps,
  onSelectWeek,
  onAddRow,
  onReorderRows,
}: {
  meetingId: string;
  weeks: WeekColumn[];
  curriculum: CurriculumSlot[];
  tags: Tag[];
  today: string;
  selectedSlotKey?: string | null;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  scrollerRef: ReturnType<typeof useBoardDnD>["scrollerRef"];
  cardProps: CardHandlers;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
  onAddRow: (label: string) => void;
  onReorderRows: (ids: string[]) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const restoreOccurrence = useStore((s) => s.restoreOccurrence);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const scrollLeftRef = useRef(0);
  const [hiddenRight, setHiddenRight] = useState(0);
  const [draggingRow, setDraggingRow] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHiddenRight(Math.max(0, el.scrollWidth - el.clientWidth - el.scrollLeft));
    setScrolled(el.scrollLeft > 4);
  }, []);

  // The board re-renders on every store change; keep the strip where it was.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = scrollLeftRef.current;
    measure();
  });

  // Opening a week from elsewhere (the header's Next up, a new one-off)
  // brings its column into view.
  useEffect(() => {
    if (!selectedSlotKey) return;
    const head = scrollRef.current?.querySelector<HTMLElement>('[aria-expanded="true"]');
    head?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selectedSlotKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const setScroller = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      // Dragging a card near the edge pans the strip.
      scrollerRef(el);
    },
    [scrollerRef]
  );

  const dropRow = (targetId: string) => {
    if (!draggingRow || draggingRow === targetId) return;
    const ids = curriculum.map((c) => c.id).filter((id) => id !== draggingRow);
    const at = ids.indexOf(targetId);
    const from = curriculum.findIndex((c) => c.id === draggingRow);
    const to = curriculum.findIndex((c) => c.id === targetId);
    ids.splice(from < to ? at + 1 : at, 0, draggingRow);
    onReorderRows(ids);
    announce("Section moved.");
  };

  const hasRows = curriculum.length > 0;
  const rows: GridRow[] = hasRows
    ? [
        ...curriculum.map((s) => ({ id: s.id, label: s.label, slotId: s.id, minutes: s.minutes })),
        { id: "untagged", label: "Untagged" },
      ]
    : [{ id: "all", label: "" }];

  /*
   * A skipped week isn't an occurrence, so the rhythm steps over it — but
   * leaving a gap where it was makes it impossible to find again. It keeps a
   * narrow column of its own, with the way back.
   */
  const lastDate = weeks[weeks.length - 1]?.slot.date;
  const skipped = sessions
    .filter(
      (o) =>
        o.meetingId === meetingId &&
        o.kind === "skipped" &&
        o.date >= today &&
        Boolean(lastDate) &&
        o.date <= lastDate!
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  type Lane = { kind: "week"; key: string; date: string; week: WeekColumn } | { kind: "skip"; key: string; date: string; session: Session };
  const lanes: Lane[] = [
    ...weeks.map((week) => ({ kind: "week" as const, key: week.key, date: week.slot.date, week })),
    ...skipped.map((session) => ({ kind: "skip" as const, key: `skip:${session.id}`, date: session.date, session })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const colOffset = hasRows ? 2 : 1;
  const colOf = new Map(lanes.map((l, i) => [l.key, i + colOffset]));
  const template = [
    hasRows ? "8.75rem" : null,
    ...lanes.map((l) =>
      l.kind === "skip" ? "4.5rem" : l.week.slot.past ? "7.75rem" : hasRows ? "11.5rem" : "13rem"
    ),
  ]
    .filter(Boolean)
    .join(" ");

  const upcoming = weeks.filter((w) => !w.slot.past);
  const nextKey = upcoming[0]?.key;

  const weekIsActive = (week: WeekColumn): boolean => {
    if (!selectedSlotKey) return false;
    return (
      selectedSlotKey === slotKey(week.slot) ||
      selectedSlotKey === `p:${week.slot.date}` ||
      Boolean(week.slot.sessionId && selectedSlotKey === `s:${week.slot.sessionId}`)
    );
  };

  const cellFor = (week: WeekColumn, row: GridRow) =>
    row.slotId
      ? week.cells.find((c) => c.slotId === row.slotId)
      : week.cells.find((c) => !c.slotId);

  const preview = (week: WeekColumn) => {
    const s = week.slot.sessionId ? sessions.find((o) => o.id === week.slot.sessionId) : null;
    return s ? sessionSummary(s, 64) : "";
  };

  if (!weeks.length) {
    return (
      <div className="flex min-h-40 flex-1 flex-col items-start justify-center gap-1 rounded-[16px] border border-dashed border-primary px-6 py-8">
        <p className="font-serif text-[19px] text-secondary italic">Nothing on the calendar yet.</p>
        <p className="text-[13px] text-tertiary">
          Set how often you meet in Settings, or add a one-off date.
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={setScroller}
        onScroll={() => {
          scrollLeftRef.current = scrollRef.current?.scrollLeft ?? 0;
          measure();
        }}
        className="scroll-contain scrollbar-hide overflow-x-auto pb-3"
      >
        <div
          className="relative inline-grid gap-x-3"
          style={{
            gridTemplateColumns: template,
            gridTemplateRows: `auto repeat(${rows.length}, minmax(${hasRows ? "5.75rem" : "12rem"}, auto))`,
          }}
        >
          {/* The sheets: one per week, behind its header and cells. */}
          {lanes.map((lane) => {
            if (lane.kind === "skip") {
              const active = selectedSlotKey === `s:${lane.session.id}`;
              return (
                <Fragment key={lane.key}>
                  <div
                    aria-hidden
                    style={{ gridColumn: colOf.get(lane.key), gridRow: `1 / span ${rows.length + 1}` }}
                    className={cx(
                      "rounded-[14px] bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--color-border-secondary)_7px_8px)]",
                      active && "ring-[1.5px] ring-teal-600"
                    )}
                  />
                  <div
                    style={{ gridColumn: colOf.get(lane.key), gridRow: `1 / span ${rows.length + 1}` }}
                    className="relative z-[2] flex flex-col items-center gap-1 px-1 pt-3.5 text-center"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onSelectWeek?.(`s:${lane.session.id}`, {
                          sessionId: lane.session.id,
                          date: lane.session.date,
                          projected: false,
                          past: false,
                        })
                      }
                      aria-label={`${fmtDay(lane.date, { weekday: "long", month: "long", day: "numeric" })} is skipped. Open it.`}
                      className="flex flex-col items-center gap-0.5 rounded-lg px-1 py-0.5"
                    >
                      <span className="font-mono text-[10.5px] text-quaternary">
                        {fmtDay(lane.date, { weekday: "short" }).toUpperCase()}
                      </span>
                      <span className="font-serif text-[22px] leading-7 text-quaternary line-through">
                        {Number(lane.date.slice(8, 10))}
                      </span>
                      <span className="font-mono text-[9.5px] tracking-[0.06em] text-quaternary">SKIPPED</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => restoreOccurrence(lane.session.id)}
                      className="mt-1 rounded-md bg-primary px-1.5 py-1 text-[11px] font-semibold text-teal-700 shadow-xs hover:text-teal-800 touch:min-h-11 dark:text-teal-300"
                    >
                      Restore
                    </button>
                  </div>
                </Fragment>
              );
            }
            const week = lane.week;
            const i = (colOf.get(lane.key) ?? colOffset) - colOffset;
            const active = weekIsActive(week);
            const next = week.key === nextKey;
            const expected = week.slot.projected && !week.slot.past;
            return (
              <div
                key={`sheet-${week.key}`}
                aria-hidden
                style={{ gridColumn: i + colOffset, gridRow: `1 / span ${rows.length + 1}` }}
                className={cx(
                  "rounded-[14px] transition-colors",
                  active
                    ? "bg-teal-50 ring-[1.5px] ring-teal-600 dark:bg-teal-950/40 dark:ring-teal-500"
                    : week.slot.past
                      ? "bg-secondary"
                      : expected
                        ? "border-[1.5px] border-dashed border-primary"
                        : next
                          ? "bg-primary ring-[1.5px] ring-teal-600 shadow-[0_0_0_5px_var(--color-teal-50)] dark:ring-teal-500 dark:shadow-none"
                          : "bg-primary shadow-[0_0_0_1px_var(--color-border-secondary)]"
                )}
              />
            );
          })}

          {hasRows && (
            <div
              style={{ gridColumn: 1, gridRow: 1 }}
              className="sticky left-0 z-[3] flex items-end bg-primary pb-3"
            >
              <span className="eyebrow">Standing agenda</span>
            </div>
          )}

          {weeks.map((week) => (
            <WeekHeader
              key={`head-${week.key}`}
              column={colOf.get(week.key)!}
              week={week}
              today={today}
              isActive={weekIsActive(week)}
              isNext={week.key === nextKey}
              notesPreview={preview(week)}
              onSelect={() => onSelectWeek?.(slotKey(week.slot), week.slot)}
            />
          ))}

          {rows.map((row, ri) => (
            <Fragment key={row.id}>
              {hasRows && (
                <RowLabel
                  row={row}
                  gridRow={ri + 2}
                  weeks={upcoming}
                  dotClass={row.slotId ? slotDotClass(curriculum, row.slotId, tags) : undefined}
                  dragging={draggingRow === row.slotId}
                  over={overRow === row.slotId && draggingRow !== row.slotId}
                  onDragStart={() => row.slotId && setDraggingRow(row.slotId)}
                  onDragEnd={() => {
                    setDraggingRow(null);
                    setOverRow(null);
                  }}
                  onDragOver={() => draggingRow && row.slotId && setOverRow(row.slotId)}
                  onDrop={() => {
                    if (row.slotId) dropRow(row.slotId);
                    setDraggingRow(null);
                    setOverRow(null);
                  }}
                  onAddRow={ri === rows.length - 1 ? onAddRow : undefined}
                  canDrag={Boolean(draggingRow)}
                />
              )}
              {weeks.map((week) => {
                const cell = cellFor(week, row);
                const place = { gridColumn: colOf.get(week.key)!, gridRow: ri + 2 };
                const ruled = hasRows && ri > 0;
                if (!cell) {
                  return (
                    <div
                      key={`${row.id}-${week.key}`}
                      style={place}
                      className={cx(ruled && "border-t border-secondary")}
                    />
                  );
                }
                return (
                  <GridCell
                    key={cell.key}
                    style={place}
                    cell={cell}
                    ruled={ruled}
                    past={week.slot.past}
                    tickable={Boolean(week.slot.sessionId)}
                    drag={drag}
                    columnRef={columnRef}
                    cardProps={cardProps}
                    dropLabel={`Drop into ${weekName(week.slot.date)}${row.slotId ? ` · ${row.label}` : ""}`}
                    composerLabel={row.slotId ? `Add to ${row.label}` : "Add a topic"}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
        {!hasRows && <AddRow onAdd={onAddRow} first />}
      </div>

      {hasRows && scrolled && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[8.75rem] z-[4] w-5 bg-gradient-to-r from-[rgba(10,34,37,0.07)] to-transparent"
        />
      )}
      {hiddenRight > 24 && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-[4] w-24 bg-gradient-to-r from-transparent to-[var(--color-bg-primary)]"
          />
          <button
            type="button"
            onClick={() =>
              scrollRef.current?.scrollBy({
                left: Math.round((scrollRef.current?.clientWidth ?? 600) * 0.75),
                behavior: "smooth",
              })
            }
            className="absolute right-1 bottom-6 z-[5] inline-flex h-8 items-center gap-1.5 rounded-full border border-primary bg-primary px-3 text-[12px] font-semibold text-primary shadow-xs transition hover:border-teal-300 touch:min-h-11"
          >
            Later weeks
            <ArrowRight className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

function RowLabel({
  row,
  gridRow,
  weeks,
  dotClass,
  dragging,
  over,
  canDrag,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onAddRow,
}: {
  row: GridRow;
  gridRow: number;
  /** Upcoming weeks only — coverage looks forward. */
  weeks: WeekColumn[];
  dotClass?: string;
  dragging: boolean;
  over: boolean;
  canDrag: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onAddRow?: (label: string) => void;
}) {
  const filled = row.slotId
    ? weeks.map((w) => w.cells.some((c) => c.slotId === row.slotId && c.topics.length > 0))
    : [];
  const count = filled.filter(Boolean).length;

  return (
    <div
      style={{ gridColumn: 1, gridRow }}
      draggable={Boolean(row.slotId)}
      onDragStart={(e) => {
        if (!row.slotId) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.slotId);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!canDrag || !row.slotId) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      title={row.slotId ? "Drag to reorder sections" : undefined}
      className={cx(
        "group/row sticky left-0 z-[3] flex flex-col gap-1.5 bg-primary py-3.5 pr-3",
        gridRow > 2 && "border-t border-secondary",
        row.slotId && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50",
        over && "shadow-[inset_0_2px_0_0_var(--color-teal-600)]"
      )}
    >
      <span className="flex items-center gap-2 text-[13.5px] leading-5 font-semibold">
        {row.slotId ? (
          <DotsGrid aria-hidden className="size-3 shrink-0 text-quaternary opacity-50 transition-opacity group-hover/row:opacity-100" />
        ) : (
          <span aria-hidden className="size-3 shrink-0" />
        )}
        {dotClass && <i aria-hidden className={cx("size-2 shrink-0 rounded-[2px]", dotClass)} />}
        <span className={cx("min-w-0 break-words", !row.slotId && "text-tertiary")}>{row.label}</span>
      </span>
      {row.minutes ? (
        <span className="pl-5 font-mono text-[10.5px] text-quaternary">{row.minutes} MIN</span>
      ) : null}
      {row.slotId && filled.length > 0 && (
        <span
          className="flex items-center gap-2 pl-5"
          title={`Planned in ${count} of the next ${filled.length} weeks`}
        >
          <span aria-hidden className="flex items-end gap-[2.5px]">
            {filled.slice(0, 12).map((on, i) => (
              <i
                key={i}
                className={cx("h-[9px] w-[5px] rounded-[1.5px]", on ? dotClass : "bg-quaternary")}
              />
            ))}
          </span>
          <span className="font-mono text-[10.5px] text-quaternary">
            {count}/{filled.length}
          </span>
        </span>
      )}
      {onAddRow && <AddRow onAdd={onAddRow} />}
    </div>
  );
}

/** "+ Add a section", on the board itself — where the need for one is noticed. */
function AddRow({ onAdd, first }: { onAdd: (label: string) => void; first?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "inline-flex items-center gap-1 self-start rounded-md text-[12px] font-semibold text-teal-700 hover:text-teal-800 touch:min-h-11 dark:text-teal-400",
          first ? "mt-3" : "mt-2 pl-5"
        )}
      >
        <Plus className="size-3.5" />
        {first ? "Split weeks into sections" : "Add a section"}
      </button>
    );
  }
  return (
    <form
      className={cx("flex flex-col gap-1.5", first ? "mt-3 max-w-xs" : "mt-2")}
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onAdd(draft);
        setDraft("");
      }}
    >
      <input
        autoFocus
        placeholder="Prayer, Training…"
        aria-label="New section"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => !draft.trim() && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft("");
            setOpen(false);
          }
        }}
        className="h-8 w-full min-w-0 rounded-lg border border-teal-300 bg-primary px-2 text-[12.5px] outline-none dark:border-teal-700"
      />
      <span className="text-[11px] text-quaternary">Enter to add · Esc to stop</span>
    </form>
  );
}

function weekStatus(week: WeekColumn, today: string): { text: string; tone: string } {
  const total = week.topics.length;
  const open = week.topics.filter((t) => t.status === "open").length;
  const covered = total - open;
  if (week.slot.past) {
    if (total === 0) return { text: "Nothing planned", tone: "text-quaternary" };
    if (open === 0) return { text: "All covered", tone: "text-cond-thriving-ink" };
    return { text: `${open} not covered`, tone: "text-cond-watch-ink" };
  }
  const days = daysBetween(today, week.slot.date);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return {
    text: covered > 0 ? `${when} · ${covered} of ${total} covered` : when,
    tone: "text-tertiary",
  };
}

function WeekHeader({
  column,
  week,
  today,
  isActive,
  isNext,
  notesPreview,
  onSelect,
}: {
  column: number;
  week: WeekColumn;
  today: string;
  isActive: boolean;
  isNext: boolean;
  notesPreview: string;
  onSelect: () => void;
}) {
  const past = week.slot.past;
  const expected = week.slot.projected && !past;
  const status = weekStatus(week, today);
  const flag = isActive ? "Open" : isNext ? "Next" : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={isActive}
      aria-label={`${fmtDay(week.slot.date, { weekday: "long", month: "long", day: "numeric" })}. ${status.text}. ${isActive ? "Close" : "Open"} this week.`}
      style={{ gridColumn: column, gridRow: 1 }}
      className={cx(
        "group/week relative z-[2] flex min-w-0 flex-col gap-0.5 rounded-t-[14px] px-3.5 pt-3.5 pb-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-inset",
        past && !isActive && "opacity-70 hover:opacity-100"
      )}
    >
      <span className="flex h-[17px] items-center gap-2">
        <span
          className={cx(
            "font-mono text-[10.5px]",
            isActive ? "text-teal-700 dark:text-teal-300" : "text-quaternary"
          )}
        >
          {fmtDay(week.slot.date, { weekday: "short" }).toUpperCase()}
        </span>
        {flag && (
          <span className="inline-flex h-[17px] items-center rounded-[5px] bg-teal-600 px-1.5 font-mono text-[9.5px] font-medium tracking-[0.06em] text-white uppercase dark:bg-teal-500 dark:text-stone-950">
            {flag}
          </span>
        )}
        {week.exception ? (
          <span className="truncate font-mono text-[9.5px] tracking-[0.06em] text-teal-700 uppercase dark:text-teal-300">
            {week.exception}
          </span>
        ) : expected && !flag ? (
          <span className="font-mono text-[9.5px] tracking-[0.06em] text-quaternary">EXPECTED</span>
        ) : null}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={cx(
            "font-serif leading-[30px] transition-colors group-hover/week:text-teal-700 dark:group-hover/week:text-teal-300",
            past ? "text-[22px]" : "text-[26px]",
            expected && "text-secondary"
          )}
        >
          {Number(week.slot.date.slice(8, 10))}
        </span>
        <span className="text-[12.5px] text-tertiary">
          {fmtDay(week.slot.date, { month: "short" })}
        </span>
      </span>
      <span className={cx("truncate text-[11.5px]", isActive ? "text-teal-800 dark:text-teal-300" : status.tone)}>
        {status.text}
      </span>
      {notesPreview && (
        <span className="mt-1 line-clamp-2 font-serif text-[13px] leading-[17px] text-secondary italic">
          {notesPreview}
        </span>
      )}
    </button>
  );
}

function GridCell({
  cell,
  style,
  ruled,
  past,
  tickable,
  drag,
  columnRef,
  cardProps,
  dropLabel,
  composerLabel,
}: {
  cell: WeekCell;
  style: React.CSSProperties;
  ruled: boolean;
  past: boolean;
  tickable: boolean;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  dropLabel: string;
  composerLabel: string;
}) {
  const active = drag?.over === cell.key;
  // Where it would land, not just where it would go. In a cell that is a
  // running order, the position *is* the decision.
  const at = active ? drag!.index : -1;
  const line = (
    <li key="drop-line" aria-hidden className="h-0.5 list-none rounded-full bg-teal-600" />
  );

  const items: ReactNode[] = [];
  cell.topics.forEach((t, i) => {
    if (active && at === i) items.push(line);
    items.push(
      <BoardCard
        key={t.id}
        topic={t}
        columnKey={cell.key}
        past={past}
        tickable={tickable}
        covered={t.status !== "open"}
        isDragging={drag?.id === t.id}
        {...cardProps}
      />
    );
  });
  if (active && at >= cell.topics.length) items.push(line);

  return (
    <div
      ref={columnRef(cell.key)}
      style={style}
      className={cx(
        "group/cell relative z-[2] flex min-w-0 flex-col gap-1.5 p-1.5",
        ruled && "border-t border-secondary",
        active && "rounded-[11px] bg-teal-50/90 outline-[1.5px] outline-teal-600 outline-dashed -outline-offset-4 dark:bg-teal-950/50"
      )}
    >
      {items.length > 0 && <ul className="flex flex-col gap-1.5">{items}</ul>}
      {active && cell.topics.length === 0 && (
        <p className="px-1.5 py-1 text-[11.5px] font-semibold text-teal-800 dark:text-teal-300">
          {dropLabel}
        </p>
      )}
      {/* Capture where it belongs. Hidden until the cell is hovered, or the
          board becomes thirty identical Add buttons. Never into the past. */}
      {!drag && !past && cardProps.onAddHere && (
        <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/cell:opacity-100 touch:opacity-100">
          <InlineComposer
            compact
            label={composerLabel}
            placeholder={`${composerLabel}…  #tag !`}
            onAdd={(raw) => cardProps.onAddHere?.(raw, cell.key)}
          />
        </div>
      )}
    </div>
  );
}

// ── The tray ───────────────────────────────────────────────────────────────

function TrayRail({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show ideas (${count})`}
      className="sticky top-16 flex w-12 shrink-0 flex-col items-center gap-2.5 rounded-[14px] bg-tertiary py-3.5 text-secondary transition-colors hover:bg-quaternary"
    >
      <IdeasIcon className="size-[18px]" />
      <span className="font-mono text-[11px]">{count}</span>
      <span className="font-serif text-[15px] text-primary [writing-mode:vertical-rl]">Ideas</span>
    </button>
  );
}

function IdeasTray({
  direction,
  curriculum,
  tags,
  groups,
  parked,
  ideaCount,
  drag,
  columnRef,
  cardProps,
  onCapture,
  onFold,
  onAllIdeas,
}: {
  direction: BoardDirection;
  curriculum: CurriculumSlot[];
  tags: Tag[];
  groups: BucketGroup[];
  parked?: BucketGroup;
  ideaCount: number;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  onCapture: (text: string, slotId?: string) => void;
  onFold?: () => void;
  onAllIdeas: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [parkedOpen, setParkedOpen] = useState(false);

  // Filtering to a section means adding into it, too.
  const slotOf = filter !== "all" && filter !== "untagged" ? filter : undefined;
  const filterLabel = curriculum.find((s) => s.id === slotOf)?.label;

  const capture = () => {
    const text = draft.trim();
    if (!text) return;
    onCapture(text, slotOf);
    setDraft("");
    // Never let a capture vanish behind the active filter.
    const landsIn = text.includes("#") ? "all" : (slotOf ?? "untagged");
    if (filter !== "all" && filter !== landsIn) setFilter(landsIn);
  };

  const dropActive = (key: string) =>
    drag?.over === key || (key === "backlog" && drag?.over?.startsWith("backlog"));

  const visible = groups.flatMap((g) => {
    if (!g.topics.length) return [];
    if (filter === "all") return [g];
    if (filter === "untagged" && g.key === "backlog") return [g];
    if (g.slotId === filter) return [g];
    return [];
  });
  // Mid-drag every group is a target, empty or not.
  const listGroups = drag ? groups : visible;

  const filters: { id: string; label: string; count: number; slotId?: string }[] = [
    { id: "all", label: "All", count: ideaCount },
  ];
  const untagged = groups.find((g) => g.key === "backlog" && curriculum.length > 0);
  if (untagged && (untagged.topics.length || filter === "untagged"))
    filters.push({ id: "untagged", label: "Untagged", count: untagged.topics.length });
  for (const s of curriculum) {
    const n = groups.find((g) => g.slotId === s.id)?.topics.length ?? 0;
    if (n > 0 || filter === s.id) filters.push({ id: s.id, label: s.label, count: n, slotId: s.id });
  }

  return (
    <section
      aria-label="Ideas for this meeting"
      className="flex flex-col gap-3.5 rounded-[18px] bg-tertiary px-3.5 pt-4 pb-3"
    >
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="font-serif text-[22px] leading-[26px]">Ideas</h2>
        <span className="font-mono text-[12px] text-quaternary">{ideaCount}</span>
        <span className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onAllIdeas}
            className="text-[12px] font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400"
          >
            All ideas
          </button>
          {onFold && (
            <button
              type="button"
              onClick={onFold}
              className="text-[12px] font-semibold text-tertiary hover:text-secondary"
            >
              Hide
            </button>
          )}
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          capture();
        }}
        className="flex h-[42px] items-center gap-2 rounded-[11px] border border-secondary bg-primary px-3 shadow-[0_1px_1.5px_rgba(10,34,37,0.05)] focus-within:border-teal-300 dark:focus-within:border-teal-700"
      >
        <Plus aria-hidden className="size-3.5 shrink-0 text-quaternary" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={filterLabel ? `Add to ${filterLabel}…` : CAPTURE_PLACEHOLDER[direction]}
          aria-label={filterLabel ? `Add an idea to ${filterLabel}` : "Add an idea"}
          enterKeyHint="done"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-quaternary"
        />
        <span aria-hidden className="font-mono text-[10.5px] text-quaternary">
          #tag ↵
        </span>
      </form>

      {filters.length > 1 && (
        <div className="-mx-1 flex flex-wrap gap-0.5" role="group" aria-label="Filter ideas">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cx(
                "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2 text-[12px] font-medium transition-colors touch:min-h-11",
                filter === f.id
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "text-tertiary hover:bg-primary hover:text-secondary"
              )}
            >
              {f.slotId && (
                <i
                  aria-hidden
                  className={cx("size-2 rounded-[2px]", slotDotClass(curriculum, f.slotId, tags))}
                />
              )}
              {f.label}
              <span className="font-mono text-[10.5px] opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={columnRef("backlog")}
        className={cx(
          "-mx-1 flex max-h-[min(30rem,55vh)] flex-col gap-3 overflow-y-auto rounded-xl px-1 py-0.5",
          drag && "min-h-16",
          dropActive("backlog") && !groups.some((g) => g.key !== "backlog" && drag?.over === g.key) &&
            "ring-2 ring-teal-500"
        )}
      >
        {listGroups.length === 0 && (
          <p className="px-2 py-5 font-serif text-[16px] leading-6 text-secondary italic">
            {ideaCount === 0
              ? drag
                ? "Drop here to take it off the week."
                : "Nothing waiting. Capture something above."
              : "Nothing in this section."}
          </p>
        )}
        {listGroups.map((group) => (
          <div
            key={group.key}
            ref={columnRef(group.key)}
            className={cx(
              "flex flex-col gap-1.5 rounded-[11px]",
              drag && "p-1",
              drag?.over === group.key && "bg-teal-50/90 ring-2 ring-teal-500 ring-inset dark:bg-teal-950/40"
            )}
          >
            {(filter === "all" || drag) && group.label !== "Ideas" && (
              <span className="eyebrow flex items-center gap-1.5 px-1">
                {group.slotId && (
                  <i
                    aria-hidden
                    className={cx("size-2 rounded-[2px]", slotDotClass(curriculum, group.slotId, tags))}
                  />
                )}
                {group.label}
              </span>
            )}
            {group.topics.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {group.topics.map((t) => (
                  <BoardCard
                    key={t.id}
                    topic={t}
                    columnKey={group.key}
                    past={false}
                    tickable
                    covered={false}
                    isDragging={drag?.id === t.id}
                    {...cardProps}
                  />
                ))}
              </ul>
            )}
            {drag && group.topics.length === 0 && (
              <p className="rounded-[10px] border border-dashed border-primary px-2 py-2.5 text-center text-[11.5px] text-quaternary">
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
            "border-t border-primary pt-1",
            drag?.over === parked.key && "rounded-lg bg-teal-50/90 ring-2 ring-teal-500 dark:bg-teal-950/40"
          )}
        >
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 px-1.5 text-left text-[12.5px] font-medium text-tertiary hover:text-secondary"
            onClick={() => setParkedOpen((v) => !v)}
            aria-expanded={parkedOpen}
          >
            Parked
            <span className="font-mono text-[11px]">{parked.topics.length}</span>
            <ChevronRight
              aria-hidden
              className={cx("ml-auto size-3.5 transition-transform", parkedOpen && "rotate-90")}
            />
          </button>
          {drag && !parkedOpen && (
            <p className="px-1.5 pb-2 text-[11.5px] text-quaternary">Drop here to set it aside.</p>
          )}
          {parkedOpen && parked.topics.length > 0 && (
            <ul className="flex flex-col gap-1.5 pb-1">
              {parked.topics.map((t) => (
                <BoardCard
                  key={t.id}
                  topic={t}
                  columnKey={parked.key}
                  past={false}
                  tickable
                  covered={false}
                  isDragging={drag?.id === t.id}
                  {...cardProps}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ── The card ───────────────────────────────────────────────────────────────

function NotesGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8.5h5M9 13h7M9 16.5h5" strokeLinecap="round" />
    </svg>
  );
}

/** One muted line under the title, in priority order. */
function cardMeta(topic: Topic, covered: boolean): ReactNode[] {
  if (covered) return [];
  const out: ReactNode[] = [];
  if (topic.returnedOn) {
    out.push(
      <span key="back" className="text-cond-watch-ink">
        Came back
        {topic.returnedFromDate ? ` · ${fmtDay(topic.returnedFromDate, { month: "short", day: "numeric" })}` : ""}
      </span>
    );
  } else if (topic.carried > 1) {
    out.push(
      <span key="pushed" className="text-cond-watch-ink">
        Pushed {topic.carried}×
      </span>
    );
  }
  if (topic.dueDate) {
    const late = topic.dueDate < todayISO();
    out.push(
      <span key="due" className={late ? "text-cond-critical-ink" : undefined}>
        Due {fmtDay(topic.dueDate, { month: "short", day: "numeric" })}
      </span>
    );
  }
  if (topic.points?.length) {
    out.push(
      <span key="pts">
        {topic.points.filter((p) => p.done).length}/{topic.points.length} points
      </span>
    );
  }
  if (topic.detail?.trim()) {
    out.push(
      <span key="notes" title="Has notes" className="inline-flex">
        <NotesGlyph />
      </span>
    );
  }
  return out;
}

function BoardCard({
  topic,
  columnKey,
  past,
  tickable,
  covered,
  isDragging,
  moveGroups,
  handleProps,
  onMove,
  onReorder,
  onCover,
  onRoll,
  onBacklog,
  onDelete,
  onOpen,
}: {
  topic: Topic;
  columnKey: string;
  past: boolean;
  /** Shows the done tick: a week that is a real meeting, or an idea. */
  tickable: boolean;
  covered: boolean;
  isDragging: boolean;
} & CardHandlers) {
  const ref = useRef<HTMLLIElement>(null);
  const name = topic.text || "topic";
  const down = useRef<{ x: number; y: number } | null>(null);
  const { rowProps, handleProps: keyHandleProps } = useReorderableRow({
    label: `“${name}”`,
    onMove: (dir) => onReorder(topic.id, dir),
    onDelete: () => onDelete(topic),
  });

  const grab = handleProps(topic.id, columnKey, ref);
  /*
   * Drag from anywhere on the card — this board asks you to move things
   * constantly, and a dot-sized handle is a target you have to aim for.
   * Controls opt out so a tick stays a tick; a drag only begins past the slop
   * threshold anyway, so the two never compete.
   */
  const cardGrab = {
    ...grab,
    onPointerDown: (e: ReactPointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, select, textarea, a, label, [role="checkbox"], button')) return;
      grab.onPointerDown(e);
    },
    // A press that never travelled is a click, and a click opens the idea.
    onClick: (e: ReactMouseEvent) => {
      if (!onOpen) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, select, textarea, a, label, [role="checkbox"], button')) return;
      const start = down.current;
      down.current = null;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      onOpen(topic.id);
    },
  };

  const meta = cardMeta(topic, covered);
  const slipped = past && !covered;

  return (
    <li
      ref={ref}
      data-drag-item={topic.id}
      {...rowProps}
      className={cx(
        "group/card relative list-none rounded-[10px] border transition-[border-color,box-shadow]",
        covered
          ? "border-transparent bg-secondary"
          : slipped
            ? "border-cond-watch bg-primary shadow-[inset_3px_0_0_var(--color-cond-watch)]"
            : "border-secondary bg-primary shadow-[0_1px_1.5px_rgba(10,34,37,0.05)] hover:border-primary hover:shadow-[0_2px_6px_-2px_rgba(10,34,37,0.14)]",
        isDragging && "opacity-35"
      )}
    >
      {/*
        The keyboard handle: ⌥↑/⌥↓ to reorder, Delete to remove. Invisible
        until it has focus — the whole card is the drag target for a pointer,
        and a visible grip would eat a fifth of a narrow column.
      */}
      <button
        type="button"
        aria-label={HANDLE_LABEL(name)}
        title="Drag, or ⌥↑ / ⌥↓ to reorder · Delete to remove"
        className="absolute top-1.5 -left-2.5 z-10 flex size-5 cursor-grab touch-none items-center justify-center rounded-md bg-primary text-quaternary opacity-0 shadow-xs ring-1 ring-secondary select-none group-hover/card:opacity-100 focus-visible:opacity-100"
        {...keyHandleProps}
        {...handleProps(topic.id, columnKey, ref)}
      >
        <DotsGrid className="size-3" />
      </button>

      <div
        {...cardGrab}
        className="flex cursor-grab items-start gap-2 px-2.5 py-2 active:cursor-grabbing"
      >
        {tickable && (
          <Checkbox
            size="sm"
            aria-label={`${topic.sessionId ? "Covered" : "Done"}: “${name}”`}
            isSelected={covered}
            onChange={(selected) => onCover(topic.id, selected)}
            className="mt-px shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cx(
              "text-[13px] leading-[18px] break-words",
              covered ? "text-quaternary line-through" : "text-primary"
            )}
          >
            {topic.urgent && !covered && (
              <span className="mr-1 font-semibold text-cond-critical-ink" aria-label="Urgent">
                !
              </span>
            )}
            {topic.text || <span className="text-quaternary italic">Untitled</span>}
          </p>
          {meta.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] tracking-[0.02em] text-quaternary uppercase">
              {meta}
            </div>
          )}
        </div>
      </div>

      {slipped && (
        <div className="flex flex-wrap items-center gap-x-3 border-t border-cond-watch-soft px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => onRoll(topic)}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-cond-watch-ink hover:underline touch:min-h-11"
          >
            Next time
            <ArrowRight className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => onBacklog(topic.id)}
            className="text-[11.5px] font-semibold text-tertiary hover:underline touch:min-h-11"
          >
            Back to ideas
          </button>
        </div>
      )}

      {/*
        "Move to…" is the keyboard and screen-reader path, so it cannot simply
        be hidden — a display:none control leaves the tab order. It collapses
        to nothing instead, and opens on keyboard focus, or on touch, where
        there is no hover to rely on.
      */}
      <label className="flex max-h-0 items-center gap-1 overflow-hidden border-secondary px-2.5 opacity-0 transition-all duration-150 touch:max-h-12 touch:border-t touch:py-1 touch:opacity-100 has-focus-visible:max-h-12 has-focus-visible:border-t has-focus-visible:py-1 has-focus-visible:opacity-100">
        <span className="sr-only">Move “{name}” to</span>
        <select
          value={columnKey}
          onChange={(e) => onMove(topic.id, e.target.value)}
          className="min-h-7 w-full cursor-pointer rounded border-0 bg-transparent py-0 text-[11.5px] text-tertiary outline-none touch:min-h-11"
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
    </li>
  );
}
