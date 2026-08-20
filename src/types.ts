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
  /** My own read on how this team is doing. Undefined = not rated yet. */
  health?: Health;
  /** Set when I'm carrying this team in prayer. Undefined = I'm not. */
  prayer?: Prayer;
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
  /** Set when I'm carrying them in prayer. Leading up is still carrying. */
  prayer?: Prayer;
  photo?: string; // base64 data URL
  /** Operating manual for leading up to them — same shape as up-team people. */
  leadUp?: LeadUpProfile;
};

/**
 * My own read on how a team or a person is doing right now — strongest to
 * weakest. Deliberately a judgment call rather than a computed metric: the
 * value is in recording what I already know so I can scan for it later.
 */
export type HealthLevel =
  | "thriving"
  | "solid"
  | "watch"
  | "strained"
  | "critical";

export type Health = {
  level: HealthLevel;
  /** One line of evidence behind the call — what makes it that. */
  note?: string;
  /** ISO date the call was last made. A read from eight months ago is a guess. */
  ratedOn?: string;
};

/**
 * Prayer — the dimension that isn't a metric.
 *
 * Health is my read on how a team or person is doing; readiness is whether I'm
 * prepared to sit down with them. Prayer is the one thing on a leader's mind
 * that neither touches: **am I carrying this person before God right now.**
 *
 * The presence of this object *is* the answer. Taking someone up is a
 * deliberate act and laying them down is another — there's no level to pick,
 * because there's no scale here worth pretending to.
 */
export type Prayer = {
  /** ISO date I took them up. What "carrying since March" is measured from. */
  since: string;
  /** The one line of what I'm holding for them — the burden in a sentence. */
  focus?: string;
  /** ISO date I last marked a prayer. Silence is the honest signal here. */
  lastPrayedOn?: string;
  /** How many days I've marked. Counts once per day, never twice. */
  times?: number;
};

/** Who a prayer is for. The same three subjects every other record uses. */
export type PrayerSubjectKind = "person" | "team" | "manager";

/**
 * What kind of thing this entry is. Deliberately only two: something I'm
 * asking for, and something I'm praying over them. A third ("a note") would
 * just be the Notes tab wearing a different hat.
 */
export type PrayerEntryKind = "burden" | "scripture";

/**
 * One line in the prayer log for a subject. Written down, not checked off:
 * entries are never "completed", they're **answered** — a transition with a
 * date and (optionally) what happened, which is the whole reason to keep them.
 */
export type PrayerEntry = {
  id: string;
  subjectKind: PrayerSubjectKind;
  subjectId: string;
  /** ISO date it was written down. */
  date: string;
  kind: PrayerEntryKind;
  text: string;
  /** ISO date it was answered. Scripture is never answered — only carried. */
  answeredOn?: string;
  /** What happened. The part worth re-reading a year later. */
  answerNote?: string;
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
  /**
   * Which day of the week this usually lands on (0 = Sun … 6 = Sat, UTC).
   * Rhythm projections snap here instead of echoing whatever day you last logged.
   */
  anchorWeekday?: number;
  /** Defaults to "convene". Participants aren't scored on the agenda. */
  role?: MeetingRole;
  /**
   * Where the notes live, when they live outside LeadWell — a Notion page, a
   * Word doc in OneDrive, a shared Google Doc. Some relationships arrive with
   * a system already, and the tracker both people trust isn't worth breaking.
   *
   * This is an *and*, not an *or*: the rhythm, the topic board and the
   * readiness clock stay here. Only the write-up moves — LeadWell stops
   * claiming to know whether the last one was written up, because it can't
   * see the page. Logging sessions here as well keeps working.
   *
   * Not always a URL: "it's in Word" often means a path or a filename, which
   * is still worth recording. See `src/lib/tracker.ts`.
   */
  trackerUrl?: string;
  /** Override for the service name derived from the link ("Notion", "Word"). */
  trackerName?: string;
  /**
   * Standing shape of each occurrence, set on the meeting — not inferred from
   * who it's with. Topics point at one of these via `slotId`. Empty or omitted
   * means the board is an ungrouped list.
   */
  curriculum?: CurriculumSlot[];
};

/** One named slot in a meeting's standing agenda. */
export type CurriculumSlot = {
  id: string;
  label: string;
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
  /** My own read on how they're doing. Undefined = not rated yet. */
  health?: Health;
  /** Set when I'm carrying them in prayer. Undefined = I'm not. */
  prayer?: Prayer;
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

/**
 * @deprecated Superseded by `Topic`, which is keyed by meeting rather than by
 * a `personId` that was really a subject id. Migration 0012 copies these over.
 * The type and its table stay for one release as a rollback net — nothing
 * reads them.
 */
export type Action = {
  id: string;
  personId: string;
  text: string;
  done: boolean;
  dueDate?: string;
  /** Topic board column. Defaults to backlog (or done when done=true). */
  column?: ActionColumn;
};

/**
 * Something to discuss, on the board of one meeting.
 *
 * ── Why this is keyed by meeting, not by person ───────────────────────────
 * `Action.personId` was really a subject id — managers rode on it too — which
 * left a staff meeting's topics with nowhere to live and teams with no board
 * at all. A topic belongs to the meeting where it gets raised, so the same
 * shape serves a 1:1, a check-in and a staff meeting without a second concept.
 *
 * ── Why `sessionId` and not a column ──────────────────────────────────────
 * "This 1:1" could only ever mean the *next* one, so you could queue but not
 * plan. Pointing a topic at a specific occurrence is what makes scaffolding
 * possible: budget on the 17th, hiring on the 24th. Unslotted topics fall back
 * to `lane`, which is the running list.
 *
 * Not stored, always derived: a topic is *loose* when it's still open and the
 * occurrence it was slotted into has already happened. That one predicate is
 * the whole guard against a subject being assigned to a meeting and quietly
 * never finished.
 */
export type TopicStatus = "open" | "covered" | "dropped";

/** Where a topic sits when it isn't slotted into an occurrence. */
export type TopicLane = "backlog" | "parked";

export type Topic = {
  id: string;
  /** The board this belongs to — a meeting, never a person. */
  meetingId: string;
  text: string;
  detail?: string;
  status: TopicStatus;
  lane: TopicLane;
  /** Slotted into this occurrence. Overrides `lane` while it's set. */
  sessionId?: string;
  /**
   * Which standing agenda slot this belongs to (`CurriculumSlot.id`). Untagged
   * when unset — still on the board, just not filling a skeleton cell.
   */
  slotId?: string;
  /** Times it's been pushed to a later meeting. The honest nag. */
  carried: number;
  dueDate?: string;
  createdOn: string;
  closedOn?: string;
  order: number;
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
  /** Raw mic / pasted transcript for this write-up. */
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
