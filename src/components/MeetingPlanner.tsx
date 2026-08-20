import { useCallback, useId, useState } from "react";
import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  aheadForHorizon,
  ensureSessionId,
  HORIZON_DEFAULT,
  type Horizon,
  type Slot,
} from "../lib/topics";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TopicBoard, type BoardDirection } from "./TopicBoard";
import { MeetingCalendar } from "./MeetingCalendar";
import { OccurrenceNotesPanel } from "./OccurrenceNotesPanel";
import { OccurrenceNotesSheet } from "./OccurrenceNotesSheet";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { NativeSelect } from "@/components/base/select/select-native";
import { cx } from "@/utils/cx";

export type PlanView = "board" | "calendar";

const VIEWS: { id: PlanView; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
];

const HORIZON_OPTIONS: { label: string; value: Horizon }[] = [
  { label: "Next 4", value: 4 },
  { label: "Next 8", value: 8 },
  { label: "Quarter", value: 12 },
  { label: "All booked", value: "all" },
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
  const sessions = useStore((s) => s.sessions);
  const addSession = useStore((s) => s.addSession);
  const [view, setView] = useState<PlanView>("board");
  const [horizon, setHorizon] = useState<Horizon>(HORIZON_DEFAULT);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const viewRoving = useRovingFocus();
  const panelId = useId();

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
        ahead={aheadForHorizon(horizon)}
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
      <div className="flex flex-wrap items-center gap-2">
        <div
          {...viewRoving.groupProps}
          className="inline-flex shrink-0 gap-0.5 rounded-lg bg-tertiary p-0.5 touch:gap-2"
          role="tablist"
          aria-label="Plan view"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              id={`${panelId}-tab-${v.id}`}
              aria-selected={view === v.id}
              aria-controls={panelId}
              {...viewRoving.itemProps(view === v.id)}
              className={cx(
                "rounded-md px-3 py-1 text-xs font-semibold transition",
                "touch:min-h-11 touch:min-w-11",
                view === v.id
                  ? "bg-primary text-stone-800 shadow-sm dark:text-stone-100"
                  : "text-quaternary hover:text-stone-700 dark:hover:text-stone-200"
              )}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === "board" && meeting.rhythm !== "as_needed" && (
          <NativeSelect
            size="sm"
            className="w-auto shrink-0"
            aria-label="How far ahead to plan"
            value={String(horizon)}
            onChange={(e) => {
              const v = e.target.value;
              setHorizon(v === "all" ? "all" : (Number(v) as Horizon));
            }}
            options={HORIZON_OPTIONS.map((o) => ({
              label: o.label,
              value: String(o.value),
            }))}
          />
        )}
      </div>

      <div
        className={cx(
          "flex min-h-0 flex-1",
          selectedSlotKey && !isMobile && "gap-0 overflow-hidden"
        )}
      >
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${panelId}-tab-${view}`}
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
          <aside className="occurrence-notes-aside w-[min(42%,28rem)] shrink-0 border-l border-secondary">
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
