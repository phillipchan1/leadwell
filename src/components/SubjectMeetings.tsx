import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingRhythm, MeetingSubjectKind, TrackedMeeting } from "../types";
import {
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
  STATE_COLOR,
  STATE_LABEL,
  meetingTitle,
  meetingsFor,
  readinessOf,
} from "../lib/readiness";
import { topicsFor } from "../lib/topics";
import { cx } from "@/utils/cx";
import { MeetingPlanner } from "./MeetingPlanner";
import type { BoardDirection } from "./TopicBoard";
import { StartMeetingForm } from "./StartMeetingForm";
import { TrackerLink } from "./TrackerLink";
import { TintBadge } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { MeetingRows } from "./MeetingRows";
import { WeekdayPicker } from "./MeetingScheduleFields";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Expand01, Settings01 } from "@untitledui/icons";

const WEEKDAY_PLURAL = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

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
  const topics = useStore((s) => s.topics);
  const trackMeeting = useStore((s) => s.trackMeeting);
  const createMeeting = useStore((s) => s.createMeeting);
  const openSession = useStore((s) => s.openSession);
  const [adding, setAdding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (focusSessionId) openSession(focusSessionId);
  }, [focusSessionId, openSession]);

  const mine = meetingsFor(meetings, subjectKind, subjectId);
  const firstName = subjectName.split(" ")[0] ?? subjectName;

  const startMeeting = (
    rhythm: MeetingRhythm,
    name?: string,
    anchorWeekday?: number
  ) => {
    if (mine.length === 0) {
      trackMeeting(subjectKind, subjectId, rhythm, { name, anchorWeekday });
    } else {
      createMeeting(subjectKind, subjectId, { rhythm, name, anchorWeekday });
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

  /*
   * One meeting at a time.
   *
   * Stacking every meeting fully expanded meant two meetings were two of
   * everything — two name fields, two boards, two histories — inside a
   * half-width peek. Nobody plans two gatherings at once; they plan one and
   * want the other within reach.
   */
  const active = mine.find((m) => m.id === activeId) ?? mine[0];

  return (
    <div className="space-y-4">
      {mine.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {mine.map((m) => {
            const open = topicsFor(topics, m.id).filter(
              (t) => t.status === "open"
            ).length;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveId(m.id)}
                className={cx(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  m.id === active.id
                    ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                    : "text-quaternary hover:bg-tertiary hover:text-stone-700 dark:hover:text-stone-200"
                )}
              >
                {meetingTitle(m, subjectName)}
                {open > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-70">{open}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <MeetingBlock
        key={active.id}
        meeting={active}
        subjectName={subjectName}
        direction={direction}
        onOpenSession={openSession}
      />

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
        <div className="border-t border-secondary pt-3">
          <Button size="sm" color="link-gray" onClick={() => setAdding(true)}>
            + Another recurring meeting with {firstName}
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
  const { sessions, topics, meetings, updateMeeting, selectMeeting, setMeetingWeekday } =
    useStore();

  const readiness = readinessOf(meeting, { meetings, sessions, topics });
  const color = STATE_COLOR[readiness.state];
  const [planSlotKey, setPlanSlotKey] = useState<string | null>(null);
  const [name, setName] = useState(meeting.name ?? "");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const closePlanNotes = useCallback(() => setPlanSlotKey(null), []);
  const onSelectWeek = useCallback((slotKey: string) => {
    setPlanSlotKey(slotKey);
  }, []);

  const recurring = meeting.rhythm !== "as_needed";
  const needsDay =
    recurring && meeting.rhythm !== "monthly" && meeting.rhythm !== "quarterly" &&
    meeting.anchorWeekday === undefined;
  const nextLabel = readiness.nextDate
    ? new Date(`${readiness.nextDate}T00:00:00Z`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
  const rhythmText = [
    RHYTHM_LABEL[meeting.rhythm],
    meeting.anchorWeekday !== undefined
      ? `${WEEKDAY_PLURAL[meeting.anchorWeekday]}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const saveName = () =>
    updateMeeting(meeting.id, { name: name.trim() || undefined });

  return (
    <section className="space-y-4">
      {/*
        Identity on the left, one line of when underneath it; state and the
        two icon actions on the right at the same size. The countdown, rhythm
        and "next" used to be three separately coloured fragments saying the
        same date twice.
      */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-md font-semibold text-primary">
            {meetingTitle(meeting, subjectName)}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-tertiary">
            <span>{rhythmText}</span>
            {nextLabel && (
              <>
                <span aria-hidden className="text-quaternary">·</span>
                <span className="tabular-nums">
                  Next {readiness.projected ? "~" : ""}
                  {nextLabel}
                  {readiness.daysUntil !== null && readiness.daysUntil >= 0 && (
                    <span className="text-quaternary">
                      {" "}
                      ({readiness.daysUntil === 0
                        ? "today"
                        : readiness.daysUntil === 1
                          ? "tomorrow"
                          : `in ${readiness.daysUntil} days`})
                    </span>
                  )}
                </span>
              </>
            )}
            {needsDay && !settingsOpen && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="font-medium text-brand-secondary underline-offset-2 hover:underline"
              >
                Pick a day
              </button>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TintBadge color={color}>{STATE_LABEL[readiness.state]}</TintBadge>
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={Settings01}
            tooltip="Meeting settings"
            aria-expanded={settingsOpen}
            className={settingsOpen ? "bg-tertiary" : undefined}
            onClick={() => setSettingsOpen((v) => !v)}
          />
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={Expand01}
            tooltip="Open this meeting's page"
            onClick={() => selectMeeting(meeting.id)}
          />
        </div>
      </div>

      {settingsOpen && (
        <div className="grid gap-5 rounded-xl border border-secondary bg-secondary p-4 sm:grid-cols-2">
          <div className="space-y-4">
            <Input
              size="sm"
              label="Name"
              placeholder={meetingTitle({ ...meeting, name: undefined }, subjectName)}
              value={name}
              onChange={setName}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveName();
                }
              }}
            />
            <NativeSelect
              size="sm"
              label="How often"
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
            {recurring && (
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-secondary">
                  On
                </span>
                <WeekdayPicker
                  value={meeting.anchorWeekday}
                  onChange={(day) => setMeetingWeekday(meeting.id, day)}
                />
                <p className="text-caption text-quaternary">
                  Booked weeks without notes move to this day.
                </p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-secondary">
              Board rows
            </span>
            <p className="text-caption text-quaternary">
              Split each week by tag — drop a topic into the row it belongs to.
            </p>
            <MeetingRows meeting={meeting} />
            <div className="pt-3">
              <span className="block text-sm font-medium text-secondary">
                Notes kept elsewhere
              </span>
              <TrackerLink meetingId={meeting.id} />
            </div>
          </div>
        </div>
      )}

      <MeetingPlanner
        meeting={meeting}
        direction={direction}
        selectedSlotKey={planSlotKey}
        onSelectWeek={onSelectWeek}
        onCloseNotes={closePlanNotes}
        onOpenSession={onOpenSession}
      />

    </section>
  );
}
