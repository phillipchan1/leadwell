/**
 * Readiness — am I prepared for the next time I sit down with this person?
 *
 * Deliberately separate from `derive.ts`, which answers the *other* question:
 * "do I know them" (Depth — slow-moving, built from the profile). This file is
 * Prep — fast-moving, resets after every meeting, and only matters relative to
 * when the next one lands.
 *
 * MVP: one signal, the 1:1. The shape here (states → checks → roll-up) is the
 * plumbing every later signal plugs into — team meetings, lead-up check-ins.
 *
 * ── Why cadence and not a calendar ────────────────────────────────────────
 * You don't book every 1:1, but you do have a rhythm: weekly with some people,
 * every other week with others. So a person's cadence *projects* the next date
 * from the last one. An explicitly booked `nextDate` always wins; the
 * projection is the fallback that makes this work with zero scheduling. That's
 * why `Readiness.projected` exists — the UI says "~Tue" rather than "Tue" when
 * the date was inferred.
 */
import type { Action, Cadence, OneOnOne, Person } from "../types";

export type ReadinessState =
  /** No 1:1 rhythm set — this person isn't measured yet. */
  | "unset"
  /** Deliberately no 1:1s (large volunteer teams). Excluded from roll-ups. */
  | "paused"
  /** Met recently, prep window hasn't opened. Nothing is owed. */
  | "resting"
  /** Window open, checklist clear. */
  | "ready"
  /** Window open, something's missing. */
  | "prep_due"
  /** A meeting happened and was never written up. Paperwork debt. */
  | "loose_end"
  /** Past cadence with nothing next. Relationship debt — outranks the rest. */
  | "drifting";

/** Worst-first. Roll-ups and sorting both read from this order. */
export const STATE_ORDER: ReadinessState[] = [
  "drifting",
  "loose_end",
  "prep_due",
  "ready",
  "resting",
  "unset",
  "paused",
];

export const STATE_LABEL: Record<ReadinessState, string> = {
  unset: "No rhythm set",
  paused: "Paused",
  resting: "Resting",
  ready: "Ready",
  prep_due: "Prep due",
  loose_end: "Loose end",
  drifting: "Drifting",
};

/** Canvas needs raw hex (inline styles on React Flow nodes). */
export const STATE_COLOR: Record<ReadinessState, string> = {
  unset: "#d6d3d1",
  paused: "#d6d3d1",
  resting: "#a8a29e",
  ready: "#0e9f6e",
  prep_due: "#dd8f11",
  loose_end: "#cf4f45",
  drifting: "#cf4f45",
};

/** States that mean "you owe this person something before you meet". */
export function isBehind(state: ReadinessState): boolean {
  return state === "prep_due" || state === "loose_end" || state === "drifting";
}

/** States that count toward the "N of M ready" roll-up. */
export function isTracked(state: ReadinessState): boolean {
  return state !== "unset" && state !== "paused";
}

export const CADENCE_DAYS: Record<Exclude<Cadence, "none">, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
};

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every other week",
  monthly: "Monthly",
  quarterly: "Quarterly",
  none: "No 1:1s",
};

export const CADENCE_OPTIONS: Cadence[] = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "none",
];

/** What a failing check offers to do about itself. */
export type CheckFix =
  | "book" // open the 1:1s tab to log / schedule
  | "writeUp" // open the specific meeting that has no notes
  | "agenda" // open the topic board
  | "commitments"; // open the topic board, overdue items

export type Check = {
  id: "rhythm" | "writeUp" | "agenda" | "commitments";
  label: string;
  done: boolean;
  /** Shown when the check fails — the specific reason, not the generic rule. */
  detail?: string;
  fix: CheckFix;
  /** Meeting this check points at, when it points at one. */
  meetingId?: string;
};

export type Readiness = {
  state: ReadinessState;
  /** Explicit or projected date of the next 1:1 (ISO). Null when unknowable. */
  nextDate: string | null;
  /** True when nextDate came from cadence rather than a booked date. */
  projected: boolean;
  /** Negative = overdue. Null when nextDate is null. */
  daysUntil: number | null;
  /** ISO date of the most recent logged 1:1. */
  lastMet: string | null;
  /** Days since the last 1:1. Null when there's never been one. */
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
export function prepWindowDays(cadenceDays: number): number {
  return Math.max(2, Math.round(cadenceDays * 0.25));
}

/** Grace before "no next meeting" becomes drifting, so a day late isn't red. */
function driftGraceDays(cadenceDays: number): number {
  return Math.round(cadenceDays * 1.5);
}

/** Short human form: "Tue · 2d", "~Tue · 5d", "3d late". */
export function formatCountdown(r: Readiness): string {
  if (r.state === "unset") return "set rhythm";
  if (r.state === "paused") return "paused";
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

function emptyReadiness(state: ReadinessState, headline: string): Readiness {
  return {
    state,
    nextDate: null,
    projected: false,
    daysUntil: null,
    lastMet: null,
    daysSince: null,
    windowOpen: false,
    checks: [],
    headline,
  };
}

/**
 * The whole 1:1 readiness read for one person.
 *
 * `oneOnOnes` and `actions` may be the full unfiltered collections — this
 * filters by person itself so callers can map over people without pre-slicing.
 */
export function personReadiness(
  person: Person,
  oneOnOnes: OneOnOne[],
  actions: Action[],
  today: string = todayISO()
): Readiness {
  const cadence = person.cadence;
  if (!cadence) return emptyReadiness("unset", "No 1:1 rhythm set yet");
  if (cadence === "none") return emptyReadiness("paused", "No 1:1s with them");

  const cadenceDays = CADENCE_DAYS[cadence];
  const mine = oneOnOnes
    .filter((o) => o.personId === person.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = mine.filter((o) => o.date <= today);
  const lastMeeting = past.length ? past[past.length - 1] : null;
  const lastMet = lastMeeting?.date ?? null;
  const daysSince = lastMet ? daysBetween(lastMet, today) : null;

  // A booked date beats a projected one. Take the latest booked date on record
  // so editing an old meeting's "next" doesn't override a newer plan.
  const booked = mine
    .map((o) => o.nextDate)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const upcomingBooked = booked && booked >= today ? booked : null;
  // A meeting record dated in the future is itself a booking.
  const scheduled = mine.find((o) => o.date > today)?.date ?? null;

  const explicit =
    scheduled && upcomingBooked
      ? scheduled < upcomingBooked
        ? scheduled
        : upcomingBooked
      : (scheduled ?? upcomingBooked);

  const projectedDate = lastMet ? addDays(lastMet, cadenceDays) : null;
  const nextDate = explicit ?? projectedDate;
  const projected = !explicit && Boolean(projectedDate);
  const daysUntil = nextDate ? daysBetween(today, nextDate) : null;

  const windowOpen =
    daysUntil !== null && daysUntil <= prepWindowDays(cadenceDays);

  // ── Checks ──────────────────────────────────────────────────────────────
  // A booked date that has come and gone with no meeting logged for it.
  const missed =
    booked && booked < today && (!lastMet || booked > lastMet) ? booked : null;

  const rhythmOnTrack =
    lastMet !== null &&
    !missed &&
    (Boolean(explicit) || daysSince! <= driftGraceDays(cadenceDays));

  const writtenUp = !lastMeeting || Boolean(lastMeeting.notes?.trim());

  const myActions = actions.filter((a) => a.personId === person.id && !a.done);
  const agenda = myActions.filter((a) => a.column === "this_1on1");
  const overdue = myActions.filter((a) => a.dueDate && a.dueDate < today);

  const checks: Check[] = [
    {
      id: "rhythm",
      label: explicit ? "Next 1:1 booked" : `${CADENCE_LABEL[cadence]} rhythm on track`,
      done: rhythmOnTrack,
      detail: !lastMet
        ? "No 1:1 logged yet"
        : missed
          ? `1:1 on ${missed} was never logged`
          : daysSince !== null && daysSince > driftGraceDays(cadenceDays)
            ? `${daysSince} days since the last one`
            : undefined,
      fix: "book",
    },
    {
      id: "writeUp",
      label: "Last 1:1 written up",
      done: writtenUp,
      detail: writtenUp ? undefined : `${lastMeeting!.date} has no notes`,
      fix: "writeUp",
      meetingId: lastMeeting?.id,
    },
    {
      id: "agenda",
      label: "Agenda has topics",
      done: agenda.length > 0,
      detail: agenda.length > 0 ? undefined : "Nothing queued for this 1:1",
      fix: "agenda",
    },
    {
      id: "commitments",
      label: "No overdue commitments",
      done: overdue.length === 0,
      detail:
        overdue.length === 0
          ? undefined
          : `${overdue.length} past due — ${overdue[0].text}`,
      fix: "commitments",
    },
  ];

  // ── State ───────────────────────────────────────────────────────────────
  // Precedence is the opinion: not having seen a human beats not having filed
  // the notes, and both beat an unfinished agenda.
  let state: ReadinessState;
  if (!rhythmOnTrack) state = "drifting";
  else if (!writtenUp) state = "loose_end";
  else if (!windowOpen) state = "resting";
  else if (checks.every((c) => c.done)) state = "ready";
  else state = "prep_due";

  const open = checks.filter((c) => !c.done);
  const headline =
    state === "drifting"
      ? (checks[0].detail ?? "No next 1:1 in the rhythm")
      : state === "loose_end"
        ? (checks[1].detail ?? "Last 1:1 was never written up")
        : state === "resting"
          ? `Nothing owed yet — next ${projected ? "one lands in about" : "in"} ${daysUntil} day${daysUntil === 1 ? "" : "s"}`
          : state === "ready"
            ? "Ready — show up"
            : open.length === 1
              ? (open[0].detail ?? open[0].label)
              : `${open.length} things before you sit down`;

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
  /** Worst state among tracked members — never an average. */
  state: ReadinessState;
  /** Members per state, tracked and untracked alike. */
  counts: Record<ReadinessState, number>;
  tracked: number;
  ready: number;
  behind: number;
};

/**
 * Roll a set of readings up to a card. Worst-of, deliberately: nine Readys and
 * one Drifting is not "90% ready", it's a team where someone is being dropped.
 */
export function rollUp(readings: Readiness[]): RollUp {
  const counts = Object.fromEntries(
    STATE_ORDER.map((s) => [s, 0])
  ) as Record<ReadinessState, number>;
  for (const r of readings) counts[r.state]++;

  const tracked = readings.filter((r) => isTracked(r.state));
  const worst =
    STATE_ORDER.find((s) => isTracked(s) && counts[s] > 0) ??
    (counts.paused > 0 ? "paused" : "unset");

  return {
    state: worst,
    counts,
    tracked: tracked.length,
    ready: tracked.filter((r) => r.state === "ready" || r.state === "resting")
      .length,
    behind: tracked.filter((r) => isBehind(r.state)).length,
  };
}

/** Segments for the distribution bar on a card, worst-first. */
export function distribution(
  roll: RollUp
): { state: ReadinessState; count: number; color: string }[] {
  return STATE_ORDER.filter((s) => isTracked(s) && roll.counts[s] > 0).map(
    (s) => ({ state: s, count: roll.counts[s], color: STATE_COLOR[s] })
  );
}
