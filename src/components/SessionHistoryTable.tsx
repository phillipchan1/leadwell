import { useMemo } from "react";
import { useStore } from "../store/useStore";
import {
  sessionStatus,
  sessionStatusLabel,
  sessionSummary,
} from "../lib/session";
import { topicsFor } from "../lib/topics";
import { daysBetween, todayISO } from "../lib/readiness";
import { Badge } from "@/components/base/badges/badges";
import { tableRowActivationProps } from "@/lib/rowActivation";

const STATUS_COLOR: Record<string, "sky" | "warning" | "success" | "gray"> = {
  scheduled: "sky",
  needs_notes: "warning",
  done: "success",
  elsewhere: "gray",
  skipped: "gray",
};

function whenHint(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}

/**
 * Every logged occurrence — past, today, and upcoming. Click a row to open
 * the write-up; planning still lives on the week columns in Plan.
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
        .filter((s) => s.meetingId === meetingId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, meetingId]
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

  // Looking back first, newest on top. Upcoming weeks belong to planning, but
  // stay reachable here (a skipped week is only restorable from its row).
  const past = rows.filter((r) => r.date <= today);
  const upcoming = rows.filter((r) => r.date > today).reverse();

  const renderRow = (row: (typeof rows)[number]) => {
            const status = sessionStatus(row, notesElsewhere, today);
            const summary = sessionSummary(row);
            const count = topicCounts.get(row.id) ?? 0;
            return (
              <tr
                key={row.id}
                {...tableRowActivationProps(() => onOpen(row.id), {
                  label: `Open the write-up for ${row.date}`,
                })}
                className="cursor-pointer transition-colors hover:bg-secondary focus-visible:bg-secondary"
              >
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-secondary">
                  {new Date(`${row.date}T00:00:00Z`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: row.date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
                    timeZone: "UTC",
                  })}
                  <span className="ml-1.5 text-quaternary">
                    {whenHint(row.date, today)}
                  </span>
                  {row.kind === "extra" && (
                    <span className="ml-1.5 text-brand-secondary">· One-off</span>
                  )}
                  {row.kind !== "skipped" && row.seriesDate && row.seriesDate !== row.date && (
                    <span className="ml-1.5 text-brand-secondary">
                      · moved from{" "}
                      {new Date(`${row.seriesDate}T00:00:00Z`).toLocaleDateString(undefined, {
                        weekday: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Badge size="sm" color={STATUS_COLOR[status]}>
                    {sessionStatusLabel(status)}
                  </Badge>
                </td>
                <td className="hidden max-w-[14rem] truncate px-3 py-2.5 text-tertiary sm:table-cell">
                  {summary || (
                    <span className="text-quaternary">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-quaternary">
                  {count || "—"}
                </td>
              </tr>
            );
  };

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
          <tr className="border-b border-secondary bg-secondary text-xs font-medium text-quaternary">
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="hidden px-3 py-2 font-semibold sm:table-cell">
              Summary
            </th>
            <th className="px-3 py-2 text-right font-semibold">Topics</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary">
          {past.map(renderRow)}
          {upcoming.length > 0 && (
            <tr className="bg-secondary">
              <td colSpan={4} className="px-3 py-1.5 text-xs font-medium text-quaternary">
                Coming up
              </td>
            </tr>
          )}
          {upcoming.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}
