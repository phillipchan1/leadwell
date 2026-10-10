import type { MeetingRhythm, MeetingSubjectKind, TrackedMeeting } from "../types";
import { RhythmRing, STATE_TEXT } from "./brand/glyphs";
import { friendlyDates } from "../lib/today";
import { cx } from "@/utils/cx";
import { useState } from "react";
import { useStore } from "../store/useStore";
import {
  MEETING_LABEL,
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
  STATE_LABEL,
  formatCountdown,
  meetingAgenda,
  meetingReadiness,
  meetingTitle,
  meetingsFor,
  sessionsFor,
  type CheckFix,
} from "../lib/readiness";
import { SectionTitle } from "./ui";
import { StartMeetingForm } from "./StartMeetingForm";
import { TrackerLink } from "./TrackerLink";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";

/** Default tolerance offered when a meeting is switched to as-needed. */
const DEFAULT_FLOOR_DAYS = 45;

/**
 * Prep for the meetings I've opted into being ready for with one subject — the
 * checklist *is* the score. No hidden weights, no mystery number: four named
 * things, each one click from fixed.
 *
 * Until you opt in, this is a single quiet button. Nothing is measured, and
 * nothing is counted at you, because most relationships have no meeting to
 * track and a dashboard that can never be clean gets ignored.
 *
 * A subject can have more than one — a 1:1 and a career check-in are different
 * things to be ready for — so this stacks a panel per meeting rather than
 * picking one and hiding the rest.
 */
export function PrepPanel({
  subjectKind,
  subjectId,
  subjectName,
  onFix,
}: {
  subjectKind: MeetingSubjectKind;
  subjectId: string;
  subjectName: string;
  /** Jump to wherever this check gets fixed. */
  onFix: (fix: CheckFix, sessionId?: string) => void;
}) {
  const meetings = useStore((s) => s.meetings);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const trackMeeting = useStore((s) => s.trackMeeting);
  const setNoMeeting = useStore((s) => s.setNoMeeting);

  const mine = meetingsFor(meetings, subjectKind, subjectId);
  const subject =
    subjectKind === "person"
      ? people.find((p) => p.id === subjectId)
      : subjectKind === "team"
        ? teams.find((t) => t.id === subjectId)
        : managers.find((m) => m.id === subjectId);
  const firstName = subjectName.split(" ")[0] ?? subjectName;
  const label = MEETING_LABEL[subjectKind];
  const [starting, setStarting] = useState(false);

  // ── Not tracked: the opt-in, and nothing else ───────────────────────────
  if (!mine.length) {
    const decided = Boolean(subject?.noMeeting);
    return (
      <section className="space-y-2">
        <SectionTitle>Readiness</SectionTitle>
        <div className="rounded-xl border border-dashed border-primary px-3 py-3">
          <p className="text-caption leading-relaxed text-quaternary">
            {decided
              ? `No ${label} with ${firstName} — left out of readiness on purpose.`
              : `Track a ${label} to see whether you're ready for the next one. Nothing is measured until you do.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 touch:gap-2">
            <Button size="sm" onClick={() => setStarting((v) => !v)}>
              Set up a meeting
            </Button>
            {!decided && (
              <Button
                size="sm"
                color="secondary"
                onClick={() => setNoMeeting(subjectKind, subjectId, true)}
                aria-label={`No ${label}. A decision, not a gap — clears them out of the undecided count`}
              >
                No {label}
              </Button>
            )}
            {decided && (
              <Button
                size="sm"
                color="link-gray"
                onClick={() => setNoMeeting(subjectKind, subjectId, false)}
              >
                Undo
              </Button>
            )}
          </div>
          {/* The third answer, for anyone who arrived with a system already:
              the notes are in Notion or a Word doc, and that's fine. */}
          <div className="mt-1">
            <TrackerLink subjectKind={subjectKind} subjectId={subjectId} />
          </div>
          {starting && (
            /* The canonical creation form, not a second one. This button used
               to call `trackMeeting(kind, id, "weekly")` outright — a hardcoded
               rhythm and no name, both of which then had to be corrected in
               Settings afterwards. Asking here costs one screen and saves that
               round trip. */
            <div className="mt-3 border-t border-secondary pt-3">
              <StartMeetingForm
                subjectKind={subjectKind}
                subjectName={subjectName}
                submitLabel="Start tracking"
                onStart={(rhythm, name, anchorWeekday) => {
                  trackMeeting(subjectKind, subjectId, rhythm, { name, anchorWeekday });
                  setStarting(false);
                }}
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <SectionTitle>Readiness</SectionTitle>
      {mine.map((meeting) => (
        <MeetingPrep
          key={meeting.id}
          meeting={meeting}
          subjectName={subjectName}
          showTitle={mine.length > 1}
          onFix={onFix}
        />
      ))}
    </section>
  );
}

function MeetingPrep({
  meeting,
  subjectName,
  showTitle,
  onFix,
}: {
  meeting: TrackedMeeting;
  subjectName: string;
  showTitle: boolean;
  onFix: (fix: CheckFix, sessionId?: string) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const updateMeeting = useStore((s) => s.updateMeeting);
  const untrackMeeting = useStore((s) => s.untrackMeeting);
  const label = MEETING_LABEL[meeting.subjectKind];

  const agenda = meetingAgenda(topics, sessions, meeting.id);
  const readiness = meetingReadiness(meeting, sessions, agenda);
  const sessionCount = sessionsFor(meeting.id, sessions).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {showTitle ? (
          <span className="truncate text-xs font-medium text-stone-700 dark:text-stone-200">
            {meetingTitle(meeting, subjectName)}
          </span>
        ) : (
          <span />
        )}
        <label className="flex shrink-0 items-center gap-1.5 text-caption text-quaternary">
          <span>Rhythm</span>
          <NativeSelect
            size="sm"
            className="w-auto"
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
            aria-label={`How often this ${label} happens`}
            options={RHYTHM_OPTIONS.map((r) => ({
              label: RHYTHM_LABEL[r],
              value: r,
            }))}
          />
        </label>
      </div>

      <div className="rounded-xl border border-secondary">
        <div className="flex items-center gap-3 rounded-t-xl border-b border-secondary bg-secondary/60 px-3.5 py-3 dark:bg-transparent">
          <RhythmRing reading={readiness} size={26} />
          <div className="min-w-0 flex-1">
            <div className={cx("text-[13px] font-semibold", STATE_TEXT[readiness.state])}>
              {STATE_LABEL[readiness.state]}
            </div>
            <div className="truncate text-caption text-tertiary">
              {friendlyDates(readiness.headline)}
            </div>
          </div>
          <span
            className={cx("shrink-0 font-mono text-[11.5px] font-medium uppercase tabular-nums", STATE_TEXT[readiness.state])}
            title={
              readiness.projected
                ? `Projected from the ${RHYTHM_LABEL[meeting.rhythm].toLowerCase()} rhythm — not booked`
                : "Booked"
            }
          >
            {formatCountdown(readiness)}
          </span>
        </div>

        <ul className="divide-y divide-stone-100 dark:divide-stone-800/80">
          {readiness.checks.map((check) => (
            <li
              key={check.id}
              className="flex items-start gap-2.5 px-3 py-2 text-xs"
            >
              <span
                className={cx(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                  check.done ? "bg-cond-thriving" : "border-[1.5px] border-cond-watch"
                )}
                aria-hidden
              >
                {check.done && (
                  <svg viewBox="0 0 24 24" className="size-2.5 stroke-white dark:stroke-stone-950" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.2 4.2L19 7" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={
                    check.done
                      ? "text-quaternary"
                      : "font-medium text-stone-700 dark:text-stone-200"
                  }
                >
                  {check.label}
                </div>
                {check.detail && (
                  <div className="truncate text-caption text-quaternary">
                    {friendlyDates(check.detail)}
                  </div>
                )}
              </div>
              {!check.done && (
                <Button
                  size="sm"
                  color="link-color"
                  className="shrink-0"
                  onClick={() => onFix(check.fix, check.sessionId)}
                >
                  {FIX_LABEL[check.fix]}
                </Button>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-3 py-1.5 dark:border-stone-800/80">
          {meeting.rhythm === "as_needed" ? (
            <label className="flex items-center gap-1.5 text-caption text-quaternary">
              Nudge me after
              <Input
                size="sm"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-20"
                aria-label="Days before nudge"
                value={meeting.floorDays?.toString() ?? ""}
                placeholder="never"
                onChange={(value) =>
                  updateMeeting(meeting.id, {
                    floorDays: value ? Number(value) : undefined,
                  })
                }
              />
              days
            </label>
          ) : (
            <span className="text-caption text-quaternary">
              {sessionCount} logged
            </span>
          )}
          <Button
            size="sm"
            color="link-gray"
            isDisabled={sessionCount > 0 || Boolean(meeting.trackerUrl)}
            aria-label={
              sessionCount > 0
                ? "Can't untrack — it has history. Switch to As needed instead."
                : meeting.trackerUrl
                  ? "Can't untrack — remove the tracker link first, or it goes with it."
                  : "Stop tracking this meeting"
            }
            onClick={() => untrackMeeting(meeting.id)}
          >
            Stop tracking
          </Button>
        </div>
      </div>

    </div>
  );
}

const FIX_LABEL: Record<CheckFix, string> = {
  book: "Log it",
  writeUp: "Write up",
  agenda: "Add topic",
  commitments: "Review",
};
