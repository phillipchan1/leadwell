import { useEffect, useMemo, useState } from "react";
import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { parseColumnKey, slotLabel, topicsFor, type Slot } from "../lib/topics";
import { seedNotesFromTopics } from "../lib/sessionNotes";
import { SessionAgenda } from "./SessionAgenda";
import { SessionEditor } from "./SessionEditor";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Expand01, X } from "@untitledui/icons";

function resolveSession(
  meetingId: string,
  slotKey: string,
  sessions: ReturnType<typeof useStore.getState>["sessions"]
) {
  const target = parseColumnKey(slotKey);
  if (target.kind === "session") {
    return sessions.find((s) => s.id === target.sessionId) ?? null;
  }
  if (target.kind === "projected") {
    return (
      sessions.find(
        (s) => s.meetingId === meetingId && s.date === target.date
      ) ?? null
    );
  }
  return null;
}

function resolveSlot(
  meetingId: string,
  slotKey: string,
  sessions: ReturnType<typeof useStore.getState>["sessions"]
): Slot | null {
  const target = parseColumnKey(slotKey);
  if (target.kind === "session") {
    const session = sessions.find((s) => s.id === target.sessionId);
    if (!session) return null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      sessionId: session.id,
      date: session.date,
      projected: false,
      past: session.date < today,
    };
  }
  if (target.kind === "projected") {
    const today = new Date().toISOString().slice(0, 10);
    const existing = sessions.find(
      (s) => s.meetingId === meetingId && s.date === target.date
    );
    return {
      sessionId: existing?.id ?? null,
      date: target.date,
      projected: !existing,
      past: target.date < today,
    };
  }
  return null;
}

/**
 * Notes and agenda for one occurrence — the dedicated write-up surface.
 */
export function OccurrenceNotesPanel({
  meeting,
  slotKey,
  onClose,
  onOpenFullEditor,
}: {
  meeting: TrackedMeeting;
  slotKey: string;
  onClose?: () => void;
  onOpenFullEditor?: (sessionId: string) => void;
}) {
  const { sessions, topics, updateSession } = useStore();
  const session = useMemo(
    () => resolveSession(meeting.id, slotKey, sessions),
    [meeting.id, slotKey, sessions]
  );
  const slot = useMemo(
    () => resolveSlot(meeting.id, slotKey, sessions),
    [meeting.id, slotKey, sessions]
  );
  const [notes, setNotes] = useState(session?.notes ?? "");

  useEffect(() => {
    if (!session) return;
    setNotes(session.notes ?? "");
  }, [session?.id, session?.notes]);

  useEffect(() => {
    if (!session) return;
    const seeded = seedNotesFromTopics(
      session,
      topicsFor(topics, meeting.id)
    );
    if (seeded) {
      updateSession(session.id, { notes: seeded });
      setNotes(seeded);
    }
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !slot) return null;

  const heading = slotLabel(slot);

  return (
    <div className="occurrence-notes-panel flex h-full min-h-0 flex-col bg-white dark:bg-stone-900">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
            {heading}
          </p>
          <label className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
              Date
            </span>
            <input
              type="date"
              className="field-input field-input--sm tabular-nums"
              value={session.date}
              onChange={(e) =>
                updateSession(session.id, { date: e.target.value })
              }
            />
          </label>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onOpenFullEditor && (
            <Button
              size="sm"
              color="link-gray"
              iconLeading={Expand01}
              onClick={() => onOpenFullEditor(session.id)}
            >
              Full editor
            </Button>
          )}
          {onClose && (
            <ButtonUtility
              size="sm"
              color="tertiary"
              icon={X}
              tooltip="Close"
              onClick={onClose}
            />
          )}
        </div>
      </div>

      <div className="scroll-contain min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <SessionAgenda session={session} meeting={meeting} />
        <SessionEditor
          value={notes}
          onChange={(value) => {
            setNotes(value);
            updateSession(session.id, {
              notes: value.trim() || undefined,
            });
          }}
          sessionId={session.id}
          placeholder="What did you cover?"
        />
      </div>
    </div>
  );
}
