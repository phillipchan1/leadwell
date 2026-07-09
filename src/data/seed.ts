import type {
  Capacity,
  Team,
  Person,
  Action,
  OneOnOne,
  Goal,
  Note,
  Me,
} from "../types";

export const seedMe: Me = { name: "Phil Chan", title: "Leader" };

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
    description: "Church staff team",
    order: 0,
  },
  {
    id: "team-mens",
    name: "Men's Core Team",
    capacityId: "cap-leader",
    description: "Volunteer ministry team",
    order: 1,
  },
  {
    id: "team-product",
    name: "Product Squad",
    capacityId: "cap-influence",
    description: "Cross-functional squad at work",
    order: 2,
  },
  {
    id: "team-leaders",
    name: "My Leaders",
    capacityId: "cap-up",
    description: "Who I report to",
    order: 3,
    direction: "up",
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
  },
];

export const seedActions: Action[] = [
  {
    id: "a-1",
    personId: "p-sarah",
    text: "Ask about volunteer pipeline for fall",
    done: false,
  },
  {
    id: "a-2",
    personId: "p-sarah",
    text: "Follow up on song-selection conflict",
    done: true,
  },
  {
    id: "a-3",
    personId: "p-marcus",
    text: "Review summer camp budget together",
    done: false,
    dueDate: "2026-07-15",
  },
  {
    id: "a-4",
    personId: "p-priya",
    text: "Share Q3 roadmap draft before planning meeting",
    done: false,
  },
];

export const seedOneOnOnes: OneOnOne[] = [
  {
    id: "o-1",
    personId: "p-sarah",
    date: "2026-06-24",
    notes: "Feeling stretched; talked about delegating Sunday setup.",
    nextDate: "2026-07-15",
  },
  {
    id: "o-2",
    personId: "p-marcus",
    date: "2026-06-30",
    notes: "Camp planning on track. Wants to grow in preaching.",
    nextDate: "2026-07-14",
  },
  {
    id: "o-3",
    personId: "p-dave",
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
