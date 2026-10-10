/**
 * Today — what needs me.
 *
 * Pure: everything on the page is derived from the document and a date, so
 * the page itself only lays it out. Every number here comes from an engine
 * that already exists (readiness, health, prayer, triage); this file decides
 * what is worth putting in front of you first, and in what order.
 */
import type {
  Health,
  HealthLevel,
  Manager,
  MeetingSubjectKind,
  Person,
  Prayer,
  Team,
  Topic,
  TrackedMeeting,
} from "../types";
import {
  STATE_ORDER,
  isBehind,
  meetingAgenda,
  meetingSubjectName,
  meetingTitle,
  readinessOf,
  triageState,
  type Readiness,
  type ReadinessData,
} from "./readiness";
import { HEALTH_LEVELS } from "./health";
import { daysSincePrayed, prayerState, type PrayerState } from "./prayer";
import { delegatedTeamIds, personDomainId } from "./teams";
import { daysBetween } from "./readiness";

export type Subject = {
  kind: MeetingSubjectKind;
  id: string;
  name: string;
  role?: string;
  photo?: string;
  health?: Health;
  prayer?: Prayer;
  domainId?: string;
};

export type MeetingRow = {
  meeting: TrackedMeeting;
  reading: Readiness;
  title: string;
  subject: Subject | null;
  /** Topics planned into the next occurrence and not yet covered. */
  agenda: number;
};

export type TodayModel = {
  /** Within the next seven days, soonest first. */
  thisWeek: MeetingRow[];
  /** Seven to fourteen days out — the quiet line under the list. */
  nextWeek: MeetingRow[];
  /** The one thing to do next. Relationship debt outranks paperwork. */
  nextMove: MeetingRow | null;
  drifting: MeetingRow[];
  /** Of this week's meetings, how many need nothing more from you. */
  readyThisWeek: number;
  undecided: Subject[];
  carrying: (Subject & { state: PrayerState; silence: number | null })[];
  health: {
    counts: Record<HealthLevel | "unrated", number>;
    rated: number;
    total: number;
    /** Strained or worse, worst first. */
    weakest: Subject[];
  };
  ideas: { waiting: Topic[]; count: number; aging: number };
};

type Doc = ReadinessData & {
  people: Person[];
  teams: Team[];
  managers: Manager[];
};

/** Everyone and everything you could be meeting with, as one list. */
export function subjectsOf(doc: Doc): Subject[] {
  const teamDomain = new Map(doc.teams.map((t) => [t.id, t.domainId]));
  return [
    ...doc.people.map(
      (p): Subject => ({
        kind: "person",
        id: p.id,
        name: p.name,
        role: p.role,
        photo: p.photo,
        health: p.health,
        prayer: p.prayer,
        domainId: personDomainId(p, doc.teams),
      })
    ),
    ...doc.teams.map(
      (t): Subject => ({
        kind: "team",
        id: t.id,
        name: t.name,
        health: t.health,
        prayer: t.prayer,
        domainId: t.domainId ?? (t.parentId ? teamDomain.get(t.parentId) : undefined),
      })
    ),
    ...doc.managers.map(
      (m): Subject => ({
        kind: "manager",
        id: m.id,
        name: m.name,
        role: m.role,
        photo: m.photo,
        prayer: m.prayer,
        domainId: m.domainId,
      })
    ),
  ];
}

/** Worst state first; among equals, the longest overdue or the soonest. */
function byUrgency(a: MeetingRow, b: MeetingRow): number {
  const s = STATE_ORDER.indexOf(a.reading.state) - STATE_ORDER.indexOf(b.reading.state);
  if (s !== 0) return s;
  const da = a.reading.daysUntil ?? -(a.reading.daysSince ?? 0);
  const db = b.reading.daysUntil ?? -(b.reading.daysSince ?? 0);
  return da - db;
}

export function buildToday(
  doc: Doc,
  scopeId: string | null,
  today: string
): TodayModel {
  const all = subjectsOf(doc);
  const inScope = (s: Subject | null | undefined) =>
    !scopeId || (s ? s.domainId === scopeId : false);
  const subjects = all.filter(inScope);
  const find = (kind: MeetingSubjectKind, id: string) =>
    all.find((s) => s.kind === kind && s.id === id) ?? null;

  const src = { people: doc.people, teams: doc.teams, managers: doc.managers };
  const rows: MeetingRow[] = doc.meetings
    .map((m) => {
      const subject = find(m.subjectKind, m.subjectId);
      return {
        meeting: m,
        reading: readinessOf(m, doc, today),
        // A 1:1 is called by the person's name; "Meeting · Sarah Kim" says
        // the same thing with more words.
        title: m.name?.trim() || meetingSubjectName(m, src) || meetingTitle(m),
        subject,
        agenda: meetingAgenda(doc.topics, doc.sessions, m.id, today).filter(
          (a) => a.queued && !a.done
        ).length,
      };
    })
    .filter((r) => inScope(r.subject));

  const upcoming = (lo: number, hi: number) =>
    rows
      .filter(
        (r) =>
          r.reading.daysUntil !== null &&
          r.reading.daysUntil >= lo &&
          r.reading.daysUntil <= hi
      )
      .sort((a, b) => (a.reading.daysUntil ?? 0) - (b.reading.daysUntil ?? 0));

  const thisWeek = upcoming(0, 6);
  const nextWeek = upcoming(7, 13);
  const behind = rows.filter((r) => isBehind(r.reading.state)).sort(byUrgency);

  // The triage modal's own rule, so "decide for all N" matches what it asks:
  // teams handed to a direct report — and anyone on them — are already decided.
  const delegated = delegatedTeamIds(doc.teams);
  const undecided = subjects.filter((s) => {
    if (s.kind === "team") {
      const t = doc.teams.find((x) => x.id === s.id);
      return Boolean(t) && !delegated.has(s.id) && triageState(t!, doc.meetings, "team") === "undecided";
    }
    if (s.kind === "manager") {
      const m = doc.managers.find((x) => x.id === s.id);
      return Boolean(m) && triageState(m!, doc.meetings, "manager") === "undecided";
    }
    const p = doc.people.find((x) => x.id === s.id);
    return (
      Boolean(p) &&
      !(p!.teamId && delegated.has(p!.teamId)) &&
      triageState(p!, doc.meetings, "person") === "undecided"
    );
  });

  const carrying = subjects
    .filter((s) => s.prayer)
    .map((s) => ({
      ...s,
      state: prayerState(s.prayer),
      silence: daysSincePrayed(s.prayer),
    }))
    .sort((a, b) => {
      // Gone quiet first — it's the one state that asks for anything — then
      // the longest silence.
      const cold = Number(b.state === "cold") - Number(a.state === "cold");
      if (cold) return cold;
      return (b.silence ?? 0) - (a.silence ?? 0);
    });

  const counts = Object.fromEntries(
    [...HEALTH_LEVELS, "unrated"].map((l) => [l, 0])
  ) as Record<HealthLevel | "unrated", number>;
  const readable = subjects.filter((s) => s.kind !== "manager");
  for (const s of readable) counts[s.health?.level ?? "unrated"]++;
  const weakest = readable
    .filter((s) => s.health && ["strained", "critical"].includes(s.health.level))
    .sort(
      (a, b) =>
        HEALTH_LEVELS.indexOf(b.health!.level) - HEALTH_LEVELS.indexOf(a.health!.level)
    );

  const scopedMeetings = new Set(rows.map((r) => r.meeting.id));
  const pool = doc.topics.filter(
    (t) =>
      t.status === "open" &&
      !t.sessionId &&
      (!scopeId || !t.meetingId || scopedMeetings.has(t.meetingId))
  );
  const isAging = (t: Topic) => t.carried >= 3 || daysBetween(t.createdOn, today) >= 30;
  const waiting = [...pool].sort((a, b) => {
    // Unplaced first, then the ones that keep getting carried, then oldest.
    const unplaced = Number(!b.meetingId) - Number(!a.meetingId);
    if (unplaced) return unplaced;
    if (b.carried !== a.carried) return b.carried - a.carried;
    return a.createdOn.localeCompare(b.createdOn);
  });

  return {
    thisWeek,
    nextWeek,
    nextMove: behind[0] ?? null,
    drifting: behind.filter((r) => r.reading.state === "drifting"),
    readyThisWeek: thisWeek.filter((r) => !isBehind(r.reading.state)).length,
    undecided,
    carrying,
    health: {
      counts,
      rated: readable.length - counts.unrated,
      total: readable.length,
      weakest,
    },
    ideas: {
      waiting: waiting.slice(0, 3),
      count: pool.length,
      aging: pool.filter(isAging).length,
    },
  };
}

/** "2026-07-15" → "Jul 15", for engine detail lines written for a table. */
export function friendlyDates(text: string): string {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) =>
    new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
  );
}

/** "Good evening" — by the clock in the hand, not the server's. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * The one sentence under the greeting. Names the worst thing and the next
 * thing, in that order, and says so plainly when there's nothing.
 */
export function summaryLine(model: TodayModel, weekdayOf: (iso: string) => string): string {
  const parts: string[] = [];
  const drift = model.drifting[0];
  if (drift) {
    const who = drift.subject?.name ?? drift.title;
    const weeks = drift.reading.daysSince !== null ? Math.round(drift.reading.daysSince / 7) : null;
    parts.push(
      weeks && weeks >= 2
        ? `${who} has gone ${weeks} weeks without a meeting`
        : `${who} has drifted`
    );
  }
  const next = model.thisWeek.find((r) => r !== drift);
  if (next?.reading.nextDate) {
    const when =
      next.reading.daysUntil === 0
        ? "today"
        : next.reading.daysUntil === 1
          ? "tomorrow"
          : weekdayOf(next.reading.nextDate);
    parts.push(`${next.title} is ${when}`);
  }
  if (!parts.length) return "Nothing is owed this week. Everyone is on rhythm.";
  const sentence = parts.join(", and ") + ".";
  const others = model.drifting.length - (drift ? 1 : 0);
  return others > 0
    ? `${sentence} ${others} more ${others === 1 ? "has" : "have"} drifted.`
    : sentence;
}
