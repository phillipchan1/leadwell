import type {
  Capacity,
  Domain,
  Manager,
  Team,
  Person,
  Action,
  TrackedMeeting,
  Session,
  Goal,
  Note,
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
    capacityId: "cap-manager",
    domainId: "dom-church",
    description: "Church staff team",
    purpose: "Build a healthy, unified staff that leads the church well.",
    cadence: "Weekly",
    lastMet: "2026-07-06",
    order: 0,
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
  },
  {
    id: "team-product",
    name: "Product Squad",
    capacityId: "cap-influence",
    domainId: "dom-work",
    description: "Cross-functional squad at work",
    purpose: "Ship the reporting rewrite and keep the squad unblocked.",
    order: 4,
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
    teamId: "team-mens",
    name: "Dave Okafor",
    role: "Small Groups Lead",
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
export const seedMeetings: TrackedMeeting[] = [
  { id: "m-p-sarah", subjectKind: "person", subjectId: "p-sarah", rhythm: "weekly" },
  { id: "m-p-marcus", subjectKind: "person", subjectId: "p-marcus", rhythm: "biweekly" },
  { id: "m-p-elena", subjectKind: "person", subjectId: "p-elena", rhythm: "monthly" },
  { id: "m-p-dave", subjectKind: "person", subjectId: "p-dave", rhythm: "monthly" },
  { id: "m-p-priya", subjectKind: "person", subjectId: "p-priya", rhythm: "weekly" },
  { id: "m-p-alex", subjectKind: "person", subjectId: "p-alex", rhythm: "biweekly" },
  // The staff meeting itself — a gathering, not a relationship.
  {
    id: "m-staff",
    subjectKind: "team",
    subjectId: "team-frontier",
    name: "Staff meeting",
    rhythm: "weekly",
    role: "convene",
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
  },
  // A practice I run for peers — I convene it, nobody reports to me.
  {
    id: "m-practice",
    subjectKind: "team",
    subjectId: "team-product",
    name: "Practice meeting",
    rhythm: "biweekly",
    role: "convene",
  },
];

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
