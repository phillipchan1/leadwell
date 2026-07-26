import { useState } from "react";
import { useStore } from "../store/useStore";
import type { LeadUpProfile, Person } from "../types";
import { SectionTitle } from "./ui";

/** The fields of the operating manual, in the order they're most useful to fill. */
const FIELDS: {
  key: keyof LeadUpProfile;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    key: "archetype",
    label: "Leader type / archetype",
    hint: "The kind of leader you're working with, in a phrase.",
    placeholder: "e.g. Operator / driver — factory-worker mindset…",
  },
  {
    key: "winsLike",
    label: "What “good” looks like to them",
    hint: "Their definition of a strong report.",
    placeholder: "e.g. Full backlog, always visibly busy, nothing idle…",
  },
  {
    key: "anxieties",
    label: "What makes them anxious",
    hint: "What quietly erodes their trust in you.",
    placeholder: "e.g. Idle time, messy artifacts, surprises they have to explain up…",
  },
  {
    key: "currency",
    label: "Their currency — what earns trust fastest",
    hint: "Every boss spends in a different one: throughput, data, decisiveness, loyalty, optics.",
    placeholder: "e.g. Visible throughput + pristine artifacts beat clever ideas…",
  },
  {
    key: "comms",
    label: "How they want to hear from me",
    hint: "Cadence, channel, detail level, when to escalate vs. handle.",
    placeholder: "e.g. Frequent concrete status; never a rough draft, only clean work…",
  },
  {
    key: "theirScorecard",
    label: "What they’re measured on (their boss)",
    hint: "Make this look good and you make them look good upward — the real job of leading up.",
    placeholder: "e.g. Crew utilization + artifacts passing review first-pass…",
  },
];

export function LeadUpManual({ person }: { person: Person }) {
  return (
    <section className="space-y-3">
      <div>
        <SectionTitle>Operating manual</SectionTitle>
        <p className="mt-1 text-[11px] text-stone-400">
          How to win with {person.name.split(" ")[0]} — not their personality,
          their wiring as your manager.
        </p>
      </div>
      <div className="space-y-3">
        {FIELDS.map((f) => (
          <ManualField key={f.key} person={person} field={f} />
        ))}
      </div>
    </section>
  );
}

function ManualField({
  person,
  field,
}: {
  person: Person;
  field: (typeof FIELDS)[number];
}) {
  const updateLeadUp = useStore((s) => s.updateLeadUp);
  const saved = person.leadUp?.[field.key] ?? "";
  const [value, setValue] = useState(saved);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed !== (saved ?? "")) {
      updateLeadUp(person.id, { [field.key]: trimmed || undefined });
    }
  };

  return (
    <label className="block rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-800 dark:bg-stone-950/40">
      <div className="text-xs font-medium text-stone-700 dark:text-stone-200">
        {field.label}
      </div>
      <div className="mt-0.5 text-[10px] text-stone-400">{field.hint}</div>
      <textarea
        className="field-input field-input--sm mt-2 resize-none"
        rows={2}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
      />
    </label>
  );
}
