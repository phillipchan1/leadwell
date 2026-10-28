import type { Fixture, FixtureCadence, KnowledgeItem, KnowledgeKind, MeetingSubjectKind, Person } from "../types";
import { daysBetween } from "./readiness";

export const CADENCE_LABEL: Record<FixtureCadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  as_needed: "As needed",
};

/** How long a fixture can go unmentioned before it's worth asking about. */
const CADENCE_DAYS: Record<FixtureCadence, number | null> = {
  weekly: 7,
  monthly: 31,
  quarterly: 92,
  yearly: 366,
  as_needed: null,
};

export const KIND_LABEL: Record<KnowledgeKind, string> = {
  decision: "Decision",
  theme: "Theme",
  fact: "Worth knowing",
};

export type FixtureStatus = { quiet: boolean; label: string };

/**
 * When a fixture last came up, and whether that's longer than its cadence
 * allows — a monthly budget nobody has mentioned in two months is the thing
 * to raise. Quiet means overdue by half a cycle again, so a week's slip on a
 * weekly thing isn't a nag.
 */
export function fixtureStatus(f: Fixture, today: string): FixtureStatus {
  if (!f.lastTouchedOn) return { quiet: false, label: "Not talked about yet" };
  const days = Math.max(0, daysBetween(f.lastTouchedOn, today));
  const label =
    days === 0
      ? "Talked about today"
      : days < 14
        ? `Talked about ${days}d ago`
        : days < 60
          ? `Talked about ${Math.round(days / 7)} wk ago`
          : `Talked about ${Math.round(days / 30)} mo ago`;
  const cycle = CADENCE_DAYS[f.cadence];
  return { quiet: cycle !== null && days > cycle * 1.5, label };
}

/** First name, lowercased — how an owner is written ("Elena", "elena k."). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/**
 * The fixtures that belong in a meeting about this subject: its own, and —
 * in a 1:1 — the ones on their team they carry, because that's where those
 * get talked through.
 */
export function fixturesFor(
  fixtures: Fixture[],
  kind: MeetingSubjectKind,
  id: string,
  people: Person[]
): Fixture[] {
  const person = kind === "person" ? people.find((p) => p.id === id) : undefined;
  const name = person ? firstName(person.name) : "";
  return fixtures
    .filter(
      (f) =>
        (f.subjectKind === kind && f.subjectId === id) ||
        (person?.teamId &&
          f.subjectKind === "team" &&
          f.subjectId === person.teamId &&
          f.owner &&
          firstName(f.owner) === name)
    )
    .sort((a, b) => a.order - b.order);
}

/** What's known about a subject: pinned first, then the newest. */
export function knownFor(knowledge: KnowledgeItem[], kind: MeetingSubjectKind, id: string): KnowledgeItem[] {
  return knowledge
    .filter((k) => k.subjectKind === kind && k.subjectId === id)
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.notedOn.localeCompare(a.notedOn)
    );
}
