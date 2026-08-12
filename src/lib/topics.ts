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
import { addDays, daysBetween, sessionsFor, todayISO, projectFromLast, explicitNextDate, weekdayUTC } from "./readiness";

/** How many occurrences ahead the planner offers to scaffold into. */
export const SLOTS_AHEAD = 3;

/** How far back the Covered column reaches before it needs a "show all". */
export const COVERED_WINDOW_DAYS = 30;

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

/** Materialize a projected occurrence so notes and topics can attach to it. */
export function ensureSessionId(
  meetingId: string,
  slot: Slot,
  sessions: Session[],
  addSession: (o: Omit<Session, "id">) => string
): string {
  if (slot.sessionId) return slot.sessionId;
  const existing = sessions.find(
    (s) => s.meetingId === meetingId && s.date === slot.date
  );
  if (existing) return existing.id;
  return addSession({ meetingId, date: slot.date });
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

  const byDate = new Map<string, Slot>();

  for (const s of mine.filter((s) => s.date < today && openSlotted.has(s.id))) {
    byDate.set(s.date, {
      sessionId: s.id,
      date: s.date,
      projected: false,
      past: true,
    });
  }

  const booking = explicitNextDate(meeting, sessions, today);
  const lastPast = mine.filter((s) => s.date <= today).pop()?.date;
  const anchor = booking ?? lastPast ?? today;
  const target = meeting.rhythm === "as_needed" ? 1 : ahead;

  // Always scaffold the next N occurrences from the nearest anchor — never
  // from the furthest materialized session, or planning ahead would swallow
  // the near-term columns.
  let cursor = anchor;
  if (cursor < today) {
    cursor = projectFromLast(meeting, cursor);
    while (cursor <= today) cursor = projectFromLast(meeting, cursor);
  }

  for (let i = 0; i < target; i++) {
    if (i > 0) cursor = projectFromLast(meeting, cursor);
    const existing = mine.find((s) => s.date === cursor);
    byDate.set(cursor, {
      sessionId: existing?.id ?? byDate.get(cursor)?.sessionId ?? null,
      date: cursor,
      projected: !existing,
      past: cursor < today,
    });
  }

  // Any other future session — usually from planning further out — still
  // deserves its own column even when it falls beyond the runway.
  for (const s of mine.filter((s) => s.date >= today)) {
    byDate.set(s.date, {
      sessionId: s.id,
      date: s.date,
      projected: false,
      past: false,
    });
  }

  if (booking && !byDate.has(booking)) {
    const existing = mine.find((s) => s.date === booking);
    byDate.set(booking, {
      sessionId: existing?.id ?? null,
      date: booking,
      projected: !existing,
      past: false,
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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

function slotHint(slot: Slot, topics: Topic[], today: string): string {
  const openCount = topics.filter((t) => t.status === "open").length;
  if (slot.past) {
    if (openCount === 0) {
      return topics.length > 0 ? "all covered" : "";
    }
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
    .filter((t) => t.status !== "open" && !t.sessionId)
    .filter((t) => opts.allCovered || !t.closedOn || t.closedOn >= coveredCutoff)
    .sort((a, b) => (b.closedOn ?? "").localeCompare(a.closedOn ?? ""));

  const inLane = (lane: TopicLane) =>
    open.filter((t) => !t.sessionId && t.lane === lane);

  const slotColumns: BoardColumn[] = slots.map((slot) => {
    const inSlot = slot.sessionId
      ? mine.filter((t) => t.sessionId === slot.sessionId && t.status !== "dropped")
      : [];
    return {
      key: slotKey(slot),
      label: slotLabel(slot),
      hint: slotHint(slot, inSlot, today) || undefined,
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

// ── Calendar ──────────────────────────────────────────────────────────────

export type CalendarDay = {
  date: string;
  /** False for padding days from the previous/next month. */
  inMonth: boolean;
  slot?: Slot;
  topics: Topic[];
};

/** Last ISO date in a YYYY-MM month. */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const next =
    m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

/** Project occurrences forward until `through` is covered. */
export function slotsThrough(
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  through: string,
  today: string = todayISO()
): Slot[] {
  const slots = [...plannedSlots(meeting, sessions, topics, today, SLOTS_AHEAD)];
  const seen = new Set(slots.map((s) => s.date));

  while (true) {
    const last = slots[slots.length - 1]?.date;
    if (!last || last >= through) break;
    const next = projectFromLast(meeting, last);
    if (seen.has(next)) break;
    seen.add(next);
    slots.push({
      sessionId: null,
      date: next,
      projected: true,
      past: next < today,
    });
  }

  return slots.sort((a, b) => a.date.localeCompare(b.date));
}

/** Occurrences and slotted topics keyed by ISO date for one month. */
export function occurrencesInMonth(
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  month: string,
  today: string = todayISO()
): Map<string, { slot: Slot; topics: Topic[] }> {
  const start = `${month}-01`;
  const end = monthEnd(month);
  const slots = slotsThrough(meeting, sessions, topics, end, today);
  const mine = sessionsFor(meeting.id, sessions);
  const all = topicsFor(topics, meeting.id);
  const map = new Map<string, { slot: Slot; topics: Topic[] }>();

  for (const slot of slots) {
    if (slot.date < start || slot.date > end) continue;
    const inSlot = slot.sessionId
      ? all.filter((t) => t.sessionId === slot.sessionId && t.status !== "dropped")
      : [];
    map.set(slot.date, { slot, topics: inSlot });
  }

  for (const s of mine) {
    if (s.date < start || s.date > end || map.has(s.date)) continue;
    map.set(s.date, {
      slot: {
        sessionId: s.id,
        date: s.date,
        projected: false,
        past: s.date < today,
      },
      topics: all.filter((t) => t.sessionId === s.id && t.status !== "dropped"),
    });
  }

  return map;
}

/** Six-week grid (Sun–Sat) for a month, sharing the board's slot data. */
export function calendarGrid(
  month: string,
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  today: string = todayISO()
): CalendarDay[] {
  const start = `${month}-01`;
  const byDate = occurrencesInMonth(meeting, sessions, topics, month, today);

  let cursor = addDays(start, -weekdayUTC(start));
  const days: CalendarDay[] = [];

  for (let i = 0; i < 42; i++) {
    const entry = byDate.get(cursor);
    days.push({
      date: cursor,
      inMonth: cursor.startsWith(month),
      slot: entry?.slot,
      topics: entry?.topics ?? [],
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}
