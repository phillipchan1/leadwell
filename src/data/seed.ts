import type {
  Capacity,
  Domain,
  Manager,
  Team,
  Person,
  Action,
  FollowUp,
  Tag,
  Topic,
  TrackedMeeting,
  CurriculumSlot,
  Session,
  Goal,
  Note,
  PrayerEntry,
  Win,
  TeamAction,
  TeamGoal,
  TeamNote,
  Me,
} from "../types";

export const seedMe: Me = {
  name: "Phil Chan",
  title: "Leader",
  assessments: {},
  strengths: [],
  watchOuts: [],
};

// Life areas / contexts. Teams are color-tagged by the domain they live in.
export const seedDomains: Domain[] = [
  { id: "dom-work", name: "Day job", color: "#3B82F6" },
  { id: "dom-church", name: "Church", color: "#8B5CF6" },
  { id: "dom-family", name: "Family", color: "#EC4899" },
  { id: "dom-community", name: "Community", color: "#14B8A6" },
];

export const capUp: Capacity = {
  id: "cap-up",
  label: "Report up",
  color: "#3B82F6",
};

export const seedCapacities: Capacity[] = [
  { id: "cap-manager", label: "Manager", color: "#0D9488" },
  { id: "cap-leader", label: "Leader", color: "#8B5CF6" },
  { id: "cap-influence", label: "Influence", color: "#F59E0B" },
  capUp,
];

export const seedTeams: Team[] = [
  {
    id: "team-frontier",
    name: "Frontier Staff",
    prayer: {
      since: "2026-03-01",
      focus: "Unity through the building season",
      lastPrayedOn: "2026-08-10",
      times: 46,
    },
    capacityId: "cap-manager",
    domainId: "dom-church",
    description: "Church staff team",
    purpose: "Build a healthy, unified staff that leads the church well.",
    cadence: "Weekly",
    lastMet: "2026-07-06",
    order: 0,
    health: {
      level: "solid",
      note: "Trust is high, but the load across the four of us is uneven.",
      ratedOn: "2026-07-20",
    },
  },
  {
    id: "team-ministries",
    name: "Frontier Ministries",
    capacityId: "cap-leader",
    domainId: "dom-church",
    description: "All ministry teams under my purview",
    purpose:
      "Keep Frontier's ministry teams healthy, staffed, and moving the same direction.",
    cadence: "Monthly leaders huddle",
    order: 1,
    health: {
      level: "watch",
      note: "Two ministries still have no clear leader.",
      ratedOn: "2026-07-12",
    },
  },
  {
    id: "team-setup",
    name: "Setup & Breakdown",
    capacityId: "cap-manager",
    domainId: "dom-church",
    parentId: "team-ministries",
    description: "Weekend environment team I personally lead",
    purpose:
      "Run a reliable, hospitable setup/breakdown crew every service weekend.",
    cadence: "Weekly",
    lastMet: "2026-07-13",
    order: 2,
    health: {
      level: "thriving",
      note: "Volunteer bench is deeper than it has ever been.",
      ratedOn: "2026-07-27",
    },
  },
  {
    id: "team-mens",
    name: "Men's Core Team",
    capacityId: "cap-leader",
    domainId: "dom-church",
    description: "Volunteer ministry team",
    purpose: "Raise up men who lead their families and serve the church.",
    cadence: "Monthly",
    order: 3,
    health: {
      level: "strained",
      note: "Attendance sliding since spring and the core four are tired.",
      ratedOn: "2026-06-30",
    },
  },
  {
    id: "team-product",
    name: "Product Squad",
    capacityId: "cap-influence",
    domainId: "dom-work",
    description: "Cross-functional squad at work",
    purpose: "Ship the reporting rewrite and keep the squad unblocked.",
    order: 4,
    health: {
      level: "watch",
      note: "Rewrite is behind and the squad knows it.",
      ratedOn: "2026-07-28",
    },
  },
  {
    id: "team-leaders",
    name: "My Leaders",
    capacityId: "cap-up",
    domainId: "dom-church",
    description: "Who I report to",
    order: 5,
    direction: "up",
  },
  {
    id: "team-work-leaders",
    name: "Work Leadership",
    capacityId: "cap-up",
    domainId: "dom-work",
    description: "Who I report to at the day job",
    order: 6,
    direction: "up",
  },
];

// People I report to, rendered directly above my node. Distinct from "up" teams:
// a manager is one person I answer to in a given area.
export const seedManagers: Manager[] = [
  {
    id: "mgr-vp",
    name: "Dana Foster",
    role: "VP of Product",
    domainId: "dom-work",
  },
];

export const seedPeople: Person[] = [
  {
    id: "p-sarah",
    teamId: "team-frontier",
    name: "Sarah Kim",
    role: "Worship Director",
    prayer: {
      since: "2026-04-02",
      focus: "Rest — and the courage to say no without guilt",
      lastPrayedOn: "2026-08-09",
      times: 34,
    },
    health: {
      level: "watch",
      note: "Plate is past full — no weekend off since March.",
      ratedOn: "2026-07-21",
    },
    assessments: {
      cliftonTop5: ["Empathy", "Developer", "Belief", "Harmony", "Adaptability"],
      enneagram: "2w1",
      mbti: "ENFJ",
    },
    strengths: ["Builds deep trust fast", "Volunteers love serving with her"],
    watchOuts: ["Says yes to everything", "Avoids giving hard feedback"],
    howToLead:
      "Affirm the person before the work. Give her explicit permission to say no, and check her plate in every 1:1.",
  },
  {
    id: "p-marcus",
    teamId: "team-frontier",
    name: "Marcus Webb",
    role: "Youth Pastor",
    health: { level: "solid", ratedOn: "2026-07-21" },
    assessments: {
      cliftonTop5: ["Woo", "Communication", "Activator", "Positivity", "Ideation"],
      enneagram: "7w8",
      mbti: "ENFP",
    },
    strengths: ["Instant rapport with students", "Brings energy to every room"],
    watchOuts: ["Starts more than he finishes", "Admin details slip"],
    howToLead:
      "Channel the energy: one big swing per season. Pair him with a detail person and keep deadlines concrete.",
  },
  {
    id: "p-elena",
    teamId: "team-frontier",
    name: "Elena Ruiz",
    role: "Operations Coordinator",
    assessments: {},
    strengths: [],
    watchOuts: [],
  },
  {
    id: "p-dave",
    prayer: {
      since: "2026-01-15",
      focus: "His marriage, and the move he's weighing",
      lastPrayedOn: "2026-06-28",
      times: 21,
    },
    teamId: "team-mens",
    name: "Dave Okafor",
    role: "Small Groups Lead",
    health: {
      level: "thriving",
      note: "Steadiest leader on the team — the guys go to him first.",
      ratedOn: "2026-07-05",
    },
    assessments: {
      cliftonTop5: ["Responsibility", "Relator", "Consistency", "Discipline", "Focus"],
      enneagram: "6w5",
      mbti: "ISTJ",
    },
    strengths: ["Never drops a commitment", "Steady presence for the guys"],
    watchOuts: ["Resists last-minute changes", "Slow to trust new people"],
    howToLead:
      "Give him the plan early and honor it. When change is unavoidable, explain the why before the what.",
  },
  {
    id: "p-jordan",
    teamId: "team-mens",
    name: "Jordan Lee",
    noMeeting: true,
    role: "Events Lead",
    health: {
      level: "strained",
      note: "Running on empty; snapped at a volunteer in June.",
      ratedOn: "2026-06-28",
    },
    assessments: {
      cliftonTop5: ["Arranger", "Achiever", "Maximizer", "Significance", "Strategic"],
      enneagram: "3w2",
      mbti: "ESTJ",
    },
    strengths: ["Makes events run like clockwork", "Raises the bar for everyone"],
    watchOuts: ["Ties worth to results", "Can bulldoze slower processors"],
    howToLead:
      "Celebrate who he is, not just what he delivers. Debrief losses privately and quickly.",
  },
  {
    id: "p-tom",
    teamId: "team-mens",
    name: "Tom Brady",
    noMeeting: true,
    role: "Hospitality",
    assessments: {},
    strengths: [],
    watchOuts: [],
  },
  {
    id: "p-priya",
    teamId: "team-product",
    name: "Priya Nair",
    role: "Staff Engineer",
    health: {
      level: "watch",
      note: "Gone quiet since the re-org — worth asking directly.",
      ratedOn: "2026-07-28",
    },
    assessments: {
      cliftonTop5: ["Analytical", "Learner", "Intellection", "Input", "Deliberative"],
      enneagram: "5w4",
      mbti: "INTP",
    },
    strengths: ["Sees the failure mode nobody else does", "Deep technical judgment"],
    watchOuts: ["Goes quiet when overloaded", "Analysis over action"],
    howToLead:
      "Send context before meetings, never put her on the spot. Ask 'what would you need to decide?' to unstick analysis loops.",
  },
  {
    id: "p-alex",
    teamId: "team-product",
    name: "Alex Chen",
    role: "Designer",
    assessments: {},
    strengths: [],
    watchOuts: [],
  },
  {
    id: "p-mike",
    teamId: "team-leaders",
    name: "Mike Reynolds",
    role: "Lead Pastor",
    health: { level: "solid", ratedOn: "2026-07-14" },
    assessments: {
      cliftonTop5: ["Strategic", "Command", "Achiever", "Belief", "Futuristic"],
      enneagram: "8w7",
      mbti: "ENTJ",
    },
    strengths: ["Decisive under pressure", "Casts vision people follow"],
    watchOuts: ["Impatient with long process discussions", "Can read pushback as disloyalty"],
    howToLead:
      "Leading up: bring solutions with a recommendation, not open-ended problems. Be direct — he respects challenge delivered straight, in private.",
    leadUp: {
      winsLike:
        "A report who shows up with a recommendation already formed, moves fast, and owns the outcome.",
      anxieties:
        "Slow, open-ended process. Reads hesitation or pushback in public as disloyalty.",
      currency:
        "Decisiveness and forward motion. Trust is earned by making the call and standing behind it.",
      comms:
        "Short and direct, in private for anything hard. Lead with the ask and the recommendation, details on request.",
      theirScorecard:
        "Judged by the elders on church growth and vision momentum. Anything that visibly advances the vision makes him look good upward.",
    },
  },
  {
    id: "p-sce",
    teamId: "team-work-leaders",
    // Placeholder name — rename to your actual SCE job manager.
    name: "Ray Delgado",
    role: "Job Manager · SCE",
    assessments: {},
    strengths: [],
    watchOuts: [],
    leadUp: {
      winsLike:
        "Sees me visibly busy with a full backlog. A stacked, groomed queue reads as a strong report; idle capacity reads as a problem.",
      anxieties:
        "Idle time and gaps in the schedule. Messy or half-finished artifacts. Surprises he has to explain up the chain.",
      currency:
        "Visible throughput + pristine artifacts. Polish and volume buy more trust with him than clever ideas do — he's a factory-worker mindset: keep the line moving.",
      comms:
        "Frequent, concrete status. Show the queue and what's moving through it. Never hand him a rough draft — only review-clean work.",
      theirScorecard:
        "Judged upward on his crew's utilization and on artifacts passing review the first time. Making those two numbers look good is making him look good.",
    },
  },
];

export const seedActions: Action[] = [
  {
    id: "a-1",
    personId: "p-sarah",
    text: "Ask about volunteer pipeline for fall",
    done: false,
    column: "this_1on1",
  },
  {
    id: "a-2",
    personId: "p-sarah",
    text: "Follow up on song-selection conflict",
    done: true,
    column: "done",
  },
  {
    id: "a-5",
    personId: "p-sarah",
    text: "Check in on mom's health",
    done: false,
    column: "backlog",
  },
  {
    id: "a-6",
    personId: "p-sarah",
    text: "Sunday setup handoff plan",
    done: false,
    column: "parking",
  },
  {
    id: "a-3",
    personId: "p-marcus",
    text: "Review summer camp budget together",
    done: false,
    dueDate: "2026-07-15",
    column: "this_1on1",
  },
  {
    id: "a-4",
    personId: "p-priya",
    text: "Share Q3 roadmap draft before planning meeting",
    done: false,
    column: "backlog",
  },
];

/**
 * Tracked meetings — the things I've opted into being ready for. Note what's
 * absent: most of the men's team has no meeting and no decision, which is what
 * the undecided count is for.
 */
/**
 * A curriculum slot is structure; a tag is vocabulary. The slot points at the
 * tag so anything placed there is labelled on arrival — the same wiring
 * migration 0015 performs on real data.
 */
const tagIdFor = (label: string) =>
  `tag-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const ONE_ON_ONE_SLOTS: CurriculumSlot[] = [
  { id: "cs-checkin", label: "Check-in", tagId: tagIdFor("Check-in"), minutes: 5 },
  { id: "cs-work", label: "Work", tagId: tagIdFor("Work"), minutes: 15 },
  { id: "cs-develop", label: "Develop", tagId: tagIdFor("Develop"), minutes: 10 },
];

const STAFF_SLOTS: CurriculumSlot[] = [
  { id: "cs-prayer", label: "Prayer", tagId: tagIdFor("Prayer"), minutes: 15 },
  { id: "cs-training", label: "Training", tagId: tagIdFor("Training"), minutes: 20 },
  {
    id: "cs-discussion",
    label: "Discussion",
    tagId: tagIdFor("Discussion"),
    minutes: 20,
  },
];

/** One tag per distinct slot label, workspace-wide. */
export const seedTags: Tag[] = [...ONE_ON_ONE_SLOTS, ...STAFF_SLOTS].map(
  (slot, i) => ({
    id: slot.tagId as string,
    label: slot.label,
    color: i % 6,
    order: i,
  })
);

/** slotId → tagId, for labelling the seed topics the way the migration does. */
const TAG_BY_SLOT = new Map(
  [...ONE_ON_ONE_SLOTS, ...STAFF_SLOTS].map((s) => [s.id, s.tagId as string])
);

export const seedMeetings: TrackedMeeting[] = [
  {
    id: "m-p-sarah",
    subjectKind: "person",
    subjectId: "p-sarah",
    rhythm: "weekly",
    curriculum: ONE_ON_ONE_SLOTS,
  },
  {
    id: "m-p-marcus",
    subjectKind: "person",
    subjectId: "p-marcus",
    rhythm: "biweekly",
    curriculum: ONE_ON_ONE_SLOTS,
  },
  {
    id: "m-p-elena",
    subjectKind: "person",
    subjectId: "p-elena",
    rhythm: "monthly",
    curriculum: ONE_ON_ONE_SLOTS,
  },
  {
    id: "m-p-dave",
    subjectKind: "person",
    subjectId: "p-dave",
    rhythm: "monthly",
    curriculum: ONE_ON_ONE_SLOTS,
  },
  {
    id: "m-p-priya",
    subjectKind: "person",
    subjectId: "p-priya",
    rhythm: "weekly",
    curriculum: ONE_ON_ONE_SLOTS,
  },
  {
    id: "m-p-alex",
    subjectKind: "person",
    subjectId: "p-alex",
    rhythm: "biweekly",
    curriculum: ONE_ON_ONE_SLOTS,
  },
  // The staff meeting itself — a gathering, not a relationship.
  {
    id: "m-staff",
    subjectKind: "team",
    subjectId: "team-frontier",
    name: "Staff meeting",
    rhythm: "weekly",
    role: "convene",
    anchorWeekday: 1,
    curriculum: STAFF_SLOTS,
  },
  // Led, real, and genuinely not on a rhythm — a floor, not a cadence.
  {
    id: "m-mens",
    subjectKind: "team",
    subjectId: "team-mens",
    name: "Core team night",
    rhythm: "as_needed",
    floorDays: 45,
    role: "convene",
    curriculum: STAFF_SLOTS,
  },
  // A practice I run for peers — I convene it, nobody reports to me.
  {
    id: "m-practice",
    subjectKind: "team",
    subjectId: "team-product",
    name: "Practice meeting",
    rhythm: "biweekly",
    role: "convene",
    curriculum: STAFF_SLOTS,
  },
];

/**
 * Topic boards, one per meeting. Two of these are load-bearing for the demo:
 * `t-loose` sits in a 1:1 that already happened and was never closed, and
 * `t-carried` has been pushed twice — between them a fresh account can see the
 * failure this feature exists to catch without having to reproduce it first.
 */
/** The literals below predate tags; the normaliser fills in what they lack. */
type SeedTopic = Omit<Topic, "tagIds" | "carriedFrom"> &
  Partial<Pick<Topic, "tagIds" | "carriedFrom">>;

const rawTopics: SeedTopic[] = [
  // Sarah — a weekly 1:1 with a real backlog.
  {
    id: "t-1",
    meetingId: "m-p-sarah",
    text: "Ask about volunteer pipeline for fall",
    status: "open",
    lane: "backlog",
    slotId: "cs-work",
    carried: 0,
    createdOn: "2026-06-24",
    order: 0,
  },
  {
    id: "t-loose",
    meetingId: "m-p-sarah",
    text: "How is the setup checklist landing?",
    status: "open",
    lane: "backlog",
    slotId: "cs-work",
    // Slotted into a 1:1 that has been and gone — this is what loose looks like.
    sessionId: "o-1",
    carried: 0,
    createdOn: "2026-06-20",
    order: 1,
  },
  {
    id: "t-2",
    meetingId: "m-p-sarah",
    text: "Follow up on song-selection conflict",
    status: "covered",
    lane: "backlog",
    slotId: "cs-work",
    sessionId: "o-1",
    carried: 0,
    createdOn: "2026-06-18",
    closedOn: "2026-06-24",
    order: 2,
  },
  {
    id: "t-3",
    meetingId: "m-p-sarah",
    text: "Check in on mom's health",
    status: "open",
    lane: "backlog",
    slotId: "cs-checkin",
    carried: 0,
    createdOn: "2026-07-02",
    order: 3,
  },
  {
    id: "t-4",
    meetingId: "m-p-sarah",
    text: "Sunday setup handoff plan",
    status: "open",
    lane: "parked",
    slotId: "cs-work",
    carried: 0,
    createdOn: "2026-06-24",
    order: 4,
  },
  // Marcus.
  {
    id: "t-5",
    meetingId: "m-p-marcus",
    text: "Review summer camp budget together",
    status: "open",
    lane: "backlog",
    slotId: "cs-work",
    dueDate: "2026-07-15",
    carried: 0,
    createdOn: "2026-06-30",
    order: 0,
  },
  {
    id: "t-carried",
    meetingId: "m-p-marcus",
    text: "Preaching cohort — is he actually going to do it?",
    status: "open",
    lane: "backlog",
    slotId: "cs-develop",
    // Pushed twice already. The badge is the whole message.
    carried: 2,
    createdOn: "2026-06-02",
    order: 1,
  },
  // Priya.
  {
    id: "t-6",
    meetingId: "m-p-priya",
    text: "Share Q3 roadmap draft before planning meeting",
    status: "open",
    lane: "backlog",
    slotId: "cs-work",
    carried: 0,
    createdOn: "2026-07-08",
    order: 0,
  },
  // The staff meeting — a curriculum, not a pile. Some weeks are filled,
  // some skeleton cells stay empty so the arc is visible.
  {
    id: "t-staff-prayer-1",
    meetingId: "m-staff",
    text: "Pray for the building season",
    status: "open",
    lane: "backlog",
    slotId: "cs-prayer",
    sessionId: "o-staff-1",
    carried: 0,
    createdOn: "2026-08-10",
    order: 0,
  },
  {
    id: "t-staff-train-1",
    meetingId: "m-staff",
    text: "Claude Cowork — how we'll actually use it",
    status: "open",
    lane: "backlog",
    slotId: "cs-training",
    sessionId: "o-staff-2",
    carried: 0,
    createdOn: "2026-08-12",
    order: 1,
  },
  {
    id: "t-7",
    meetingId: "m-staff",
    text: "Fall calendar — lock the retreat weekend",
    status: "open",
    lane: "backlog",
    slotId: "cs-discussion",
    carried: 0,
    createdOn: "2026-07-20",
    order: 2,
  },
  {
    id: "t-8",
    meetingId: "m-staff",
    text: "Budget: where we landed vs. what we projected",
    status: "open",
    lane: "backlog",
    slotId: "cs-discussion",
    sessionId: "o-staff-3",
    carried: 0,
    createdOn: "2026-07-22",
    order: 3,
  },
  {
    id: "t-9",
    meetingId: "m-staff",
    text: "Hiring plan for the worship associate role",
    status: "open",
    lane: "backlog",
    slotId: "cs-discussion",
    carried: 1,
    createdOn: "2026-07-01",
    order: 4,
  },
  {
    id: "t-10",
    meetingId: "m-staff",
    text: "Offsite — worth doing this year?",
    status: "open",
    lane: "parked",
    slotId: "cs-discussion",
    carried: 0,
    createdOn: "2026-06-15",
    order: 5,
  },
  {
    id: "t-staff-train-2",
    meetingId: "m-staff",
    text: "Strengths workshop for the team",
    status: "open",
    lane: "backlog",
    slotId: "cs-training",
    carried: 0,
    createdOn: "2026-08-01",
    order: 6,
  },
  {
    id: "t-staff-prayer-2",
    meetingId: "m-staff",
    text: "Staff unity through the fall",
    status: "open",
    lane: "backlog",
    slotId: "cs-prayer",
    carried: 0,
    createdOn: "2026-08-08",
    order: 7,
  },
  {
    id: "t-staff-disc-1",
    meetingId: "m-staff",
    text: "Volunteer pipeline — who's owning it?",
    status: "open",
    lane: "backlog",
    slotId: "cs-discussion",
    sessionId: "o-staff-4",
    carried: 0,
    createdOn: "2026-08-05",
    order: 8,
  },
];

/**
 * Fill in what the literals above don't carry: a topic filling the Training
 * slot was already saying "this is a training topic", so it gets that tag.
 */
export const seedTopics: Topic[] = rawTopics.map((t) => ({
  ...t,
  tagIds:
    t.tagIds ??
    (t.slotId && TAG_BY_SLOT.has(t.slotId)
      ? [TAG_BY_SLOT.get(t.slotId) as string]
      : []),
  carriedFrom: t.carriedFrom ?? [],
}));

/** No seeded commitments — these are earned in a conversation, not shipped. */
export const seedFollowUps: FollowUp[] = [];

export const seedSessions: Session[] = [
  {
    id: "o-1",
    meetingId: "m-p-sarah",
    date: "2026-06-24",
    notes: `## Summary
Feeling stretched thin. We talked about delegating Sunday setup so she can focus on leading worship, not logistics.

## Decisions
- Elena will take Sunday setup starting next month
- Sarah keeps final call on song selection

## Commitments
- Phil: Affirm Elena publicly when she takes setup
- Sarah: Draft a simple setup checklist by next 1:1

## Personal notes
Energy was lower than usual — mom's health is weighing on her. Lead with care before tasks.

## Follow-ups for next 1:1
- How is the checklist landing?
- Volunteer pipeline for fall`,
    nextDate: "2026-07-15",
  },
  {
    id: "o-2",
    meetingId: "m-p-marcus",
    date: "2026-06-30",
    notes: "Camp planning on track. Wants to grow in preaching — pair with a preaching cohort this fall.",
    nextDate: "2026-07-14",
  },
  {
    id: "o-3",
    meetingId: "m-p-dave",
    date: "2026-06-10",
    nextDate: "2026-07-10",
  },
  {
    id: "o-staff-1",
    meetingId: "m-staff",
    date: "2026-08-17",
  },
  {
    id: "o-staff-2",
    meetingId: "m-staff",
    date: "2026-08-24",
  },
  {
    id: "o-staff-3",
    meetingId: "m-staff",
    date: "2026-09-07",
  },
  {
    id: "o-staff-4",
    meetingId: "m-staff",
    date: "2026-09-21",
  },
];

export const seedGoals: Goal[] = [
  {
    id: "g-1",
    personId: "p-sarah",
    title: "Recruit and train 2 new worship leaders",
    progress: 40,
    targetDate: "2026-09-01",
  },
  {
    id: "g-2",
    personId: "p-marcus",
    title: "Launch student leadership cohort",
    progress: 65,
    targetDate: "2026-08-15",
  },
  {
    id: "g-3",
    personId: "p-priya",
    title: "Ship the reporting rewrite",
    progress: 80,
  },
];

export const seedNotes: Note[] = [
  {
    id: "n-1",
    personId: "p-sarah",
    date: "2026-07-01",
    body: "Mentioned her mom's health situation — check in next week.",
  },
  {
    id: "n-2",
    personId: "p-priya",
    date: "2026-06-28",
    body: "Frustrated that design reviews keep slipping. Wants clearer decision owners.",
  },
];

// --- Team-level records (things I lead at the whole-team level).
export const seedTeamActions: TeamAction[] = [
  {
    id: "ta-1",
    teamId: "team-frontier",
    text: "Set the fall calendar together at next staff meeting",
    done: false,
  },
  {
    id: "ta-2",
    teamId: "team-mens",
    text: "Plan the men's retreat theme and dates",
    done: false,
    dueDate: "2026-08-01",
  },
  {
    id: "ta-3",
    teamId: "team-product",
    text: "Unblock Priya on design-review owners",
    done: false,
    dueDate: "2026-07-25",
  },
];

export const seedTeamGoals: TeamGoal[] = [
  {
    id: "tg-1",
    teamId: "team-frontier",
    title: "Every staff member has a clear owned area by Q4",
    progress: 55,
    targetDate: "2026-10-01",
  },
];

export const seedTeamNotes: TeamNote[] = [
  {
    id: "tn-1",
    teamId: "team-frontier",
    date: "2026-07-06",
    body: "Energy is high after the summer push, but a few are running near burnout — protect margin.",
  },
];

// --- Wins banked against people I report to (leading up), in their currency.
export const seedWins: Win[] = [
  {
    id: "w-1",
    personId: "p-sce",
    date: "2026-07-10",
    text: "Cleared the inspection backlog two weeks early",
    impact: "Queue stayed full and groomed the whole sprint — zero idle days",
  },
  {
    id: "w-2",
    personId: "p-sce",
    date: "2026-07-18",
    text: "Every artifact passed review first-pass this cycle",
    impact: "No rework, nothing bounced back up the chain",
  },
];

/**
 * The prayer log. Deliberately sparse: most people on the tree aren't being
 * carried, which is the honest starting point and the thing the canvas scan is
 * built to show.
 */
export const seedPrayers: PrayerEntry[] = [
  {
    id: "pr-1",
    subjectKind: "person",
    subjectId: "p-sarah",
    date: "2026-04-02",
    kind: "burden",
    text: "That she'd take a real weekend off without earning it first.",
  },
  {
    id: "pr-2",
    subjectKind: "person",
    subjectId: "p-sarah",
    date: "2026-05-18",
    kind: "scripture",
    text: "Matthew 11:28 — Come to me, all who are weary and burdened.",
  },
  {
    id: "pr-3",
    subjectKind: "person",
    subjectId: "p-sarah",
    date: "2026-04-02",
    kind: "burden",
    text: "A second worship leader so the whole thing doesn't rest on her.",
    answeredOn: "2026-07-14",
    answerNote: "Micah stepped up and led two Sundays in July.",
  },
  {
    id: "pr-4",
    subjectKind: "person",
    subjectId: "p-dave",
    date: "2026-01-15",
    kind: "burden",
    text: "Clarity on the move — and that he and Jen would land on it together.",
  },
  {
    id: "pr-5",
    subjectKind: "team",
    subjectId: "team-frontier",
    date: "2026-03-01",
    kind: "burden",
    text: "That the building season wouldn't cost us the staff's unity.",
  },
];
