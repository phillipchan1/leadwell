import { useState } from "react";
import type { MeetingRhythm, MeetingSubjectKind } from "../types";
import {
  MEETING_LABEL,
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
} from "../lib/readiness";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

/**
 * Start tracking a recurring meeting — name and rhythm up front, not buried
 * in settings after the fact.
 */
export function StartMeetingForm({
  subjectKind,
  subjectName,
  onStart,
  submitLabel = "Start tracking",
}: {
  subjectKind: MeetingSubjectKind;
  subjectName: string;
  onStart: (
    rhythm: MeetingRhythm,
    name?: string
  ) => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState("");
  const [rhythm, setRhythm] = useState<MeetingRhythm>("weekly");
  const label = MEETING_LABEL[subjectKind];
  const firstName = subjectName.split(" ")[0] ?? subjectName;

  return (
    <div className="mx-auto max-w-sm space-y-3 text-left">
      <Input
        size="md"
        label="What to call it"
        placeholder={
          subjectKind === "person"
            ? `Weekly 1:1, career check-in…`
            : `${label} with ${firstName}…`
        }
        hint="Optional — left blank it uses the rhythm and their name."
        value={name}
        onChange={setName}
      />
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-quaternary uppercase">
          How often
        </span>
        <div className="flex flex-wrap gap-1.5">
          {RHYTHM_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRhythm(r)}
              className={
                rhythm === r
                  ? "rounded-full bg-teal-600 px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-full border border-primary px-3 py-1.5 text-xs text-stone-600 hover:border-teal-500 hover:text-teal-700 dark:text-stone-300"
              }
            >
              {RHYTHM_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      <Button
        size="md"
        className="w-full"
        onClick={() =>
          onStart(rhythm, name.trim() || undefined)
        }
      >
        {submitLabel}
      </Button>
    </div>
  );
}
