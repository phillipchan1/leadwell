import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import { isBehind, readinessOf } from "@/lib/readiness";
import type { PlaceId } from "./places";

/**
 * The only numbers the sidebar shows: things waiting on you. Meetings counts
 * the ones you owe something before you walk in; Ideas counts topics that
 * haven't been given a meeting yet. Nothing else earns a badge — a count that
 * is always there stops being read.
 */
export function usePlaceBadges(): Partial<Record<PlaceId, number>> {
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);

  return useMemo(() => {
    const data = { meetings, sessions, topics };
    const behind = meetings.filter((m) => isBehind(readinessOf(m, data).state)).length;
    // The same pool the Ideas board counts as "All" — parked is set aside on
    // purpose, so it doesn't count as waiting.
    const waiting = topics.filter(
      (t) => !t.sessionId && t.status === "open" && t.lane !== "parked"
    ).length;
    return {
      meetings: behind || undefined,
      ideas: waiting || undefined,
    };
  }, [meetings, sessions, topics]);
}
