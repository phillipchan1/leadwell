import type { FollowUp, Session, Topic, TrackedMeeting } from "../types";
import { addDays, sessionsFor, todayISO, weekdayUTC } from "./readiness";
import { slotsThrough, topicsFor, type Slot } from "./topics";

/**
 * Every meeting, across one stretch of the calendar.
 *
 * The planner answers "what's on this meeting" one meeting at a time, which is
 * the right shape for building an agenda and the wrong one for running a week.
 * A leader with nine standing meetings doesn't plan Monday's staff meeting and
 * then go looking for Tuesday's 1:1 — they sit down once and ask *what's this
 * week, and am I ready for all of it*. That's this module: the same slots the
 * board draws, gathered by date instead of by meeting.
 */

/** One meeting landing on one day. */
export type Occurrence = {
  meeting: TrackedMeeting;
  slot: Slot;
  /** Planned for this occurrence, in running order. Dropped topics excluded. */
  topics: Topic[];
  /** This week isn't happening — kept so the gap reads as a decision. */
  skipped: boolean;
};

/** Monday on or before `iso`. Weeks run Mon–Sun so Sunday closes the week it serves. */
export function weekStart(iso: string): string {
  const dow = weekdayUTC(iso);
  return addDays(iso, -((dow + 6) % 7));
}

/** Occurrences of one meeting between two dates, inclusive. */
export function occurrencesBetween(
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  start: string,
  end: string,
  today: string = todayISO()
): Occurrence[] {
  const mine = sessionsFor(meeting.id, sessions);
  const all = topicsFor(topics, meeting.id);
  const byDate = new Map<string, Occurrence>();

  const topicsIn = (sessionId: string | null) =>
    sessionId
      ? all.filter((t) => t.sessionId === sessionId && t.status !== "dropped")
      : [];

  // What's on the books wins: held, booked, moved, one-off — or skipped.
  for (const s of mine) {
    if (s.date < start || s.date > end) continue;
    const skipped = s.kind === "skipped";
    // A skipped week and a real meeting on the same day: the meeting wins.
    if (skipped && byDate.has(s.date)) continue;
    byDate.set(s.date, {
      meeting,
      slot: { sessionId: s.id, date: s.date, projected: false, past: s.date < today },
      topics: skipped ? [] : topicsIn(s.id),
      skipped,
    });
  }

  /*
   * Then the rhythm fills in what nobody has booked yet. Only forward of the
   * last thing that really happened: a projection in the past is a guess about
   * a meeting that either happened unlogged or didn't — readiness already
   * says which, and a week view inventing it would argue with that.
   *
   * As-needed meetings promise nothing, so they only appear once booked.
   */
  if (meeting.rhythm !== "as_needed" && end >= today) {
    for (const slot of slotsThrough(meeting, sessions, topics, end, today)) {
      if (slot.date < start || slot.date > end) continue;
      if (slot.past || byDate.has(slot.date)) continue;
      byDate.set(slot.date, {
        meeting,
        slot,
        topics: topicsIn(slot.sessionId),
        skipped: false,
      });
    }
  } else if (meeting.nextDate && meeting.nextDate >= start && meeting.nextDate <= end) {
    if (!byDate.has(meeting.nextDate)) {
      byDate.set(meeting.nextDate, {
        meeting,
        slot: {
          sessionId: null,
          date: meeting.nextDate,
          projected: false,
          past: meeting.nextDate < today,
        },
        topics: [],
        skipped: false,
      });
    }
  }

  return [...byDate.values()].sort((a, b) => a.slot.date.localeCompare(b.slot.date));
}

/** Every meeting's occurrences in [start, end], by date then running order. */
export function occurrencesInRange(
  meetings: TrackedMeeting[],
  sessions: Session[],
  topics: Topic[],
  start: string,
  end: string,
  today: string = todayISO()
): Occurrence[] {
  return meetings
    .flatMap((m) => occurrencesBetween(m, sessions, topics, start, end, today))
    .sort(
      (a, b) =>
        a.slot.date.localeCompare(b.slot.date) ||
        // Meetings I convene before ones I attend; then by name for stability.
        Number(a.meeting.role === "attend") - Number(b.meeting.role === "attend") ||
        (a.meeting.name ?? "").localeCompare(b.meeting.name ?? "")
    );
}

/** One day of the week view. Days with nothing on them are kept: a free day is information. */
export type WeekDay = { date: string; occurrences: Occurrence[] };

export function weekDays(occurrences: Occurrence[], start: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, occurrences: occurrences.filter((o) => o.slot.date === date) };
  });
}

/**
 * Commitments still open with whoever this meeting is with.
 *
 * Scoped to the subject, not the meeting: a promise made in a 1:1 still
 * matters at the quarterly review with the same person. One made in a
 * *different* meeting with that subject still shows — that's the point.
 */
export function openFollowUpsFor(
  followUps: FollowUp[],
  meeting: TrackedMeeting
): FollowUp[] {
  return followUps
    .filter(
      (f) =>
        f.status === "open" &&
        f.subjectKind === meeting.subjectKind &&
        f.subjectId === meeting.subjectId
    )
    .sort((a, b) => a.openedOn.localeCompare(b.openedOn) || a.order - b.order);
}

// ── Horizon ───────────────────────────────────────────────────────────────

/** One meeting's row across the horizon: what each week holds, if it meets. */
export type HorizonRow = {
  meeting: TrackedMeeting;
  /** One entry per week; empty when the meeting doesn't fall in that week. */
  weeks: Occurrence[][];
  /** Occurrences on the horizon, skipped ones excluded. */
  total: number;
  /** Of those, how many already have something planned. */
  planned: number;
};

export type Horizon = {
  /** Mondays, in order. */
  weeks: string[];
  rows: HorizonRow[];
  total: number;
  planned: number;
};

/**
 * The roadmap lens: every meeting against the next N weeks.
 *
 * The question it answers is how far out the plan actually goes. An agenda
 * built the morning of is a meeting that runs itself; one built six weeks
 * ahead is a meeting that's going somewhere. Empty future slots are the
 * signal — they're where the future hasn't been pulled forward yet.
 */
export function horizon(
  meetings: TrackedMeeting[],
  sessions: Session[],
  topics: Topic[],
  weeks: number,
  today: string = todayISO()
): Horizon {
  const first = weekStart(today);
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(first, i * 7));
  const end = addDays(first, weeks * 7 - 1);

  const rows = meetings
    .map<HorizonRow>((meeting) => {
      const occ = occurrencesBetween(meeting, sessions, topics, today, end, today);
      const byWeek = mondays.map((monday) =>
        occ.filter((o) => o.slot.date >= monday && o.slot.date <= addDays(monday, 6))
      );
      const live = occ.filter((o) => !o.skipped);
      return {
        meeting,
        weeks: byWeek,
        total: live.length,
        planned: live.filter((o) => o.topics.length > 0).length,
      };
    })
    .filter((r) => r.weeks.some((w) => w.length > 0));

  return {
    weeks: mondays,
    rows,
    total: rows.reduce((n, r) => n + r.total, 0),
    planned: rows.reduce((n, r) => n + r.planned, 0),
  };
}
