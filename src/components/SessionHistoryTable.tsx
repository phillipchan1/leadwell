import { useMemo } from "react";
import { useStore } from "../store/useStore";
import {
  sessionStatus,
  sessionStatusLabel,
  sessionSummary,
} from "../lib/session";
import { topicsFor } from "../lib/topics";
import { daysBetween, todayISO } from "../lib/readiness";
import { cx } from "@/utils/cx";

const STATUS_CHIP: Record<string, string> = {
  scheduled: "bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300",
  needs_notes: "bg-cond-watch-soft text-cond-watch-ink",
  done: "bg-cond-thriving-soft text-cond-thriving-ink",
  elsewhere: "bg-secondary text-tertiary",
  skipped: "bg-secondary text-quaternary line-through",
};

function whenHint(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

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
    const summary = sessionSummary(row, 140);
    const count = topicCounts.get(row.id) ?? 0;
    const moved = row.kind !== "skipped" && row.seriesDate && row.seriesDate !== row.date;
    const meta = [
      whenHint(row.date, today),
      row.kind === "extra" ? "one-off" : null,
      moved ? `moved from ${fmt(row.seriesDate!, { weekday: "short" })}` : null,
      count ? `${count} topic${count === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return (
      <li key={row.id}>
        <button
          type="button"
          onClick={() => onOpen(row.id)}
          aria-label={`Open the write-up for ${fmt(row.date, { weekday: "long", month: "long", day: "numeric" })}`}
          className="flex w-full items-start gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
        >
          <span className="flex w-14 shrink-0 flex-col">
            <span className="font-mono text-[10.5px] text-quaternary">
              {fmt(row.date, { weekday: "short" }).toUpperCase()}
            </span>
            <span className="flex items-baseline gap-1">
              <span className="font-serif text-[22px] leading-7">{Number(row.date.slice(8, 10))}</span>
              <span className="text-[12px] text-tertiary">
                {fmt(row.date, {
                  month: "short",
                  year: row.date.slice(0, 4) === today.slice(0, 4) ? undefined : "2-digit",
                })}
              </span>
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
            {summary ? (
              <span className="line-clamp-2 font-serif text-[16px] leading-[22px] text-primary">
                {summary}
              </span>
            ) : (
              <span className="text-[13.5px] leading-[22px] text-quaternary">
                {status === "skipped" ? "Didn't happen." : "No notes yet."}
              </span>
            )}
            <span className="font-mono text-[10.5px] text-quaternary uppercase">{meta.join(" · ")}</span>
          </span>
          <span
            className={cx(
              "mt-1 inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-semibold",
              STATUS_CHIP[status]
            )}
          >
            {sessionStatusLabel(status)}
          </span>
        </button>
      </li>
    );
  };

  if (!rows.length) {
    return (
      <div className="flex flex-col items-start gap-1 rounded-[16px] border border-dashed border-primary px-6 py-8">
        <p className="font-serif text-[19px] text-secondary italic">Nothing written up yet.</p>
        <p className="text-[13px] text-tertiary">Open a week on the Plan board to write one up.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Looking back</h3>
          <ul className="divide-y divide-secondary overflow-hidden rounded-[16px] border border-secondary bg-primary">
            {past.map(renderRow)}
          </ul>
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Coming up</h3>
          <ul className="divide-y divide-secondary overflow-hidden rounded-[16px] border border-secondary bg-primary">
            {upcoming.map(renderRow)}
          </ul>
        </section>
      )}
    </div>
  );
}
