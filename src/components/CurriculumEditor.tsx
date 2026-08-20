import { useState } from "react";
import type { CurriculumSlot } from "../types";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { ChevronDown, ChevronUp, Plus, X } from "@untitledui/icons";

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * The standing shape of a meeting — ordered named slots every occurrence
 * inherits. Removing a slot is the parent's job to untag, not delete, topics.
 */
export function CurriculumEditor({
  slots,
  onChange,
}: {
  slots: CurriculumSlot[];
  onChange: (next: CurriculumSlot[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = (label: string) => {
    const text = label.trim();
    if (!text) return;
    onChange([...slots, { id: uid(), label: text }]);
    setDraft("");
  };

  const rename = (id: string, label: string) => {
    onChange(slots.map((s) => (s.id === id ? { ...s, label } : s)));
  };

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= slots.length) return;
    const next = [...slots];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const remove = (id: string) => {
    onChange(slots.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-2">
      {slots.length === 0 && (
        <p className="text-caption text-quaternary">
          No standing slots yet. Add the shape of this meeting — Prayer,
          Training, Discussion — and empty cells will show up every week.
        </p>
      )}
      <ul className="space-y-1.5">
        {slots.map((slot, i) => (
          <li key={slot.id} className="flex items-center gap-1">
            <Input
              size="sm"
              aria-label={`Slot ${i + 1} name`}
              value={slot.label}
              onChange={(value) => rename(slot.id, value)}
              className="min-w-0 flex-1"
            />
            <ButtonUtility
              size="xs"
              color="tertiary"
              icon={ChevronUp}
              tooltip="Move up"
              isDisabled={i === 0}
              onClick={() => move(i, -1)}
            />
            <ButtonUtility
              size="xs"
              color="tertiary"
              icon={ChevronDown}
              tooltip="Move down"
              isDisabled={i === slots.length - 1}
              onClick={() => move(i, 1)}
            />
            <ButtonUtility
              size="xs"
              color="tertiary"
              icon={X}
              tooltip="Remove slot"
              onClick={() => remove(slot.id)}
            />
          </li>
        ))}
      </ul>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <Input
          size="sm"
          placeholder="Add a slot…"
          aria-label="New curriculum slot"
          value={draft}
          onChange={setDraft}
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          color="secondary"
          iconLeading={Plus}
          type="submit"
          isDisabled={!draft.trim()}
        >
          Add
        </Button>
      </form>
    </div>
  );
}
