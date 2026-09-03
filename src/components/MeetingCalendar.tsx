import { useMemo, useState } from "react";
import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  calendarGrid,
  curriculumOf,
  slotDotClass,
  slotKey,
  slotLabelOf,
  topicsFor,
  type CalendarDay,
  type Slot,
} from "../lib/topics";
import { todayISO } from "../lib/readiness";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { ChevronLeft, ChevronRight, Plus } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function currentMonth(today: string): string {
  return today.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const year = d.getUTCFullYear();
  const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${mon}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Any day can be an occurrence — click materializes it, the way Notion creates a page. */
function slotForDay(day: CalendarDay, today: string): Slot {
  if (day.slot) return day.slot;
  return {
    sessionId: null,
    date: day.date,
    projected: true,
    past: day.date < today,
  };
}

/**
 * Month grid for one meeting — same slots and topics as the board, laid out
 * on a calendar. Every day is a click target; hover reveals a plus.
 */
export function MeetingCalendar({
  meeting,
  selectedSlotKey,
  onSelectWeek,
}: {
  meeting: TrackedMeeting;
  selectedSlotKey?: string | null;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const addSession = useStore((s) => s.addSession);
  const placeTopic = useStore((s) => s.placeTopic);
  const today = todayISO();
  const [month, setMonth] = useState(() => currentMonth(today));

  const curriculum = curriculumOf(meeting);
  const occurrenceLabel = meeting.name?.trim() || "Meeting";

  const grid = useMemo(
    () => calendarGrid(month, meeting, sessions, topics, today),
    [month, meeting, sessions, topics, today]
  );

  const unscheduled = useMemo(() => {
    const open = topicsFor(topics, meeting.id).filter((t) => t.status === "open");
    return {
      backlog: open.filter((t) => !t.sessionId && t.lane === "backlog"),
      parked: open.filter((t) => !t.sessionId && t.lane === "parked"),
    };
  }, [topics, meeting.id]);

  const openDay = (day: CalendarDay) => {
    if (!onSelectWeek) return;
    const slot = slotForDay(day, today);
    onSelectWeek(slotKey(slot), slot);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <ButtonUtility
          size="sm"
          color="tertiary"
          icon={ChevronLeft}
          tooltip="Previous month"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
        />
        <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">
          {monthLabel(month)}
        </span>
        <ButtonUtility
          size="sm"
          color="tertiary"
          icon={ChevronRight}
          tooltip="Next month"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
        />
        {month !== currentMonth(today) && (
          <Button
            size="sm"
            color="link-gray"
            className="ml-auto shrink-0"
            onClick={() => setMonth(currentMonth(today))}
          >
            Today
          </Button>
        )}
      </div>

      <div className="grid min-h-[32rem] flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-px overflow-hidden rounded-xl border border-secondary bg-stone-200 dark:bg-stone-800">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-secondary px-2 py-1.5 text-[11px] font-medium text-quaternary"
          >
            {d}
          </div>
        ))}

        {grid.map((day) => {
          const key = day.slot ? slotKey(day.slot) : `p:${day.date}`;
          const selected = Boolean(
            selectedSlotKey &&
              (selectedSlotKey === key ||
                (day.slot?.sessionId &&
                  selectedSlotKey === `s:${day.slot.sessionId}`))
          );
          return (
            <CalendarCell
              key={day.date}
              day={day}
              today={today}
              curriculum={curriculum}
              occurrenceLabel={occurrenceLabel}
              selected={selected}
              onSelect={() => openDay(day)}
            />
          );
        })}
      </div>

      {(unscheduled.backlog.length > 0 || unscheduled.parked.length > 0) && (
        <div className="space-y-2">
          <p className="text-caption font-semibold tracking-wide text-stone-400 uppercase dark:text-stone-500">
            Unscheduled
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.backlog.map((t) => (
              <UnscheduledChip
                key={t.id}
                text={t.text}
                tag={slotLabelOf(curriculum, t.slotId)}
                onPlace={(date) => {
                  const day = grid.find((d) => d.date === date);
                  if (!day) return;
                  const sessionId =
                    day.slot?.sessionId ??
                    addSession({ meetingId: meeting.id, date: day.date });
                  placeTopic(t.id, { sessionId, slotId: t.slotId });
                }}
                dates={grid.filter((d) => d.inMonth).map((d) => d.date)}
              />
            ))}
            {unscheduled.parked.map((t) => (
              <span
                key={t.id}
                className="max-w-full truncate rounded-md border border-dashed border-primary px-2 py-0.5 text-caption text-quaternary"
                title={t.text}
              >
                {t.text}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarCell({
  day,
  today,
  selected,
  onSelect,
  curriculum,
  occurrenceLabel,
}: {
  day: CalendarDay;
  today: string;
  selected: boolean;
  onSelect: () => void;
  curriculum: ReturnType<typeof curriculumOf>;
  occurrenceLabel: string;
}) {
  const isToday = day.date === today;
  const hasOccurrence = Boolean(day.slot);
  const past = day.slot?.past;
  const empty = day.topics.length === 0;
  const shown = day.topics.slice(0, 3);
  const extra = day.topics.length - shown.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Open ${dateLabel(day.date)}`}
      aria-pressed={selected}
      className={cx(
        "group relative flex min-h-[4.75rem] flex-col gap-0.5 bg-primary p-1.5 text-left transition",
        "hover:bg-stone-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-500 dark:hover:bg-stone-800/70",
        !day.inMonth && "bg-stone-50/80 opacity-50 dark:bg-stone-950/40",
        selected && "z-[1] bg-teal-50/40 ring-2 ring-inset ring-teal-500 dark:bg-teal-950/20 dark:ring-teal-600"
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span
          className={cx(
            "inline-flex size-6 items-center justify-center rounded-full text-[13px] tabular-nums",
            isToday && "bg-teal-600 font-semibold text-white",
            !isToday && "text-stone-600 dark:text-stone-300"
          )}
        >
          {dayNumber(day.date)}
        </span>
        <span
          className={cx(
            "grid size-5 shrink-0 place-items-center rounded text-stone-400 transition-opacity",
            empty
              ? "opacity-70 group-hover:opacity-100 group-focus-visible:opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          )}
          aria-hidden
        >
          <Plus className="size-3.5" />
        </span>
      </span>

      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        {shown.map((t) => (
          <li
            key={t.id}
            className={cx(
              "flex items-center gap-1 truncate rounded-sm px-1 py-0.5 text-[11px] leading-snug",
              past
                ? "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                : "bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200"
            )}
          >
            {t.slotId && (
              <span
                className={cx(
                  "size-1.5 shrink-0 rounded-full",
                  slotDotClass(curriculum, t.slotId)
                )}
                aria-hidden
              />
            )}
            <span className="truncate">{t.text}</span>
          </li>
        ))}
        {hasOccurrence && empty && (
          <li
            className={cx(
              "truncate rounded-sm px-1 py-0.5 text-[11px] leading-snug",
              day.slot?.projected
                ? "border border-dashed border-teal-300 text-teal-700/80 dark:border-teal-700 dark:text-teal-400/80"
                : "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
            )}
          >
            {occurrenceLabel}
          </li>
        )}
        {extra > 0 && (
          <li className="px-1 text-[11px] text-quaternary">+{extra} more</li>
        )}
      </ul>
    </button>
  );
}

function UnscheduledChip({
  text,
  tag,
  dates,
  onPlace,
}: {
  text: string;
  tag?: string;
  dates: string[];
  onPlace: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = tag ? `${tag} · ${text}` : text;

  if (!dates.length) {
    return (
      <span
        className="max-w-full truncate rounded-md bg-tertiary px-2 py-0.5 text-caption text-stone-600 dark:text-stone-300"
        title={label}
      >
        {label}
      </span>
    );
  }

  return (
    <span className="relative inline-block max-w-full">
      <button
        type="button"
        className="outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2 touch:min-h-11 touch:px-3 max-w-full truncate rounded-md bg-tertiary px-2 py-0.5 text-caption text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-700"
        title={`Schedule: ${label}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <ul className="absolute z-10 mt-1 max-h-40 w-48 overflow-y-auto rounded-lg border border-stone-200 bg-primary py-1 shadow-lg dark:border-stone-700">
          {dates.map((d) => (
            <li key={d}>
              <button
                type="button"
                className="outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2 touch:min-h-11 flex w-full items-center truncate px-3 py-1.5 text-left text-xs hover:bg-stone-50 dark:hover:bg-stone-800"
                onClick={() => {
                  onPlace(d);
                  setOpen(false);
                }}
              >
                {new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
