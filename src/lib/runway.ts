/**
 * Runway — how far ahead each meeting is already planned.
 *
 * Readiness asks "am I ready for the next one". This asks the leadership-block
 * question a week before that: across everything I run, which meetings are
 * planned a month out and which are living week to week? The answer is a
 * distance in time, not a count of topics, so a weekly 1:1 and a monthly
 * check-in can sit on the same axis and be compared at a glance.
 *
 * A week counts as planned the moment something is on it. How *much* is on it
 * (sections filled out of the standing agenda) is `fill`, drawn but not
 * counted: a staff meeting with only Prayer placed is planned, just thinly.
 *
 * Cover runs until the first upcoming occurrence with nothing on it. A gap in
 * week two caps the runway at week two even if week six is full — the empty
 * week is the one that will catch you.
 */
import type { Session, Topic, TrackedMeeting } from "../types";
import { addDays, daysBetween, todayISO, CADENCE_DAYS } from "./readiness.ts";
import { curriculumOf, effectiveSlotId, plannedSlots, topicsFor } from "./topics.ts";

/** Twelve weeks: a quarter, which is as far as anyone plans a standing meeting. */
export const RUNWAY_DAYS = 84;

/** Mapped onto the condition ramp: thriving, solid, watch, critical. */
export type RunwayLevel = "deep" | "steady" | "thin" | "bare" | "none";

export type RunwayMark = {
  date: string;
  /** Days from today, for placing the mark on the track. */
  offset: number;
  planned: boolean;
  /** Share of the standing agenda's sections with something in them, 0–1. */
  fill: number;
  /** The rhythm expects it; nothing has been booked or placed yet. */
  projected: boolean;
};

export type Runway = {
  /** Upcoming occurrences inside the horizon, soonest first. */
  marks: RunwayMark[];
  /** Consecutive planned occurrences, starting with the next one. */
  ahead: number;
  /** The last of those — "planned through Nov 18". */
  through: string | null;
  /** The first upcoming occurrence with nothing on it. */
  gap: string | null;
  /** Days of cover: today until the gap, or the whole horizon if there isn't one. */
  days: number;
  level: RunwayLevel;
  /** Open ideas filed to this meeting but not on a week yet. */
  waiting: number;
};

/**
 * Thresholds are days until the first empty meeting, so they read the same
 * for every rhythm: a monthly check-in with the next one planned is about as
 * covered as a weekly 1:1 with four.
 */
export function runwayLevel(days: number): Exclude<RunwayLevel, "none"> {
  if (days < 7) return "bare";
  if (days < 28) return "thin";
  if (days < 56) return "steady";
  return "deep";
}

export function runwayOf(
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  today: string = todayISO(),
  horizon: number = RUNWAY_DAYS
): Runway {
  const mine = topicsFor(topics, meeting.id);
  const waiting = mine.filter(
    (t) => t.status === "open" && !t.sessionId && t.lane === "backlog"
  ).length;

  // An as-needed meeting promises no next date, so there's nothing to be
  // planned ahead of.
  if (meeting.rhythm === "as_needed") {
    return { marks: [], ahead: 0, through: null, gap: null, days: 0, level: "none", waiting };
  }

  const end = addDays(today, horizon);
  const step = CADENCE_DAYS[meeting.rhythm];
  const slots = plannedSlots(
    meeting,
    sessions,
    topics,
    today,
    Math.ceil(horizon / step) + 1
  ).filter((s) => !s.past && s.date <= end);

  const curriculum = curriculumOf(meeting);
  const marks: RunwayMark[] = slots.map((slot) => {
    const inWeek = slot.sessionId
      ? mine.filter((t) => t.sessionId === slot.sessionId && t.status !== "dropped")
      : [];
    const fill = !inWeek.length
      ? 0
      : curriculum.length
        ? Math.max(
            // Something untagged still means the week isn't empty.
            1 / (curriculum.length + 1),
            curriculum.filter((c) =>
              inWeek.some((t) => effectiveSlotId(t, curriculum) === c.id)
            ).length / curriculum.length
          )
        : 1;
    return {
      date: slot.date,
      offset: daysBetween(today, slot.date),
      planned: inWeek.length > 0,
      fill,
      projected: slot.projected,
    };
  });

  const firstGap = marks.findIndex((m) => !m.planned);
  const ahead = firstGap === -1 ? marks.length : firstGap;
  const gap = firstGap === -1 ? null : marks[firstGap].date;
  const days = gap ? Math.max(0, daysBetween(today, gap)) : horizon;

  return {
    marks,
    ahead,
    through: ahead > 0 ? marks[ahead - 1].date : null,
    gap,
    days,
    level: marks.length ? runwayLevel(days) : "none",
    waiting,
  };
}

/**
 * "3 ahead", "none", "12+ ahead" — counted in meetings, because that's how a
 * leader says it. The track beside it carries the distance, and the level's
 * color carries whether that distance is enough for this rhythm.
 */
export function formatAhead(r: Runway): string {
  if (r.level === "none") return "—";
  if (r.ahead === 0) return "none";
  return r.gap ? `${r.ahead} ahead` : `${r.ahead}+ ahead`;
}
