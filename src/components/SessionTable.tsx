import type { MouseEvent } from "react";
import type { Session } from "../types";
import { useStore } from "../store/useStore";
import { Badge } from "@/components/base/badges/badges";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";
import { confirmAction } from "./ConfirmDialog";
import {
  sessionStatus,
  sessionStatusLabel,
  sessionSummary,
} from "../lib/session";

const STATUS_COLOR: Record<string, "sky" | "warning" | "success"> = {
  scheduled: "sky",
  needs_notes: "warning",
  done: "success",
};

export function SessionTable({
  meetingId,
  onOpen,
  onCreated,
}: {
  meetingId: string;
  onOpen: (id: string) => void;
  onCreated?: (id: string) => void;
}) {
  const { sessions, addSession, updateSession, deleteSession } = useStore();
  const rows = sessions
    .filter((o) => o.meetingId === meetingId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const createNew = () => {
    const id = addSession({
      meetingId,
      date: new Date().toISOString().slice(0, 10),
    });
    onCreated?.(id);
    onOpen(id);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
      {/* Four fixed columns give the date cell ~75px on a phone, which cannot
          fit a rendered date input. Below sm the same fields stack. */}
      <ul className="sm:hidden">
        {rows.map((o) => (
          <SessionCard
            key={o.id}
            row={o}
            onOpen={() => onOpen(o.id)}
            onPatch={(patch) => updateSession(o.id, patch)}
            onDelete={async () => {
              if (
                await confirmAction({
                  title: "Delete this 1:1?",
                  body: "Its notes and commitments go with it.",
                })
              )
                deleteSession(o.id);
            }}
          />
        ))}
      </ul>

      <table className="w-full table-fixed border-collapse text-left text-sm max-sm:hidden">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-[11px] tracking-wide text-stone-500 uppercase dark:border-stone-800 dark:bg-stone-950/60 dark:text-stone-400">
            <th className="w-[22%] px-2.5 py-2 font-medium">Date</th>
            <th className="w-[22%] px-2.5 py-2 font-medium">Next</th>
            <th className="w-[22%] px-2.5 py-2 font-medium">Status</th>
            <th className="px-2.5 py-2 font-medium">Summary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <SessionRow
              key={o.id}
              row={o}
              onOpen={() => onOpen(o.id)}
              onPatch={(patch) => updateSession(o.id, patch)}
              onDelete={async () => {
                if (
                  await confirmAction({
                    title: "Delete this 1:1?",
                    body: "Its notes and commitments go with it.",
                  })
                )
                  deleteSession(o.id);
              }}
            />
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={createNew}
        className="flex w-full items-center gap-2 border-t border-dashed border-stone-200 px-3 py-2.5 text-left text-sm text-stone-500 dark:text-stone-400 transition-colors hover:bg-teal-50/60 hover:text-teal-700 dark:border-stone-800 dark:hover:bg-teal-950/30 dark:hover:text-teal-300"
      >
        <span className="text-base leading-none">+</span>
        New
      </button>
    </div>
  );
}

function SessionRow({
  row,
  onOpen,
  onPatch,
  onDelete,
}: {
  row: Session;
  onOpen: () => void;
  onPatch: (patch: Partial<Session>) => void;
  onDelete: () => void;
}) {
  const status = sessionStatus(row);
  const summary = sessionSummary(row);

  return (
    <tr
      className="group cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50/80 dark:border-stone-800/80 dark:hover:bg-stone-950/40"
      onClick={onOpen}
    >
      <td className="px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          className="field-input field-input--ghost field-input--sm tabular-nums"
          value={row.date}
          onChange={(e) => onPatch({ date: e.target.value })}
        />
      </td>
      <td className="px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          className="field-input field-input--ghost field-input--sm tabular-nums text-stone-500"
          value={row.nextDate ?? ""}
          onChange={(e) =>
            onPatch({ nextDate: e.target.value || undefined })
          }
        />
      </td>
      <td className="px-2.5 py-2">
        <Badge size="sm" color={STATUS_COLOR[status]}>
          {sessionStatusLabel(status)}
        </Badge>
      </td>
      <td className="relative px-2.5 py-2">
        <span
          className={`block truncate ${
            summary
              ? "text-stone-600 dark:text-stone-400"
              : "italic text-stone-500 dark:text-stone-400"
          }`}
        >
          {summary || "Empty — click to write"}
        </span>
        <ButtonUtility
          size="xs"
          color="tertiary"
          icon={X}
          tooltip="Delete session"
          className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 touch:opacity-100 group-hover:opacity-100"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </td>
    </tr>
  );
}

/**
 * One session as a stacked card. The date/next pair reads on one line and the
 * status/summary below it, which fits a 320px screen without the four-column
 * table's clipping — and gives the date inputs room to render their value.
 */
function SessionCard({
  row,
  onOpen,
  onPatch,
  onDelete,
}: {
  row: Session;
  onOpen: () => void;
  onPatch: (patch: Partial<Session>) => void;
  onDelete: () => void;
}) {
  const status = sessionStatus(row);
  const summary = sessionSummary(row);

  return (
    <li className="border-b border-stone-100 last:border-0 dark:border-stone-800/80">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <label className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
            Date
          </span>
          <input
            type="date"
            className="field-input field-input--sm tabular-nums"
            value={row.date}
            // The iOS wheel picker covers the bottom half of the screen; keep
            // the field being edited above it.
            onFocus={(e) =>
              e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })
            }
            onChange={(e) => onPatch({ date: e.target.value })}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
            Next
          </span>
          <input
            type="date"
            className="field-input field-input--sm tabular-nums"
            value={row.nextDate ?? ""}
            onFocus={(e) =>
              e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })
            }
            onChange={(e) => onPatch({ nextDate: e.target.value || undefined })}
          />
        </label>
        <ButtonUtility
          size="xs"
          color="tertiary"
          icon={X}
          tooltip="Delete session"
          className="mt-4 shrink-0"
          onClick={onDelete}
        />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-stone-100 dark:active:bg-stone-800"
      >
        <Badge size="sm" color={STATUS_COLOR[status]}>
          {sessionStatusLabel(status)}
        </Badge>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            summary
              ? "text-stone-600 dark:text-stone-400"
              : "text-stone-500 italic dark:text-stone-400"
          }`}
        >
          {summary || "Empty — tap to write"}
        </span>
      </button>
    </li>
  );
}
