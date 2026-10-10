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
  const tags = useStore((s) => s.tags);
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
      <div className="flex items-center gap-1">
        <h3 className="font-serif text-[22px] leading-7">{monthLabel(month)}</h3>
        <span className="ml-auto flex items-center gap-1">
          {month !== currentMonth(today) && (
            <Button
              size="sm"
              color="link-gray"
              className="mr-2 shrink-0"
              onClick={() => setMonth(currentMonth(today))}
            >
              Today
            </Button>
          )}
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={ChevronLeft}
            tooltip="Previous month"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          />
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={ChevronRight}
            tooltip="Next month"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          />
        </span>
      </div>

      <div className="grid min-h-[32rem] flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-px overflow-hidden rounded-[16px] border border-secondary bg-[var(--color-border-secondary)]">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-primary px-2.5 pt-2.5 pb-1.5 font-mono text-[10.5px] text-quaternary uppercase"
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
              tags={tags}
              occurrenceLabel={occurrenceLabel}
              selected={selected}
              onSelect={() => openDay(day)}
            />
          );
        })}
      </div>

      {(unscheduled.backlog.length > 0 || unscheduled.parked.length > 0) && (
        <div className="space-y-2">
          <p className="eyebrow">Ideas not on a date yet</p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.backlog.map((t) => (
              <UnscheduledChip
                key={t.id}
                text={t.text}
                tag={slotLabelOf(curriculum, t.slotId)}
                dot={t.slotId ? slotDotClass(curriculum, t.slotId, tags) : undefined}
                onPlace={(date) => {
                  const day = grid.find((d) => d.date === date);
                  if (!day) return;
                  const sessionId =
                    day.slot?.sessionId ??
                    addSession({ meetingId: meeting.id, date: day.date });
                  placeTopic(t.id, { sessionId, slotId: t.slotId });
                }}
                // Only days this meeting actually happens, and not ones
                // already gone — anything else would invent a meeting.
                dates={grid
                  .filter((d) => d.inMonth && d.slot && !d.slot.past)
                  .map((d) => d.date)}
              />
            ))}
            {unscheduled.parked.map((t) => (
              <span
                key={t.id}
                className="max-w-full truncate rounded-[7px] border border-dashed border-primary px-2 py-1 text-[12px] text-quaternary"
                title={`Parked: ${t.text}`}
              >
                Parked · {t.text}
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
  tags,
  occurrenceLabel,
}: {
  day: CalendarDay;
  today: string;
  selected: boolean;
  onSelect: () => void;
  curriculum: ReturnType<typeof curriculumOf>;
  tags: { id: string; color: number }[];
  occurrenceLabel: string;
}) {
  const isToday = day.date === today;
  const hasOccurrence = Boolean(day.slot);
  const past = day.slot?.past;
  const empty = day.topics.length === 0;
  const shown = day.topics.slice(0, 3);
  const extra = day.topics.length - shown.length;
  const open = day.topics.filter((t) => t.status === "open").length;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Open ${dateLabel(day.date)}${hasOccurrence ? ` — ${occurrenceLabel}` : ""}`}
      aria-pressed={selected}
      className={cx(
        "group relative flex min-h-[5.25rem] flex-col gap-1 p-2 text-left transition-colors",
        "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-600",
        day.inMonth ? "bg-primary hover:bg-secondary" : "bg-secondary/70 hover:bg-secondary",
        selected && "z-[1] !bg-teal-50 ring-2 ring-teal-600 ring-inset dark:!bg-teal-950/40 dark:ring-teal-500"
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span
          className={cx(
            "inline-flex size-6 items-center justify-center rounded-full text-[13px] tabular-nums",
            isToday
              ? "bg-teal-600 font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
              : !day.inMonth
                ? "text-quaternary"
                : hasOccurrence
                  ? "font-semibold text-primary"
                  : "text-tertiary"
          )}
        >
          {dayNumber(day.date)}
        </span>
        <Plus
          aria-hidden
          className="size-3.5 shrink-0 text-quaternary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </span>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
        {shown.map((t) => (
          <li
            key={t.id}
            className={cx(
              "flex items-center gap-1.5 truncate rounded-[6px] px-1.5 py-[3px] text-[11.5px] leading-snug",
              t.status !== "open"
                ? "text-quaternary line-through"
                : past
                  ? "bg-cond-watch-soft text-cond-watch-ink"
                  : "bg-secondary text-primary"
            )}
          >
            {t.slotId && (
              <i
                className={cx("size-1.5 shrink-0 rounded-[1.5px]", slotDotClass(curriculum, t.slotId, tags))}
                aria-hidden
              />
            )}
            <span className="truncate">{t.text}</span>
          </li>
        ))}
        {hasOccurrence && empty && (
          <li
            className={cx(
              "truncate rounded-[6px] px-1.5 py-[3px] text-[11.5px] leading-snug",
              day.slot?.projected
                ? "border border-dashed border-teal-300 text-teal-800 dark:border-teal-700 dark:text-teal-300"
                : "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
            )}
          >
            {occurrenceLabel}
          </li>
        )}
        {extra > 0 && (
          <li className="px-1.5 font-mono text-[10.5px] text-quaternary">+{extra} MORE</li>
        )}
      </ul>
      {past && open > 0 && (
        <span className="sr-only">{open} not covered</span>
      )}
    </button>
  );
}

function UnscheduledChip({
  text,
  tag,
  dot,
  dates,
  onPlace,
}: {
  text: string;
  tag?: string;
  dot?: string;
  dates: string[];
  onPlace: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = tag ? `${tag} · ${text}` : text;
  const square = dot ? <i aria-hidden className={cx("size-2 shrink-0 rounded-[2px]", dot)} /> : null;

  if (!dates.length) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-1.5 truncate rounded-[7px] border border-secondary bg-primary px-2 py-1 text-[12px] text-secondary"
        title={label}
      >
        {square}
        <span className="truncate">{text}</span>
      </span>
    );
  }

  return (
    <span className="relative inline-block max-w-full">
      <button
        type="button"
        className="outline-focus-ring inline-flex max-w-full items-center gap-1.5 truncate rounded-[7px] border border-secondary bg-primary px-2 py-1 text-[12px] text-secondary transition-colors hover:border-teal-300 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 touch:min-h-11 touch:px-3"
        title={`Put “${label}” on a date`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {square}
        <span className="truncate">{text}</span>
      </button>
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-52 overflow-y-auto rounded-[12px] border border-secondary bg-primary py-1 shadow-lg">
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
