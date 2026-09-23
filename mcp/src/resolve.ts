/**
 * Turn what an agent says into what the document holds.
 *
 * Agents know "the staff meeting", "#prayer" and "Friday", not `k3v9x0q1`.
 * Every tool takes either, and fails with the candidates when a name is
 * ambiguous rather than guessing — a topic filed on the wrong meeting is worse
 * than a question.
 */
import type {
  CurriculumSlot,
  MeetingSubjectKind,
  Session,
  Tag,
  Topic,
  TrackedMeeting,
} from "../../src/types";
import type { PersistedData } from "../../src/lib/persist";
import { meetingLabelOf } from "../../src/lib/ops.js";
import { findTag } from "../../src/lib/ideas.js";
import { addDays, sessionsFor, todayISO, weekdayUTC } from "../../src/lib/readiness.js";
import { plannedSlots, type Slot } from "../../src/lib/topics.js";

type Doc = PersistedData;

const norm = (s: string) => s.trim().toLowerCase().replace(/^[#@]/, "");

function pick<T>(
  what: string,
  query: string,
  pool: T[],
  idOf: (x: T) => string,
  nameOf: (x: T) => string
): T {
  const q = norm(query);
  const byId = pool.find((x) => idOf(x) === query.trim());
  if (byId) return byId;
  const exact = pool.filter((x) => norm(nameOf(x)) === q);
  if (exact.length === 1) return exact[0];
  const loose = exact.length ? exact : pool.filter((x) => norm(nameOf(x)).includes(q));
  if (loose.length === 1) return loose[0];
  if (!loose.length) throw new Error(`No ${what} matches "${query}".`);
  throw new Error(
    `"${query}" matches several ${what}s: ${loose
      .slice(0, 8)
      .map((x) => `${nameOf(x)} (${idOf(x)})`)
      .join(", ")}. Pass the id.`
  );
}

export function meetingName(d: Doc, m: TrackedMeeting): string {
  return meetingLabelOf(d)(m) || m.id;
}

export function resolveMeeting(d: Doc, query: string): TrackedMeeting {
  return pick("meeting", query, d.meetings, (m) => m.id, (m) => meetingName(d, m));
}

export type Subject = { kind: MeetingSubjectKind; id: string; name: string };

/** A person, team or manager, by id or name. `kind` narrows the search. */
export function resolveSubject(
  d: Doc,
  query: string,
  kind?: MeetingSubjectKind
): Subject {
  const pool: Subject[] = [
    ...(!kind || kind === "person"
      ? d.people.map((p) => ({ kind: "person" as const, id: p.id, name: p.name }))
      : []),
    ...(!kind || kind === "team"
      ? d.teams.map((t) => ({ kind: "team" as const, id: t.id, name: t.name }))
      : []),
    ...(!kind || kind === "manager"
      ? d.managers.map((m) => ({ kind: "manager" as const, id: m.id, name: m.name }))
      : []),
  ];
  return pick(kind ?? "person, team or manager", query, pool, (s) => s.id, (s) => s.name);
}

export function resolveTopic(d: Doc, query: string): Topic {
  return pick("topic", query, d.topics, (t) => t.id, (t) => t.text);
}

export function resolveTag(d: Doc, query: string): Tag {
  const byId = d.tags.find((t) => t.id === query.trim());
  if (byId) return byId;
  const found = findTag(norm(query), d.tags);
  if (!found) throw new Error(`No tag matches "${query}".`);
  return found;
}

/** A row on a meeting's board (a curriculum slot), by id or label. */
export function resolveRow(meeting: TrackedMeeting, query: string): CurriculumSlot {
  return pick("row", query, meeting.curriculum ?? [], (c) => c.id, (c) => c.label);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function parseWeekday(value: string | number): number {
  if (typeof value === "number") {
    if (value >= 0 && value <= 6) return value;
    throw new Error("Weekday must be 0 (Sun) … 6 (Sat).");
  }
  const q = value.trim().toLowerCase();
  if (/^[0-6]$/.test(q)) return Number(q);
  const i = WEEKDAYS.findIndex((w) => w.startsWith(q.slice(0, 3)));
  if (i < 0) throw new Error(`Not a weekday: "${value}".`);
  return i;
}

/** YYYY-MM-DD, or today / tomorrow / yesterday / a weekday name (the next one, today included). */
export function parseDate(value: string, today: string = todayISO()): string {
  const q = value.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  if (q === "today") return today;
  if (q === "tomorrow") return addDays(today, 1);
  if (q === "yesterday") return addDays(today, -1);
  const i = WEEKDAYS.findIndex((w) => q.length >= 3 && w.startsWith(q.slice(0, 3)));
  if (i >= 0) {
    let d = today;
    while (weekdayUTC(d) !== i) d = addDays(d, 1);
    return d;
  }
  throw new Error(`Not a date: "${value}". Use YYYY-MM-DD.`);
}

/** The occurrences a meeting's planner draws, far enough out to plan a season. */
export function upcomingSlots(d: Doc, meeting: TrackedMeeting, ahead = 26): Slot[] {
  return plannedSlots(meeting, d.sessions, d.topics, todayISO(), ahead);
}

export type OccurrenceRef = {
  date: string;
  /** The real occurrence, when there is one. Null for a projection. */
  session: Session | null;
};

/**
 * One occurrence of a meeting, by session id, date, or "next" / "last".
 *
 * A date must be somewhere the planner would draw — an existing occurrence or
 * a projection from the rhythm. Filing onto a Thursday of a Friday meeting
 * would quietly create an off-rhythm meeting; that's what `add_extra_occurrence`
 * is for, and it should be a decision.
 */
export function resolveOccurrence(
  d: Doc,
  meeting: TrackedMeeting,
  query: string
): OccurrenceRef {
  const mine = sessionsFor(meeting.id, d.sessions);
  const byId = mine.find((s) => s.id === query.trim());
  if (byId) return { date: byId.date, session: byId };

  const q = query.trim().toLowerCase();
  const today = todayISO();
  const slots = upcomingSlots(d, meeting);
  if (q === "next") {
    const next = slots.find((s) => !s.past);
    if (!next) throw new Error(`${meetingName(d, meeting)} has no upcoming occurrence.`);
    return {
      date: next.date,
      session: next.sessionId ? (mine.find((s) => s.id === next.sessionId) ?? null) : null,
    };
  }
  if (q === "last") {
    const held = mine.filter((s) => s.kind !== "skipped" && s.date < today);
    const last = held[held.length - 1];
    if (!last) throw new Error(`${meetingName(d, meeting)} has no past occurrence.`);
    return { date: last.date, session: last };
  }

  const date = parseDate(query, today);
  const real = mine.find((s) => s.date === date && s.kind !== "skipped");
  if (real) return { date, session: real };
  if (slots.some((s) => s.date === date && !s.sessionId)) return { date, session: null };
  const skipped = mine.find((s) => s.date === date && s.kind === "skipped");
  if (skipped) {
    throw new Error(
      `${meetingName(d, meeting)} is skipped on ${date}. Use restore_occurrence first.`
    );
  }
  const nearby = slots
    .filter((s) => !s.past)
    .slice(0, 6)
    .map((s) => s.date)
    .join(", ");
  throw new Error(
    `${meetingName(d, meeting)} doesn't meet on ${date}. Upcoming: ${nearby || "none"}. ` +
      "Use add_extra_occurrence for a one-off or move_occurrence to shift one."
  );
}
