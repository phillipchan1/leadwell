import { useMemo, useState } from "react";
import type { TrackedMeeting } from "../types";
import { nextSlotAfter, plannedSlots, slotLabel } from "../lib/topics";
import { useStore } from "../store/useStore";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { cx } from "@/utils/cx";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * "Every Monday", as seven buttons. A select hid the one decision that makes
 * a weekly meeting land on the right day; without it the rhythm just echoed
 * whatever day something was last logged.
 */
export function WeekdayPicker({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (day: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Day of the week"
      className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-tertiary p-0.5"
    >
      {WEEKDAYS.map((label, day) => {
        const on = value === day;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(day)}
            className={cx(
              "h-7 min-w-10 rounded-md px-2 text-xs font-medium transition touch:min-h-11",
              on
                ? "bg-primary text-primary shadow-xs"
                : "text-quaternary hover:text-secondary"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * When the meeting lands on the calendar.
 *
 * The rhythm is the answer almost every time — "weekly, on Mondays" — and the
 * projection follows from it, so that is what this asks for. Picking an exact
 * date used to sit alongside as an equal, which made a recurring meeting feel
 * like something you had to re-book every week. It is an override now: useful
 * when a particular occurrence moves, and visibly temporary, with the rhythm
 * one click away.
 */
export function MeetingScheduleFields({
  meeting,
  onChange,
  size = "md",
}: {
  meeting: TrackedMeeting;
  onChange: (patch: Partial<Omit<TrackedMeeting, "id">>) => void;
  size?: "sm" | "md";
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const setWeekday = useStore((s) => s.setMeetingWeekday);
  const [booking, setBooking] = useState(false);

  const projected = useMemo(() => {
    const slots = plannedSlots(meeting, sessions, topics, undefined, 4);
    if (meeting.nextDate) {
      return (
        slots.find((s) => s.date === meeting.nextDate) ?? {
          sessionId: null,
          date: meeting.nextDate,
          projected: false,
          past: false,
        }
      );
    }
    return nextSlotAfter(slots);
  }, [meeting, sessions, topics]);

  const recurring = meeting.rhythm !== "as_needed";
  const showDate = booking || Boolean(meeting.nextDate) || !recurring;

  return (
    <div className="space-y-2.5">
      {recurring && (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-secondary">Repeats on</span>
          <WeekdayPicker
            value={meeting.anchorWeekday}
            onChange={(day) => setWeekday(meeting.id, day)}
          />
          <p className="text-caption text-quaternary">
            Next one:{" "}
            <span className="font-medium text-secondary tabular-nums">
              {projected ? slotLabel(projected).replace(/^~/, "") : "—"}
            </span>
            {meeting.nextDate ? " (booked)" : ""}
          </p>
        </div>
      )}

      {showDate ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            size={size}
            type="date"
            label={recurring ? "Book this one for" : "Next one is on"}
            hint={
              recurring
                ? "Overrides the rhythm for a single occurrence."
                : "As-needed meetings have no rhythm to project from."
            }
            value={meeting.nextDate ?? ""}
            onChange={(value) => onChange({ nextDate: value || undefined })}
            className="min-w-[10rem] flex-1"
          />
          {recurring && meeting.nextDate && (
            <Button
              size="sm"
              color="tertiary"
              onClick={() => {
                onChange({ nextDate: undefined });
                setBooking(false);
              }}
            >
              Back to the rhythm
            </Button>
          )}
        </div>
      ) : (
        <Button size="sm" color="link-gray" onClick={() => setBooking(true)}>
          Book a specific date instead
        </Button>
      )}
    </div>
  );
}
