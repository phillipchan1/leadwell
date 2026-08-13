import { useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingRhythm, MeetingSubjectKind } from "../types";
import {
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
  triageState,
} from "../lib/readiness";
import { delegatedTeamIds } from "../lib/teams";
import { Avatar } from "./Avatar";
import { Modal } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";

type Row = {
  kind: MeetingSubjectKind;
  id: string;
  name: string;
  sub?: string;
};

/**
 * Decide, in bulk, who you actually sit down with.
 *
 * This exists because opt-in has one failure mode: you can be all-green
 * because you opted out of the hard things. The answer isn't to nag about
 * everyone untracked — most relationships genuinely have no meeting — it's to
 * count only the people you haven't *decided* about, and let one pass clear
 * them. Adding nine volunteers must not mean nine prompts.
 */
export function TriageModal({ onClose }: { onClose: () => void }) {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const meetings = useStore((s) => s.meetings);
  const trackMeeting = useStore((s) => s.trackMeeting);
  const setNoMeeting = useStore((s) => s.setNoMeeting);
  const [rhythm, setRhythm] = useState<MeetingRhythm>("biweekly");

  // Teams handed to a direct report — and anyone on them — are already decided:
  // they aren't mine to convene. Asking about them would refill a list whose
  // whole point is that it empties.
  const delegated = delegatedTeamIds(teams);

  const rows: Row[] = [
    ...teams
      .filter(
        (t) =>
          !delegated.has(t.id) &&
          triageState(t, meetings, "team") === "undecided"
      )
      .map((t) => ({
        kind: "team" as const,
        id: t.id,
        name: t.name,
        sub: "Team — a standing meeting I run?",
      })),
    ...managers
      .filter((m) => triageState(m, meetings, "manager") === "undecided")
      .map((m) => ({
        kind: "manager" as const,
        id: m.id,
        name: m.name,
        sub: m.role ?? "I report to them",
      })),
    ...people
      .filter(
        (p) =>
          !(p.teamId && delegated.has(p.teamId)) &&
          triageState(p, meetings, "person") === "undecided"
      )
      .map((p) => {
        const team = teams.find((t) => t.id === p.teamId);
        return {
          kind: "person" as const,
          id: p.id,
          name: p.name,
          sub:
            [p.role, team?.name].filter(Boolean).join(" · ") ||
            "Direct report",
        };
      }),
  ];

  const clearAll = () => {
    for (const row of rows) setNoMeeting(row.kind, row.id, true);
  };

  return (
    <Modal title="Who do you actually meet with?" onClose={onClose}>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Nothing left to decide. This list only fills up when you add someone
          new.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            Readiness only measures what you opt into — so the only thing
            counted at you is what you haven't decided about yet. Marking
            someone <strong className="font-medium">No meeting</strong> is a
            decision, not a gap, and it's permanent until you change it.
          </p>

          <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 dark:bg-stone-950/50">
            <label className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
              Track at
              <NativeSelect
                size="sm"
                className="w-auto"
                selectClassName="py-1"
                value={rhythm}
                onChange={(e) => setRhythm(e.target.value as MeetingRhythm)}
                aria-label="Rhythm applied when tracking from this list"
                options={RHYTHM_OPTIONS.map((r) => ({
                  label: RHYTHM_LABEL[r],
                  value: r,
                }))}
              />
            </label>
            <Button size="sm" color="link-gray" onClick={clearAll}>
              No meeting with any of these ({rows.length})
            </Button>
          </div>

          {/* Avatar + name + two buttons on one line squeezed the name column
              to a couple of characters at 375px, so below sm the actions sit
              under the name instead. */}
          <ul className="scroll-contain max-h-80 divide-y divide-stone-100 overflow-y-auto dark:divide-stone-800">
            {rows.map((row) => (
              <li
                key={`${row.kind}:${row.id}`}
                className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-2.5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {row.kind === "person" || row.kind === "manager" ? (
                    <Avatar name={row.name} size={28} />
                  ) : (
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                      aria-hidden
                    >
                      ▤
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{row.name}</div>
                    {row.sub && (
                      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                        {row.sub}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 max-sm:pl-[2.375rem]">
                  <Button
                    size="sm"
                    className="max-sm:flex-1 max-sm:justify-center"
                    onClick={() => trackMeeting(row.kind, row.id, rhythm)}
                  >
                    Track
                  </Button>
                  <Button
                    size="sm"
                    color="secondary"
                    className="max-sm:flex-1 max-sm:justify-center"
                    onClick={() => setNoMeeting(row.kind, row.id, true)}
                  >
                    No meeting
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <Button size="md" color="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
