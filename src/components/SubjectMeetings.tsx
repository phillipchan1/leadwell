import { useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingRhythm, MeetingSubjectKind, TrackedMeeting } from "../types";
import {
  MEETING_LABEL,
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
import { TopicBoard, type BoardDirection } from "./TopicBoard";
import { SessionTable } from "./SessionTable";
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
 * because a 1:1 and a career check-in are different rooms.
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
  const { meetings, trackMeeting, createMeeting, openSession } = useStore();

  const mine = meetingsFor(meetings, subjectKind, subjectId);
  const label = MEETING_LABEL[subjectKind];
  const firstName = subjectName.split(" ")[0] ?? subjectName;

  if (!mine.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center dark:border-stone-700">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            No {label} tracked with {firstName} yet.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-stone-500 dark:text-stone-400">
            Tracking one gives you a topic board, a history of write-ups and a
            read on whether you're ready for the next one.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              onClick={() => trackMeeting(subjectKind, subjectId, "weekly")}
            >
              Track a weekly {label}
            </Button>
            <Button
              size="sm"
              color="secondary"
              onClick={() => trackMeeting(subjectKind, subjectId, "as_needed")}
            >
              As needed
            </Button>
          </div>
        </div>
        {/* The third answer, for anyone who arrived with a system already: the
            notes are in Notion or a doc, and that's fine. */}
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
          focusSessionId={focusSessionId}
        />
      ))}

      <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-3 dark:border-stone-800">
        <TrackerLink subjectKind={subjectKind} subjectId={subjectId} />
        <Button
          size="sm"
          color="link-gray"
          className="shrink-0"
          onClick={() =>
            createMeeting(subjectKind, subjectId, {
              rhythm: "monthly",
              name: `Another ${label}`,
            })
          }
        >
          + Another meeting
        </Button>
      </div>
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
  focusSessionId,
}: {
  meeting: TrackedMeeting;
  subjectName: string;
  direction: BoardDirection;
  onOpenSession: (id: string) => void;
  focusSessionId?: string;
}) {
  const { sessions, topics, meetings, addTopic, updateMeeting, selectMeeting } =
    useStore();
  const [draft, setDraft] = useState("");

  const readiness = readinessOf(meeting, { meetings, sessions, topics });
  const color = STATE_COLOR[readiness.state];
  const openCount = topicsFor(topics, meeting.id).filter(
    (t) => t.status === "open"
  ).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
          {meetingTitle(meeting, subjectName)}
        </h3>
        <TintBadge color={color}>{STATE_LABEL[readiness.state]}</TintBadge>
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums"
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

      {/* The single fastest thing in the app: think of something, type it,
          enter. It lands in the running list and can be dragged onto a date
          later — no board scrolling, no dialog, no page. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          addTopic(meeting.id, text, { lane: "backlog" });
          setDraft("");
        }}
      >
        <Input
          size="md"
          placeholder={
            direction === "up"
              ? "Ask, escalate, flag… ↵"
              : "Something to raise next time… ↵"
          }
          aria-label="Add a topic"
          value={draft}
          onChange={setDraft}
          enterKeyHint="done"
        />
      </form>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
            Plan
          </span>
          <span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-500">
            {openCount} open
          </span>
        </div>
        <TopicBoard meeting={meeting} direction={direction} />
      </div>

      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
          History
        </span>
        <SessionTable
          meetingId={meeting.id}
          onOpen={onOpenSession}
          focusSessionId={focusSessionId}
        />
      </div>
    </section>
  );
}
