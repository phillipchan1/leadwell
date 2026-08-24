import { useRef, useState } from "react";
import { cx } from "@/utils/cx";
import { Plus } from "@untitledui/icons";

/**
 * Add a topic exactly where it belongs, without a round trip through the Ideas board.
 *
 * Every drop zone gets one. It stays a single line until focused so eight week
 * columns don't read as eight input boxes, and it keeps focus after Enter —
 * the common case is three thoughts in a row, not one.
 */
export function InlineComposer({
  onAdd,
  placeholder = "Add a topic…",
  compact,
}: {
  onAdd: (raw: string) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const raw = draft.trim();
    if (!raw) return;
    onAdd(raw);
    setDraft("");
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={cx(
          "flex w-full items-center gap-1 rounded-md px-1.5 text-left text-caption text-quaternary transition hover:bg-tertiary hover:text-stone-600 dark:hover:text-stone-300",
          compact ? "py-1" : "py-1.5"
        )}
      >
        <Plus className="size-3" />
        Add
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
      className="px-0.5 py-0.5"
    >
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!draft.trim()) setOpen(false);
        }}
        onKeyDown={(e) => {
          // Explicit rather than relying on implicit form submission — this
          // input lives inside board columns that may later be inside a form
          // of their own, and Enter is the whole interaction.
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft("");
            setOpen(false);
          }
        }}
        className={cx(
          "w-full rounded-md border border-teal-400 bg-primary px-1.5 py-1 text-xs text-stone-800 outline-none placeholder:text-quaternary dark:text-stone-100"
        )}
      />
    </form>
  );
}
