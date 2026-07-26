import { useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingRhythm, MeetingSubjectKind } from "../types";
import {
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
  triageState,
} from "../lib/readiness";
import { Avatar } from "./Avatar";
import { Modal, buttonGhostCls, inputSmCls } from "./ui";

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
  const {
    people,
    teams,
    managers,
    meetings,
    trackMeeting,
    setNoMeeting,
  } = useStore();
  const [rhythm, setRhythm] = useState<MeetingRhythm>("biweekly");

  const rows: Row[] = [
    ...teams
      .filter((t) => triageState(t, meetings, "team") === "undecided")
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
      .filter((p) => triageState(p, meetings, "person") === "undecided")
      .map((p) => {
        const team = teams.find((t) => t.id === p.teamId);
        return {
          kind: "person" as const,
          id: p.id,
          name: p.name,
          sub: [p.role, team?.name].filter(Boolean).join(" · "),
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
              <select
                className={`${inputSmCls} w-auto py-1`}
                value={rhythm}
                onChange={(e) => setRhythm(e.target.value as MeetingRhythm)}
                aria-label="Rhythm applied when tracking from this list"
              >
                {RHYTHM_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {RHYTHM_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-[11px] text-stone-500 hover:bg-white hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              onClick={clearAll}
            >
              No meeting with any of these ({rows.length})
            </button>
          </div>

          <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto dark:divide-stone-800">
            {rows.map((row) => (
              <li key={`${row.kind}:${row.id}`} className="flex items-center gap-2.5 py-2">
                {row.kind === "person" || row.kind === "manager" ? (
                  <Avatar name={row.name} size={28} />
                ) : (
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-[10px] text-stone-400 dark:bg-stone-800"
                    aria-hidden
                  >
                    ▤
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{row.name}</div>
                  {row.sub && (
                    <div className="truncate text-[11px] text-stone-400">
                      {row.sub}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
                  onClick={() => trackMeeting(row.kind, row.id, rhythm)}
                >
                  Track
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-stone-300 px-2 py-1 text-[11px] text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-300"
                  onClick={() => setNoMeeting(row.kind, row.id, true)}
                >
                  No meeting
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button type="button" className={buttonGhostCls} onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
