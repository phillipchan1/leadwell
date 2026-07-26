import type { Person } from "../types";
import { useStore } from "../store/useStore";
import {
  CADENCE_LABEL,
  CADENCE_OPTIONS,
  STATE_COLOR,
  STATE_LABEL,
  formatCountdown,
  isTracked,
  personReadiness,
  type CheckFix,
} from "../lib/readiness";
import { SectionTitle, inputSmCls } from "./ui";

/**
 * 1:1 prep for one person — the checklist *is* the score. No hidden weights,
 * no mystery number: four named things, each one click from fixed.
 */
export function PrepPanel({
  person,
  onFix,
}: {
  person: Person;
  /** Jump the profile to wherever this check gets fixed. */
  onFix: (fix: CheckFix, meetingId?: string) => void;
}) {
  const { oneOnOnes, actions, updatePerson } = useStore();
  const readiness = personReadiness(person, oneOnOnes, actions);
  const tracked = isTracked(readiness.state);
  const color = STATE_COLOR[readiness.state];
  const firstName = person.name.split(" ")[0] ?? person.name;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>1:1 readiness</SectionTitle>
        <label className="flex items-center gap-1.5 text-[11px] text-stone-400">
          <span>Rhythm</span>
          <select
            className={`${inputSmCls} w-auto py-1`}
            value={person.cadence ?? ""}
            onChange={(e) =>
              updatePerson(person.id, {
                cadence: (e.target.value || undefined) as Person["cadence"],
              })
            }
            aria-label={`How often I meet ${firstName} 1:1`}
          >
            <option value="">Not set</option>
            {CADENCE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
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
          {tracked && readiness.nextDate && (
            <span
              className="shrink-0 font-mono text-[10px] tabular-nums"
              style={{ color }}
              title={
                readiness.projected
                  ? `Projected from the ${CADENCE_LABEL[
                      person.cadence!
                    ].toLowerCase()} rhythm — not booked`
                  : "Booked"
              }
            >
              {formatCountdown(readiness)}
            </span>
          )}
        </div>

        {!tracked ? (
          <p className="px-3 py-2.5 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
            {readiness.state === "paused"
              ? `No 1:1 rhythm with ${firstName} — they're left out of readiness so they don't sit red forever.`
              : `Set a rhythm and LeadWell projects the next 1:1 from the last one. Nothing to schedule.`}
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800/80">
            {readiness.checks.map((check) => (
              <li
                key={check.id}
                className="flex items-start gap-2.5 px-3 py-2 text-xs"
              >
                <span
                  className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white ${
                    check.done ? "" : "bg-transparent"
                  }`}
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
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
                    onClick={() => onFix(check.fix, check.meetingId)}
                  >
                    {FIX_LABEL[check.fix]}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const FIX_LABEL: Record<CheckFix, string> = {
  book: "Log 1:1",
  writeUp: "Write up",
  agenda: "Add topic",
  commitments: "Review",
};
