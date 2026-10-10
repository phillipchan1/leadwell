import { useEffect, useState } from "react";
import type { CurriculumSlot } from "../types";
import { useStore } from "../store/useStore";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { ChevronDown, ChevronUp, Plus, X } from "@untitledui/icons";

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * The standing shape of a meeting — ordered named slots every occurrence
 * inherits. Removing a slot is the parent's job to untag, not delete, topics.
 *
 * A slot can point at a workspace tag, which is what makes coverage honest
 * without anyone tagging by hand: anything dropped into Training is a training
 * topic from the moment it lands. The slot is *where this sits in the room*;
 * the tag is *what it is about*, anywhere. They were one field once, which is
 * why a tag could not outlive the meeting that invented it.
 */
export function CurriculumEditor({
  slots,
  onChange,
}: {
  slots: CurriculumSlot[];
  onChange: (next: CurriculumSlot[]) => void;
}) {
  const tags = useStore((s) => s.tags);
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

  const patch = (id: string, next: Partial<CurriculumSlot>) => {
    onChange(slots.map((s) => (s.id === id ? { ...s, ...next } : s)));
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
          No sections yet. Add the shape of this meeting — Prayer, Training,
          Discussion — and every week on the board gets a row for each.
        </p>
      )}
      <ul className="space-y-1.5">
        {slots.map((slot, i) => (
          <li key={slot.id} className="flex items-center gap-1">
            <SlotName
              label={slot.label}
              index={i}
              onCommit={(value) => rename(slot.id, value)}
            />
            <label className="shrink-0">
              <span className="sr-only">Tag for {slot.label || "slot"}</span>
              <select
                value={slot.tagId ?? ""}
                onChange={(e) => patch(slot.id, { tagId: e.target.value || undefined })}
                className="rounded-md border border-secondary bg-primary px-1.5 py-1 text-caption text-stone-700 outline-none dark:text-stone-200"
              >
                <option value="">No tag</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="shrink-0">
              <span className="sr-only">Minutes for {slot.label || "slot"}</span>
              <input
                type="number"
                min={0}
                step={5}
                placeholder="min"
                value={slot.minutes ?? ""}
                onChange={(e) =>
                  patch(slot.id, {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="w-14 rounded-md border border-secondary bg-primary px-1.5 py-1 text-caption tabular-nums outline-none"
              />
            </label>
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
              tooltip="Remove section"
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
          placeholder="Add a section…"
          aria-label="New section"
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

/**
 * A section's name, committed when you leave the field.
 *
 * It used to write every keystroke straight to the meeting, and the meeting
 * drops sections with no name — so selecting the name to retype it deleted
 * the section, and untagged everything in it, before the first new letter
 * landed. A blank name now just puts the old one back.
 */
function SlotName({
  label,
  index,
  onCommit,
}: {
  label: string;
  index: number;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(label);
  useEffect(() => setValue(label), [label]);
  const commit = () => {
    const next = value.trim();
    if (!next) {
      setValue(label);
      return;
    }
    if (next !== label) onCommit(next);
  };
  return (
    <Input
      size="sm"
      aria-label={`Section ${index + 1} name`}
      value={value}
      onChange={setValue}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") setValue(label);
      }}
      className="min-w-0 flex-1"
    />
  );
}
