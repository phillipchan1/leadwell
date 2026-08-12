import { useEffect, useState, type MouseEvent } from "react";
import type { Session } from "../types";
import { useStore } from "../store/useStore";
import { Badge } from "@/components/base/badges/badges";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";
import { confirmAction } from "./ConfirmDialog";
import { InlineSessionEditor } from "./InlineSessionEditor";
import {
  sessionStatus,
  sessionStatusLabel,
  sessionSummary,
} from "../lib/session";

const STATUS_COLOR: Record<string, "sky" | "warning" | "success" | "gray"> = {
  scheduled: "sky",
  needs_notes: "warning",
  done: "success",
  elsewhere: "gray",
};

/**
 * The history of one recurring meeting, and where you write the next entry.
 *
 * Opening a row expands it in place rather than navigating: the full-page
 * editor is one more click from there (`Expand`), but the common case — tick
 * the agenda, type two lines — never leaves the panel you were working in.
 */
export function SessionTable({
  meetingId,
  onOpen,
  onCreated,
  focusSessionId,
}: {
  meetingId: string;
  /** Promote a session to the full-page editor. */
  onOpen: (id: string) => void;
  onCreated?: (id: string) => void;
  /** Open this entry on arrival — how a readiness fix lands on the right row. */
  focusSessionId?: string;
}) {
  const { sessions, meetings, addSession, updateSession, deleteSession } =
    useStore();
  const meeting = meetings.find((m) => m.id === meetingId);
  const rows = sessions
    .filter((o) => o.meetingId === meetingId)
    .sort((a, b) => b.date.localeCompare(a.date));
  // With an external tracker the write-up isn't missing, it's somewhere else —
  // an empty row shouldn't wear a warning badge for that.
  const notesElsewhere = Boolean(meeting?.trackerUrl?.trim());

  const [openId, setOpenId] = useState<string | null>(focusSessionId ?? null);
  const [freshId, setFreshId] = useState<string | null>(null);

  // A different meeting is a different history; don't keep a row open across it.
  useEffect(() => {
    setOpenId(null);
    setFreshId(null);
  }, [meetingId]);

  // "Write up" on a readiness check names the entry it means — open that one.
  useEffect(() => {
    if (focusSessionId) setOpenId(focusSessionId);
  }, [focusSessionId]);

  const toggle = (id: string) => {
    setOpenId((current) => (current === id ? null : id));
    setFreshId(null);
  };

  /**
   * A new entry opens where it was created. Logging a meeting is the most
   * frequent thing anyone does here, and it used to cost a full-screen route
   * change before you could type the first word.
   */
  const createNew = () => {
    const id = addSession({
      meetingId,
      date: new Date().toISOString().slice(0, 10),
    });
    onCreated?.(id);
    setOpenId(id);
    setFreshId(id);
  };

  const remove = async (id: string) => {
    if (
      await confirmAction({
        title: "Delete this entry?",
        body: "Its notes and commitments go with it.",
      })
    ) {
      deleteSession(id);
      if (openId === id) setOpenId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
      <ul className="divide-y divide-stone-100 dark:divide-stone-800/80">
        {rows.map((o) => (
          <li key={o.id}>
            <SessionRow
              row={o}
              notesElsewhere={notesElsewhere}
              expanded={openId === o.id}
              onToggle={() => toggle(o.id)}
              onPatch={(patch) => updateSession(o.id, patch)}
              onDelete={() => remove(o.id)}
            />
            {openId === o.id && meeting && (
              <InlineSessionEditor
                session={o}
                meeting={meeting}
                autoFocus={freshId === o.id}
                onExpand={() => onOpen(o.id)}
                onDeleted={() => setOpenId(null)}
              />
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={createNew}
        className="flex w-full items-center gap-2 border-t border-dashed border-stone-200 px-3 py-2.5 text-left text-sm font-medium text-stone-500 transition-colors hover:bg-teal-50/60 hover:text-teal-700 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-teal-950/30 dark:hover:text-teal-300"
      >
        <span className="text-base leading-none">+</span>
        Log a meeting
      </button>
    </div>
  );
}

/**
 * One entry's summary line. The dates stay editable in the row itself so
 * rescheduling never needs the editor open.
 */
function SessionRow({
  row,
  notesElsewhere,
  expanded,
  onToggle,
  onPatch,
  onDelete,
}: {
  row: Session;
  notesElsewhere: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Session>) => void;
  onDelete: () => void;
}) {
  const status = sessionStatus(row, notesElsewhere);
  const summary = sessionSummary(row);

  return (
    <div
      className={
        expanded
          ? "bg-teal-50/40 dark:bg-teal-950/20"
          : "group hover:bg-stone-50/80 dark:hover:bg-stone-950/40"
      }
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left"
        >
          <span
            aria-hidden
            className={`shrink-0 text-stone-400 transition-transform dark:text-stone-500 ${
              expanded ? "rotate-90" : ""
            }`}
          >
            ›
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-stone-500 dark:text-stone-400">
            {row.date}
          </span>
          <Badge size="sm" color={STATUS_COLOR[status]} className="shrink-0">
            {sessionStatusLabel(status)}
          </Badge>
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              summary
                ? "text-stone-600 dark:text-stone-400"
                : "italic text-stone-500 dark:text-stone-400"
            }`}
          >
            {summary || (expanded ? "" : "Empty — open to write")}
          </span>
        </button>

        {/* Next time stays on the row: rescheduling is a glance-and-fix, not a
            reason to open the write-up. Open, the editor owns both dates. */}
        <label
          className={`shrink-0 items-center gap-1 ${expanded ? "hidden" : "hidden sm:flex"}`}
        >
          <span className="text-[10px] tracking-wide text-stone-400 uppercase dark:text-stone-500">
            Next
          </span>
          <input
            type="date"
            className="field-input field-input--ghost field-input--sm tabular-nums text-stone-500"
            aria-label="Next meeting date"
            value={row.nextDate ?? ""}
            onChange={(e) => onPatch({ nextDate: e.target.value || undefined })}
          />
        </label>

        <ButtonUtility
          size="xs"
          color="tertiary"
          icon={X}
          tooltip="Delete entry"
          className="shrink-0 opacity-0 touch:opacity-100 group-hover:opacity-100"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
    </div>
  );
}
