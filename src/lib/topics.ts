/**
 * Topics — what there is to talk about, and which meeting it lands in.
 *
 * Deliberately separate from `readiness.ts`, which answers "am I prepared for
 * the next one". This file answers the question before that: *what are we
 * actually going to cover, and when*. Readiness reads the answer; it doesn't
 * produce it.
 *
 * ── Why slots and not columns ─────────────────────────────────────────────
 * The old board had one queue column, `this_1on1`, which could only ever mean
 * "the next one". That queues, it doesn't plan. A planner needs to say budget
 * on the 17th and hiring on the 24th, so the columns *are* the occurrences —
 * real sessions where they exist, projected from the rhythm where they don't.
 *
 * ── Why a projected slot isn't a session yet ──────────────────────────────
 * Materializing three months of empty sessions the moment you open a board
 * would fill the history with meetings that never happened and hand readiness
 * a booking you never made. So a projection stays a projection until you drop
 * something on it — the act of planning is what makes the occurrence real.
 *
 * ── Loose is derived, never stored ────────────────────────────────────────
 * A topic is loose when it's still open and the occurrence it sits in has
 * already passed. That's the failure this whole feature exists to prevent — a
 * subject assigned to a meeting and quietly never finished — and it's one
 * comparison against today, so storing it would only be a second copy that
 * goes stale overnight, every night.
 */
import type { Session, Topic, TopicLane, TrackedMeeting } from "../types";
import { CADENCE_DAYS, addDays, daysBetween, sessionsFor, todayISO } from "./readiness";

/** How many occurrences ahead the planner offers to scaffold into. */
export const SLOTS_AHEAD = 3;

/** How far back the Covered column reaches before it needs a "show all". */
export const COVERED_WINDOW_DAYS = 30;

/** Runway offered for an as-needed meeting, which has no rhythm to project. */
const AS_NEEDED_SLOT_DAYS = 14;

/** One occurrence on the planner — a real session, or a date we expect. */
export type Slot = {
  /** Null while it's still a projection nobody has planned into. */
  sessionId: string | null;
  date: string;
  /** True when the date came from the rhythm rather than a booking. */
  projected: boolean;
  /** It has already happened. Anything still open in here is loose. */
  past: boolean;
};

/**
 * A planner column. The key is what the drag engine hit-tests and what the
 * accessible "Move to…" select stores, so it has to survive a round trip
 * through a `<select value>` — hence strings, not objects.
 */
export type BoardColumn = {
  key: string;
  label: string;
  /** Second line: the countdown, or why the column is amber. */
  hint?: string;
  slot?: Slot;
  lane?: TopicLane;
  covered?: boolean;
  topics: Topic[];
};

export type ColumnTarget =
  | { kind: "lane"; lane: TopicLane }
  | { kind: "covered" }
  | { kind: "session"; sessionId: string }
  | { kind: "projected"; date: string };

// ── Keys ──────────────────────────────────────────────────────────────────

export function slotKey(slot: Slot): string {
  return slot.sessionId ? `s:${slot.sessionId}` : `p:${slot.date}`;
}

export function parseColumnKey(key: string): ColumnTarget {
  if (key.startsWith("s:")) return { kind: "session", sessionId: key.slice(2) };
  if (key.startsWith("p:")) return { kind: "projected", date: key.slice(2) };
  if (key === "covered") return { kind: "covered" };
  return { kind: "lane", lane: key === "parked" ? "parked" : "backlog" };
}

/** Which column a topic currently sits in. */
export function columnKeyOf(topic: Topic): string {
  if (topic.status !== "open") return "covered";
  if (topic.sessionId) return `s:${topic.sessionId}`;
  return topic.lane;
}

// ── Reads ─────────────────────────────────────────────────────────────────

export function topicsFor(topics: Topic[], meetingId: string): Topic[] {
  return topics
    .filter((t) => t.meetingId === meetingId)
    .sort((a, b) => a.order - b.order);
}

/** Open topics slotted into an occurrence that has already been and gone. */
export function looseTopics(
  topics: Topic[],
  sessions: Session[],
  meetingId: string,
  today: string = todayISO()
): Topic[] {
  const passed = new Set(
    sessions
      .filter((s) => s.meetingId === meetingId && s.date < today)
      .map((s) => s.id)
  );
  return topicsFor(topics, meetingId).filter(
    (t) => t.status === "open" && t.sessionId && passed.has(t.sessionId)
  );
}

/** Loose topics across every meeting, for the roll-ups. */
export function allLooseTopics(
  topics: Topic[],
  sessions: Session[],
  today: string = todayISO()
): Topic[] {
  const passed = new Set(
    sessions.filter((s) => s.date < today).map((s) => s.id)
  );
  return topics.filter(
    (t) => t.status === "open" && t.sessionId && passed.has(t.sessionId)
  );
}

/**
 * The occurrences this board plans into: any past one still holding something
 * unfinished, every future one on the books, then projections to fill out the
 * runway.
 *
 * A past occurrence with nothing open in it is deliberately absent — the board
 * is for what's ahead, and history lives in the write-ups.
 */
export function plannedSlots(
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  today: string = todayISO(),
  ahead: number = SLOTS_AHEAD
): Slot[] {
  const mine = sessionsFor(meeting.id, sessions);
  const openSlotted = new Set(
    topicsFor(topics, meeting.id)
      .filter((t) => t.status === "open" && t.sessionId)
      .map((t) => t.sessionId as string)
  );

  const slots: Slot[] = [
    ...mine
      .filter((s) => s.date < today && openSlotted.has(s.id))
      .map((s) => ({ sessionId: s.id, date: s.date, projected: false, past: true })),
    ...mine
      .filter((s) => s.date >= today)
      .map((s) => ({ sessionId: s.id, date: s.date, projected: false, past: false })),
  ];

  // Project forward from whatever we last know about, so the runway continues
  // the rhythm rather than restarting it at today.
  const upcoming = slots.filter((s) => !s.past);
  const lastKnown =
    upcoming[upcoming.length - 1]?.date ??
    mine.filter((s) => s.date <= today).pop()?.date ??
    today;

  const step =
    meeting.rhythm === "as_needed"
      ? (meeting.floorDays ?? AS_NEEDED_SLOT_DAYS)
      : CADENCE_DAYS[meeting.rhythm];

  // As-needed makes no promise about a next date, so it offers one slot to
  // plan into rather than a runway of dates it can't stand behind.
  const target = meeting.rhythm === "as_needed" ? 1 : ahead;

  let cursor = lastKnown;
  while (slots.filter((s) => !s.past).length < target) {
    cursor = addDays(cursor, step);
    // A rhythm anchored on an old meeting can project into the past; walk it
    // up to somewhere you could actually plan for.
    while (cursor <= today) cursor = addDays(cursor, step);
    slots.push({ sessionId: null, date: cursor, projected: true, past: false });
  }

  return slots.sort((a, b) => a.date.localeCompare(b.date));
}

/** The next occurrence a topic can be pushed into, after the one it's in. */
export function nextSlotAfter(slots: Slot[], sessionId?: string): Slot | null {
  const upcoming = slots.filter((s) => !s.past);
  if (!sessionId) return upcoming[0] ?? null;
  const from = slots.find((s) => s.sessionId === sessionId);
  if (!from) return upcoming[0] ?? null;
  return upcoming.find((s) => s.date > from.date) ?? null;
}

// ── The board ─────────────────────────────────────────────────────────────

/** Short slot heading: "Tue Mar 17", with the `~` readiness already uses. */
export function slotLabel(slot: Slot): string {
  const label = new Date(`${slot.date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return slot.projected ? `~${label}` : label;
}

function slotHint(slot: Slot, openCount: number, today: string): string {
  if (slot.past) {
    return openCount === 1 ? "1 not covered" : `${openCount} not covered`;
  }
  const days = daysBetween(today, slot.date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * The full strip, left to right: the running list, the occurrences, the
 * someday pile, then what's been covered.
 *
 * Covered sits on the board rather than in a drawer because dragging a card
 * into it is how you say "we talked about it" — the gesture only exists if the
 * target does.
 */
export function boardColumns(
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  today: string = todayISO(),
  opts: { ahead?: number; allCovered?: boolean } = {}
): BoardColumn[] {
  const mine = topicsFor(topics, meeting.id);
  const slots = plannedSlots(meeting, sessions, topics, today, opts.ahead);
  const open = mine.filter((t) => t.status === "open");

  const coveredCutoff = addDays(today, -COVERED_WINDOW_DAYS);
  const covered = mine
    .filter((t) => t.status !== "open")
    .filter((t) => opts.allCovered || !t.closedOn || t.closedOn >= coveredCutoff)
    .sort((a, b) => (b.closedOn ?? "").localeCompare(a.closedOn ?? ""));

  const inLane = (lane: TopicLane) =>
    open.filter((t) => !t.sessionId && t.lane === lane);

  const slotColumns: BoardColumn[] = slots.map((slot) => {
    const inSlot = slot.sessionId
      ? open.filter((t) => t.sessionId === slot.sessionId)
      : [];
    return {
      key: slotKey(slot),
      label: slotLabel(slot),
      hint: slotHint(slot, inSlot.length, today),
      slot,
      topics: inSlot,
    };
  });

  return [
    { key: "backlog", label: "Backlog", lane: "backlog", topics: inLane("backlog") },
    ...slotColumns,
    { key: "parked", label: "Parked", lane: "parked", topics: inLane("parked") },
    {
      key: "covered",
      label: "Covered",
      hint: opts.allCovered ? undefined : "last 30 days",
      covered: true,
      topics: covered,
    },
  ];
}
