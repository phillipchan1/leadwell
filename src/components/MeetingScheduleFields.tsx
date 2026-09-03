import { useMemo, useState } from "react";
import type { TrackedMeeting } from "../types";
import { ANCHOR_WEEKDAY_OPTIONS } from "../lib/readiness";
import { nextSlotAfter, plannedSlots, slotLabel } from "../lib/topics";
import { useStore } from "../store/useStore";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";

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
        <div className="grid gap-3 sm:grid-cols-2">
          <NativeSelect
            size={size}
            label="Usually on"
            hint="The rhythm projects from here — no need to set a date."
            value={
              meeting.anchorWeekday !== undefined
                ? String(meeting.anchorWeekday)
                : ""
            }
            onChange={(e) =>
              onChange({
                anchorWeekday: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            options={[{ label: "Not set", value: "" }, ...ANCHOR_WEEKDAY_OPTIONS]}
          />
          <div className="flex flex-col justify-end">
            <p className="text-caption text-quaternary">Next one</p>
            <p className="text-sm font-medium text-stone-700 tabular-nums dark:text-stone-200">
              {projected ? slotLabel(projected) : "—"}
              {meeting.nextDate ? (
                <span className="ml-1.5 rounded bg-tertiary px-1 py-px text-caption font-normal text-quaternary">
                  booked
                </span>
              ) : null}
            </p>
          </div>
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
