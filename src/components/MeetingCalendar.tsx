import { useMemo, useState } from "react";
import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  calendarGrid,
  curriculumOf,
  slotDotClass,
  slotKey,
  slotLabel,
  slotLabelOf,
  topicsFor,
  type CalendarDay,
  type Slot,
} from "../lib/topics";
import { todayISO } from "../lib/readiness";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { ChevronLeft, ChevronRight } from "@untitledui/icons";
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

/**
 * Month grid for one meeting — same slots and topics as the board, laid out
 * on a calendar. Projected occurrences show dashed; booked ones are solid.
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
  const addTopic = useStore((s) => s.addTopic);
  const addSession = useStore((s) => s.addSession);
  const placeTopic = useStore((s) => s.placeTopic);
  const today = todayISO();
  const [month, setMonth] = useState(() => currentMonth(today));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const curriculum = curriculumOf(meeting);

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

  const selectedDay = selectedDate
    ? grid.find((d) => d.date === selectedDate)
    : null;

  const addToDay = (day: CalendarDay) => {
    const text = draft.trim();
    if (!text) return;

    if (day.slot?.sessionId) {
      addTopic(meeting.id, text, { sessionId: day.slot.sessionId });
    } else if (day.slot) {
      const sessionId = addSession({ meetingId: meeting.id, date: day.slot.date });
      addTopic(meeting.id, text, { sessionId });
    } else {
      addTopic(meeting.id, text, { lane: "backlog" });
    }
    setDraft("");
  };

  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-secondary bg-stone-200 dark:bg-stone-800">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-secondary px-1 py-1.5 text-center text-caption font-semibold tracking-wide text-quaternary uppercase"
          >
            {d}
          </div>
        ))}

        {grid.map((day) => {
          const key = day.slot ? slotKey(day.slot) : null;
          const notesSelected = Boolean(
            key && selectedSlotKey && key === selectedSlotKey
          );
          return (
            <CalendarCell
              key={day.date}
              day={day}
              today={today}
              curriculum={curriculum}
              selected={selectedDate === day.date || notesSelected}
              onSelect={() => {
                if (day.slot && onSelectWeek) {
                  onSelectWeek(key!, day.slot);
                  setSelectedDate(day.date);
                  return;
                }
                setSelectedDate(selectedDate === day.date ? null : day.date);
              }}
            />
          );
        })}
      </div>

      {selectedDay && !selectedDay.slot && (
        <form
          className="space-y-2 rounded-xl border border-secondary bg-stone-50/60 p-3 dark:bg-stone-950/40"
          onSubmit={(e) => {
            e.preventDefault();
            addToDay(selectedDay);
          }}
        >
          <p className="text-xs font-medium text-stone-600 dark:text-stone-300">
            {new Date(`${selectedDay.date}T00:00:00Z`).toLocaleDateString(
              undefined,
              {
                weekday: "long",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }
            )}
          </p>
          <Input
            size="sm"
            placeholder="Talk about…"
            aria-label="Add topic to this date"
            value={draft}
            onChange={setDraft}
          />
        </form>
      )}

      {selectedDay?.slot && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addToDay(selectedDay);
          }}
        >
          <Input
            size="sm"
            placeholder="Add a topic…"
            aria-label="Add topic to this date"
            value={draft}
            onChange={setDraft}
            className="flex-1"
          />
        </form>
      )}

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
                  if (!day?.slot) return;
                  const sessionId =
                    day.slot.sessionId ??
                    addSession({ meetingId: meeting.id, date: day.slot.date });
                  placeTopic(t.id, { sessionId, slotId: t.slotId });
                }}
                dates={grid.filter((d) => d.inMonth && d.slot).map((d) => d.date)}
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
}: {
  day: CalendarDay;
  today: string;
  selected: boolean;
  onSelect: () => void;
  curriculum: ReturnType<typeof curriculumOf>;
}) {
  const isToday = day.date === today;
  const hasOccurrence = Boolean(day.slot);
  const past = day.slot?.past;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        "flex min-h-[4.5rem] flex-col bg-primary p-1 text-left transition",
        !day.inMonth && "opacity-40",
        selected && "ring-2 ring-teal-500 ring-inset dark:ring-teal-600",
        !selected && "hover:bg-stone-50 dark:hover:bg-stone-800/60"
      )}
    >
      <span
        className={cx(
          "mb-0.5 inline-flex size-5 items-center justify-center rounded-full text-caption tabular-nums",
          isToday && "bg-teal-600 font-semibold text-white",
          !isToday && "text-stone-600 dark:text-stone-300"
        )}
      >
        {dayNumber(day.date)}
      </span>

      {hasOccurrence && (
        <span
          className={cx(
            "mb-0.5 h-1 w-full rounded-full",
            past && "bg-amber-400 dark:bg-amber-600",
            !past && day.slot!.projected && "border border-dashed border-teal-400 bg-teal-50 dark:border-teal-600 dark:bg-teal-950/40",
            !past && !day.slot!.projected && "bg-teal-500 dark:bg-teal-600"
          )}
          title={day.slot ? slotLabel(day.slot) : undefined}
        />
      )}

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
        {day.topics.slice(0, 2).map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-1 truncate text-caption leading-tight text-stone-600 dark:text-stone-300"
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
        {day.topics.length > 2 && (
          <li className="text-caption text-stone-400">+{day.topics.length - 2}</li>
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
