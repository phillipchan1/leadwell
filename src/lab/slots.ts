/**
 * Slot projection for the lab — mirrors topics.ts plannedSlots, without
 * coupling the prototype to live meeting types.
 */
import { LAB_TODAY } from "./fixtures";
import type { LabMeeting, LabSession, LabSlot, LabTopic } from "./types";

const STEP_DAYS: Record<LabMeeting["rhythm"], number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 28,
};

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function weekdayUTC(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function projectFromLast(meeting: LabMeeting, last: string): string {
  let next = addDays(last, STEP_DAYS[meeting.rhythm]);
  const target = meeting.anchorWeekday;
  const cur = weekdayUTC(next);
  const delta = (target - cur + 7) % 7;
  if (delta) next = addDays(next, delta);
  return next;
}

export function slotKey(slot: LabSlot): string {
  return slot.sessionId ? `s:${slot.sessionId}` : `p:${slot.date}`;
}

export function parseSlotKey(key: string): { sessionId?: string; date?: string } {
  if (key.startsWith("s:")) return { sessionId: key.slice(2) };
  if (key.startsWith("p:")) return { date: key.slice(2) };
  return {};
}

export function slotLabel(slot: LabSlot): string {
  const label = new Date(`${slot.date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return slot.projected ? `~${label}` : label;
}

export function slotHint(slot: LabSlot, today: string = LAB_TODAY): string {
  if (slot.past) return "past";
  const days = daysBetween(today, slot.date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function plannedSlots(
  meeting: LabMeeting,
  sessions: LabSession[],
  topics: LabTopic[],
  today: string = LAB_TODAY,
  ahead = 8
): LabSlot[] {
  const mine = sessions
    .filter((s) => s.meetingId === meeting.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const openSlotted = new Set(
    topics
      .filter(
        (t) =>
          t.meetingId === meeting.id && t.status === "open" && t.sessionId
      )
      .map((t) => t.sessionId as string)
  );

  const byDate = new Map<string, LabSlot>();

  for (const s of mine.filter((s) => s.date < today && openSlotted.has(s.id))) {
    byDate.set(s.date, {
      sessionId: s.id,
      date: s.date,
      projected: false,
      past: true,
    });
  }

  const lastPast = mine.filter((s) => s.date <= today).pop()?.date;
  let cursor = lastPast && lastPast >= today ? lastPast : today;
  if (cursor < today || (lastPast && lastPast < today)) {
    cursor = projectFromLast(meeting, lastPast ?? today);
    while (cursor <= today) cursor = projectFromLast(meeting, cursor);
  }
  // Prefer an existing session on/after today as the first column.
  const nextBooked = mine.find((s) => s.date >= today);
  if (nextBooked) cursor = nextBooked.date;

  for (let i = 0; i < ahead; i++) {
    if (i > 0) cursor = projectFromLast(meeting, cursor);
    const existing = mine.find((s) => s.date === cursor);
    byDate.set(cursor, {
      sessionId: existing?.id ?? byDate.get(cursor)?.sessionId ?? null,
      date: cursor,
      projected: !existing,
      past: cursor < today,
    });
  }

  for (const s of mine.filter((s) => s.date >= today)) {
    byDate.set(s.date, {
      sessionId: s.id,
      date: s.date,
      projected: false,
      past: false,
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Next upcoming slot after a given session (or the first upcoming). */
export function nextSlotAfter(
  slots: LabSlot[],
  sessionId?: string
): LabSlot | null {
  const upcoming = slots.filter((s) => !s.past);
  if (!sessionId) return upcoming[0] ?? null;
  const from = slots.find((s) => s.sessionId === sessionId);
  if (!from) return upcoming[0] ?? null;
  return upcoming.find((s) => s.date > from.date) ?? null;
}

/**
 * Apply automatic carry-over: open topics in past sessions attach to the next
 * occurrence. Mutates a copy of topics; returns the new list + whether anything
 * changed. Caller persists.
 */
export function applyCarryOver(
  meeting: LabMeeting,
  sessions: LabSession[],
  topics: LabTopic[],
  ensureSession: (date: string) => string,
  today: string = LAB_TODAY
): LabTopic[] {
  const slots = plannedSlots(meeting, sessions, topics, today);
  const mine = sessions.filter((s) => s.meetingId === meeting.id);
  let next = topics;

  for (const s of mine.filter((x) => x.date < today)) {
    const loose = next.filter(
      (t) =>
        t.meetingId === meeting.id &&
        t.status === "open" &&
        t.sessionId === s.id
    );
    if (!loose.length) continue;
    const dest = nextSlotAfter(slots, s.id);
    if (!dest) continue;
    const destId = dest.sessionId ?? ensureSession(dest.date);
    next = next.map((t) => {
      if (t.sessionId !== s.id || t.status !== "open") return t;
      if (t.sessionId === destId) return t;
      return {
        ...t,
        sessionId: destId,
        carried: t.carried + 1,
        carriedFrom: [...t.carriedFrom, s.id],
      };
    });
  }
  return next;
}

export type CoverageStat = {
  tagId: string;
  label: string;
  filled: number;
  total: number;
  everyN: number;
  thin: boolean;
};

export function coverageStats(
  meeting: LabMeeting,
  slots: LabSlot[],
  topics: LabTopic[],
  tags: { id: string; label: string }[]
): CoverageStat[] {
  const upcoming = slots.filter((s) => !s.past);
  const tagById = new Map(tags.map((t) => [t.id, t.label]));
  return meeting.coverageTargets.map((ct) => {
    const filled = upcoming.filter((slot) => {
      if (!slot.sessionId) return false;
      return topics.some(
        (t) =>
          t.sessionId === slot.sessionId &&
          t.status !== "dropped" &&
          t.tagIds.includes(ct.tagId)
      );
    }).length;
    const total = upcoming.length;
    const expectedMin =
      total === 0 ? 0 : Math.ceil(total / Math.max(1, ct.everyNOccurrences));
    return {
      tagId: ct.tagId,
      label: tagById.get(ct.tagId) ?? ct.tagId,
      filled,
      total,
      everyN: ct.everyNOccurrences,
      thin: filled < expectedMin,
    };
  });
}

/** Nearest upcoming slot per meeting — for the "up next" rail. */
export function upNextByMeeting(
  meetings: LabMeeting[],
  sessions: LabSession[],
  topics: LabTopic[],
  today: string = LAB_TODAY
): { meeting: LabMeeting; slot: LabSlot }[] {
  return meetings
    .map((meeting) => {
      const slots = plannedSlots(meeting, sessions, topics, today, 4);
      const next = slots.find((s) => !s.past);
      return next ? { meeting, slot: next } : null;
    })
    .filter((x): x is { meeting: LabMeeting; slot: LabSlot } => Boolean(x));
}

/**
 * Carry-back: an occurrence whose date has passed hands its unchecked topics
 * back to Ideas instead of silently pushing them a week forward.
 *
 * The forward-push (`applyCarryOver`) was tidy but dishonest — a topic could
 * ride four weeks without anyone deciding it should. Coming back to the inbox
 * forces the same decision the capture flow already asks for, and the session
 * keeps a `uncovered` ledger so the week it missed still reads truthfully.
 */
export function applyReturns(
  sessions: LabSession[],
  topics: LabTopic[],
  today: string
): { sessions: LabSession[]; topics: LabTopic[]; returned: LabTopic[] } {
  const past = sessions.filter((s) => s.date < today);
  if (!past.length) return { sessions, topics, returned: [] };

  const byId = new Map(past.map((s) => [s.id, s]));
  const returned: LabTopic[] = [];

  const nextTopics = topics.map((t) => {
    if (!t.sessionId || t.status !== "open") return t;
    const session = byId.get(t.sessionId);
    if (!session) return t;
    const moved: LabTopic = {
      ...t,
      sessionId: undefined,
      lastSectionId: t.sectionId,
      sectionId: undefined,
      lane: "backlog",
      carried: t.carried + 1,
      carriedFrom: [...t.carriedFrom, session.id],
      returnedOn: today,
      returnedFromDate: session.date,
    };
    returned.push(moved);
    return moved;
  });

  if (!returned.length) return { sessions, topics, returned: [] };

  const textsBySession = new Map<string, string[]>();
  for (const t of returned) {
    const from = t.carriedFrom[t.carriedFrom.length - 1];
    textsBySession.set(from, [...(textsBySession.get(from) ?? []), t.text]);
  }

  const nextSessions = sessions.map((s) => {
    const texts = textsBySession.get(s.id);
    if (!texts) return s;
    return {
      ...s,
      uncovered: [...new Set([...(s.uncovered ?? []), ...texts])],
    };
  });

  return { sessions: nextSessions, topics: nextTopics, returned };
}

/** Template bands for a meeting, plus the catch-all every column needs. */
export function sectionsOf(meeting: LabMeeting): { id: string; label: string; tagId?: string; minutes?: number }[] {
  return meeting.template;
}

/** Topics still unchecked in a session — what carry-back would take. */
export function unfinishedIn(topics: LabTopic[], sessionId: string): LabTopic[] {
  return topics.filter((t) => t.sessionId === sessionId && t.status === "open");
}
