import { useMemo } from "react";
import { useStore } from "../store/useStore";
import type { TrackedMeeting } from "../types";
import {
  meetingSubjectName,
  meetingTitle,
  readinessOf,
  type Readiness,
} from "../lib/readiness";

export type MeetingRow = {
  meeting: TrackedMeeting;
  /** Full title — "Meeting · Sarah Kim" when unnamed. */
  title: string;
  /** Short label for tight lists: the meeting's name, else who it's with. */
  name: string;
  readiness: Readiness;
};

/**
 * Every recurring meeting, soonest first.
 *
 * One order for everything that lists meetings as a sequence — the sidebar and
 * the pager on a meeting's page — so "next" means the same meeting in both.
 * A meeting with nothing booked sorts last: it's unknown, not imminent.
 */
export function useMeetingsByNext(): MeetingRow[] {
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);

  return useMemo(
    () =>
      meetings
        .map((meeting) => {
          const subjectName = meetingSubjectName(meeting, {
            people,
            teams,
            managers,
          });
          return {
            meeting,
            title: meetingTitle(meeting, subjectName),
            name: meeting.name?.trim() || subjectName || "Meeting",
            readiness: readinessOf(meeting, { meetings, sessions, topics }),
          };
        })
        .sort(
          (x, y) =>
            (x.readiness.nextDate ?? "9999").localeCompare(
              y.readiness.nextDate ?? "9999"
            ) || x.title.localeCompare(y.title)
        ),
    [meetings, sessions, topics, people, teams, managers]
  );
}
