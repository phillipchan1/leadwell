import { useLayoutEffect, useRef, useState } from "react";
import type { ArcStep } from "../../types";
import { ChevronDown, DotsGrid, Plus, Trash01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

export type DraftStep = Pick<ArcStep, "id" | "label" | "read" | "prompts" | "practice"> &
  Partial<Pick<ArcStep, "status" | "coveredIn" | "doneOn">>;

const uid = () => Math.random().toString(36).slice(2, 10);
export const newStep = (label = ""): DraftStep => ({ id: uid(), label, prompts: [] });

const field =
  "h-10 w-full min-w-0 rounded-[10px] border border-primary bg-primary px-3 text-[14px] text-primary outline-none placeholder:text-placeholder focus:border-teal-400 dark:focus:border-teal-600";

/** "1. Foo", "- Foo", "• Foo" → "Foo". Numbering like "Ch. 3" stays. */
const stripMarker = (line: string) => line.replace(/^\s*(?:[-*•–]|\d{1,3}[.)])\s+/, "").trim();

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * The steps, edited like an outline: every label is a text field, Enter makes
 * the next step, Backspace on an empty one removes it, arrows move between
 * them, ⌥↑/⌥↓ reorder, and pasting a list (a table of contents, say) makes
 * one step per line. The grip drags.
 */
export function ArcStepList({
  steps,
  onChange,
  autoFocusLast,
}: {
  steps: DraftStep[];
  onChange: (next: DraftStep[]) => void;
  /** Focus the last step on mount (a blank arc's first step). */
  autoFocusLast?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const pending = useRef<{ id: string; caret: number | "end" } | null>(
    autoFocusLast && steps.length ? { id: steps[steps.length - 1].id, caret: "end" } : null
  );

  // Focus after the list re-renders with the step in it.
  useLayoutEffect(() => {
    const want = pending.current;
    if (!want) return;
    const el = inputs.current.get(want.id);
    if (!el) return;
    pending.current = null;
    el.focus();
    const at = want.caret === "end" ? el.value.length : want.caret;
    el.setSelectionRange(at, at);
  });

  const focus = (id: string | undefined, caret: number | "end" = "end") => {
    if (!id) return;
    pending.current = { id, caret };
    const el = inputs.current.get(id);
    if (el) {
      pending.current = null;
      el.focus();
      const at = caret === "end" ? el.value.length : caret;
      el.setSelectionRange(at, at);
    }
  };

  const patch = (id: string, p: Partial<DraftStep>) => onChange(steps.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const removable = (s: DraftStep) => !s.coveredIn?.length;

  const insertAfter = (i: number, made: DraftStep[], focusId = made[0]?.id) => {
    onChange([...steps.slice(0, i + 1), ...made, ...steps.slice(i + 1)]);
    if (focusId) pending.current = { id: focusId, caret: 0 };
  };

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = [...steps];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    onChange(next);
  };

  const remove = (i: number, then: "prev" | "next") => {
    const s = steps[i];
    if (!removable(s)) return;
    onChange(steps.filter((x) => x.id !== s.id));
    const target = then === "prev" ? steps[i - 1] ?? steps[i + 1] : steps[i + 1] ?? steps[i - 1];
    if (target) pending.current = { id: target.id, caret: then === "prev" ? "end" : 0 };
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    const s = steps[i];
    const el = e.currentTarget;
    const caretAtStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const caretAtEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    const reorder = e.altKey || ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey);
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      setOpenId(openId === s.id ? null : s.id);
      return;
    }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      // Enter mid-label splits it, like any outline; at the end it starts a new step.
      const at = el.selectionStart ?? el.value.length;
      const before = el.value.slice(0, at).trimEnd();
      const after = el.value.slice(el.selectionEnd ?? at).trim();
      const made = newStep(after);
      if (after) {
        onChange([...steps.slice(0, i), { ...s, label: before }, made, ...steps.slice(i + 1)]);
        pending.current = { id: made.id, caret: 0 };
      } else insertAfter(i, [made]);
      return;
    }
    if (e.key === "Backspace" && caretAtStart && !s.label && steps.length > 1) {
      e.preventDefault();
      remove(i, "prev");
      return;
    }
    if (e.key === "Delete" && caretAtEnd && !s.label && steps.length > 1) {
      e.preventDefault();
      remove(i, "next");
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const by = e.key === "ArrowUp" ? -1 : 1;
      e.preventDefault();
      if (reorder) {
        moveTo(i, i + by);
        pending.current = { id: s.id, caret: el.selectionStart ?? "end" };
      } else focus(steps[i + by]?.id, by < 0 ? "end" : "end");
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, i: number) => {
    const lines = e.clipboardData
      .getData("text/plain")
      .split(/\r?\n/)
      .map(stripMarker)
      .filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const s = steps[i];
    const made = lines.map((l) => newStep(l.slice(0, 200)));
    if (!s.label.trim()) {
      // An empty step takes the first line rather than leaving a gap.
      onChange([...steps.slice(0, i), { ...s, label: made[0].label }, ...made.slice(1), ...steps.slice(i + 1)]);
      pending.current = { id: made[made.length - 1].id, caret: "end" };
    } else insertAfter(i, made, made[made.length - 1].id);
  };

  const add = () => {
    const made = newStep();
    onChange([...steps, made]);
    pending.current = { id: made.id, caret: 0 };
  };

  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex flex-col overflow-hidden rounded-[12px] border border-secondary bg-primary">
        {steps.map((s, i) => {
          const open = openId === s.id;
          const done = s.status === "done";
          return (
            <li
              key={s.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(s.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = steps.findIndex((x) => x.id === dragId);
                if (from >= 0) moveTo(from, i);
                setDragId(null);
                setOverId(null);
              }}
              className={cx(
                "border-secondary",
                i > 0 && "border-t",
                open && "bg-teal-50 dark:bg-teal-950",
                dragId === s.id && "opacity-40",
                overId === s.id && dragId !== s.id && "shadow-[inset_0_2px_0_var(--color-teal-500)]"
              )}
            >
              <div className="group flex items-center gap-1.5 py-1 pr-1.5 pl-1">
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", s.id);
                    setDragId(s.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  aria-hidden
                  title="Drag to reorder"
                  className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-quaternary opacity-0 group-hover:opacity-100 active:cursor-grabbing"
                >
                  <DotsGrid className="size-3.5" />
                </span>
                <span className="w-5 shrink-0 font-mono text-[11.5px] text-quaternary">{i + 1}</span>
                <input
                  ref={(el) => {
                    if (el) inputs.current.set(s.id, el);
                    else inputs.current.delete(s.id);
                  }}
                  value={s.label}
                  placeholder={`Step ${i + 1}`}
                  aria-label={`Step ${i + 1}`}
                  onChange={(e) => patch(s.id, { label: e.target.value })}
                  onKeyDown={(e) => onKey(e, i)}
                  onPaste={(e) => onPaste(e, i)}
                  className={cx(
                    "h-8 min-w-0 flex-1 rounded-[7px] bg-transparent px-1.5 text-[13.5px] outline-none placeholder:text-placeholder focus:bg-secondary",
                    done ? "text-quaternary line-through" : "text-primary"
                  )}
                />
                {s.read && !open && (
                  <span className="hidden shrink-0 font-mono text-[11px] text-quaternary sm:inline">{s.read}</span>
                )}
                <IconBtn label={open ? "Hide details" : "Read, talk and try"} onClick={() => setOpenId(open ? null : s.id)}>
                  <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} />
                </IconBtn>
                <IconBtn label={`Remove step ${i + 1}`} disabled={!removable(s)} onClick={() => remove(i, "prev")}>
                  <Trash01 className="size-3.5" />
                </IconBtn>
              </div>
              {open && (
                <div className="flex flex-col gap-2.5 px-3 pb-3 pl-[46px]">
                  <StepField k="Read" value={s.read ?? ""} placeholder="pp. 49–68" onChange={(v) => patch(s.id, { read: v })} />
                  <StepField
                    k="Talk"
                    multiline
                    value={s.prompts.join("\n")}
                    placeholder="One question per line"
                    onChange={(v) => patch(s.id, { prompts: v.split("\n") })}
                  />
                  <StepField
                    k="Try"
                    value={s.practice ?? ""}
                    placeholder="One thing to practise before next time"
                    onChange={(v) => patch(s.id, { practice: v })}
                  />
                </div>
              )}
            </li>
          );
        })}
        <li className="border-t border-secondary">
          <button
            type="button"
            onClick={add}
            className="flex w-full items-center gap-2 px-3 py-2 text-[13px] font-semibold text-tertiary hover:bg-secondary"
          >
            <Plus className="size-3.5" /> Add a step
          </button>
        </li>
      </ol>
      <p className="text-[11.5px] leading-[16px] text-quaternary">
        <Kbd>↵</Kbd> new step · <Kbd>⇧↵</Kbd> read, talk, try · <Kbd>⌫</Kbd> on an empty step removes it ·{" "}
        <Kbd>{isMac ? "⌥" : "Alt"}↑↓</Kbd> reorder · paste a list to add one step per line
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-[4px] border border-secondary px-1 font-mono text-[10.5px] text-tertiary">{children}</kbd>;
}

function StepField({
  k,
  value,
  placeholder,
  onChange,
  multiline,
}: {
  k: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="grid grid-cols-[44px_1fr] items-start gap-2">
      <span className="pt-2.5 text-[10.5px] font-semibold tracking-[0.14em] text-teal-700 uppercase dark:text-teal-400">{k}</span>
      {multiline ? (
        <textarea
          rows={2}
          className={cx(field, "h-auto py-2 text-[13px] leading-[18px]")}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className={cx(field, "h-9 text-[13px]")} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function IconBtn({
  label: text,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={text}
      title={text}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-tertiary hover:bg-secondary hover:text-secondary disabled:opacity-30"
    >
      {children}
    </button>
  );
}
