export type Capacity = { id: string; label: string; color: string };

/**
 * A life area / context a team belongs to — e.g. Day job, Church, Family.
 * Color-coded tag used to filter the org tree into focused views (or All).
 */
export type Domain = { id: string; name: string; color: string };

export type Team = {
  id: string;
  name: string;
  capacityId: string;
  /** "This team has no standing meeting I run." A decision, not a gap. */
  noMeeting?: boolean;
  /** Which life area this team belongs to (Day job, Church, Family…). */
  domainId?: string;
  description?: string;
  /** Mandate — what I'm responsible to lead this team toward. */
  purpose?: string;
  /** How often this team meets, free text, e.g. "Weekly", "Every other Tue". */
  cadence?: string;
  /** ISO date (YYYY-MM-DD) I last met with the team as a whole. */
  lastMet?: string;
  order: number;
  /** "up" = a team/person I report to; renders above me in the tree. Default "down". */
  direction?: "up" | "down";
  /**
   * Optional parent team. Sub-teams nest under the parent in the org tree
   * (e.g. Setup & Breakdown under Frontier Ministries). Only for teams I lead.
   */
  parentId?: string;
  /**
   * A direct report who leads this team instead of me. The team hangs under
   * *their* node rather than mine, and its meeting stops counting toward my
   * readiness — it isn't mine to convene. Undefined = I lead it.
   *
   * @see delegatedTeamIds — the same is true of anything nested below it.
   */
  leaderId?: string;
};

/**
 * Someone I report to. Attaches to me and renders directly above my node.
 * Can carry a domain tag so I can see which area's manager it is (my boss at
 * the day job, my overseeing pastor at church, etc.).
 */
export type Manager = {
  id: string;
  name: string;
  role?: string;
  domainId?: string;
  /** "No standing check-in with them." A decision, not a gap. */
  noMeeting?: boolean;
  photo?: string; // base64 data URL
  /** Operating manual for leading up to them — same shape as up-team people. */
  leadUp?: LeadUpProfile;
};

export type StrengthTheme = string;

/** The four CliftonStrengths / Gallup domains a Top-5 theme rolls up into. */
export type StrengthDomain =
  | "Executing"
  | "Influencing"
  | "Relationship Building"
  | "Strategic Thinking";

export type Assessments = {
  cliftonTop5?: StrengthTheme[]; // ordered 1–5
  enneagram?: string; // e.g. "2w3"
  mbti?: string; // e.g. "ENFJ"
};

/**
 * An open / custom assessment modality — Working Genius, DISC, pastoral style,
 * or any named framework that isn't Clifton / Enneagram / MBTI.
 */
export type CustomModality = {
  id: string;
  name: string;
  /** Free-text or shorthand result, e.g. "G+E", "creative + relational". */
  result: string;
  source: "test" | "inferred" | "self-report";
  confidence?: "high" | "medium" | "low";
  notes?: string;
};

/**
 * Leading-up profile: how to succeed with a person I report to.
 * This is NOT their personality (that's Assessments) — it's their operating
 * manual as *my manager*: what they reward, what makes them anxious, and what
 * they're judged on. Only meaningful for people on an "up" team.
 */
export type LeadUpProfile = {
  /** The kind of leader they are — a short archetype read (e.g. "operator / driver"). */
  archetype?: string;
  /** What "good" looks like to them — their definition of a strong report. */
  winsLike?: string;
  /** What makes them anxious / what quietly erodes their trust in me. */
  anxieties?: string;
  /** Their currency — what earns trust and buys credibility fastest. */
  currency?: string;
  /** How they want to hear from me — cadence, channel, detail, when to escalate. */
  comms?: string;
  /** What their own boss measures them on — making this look good is the real job. */
  theirScorecard?: string;
};

/**
 * How often a tracked meeting recurs. The rhythm *projects* the next occurrence
 * from the last one, so prep is measurable without anything being booked.
 * "as_needed" makes no such promise — see `TrackedMeeting.floorDays`.
 */
export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly";
export type MeetingRhythm = Cadence | "as_needed";

/** What a meeting is about. Every subject kind preps the same way. */
export type MeetingSubjectKind = "person" | "team" | "manager";

/** Whether the agenda is mine to set, or I'm just showing up with my piece. */
export type MeetingRole = "convene" | "attend";

/**
 * A meeting I've opted into being ready for — the unit readiness is measured
 * against. Deliberately not a property of a person or a team: the same team can
 * have a standing meeting *and* 1:1s with its members, and those are different
 * things to be ready for.
 *
 * Absence is meaningful. A subject with no TrackedMeeting and no `noMeeting`
 * flag is *undecided*, which is the only thing worth counting at you.
 */
export type TrackedMeeting = {
  id: string;
  subjectKind: MeetingSubjectKind;
  subjectId: string;
  /** Optional label ("Practice meeting"); falls back to the subject's name. */
  name?: string;
  rhythm: MeetingRhythm;
  /**
   * `as_needed` only: the tolerance, not a rhythm. "If it's been 6 weeks,
   * something's wrong." Without it an as-needed meeting never goes overdue —
   * it just sits dormant until something is booked.
   */
  floorDays?: number;
  /** An explicit booking always beats the projected date. */
  nextDate?: string;
  /** Defaults to "convene". Participants aren't scored on the agenda. */
  role?: MeetingRole;
};

export type Person = {
  id: string;
  /**
   * The team they sit on. Undefined = a direct report who isn't part of any
   * team I lead — they hang straight off me, and any teams they lead hang off
   * them (`Team.leaderId`). Not everyone I manage comes with a team attached.
   */
  teamId?: string;
  /**
   * Life area, for a direct report with no team to inherit one from. Ignored
   * for people on a team — that team's domain wins.
   */
  domainId?: string;
  name: string;
  role?: string;
  photo?: string; // base64 data URL
  relationshipType?: string;
  /**
   * "I deliberately don't sit down with them." A decision, not a gap — it
   * clears them out of the undecided count without pretending to track them.
   */
  noMeeting?: boolean;
  assessments: Assessments;
  strengths: string[];
  watchOuts: string[];
  howToLead?: string;
  /** Open modalities beyond Clifton / Enneagram / MBTI. */
  customModalities?: CustomModality[];
  /** Operating manual for a person I report to (up-team members only). */
  leadUp?: LeadUpProfile;
};

/** Kanban column for 1:1 talk-about topics (Actions). */
export type ActionColumn = "backlog" | "this_1on1" | "parking" | "done";

export type Action = {
  id: string;
  personId: string;
  text: string;
  done: boolean;
  dueDate?: string;
  /** Topic board column. Defaults to backlog (or done when done=true). */
  column?: ActionColumn;
};

/** One occurrence of a tracked meeting — what used to be a `OneOnOne`. */
export type Session = {
  id: string;
  meetingId: string;
  date: string;
  /** Why we met *this* time. The antidote to a standing meeting on autopilot. */
  point?: string;
  notes?: string;
  nextDate?: string;
  /** Raw mic / pasted transcript before AI structuring. */
  transcript?: string;
};

export type Goal = {
  id: string;
  personId: string;
  title: string;
  progress: number; // 0–100
  targetDate?: string;
};

export type Note = {
  id: string;
  personId: string;
  date: string;
  body: string;
};

/**
 * A delivered win banked against a person I report to, phrased in *their*
 * currency — recallable evidence to surface at reviews, asks, and comp talks.
 * Leading down I track others' growth; leading up I track my own value.
 */
export type Win = {
  id: string;
  /** The boss (up-team person) this win is banked with. */
  personId: string;
  date: string;
  text: string;
  /** Optional impact framed in their language / metric. */
  impact?: string;
};

// --- Team-level records: the same tools as per-person, scoped to a whole team.
export type TeamAction = {
  id: string;
  teamId: string;
  text: string;
  done: boolean;
  dueDate?: string;
};

export type TeamGoal = {
  id: string;
  teamId: string;
  title: string;
  progress: number; // 0–100
  targetDate?: string;
};

export type TeamNote = {
  id: string;
  teamId: string;
  date: string;
  body: string;
};

export type Me = {
  name: string;
  title?: string;
  photo?: string;
  /** Self-assessment — same frameworks as people I lead. */
  assessments: Assessments;
  strengths: string[];
  watchOuts: string[];
  /** How I work best / how others should lead me. */
  howToLead?: string;
  customModalities?: CustomModality[];
};

export type ChatMessage = { role: "user" | "assistant"; content: string };
