/**
 * Readiness — am I prepared for the next occurrence of a meeting I've opted
 * into being ready for?
 *
 * Deliberately separate from `derive.ts`, which answers the *other* question:
 * "do I know them" (Depth — slow-moving, built from the profile). This file is
 * Prep — fast-moving, resets after every occurrence, and only matters relative
 * to when the next one lands.
 *
 * ── Why the meeting is the unit ───────────────────────────────────────────
 * A 1:1, a staff meeting, a practice session and a check-in with my boss all
 * prep the same way, so they're all `TrackedMeeting`s pointing at different
 * subjects. The same team can have a standing meeting *and* 1:1s with its
 * members; those are separate things to be ready for.
 *
 * ── Why rhythm and not a calendar ─────────────────────────────────────────
 * You don't book every meeting, but you do have a rhythm. The rhythm projects
 * the next date from the last one. An explicit `nextDate` always wins; the
 * projection is the fallback that makes this work with zero scheduling — which
 * is why `Readiness.projected` exists, so the UI can say "~Tue" not "Tue".
 *
 * ── Why opting in is the whole design ─────────────────────────────────────
 * Most relationships have no meeting to track, and a dashboard that can never
 * be clean gets ignored — taking the one real alarm with it. So nothing is
 * measured until you say so. The cost is that you could go green by opting out
 * of the hard things, which `triage()` answers: it counts only the subjects you
 * haven't *decided* about, and that count empties.
 */
import type {
  Action,
  Cadence,
  MeetingRhythm,
  MeetingSubjectKind,
  Session,
  TeamAction,
  TrackedMeeting,
} from "../types";

export type ReadinessState =
  /** Tracked, but nothing is expected and nothing is booked. No guilt. */
  | "dormant"
  /** Met recently, prep window hasn't opened. Nothing is owed. */
  | "resting"
  /** Window open, checklist clear. */
  | "ready"
  /** Window open, something's missing. */
  | "prep_due"
  /** It happened and was never written up. Paperwork debt. */
  | "loose_end"
  /** Past the rhythm (or the floor) with nothing next. Relationship debt. */
  | "drifting";

/** Worst-first. Roll-ups and sorting both read from this order. */
export const STATE_ORDER: ReadinessState[] = [
  "drifting",
  "loose_end",
  "prep_due",
  "ready",
  "resting",
  "dormant",
];

export const STATE_LABEL: Record<ReadinessState, string> = {
  dormant: "Dormant",
  resting: "Resting",
  ready: "Ready",
  prep_due: "Prep due",
  loose_end: "Loose end",
  drifting: "Drifting",
};

/** Canvas needs raw hex (inline styles on React Flow nodes). */
export const STATE_COLOR: Record<ReadinessState, string> = {
  dormant: "#d6d3d1",
  resting: "#a8a29e",
  ready: "#0e9f6e",
  prep_due: "#dd8f11",
  loose_end: "#cf4f45",
  drifting: "#cf4f45",
};

/** States that mean you owe something before you walk in. */
export function isBehind(state: ReadinessState): boolean {
  return state === "prep_due" || state === "loose_end" || state === "drifting";
}

export const CADENCE_DAYS: Record<Cadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
};

export const RHYTHM_LABEL: Record<MeetingRhythm, string> = {
  weekly: "Weekly",
  biweekly: "Every other week",
  monthly: "Monthly",
  quarterly: "Quarterly",
  as_needed: "As needed",
};

export const RHYTHM_OPTIONS: MeetingRhythm[] = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "as_needed",
];

/** Prep runway for an as-needed meeting, which has no rhythm to scale from. */
const AS_NEEDED_WINDOW_DAYS = 3;

/**
 * Agenda / commitment input, normalized so the engine doesn't care whether it
 * came from `Action` (person topics) or `TeamAction` (team next steps).
 */
export type AgendaItem = {
  id: string;
  text: string;
  done: boolean;
  dueDate?: string;
  /** Explicitly queued for the next occurrence. */
  queued: boolean;
};

/** What a failing check offers to do about itself. */
export type CheckFix =
  | "book" // log or schedule the next one
  | "writeUp" // open the specific session that has no notes
  | "agenda" // queue something to talk about
  | "commitments"; // deal with what's past due

export type Check = {
  id: "rhythm" | "writeUp" | "agenda" | "commitments";
  label: string;
  done: boolean;
  /** Shown when the check fails — the specific reason, not the generic rule. */
  detail?: string;
  fix: CheckFix;
  /** Session this check points at, when it points at one. */
  sessionId?: string;
};

export type Readiness = {
  state: ReadinessState;
  /** Explicit or projected date of the next occurrence. Null when unknowable. */
  nextDate: string | null;
  /** True when nextDate came from the rhythm rather than a booking. */
  projected: boolean;
  /** Negative = overdue. Null when nextDate is null. */
  daysUntil: number | null;
  /** ISO date of the most recent logged session. */
  lastMet: string | null;
  /** Days since the last session. Null when there's never been one. */
  daysSince: number | null;
  /** True once we're close enough that prep actually matters. */
  windowOpen: boolean;
  checks: Check[];
  /** One line for the card / panel header. */
  headline: string;
};

const DAY = 86_400_000;

function toUTC(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return new Date(toUTC(iso) + days * DAY).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY);
}

/**
 * How far ahead prep starts mattering. Two days minimum, longer for slower
 * rhythms — a monthly meeting deserves more than 48 hours of runway.
 */
export function prepWindowDays(rhythm: MeetingRhythm): number {
  if (rhythm === "as_needed") return AS_NEEDED_WINDOW_DAYS;
  return Math.max(2, Math.round(CADENCE_DAYS[rhythm] * 0.25));
}

/** Grace before "nothing next" becomes drifting, so a day late isn't red. */
function driftGraceDays(rhythm: MeetingRhythm, floorDays?: number): number | null {
  if (rhythm === "as_needed") return floorDays ?? null;
  return Math.round(CADENCE_DAYS[rhythm] * 1.5);
}

/** Short human form: "Tue · 2d", "~Tue · 5d", "3d late". */
export function formatCountdown(r: Readiness): string {
  if (r.daysUntil === null) {
    return r.daysSince === null ? "never met" : `${r.daysSince}d ago`;
  }
  if (r.daysUntil < 0) return `${Math.abs(r.daysUntil)}d late`;
  const weekday = new Date(toUTC(r.nextDate!)).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
  const when = r.daysUntil === 0 ? "today" : `${r.daysUntil}d`;
  return `${r.projected ? "~" : ""}${weekday} · ${when}`;
}

/** Sessions belonging to a meeting, oldest first. */
export function sessionsFor(meetingId: string, sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.meetingId === meetingId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The readiness read for one tracked meeting.
 *
 * `sessions` and `agenda` may be the full unfiltered collections for the
 * subject — this filters sessions by meeting itself.
 */
export function meetingReadiness(
  meeting: TrackedMeeting,
  sessions: Session[],
  agenda: AgendaItem[],
  today: string = todayISO()
): Readiness {
  const { rhythm } = meeting;
  const asNeeded = rhythm === "as_needed";
  const mine = sessionsFor(meeting.id, sessions);

  const past = mine.filter((s) => s.date <= today);
  const lastSession = past.length ? past[past.length - 1] : null;
  const lastMet = lastSession?.date ?? null;
  const daysSince = lastMet ? daysBetween(lastMet, today) : null;

  // A booking beats a projection. Take the latest `nextDate` on record so
  // editing an old session's "next" can't override a newer plan.
  const booked = [meeting.nextDate, ...mine.map((s) => s.nextDate)]
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const upcomingBooked = booked && booked >= today ? booked : null;
  // A session dated in the future is itself a booking.
  const scheduled = mine.find((s) => s.date > today)?.date ?? null;

  const explicit =
    scheduled && upcomingBooked
      ? scheduled < upcomingBooked
        ? scheduled
        : upcomingBooked
      : (scheduled ?? upcomingBooked);

  // As-needed makes no promise about a next date, so it projects nothing.
  const projectedDate =
    !asNeeded && lastMet ? addDays(lastMet, CADENCE_DAYS[rhythm]) : null;
  const nextDate = explicit ?? projectedDate;
  const projected = !explicit && Boolean(projectedDate);
  const daysUntil = nextDate ? daysBetween(today, nextDate) : null;

  const windowOpen =
    daysUntil !== null && daysUntil <= prepWindowDays(rhythm);

  // ── Checks ──────────────────────────────────────────────────────────────
  // A booking that came and went with nothing logged for it.
  const missed =
    booked && booked < today && (!lastMet || booked > lastMet) ? booked : null;

  const grace = driftGraceDays(rhythm, meeting.floorDays);
  const overdue =
    grace !== null && daysSince !== null && daysSince > grace;

  // Drifting needs evidence of a broken promise — a last meeting that has aged
  // out, or a booking that came and went. A meeting you just started tracking
  // has no history to be late against, so it sits dormant rather than greeting
  // you in red.
  const rhythmOnTrack = Boolean(explicit) || (!missed && !overdue);

  const writtenUp = !lastSession || Boolean(lastSession.notes?.trim());

  const open = agenda.filter((a) => !a.done);
  const queued = open.filter((a) => a.queued);
  const pastDue = open.filter((a) => a.dueDate && a.dueDate < today);

  const checks: Check[] = [
    {
      id: "rhythm",
      label: explicit
        ? "Next one booked"
        : asNeeded
          ? "Nothing overdue"
          : `${RHYTHM_LABEL[rhythm]} rhythm on track`,
      done: rhythmOnTrack,
      detail: missed
        ? `${missed} came and went unlogged`
        : overdue
          ? `${daysSince} days since the last one`
          : undefined,
      fix: "book",
    },
    {
      id: "writeUp",
      label: "Last one written up",
      done: writtenUp,
      detail: writtenUp ? undefined : `${lastSession!.date} has no notes`,
      fix: "writeUp",
      sessionId: lastSession?.id,
    },
    {
      id: "agenda",
      label: "Agenda has something",
      done: queued.length > 0,
      detail: queued.length > 0 ? undefined : "Nothing queued to talk about",
      fix: "agenda",
    },
    {
      id: "commitments",
      label: "No overdue commitments",
      done: pastDue.length === 0,
      detail:
        pastDue.length === 0
          ? undefined
          : `${pastDue.length} past due — ${pastDue[0].text}`,
      fix: "commitments",
    },
  ];

  // ── State ───────────────────────────────────────────────────────────────
  // Precedence is the opinion: not having met beats not having filed the
  // notes, and both beat an unfinished agenda.
  let state: ReadinessState;
  if (!rhythmOnTrack) state = "drifting";
  else if (!writtenUp) state = "loose_end";
  else if (daysUntil === null) state = "dormant";
  else if (!windowOpen) state = "resting";
  else if (checks.every((c) => c.done)) state = "ready";
  else state = "prep_due";

  const failing = checks.filter((c) => !c.done);
  const headline =
    state === "drifting"
      ? (checks[0].detail ?? "Nothing next on the books")
      : state === "loose_end"
        ? (checks[1].detail ?? "The last one was never written up")
        : state === "dormant"
          ? lastMet
            ? `Nothing booked — last met ${daysSince} days ago`
            : "Nothing booked yet"
          : state === "resting"
            ? `Nothing owed yet — next ${projected ? "one lands in about" : "in"} ${daysUntil} day${daysUntil === 1 ? "" : "s"}`
            : state === "ready"
              ? "Ready — show up"
              : failing.length === 1
                ? (failing[0].detail ?? failing[0].label)
                : `${failing.length} things before you sit down`;

  return {
    state,
    nextDate,
    projected,
    daysUntil,
    lastMet,
    daysSince,
    windowOpen,
    checks,
    headline,
  };
}

export type RollUp = {
  /** Worst state among tracked meetings — never an average. */
  state: ReadinessState | null;
  counts: Record<ReadinessState, number>;
  tracked: number;
  ready: number;
  behind: number;
};

/**
 * Roll a set of readings up to a card. Worst-of, deliberately: nine Readys and
 * one Drifting is not "90% ready", it's a group where someone is being dropped.
 */
export function rollUp(readings: Readiness[]): RollUp {
  const counts = Object.fromEntries(
    STATE_ORDER.map((s) => [s, 0])
  ) as Record<ReadinessState, number>;
  for (const r of readings) counts[r.state]++;

  return {
    state: STATE_ORDER.find((s) => counts[s] > 0) ?? null,
    counts,
    tracked: readings.length,
    ready: readings.filter((r) => !isBehind(r.state)).length,
    behind: readings.filter((r) => isBehind(r.state)).length,
  };
}

/** Segments for the distribution bar on a card, worst-first. */
export function distribution(
  roll: RollUp
): { state: ReadinessState; count: number; color: string }[] {
  return STATE_ORDER.filter((s) => roll.counts[s] > 0).map((s) => ({
    state: s,
    count: roll.counts[s],
    color: STATE_COLOR[s],
  }));
}

// ── Triage ────────────────────────────────────────────────────────────────

export type TriageState = "tracked" | "no_meeting" | "undecided";

/**
 * Where a subject sits on the opt-in question. "no_meeting" is a decision and
 * is never counted at you — only `undecided` is, and only until you decide.
 */
export function triageState(
  subject: { id: string; noMeeting?: boolean },
  meetings: TrackedMeeting[],
  kind: MeetingSubjectKind
): TriageState {
  if (meetings.some((m) => m.subjectKind === kind && m.subjectId === subject.id))
    return "tracked";
  return subject.noMeeting ? "no_meeting" : "undecided";
}

/** Person topics as agenda: only the "This 1:1" column counts as queued. */
export function personAgenda(actions: Action[], personId: string): AgendaItem[] {
  return actions
    .filter((a) => a.personId === personId)
    .map((a) => ({ ...a, queued: a.column === "this_1on1" }));
}

/**
 * Team next-steps as agenda. Teams have no topic board yet, so any open step
 * counts as something to talk about — swap to a column when they get one.
 */
export function teamAgenda(
  teamActions: TeamAction[],
  teamId: string
): AgendaItem[] {
  return teamActions
    .filter((a) => a.teamId === teamId)
    .map((a) => ({ ...a, queued: !a.done }));
}

/** Everything the engine needs, straight off the store. */
export type ReadinessData = {
  meetings: TrackedMeeting[];
  sessions: Session[];
  actions: Action[];
  teamActions: TeamAction[];
};

/**
 * Readiness for a subject, or null when it isn't tracked. The single entry
 * point every surface uses, so the agenda rules can't drift between them.
 */
export function readinessFor(
  kind: MeetingSubjectKind,
  subjectId: string,
  data: ReadinessData,
  today: string = todayISO()
): Readiness | null {
  const meeting = meetingFor(data.meetings, kind, subjectId);
  if (!meeting) return null;
  const agenda =
    kind === "team"
      ? teamAgenda(data.teamActions, subjectId)
      : personAgenda(data.actions, subjectId);
  return meetingReadiness(meeting, data.sessions, agenda, today);
}

/** The meeting tracked for a subject, if there is one. */
export function meetingFor(
  meetings: TrackedMeeting[],
  kind: MeetingSubjectKind,
  subjectId: string
): TrackedMeeting | undefined {
  return meetings.find(
    (m) => m.subjectKind === kind && m.subjectId === subjectId
  );
}
