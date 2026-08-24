import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { cx } from "@/utils/cx";
import { parseCapture } from "./capture";
import { resolveMeetingQuery, resolveTagLabel } from "./suggest";
import { TagChip } from "./TagChip";
import type { LabApi } from "./store";

export function CaptureBar({
  api,
  autoFocus,
}: {
  api: LabApi;
  autoFocus?: boolean;
}) {
  const { state } = api;
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus || state.captureOpen) {
      inputRef.current?.focus();
    }
  }, [autoFocus, state.captureOpen]);

  const live = useMemo(() => {
    if (!draft.trim()) return null;
    const first = draft.split(/\r?\n/)[0] ?? "";
    return parseCapture(first);
  }, [draft]);

  const chips = useMemo(() => {
    if (!live) return null;
    const tags = live.tagLabels
      .map((l) => resolveTagLabel(l, state.tags))
      .filter(Boolean);
    const meeting = live.meetingQuery
      ? resolveMeetingQuery(live.meetingQuery, state.meetings)
      : null;
    return { tags, meeting, urgent: live.urgent, text: live.text };
  }, [live, state.tags, state.meetings]);

  const submit = () => {
    if (!draft.trim()) return;
    api.capture(draft);
    setDraft("");
  };

  return (
    <div className="rounded-xl border border-secondary bg-primary p-3 shadow-sm">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <Input
            ref={inputRef}
            size="md"
            placeholder="Something to raise…  #training @frontier !"
            aria-label="Capture a topic"
            value={draft}
            onChange={setDraft}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft("");
                api.closeCapture();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <p className="mt-1 text-caption text-quaternary">
            Enter to add · paste multiple lines ·{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">#tag</kbd>{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">@meeting</kbd>{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">!</kbd> urgent
          </p>
        </div>
        <Button
          size="md"
          color="primary"
          type="submit"
          isDisabled={!draft.trim()}
        >
          Add
        </Button>
      </form>
      {chips && (chips.tags.length > 0 || chips.meeting || chips.urgent) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-quaternary">Will apply:</span>
          {chips.urgent && (
            <span className="rounded bg-rose-100 px-1.5 py-px text-caption font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-400">
              Urgent
            </span>
          )}
          {chips.meeting && (
            <span className="rounded bg-stone-100 px-1.5 py-px text-caption text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              @{chips.meeting.name}
            </span>
          )}
          {chips.tags.map((t) => (t ? <TagChip key={t.id} tag={t} /> : null))}
          {chips.text && (
            <span className={cx("text-caption text-quaternary")}>
              “{chips.text}”
            </span>
          )}
        </div>
      )}
    </div>
  );
}
