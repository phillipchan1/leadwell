import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingRhythm, MeetingSubjectKind, TrackedMeeting } from "../types";
import {
  ANCHOR_WEEKDAY_OPTIONS,
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
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
import { TintBadge } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Expand01 } from "@untitledui/icons";

/** Default tolerance offered when a meeting is switched to as-needed. */
const DEFAULT_FLOOR_DAYS = 45;

/**
 * Everything about the recurring meetings with one subject, in one mode.
 *
 * Topics and history used to be two tabs, which is a lie about how the work
 * goes: you decide what to raise *while* reading what you said last time. Here
 * they're one column per meeting — what's coming, then what happened — and a
 * subject with two meetings gets two of these rather than one merged board,
 * because a weekly sync and a quarterly review are different rooms.
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

  useEffect(() => {
    if (focusSessionId) openSession(focusSessionId);
  }, [focusSessionId, openSession]);

  const mine = meetingsFor(meetings, subjectKind, subjectId);
  const firstName = subjectName.split(" ")[0] ?? subjectName;

  const startMeeting = (rhythm: MeetingRhythm, name?: string) => {
    if (mine.length === 0) {
      trackMeeting(subjectKind, subjectId, rhythm, { name });
    } else {
      createMeeting(subjectKind, subjectId, { rhythm, name });
    }
    setAdding(false);
  };

  if (!mine.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-primary px-4 py-8 text-center">
          <p className="text-sm text-quaternary">
            No meetings tracked yet.
          </p>
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
    <div className="space-y-6">
      {mine.map((meeting) => (
        <MeetingBlock
          key={meeting.id}
          meeting={meeting}
          subjectName={subjectName}
          direction={direction}
          onOpenSession={openSession}
        />
      ))}

      {adding ? (
        <div className="rounded-xl border border-secondary bg-stone-50/60 p-4 dark:bg-stone-950/40">
          <p className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-200">
            Another meeting
          </p>
          <p className="mb-3 text-xs text-quaternary">
            A separate gathering — its own name, topics and history.
          </p>
          <StartMeetingForm
            subjectKind={subjectKind}
            subjectName={subjectName}
            onStart={startMeeting}
            submitLabel="Add meeting"
          />
          <Button
            size="sm"
            color="link-gray"
            className="mt-2"
            onClick={() => setAdding(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-3 dark:border-stone-800">
          <TrackerLink subjectKind={subjectKind} subjectId={subjectId} />
          <Button
            size="sm"
            color="link-gray"
            className="shrink-0"
            onClick={() => setAdding(true)}
          >
            + Add meeting
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * One meeting: what it is and when it's next, what to raise, what was said.
 */
function MeetingBlock({
  meeting,
  subjectName,
  direction,
  onOpenSession,
}: {
  meeting: TrackedMeeting;
  subjectName: string;
  direction: BoardDirection;
  onOpenSession: (id: string) => void;
}) {
  const { sessions, topics, meetings, updateMeeting, selectMeeting } =
    useStore();

  const readiness = readinessOf(meeting, { meetings, sessions, topics });
  const color = STATE_COLOR[readiness.state];
  const openCount = topicsFor(topics, meeting.id).filter(
    (t) => t.status === "open"
  ).length;
  const [planSlotKey, setPlanSlotKey] = useState<string | null>(null);
  const [historySlotKey, setHistorySlotKey] = useState<string | null>(null);
  const [name, setName] = useState(meeting.name ?? "");

  const closePlanNotes = useCallback(() => setPlanSlotKey(null), []);
  const closeHistoryNotes = useCallback(() => setHistorySlotKey(null), []);
  const openSessionNotes = useCallback((sessionId: string) => {
    setHistorySlotKey(`s:${sessionId}`);
  }, []);
  const onSelectWeek = useCallback((slotKey: string) => {
    setPlanSlotKey(slotKey);
  }, []);

  const weekday =
    meeting.anchorWeekday !== undefined
      ? ANCHOR_WEEKDAY_OPTIONS.find(
          (o) => o.value === String(meeting.anchorWeekday)
        )?.label
      : undefined;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <Input
            size="sm"
            label="Name"
            placeholder={meetingTitle({ ...meeting, name: undefined }, subjectName)}
            hint="Name it like a gathering — Staff meeting, weekly sync — not the relationship."
            value={name}
            onChange={setName}
            onBlur={() =>
              updateMeeting(meeting.id, { name: name.trim() || undefined })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                updateMeeting(meeting.id, { name: name.trim() || undefined });
              }
            }}
          />
        </div>
        <TintBadge color={color}>{STATE_LABEL[readiness.state]}</TintBadge>
        <span
          className="shrink-0 font-mono text-caption tabular-nums"
          style={{ color }}
        >
          {formatCountdown(readiness)}
        </span>
        <NativeSelect
          size="sm"
          className="w-auto shrink-0"
          aria-label="How often this meeting happens"
          value={meeting.rhythm}
          onChange={(e) => {
            const rhythm = e.target.value as MeetingRhythm;
            updateMeeting(meeting.id, {
              rhythm,
              floorDays:
                rhythm === "as_needed"
                  ? (meeting.floorDays ?? DEFAULT_FLOOR_DAYS)
                  : undefined,
            });
          }}
          options={RHYTHM_OPTIONS.map((r) => ({
            label: RHYTHM_LABEL[r],
            value: r,
          }))}
        />
        <span className="text-caption text-quaternary">
          {weekday ? `Usually ${weekday}` : "Day not set"}
          {readiness.nextDate
            ? ` · next ${readiness.projected ? "~" : ""}${readiness.nextDate.slice(5).replace("-", "/")}`
            : ""}
        </span>
        <Button
          size="sm"
          color="link-gray"
          className="shrink-0"
          iconLeading={Expand01}
          onClick={() => selectMeeting(meeting.id)}
          aria-label="Open this meeting's own page"
        >
          <span className="sr-only">Open meeting page</span>
        </Button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-caption font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
            Plan
          </span>
          <span className="text-caption tabular-nums text-stone-400 dark:text-stone-500">
            {openCount} open
          </span>
        </div>
        <MeetingPlanner
          meeting={meeting}
          direction={direction}
          selectedSlotKey={planSlotKey}
          onSelectWeek={onSelectWeek}
          onCloseNotes={closePlanNotes}
          onOpenSession={onOpenSession}
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-caption font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
          History
        </span>
        <SessionHistoryTable meetingId={meeting.id} onOpen={openSessionNotes} />
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
