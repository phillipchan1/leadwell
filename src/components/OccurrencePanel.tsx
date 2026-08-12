import type { TrackedMeeting } from "../types";
import type { Slot } from "../lib/topics";
import { useStore } from "../store/useStore";
import { sessionSummary } from "../lib/session";
import { InlineSessionEditor } from "./InlineSessionEditor";

/**
 * Notes and agenda for one occurrence — the write-up half of a week column.
 * The parent materializes the session before mounting this (via ensureSessionId).
 */
export function OccurrencePanel({
  meeting,
  slot,
  onOpenSession,
  onClose,
  autoFocus,
}: {
  meeting: TrackedMeeting;
  slot: Slot;
  onOpenSession?: (sessionId: string) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const { sessions } = useStore();

  const session =
    (slot.sessionId
      ? sessions.find((s) => s.id === slot.sessionId)
      : sessions.find(
          (s) => s.meetingId === meeting.id && s.date === slot.date
        )) ?? null;

  if (!session) return null;

  const preview = sessionSummary(session);

  return (
    <div className="overflow-hidden rounded-xl border border-teal-200 bg-teal-50/30 dark:border-teal-900 dark:bg-teal-950/20">
      <div className="flex items-start justify-between gap-2 border-b border-teal-200/80 px-3 py-2 dark:border-teal-900/80">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-stone-800 dark:text-stone-100">
            {session.date}
            {slot.projected && (
              <span className="ml-1.5 font-normal text-stone-500 dark:text-stone-400">
                · booked
              </span>
            )}
          </p>
          {preview && (
            <p className="truncate text-[11px] text-stone-500 dark:text-stone-400">
              {preview}
            </p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-stone-500 hover:bg-white/60 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-900/60"
          >
            Close
          </button>
        )}
      </div>
      <InlineSessionEditor
        session={session}
        meeting={meeting}
        autoFocus={autoFocus}
        onExpand={() => onOpenSession?.(session.id)}
        onDeleted={onClose}
      />
    </div>
  );
}
