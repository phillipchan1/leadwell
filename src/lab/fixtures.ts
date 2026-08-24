import type {
  LabFollowUp,
  LabMeeting,
  LabSession,
  LabState,
  LabTag,
  LabTemplatePreset,
  LabTopic,
} from "./types";

const TAGS: LabTag[] = [
  { id: "tag-training", label: "Training", color: 0 },
  { id: "tag-prayer", label: "Prayer", color: 1 },
  { id: "tag-teambuild", label: "Team building", color: 2 },
  { id: "tag-lowdown", label: "Lowdown", color: 3 },
  { id: "tag-worship", label: "Worship", color: 4 },
  { id: "tag-ops", label: "Ops", color: 5 },
];

/**
 * Templates are the running order of a meeting. Every occurrence renders these
 * bands in this order, so "where does this go" has an answer before the week
 * has any content in it.
 */
const MEETINGS: LabMeeting[] = [
  {
    id: "m-frontier",
    subjectKind: "team",
    subjectId: "t-frontier",
    subjectName: "Frontier Staff",
    name: "Frontier Staff",
    rhythm: "weekly",
    anchorWeekday: 4, // Thu
    coverageTargets: [
      { tagId: "tag-training", everyNOccurrences: 4 },
      { tagId: "tag-prayer", everyNOccurrences: 1 },
      { tagId: "tag-teambuild", everyNOccurrences: 4 },
      { tagId: "tag-lowdown", everyNOccurrences: 2 },
    ],
    template: [
      { id: "sec-fr-lowdown", label: "Lowdown", tagId: "tag-lowdown", minutes: 10 },
      { id: "sec-fr-training", label: "Training", tagId: "tag-training", minutes: 20 },
      { id: "sec-fr-team", label: "Team building", tagId: "tag-teambuild", minutes: 10 },
      { id: "sec-fr-prayer", label: "Prayer", tagId: "tag-prayer", minutes: 15 },
    ],
  },
  {
    id: "m-sunday",
    subjectKind: "team",
    subjectId: "t-sunday",
    subjectName: "Sunday Service",
    name: "Sunday Service Planning",
    rhythm: "weekly",
    anchorWeekday: 2, // Tue
    coverageTargets: [
      { tagId: "tag-worship", everyNOccurrences: 1 },
      { tagId: "tag-ops", everyNOccurrences: 2 },
    ],
    template: [
      { id: "sec-sun-set", label: "Set list", tagId: "tag-worship", minutes: 20 },
      { id: "sec-sun-run", label: "Run of show", tagId: "tag-ops", minutes: 15 },
      { id: "sec-sun-ann", label: "Announcements", minutes: 10 },
    ],
  },
  {
    id: "m-marcus",
    subjectKind: "person",
    subjectId: "p-marcus",
    subjectName: "Marcus Chen",
    name: "1:1 · Marcus",
    rhythm: "biweekly",
    anchorWeekday: 1,
    coverageTargets: [],
    template: [
      { id: "sec-mc-theirs", label: "Their agenda", minutes: 15 },
      { id: "sec-mc-mine", label: "My agenda", minutes: 10 },
      { id: "sec-mc-growth", label: "Growth", minutes: 5 },
    ],
  },
  {
    id: "m-jordan",
    subjectKind: "person",
    subjectId: "p-jordan",
    subjectName: "Jordan Lee",
    name: "1:1 · Jordan",
    rhythm: "weekly",
    anchorWeekday: 3,
    coverageTargets: [],
    template: [],
  },
];

const PRESETS: LabTemplatePreset[] = [
  {
    id: "pre-staff",
    label: "Staff meeting",
    sections: [
      { label: "Lowdown", tagId: "tag-lowdown", minutes: 10 },
      { label: "Training", tagId: "tag-training", minutes: 20 },
      { label: "Team building", tagId: "tag-teambuild", minutes: 10 },
      { label: "Prayer", tagId: "tag-prayer", minutes: 15 },
    ],
  },
  {
    id: "pre-oneonone",
    label: "1:1",
    sections: [
      { label: "Their agenda", minutes: 15 },
      { label: "My agenda", minutes: 10 },
      { label: "Growth", minutes: 5 },
    ],
  },
  {
    id: "pre-service",
    label: "Service planning",
    sections: [
      { label: "Set list", tagId: "tag-worship", minutes: 20 },
      { label: "Run of show", tagId: "tag-ops", minutes: 15 },
      { label: "Announcements", minutes: 10 },
    ],
  },
];

/** Fixed "today" so carry-back demos are stable. Matches the screenshot era. */
export const LAB_TODAY = "2026-08-20";

function isoOffset(days: number): string {
  const d = new Date(`${LAB_TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const SESSIONS: LabSession[] = [
  // Past Frontier — already lost one topic back to the inbox, ledger recorded
  {
    id: "s-fr-past",
    meetingId: "m-frontier",
    date: isoOffset(-7),
    point: "Weekly staff",
    notes: "Covered prayer + lowdown. Training slipped.",
    uncovered: ["New volunteer onboarding walkthrough"],
  },
  {
    id: "s-fr-today",
    meetingId: "m-frontier",
    date: LAB_TODAY,
  },
  {
    id: "s-sun-past",
    meetingId: "m-sunday",
    date: isoOffset(-5),
    notes: "Ran the set list.",
  },
  {
    id: "s-marcus-past",
    meetingId: "m-marcus",
    date: isoOffset(-14),
    notes: "Career chat.",
  },
];

const TOPICS: LabTopic[] = [
  {
    id: "t1",
    meetingId: "m-frontier",
    text: "Claude Cowork",
    status: "open",
    lane: "backlog",
    tagIds: ["tag-training"],
    carried: 0,
    carriedFrom: [],
    createdOn: isoOffset(-3),
    order: 0,
  },
  {
    id: "t2",
    meetingId: "m-sunday",
    text: "Sunday Market Announcement",
    status: "open",
    lane: "backlog",
    tagIds: ["tag-ops"],
    carried: 0,
    carriedFrom: [],
    createdOn: isoOffset(-2),
    order: 1,
  },
  {
    id: "t3",
    meetingId: "m-sunday",
    text: "Improving Giving Moment Experience",
    status: "open",
    lane: "backlog",
    tagIds: ["tag-worship"],
    carried: 0,
    carriedFrom: [],
    createdOn: isoOffset(-1),
    order: 2,
  },
  // Untriaged inbox items
  {
    id: "t4",
    text: "Team retreat brainstorm",
    status: "open",
    lane: "backlog",
    tagIds: [],
    notes:
      "Two nights, somewhere within 90 minutes. Goal is trust, not strategy — we did strategy in March and it landed flat.",
    points: [
      { id: "pt1", text: "Pick a weekend that misses school holidays", done: true },
      { id: "pt2", text: "Budget — last year was $180/head", done: false },
      { id: "pt3", text: "Ask Marcus to run the Saturday session", done: false },
    ],
    suggestedMeetingId: "m-frontier",
    suggestedTagIds: ["tag-teambuild"],
    carried: 0,
    carriedFrom: [],
    createdOn: LAB_TODAY,
    order: 3,
  },
  {
    id: "t5",
    text: "Hospital visit follow-up for the Lees",
    status: "open",
    lane: "backlog",
    tagIds: [],
    suggestedMeetingId: "m-frontier",
    suggestedTagIds: ["tag-prayer"],
    carried: 0,
    carriedFrom: [],
    createdOn: LAB_TODAY,
    order: 4,
  },
  {
    id: "t6",
    text: "Marcus stretch assignment ideas",
    status: "open",
    lane: "backlog",
    tagIds: [],
    suggestedMeetingId: "m-marcus",
    suggestedTagIds: [],
    carried: 0,
    carriedFrom: [],
    createdOn: isoOffset(-1),
    order: 5,
  },
  // Came back from last week's occurrence — the "Returned" band on load
  {
    id: "t7",
    meetingId: "m-frontier",
    text: "New volunteer onboarding walkthrough",
    status: "open",
    lane: "backlog",
    tagIds: ["tag-training"],
    lastSectionId: "sec-fr-training",
    carried: 1,
    carriedFrom: ["s-fr-past"],
    returnedOn: isoOffset(-6),
    returnedFromDate: isoOffset(-7),
    createdOn: isoOffset(-14),
    order: 6,
  },
  // Today's occurrence, filled against the template
  {
    id: "t8",
    meetingId: "m-frontier",
    text: "Budget lowdown for Q3",
    status: "open",
    lane: "backlog",
    sessionId: "s-fr-today",
    sectionId: "sec-fr-lowdown",
    tagIds: ["tag-lowdown"],
    carried: 0,
    carriedFrom: [],
    createdOn: isoOffset(-4),
    order: 0,
  },
  {
    id: "t9",
    meetingId: "m-frontier",
    text: "Prayer for Frontier families",
    status: "open",
    lane: "backlog",
    sessionId: "s-fr-today",
    sectionId: "sec-fr-prayer",
    tagIds: ["tag-prayer"],
    carried: 0,
    carriedFrom: [],
    createdOn: isoOffset(-2),
    order: 0,
  },
  {
    id: "t10",
    meetingId: "m-frontier",
    text: "Icebreaker: two truths",
    status: "open",
    lane: "backlog",
    sessionId: "s-fr-today",
    sectionId: "sec-fr-team",
    tagIds: ["tag-teambuild"],
    carried: 0,
    carriedFrom: [],
    createdOn: isoOffset(-1),
    order: 0,
  },
  // Aging — pushed many times
  {
    id: "t11",
    meetingId: "m-frontier",
    text: "Rewrite the staff covenant",
    status: "open",
    lane: "backlog",
    tagIds: ["tag-lowdown"],
    carried: 3,
    carriedFrom: ["s-old-1", "s-old-2", "s-old-3"],
    createdOn: isoOffset(-60),
    order: 10,
  },
  {
    id: "t12",
    meetingId: "m-marcus",
    text: "Review Q3 goals",
    status: "open",
    lane: "backlog",
    tagIds: [],
    carried: 0,
    carriedFrom: [],
    createdOn: isoOffset(-5),
    order: 11,
  },
];

const FOLLOW_UPS: LabFollowUp[] = [
  {
    id: "f1",
    subjectKind: "team",
    subjectId: "t-frontier",
    meetingId: "m-frontier",
    text: "Send onboarding checklist to new hires",
    status: "open",
    openedOn: isoOffset(-7),
    sourceSessionId: "s-fr-past",
  },
  {
    id: "f2",
    subjectKind: "person",
    subjectId: "p-marcus",
    meetingId: "m-marcus",
    text: "Draft stretch assignment brief",
    status: "open",
    openedOn: isoOffset(-14),
    sourceSessionId: "s-marcus-past",
  },
  {
    id: "f3",
    subjectKind: "team",
    subjectId: "t-frontier",
    meetingId: "m-frontier",
    text: "Book room for retreat",
    status: "done",
    openedOn: isoOffset(-21),
    closedOn: isoOffset(-10),
    sourceSessionId: "s-fr-past",
  },
];

export function seedLabState(): LabState {
  return {
    tags: TAGS,
    meetings: MEETINGS,
    topics: TOPICS,
    sessions: SESSIONS,
    followUps: FOLLOW_UPS,
    presets: PRESETS,
    surface: "planner",
    activeMeetingId: "m-frontier",
    activeSlotKey: null,
    captureOpen: false,
    quickAssignTopicId: null,
    openTopicId: null,
    today: LAB_TODAY,
    carryMode: "inbox",
    notice: null,
  };
}
