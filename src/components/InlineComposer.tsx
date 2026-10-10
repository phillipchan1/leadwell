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
  label = "Add",
  compact,
}: {
  onAdd: (raw: string) => void;
  placeholder?: string;
  /** What the closed composer says: "Add to Prayer". */
  label?: string;
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
          "flex w-full items-center gap-1.5 rounded-[9px] px-2 text-left text-[12.5px] text-quaternary transition hover:bg-tertiary hover:text-secondary touch:min-h-11",
          compact ? "h-8" : "h-9"
        )}
      >
        <Plus className="size-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
      className="relative"
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
          "w-full rounded-[10px] border border-teal-300 bg-primary pr-7 pl-2.5 text-[13px] text-primary shadow-[0_0_0_3px_var(--color-teal-50)] outline-none placeholder:text-quaternary dark:border-teal-700 dark:shadow-none",
          compact ? "h-9" : "h-10"
        )}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[10px] text-quaternary"
      >
        ↵
      </span>
    </form>
  );
}
