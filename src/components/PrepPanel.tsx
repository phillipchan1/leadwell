import type { MeetingRhythm, MeetingSubjectKind } from "../types";
import { useStore } from "../store/useStore";
import {
  MEETING_LABEL,
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
import { SectionTitle } from "./ui";
import { TrackerLink } from "./TrackerLink";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";

/** Default tolerance offered when a meeting is switched to as-needed. */
const DEFAULT_FLOOR_DAYS = 45;

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
  const label = MEETING_LABEL[subjectKind];

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
          {/* The third answer, for anyone who arrived with a system already:
              the notes are in Notion or a Word doc, and that's fine. */}
          <div className="mt-1">
            <TrackerLink subjectKind={subjectKind} subjectId={subjectId} />
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
        <label className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
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
                  <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
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
            <label className="flex items-center gap-1.5 text-[10px] text-stone-500 dark:text-stone-400">
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
            <span className="text-[10px] text-stone-500 dark:text-stone-400">
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

      <TrackerLink subjectKind={subjectKind} subjectId={subjectId} />
    </section>
  );
}

const FIX_LABEL: Record<CheckFix, string> = {
  book: "Log it",
  writeUp: "Write up",
  agenda: "Add topic",
  commitments: "Review",
};
