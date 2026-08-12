import { useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingRhythm, MeetingRole, MeetingSubjectKind } from "../types";
import { RHYTHM_LABEL, RHYTHM_OPTIONS } from "../lib/readiness";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { autoFocusUnlessTouch } from "../lib/pointer";

const KIND_OPTIONS: { label: string; value: MeetingSubjectKind }[] = [
  { label: "A person I lead", value: "person" },
  { label: "A team", value: "team" },
  { label: "A leader I report to", value: "manager" },
];

const ROLE_OPTIONS: { label: string; value: MeetingRole }[] = [
  { label: "I convene it", value: "convene" },
  { label: "I attend it", value: "attend" },
];

/**
 * Adding a recurring meeting, in a row instead of a dialog.
 *
 * Setting these up is a batch job — you sit down once and enter the eight
 * things you actually run. A modal makes that eight open/fill/save/close
 * cycles with the list you're building hidden behind an overlay each time.
 * Inline, the list stays visible, the fields keep their last answer, and
 * Enter adds the next one.
 */
export function NewMeetingRow({ onDone }: { onDone: () => void }) {
  const { people, teams, managers, createMeeting } = useStore();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MeetingSubjectKind>("person");
  const [subjectId, setSubjectId] = useState("");
  const [rhythm, setRhythm] = useState<MeetingRhythm>("weekly");
  const [role, setRole] = useState<MeetingRole>("convene");
  const [added, setAdded] = useState<string | null>(null);

  const subjects =
    kind === "person"
      ? people.map((p) => ({ value: p.id, label: p.name }))
      : kind === "team"
        ? teams.map((t) => ({ value: t.id, label: t.name }))
        : managers.map((m) => ({ value: m.id, label: m.name }));

  const subjectName = subjects.find((s) => s.value === subjectId)?.label;

  const save = () => {
    if (!subjectId) return;
    createMeeting(kind, subjectId, {
      name: name.trim() || undefined,
      rhythm,
      role,
      floorDays: rhythm === "as_needed" ? 45 : undefined,
    });
    setAdded(name.trim() || subjectName || "Meeting");
    // Keep the kind, rhythm and role — the next one is usually the same shape.
    setName("");
    setSubjectId("");
  };

  return (
    <form
      className="rounded-xl border border-teal-300 bg-teal-50/40 p-3 dark:border-teal-800 dark:bg-teal-950/20"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[9rem] flex-1 sm:max-w-[16rem]">
          <Input
            size="sm"
            label="Name (optional)"
            placeholder="Staff meeting, 1:1, Practice"
            value={name}
            onChange={setName}
            autoFocus={autoFocusUnlessTouch()}
          />
        </div>
        <NativeSelect
          size="sm"
          className="w-auto"
          label="With"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as MeetingSubjectKind);
            // The old id belongs to a different collection entirely.
            setSubjectId("");
          }}
          options={KIND_OPTIONS}
        />
        <NativeSelect
          size="sm"
          className="w-auto"
          label={kind === "team" ? "Which team" : "Who"}
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          options={[{ label: "Choose…", value: "" }, ...subjects]}
        />
        <NativeSelect
          size="sm"
          className="w-auto"
          label="How often"
          value={rhythm}
          onChange={(e) => setRhythm(e.target.value as MeetingRhythm)}
          options={RHYTHM_OPTIONS.map((r) => ({
            label: RHYTHM_LABEL[r],
            value: r,
          }))}
        />
        <NativeSelect
          size="sm"
          className="w-auto"
          label="My part"
          value={role}
          onChange={(e) => setRole(e.target.value as MeetingRole)}
          options={ROLE_OPTIONS}
        />
        <Button size="sm" type="submit" isDisabled={!subjectId}>
          Add
        </Button>
        <Button size="sm" color="link-gray" onClick={onDone}>
          Done
        </Button>
      </div>
      {added && (
        <p className="mt-2 text-[11px] text-teal-700 dark:text-teal-400">
          Added “{added}”. Add another, or press Done.
        </p>
      )}
    </form>
  );
}
