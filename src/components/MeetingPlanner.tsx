import { useState } from "react";
import type { TrackedMeeting } from "../types";
import { TopicBoard, type BoardDirection } from "./TopicBoard";
import { MeetingCalendar } from "./MeetingCalendar";
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
}: {
  meeting: TrackedMeeting;
  direction?: BoardDirection;
}) {
  const [view, setView] = useState<PlanView>("board");

  return (
    <div className="space-y-3">
      <div
        className="inline-flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800"
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

      {view === "board" ? (
        <TopicBoard meeting={meeting} direction={direction} />
      ) : (
        <MeetingCalendar meeting={meeting} />
      )}
    </div>
  );
}
