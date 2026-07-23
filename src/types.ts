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
  photo?: string; // base64 data URL
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

export type Person = {
  id: string;
  teamId: string;
  name: string;
  role?: string;
  photo?: string; // base64 data URL
  relationshipType?: string;
  assessments: Assessments;
  strengths: string[];
  watchOuts: string[];
  howToLead?: string;
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

export type OneOnOne = {
  id: string;
  personId: string;
  date: string;
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

export type Me = { name: string; title?: string; photo?: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };
