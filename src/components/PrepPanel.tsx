import type { MeetingRhythm, MeetingSubjectKind } from "../types";
import { useStore } from "../store/useStore";
import {
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
  STATE_COLOR,
  STATE_LABEL,
  formatCountdown,
  meetingFor,
  meetingReadiness,
  personAgenda,
  sessionsFor,
  teamAgenda,
  type CheckFix,
} from "../lib/readiness";
import { SectionTitle, inputSmCls } from "./ui";
import { Button } from "@/components/base/buttons/button";

/** Default tolerance offered when a meeting is switched to as-needed. */
const DEFAULT_FLOOR_DAYS = 45;

/** What to call the meeting in copy — you don't have a "1:1" with your boss. */
const SUBJECT_LABEL: Record<MeetingSubjectKind, string> = {
  person: "1:1",
  team: "meeting",
  manager: "check-in",
};

/**
 * Prep for one tracked meeting — the checklist *is* the score. No hidden
 * weights, no mystery number: four named things, each one click from fixed.
 *
 * Until you opt in, this is a single quiet button. Nothing is measured, and
 * nothing is counted at you, because most relationships have no meeting to
 * track and a dashboard that can never be clean gets ignored.
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
  const {
    meetings,
    sessions,
    actions,
    teamActions,
    people,
    teams,
    managers,
    trackMeeting,
    updateMeeting,
    untrackMeeting,
    setNoMeeting,
  } = useStore();

  const meeting = meetingFor(meetings, subjectKind, subjectId);
  const subject =
    subjectKind === "person"
      ? people.find((p) => p.id === subjectId)
      : subjectKind === "team"
        ? teams.find((t) => t.id === subjectId)
        : managers.find((m) => m.id === subjectId);
  const firstName = subjectName.split(" ")[0] ?? subjectName;
  const label = SUBJECT_LABEL[subjectKind];

  // ── Not tracked: the opt-in, and nothing else ───────────────────────────
  if (!meeting) {
    const decided = Boolean(subject?.noMeeting);
    return (
      <section className="space-y-2">
        <SectionTitle>Readiness</SectionTitle>
        <div className="rounded-xl border border-dashed border-stone-300 px-3 py-3 dark:border-stone-700">
          <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
            {decided
              ? `No ${label} with ${firstName} — left out of readiness on purpose.`
              : `Track a ${label} to see whether you're ready for the next one. Nothing is measured until you do.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              onClick={() => trackMeeting(subjectKind, subjectId, "weekly")}
            >
              Track a {label}
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
        </div>
      </section>
    );
  }

  // ── Tracked: rhythm + the checklist ─────────────────────────────────────
  const agenda =
    subjectKind === "team"
      ? teamAgenda(teamActions, subjectId)
      : personAgenda(actions, subjectId);

  const readiness = meetingReadiness(meeting, sessions, agenda);
  const color = STATE_COLOR[readiness.state];
  const sessionCount = sessionsFor(meeting.id, sessions).length;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Readiness</SectionTitle>
        <label className="flex items-center gap-1.5 text-[11px] text-stone-400">
          <span>Rhythm</span>
          <select
            className={`${inputSmCls} w-auto py-1`}
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
          >
            {RHYTHM_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {RHYTHM_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-stone-200 dark:border-stone-800">
        <div
          className="flex items-center gap-2.5 rounded-t-xl px-3 py-2.5"
          style={{ backgroundColor: color + "14" }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor:
                readiness.state === "drifting" ? "transparent" : color,
              boxShadow:
                readiness.state === "drifting"
                  ? `inset 0 0 0 2px ${color}`
                  : undefined,
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold" style={{ color }}>
              {STATE_LABEL[readiness.state]}
            </div>
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
              {readiness.headline}
            </div>
          </div>
          <span
            className="shrink-0 font-mono text-[10px] tabular-nums"
            style={{ color }}
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
                className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
                style={
                  check.done
                    ? { backgroundColor: STATE_COLOR.ready }
                    : { boxShadow: `inset 0 0 0 1.5px ${STATE_COLOR.prep_due}` }
                }
                aria-hidden
              >
                {check.done ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={
                    check.done
                      ? "text-stone-500 dark:text-stone-400"
                      : "font-medium text-stone-700 dark:text-stone-200"
                  }
                >
                  {check.label}
                </div>
                {check.detail && (
                  <div className="truncate text-[11px] text-stone-400">
                    {check.detail}
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
            <label className="flex items-center gap-1.5 text-[10px] text-stone-400">
              Nudge me after
              <input
                type="number"
                min={7}
                className={`${inputSmCls} w-16 py-0.5 text-[11px]`}
                value={meeting.floorDays ?? ""}
                placeholder="never"
                onChange={(e) =>
                  updateMeeting(meeting.id, {
                    floorDays: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
              days
            </label>
          ) : (
            <span className="text-[10px] text-stone-400">
              {sessionCount} logged
            </span>
          )}
          <Button
            size="sm"
            color="link-gray"
            isDisabled={sessionCount > 0}
            aria-label={
              sessionCount > 0
                ? "Can't untrack — it has history. Switch to As needed instead."
                : "Stop tracking this meeting"
            }
            onClick={() => untrackMeeting(meeting.id)}
          >
            Stop tracking
          </Button>
        </div>
      </div>
    </section>
  );
}

const FIX_LABEL: Record<CheckFix, string> = {
  book: "Log it",
  writeUp: "Write up",
  agenda: "Add topic",
  commitments: "Review",
};
