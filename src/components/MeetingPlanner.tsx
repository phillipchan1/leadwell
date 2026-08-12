import { useCallback, useState } from "react";
import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { ensureSessionId, type Slot } from "../lib/topics";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TopicBoard, type BoardDirection } from "./TopicBoard";
import { MeetingCalendar } from "./MeetingCalendar";
import { OccurrenceNotesPanel } from "./OccurrenceNotesPanel";
import { OccurrenceNotesSheet } from "./OccurrenceNotesSheet";
import { cx } from "@/utils/cx";

export type PlanView = "board" | "calendar";

const VIEWS: { id: PlanView; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
];

/**
 * One meeting's plan surface — board and calendar are the same data, two shapes.
 */
export function MeetingPlanner({
  meeting,
  direction = "down",
  selectedSlotKey,
  onSelectWeek,
  onCloseNotes,
  onOpenSession,
}: {
  meeting: TrackedMeeting;
  direction?: BoardDirection;
  selectedSlotKey: string | null;
  onSelectWeek: (slotKey: string, slot: Slot) => void;
  onCloseNotes: () => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const { sessions, addSession } = useStore();
  const [view, setView] = useState<PlanView>("board");
  const isMobile = useMediaQuery("(max-width: 767px)");

  const openWeek = useCallback(
    (slotKeyArg: string, slot: Slot) => {
      const sessionId = ensureSessionId(
        meeting.id,
        slot,
        sessions,
        addSession
      );
      const canonicalKey = `s:${sessionId}`;
      if (
        selectedSlotKey === canonicalKey ||
        selectedSlotKey === slotKeyArg
      ) {
        onCloseNotes();
        return;
      }
      onSelectWeek(canonicalKey, slot);
    },
    [addSession, meeting.id, onCloseNotes, onSelectWeek, selectedSlotKey, sessions]
  );

  const boardOrCalendar =
    view === "board" ? (
      <TopicBoard
        meeting={meeting}
        direction={direction}
        selectedSlotKey={selectedSlotKey}
        onSelectWeek={openWeek}
      />
    ) : (
      <MeetingCalendar
        meeting={meeting}
        selectedSlotKey={selectedSlotKey}
        onSelectWeek={openWeek}
      />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        className="inline-flex shrink-0 gap-0.5 rounded-lg bg-stone-100 p-0.5 touch:gap-2 dark:bg-stone-800"
        role="tablist"
        aria-label="Plan view"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={cx(
              "rounded-md px-3 py-1 text-xs font-semibold transition",
              // Hand-rolled rather than the design system's tabs, so it needs
              // the touch floor spelled out.
              "touch:min-h-11 touch:min-w-11",
              view === v.id
                ? "bg-white text-stone-800 shadow-sm dark:bg-stone-900 dark:text-stone-100"
                : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            )}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div
        className={cx(
          "flex min-h-0 flex-1",
          selectedSlotKey && !isMobile && "gap-0 overflow-hidden"
        )}
      >
        <div
          className={cx(
            "min-h-0 min-w-0",
            selectedSlotKey && !isMobile
              ? "flex-1 overflow-y-auto"
              : "flex-1"
          )}
        >
          {boardOrCalendar}
        </div>

        {selectedSlotKey && !isMobile && (
          <aside className="occurrence-notes-aside w-[min(42%,28rem)] shrink-0 border-l border-stone-200 dark:border-stone-800">
            <OccurrenceNotesPanel
              meeting={meeting}
              slotKey={selectedSlotKey}
              onClose={onCloseNotes}
              onOpenFullEditor={onOpenSession}
            />
          </aside>
        )}
      </div>

      {selectedSlotKey && isMobile && (
        <OccurrenceNotesSheet
          open
          onClose={onCloseNotes}
          label="Meeting notes"
        >
          <OccurrenceNotesPanel
            meeting={meeting}
            slotKey={selectedSlotKey}
            onClose={onCloseNotes}
            onOpenFullEditor={onOpenSession}
          />
        </OccurrenceNotesSheet>
      )}
    </div>
  );
}
