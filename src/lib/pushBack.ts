import type { Session, Topic, TrackedMeeting } from "../types";
import { projectFromLast, todayISO } from "./readiness.ts";
import { plannedSlots, type Slot } from "./topics.ts";

/**
 * Push back: a week's agenda moves to the next meeting, and every later
 * week's moves along one too, in order. The same thing a skipped week does to
 * an arc, done for the items you placed by hand, so a missed or cut-short
 * meeting never means re-dragging a quarter's plan.
 *
 * Only open items move. What was covered stays where it happened.
 */

export type PushBackMove = {
  topicId: string;
  fromDate: string;
  toDate: string;
  /** The occurrence it lands in, or null when that week isn't booked yet. */
  toSessionId: string | null;
};

export type PushBackPlan = {
  moves: PushBackMove[];
  /** How many weeks had something to move. */
  weeks: number;
};

/** How far ahead to look: half a year of weekly meetings. */
const HORIZON = 26;

export function pushBackPlan(
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  fromDate: string,
  today: string = todayISO()
): PushBackPlan {
  const seq: Pick<Slot, "date" | "sessionId">[] = plannedSlots(meeting, sessions, topics, today, HORIZON)
    .filter((s) => s.date >= fromDate)
    .map((s) => ({ date: s.date, sessionId: s.sessionId }));
  if (seq[0]?.date !== fromDate) {
    const held = sessions.find((o) => o.meetingId === meeting.id && o.date === fromDate && o.kind !== "skipped");
    seq.unshift({ date: fromDate, sessionId: held?.id ?? null });
  }

  const openIn = (slot: Pick<Slot, "sessionId">) =>
    slot.sessionId
      ? topics.filter((t) => t.meetingId === meeting.id && t.sessionId === slot.sessionId && t.status === "open")
      : [];
  const loads = seq.map(openIn);
  const last = loads.reduce((k, items, i) => (items.length ? i : k), -1);
  if (last < 0) return { moves: [], weeks: 0 };

  // The last week with something in it needs a week after it to move into.
  while (seq.length <= last + 1) {
    seq.push({ date: projectFromLast(meeting, seq[seq.length - 1].date), sessionId: null });
  }

  const moves: PushBackMove[] = [];
  for (let i = 0; i <= last; i++) {
    for (const t of loads[i]) {
      moves.push({ topicId: t.id, fromDate: seq[i].date, toDate: seq[i + 1].date, toSessionId: seq[i + 1].sessionId });
    }
  }
  return { moves, weeks: loads.filter((l) => l.length).length };
}
