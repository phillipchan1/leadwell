import { useCallback, useId, useState } from "react";
import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  aheadForHorizon,
  HORIZON_DEFAULT,
  type Horizon,
  type Slot,
} from "../lib/topics";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TopicBoard, type BoardDirection } from "./TopicBoard";
import { PhonePlan } from "./PhonePlan";
import { MeetingCalendar } from "./MeetingCalendar";
import { SessionHistoryTable } from "./SessionHistoryTable";
import { OccurrenceNotesPanel } from "./OccurrenceNotesPanel";
import { OccurrenceNotesSheet } from "./OccurrenceNotesSheet";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { Calendar, CalendarPlus01, ChevronDown } from "@untitledui/icons";
import { todayISO } from "../lib/readiness";
import { ArcRibbon } from "./arcs/ArcRibbon";
import { cx } from "@/utils/cx";

export type PlanView = "board" | "calendar" | "history";

/*
 * Two shapes of the same plan — the board and a month — plus History where
 * the host has nowhere else to look back (a person's page). The meeting page
 * has its own Write-ups tab, so it turns History off.
 */
const VIEWS: { id: PlanView; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
  { id: "history", label: "History" },
];

const HORIZON_OPTIONS: { label: string; value: Horizon }[] = [
  { label: "Next 4 weeks", value: 4 },
  { label: "Next 8 weeks", value: 8 },
  { label: "Next quarter", value: 12 },
  { label: "Everything booked", value: "all" },
];

/**
 * One meeting's plan surface — board and calendar are the same data, two
 * shapes. Opening a week puts it beside the board on a desktop and in a sheet
 * on a phone; either way the board stays where it was.
 */
export function MeetingPlanner({
  meeting,
  direction = "down",
  selectedSlotKey,
  onSelectWeek,
  onCloseNotes,
  onOpenSession,
  historyView = true,
  oneOff = true,
  narrow = false,
}: {
  meeting: TrackedMeeting;
  /**
   * Offer History beside Board and Calendar. Planning is the default job;
   * looking back is somewhere you go. Off where the host already has its own
   * write-ups mode (the meeting page).
   */
  historyView?: boolean;
  /** Offer "One-off date" in the toolbar. Off where the host's header has it. */
  oneOff?: boolean;
  /** Hosted in a side panel rather than a page. */
  narrow?: boolean;
  direction?: BoardDirection;
  selectedSlotKey: string | null;
  onSelectWeek: (slotKey: string, slot: Slot) => void;
  onCloseNotes: () => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const addExtraOccurrence = useStore((s) => s.addExtraOccurrence);
  const [view, setView] = useState<PlanView>("board");
  const [horizon, setHorizon] = useState<Horizon>(HORIZON_DEFAULT);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const viewRoving = useRovingFocus();
  const panelId = useId();

  /*
   * Opening a week only looks at it. It used to book the occurrence on the
   * spot — and seed its notes — so a glance at a Monday three weeks out
   * counted as a meeting on the books, and a click on a past day in the
   * calendar invented one that never happened. The panel now makes the
   * occurrence real the first time you put something in it.
   */
  const openWeek = useCallback(
    (key: string, slot: Slot) => {
      const canonical = slot.sessionId ? `s:${slot.sessionId}` : `p:${slot.date}`;
      if (selectedSlotKey === canonical || selectedSlotKey === key) {
        onCloseNotes();
        return;
      }
      onSelectWeek(canonical, slot);
    },
    [onCloseNotes, onSelectWeek, selectedSlotKey]
  );

  const views = VIEWS.filter((v) => historyView || v.id !== "history");
  // A side panel has no room to split; the week opens as a drawer instead.
  const asSheet = isMobile || narrow;

  const body =
    view === "board" ? (
      <div className="flex flex-col gap-4">
      <ArcRibbon meeting={meeting} inBoard={!isMobile} />
      {isMobile ? (
        <PhonePlan
          meeting={meeting}
          direction={direction}
          ahead={aheadForHorizon(horizon)}
          onSelectWeek={openWeek}
          onOpenSession={onOpenSession}
        />
      ) : (
        <TopicBoard
          meeting={meeting}
          direction={direction}
          selectedSlotKey={selectedSlotKey}
          onSelectWeek={openWeek}
          ahead={aheadForHorizon(horizon)}
          narrow={narrow}
        />
      )}
      </div>
    ) : view === "history" ? (
      <SessionHistoryTable
        meetingId={meeting.id}
        onOpen={(sessionId) => {
          const key = `s:${sessionId}`;
          if (selectedSlotKey === key) {
            onCloseNotes();
            return;
          }
          const session = sessions.find((o) => o.id === sessionId);
          onSelectWeek(key, {
            sessionId,
            date: session?.date ?? "",
            projected: false,
            past: Boolean(session && session.date < todayISO()),
          });
        }}
      />
    ) : (
      <MeetingCalendar
        meeting={meeting}
        selectedSlotKey={selectedSlotKey}
        onSelectWeek={openWeek}
      />
    );

  const panel = selectedSlotKey ? (
    <OccurrenceNotesPanel
      meeting={meeting}
      slotKey={selectedSlotKey}
      onClose={onCloseNotes}
      onOpenFullEditor={onOpenSession}
      onMaterialized={(id, date) =>
        onSelectWeek(`s:${id}`, {
          sessionId: id,
          date,
          projected: false,
          past: date < todayISO(),
        })
      }
    />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          {...viewRoving.groupProps}
          className="inline-flex shrink-0 gap-0.5 rounded-[11px] bg-tertiary p-[3px]"
          role="tablist"
          aria-label="Plan view"
        >
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              id={`${panelId}-tab-${v.id}`}
              aria-selected={view === v.id}
              aria-controls={panelId}
              {...viewRoving.itemProps(view === v.id)}
              className={cx(
                "h-8 rounded-lg px-3 text-[13px] transition-colors touch:min-h-11",
                view === v.id
                  ? "bg-primary font-semibold text-primary shadow-[0_1px_2px_rgba(10,34,37,0.12)]"
                  : "font-medium text-tertiary hover:text-secondary"
              )}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === "board" && meeting.rhythm !== "as_needed" && (
          <label className="relative inline-flex h-[38px] shrink-0 items-center rounded-[9px] border border-primary bg-primary pr-8 pl-3 text-[13px] font-semibold text-primary shadow-xs focus-within:ring-2 focus-within:ring-teal-600">
            <span className="sr-only">How far ahead to plan</span>
            <select
              value={String(horizon)}
              onChange={(e) => {
                const v = e.target.value;
                setHorizon(v === "all" ? "all" : (Number(v) as Horizon));
              }}
              className="absolute inset-0 cursor-pointer appearance-none opacity-0"
            >
              {HORIZON_OPTIONS.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
            {HORIZON_OPTIONS.find((o) => o.value === horizon)?.label}
            <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 size-3.5 text-quaternary" />
          </label>
        )}

        {view === "board" && !isMobile && (
          <span className="inline-flex items-center gap-3.5 text-[12px] text-tertiary max-lg:hidden">
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="h-2.5 w-3.5 rounded-[3px] border border-primary bg-primary" />
              Booked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-primary" />
              Expected
            </span>
          </span>
        )}

        <span className="ml-auto flex items-center gap-3">
          {view === "board" && !isMobile && !selectedSlotKey && (
            <span className="text-[12.5px] text-tertiary max-xl:hidden">
              Drag an idea onto a week. Right-click for more. Drag a box to select several.
            </span>
          )}
          {oneOff && view !== "history" && (
            <AddOneOff
              onAdd={(date) => {
                const id = addExtraOccurrence(meeting.id, date);
                onSelectWeek(`s:${id}`, {
                  sessionId: id,
                  date,
                  projected: false,
                  past: date < todayISO(),
                });
              }}
            />
          )}
        </span>
      </div>

      <div className="flex items-start gap-5">
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${panelId}-tab-${view}`}
          className="flex min-w-0 flex-1 flex-col"
        >
          {body}
        </div>

        {panel && !asSheet && (
          <aside
            aria-label="This week"
            className="occurrence-notes-aside sticky top-4 flex h-[min(calc(100dvh-12rem),100%)] max-h-[calc(100dvh-12rem)] w-[min(46%,29rem)] shrink-0 flex-col self-start overflow-hidden rounded-[20px] border border-secondary bg-primary shadow-[0_1px_2px_rgba(10,34,37,0.06),0_18px_40px_-28px_rgba(10,34,37,0.35)]"
          >
            {panel}
          </aside>
        )}
      </div>

      {panel && asSheet && (
        <OccurrenceNotesSheet open onClose={onCloseNotes} label="This week">
          {panel}
        </OccurrenceNotesSheet>
      )}
    </div>
  );
}

/** A meeting outside the rhythm, with this board's ideas and sections. */
export function AddOneOff({
  onAdd,
  className,
  iconOnly,
}: {
  onAdd: (date: string) => void;
  className?: string;
  /** A quiet square for a header that already has its one primary button. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  if (!open && iconOnly) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add a one-off date"
        title="Add a one-off date"
        className={cx(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] text-tertiary hover:bg-secondary hover:text-secondary touch:size-11",
          className
        )}
      >
        <CalendarPlus01 aria-hidden className="size-[18px]" />
      </button>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "inline-flex h-9 shrink-0 items-center gap-2 rounded-[9px] border border-primary bg-primary px-3.5 text-[13px] font-semibold text-primary shadow-xs transition-colors hover:bg-secondary touch:min-h-11",
          className
        )}
      >
        <Calendar aria-hidden className="size-4 text-tertiary" />
        One-off date
      </button>
    );
  }
  return (
    <form
      className={cx("flex items-center gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!date) return;
        onAdd(date);
        setOpen(false);
      }}
    >
      <input
        type="date"
        aria-label="One-off meeting date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        autoFocus
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="h-9 rounded-[9px] border border-teal-300 bg-primary px-2.5 font-mono text-[12.5px] text-primary outline-none dark:border-teal-700"
      />
      <button
        type="submit"
        disabled={!date}
        className="h-9 rounded-[9px] bg-teal-600 px-3.5 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-9 rounded-[9px] px-2.5 text-[13px] font-semibold text-tertiary hover:text-secondary"
      >
        Cancel
      </button>
    </form>
  );
}
