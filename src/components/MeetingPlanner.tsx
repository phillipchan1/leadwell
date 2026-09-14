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
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Plus } from "@untitledui/icons";
import { todayISO } from "../lib/readiness";
import { cx } from "@/utils/cx";

export type PlanView = "board" | "calendar";

/*
 * Two shapes of the same plan. There was a third, Ideas, which drew the backlog
 * a second time — the board already keeps it beside the weeks.
 */
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
  const addExtraOccurrence = useStore((s) => s.addExtraOccurrence);
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

  /*
   * The board plans the next eight weeks; Ideas is the whole backlog for this
   * meeting, organised. The strip beside the board only ever has room for the
   * next few, which is fine while planning and useless while deciding what is
   * even worth raising.
   */
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
          className="inline-flex h-9 shrink-0 items-stretch gap-0.5 rounded-lg bg-tertiary p-0.5 touch:h-auto touch:gap-2"
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
                "rounded-md px-3 text-sm font-medium transition",
                "touch:min-h-11 touch:min-w-11",
                view === v.id
                  ? "bg-primary text-primary shadow-xs"
                  : "text-quaternary hover:text-secondary"
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
        <div className="ml-auto">
          <AddOneOff
            onAdd={(date) => {
              const id = addExtraOccurrence(meeting.id, date);
              onSelectWeek(`s:${id}`, {
                sessionId: id,
                date,
                projected: false,
                past: false,
              });
            }}
          />
        </div>
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
            "flex min-h-0 min-w-0 flex-1 flex-col",
            selectedSlotKey && !isMobile ? "overflow-hidden" : "overflow-y-auto"
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

/** "+ One-off" — a meeting outside the rhythm, with this board's ideas and rows. */
function AddOneOff({ onAdd }: { onAdd: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  if (!open) {
    return (
      <Button size="sm" color="secondary" iconLeading={Plus} onClick={() => setOpen(true)}>
        One-off meeting
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date) return;
        onAdd(date);
        setOpen(false);
      }}
    >
      <Input
        size="sm"
        type="date"
        aria-label="One-off meeting date"
        inputClassName="tabular-nums"
        value={date}
        onChange={setDate}
        autoFocus
      />
      <Button size="sm" type="submit" isDisabled={!date}>
        Add
      </Button>
      <Button size="sm" color="tertiary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
