import { useStore } from "../store/useStore";
import type { MeetingSubjectKind } from "../types";
import { MEETING_LABEL, meetingTitle, meetingsFor } from "../lib/readiness";
import { TopicBoard, type BoardDirection } from "./TopicBoard";
import { Button } from "@/components/base/buttons/button";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";

/**
 * Every topic board for one subject, on their profile.
 *
 * Topics belong to a meeting, not to a person, so a subject with two meetings
 * has two boards — a 1:1 and a career check-in are different conversations and
 * mixing their topics would be a lie about which room the thing gets raised in.
 *
 * This is the summary; the meeting's own Plan tab is where the scaffolding
 * happens, which is what the link is for.
 */
export function SubjectTopics({
  subjectKind,
  subjectId,
  subjectName,
  direction = "down",
}: {
  subjectKind: MeetingSubjectKind;
  subjectId: string;
  subjectName: string;
  direction?: BoardDirection;
}) {
  const { meetings, trackMeeting, selectMeeting } = useStore();
  const coarse = useCoarsePointer();

  const mine = meetingsFor(meetings, subjectKind, subjectId);
  const label = MEETING_LABEL[subjectKind];
  const firstName = subjectName.split(" ")[0] ?? subjectName;

  if (!mine.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-3 py-6 text-center dark:border-stone-700">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Topics live on a meeting, and there isn't one yet.
        </p>
        <Button
          size="sm"
          className="mt-2"
          onClick={() => trackMeeting(subjectKind, subjectId, "weekly")}
        >
          Track a {label} with {firstName}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {direction === "up"
          ? "What you need from them — asks, escalations, decisions."
          : "A running list of what there is to talk about."}{" "}
        {coarse
          ? "Use each card's Move to… control to plan it into a date."
          : "Drag a card onto a date to plan it into that meeting."}
      </p>

      {mine.map((meeting) => (
        <section key={meeting.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
              {meetingTitle(meeting, subjectName)}
            </h3>
            <Button
              size="sm"
              color="link-color"
              className="shrink-0"
              onClick={() => selectMeeting(meeting.id)}
            >
              Open planner
            </Button>
          </div>
          <TopicBoard meeting={meeting} direction={direction} />
        </section>
      ))}
    </div>
  );
}
