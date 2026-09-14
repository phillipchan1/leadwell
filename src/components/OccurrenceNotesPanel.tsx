import { useEffect, useMemo, useState } from "react";
import type { Session, TrackedMeeting } from "../types";
import { RHYTHM_LABEL, todayISO } from "../lib/readiness";
import { cx } from "@/utils/cx";
import { useStore } from "../store/useStore";
import { Input } from "@/components/base/input/input";
import { parseColumnKey, topicsFor, type Slot } from "../lib/topics";
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
        (s) => s.meetingId === meetingId && s.date === target.date && s.kind !== "skipped"
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
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const updateSession = useStore((s) => s.updateSession);
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
      topicsFor(topics, meeting.id),
      meeting.curriculum ?? []
    );
    if (seeded) {
      updateSession(session.id, { notes: seeded });
      setNotes(seeded);
    }
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !slot) return null;

  const skipped = session.kind === "skipped";

  return (
    <div className="occurrence-notes-panel flex h-full min-h-0 flex-col bg-primary">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-secondary px-4 py-3">
        <OccurrenceWhen
          meeting={meeting}
          session={session}
          onGone={onClose}
        />
        <div className="flex shrink-0 items-center gap-1">
          {onOpenFullEditor && !skipped && (
            <ButtonUtility
              size="sm"
              color="tertiary"
              icon={Expand01}
              tooltip="Full editor"
              onClick={() => onOpenFullEditor(session.id)}
            />
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

      {skipped ? (
        <p className="px-4 py-8 text-center text-sm text-quaternary">
          This week isn't happening. Anything planned for it went back to Ideas.
        </p>
      ) : (
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
      )}
    </div>
  );
}

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * When this occurrence is, and changing it the way a calendar does: move just
 * this one, or the series from here on; skip a week; add or remove a one-off.
 *
 * The date used to be a bare input that silently moved the session — and with
 * it, the rhythm, which projected from wherever the last one landed.
 */
function OccurrenceWhen({
  meeting,
  session,
  onGone,
}: {
  meeting: TrackedMeeting;
  session: Session;
  onGone?: () => void;
}) {
  const moveOccurrence = useStore((s) => s.moveOccurrence);
  const skipOccurrence = useStore((s) => s.skipOccurrence);
  const restoreOccurrence = useStore((s) => s.restoreOccurrence);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(session.date);
  const today = todayISO();

  useEffect(() => {
    setDate(session.date);
    setEditing(false);
  }, [session.id, session.date]);

  const recurring = meeting.rhythm !== "as_needed";
  const extra = session.kind === "extra";
  const skipped = session.kind === "skipped";
  const moved = Boolean(session.seriesDate && session.seriesDate !== session.date && !skipped);
  // Opening a week seeds an agenda into its notes, so notes alone don't mean
  // it happened. A future meeting is always movable; a past one only while
  // nothing was written.
  const upcoming = session.date >= today;
  const changeable = upcoming || !session.notes?.trim();
  const from = { sessionId: session.id, date: session.date };

  const subtitle = skipped
    ? "Skipped"
    : extra
      ? "One-off meeting"
      : moved
        ? `Moved from ${fmt(session.seriesDate!)}`
        : recurring
          ? RHYTHM_LABEL[meeting.rhythm]
          : undefined;

  const apply = (scope: "one" | "series") => {
    if (!date || date === session.date) {
      setEditing(false);
      return;
    }
    moveOccurrence(meeting.id, from, date, scope);
    setEditing(false);
  };

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div>
        <p className={cx("text-md font-semibold", skipped ? "text-quaternary line-through" : "text-primary")}>
          {fmt(session.date)}
        </p>
        {subtitle && <p className="text-sm text-tertiary">{subtitle}</p>}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input
            size="sm"
            type="date"
            aria-label="New date"
            inputClassName="tabular-nums"
            value={date}
            onChange={setDate}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            {recurring && !extra ? (
              <>
                <Button size="sm" onClick={() => apply("one")} isDisabled={date === session.date}>
                  Just this meeting
                </Button>
                <Button size="sm" color="secondary" onClick={() => apply("series")} isDisabled={date === session.date}>
                  All future meetings
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => apply("one")} isDisabled={date === session.date}>
                Move
              </Button>
            )}
            <Button size="sm" color="tertiary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {skipped ? (
            <Button size="sm" color="link-color" onClick={() => restoreOccurrence(session.id)}>
              Restore this week
            </Button>
          ) : (
            <>
              {changeable && (
                <Button size="sm" color="link-color" onClick={() => setEditing(true)}>
                  Reschedule
                </Button>
              )}
              {moved && changeable && (
                <Button size="sm" color="link-gray" onClick={() => restoreOccurrence(session.id)}>
                  Move back
                </Button>
              )}
              {changeable && recurring && !extra && (
                <Button
                  size="sm"
                  color="link-gray"
                  onClick={() => skipOccurrence(meeting.id, from)}
                >
                  Skip this week
                </Button>
              )}
              {extra && changeable && (
                <Button
                  size="sm"
                  color="link-gray"
                  onClick={() => {
                    skipOccurrence(meeting.id, from);
                    onGone?.();
                  }}
                >
                  Remove one-off
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
