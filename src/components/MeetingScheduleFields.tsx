import type { TrackedMeeting } from "../types";
import { ANCHOR_WEEKDAY_OPTIONS } from "../lib/readiness";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";

/**
 * When the meeting lands on the calendar — shared between the meeting page
 * Settings tab and the inline block on a person/team profile.
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
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {meeting.rhythm !== "as_needed" && (
        <NativeSelect
          size={size}
          label="Usually on"
          hint="Projected dates snap here. Leave unset to echo the last logged date."
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
          options={[
            { label: "Not set", value: "" },
            ...ANCHOR_WEEKDAY_OPTIONS,
          ]}
        />
      )}
      <Input
        size={size}
        type="date"
        label="Next one is on"
        hint="An explicit booking beats the rhythm projection."
        value={meeting.nextDate ?? ""}
        onChange={(value) => onChange({ nextDate: value || undefined })}
        className={meeting.rhythm === "as_needed" ? "sm:col-span-2" : undefined}
      />
    </div>
  );
}
