import { useMemo, useState } from "react";
import type { TrackedMeeting } from "../../types";
import { useStore } from "../../store/useStore";
import { arcSuggestion } from "../../lib/arcs";
import { todayISO } from "../../lib/readiness";
import { ArcSheet } from "./ArcSheet";
import { BookOpen01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/** "Not an arc", remembered per meeting in this browser only. */
const DISMISSED_KEY = "polarch.arcs.notArc";

function readDismissed(meetingId: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}") as Record<string, string[]>;
    return Array.isArray(all[meetingId]) ? all[meetingId] : [];
  } catch {
    return [];
  }
}

function writeDismissed(meetingId: string, titles: string[]) {
  try {
    const all = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}") as Record<string, string[]>;
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ...all, [meetingId]: titles }));
  } catch {
    // Private window or blocked storage: it just asks again next time.
  }
}

/**
 * The way into arcs when a meeting has none yet. If the board already shows
 * one being run by hand ("Crucial Conversations Pt 1", "… Part 2"), it says
 * so and offers to make it an arc; otherwise it's a quiet invitation.
 */
export function ArcStart({ meeting, variant }: { meeting: TrackedMeeting; variant: "board" | "agenda" }) {
  const topics = useStore((s) => s.topics);
  const sessions = useStore((s) => s.sessions);
  const arcs = useStore((s) => s.arcs);
  const [dismissed, setDismissed] = useState(() => readDismissed(meeting.id));
  const [sheet, setSheet] = useState<{ title?: string; startsOn?: string } | null>(null);

  const suggestion = useMemo(
    () => arcSuggestion(meeting.id, topics, sessions, arcs, todayISO(), dismissed),
    [meeting.id, topics, sessions, arcs, dismissed]
  );

  const notAnArc = (title: string) => {
    const next = [...dismissed, title];
    setDismissed(next);
    writeDismissed(meeting.id, next);
  };

  return (
    <>
      {suggestion ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-teal-200 bg-teal-50 px-3.5 py-2.5 dark:border-teal-900 dark:bg-teal-950/40">
          <BookOpen01 aria-hidden className="size-4 shrink-0 text-teal-700 dark:text-teal-400" />
          <p className="min-w-0 flex-1 text-[13.5px] text-secondary">
            <span className="font-serif font-semibold text-primary">{suggestion.title}</span> is on {suggestion.weeks}{" "}
            of your weeks. Make it an arc? Polarch keeps the chapters in order and it slides when you skip a week.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => notAnArc(suggestion.title)}
              className="text-[12.5px] font-semibold text-tertiary hover:text-secondary"
            >
              Not an arc
            </button>
            <button
              type="button"
              onClick={() => setSheet({ title: suggestion.title, startsOn: suggestion.startsOn })}
              className="h-8 rounded-[9px] bg-teal-600 px-3 text-[13px] font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950"
            >
              {suggestion.startsOn ? `Make it an arc from ${fmt(suggestion.startsOn)}` : "Make it an arc"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSheet({})}
          className={cx(
            "inline-flex items-center gap-1.5 text-[12.5px] font-semibold",
            variant === "agenda"
              ? "h-10 w-full justify-center rounded-[12px] border border-dashed border-primary text-tertiary hover:border-teal-300 hover:text-teal-700 dark:hover:text-teal-400"
              : "self-start text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
          )}
        >
          <BookOpen01 aria-hidden className="size-4" />
          Working through a book or a plan together? Start an arc
        </button>
      )}
      {sheet && <ArcSheet meeting={meeting} initial={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}
