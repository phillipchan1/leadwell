import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingRhythm, MeetingSubjectKind, TrackedMeeting } from "../types";
import {
  ANCHOR_WEEKDAY_OPTIONS,
  RHYTHM_LABEL,
  STATE_COLOR,
  STATE_LABEL,
  formatCountdown,
  meetingTitle,
  meetingsFor,
  readinessOf,
} from "../lib/readiness";
import { topicsFor } from "../lib/topics";
import { MeetingPlanner } from "./MeetingPlanner";
import type { BoardDirection } from "./TopicBoard";
import { OccurrenceNotesPanel } from "./OccurrenceNotesPanel";
import { OccurrenceNotesSheet } from "./OccurrenceNotesSheet";
import { SessionHistoryTable } from "./SessionHistoryTable";
import { StartMeetingForm } from "./StartMeetingForm";
import { TrackerLink } from "./TrackerLink";
import { Modal, TintBadge } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { Expand01, Plus } from "@untitledui/icons";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { cx } from "@/utils/cx";

type WorkspaceView = "plan" | "history";

/**
 * Everything about the recurring meetings with one subject, in one mode.
 *
 * One meeting is active at a time. A compact switcher picks the room; Plan and
 * History live below it. Settings and identity editing live on the meeting's
 * own page — this surface is for planning and looking back.
 */
export function SubjectMeetings({
  subjectKind,
  subjectId,
  subjectName,
  direction = "down",
  focusSessionId,
}: {
  subjectKind: MeetingSubjectKind;
  subjectId: string;
  subjectName: string;
  direction?: BoardDirection;
  /** Entry to open on arrival, when a readiness fix sent you here. */
  focusSessionId?: string;
}) {
  const meetings = useStore((s) => s.meetings);
  const trackMeeting = useStore((s) => s.trackMeeting);
  const createMeeting = useStore((s) => s.createMeeting);
  const openSession = useStore((s) => s.openSession);
  const [adding, setAdding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (focusSessionId) openSession(focusSessionId);
  }, [focusSessionId, openSession]);

  const mine = useMemo(
    () => meetingsFor(meetings, subjectKind, subjectId),
    [meetings, subjectKind, subjectId]
  );
  const firstName = subjectName.split(" ")[0] ?? subjectName;

  useEffect(() => {
    if (!mine.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !mine.some((m) => m.id === activeId)) {
      setActiveId(mine[0]!.id);
    }
  }, [mine, activeId]);

  const startMeeting = (rhythm: MeetingRhythm, name?: string) => {
    const id =
      mine.length === 0
        ? trackMeeting(subjectKind, subjectId, rhythm, { name })
        : createMeeting(subjectKind, subjectId, { rhythm, name });
    setActiveId(id);
    setAdding(false);
  };

  const active = mine.find((m) => m.id === activeId) ?? mine[0] ?? null;

  if (!mine.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-primary px-4 py-8 text-center">
          <p className="text-sm text-quaternary">No meetings tracked yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-quaternary">
            Same as a staff meeting: name it, plan topics, write it up. Add as
            many as you actually run with {firstName}.
          </p>
          <div className="mt-4">
            <StartMeetingForm
              subjectKind={subjectKind}
              subjectName={subjectName}
              onStart={startMeeting}
            />
          </div>
        </div>
        <TrackerLink subjectKind={subjectKind} subjectId={subjectId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MeetingSwitcher
        meetings={mine}
        subjectName={subjectName}
        activeId={active?.id ?? null}
        onSelect={setActiveId}
        onAdd={() => setAdding(true)}
      />

      {active && (
        <FocusedMeeting
          meeting={active}
          subjectName={subjectName}
          direction={direction}
          siblingMeetings={mine}
          onOpenSession={openSession}
        />
      )}

      <div className="border-t border-stone-100 pt-3 dark:border-stone-800">
        <TrackerLink subjectKind={subjectKind} subjectId={subjectId} />
      </div>

      {adding && (
        <Modal
          title="Another meeting"
          subtitle="A separate gathering — its own name, topics and history."
          onClose={() => setAdding(false)}
        >
          <StartMeetingForm
            subjectKind={subjectKind}
            subjectName={subjectName}
            onStart={startMeeting}
            submitLabel="Add meeting"
          />
        </Modal>
      )}
    </div>
  );
}

function MeetingSwitcher({
  meetings,
  subjectName,
  activeId,
  onSelect,
  onAdd,
}: {
  meetings: TrackedMeeting[];
  subjectName: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const allMeetings = useStore((s) => s.meetings);
  const roving = useRovingFocus();
  const listId = useId();

  if (meetings.length === 1) {
    return (
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          color="link-gray"
          iconLeading={Plus}
          className="shrink-0"
          onClick={onAdd}
        >
          Add meeting
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
          Meetings
        </span>
        <Button
          size="sm"
          color="link-gray"
          iconLeading={Plus}
          className="shrink-0"
          onClick={onAdd}
        >
          Add
        </Button>
      </div>
      <div
        {...roving.groupProps}
        role="tablist"
        aria-label={`Meetings with ${subjectName}`}
        className="scroll-contain -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {meetings.map((meeting) => {
          const readiness = readinessOf(meeting, {
            meetings: allMeetings,
            sessions,
            topics,
          });
          const color = STATE_COLOR[readiness.state];
          const openCount = topicsFor(topics, meeting.id).filter(
            (t) => t.status === "open"
          ).length;
          const selected = meeting.id === activeId;
          const title = meetingTitle(meeting, subjectName);

          return (
            <button
              key={meeting.id}
              type="button"
              role="tab"
              id={`${listId}-tab-${meeting.id}`}
              aria-selected={selected}
              {...roving.itemProps(selected)}
              onClick={() => onSelect(meeting.id)}
              className={cx(
                "flex min-w-[10.5rem] max-w-[14rem] shrink-0 flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition",
                "touch:min-h-11",
                selected
                  ? "border-teal-500 bg-teal-50/80 shadow-sm ring-1 ring-teal-500/30 dark:border-teal-600 dark:bg-teal-950/40 dark:ring-teal-600/40"
                  : "border-secondary bg-primary hover:border-teal-400/60 hover:bg-stone-50 dark:hover:bg-stone-900/40"
              )}
            >
              <span className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
                {title}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <TintBadge color={color}>{STATE_LABEL[readiness.state]}</TintBadge>
                <span className="text-caption tabular-nums text-quaternary">
                  {openCount} open
                </span>
              </span>
              <span className="truncate text-caption text-quaternary">
                {RHYTHM_LABEL[meeting.rhythm]}
                {` · ${formatCountdown(readiness)}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FocusedMeeting({
  meeting,
  subjectName,
  direction,
  siblingMeetings,
  onOpenSession,
}: {
  meeting: TrackedMeeting;
  subjectName: string;
  direction: BoardDirection;
  siblingMeetings: TrackedMeeting[];
  onOpenSession: (id: string) => void;
}) {
  const { sessions, topics, meetings, selectMeeting } = useStore();
  const readiness = readinessOf(meeting, { meetings, sessions, topics });
  const color = STATE_COLOR[readiness.state];
  const openCount = topicsFor(topics, meeting.id).filter(
    (t) => t.status === "open"
  ).length;
  const [view, setView] = useState<WorkspaceView>("plan");
  const [planSlotKey, setPlanSlotKey] = useState<string | null>(null);
  const [historySlotKey, setHistorySlotKey] = useState<string | null>(null);
  const viewRoving = useRovingFocus();
  const panelId = useId();

  const closePlanNotes = useCallback(() => setPlanSlotKey(null), []);
  const closeHistoryNotes = useCallback(() => setHistorySlotKey(null), []);
  const openSessionNotes = useCallback((sessionId: string) => {
    setHistorySlotKey(`s:${sessionId}`);
  }, []);
  const onSelectWeek = useCallback((slotKey: string) => {
    setPlanSlotKey(slotKey);
  }, []);

  useEffect(() => {
    setPlanSlotKey(null);
    setHistorySlotKey(null);
    setView("plan");
  }, [meeting.id]);

  const weekday =
    meeting.anchorWeekday !== undefined
      ? ANCHOR_WEEKDAY_OPTIONS.find(
          (o) => o.value === String(meeting.anchorWeekday)
        )?.label
      : undefined;

  const title = meetingTitle(meeting, subjectName);

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="truncate text-base font-semibold text-stone-800 dark:text-stone-100">
              {title}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <TintBadge color={color}>{STATE_LABEL[readiness.state]}</TintBadge>
              <span
                className="font-mono text-caption tabular-nums"
                style={{ color }}
              >
                {formatCountdown(readiness)}
              </span>
              <span className="text-caption text-quaternary">
                {RHYTHM_LABEL[meeting.rhythm]}
                {weekday ? ` · Usually ${weekday}` : ""}
                {readiness.nextDate
                  ? ` · next ${readiness.projected ? "~" : ""}${readiness.nextDate.slice(5).replace("-", "/")}`
                  : ""}
              </span>
              {view === "plan" && (
                <span className="text-caption tabular-nums text-quaternary">
                  · {openCount} open
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              color="link-gray"
              onClick={() => selectMeeting(meeting.id, "profile")}
            >
              Settings
            </Button>
            <Button
              size="sm"
              color="link-gray"
              iconLeading={Expand01}
              onClick={() => selectMeeting(meeting.id)}
              aria-label="Open this meeting's own page"
            >
              <span className="sr-only">Open meeting page</span>
            </Button>
          </div>
        </div>

        <div
          {...viewRoving.groupProps}
          className="inline-flex shrink-0 gap-0.5 rounded-lg bg-tertiary p-0.5 touch:gap-2"
          role="tablist"
          aria-label={`${title} workspace`}
        >
          {(
            [
              { id: "plan", label: "Plan" },
              { id: "history", label: "History" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              id={`${panelId}-tab-${v.id}`}
              aria-selected={view === v.id}
              aria-controls={panelId}
              {...viewRoving.itemProps(view === v.id)}
              className={cx(
                "rounded-md px-3 py-1 text-xs font-semibold transition",
                "touch:min-h-11 touch:min-w-11",
                view === v.id
                  ? "bg-primary text-stone-800 shadow-sm dark:text-stone-100"
                  : "text-quaternary hover:text-stone-700 dark:hover:text-stone-200"
              )}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-${view}`}
      >
        {view === "plan" ? (
          <MeetingPlanner
            meeting={meeting}
            direction={direction}
            selectedSlotKey={planSlotKey}
            onSelectWeek={onSelectWeek}
            onCloseNotes={closePlanNotes}
            onOpenSession={onOpenSession}
            siblingMeetings={siblingMeetings}
            subjectName={subjectName}
          />
        ) : (
          <SessionHistoryTable
            meetingId={meeting.id}
            onOpen={openSessionNotes}
          />
        )}
      </div>

      {historySlotKey && (
        <OccurrenceNotesSheet
          open
          onClose={closeHistoryNotes}
          label="Meeting notes"
        >
          <OccurrenceNotesPanel
            meeting={meeting}
            slotKey={historySlotKey}
            onClose={closeHistoryNotes}
            onOpenFullEditor={onOpenSession}
          />
        </OccurrenceNotesSheet>
      )}
    </section>
  );
}
