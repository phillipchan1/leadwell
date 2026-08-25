import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Plus, Trash01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { useStore } from "../store/useStore";
import { tagDotClass } from "./TagChip";

const PALETTE = [0, 1, 2, 3, 4, 5];

/**
 * The workspace vocabulary, edited in one place.
 *
 * Tags used to be per-meeting curriculum labels, which meant "Training" on the
 * staff meeting and "Training" in a 1:1 were unrelated strings and neither
 * could be renamed without hunting through both. They are shared now, so this
 * is shared too — rename here and every card follows.
 *
 * Deleting is deliberately gentle: topics keep their text and simply lose the
 * label, and any agenda slot or coverage target pointing at the tag is unwired
 * rather than left pointing at nothing.
 */
export function TagManager() {
  const tags = useStore((s) => s.tags);
  const topics = useStore((s) => s.topics);
  const addTag = useStore((s) => s.addTag);
  const updateTag = useStore((s) => s.updateTag);
  const deleteTag = useStore((s) => s.deleteTag);
  const [draft, setDraft] = useState("");

  const used = (id: string) =>
    topics.filter((t) => (t.tagIds ?? []).includes(id)).length;

  return (
    <div className="space-y-2">
      {tags.length === 0 && (
        <p className="text-caption text-quaternary">
          No tags yet. They're shared across every meeting — add one here, or
          type <span className="font-mono">#training</span> while capturing and
          it's made for you.
        </p>
      )}

      <ul className="space-y-1">
        {tags.map((tag) => {
          const count = used(tag.id);
          return (
            <li
              key={tag.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-secondary bg-primary px-2 py-1.5"
            >
              <div className="flex shrink-0 items-center gap-1">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c + 1} for ${tag.label}`}
                    onClick={() => updateTag(tag.id, { color: c })}
                    className={cx(
                      "size-3 rounded-full transition",
                      tagDotClass({ ...tag, color: c }),
                      tag.color === c
                        ? "ring-2 ring-stone-400 ring-offset-1 dark:ring-stone-500 dark:ring-offset-stone-950"
                        : "opacity-40 hover:opacity-100"
                    )}
                  />
                ))}
              </div>
              <input
                value={tag.label}
                aria-label={`Rename ${tag.label}`}
                onChange={(e) => updateTag(tag.id, { label: e.target.value })}
                className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm text-stone-800 outline-none hover:bg-tertiary focus:bg-tertiary dark:text-stone-100"
              />
              <span className="shrink-0 text-caption tabular-nums text-quaternary">
                {count} topic{count === 1 ? "" : "s"}
              </span>
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={Trash01}
                tooltip={
                  count
                    ? `Remove this label from ${count} topic${count === 1 ? "" : "s"} — the topics stay`
                    : "Delete tag"
                }
                onClick={() => deleteTag(tag.id)}
              />
            </li>
          );
        })}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addTag(draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New tag — Training, Prayer, Ops…"
          aria-label="New tag"
          className="min-w-0 flex-1 rounded-lg border border-secondary bg-primary px-2 py-1.5 text-sm outline-none placeholder:text-quaternary focus:border-teal-400"
        />
        <Button
          size="sm"
          color="secondary"
          type="submit"
          iconLeading={Plus}
          isDisabled={!draft.trim()}
        >
          Add
        </Button>
      </form>
    </div>
  );
}
