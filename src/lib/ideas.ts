/**
 * The unscheduled backlog: capture grammar, ordering, and carry-back.
 *
 * Everything here is pure. The store owns the mutation and the repo owns the
 * round trip; this file owns the decisions those two shouldn't be making.
 */
import type { Session, Tag, Topic, TrackedMeeting } from "../types";

// ── Capture grammar ───────────────────────────────────────────────────────
// `Rewrite the covenant #training @frontier !`
//
// Typing is the fastest input anyone has. Making someone leave the field to
// pick a tag from a menu is what turns a capture box into a box nobody uses.

export type CaptureParse = {
  text: string;
  tagLabels: string[];
  meetingQuery: string | null;
  urgent: boolean;
};

const TAG_RE = /#([\w][\w-]*)/g;
const MEETING_RE = /@([\w][\w-]*)/g;

export function parseCapture(raw: string): CaptureParse {
  const tagLabels: string[] = [];
  let meetingQuery: string | null = null;
  let urgent = false;

  let working = raw.trim();
  if (/(?:^|\s)!(?:\s|$)/.test(working) || working.endsWith("!")) {
    urgent = true;
    working = working.replace(/(?:^|\s)!(\s|$)/g, "$1").replace(/!$/, "").trim();
  }

  for (const m of working.matchAll(TAG_RE)) tagLabels.push(m[1].toLowerCase());
  working = working.replace(TAG_RE, " ").trim();

  const meetings = [...working.matchAll(MEETING_RE)];
  if (meetings.length) {
    meetingQuery = meetings[meetings.length - 1][1].toLowerCase();
  }
  working = working.replace(MEETING_RE, " ").replace(/\s+/g, " ").trim();

  return { text: working, tagLabels, meetingQuery, urgent };
}

/** A paste is many topics. One per non-empty line, grammar applied per line. */
export function splitCaptureLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function findTag(label: string, tags: Tag[]): Tag | undefined {
  const q = label.trim().toLowerCase();
  if (!q) return undefined;
  return (
    tags.find((t) => t.label.toLowerCase() === q) ??
    tags.find((t) => t.label.toLowerCase().startsWith(q))
  );
}

export function findMeeting(
  query: string,
  meetings: TrackedMeeting[],
  labelOf: (m: TrackedMeeting) => string
): TrackedMeeting | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return (
    meetings.find((m) => labelOf(m).toLowerCase() === q) ??
    meetings.find((m) => labelOf(m).toLowerCase().includes(q))
  );
}

// ── Ordering ──────────────────────────────────────────────────────────────

/**
 * The set a topic's `order` is compared within.
 *
 * Order used to be one counter per meeting, which was fine when a column was an
 * unordered pile. Once a cell is a running order the numbers have to be dense
 * and local, so they are renumbered per bucket on every drop — cheaper than a
 * fractional-index scheme the app doesn't need yet.
 */
export function bucketOf(t: Topic): string {
  if (t.sessionId) return `s:${t.sessionId}#${t.slotId ?? ""}`;
  if (t.lane === "parked") return `parked:${t.meetingId ?? "-"}`;
  return `backlog:${t.meetingId ?? "-"}#${t.slotId ?? ""}`;
}

/** Place `moved` at `index` within its bucket and renumber that bucket. */
export function reorderInto(
  topics: Topic[],
  moved: Topic,
  index?: number
): Topic[] {
  const bucket = bucketOf(moved);
  const peers = topics
    .filter((t) => t.id !== moved.id && bucketOf(t) === bucket)
    .sort((a, b) => a.order - b.order);
  const at = Math.max(0, Math.min(index ?? peers.length, peers.length));
  const ordered = [...peers.slice(0, at), moved, ...peers.slice(at)];
  const next = new Map(ordered.map((t, i) => [t.id, i]));
  return topics.map((t) => {
    if (t.id === moved.id) return { ...moved, order: next.get(t.id) ?? 0 };
    const o = next.get(t.id);
    return o === undefined ? t : { ...t, order: o };
  });
}

// ── Carry-back ────────────────────────────────────────────────────────────

/**
 * An occurrence whose date has passed hands its unchecked topics back to the
 * backlog, annotated — rather than silently pushing them a week forward.
 *
 * The forward push was tidy but dishonest: a topic could ride four occurrences
 * without anyone ever deciding it should. Coming back forces the same small
 * decision capture already asks for — this week, later, park it, or it was
 * never really a topic. The session keeps an `uncovered` ledger so the week it
 * missed still reads truthfully a year later.
 */
export function applyReturns(
  sessions: Session[],
  topics: Topic[],
  today: string
): { sessions: Session[]; topics: Topic[]; returned: Topic[] } | null {
  const past = new Map(
    sessions.filter((s) => s.date < today).map((s) => [s.id, s])
  );
  if (!past.size) return null;

  const returned: Topic[] = [];
  const nextTopics = topics.map((t) => {
    if (!t.sessionId || t.status !== "open") return t;
    const session = past.get(t.sessionId);
    if (!session) return t;
    const moved: Topic = {
      ...t,
      sessionId: undefined,
      lane: "backlog",
      carried: t.carried + 1,
      carriedFrom: [...t.carriedFrom, session.id],
      returnedOn: today,
      returnedFromDate: session.date,
    };
    returned.push(moved);
    return moved;
  });

  if (!returned.length) return null;

  const bySession = new Map<string, string[]>();
  for (const t of returned) {
    const from = t.carriedFrom[t.carriedFrom.length - 1];
    bySession.set(from, [...(bySession.get(from) ?? []), t.text]);
  }

  const nextSessions = sessions.map((s) => {
    const texts = bySession.get(s.id);
    if (!texts) return s;
    return { ...s, uncovered: [...new Set([...(s.uncovered ?? []), ...texts])] };
  });

  return { sessions: nextSessions, topics: nextTopics, returned };
}

// ── Coverage ──────────────────────────────────────────────────────────────

export type CoverageStat = {
  tagId: string;
  label: string;
  filled: number;
  total: number;
  everyN: number;
  /** Behind the intention — worth a nudge, never an error. */
  thin: boolean;
};

export function coverageStats(
  meeting: TrackedMeeting,
  upcomingSessionIds: (string | null)[],
  topics: Topic[],
  tags: Tag[]
): CoverageStat[] {
  const targets = meeting.coverageTargets ?? [];
  if (!targets.length) return [];
  const labelOf = new Map(tags.map((t) => [t.id, t.label]));
  const total = upcomingSessionIds.length;

  return targets.map((target) => {
    const filled = upcomingSessionIds.filter(
      (sid) =>
        sid &&
        topics.some(
          (t) =>
            t.sessionId === sid &&
            t.status !== "dropped" &&
            t.tagIds.includes(target.tagId)
        )
    ).length;
    const expected =
      total === 0
        ? 0
        : Math.ceil(total / Math.max(1, target.everyNOccurrences));
    return {
      tagId: target.tagId,
      label: labelOf.get(target.tagId) ?? target.tagId,
      filled,
      total,
      everyN: target.everyNOccurrences,
      thin: filled < expected,
    };
  });
}
