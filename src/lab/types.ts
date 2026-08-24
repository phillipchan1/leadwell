/**
 * Prototype-only types for the meetings redesign lab.
 * These preview the live model after migration — they do not replace src/types.ts.
 */

export type LabSubjectKind = "person" | "team" | "manager";

export type LabTag = {
  id: string;
  label: string;
  /** Index into the shared color palette (0..5). */
  color: number;
};

export type LabCoverageTarget = {
  tagId: string;
  /** Aim for this tag at least once every N occurrences. */
  everyNOccurrences: number;
};

/**
 * A named band inside every occurrence of a meeting — "Lowdown", "Training",
 * "Prayer". The template is the *shape* of the meeting; topics are what fills
 * it this week. Reordering a section here reorders it in every occurrence,
 * which is the whole point of templatizing the drop areas.
 */
export type LabSection = {
  id: string;
  label: string;
  /** Topics dropped here pick up this tag automatically. */
  tagId?: string;
  /** Rough minutes, shown as a hint. Purely advisory. */
  minutes?: number;
};

/** A reusable running order, shareable across meetings. */
export type LabTemplatePreset = {
  id: string;
  label: string;
  sections: { label: string; tagId?: string; minutes?: number }[];
};

export type LabMeeting = {
  id: string;
  subjectKind: LabSubjectKind;
  subjectId: string;
  subjectName: string;
  name: string;
  rhythm: "weekly" | "biweekly" | "monthly";
  /** 0 = Sun … 6 = Sat */
  anchorWeekday: number;
  coverageTargets: LabCoverageTarget[];
  /** Running order applied to every occurrence. Empty = one flat list. */
  template: LabSection[];
};

/** A sub-point — the scaffolding under an idea. */
export type LabPoint = {
  id: string;
  text: string;
  done: boolean;
};

export type LabTopicStatus = "open" | "covered" | "dropped";
export type LabTopicLane = "backlog" | "parked";

export type LabTopic = {
  id: string;
  /** Null = untriaged inbox item. */
  meetingId?: string;
  text: string;
  status: LabTopicStatus;
  lane: LabTopicLane;
  sessionId?: string;
  /** Which template band it sits in, when it's scheduled. */
  sectionId?: string;
  tagIds: string[];
  /** Longer thinking behind the one-liner. */
  notes?: string;
  /** What this breaks down into — the thing a card is too small to hold. */
  points?: LabPoint[];
  urgent?: boolean;
  carried: number;
  /** Session ids this topic was pushed out of, in order. */
  carriedFrom: string[];
  /** Set when an occurrence passed with this still unchecked. */
  returnedOn?: string;
  /** The occurrence date it missed — shown on the returned card. */
  returnedFromDate?: string;
  /** Where it used to sit, so putting it back is one click. */
  lastSectionId?: string;
  suggestedMeetingId?: string;
  suggestedTagIds?: string[];
  createdOn: string;
  closedOn?: string;
  order: number;
};

export type LabSession = {
  id: string;
  meetingId: string;
  date: string;
  point?: string;
  notes?: string;
  transcript?: string;
  /** Texts that were still open when the date passed — the visible ledger. */
  uncovered?: string[];
};

export type LabFollowUp = {
  id: string;
  subjectKind: LabSubjectKind;
  subjectId: string;
  meetingId?: string;
  text: string;
  status: "open" | "done";
  openedOn: string;
  closedOn?: string;
  sourceSessionId?: string;
};

export type LabSurface = "ideas" | "planner" | "run";

/**
 * What happens to a topic still unchecked when its occurrence passes.
 * "inbox" — comes back to Ideas, annotated, so you re-decide. (Default.)
 * "forward" — silently rides to the next occurrence. The older behaviour,
 * kept switchable so the two can be felt side by side.
 */
export type LabCarryMode = "inbox" | "forward";

export type LabState = {
  tags: LabTag[];
  meetings: LabMeeting[];
  topics: LabTopic[];
  sessions: LabSession[];
  followUps: LabFollowUp[];
  presets: LabTemplatePreset[];
  surface: LabSurface;
  activeMeetingId: string | null;
  /** `s:<sessionId>` or `p:<date>` for the open Run / selected week. */
  activeSlotKey: string | null;
  /** Capture bar focused. */
  captureOpen: boolean;
  /** Quick-assign palette open for this topic id. */
  quickAssignTopicId: string | null;
  /** Detail panel open for this topic id. */
  openTopicId: string | null;
  /** Prototype clock. Advancing it is how you watch carry-back happen. */
  today: string;
  carryMode: LabCarryMode;
  /** Transient one-liner: "3 topics came back to Ideas." */
  notice: string | null;
};

export type LabSlot = {
  sessionId: string | null;
  date: string;
  projected: boolean;
  past: boolean;
};

/** Where a card lives on the board, as a droppable address. */
export const IDEAS_ZONE = "ideas";
export const PARKED_ZONE = "parked";
export const UNSORTED = "__unsorted";

/** `s:<sessionId>/<sectionId>` or `p:<date>/<sectionId>`. */
export function zoneKey(slotKey: string, sectionId: string): string {
  return `${slotKey}/${sectionId}`;
}

export function parseZoneKey(
  key: string
): { slotKey: string; sectionId: string } | null {
  const i = key.lastIndexOf("/");
  if (i < 0) return null;
  return { slotKey: key.slice(0, i), sectionId: key.slice(i + 1) };
}
