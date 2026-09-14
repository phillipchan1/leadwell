import { useState } from "react";
import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { slotDotClass } from "../lib/topics";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { ChevronDown, ChevronUp, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * The rows of a meeting's planner — Prayer, Training, Discussion.
 *
 * Each row is a workspace tag. The board used to have "slots" (per meeting)
 * and "tags" (everywhere) as two lookalike ideas; tagging a topic did nothing
 * to where it sat. Now a row *is* its tag: `#prayer` typed anywhere lands in
 * the Prayer row, and dragging a card into a row tags it.
 */
export function MeetingRows({ meeting }: { meeting: TrackedMeeting }) {
  const tags = useStore((s) => s.tags);
  const addRow = useStore((s) => s.addMeetingRow);
  const setCurriculum = useStore((s) => s.setCurriculum);
  const [draft, setDraft] = useState("");

  const rows = meeting.curriculum ?? [];
  const used = new Set(rows.map((r) => r.label.trim().toLowerCase()));
  const suggestions = tags.filter((t) => !used.has(t.label.trim().toLowerCase()));

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    setCurriculum(meeting.id, next);
  };

  const add = (label: string) => {
    if (addRow(meeting.id, label)) setDraft("");
  };

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <ul className="divide-y divide-secondary rounded-lg border border-secondary">
          {rows.map((row, i) => (
            <li key={row.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
              <span
                aria-hidden
                className={cx("size-2 shrink-0 rounded-full", slotDotClass(rows, row.id))}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-primary">
                {row.label}
              </span>
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
                isDisabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              />
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={X}
                tooltip="Remove row (topics stay, untagged from it)"
                onClick={() =>
                  setCurriculum(
                    meeting.id,
                    rows.filter((r) => r.id !== row.id)
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <Input
          size="sm"
          placeholder={rows.length ? "Add a row…" : "Prayer, Training, Discussion…"}
          aria-label="New row"
          value={draft}
          onChange={setDraft}
          className="min-w-0 flex-1"
        />
        <Button size="sm" color="secondary" type="submit" isDisabled={!draft.trim()}>
          Add row
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-quaternary">From your tags:</span>
          {suggestions.slice(0, 8).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => add(t.label)}
              className="rounded-full border border-secondary px-2 py-0.5 text-caption text-secondary transition hover:border-primary hover:text-primary"
            >
              + {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
