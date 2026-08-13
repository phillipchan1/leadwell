import { useMemo } from "react";
import { useStore } from "../store/useStore";
import {
  sessionStatus,
  sessionStatusLabel,
  sessionSummary,
} from "../lib/session";
import { topicsFor } from "../lib/topics";
import { todayISO } from "../lib/readiness";
import { Badge } from "@/components/base/badges/badges";

const STATUS_COLOR: Record<string, "sky" | "warning" | "success" | "gray"> = {
  scheduled: "sky",
  needs_notes: "warning",
  done: "success",
  elsewhere: "gray",
};

/**
 * Past occurrences only — a read-first table. Click a row to open the
 * full write-up; planning and logging live on the week columns in Plan.
 */
export function SessionHistoryTable({
  meetingId,
  onOpen,
}: {
  meetingId: string;
  onOpen: (sessionId: string) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const meetings = useStore((s) => s.meetings);
  const topics = useStore((s) => s.topics);
  const meeting = meetings.find((m) => m.id === meetingId);
  const today = todayISO();
  const notesElsewhere = Boolean(meeting?.trackerUrl?.trim());

  const rows = useMemo(
    () =>
      sessions
        .filter((s) => s.meetingId === meetingId && s.date < today)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, meetingId, today]
  );

  const topicCounts = useMemo(() => {
    const mine = topicsFor(topics, meetingId);
    const map = new Map<string, number>();
    for (const t of mine) {
      if (!t.sessionId) continue;
      map.set(t.sessionId, (map.get(t.sessionId) ?? 0) + 1);
    }
    return map;
  }, [topics, meetingId]);

  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-primary px-4 py-8 text-center text-sm text-quaternary">
        Nothing logged yet. Open a week on the Plan board to write up a meeting.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-secondary">
      <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-secondary bg-secondary text-[10px] font-semibold tracking-wide text-quaternary uppercase">
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="hidden px-3 py-2 font-semibold sm:table-cell">
              Summary
            </th>
            <th className="px-3 py-2 text-right font-semibold">Topics</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
          {rows.map((row) => {
            const status = sessionStatus(row, notesElsewhere);
            const summary = sessionSummary(row);
            const count = topicCounts.get(row.id) ?? 0;
            return (
              <tr
                key={row.id}
                className="cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-stone-950/50"
                onClick={() => onOpen(row.id)}
              >
                <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-stone-600 dark:text-stone-300">
                  {row.date}
                </td>
                <td className="px-3 py-2.5">
                  <Badge size="sm" color={STATUS_COLOR[status]}>
                    {sessionStatusLabel(status)}
                  </Badge>
                </td>
                <td className="hidden max-w-[14rem] truncate px-3 py-2.5 text-tertiary sm:table-cell">
                  {summary || (
                    <span className="italic text-stone-400 dark:text-stone-500">
                      No notes
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-quaternary">
                  {count || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
